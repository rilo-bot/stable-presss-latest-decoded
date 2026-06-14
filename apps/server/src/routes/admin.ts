import { Router } from 'express';
import { db } from '../lib/db.js';
import { withIdentityDefaults, newReaderFields } from '../lib/identity.js';

const router = Router();

/**
 * Bootstrap an administrator. Guarded by SETUP_SECRET (disabled if unset).
 * Idempotent: promotes an existing user or creates a new admin account.
 *
 * Multiple admins are supported — this just ensures `administrator` is present in
 * the target user's roles[]. Adding further admins from the portal is the Phase E
 * staff-grant flow (admin-authenticated, not secret-gated). See RBAC.md §4.4.
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

  const existing = (await db.collection('users').find({ email }))[0];
  if (existing) {
    const acct = withIdentityDefaults({ id: existing._id, ...existing });
    const roles = acct.roles.includes('administrator')
      ? acct.roles
      : [...acct.roles, 'administrator'];
    await db.collection('users').updateOne(existing._id, { roles });
    const fresh = await db.collection('users').findById(existing._id);
    res.json({ user: withIdentityDefaults({ id: fresh!._id, ...fresh }), created: false });
    return;
  }

  const id = await db.collection('users').insertOne({
    email,
    displayName,
    createdAt: new Date().toISOString(),
    ...newReaderFields(),
    roles: ['reader', 'administrator'],
  });
  const doc = await db.collection('users').findById(id);
  res.status(201).json({ user: withIdentityDefaults({ id: doc!._id, ...doc }), created: true });
});

export default router;
