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
import { isEmailConfigured, sendInviteEmail, sendRoleGrantedEmail } from '../lib/email.js'
import {
  COLLECTION as INVITES,
  INVITE_RESEND_COOLDOWN_MS,
  expiresInLabel,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
  isExpired,
  sanitizeRedirect,
} from '../lib/invites.js'

const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')

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
function actorName(req: { account?: { displayName?: string; email?: string } }): string {
  return req.account?.displayName?.trim() || req.account?.email || 'A Stable Press administrator'
}

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

  // ── Already has an account: the role applies now, so there is nothing to
  // accept. Tell them it happened and point at the newsroom.
  const existing = (await db.collection('users').find({ email }))[0]
  if (existing) {
    const acct = withIdentityDefaults({ id: existing._id, ...existing })
    if (acct.staffRoles.includes(role.slug)) {
      res.status(409).json({ error: 'That person already holds this role.' })
      return
    }
    await db.collection('users').addToSet(String(existing._id), 'staffRoles', role.slug)

    // The grant is the point; the email is a courtesy. A delivery failure must
    // not roll it back or read as failure — report it and let the UI say so.
    let delivered = false
    try {
      ;({ delivered } = await sendRoleGrantedEmail({
        to: email,
        roleLabel: role.label,
        invitedBy: actorName(req),
        newsroomUrl: `${WEB_PUBLIC_URL}/newsroom`,
      }))
    } catch (err) {
      console.error('[staff] role-granted email failed:', err instanceof Error ? err.message : err)
    }
    res.status(200).json({ ok: true, applied: 'immediate', emailed: delivered })
    return
  }

  // ── No account yet: stage the grant and email a one-time accept link.
  const dupes = await db.collection(INVITES).find({ email })
  const existingInvite = dupes.find((g) => g.role === role.slug)
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
    role: role.slug,
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
// Previously unreachable: the UI listed pending invites with no way to withdraw
// one, so a mistyped address sat there indefinitely, auto-applying whenever
// someone eventually claimed it.
router.delete('/pending/:id', async (req, res) => {
  const found = await db.collection(INVITES).findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Invite not found.' })
    return
  }
  await db.collection(INVITES).deleteOne(req.params.id)
  res.json({ ok: true })
})

export default router
