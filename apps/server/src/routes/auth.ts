import { Router } from 'express';
import { db } from '../lib/db.js';
import { genOtp, hashOtp, signToken, attachAccount } from '../lib/auth.js';
import { sendOtpEmail, isEmailConfigured } from '../lib/email.js';
import { withIdentityDefaults, newReaderFields } from '../lib/identity.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

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

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Newest-first OTP record for an email, or null. */
async function latestOtp(email: string) {
  const rows = await db.collection('otps').find({ email });
  if (rows.length === 0) return null;
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]!;
}

async function clearOtps(email: string): Promise<void> {
  const rows = await db.collection('otps').find({ email });
  await Promise.all(rows.map((r) => db.collection('otps').deleteOne(r._id)));
}

// ── Step 1: request a code ───────────────────────────────────────────────────
router.post('/request-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const mode = req.body?.mode === 'signup' ? 'signup' : 'login';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const existingUsers = await db.collection('users').find({ email });
  const user = existingUsers[0] ?? null;

  // Every new account starts as a plain reader. Roles (party / staff) and
  // subscription tier are layered on AFTER signup — never self-selected here.
  let pendingUser: { email: string; displayName: string } | undefined;
  if (mode === 'login') {
    if (!user) {
      res.status(404).json({ error: 'No account found with that email address.' });
      return;
    }
  } else {
    if (user) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    if (!displayName) {
      res.status(400).json({ error: 'Please enter your name.' });
      return;
    }
    pendingUser = { email, displayName };
  }

  // Dev bypass (see DEV_OTP_CODE above): fixed code, no email, no cooldown, and
  // the code returned in the response. Gated solely on DEV_OTP_CODE so it is
  // impossible to trigger unless an operator explicitly opted in.
  if (DEV_OTP_CODE) {
    await clearOtps(email);
    const now = new Date();
    await db.collection('otps').insertOne({
      email,
      codeHash: hashOtp(DEV_OTP_CODE),
      purpose: mode,
      pendingUser,
      attempts: 0,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
    });
    res.json({ ok: true, devCode: DEV_OTP_CODE });
    return;
  }

  // Resend cooldown — reject if a code was issued very recently.
  const prior = await latestOtp(email);
  if (prior && Date.now() - new Date(String(prior.createdAt)).getTime() < RESEND_COOLDOWN_MS) {
    res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
    return;
  }

  // Fail CLOSED in production: never fall back to the fixed dev code / console
  // delivery when email isn't configured — that would let anyone sign in as any
  // account with a known code. Refuse instead of silently degrading.
  if (IS_PROD && !isEmailConfigured()) {
    console.error('[auth] request-otp refused: PROD=true but email is not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL).');
    res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again later.' });
    return;
  }

  await clearOtps(email);

  // Dev env (no SendGrid configured): skip emailing and use a fixed, predictable
  // code so you can sign in without checking an inbox. Real envs get a random one.
  // The fixed code can ONLY ever be issued outside production (guarded above).
  const code = isEmailConfigured() ? genOtp() : '123456';
  const now = new Date();
  await db.collection('otps').insertOne({
    email,
    codeHash: hashOtp(code),
    purpose: mode,
    pendingUser,
    attempts: 0,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
  });

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('[auth] failed to send OTP email:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Could not send the verification email. Please try again.' });
    return;
  }

  // Only expose the code to the client in dev (email not sent). Never in prod —
  // combined with the guard above, prod always has email configured, so this is
  // belt-and-suspenders against the code ever appearing in a production response.
  const body: { ok: true; devCode?: string } = { ok: true };
  if (!isEmailConfigured() && !IS_PROD) body.devCode = code;
  res.json(body);
});

// ── Step 2: verify the code → issue a JWT ────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
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
    await db.collection('otps').updateOne(otp._id, { attempts: (otp.attempts ?? 0) + 1 });
    res.status(400).json({ error: 'Incorrect code. Please check and try again.' });
    return;
  }

  // Valid — consume the OTP.
  await clearOtps(email);

  let userDoc;
  if (otp.purpose === 'signup') {
    const pending = otp.pendingUser as { email: string; displayName: string } | undefined;
    if (!pending) {
      res.status(400).json({ error: 'Signup details missing. Please start again.' });
      return;
    }
    // Guard against a race where the account was created since request-otp.
    const dupes = await db.collection('users').find({ email });
    if (dupes[0]) {
      userDoc = dupes[0];
    } else {
      const id = await db.collection('users').insertOne({
        email: pending.email,
        displayName: pending.displayName,
        createdAt: new Date().toISOString(),
        ...newReaderFields(),
      });
      userDoc = await db.collection('users').findById(id);
    }
  } else {
    const rows = await db.collection('users').find({ email });
    userDoc = rows[0] ?? null;
  }

  if (!userDoc) {
    res.status(404).json({ error: 'Account not found. Please sign up first.' });
    return;
  }

  // Apply any staff roles an administrator pre-granted to this email (first sign-in).
  let finalDoc = userDoc;
  const grants = await db.collection('pendingStaffGrants').find({ email });
  if (grants.length > 0) {
    const current = withIdentityDefaults(project(finalDoc)).roles;
    const merged: string[] = [...current];
    for (const g of grants) {
      if (typeof g.role === 'string' && !merged.includes(g.role)) merged.push(g.role);
    }
    await db.collection('users').updateOne(finalDoc._id, { roles: merged });
    await Promise.all(grants.map((g) => db.collection('pendingStaffGrants').deleteOne(g._id)));
    const refreshed = await db.collection('users').findById(finalDoc._id);
    if (refreshed) finalDoc = refreshed;
  }

  // Normalize (fills identity defaults for legacy docs too) before issuing the token.
  const account = withIdentityDefaults(project(finalDoc));
  const token = signToken({ sub: account.id, email: account.email, role: String(account.role) });
  res.json({ token, user: account });
});

// ── Session check — validate a persisted token, return the live account ───────
router.get('/me', attachAccount, async (req, res) => {
  res.json({ user: req.account });
});

export default router;
