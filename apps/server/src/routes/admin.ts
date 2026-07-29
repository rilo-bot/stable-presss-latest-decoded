import { Router } from 'express';
import { db } from '../lib/db.js';
import { withIdentityDefaults, newReaderFields } from '../lib/identity.js';
import { SUPERADMIN_SLUG } from '../lib/roleRegistry.js';
import { seedRoles } from '../lib/seedRoles.js';

const router = Router();

/**
 * Bootstrap the SUPERADMIN. Guarded by SETUP_SECRET (disabled if unset).
 * Idempotent: promotes an existing user or creates a new account.
 *
 * This is the only way the first superadmin can exist — every other role grant
 * requires an already-authenticated account holding `roles.manage`. Superadmin
 * short-circuits `accountCan` before any registry lookup, so an account seeded
 * here keeps full access even if the `roles` collection is empty or corrupt.
 *
 * Multiple superadmins are supported: this just ensures the slug is present in
 * the target user's staffRoles[].
 *
 *   POST /api/admin/seed  { secret, email, displayName? }
 */
router.post('/seed', async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    res.status(403).json({ error: 'Admin seeding is disabled (SETUP_SECRET not set).' });
    return;
  }
  if (req.body?.secret !== secret) {
    res.status(403).json({ error: 'Invalid setup secret.' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' });
    return;
  }
  const displayName =
    typeof req.body?.displayName === 'string' && req.body.displayName.trim()
      ? req.body.displayName.trim()
      : email.split('@')[0];

  // Make sure the superadmin role row exists before anyone is given the slug,
  // so the Roles screen can render it immediately after seeding.
  await seedRoles();

  const existing = (await db.collection('users').find({ email }))[0];
  if (existing) {
    const acct = withIdentityDefaults({ id: existing._id, ...existing });
    if (!acct.staffRoles.includes(SUPERADMIN_SLUG)) {
      await db.collection('users').addToSet(String(existing._id), 'staffRoles', SUPERADMIN_SLUG);
    }
    const fresh = await db.collection('users').findById(existing._id);
    res.json({ user: withIdentityDefaults({ id: fresh!._id, ...fresh }), created: false });
    return;
  }

  const id = await db.collection('users').insertOne({
    email,
    displayName,
    createdAt: new Date().toISOString(),
    ...newReaderFields(),
    staffRoles: [SUPERADMIN_SLUG],
  });
  const doc = await db.collection('users').findById(id);
  res.status(201).json({ user: withIdentityDefaults({ id: doc!._id, ...doc }), created: true });
});

export default router;
