// Sign in. TWO ENDPOINTS, no branching:
//
//   POST /api/auth/start   { email, name? }  → email a one-time code
//   POST /api/auth/verify  { email, code }   → consume it, return a session
//   GET  /api/auth/me                        → the live account for a token
//
// THERE IS NO LOGIN/SIGNUP DISTINCTION. It used to take `mode: 'login' |
// 'signup'` from the client and store a `purpose` on the OTP row, then branch at
// both ends: `login` 404'd an unknown address, `signup` 409'd a known one. Two
// modes × two endpoints was four paths through what is one question — does the
// person hold this mailbox? — and the answer is the same either way.
//
// Whether an account exists is now decided ONCE, at verify time, by
// findOrCreateUser. Two consequences worth knowing:
//   - `name` is optional. Sent by the signup screen, omitted by the sign-in
//     screen, and an account created without one gets a name derived from the
//     address (renameable in profile).
//   - This endpoint no longer says whether an address is registered. That oracle
//     ("No account found with that email address.") was a free account-existence
//     probe on an unauthenticated route.
//
// SIGNING IN NEVER GRANTS A ROLE. A pending-invite lookup used to run right here
// and apply a role at first sign-in — an implicit privilege change on the one
// path that must stay boring. It also skipped the superadmin guard that the
// invite route applies to the very same operation. Roles arrive from an admin
// action or from redeeming an invite link, and from nowhere else.

import { Router } from 'express';
import { db } from '../../lib/db.js';
import { genOtp, hashOtp, attachAccount } from '../../lib/auth.js';
import { sendOtpEmail, isEmailConfigured } from '../../lib/email.js';
import { toClientUser } from '../../lib/effectiveAccess.js';
import { findOrCreateUser, issueSession, markSignedIn, revokeAllSessions } from '../../lib/session.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { OTPS } from '../../lib/collections.js';

const OTP_TTL_MS = (Number(process.env.OTP_TTL_MINUTES) || 10) * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const IS_PROD = process.env.PROD === 'true';

// Dev sign-in bypass. When DEV_OTP_CODE is set, every OTP request uses this
// fixed code, no email is sent, and the code is echoed back so you can sign in
// without an inbox. Deliberately decoupled from PROD — local dev now runs
// PROD=true (for the real database) yet still needs a friction-free login.
// ⚠ This is a FULL auth bypass: NEVER set DEV_OTP_CODE in a deployed environment.
const DEV_OTP_CODE = (process.env.DEV_OTP_CODE ?? '').trim();
if (DEV_OTP_CODE) {
  console.warn(`[auth] ⚠ DEV_OTP_CODE is set — sign-in bypass active (fixed code "${DEV_OTP_CODE}", no email). Never use this in production.`);
}

const router = Router();

// Both of these are unauthenticated and both are expensive: `start` sends real
// email to an arbitrary address, `verify` is the brute-force surface. Keyed by
// IP (there is no account yet), which requires `trust proxy` in index.ts —
// without it every anonymous caller shares the load balancer's address and these
// become one global bucket. `rateLimit` ignores GET, so /me is unaffected.
//
// Separate buckets, because one shared allowance would let a normal sign-in
// exhaust itself: request a code, mistype twice, resend, verify.
// 8, not 5: a household or office shares one public address, and a real sign-in
// can legitimately spend three or four (request, no email yet, resend, resend)
// before anyone has done anything wrong. Still caps a single host at 32 mails an
// hour, which is what this is actually for.
const startLimit = rateLimit('auth-start', 8, 15 * 60_000);
const verifyLimit = rateLimit('auth-verify', 15, 15 * 60_000);

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Newest-first OTP record for an email, or null. */
async function latestOtp(email: string) {
  const rows = await db.collection(OTPS).find({ email });
  if (rows.length === 0) return null;
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]!;
}

async function clearOtps(email: string): Promise<void> {
  const rows = await db.collection(OTPS).find({ email });
  await Promise.all(rows.map((r) => db.collection(OTPS).deleteOne(r._id)));
}

async function storeOtp(email: string, code: string, name: string): Promise<void> {
  await clearOtps(email);
  const now = new Date();
  await db.collection(OTPS).insertOne({
    email,
    codeHash: hashOtp(code),
    // Carried through to account creation at verify time. Ignored entirely when
    // the address turns out to already have an account.
    name: name || undefined,
    attempts: 0,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
  });
}

// ── Step 1: ask for a code ───────────────────────────────────────────────────
router.post(['/start', '/request-otp'], startLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';

  // NO account lookup here. See the header — that is what made this two flows.

  // Dev bypass: fixed code, no email, no cooldown. Gated solely on DEV_OTP_CODE.
  if (DEV_OTP_CODE) {
    await storeOtp(email, DEV_OTP_CODE, name);
    res.json({ ok: true, devCode: DEV_OTP_CODE });
    return;
  }

  // Resend cooldown — reject if a code was issued very recently.
  const prior = await latestOtp(email);
  if (prior && Date.now() - new Date(String(prior.createdAt)).getTime() < RESEND_COOLDOWN_MS) {
    res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
    return;
  }

  // Fail CLOSED: never fall back to the fixed dev code when email is unconfigured.
  if (IS_PROD && !isEmailConfigured()) {
    console.error('[auth] start refused: PROD=true but email is not configured (need RESEND_API_KEY + RESEND_FROM_EMAIL, or SMTP_HOST + SMTP_FROM).');
    res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again later.' });
    return;
  }

  // Outside production only (guarded above): a fixed code, so no inbox is needed.
  const code = isEmailConfigured() ? genOtp() : '123456';
  await storeOtp(email, code, name);

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('[auth] failed to send OTP email:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Could not send the verification email. Please try again.' });
    return;
  }

  // Never in prod. Belt-and-braces on top of the guard above.
  const body: { ok: true; devCode?: string } = { ok: true };
  if (!isEmailConfigured() && !IS_PROD) body.devCode = code;
  res.json(body);
});

// ── Step 2: spend the code → a session ───────────────────────────────────────
router.post(['/verify', '/verify-otp'], verifyLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!email || !code) {
    res.status(400).json({ error: 'Email and code are required.' });
    return;
  }

  const otp = await latestOtp(email);
  if (!otp) {
    res.status(400).json({ error: 'No pending verification. Please request a new code.' });
    return;
  }
  if (Date.now() > new Date(String(otp.expiresAt)).getTime()) {
    await clearOtps(email);
    res.status(400).json({ error: 'Your code has expired. Please request a new one.' });
    return;
  }
  if ((otp.attempts ?? 0) >= MAX_ATTEMPTS) {
    await clearOtps(email);
    res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    return;
  }
  if (otp.codeHash !== hashOtp(code)) {
    await db.collection(OTPS).updateOne(otp._id, { attempts: (otp.attempts ?? 0) + 1 });
    res.status(400).json({ error: 'Incorrect code. Please check and try again.' });
    return;
  }

  // Valid — consume it before anything else, so a code is spendable exactly once.
  await clearOtps(email);

  // The whole of "is this a signup or a sign-in?", in one call. A new account is
  // created holding no role at all.
  const { user } = await findOrCreateUser(email, typeof otp.name === 'string' ? otp.name : undefined);
  res.json(await issueSession(await markSignedIn(user)));
});

// ── Session check — validate a persisted token, return the live account ───────
router.get('/me', attachAccount, (req, res) => {
  res.json({ user: toClientUser(req.account!) });
});

/**
 * Sign out everywhere — the ONLY way to revoke an already-issued token.
 *
 * The caller's CURRENT token dies with the rest, so the client must clear its
 * session after this: the very next request with it answers 401. That is the
 * point, and it is what makes "someone has my laptop" recoverable without
 * deleting the account.
 */
router.post('/sign-out-everywhere', attachAccount, async (req, res) => {
  const version = await revokeAllSessions(req.account!.id);
  console.warn(`[auth] all sessions revoked for ${req.account!.email} (tokenVersion → ${version})`);
  res.json({ ok: true });
});

export default router;
