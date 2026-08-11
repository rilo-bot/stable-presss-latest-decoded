// The admin roster and pending invites. Role grant/revoke lives in routes/roles.ts.

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'
import { INVITES, USERS } from '../../lib/collections.js'
import { isAdmin, canManageTeam, canViewTeam } from '../../lib/rbac.js'
import { getRoles, linksForUsers, roleOfUser } from '../../lib/roleRegistry.js'
import { canOfferRole, grantRoleTo, revokeRoleFrom } from '../../lib/roleGrant.js'
import { findUserByEmail } from '../../lib/session.js'
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

/** Falls back to the email when the account has no name. */
function actorName(req: { account?: { name?: string; email?: string } }): string {
  return req.account?.name?.trim() || req.account?.email || 'A Stable Press administrator'
}

/**
 * `users.isAdmin` IS "is an admin", and it is indexed. The role each one holds
 * comes from the `adminRoles` links, fetched in ONE query for the whole roster
 * rather than per row.
 */
async function adminRoster() {
  const users = await db.collection(USERS).find({ isAdmin: true })
  const [links, roles] = await Promise.all([
    linksForUsers(users.map((u) => String(u._id))),
    getRoles(),
  ])
  const rows = users.map((u) => {
    const link = links.get(String(u._id))
    const role = link ? roles.get(link.roleId) : undefined
    return {
      userId: String(u._id),
      name: String(u.name ?? ''),
      email: String(u.email ?? ''),
      // null when the role was deleted under them, or the link never landed:
      // still an admin, holding nothing, and must stay visible so someone can
      // fix it.
      role: role ? { name: role.name, label: role.label, color: role.color, icon: role.icon } : null,
      assignedAt: link?.assignedAt ?? null,
      lastLogin: typeof u.lastLogin === 'string' ? u.lastLogin : null,
    }
  })
  return rows.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}

/**
 * The name/email list a share dialog offers. Registered BEFORE the `team.*` gate:
 * this is not roster administration, so gating it on `team.view` would leave a
 * contributor unable to share their own magazine.
 */
router.get('/directory', async (req, res) => {
  if (!isAdmin(req.account)) {
    res.status(403).json({ error: 'Admin access required.' })
    return
  }
  const users = await db.collection(USERS).find({ isAdmin: true })
  res.json(
    users
      .map((u) => ({ userId: String(u._id), name: String(u.name ?? ''), email: String(u.email ?? '') }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
  )
})

// Read and write are split: `team.view` grants the roster, `team.manage` changes it.
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

// GET /api/staff
router.get('/', async (_req, res) => {
  const staff = await adminRoster()
  // The raw token is never returned, only whether the link is still live.
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

/** POST /api/staff - grant now if the account exists, otherwise stage an invite. */
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
  // Gate the ROLE before either branch: the invite path below has no user
  // document to check against, and must not become a way to hand out a role you
  // could not grant directly.
  const offerable = canOfferRole(req.account!, role)
  if (!offerable.ok) {
    res.status(offerable.status).json({ error: offerable.error })
    return
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    // The SAME guard sequence `POST /api/roles/:name/assign` runs — this route is
    // the other door onto one operation, and the two had begun to differ.
    const outcome = await grantRoleTo(req.account!, existing, role)
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error })
      return
    }

    // The grant is the point; the email is a courtesy. A delivery failure must
    // not roll it back or read as failure.
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
    // Same-origin path only, so an invite can never redirect off-site.
    redirectTo: sanitizeRedirect(req.body?.redirectTo),
    lastSentAt: now.toISOString(),
    createdAt: now.toISOString(),
  }

  // An expired invite for the same role is refreshed in place, not duplicated.
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
    // Keep the invite: deleting it would strand the grant entirely.
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

const lastMemberNotify = new Map<string, number>()

/** They already hold the role - this is the "I never got the email" button. */
router.post('/member/:userId/resend', async (req, res) => {
  const userId = String(req.params.userId)
  const target = await db.collection(USERS).findById(userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  const role = await roleOfUser(target)
  if (!role) {
    res.status(409).json({ error: 'That person holds no role, so there is nothing to send.' })
    return
  }
  if (Date.now() - (lastMemberNotify.get(userId) ?? 0) < INVITE_RESEND_COOLDOWN_MS) {
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
    // Only start the cooldown once something went out.
    if (delivered) lastMemberNotify.set(userId, Date.now())
    res.json({ ok: true, emailed: delivered })
  } catch (err) {
    console.error('[staff] member resend failed:', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'Could not send the email. Please try again.' })
  }
})

/** Clears the role. The ACCOUNT survives - bylines and uploads reference it. */
router.delete('/member/:userId', async (req, res) => {
  const userId = String(req.params.userId)
  const target = await db.collection(USERS).findById(userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  // Same guard sequence as `DELETE /api/roles/:name/assign/:userId`.
  const outcome = await revokeRoleFrom(req.account!, target)
  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.error })
    return
  }

  // A surviving invite link would hand the role straight back on one click.
  // (It can no longer do so at sign-in — that path is gone — but the link itself
  // still redeems, so the pending rows have to go with the revocation.)
  const orphaned = await db.collection(INVITES).find({ email: String(target.email ?? '') })
  await Promise.all(orphaned.map((g) => db.collection(INVITES).deleteOne(g._id)))

  res.json({ ok: true })
})

/** Issues a FRESH token, so a forwarded or exposed link cannot be revived. */
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
