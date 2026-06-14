import { Router } from 'express';
import { db } from '../lib/db.js';
import { attachAccount } from '../lib/auth.js';
import { withIdentityDefaults, STAFF_ROLES, type StaffRole } from '../lib/identity.js';
import { isAdmin } from '../lib/rbac.js';

const router = Router();

// All staff-management routes require an administrator.
router.use(attachAccount);
router.use((req, res, next) => {
  if (!isAdmin(req.account)) {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
});

// ── List current staff + any pending (pre-granted) staff invites ──────────────
router.get('/', async (_req, res) => {
  const users = await db.collection('users').find();
  const staff = users
    .map((u) => withIdentityDefaults({ id: u._id, ...u }))
    .filter((u) => u.roles.some((r) => (STAFF_ROLES as string[]).includes(r)))
    .map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      staffRoles: u.roles.filter((r) => (STAFF_ROLES as string[]).includes(r)),
    }));
  const pending = (await db.collection('pendingStaffGrants').find()).map((g) => ({
    email: g.email,
    role: g.role,
  }));
  res.json({ staff, pending });
});

// ── Grant a staff role to a user by email (administrator included) ────────────
// Existing account → role merged immediately. No account yet → staged as a
// pending grant, applied automatically the first time they sign in.
router.post('/', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const role = req.body?.role as StaffRole;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' });
    return;
  }
  if (!(STAFF_ROLES as string[]).includes(role)) {
    res.status(400).json({ error: 'A valid staff role is required.' });
    return;
  }

  const existing = (await db.collection('users').find({ email }))[0];
  if (existing) {
    const acct = withIdentityDefaults({ id: existing._id, ...existing });
    if (acct.roles.includes(role)) {
      res.status(409).json({ error: 'That person already holds this role.' });
      return;
    }
    await db.collection('users').updateOne(existing._id, { roles: [...acct.roles, role] });
    res.status(200).json({ ok: true, applied: 'immediate' });
    return;
  }

  // Stage a pending grant (dedup on email+role).
  const dupes = await db.collection('pendingStaffGrants').find({ email });
  if (dupes.some((g) => g.role === role)) {
    res.status(409).json({ error: 'A pending invite for this role already exists.' });
    return;
  }
  await db.collection('pendingStaffGrants').insertOne({ email, role, createdAt: new Date().toISOString() });
  res.status(201).json({ ok: true, applied: 'pending' });
});

// ── Revoke a staff role (with last-administrator safety) ──────────────────────
router.delete('/:userId/roles/:role', async (req, res) => {
  const { userId, role } = req.params;
  const target = await db.collection('users').findById(userId);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const acct = withIdentityDefaults({ id: target._id, ...target });
  if (!acct.roles.includes(role as StaffRole)) {
    res.status(404).json({ error: 'That user does not hold this role.' });
    return;
  }

  if (role === 'administrator') {
    const users = await db.collection('users').find();
    const admins = users
      .map((u) => withIdentityDefaults({ id: u._id, ...u }))
      .filter((u) => u.roles.includes('administrator'));
    if (admins.length <= 1) {
      res.status(403).json({ error: 'Cannot remove the last administrator.' });
      return;
    }
  }

  await db.collection('users').updateOne(userId, {
    roles: acct.roles.filter((r) => r !== role),
  });
  res.json({ ok: true });
});

export default router;
