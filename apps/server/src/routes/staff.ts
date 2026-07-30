// ---------------------------------------------------------------------------
// Team roster + pending invites.
//
// Role GRANT/REVOKE now lives in routes/roles.ts (`POST /api/roles/:slug/assign`)
// because roles are DB rows, not a fixed enum. What remains here is the roster
// itself and the invite-by-email flow for people who have no account yet.
//
// A pending invite stores a role SLUG. It is validated against the live registry
// at both ends — when staged, and again when applied at first sign-in — so an
// invite for a role that was deleted in between is dropped rather than silently
// granting nothing.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../lib/db.js'
import { attachAccount } from '../lib/auth.js'
import { withIdentityDefaults } from '../lib/identity.js'
import { canManageTeam } from '../lib/rbac.js'
import { SUPERADMIN_SLUG, getRoles } from '../lib/roleRegistry.js'

const router = Router()

router.use(attachAccount)
// The roster is `team.manage`, not `roles.manage` — inviting someone is a
// different power from defining what a role may do. See routes/roles.ts.
router.use((req, res, next) => {
  if (!canManageTeam(req.account)) {
    res.status(403).json({ error: 'You do not have permission to manage the team.' })
    return
  }
  next()
})

// ── Roster: everyone holding at least one role, plus pending invites ─────────
router.get('/', async (_req, res) => {
  const users = await db.collection('users').find()
  const staff = users
    .map((u) => withIdentityDefaults({ id: u._id, ...u }))
    .filter((u) => u.staffRoles.length > 0)
    .map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      staffRoles: u.staffRoles,
    }))
    .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email))

  const pending = (await db.collection('pendingStaffGrants').find()).map((g) => ({
    id: String(g._id),
    email: String(g.email),
    role: String(g.role),
  }))

  res.json({ staff, pending })
})

// ── Invite by email: grant now if the account exists, else stage it ──────────
router.post('/', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const slug = typeof req.body?.role === 'string' ? req.body.role : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' })
    return
  }
  const role = (await getRoles()).get(slug)
  if (!role) {
    res.status(400).json({ error: 'That role no longer exists.' })
    return
  }
  if (role.slug === SUPERADMIN_SLUG && !req.account!.isSuperAdmin) {
    res.status(403).json({ error: 'Only a superadmin can grant the superadmin role.' })
    return
  }

  const existing = (await db.collection('users').find({ email }))[0]
  if (existing) {
    const acct = withIdentityDefaults({ id: existing._id, ...existing })
    if (acct.staffRoles.includes(role.slug)) {
      res.status(409).json({ error: 'That person already holds this role.' })
      return
    }
    await db.collection('users').addToSet(String(existing._id), 'staffRoles', role.slug)
    res.status(200).json({ ok: true, applied: 'immediate' })
    return
  }

  const dupes = await db.collection('pendingStaffGrants').find({ email })
  if (dupes.some((g) => g.role === role.slug)) {
    res.status(409).json({ error: 'A pending invite for this role already exists.' })
    return
  }
  await db
    .collection('pendingStaffGrants')
    .insertOne({ email, role: role.slug, createdAt: new Date().toISOString() })
  res.status(201).json({ ok: true, applied: 'pending' })
})

// ── Cancel a pending invite ──────────────────────────────────────────────────
// Previously unreachable: the UI listed pending invites with no way to withdraw
// one, so a mistyped address sat there indefinitely, auto-applying whenever
// someone eventually claimed it.
router.delete('/pending/:id', async (req, res) => {
  const found = await db.collection('pendingStaffGrants').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Invite not found.' })
    return
  }
  await db.collection('pendingStaffGrants').deleteOne(req.params.id)
  res.json({ ok: true })
})

export default router
