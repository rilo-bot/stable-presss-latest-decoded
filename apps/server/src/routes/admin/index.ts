import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../../lib/db.js';
import { withIdentityDefaults, newUserFields } from '../../lib/identity.js';
import { USERS } from '../../lib/collections.js';
import { SUPERADMIN_ROLE_NAME, getRole } from '../../lib/roleRegistry.js';
import { adminRecordFor, grantAdminRole, superadminCount } from '../../lib/admins.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { seedRoles } from '../../lib/seedRoles.js';

const router = Router();

/**
 * Compare a submitted secret without leaking it through timing.
 *
 * Both sides are SHA-256'd to a fixed 32 bytes first. That is not for secrecy —
 * it is so `timingSafeEqual` gets two equal-length buffers (it throws otherwise)
 * without the guard itself branching on length, which would leak how long the
 * real secret is.
 */
export function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || given.length === 0) return false;
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// Minting a superadmin was the ONLY unthrottled write in the product — magazine
const seedLimit = rateLimit('admin-seed', 5, 15 * 60_000);

/**
 * Bootstrap the FIRST superadmin. Guarded by SETUP_SECRET (disabled if unset)
 * AND self-disabling once a superadmin exists.
 *
 * This is the only way the first superadmin can exist — every other role grant
 * requires an already-authenticated account holding `roles.manage`. Superadmin
 * short-circuits `accountCan` before any registry lookup, so an account seeded
 * here keeps full access even if `adminRoles` is empty or corrupt.
 *
 * WHY IT SELF-DISABLES. While SETUP_SECRET is set this route is an unauthenticated
 * path to unrestricted platform access, and the previous advice — "unset the env
 * var once you've seeded" — made that a standing backdoor if anyone forgot. Now it
 * refuses the moment `superadminCount()` is non-zero, so it closes itself
 * the instant it has done its job. The count is one indexed query (P2), which is
 * what makes checking it on every attempt free.
 *
 * RECOVERY, if you are locked out: `npx tsx scripts/grant-superadmin.ts <email>`.
 * That deliberately requires MONGODB_URI — i.e. infrastructure access — rather
 * than being reachable over HTTP. Re-opening this endpoint would recreate exactly
 * the backdoor it just closed.
 *
 * The admin role is ONE per user, so seeding REPLACES whatever role the target
 * held. Multiple superadmin *accounts* are still supported — each is its own
 * `admins` row pointing at the superadmin role — but this route only ever creates
 * the first one.
 *
 *   POST /api/admin/seed  { secret, email, name? }
 */
router.post('/seed', seedLimit, async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    res.status(403).json({ error: 'Admin seeding is disabled (SETUP_SECRET not set).' });
    return;
  }
  if (!secretMatches(req.body?.secret, secret)) {
    res.status(403).json({ error: 'Invalid setup secret.' });
    return;
  }

  // Checked AFTER the secret so an anonymous caller cannot use this endpoint to
  // discover whether the platform has been set up yet.
  const holders = await superadminCount();
  if (holders > 0) {
    res.status(409).json({
      error:
        'A superadmin already exists, so this bootstrap endpoint is closed. Grant further ' +
        'roles from Roles & Permissions, or run scripts/grant-superadmin.ts if you are locked out.',
    });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' });
    return;
  }
  const name =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : email.split('@')[0];

  // Make sure the superadmin role row exists before anyone is pointed at it, so
  // the Roles screen can render it immediately after seeding.
  await seedRoles();
  const superRole = await getRole(SUPERADMIN_ROLE_NAME);
  if (!superRole) {
    res.status(500).json({ error: 'The superadmin role could not be seeded. Check the server logs.' });
    return;
  }

  const now = new Date().toISOString();
  const existing = (await db.collection(USERS).find({ email }))[0];

  if (existing) {
    const previousRole = (await adminRecordFor(String(existing._id))).role;

    // A suspended account is refused by isRevoked() on every request, so promoting
    // one without clearing the flag would mint a superadmin who cannot sign in.
    const wasSuspended = existing.status === 'suspended';
    if (wasSuspended) await db.collection(USERS).updateOne(String(existing._id), { status: 'active', updatedAt: now });

    // Through the single writer, so the `admins` row and `users.isAdmin` cannot
    // half-apply — see lib/admins.ts.
    await grantAdminRole(String(existing._id), superRole.id);
    const fresh = await db.collection(USERS).findById(existing._id);

    // The only audit trail available: by definition there is no other superadmin to
    // notify, and no acting account to attribute it to. A loud server-log line is
    // what makes the grant visible after the fact.
    console.warn(
      `[admin] SUPERADMIN GRANTED to existing user ${email} (id ${String(existing._id)}) ` +
        `from ${req.ip ?? 'unknown ip'} at ${now}` +
        (previousRole ? ` — replaced admin role "${previousRole.name}"` : '') +
        (wasSuspended ? ' — account was SUSPENDED and has been reactivated' : ''),
    );

    res.json({
      user: withIdentityDefaults({ id: fresh!._id, ...fresh }),
      created: false,
      replacedRole: previousRole?.name ?? null,
      reactivated: wasSuspended,
    });
    return;
  }

  const id = await db.collection(USERS).insertOne({
    email,
    name,
    createdAt: now,
    updatedAt: now,
    ...newUserFields(),
  });
  // `isAdmin` is flipped by the grant, not by the insert — one writer, always.
  await grantAdminRole(String(id), superRole.id);
  const doc = await db.collection(USERS).findById(id);
  console.warn(
    `[admin] SUPERADMIN GRANTED to NEW account ${email} (id ${String(id)}) ` +
      `from ${req.ip ?? 'unknown ip'} at ${now}`,
  );
  res.status(201).json({ user: withIdentityDefaults({ id: doc!._id, ...doc }), created: true });
});

export default router;
