import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../../lib/db.js';
import { withIdentityDefaults } from '../../lib/identity.js';
import { USERS } from '../../lib/collections.js';
import { findOrCreateUser, findUserByEmail } from '../../lib/session.js';
import { SUPERADMIN_ROLE_NAME, assignRole, getRole, roleOfUser, superadminCount } from '../../lib/roleRegistry.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { seedRoles } from '../../lib/seedRoles.js';

const router = Router();

/** Constant-time compare. Both sides are hashed so the lengths always match. */
export function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || given.length === 0) return false;
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

const seedLimit = rateLimit('admin-seed', 5, 15 * 60_000);

/**
 * POST /api/admin/seed { secret, email, name? } - bootstrap the FIRST superadmin.
 *
 * SELF-DISABLING: while SETUP_SECRET is set this is an unauthenticated path to
 * unrestricted access, so it refuses the moment a superadmin exists rather than
 * relying on someone remembering to unset the env var.
 *
 * Locked out? `npx tsx scripts/grant-superadmin.ts <email>` - which needs
 * infrastructure access rather than being reachable over HTTP.
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

  // AFTER the secret, so this cannot be used to probe whether setup has happened.
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

  // Seed the role rows before pointing anyone at one.
  await seedRoles();
  const superRole = await getRole(SUPERADMIN_ROLE_NAME);
  if (!superRole) {
    res.status(500).json({ error: 'The superadmin role could not be seeded. Check the server logs.' });
    return;
  }

  const now = new Date().toISOString();
  const existing = await findUserByEmail(email);

  if (existing) {
    const previousRole = await roleOfUser(existing);

    await assignRole(String(existing._id), superRole.id);
    const fresh = await db.collection(USERS).findById(existing._id);

    // The only audit trail there can be: no other superadmin exists to notify.
    console.warn(
      `[admin] SUPERADMIN GRANTED to existing user ${email} (id ${String(existing._id)}) ` +
        `from ${req.ip ?? 'unknown ip'} at ${now}` +
        (previousRole ? ` — replaced admin role "${previousRole.name}"` : ''),
    );

    res.json({
      user: withIdentityDefaults({ id: fresh!._id, ...fresh }),
      created: false,
      replacedRole: previousRole?.name ?? null,
    });
    return;
  }

  const { user: fresh } = await findOrCreateUser(email, name);
  const id = String(fresh._id);
  await assignRole(id, superRole.id);
  const doc = await db.collection(USERS).findById(id);
  console.warn(
    `[admin] SUPERADMIN GRANTED to NEW account ${email} (id ${String(id)}) ` +
      `from ${req.ip ?? 'unknown ip'} at ${now}`,
  );
  res.status(201).json({ user: withIdentityDefaults({ id: doc!._id, ...doc }), created: true });
});

export default router;
