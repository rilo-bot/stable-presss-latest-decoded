// ---------------------------------------------------------------------------
// The admin roster + pending invites.
//
// Role GRANT/REVOKE lives in routes/roles.ts (`POST /api/roles/:name/assign`)
// because roles are DB rows, not a fixed enum. What remains here is the roster
// itself and the invite-by-email flow for people who have no account yet.
//
// A pending invite stores a role NAME. It is validated against the live registry
// at both ends — when staged, and again when applied at first sign-in — so an
// invite for a role deleted in between is dropped rather than granting nothing.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'
import { INVITES, USERS } from '../../lib/collections.js'
import { isAdmin, canManageTeam, canViewTeam } from '../../lib/rbac.js'
import {
  adminRecordsForUsers,
  grantAdminRole,
  revokeAdminRole,
  superadminCount,
} from '../../lib/admins.js'
import {
  SUPERADMIN_ROLE_NAME,
  checkSuperadminLoss,
  denyRoleGrant,
  getRoles,
} from '../../lib/roleRegistry.js'
import { isEmailConfigured, sendInviteEmail, sendRoleGrantedEmail } from '../../lib/email.js'
import {
  INVITE_RESEND_COOLDOWN_MS,
  expiresInLabel,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
  isExpired,
  sanitizeRedirect,
} from '../../lib/invites.js'

const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')

const router = Router()

router.use(attachAccount)

/**
 * Every admin account, with the role each holds.
 *
 * `isAdmin: true` is the indexed denormalised copy of "has an `admins` row", so
 * this reads the admin population rather than scanning every user — then joins
 * the roles in ONE query via `adminRecordsForUsers`.
 */
async function adminRoster() {
  const users = await db.collection(USERS).find({ isAdmin: true })
  const records = await adminRecordsForUsers(users.map((u) => String(u._id)))
  return users
    .map((u) => {
      const id = String(u._id)
      const role = records.get(id)?.role ?? null
      return {
        userId: id,
        name: String(u.name ?? ''),
        email: String(u.email ?? ''),
        // null when the role row was deleted out from under them. They are still
        // an admin holding nothing, and must stay visible so someone can fix it.
        role: role ? { name: role.name, label: role.label, color: role.color, icon: role.icon } : null,
        lastLogin: typeof u.lastLogin === 'string' ? u.lastLogin : null,
      }
    })
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}

// ── Share pickers: who can I share something with? ───────────────────────────
// Registered BEFORE the `team.*` gate below on purpose. This is not roster
// administration — it is the name/email list a share dialog needs to offer
// colleagues, so the only question is "are you an admin". Gating it behind
// `team.view` would leave a contributor unable to share their own magazine.
//
// It returns the three fields a picker renders and NOTHING else — no role names,
// no invite state, no permission enumeration.
router.get('/directory', async (req, res) => {
  if (!isAdmin(req.account)) {
    res.status(403).json({ error: 'Admin access required.' })
    return
  }
  const users = await db.collection(USERS).find({ isAdmin: true })
  const people = users
    .map((u) => ({ userId: String(u._id), name: String(u.name ?? ''), email: String(u.email ?? '') }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
  res.json(people)
})

// Roster access is `team.*`, not `roles.manage` — inviting someone is a different
// power from defining what a role may do. See routes/roles.ts.
//
// READ vs WRITE are split. The whole router used to require `team.manage`, which
// left `team.view` ("See the team roster") granting nothing at all.
router.use((req, res, next) => {
  const allowed = req.method === 'GET' ? canViewTeam(req.account) : canManageTeam(req.account)
  if (!allowed) {
    res.status(403).json({
      error:
        req.method === 'GET'
          ? 'You do not have permission to view the team.'
          : 'You do not have permission to manage the team.',
    })
    return
  }
  next()
})

// ── Roster: every admin, plus pending invites ────────────────────────────────
router.get('/', async (_req, res) => {
  const staff = await adminRoster()

  // The raw token is never returned — only whether the link is still live, so
  // the UI can offer "Resend" on an expired invite instead of a dead row.
  const pending = (await db.collection(INVITES).find()).map((g) => ({
    id: String(g._id),
    email: String(g.email),
    role: String(g.role),
    invitedByName: g.invitedByName ? String(g.invitedByName) : undefined,
    expiresAt: g.expiresAt ? String(g.expiresAt) : undefined,
    expired: isExpired(g),
    lastSentAt: g.lastSentAt ? String(g.lastSentAt) : undefined,
  }))

  res.json({ staff, pending, emailConfigured: isEmailConfigured() })
})

/** Display name for the "invited by" line — falls back to the email. */
function actorName(req: { account?: { name?: string; email?: string } }): string {
  return req.account?.name?.trim() || req.account?.email || 'A Stable Press administrator'
}

// ── Invite by email: grant now if the account exists, else stage it ──────────
router.post('/', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const roleName = typeof req.body?.role === 'string' ? req.body.role : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' })
    return
  }
  const role = (await getRoles()).get(roleName)
  if (!role) {
    res.status(400).json({ error: 'That role no longer exists.' })
    return
  }
  if (role.isSuper && !req.account!.isSuperAdmin) {
    res.status(403).json({ error: 'Only a superadmin can grant the superadmin role.' })
    return
  }
  // Inviting yourself is the same escalation as assigning yourself — this route
  // MOVES an existing member to the named role, so without the amplification
  // check it was a second door to `administrator`. See routes/roles.ts.
  const denied = denyRoleGrant(req.account!, role, email === req.account!.email.toLowerCase())
  if (denied) {
    res.status(403).json({ error: denied })
    return
  }

  // ── Already has an account: the role applies now, so there is nothing to
  // accept. Tell them it happened and point at the newsroom.
  const existing = (await db.collection(USERS).find({ email }))[0]
  if (existing) {
    const userId = String(existing._id)
    const current = (await adminRecordsForUsers([userId])).get(userId)
    if (current?.role?.id === role.id) {
      res.status(409).json({ error: 'That person already holds this role.' })
      return
    }
    // One role per person — see routes/roles.ts. Inviting an existing member to
    // a different role MOVES them to it rather than stacking a second one, so the
    // superadmin guard applies here as much as on an explicit removal.
    const blocked = await checkSuperadminLoss(
      req.account!,
      current?.role?.isSuper === true && !role.isSuper,
    )
    if (blocked) {
      res.status(403).json({ error: blocked })
      return
    }
    await grantAdminRole(userId, role.id, req.account!.id)

    // The grant is the point; the email is a courtesy. A delivery failure must
    // not roll it back or read as failure — report it and let the UI say so.
    let delivered = false
    try {
      ;({ delivered } = await sendRoleGrantedEmail({
        to: email,
        roleLabel: role.label,
        invitedBy: actorName(req),
        newsroomUrl: `${WEB_PUBLIC_URL}/production-system`,
      }))
    } catch (err) {
      console.error('[staff] role-granted email failed:', err instanceof Error ? err.message : err)
    }
    res.status(200).json({ ok: true, applied: 'immediate', emailed: delivered })
    return
  }

  // ── No account yet: stage the grant and email a one-time accept link.
  const dupes = await db.collection(INVITES).find({ email })
  const existingInvite = dupes.find((g) => g.role === role.name)
  if (existingInvite && !isExpired(existingInvite)) {
    res.status(409).json({
      error: 'A pending invite for this role already exists. Resend it from the list below.',
    })
    return
  }

  const token = generateInviteToken()
  const now = new Date()
  const doc = {
    email,
    role: role.name,
    tokenHash: hashInviteToken(token),
    expiresAt: inviteExpiry(now),
    invitedBy: req.account!.id,
    invitedByName: actorName(req),
    // Optional deep link — e.g. the magazine they were invited to work on.
    // Sanitized to a same-origin path so an invite can never redirect off-site.
    redirectTo: sanitizeRedirect(req.body?.redirectTo),
    lastSentAt: now.toISOString(),
    createdAt: now.toISOString(),
  }

  // An expired invite for the same role is refreshed in place rather than
  // duplicated, so the list doesn't accumulate dead rows for one person.
  const inviteId = existingInvite
    ? (await db.collection(INVITES).updateOne(String(existingInvite._id), doc),
      String(existingInvite._id))
    : await db.collection(INVITES).insertOne(doc)

  let delivered = false
  try {
    ;({ delivered } = await sendInviteEmail({
      to: email,
      roleLabel: role.label,
      invitedBy: actorName(req),
      acceptUrl: inviteUrl(WEB_PUBLIC_URL, token),
      expiresIn: expiresInLabel(),
    }))
  } catch (err) {
    // Keep the invite: the role still applies if they sign up on their own, and
    // the admin can hit Resend. Deleting it would strand the grant entirely.
    console.error('[staff] invite email failed:', err instanceof Error ? err.message : err)
    res.status(502).json({
      error: 'The invite was saved but the email could not be sent. Try resending it.',
      inviteId,
      applied: 'pending',
      emailed: false,
    })
    return
  }

  res.status(201).json({ ok: true, applied: 'pending', emailed: delivered, inviteId })
})

// ── Re-send a MEMBER's access email ──────────────────────────────────────────
// They already have the role — this is the "I never got the email" button, not
// an invitation. There is no token to rotate, so nothing here is security
// sensitive; the cooldown just stops the button being leaned on.
const lastMemberNotify = new Map<string, number>()

router.post('/member/:userId/resend', async (req, res) => {
  const userId = String(req.params.userId)
  const target = await db.collection(USERS).findById(userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  const role = (await adminRecordsForUsers([userId])).get(userId)?.role
  if (!role) {
    res.status(409).json({ error: 'That person holds no role, so there is nothing to send.' })
    return
  }

  const last = lastMemberNotify.get(userId) ?? 0
  if (Date.now() - last < INVITE_RESEND_COOLDOWN_MS) {
    res.status(429).json({ error: 'That was just sent. Please wait a moment.' })
    return
  }

  try {
    const { delivered } = await sendRoleGrantedEmail({
      to: String(target.email ?? ''),
      roleLabel: role.label,
      invitedBy: actorName(req),
      newsroomUrl: `${WEB_PUBLIC_URL}/production-system`,
    })
    // Only start the cooldown once something actually went out, so a failed
    // send doesn't lock the admin out of retrying for a minute.
    if (delivered) lastMemberNotify.set(userId, Date.now())
    res.json({ ok: true, emailed: delivered })
  } catch (err) {
    console.error('[staff] member resend failed:', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'Could not send the email. Please try again.' })
  }
})

// ── Remove someone from the team ─────────────────────────────────────────────
// Drops the `admins` row. The ACCOUNT survives — they become a plain user rather
// than being deleted, because their bylines, stories and uploads still reference
// them.
router.delete('/member/:userId', async (req, res) => {
  const userId = String(req.params.userId)
  const target = await db.collection(USERS).findById(userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  if (userId === req.account!.id) {
    res.status(403).json({ error: 'You cannot remove yourself from the team.' })
    return
  }
  // Both rules that used to be spelled out here live in one helper, so the roles
  // router cannot drift from this one again (it had: it checked the holder count
  // but not who was acting).
  const current = (await adminRecordsForUsers([userId])).get(userId)
  const blocked = await checkSuperadminLoss(req.account!, current?.role?.isSuper === true)
  if (blocked) {
    res.status(403).json({ error: blocked })
    return
  }

  await revokeAdminRole(userId)
  // Any invite still sitting for that address would silently re-grant on their
  // next sign-in, undoing the removal.
  const orphaned = await db.collection(INVITES).find({ email: String(target.email ?? '') })
  await Promise.all(orphaned.map((g) => db.collection(INVITES).deleteOne(g._id)))

  res.json({ ok: true })
})

// ── Resend an invite ─────────────────────────────────────────────────────────
// Issues a FRESH token and extends the expiry — the old link stops working, so
// a forwarded or exposed one cannot be revived by asking for another.
router.post('/pending/:id/resend', async (req, res) => {
  const found = await db.collection(INVITES).findById(String(req.params.id))
  if (!found) {
    res.status(404).json({ error: 'Invite not found.' })
    return
  }

  const lastSent = typeof found.lastSentAt === 'string' ? Date.parse(found.lastSentAt) : 0
  if (lastSent && Date.now() - lastSent < INVITE_RESEND_COOLDOWN_MS) {
    res.status(429).json({ error: 'That invite was just sent. Please wait a moment.' })
    return
  }

  const role = (await getRoles()).get(String(found.role))
  if (!role) {
    res.status(409).json({ error: 'That role no longer exists. Cancel this invite and start again.' })
    return
  }

  const token = generateInviteToken()
  const now = new Date()
  await db.collection(INVITES).updateOne(String(found._id), {
    tokenHash: hashInviteToken(token),
    expiresAt: inviteExpiry(now),
    lastSentAt: now.toISOString(),
  })

  try {
    const { delivered } = await sendInviteEmail({
      to: String(found.email),
      roleLabel: role.label,
      invitedBy: actorName(req),
      acceptUrl: inviteUrl(WEB_PUBLIC_URL, token),
      expiresIn: expiresInLabel(),
    })
    res.json({ ok: true, emailed: delivered })
  } catch (err) {
    console.error('[staff] invite resend failed:', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'Could not send the invite email. Please try again.' })
  }
})

// ── Cancel a pending invite ──────────────────────────────────────────────────
router.delete('/pending/:id', async (req, res) => {
  const found = await db.collection(INVITES).findById(String(req.params.id))
  if (!found) {
    res.status(404).json({ error: 'Invite not found.' })
    return
  }
  await db.collection(INVITES).deleteOne(String(req.params.id))
  res.json({ ok: true })
})

export default router
