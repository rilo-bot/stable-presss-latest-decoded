import { Router } from 'express';
import { db } from '../lib/db.js';
import { genOtp, hashOtp, signToken, requireAuth } from '../lib/auth.js';
import { sendOtpEmail, isEmailConfigured } from '../lib/email.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

// Must mirror UserRole in apps/web/src/stores/authStore.ts
const VALID_ROLES = [
  'contributor',
  'editor',
  'legal_reviewer',
  'podcast_producer',
  'publisher',
  'administrator',
] as const;

const OTP_TTL_MS = (Number(process.env.OTP_TTL_MINUTES) || 10) * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

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

  let pendingUser: { email: string; displayName: string; role: string } | undefined;
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
    const role = typeof req.body?.role === 'string' ? req.body.role : '';
    if (!displayName) {
      res.status(400).json({ error: 'Please enter your name.' });
      return;
    }
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      res.status(400).json({ error: 'Please select a valid newsroom role.' });
      return;
    }
    pendingUser = { email, displayName, role };
  }

  // Resend cooldown — reject if a code was issued very recently.
  const prior = await latestOtp(email);
  if (prior && Date.now() - new Date(String(prior.createdAt)).getTime() < RESEND_COOLDOWN_MS) {
    res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
    return;
  }

  await clearOtps(email);

  const code = genOtp();
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

  // Only leak the code to the client when email isn't actually being sent (dev).
  const body: { ok: true; devCode?: string } = { ok: true };
  if (!isEmailConfigured()) body.devCode = code;
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
    const pending = otp.pendingUser as { email: string; displayName: string; role: string } | undefined;
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
        role: pending.role,
        createdAt: new Date().toISOString(),
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

  const user = project(userDoc);
  const token = signToken({ sub: user.id, email: String(user.email), role: String(user.role) });
  res.json({ token, user });
});

// ── Session check — validate a persisted token ───────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const userDoc = await db.collection('users').findById(req.user!.sub);
  if (!userDoc) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  res.json({ user: project(userDoc) });
});

export default router;
