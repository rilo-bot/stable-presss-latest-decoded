// ---------------------------------------------------------------------------
// Organisations, and who belongs to one.
//
// TWO COLLECTIONS, NOT AN ARRAY. Membership lives in `orgMembers`
// (userId × orgId → 'owner' | 'manager' | 'member'), which is what
// `resolveAccount` reads. It used to be written to a `users.orgMemberships`
// array that nothing read, so creating an organisation granted the creator
// nothing at all.
//
// `organisations.ownerUserId` and the owner's `orgMembers` row are the same
// fact stored twice, so `setMember` and `createOrganisation` are the only
// writers of either — the same discipline lib/admins.ts applies to `isAdmin`.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'
import { ORGANISATIONS, ORG_MEMBERS, PARTIES, USERS } from '../../lib/collections.js'
import { toOrgRole, toPartyRole, type OrgRole } from '../../lib/identity.js'
import { isPlatformAdmin, orgRoleIn, canManageOrg, isOrgOwner } from '../../lib/rbac.js'
import { project } from '../../lib/project.js'

const router = Router()

const str = (v: unknown, max: number): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : undefined
}

/**
 * Set (or change) one person's membership of one organisation.
 *
 * The ONLY writer of `orgMembers`. Upsert-by-hand rather than two call sites,
 * so "add a member" and "change their role" cannot disagree about the shape.
 */
async function setMember(userId: string, orgId: string, role: OrgRole): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.collection(ORG_MEMBERS).find({ userId, orgId })
  if (existing[0]) {
    await db.collection(ORG_MEMBERS).updateOne(String(existing[0]._id), { role, updatedAt: now })
    // A unique index covers (userId, orgId), but a row written before it existed
    // would make "what is their role?" depend on document order.
    for (const dupe of existing.slice(1)) await db.collection(ORG_MEMBERS).deleteOne(String(dupe._id))
    return
  }
  await db.collection(ORG_MEMBERS).insertOne({ userId, orgId, role, createdAt: now, updatedAt: now })
}

async function removeMember(userId: string, orgId: string): Promise<void> {
  const rows = await db.collection(ORG_MEMBERS).find({ userId, orgId })
  for (const row of rows) await db.collection(ORG_MEMBERS).deleteOne(String(row._id))
}

// Every organisation route requires authentication.
router.use(attachAccount)

// ── Create an organisation → creator becomes owner ───────────────────────────
router.post('/', async (req, res) => {
  const account = req.account!
  const name = str(req.body?.name, 120)
  if (!name) {
    res.status(400).json({ error: 'Organisation name is required.' })
    return
  }

  const now = new Date().toISOString()
  const orgId = await db.collection(ORGANISATIONS).insertOne({
    name,
    ownerUserId: account.id,
    description: str(req.body?.description, 2000),
    bio: str(req.body?.bio, 2000),
    createdAt: now,
    updatedAt: now,
  })
  // The owner is a member too. `ownerUserId` is the fast answer to "whose org is
  // this?"; the row is what `resolveAccount` reads to give them scope.
  await setMember(account.id, orgId, 'owner')

  const org = await db.collection(ORGANISATIONS).findById(orgId)
  res.status(201).json({ org: project(org!), myRole: 'owner' as OrgRole })
})

// ── Organisations the current user belongs to ────────────────────────────────
router.get('/mine', async (req, res) => {
  const account = req.account!
  const out: Array<Record<string, unknown>> = []
  for (const m of account.orgMembers) {
    const org = await db.collection(ORGANISATIONS).findById(m.orgId)
    if (org) out.push({ ...project(org), myRole: m.role })
  }
  res.json(out)
})

// ── Organisation detail: members + the parties it holds ──────────────────────
router.get('/:id', async (req, res) => {
  const account = req.account!
  const orgId = String(req.params.id)
  if (!isPlatformAdmin(account) && !orgRoleIn(account, orgId)) {
    res.status(403).json({ error: 'You are not a member of this organisation.' })
    return
  }
  const org = await db.collection(ORGANISATIONS).findById(orgId)
  if (!org) {
    res.status(404).json({ error: 'Organisation not found.' })
    return
  }

  // One indexed lookup on {orgId} plus a fetch per member, instead of loading
  // every user on the platform to find one org's members.
  const memberRows = await db.collection(ORG_MEMBERS).find({ orgId })
  const memberDocs = await Promise.all(
    memberRows.map((r) => db.collection(USERS).findById(String(r.userId))),
  )
  const members = memberRows
    .map((r, i) => ({ row: r, user: memberDocs[i] }))
    .filter((x) => x.user)
    .map((x) => ({
      userId: String(x.user!._id),
      name: String(x.user!.name ?? ''),
      email: String(x.user!.email ?? ''),
      role: x.row.role as OrgRole,
    }))

  // A party row carries `orgId` and `horseId` directly, so the org's parties and
  // the horses it reaches are ONE indexed query — no link table, no full scan.
  const orgParties = await db.collection(PARTIES).find({ orgId })
  const horseIds = [...new Set(orgParties.filter((p) => p.horseId).map((p) => String(p.horseId)))]

  res.json({ org: project(org), members, parties: orgParties.map(project), horseIds })
})

// ── Update the organisation profile (owner or manager) ───────────────────────
router.put('/:id', async (req, res) => {
  const orgId = String(req.params.id)
  if (!canManageOrg(req.account, orgId)) {
    res.status(403).json({ error: 'Only org owners and managers can edit the organisation.' })
    return
  }
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  const name = str(req.body?.name, 120)
  if (name) update.name = name
  if ('description' in (req.body ?? {})) update.description = str(req.body?.description, 2000) ?? null
  if ('bio' in (req.body ?? {})) update.bio = str(req.body?.bio, 2000) ?? null
  // Ownership moves through /:id/members, which keeps the row and the pointer
  // in step. Accepting it here would let a manager hand the org to themselves.
  const ok = await db.collection(ORGANISATIONS).updateOne(orgId, update)
  if (!ok) {
    res.status(404).json({ error: 'Organisation not found.' })
    return
  }
  const fresh = await db.collection(ORGANISATIONS).findById(orgId)
  res.json({ org: project(fresh!) })
})

// ── Add or re-role a member by email ─────────────────────────────────────────
router.post('/:id/members', async (req, res) => {
  const account = req.account!
  const orgId = String(req.params.id)
  if (!canManageOrg(account, orgId)) {
    res.status(403).json({ error: 'Only org owners and managers can add members.' })
    return
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const role = toOrgRole(req.body?.role)
  // Granting owner or manager is owner-only; a manager may add plain members.
  if ((role === 'owner' || role === 'manager') && !isOrgOwner(account, orgId)) {
    res.status(403).json({ error: 'Only the org owner can grant owner or manager.' })
    return
  }

  const target = (await db.collection(USERS).find({ email }))[0]
  if (!target) {
    res.status(404).json({ error: 'No account found with that email. Ask them to sign up first.' })
    return
  }
  const targetId = String(target._id)
  const already = (await db.collection(ORG_MEMBERS).find({ userId: targetId, orgId }))[0]
  if (already && already.role === role) {
    res.status(409).json({ error: 'That person already holds this role.' })
    return
  }

  await setMember(targetId, orgId, role)
  // Promoting someone to owner MOVES ownership: two owners means two people who
  // can remove each other, and `ownerUserId` can only name one of them.
  if (role === 'owner') {
    await db.collection(ORGANISATIONS).updateOne(orgId, {
      ownerUserId: targetId,
      updatedAt: new Date().toISOString(),
    })
    if (account.id !== targetId) await setMember(account.id, orgId, 'manager')
  }

  res.status(201).json({
    ok: true,
    member: { userId: targetId, name: String(target.name ?? ''), email: String(target.email ?? ''), role },
  })
})

// ── Remove a member (owner only) ─────────────────────────────────────────────
router.delete('/:id/members/:userId', async (req, res) => {
  const account = req.account!
  const orgId = String(req.params.id)
  const userId = String(req.params.userId)
  if (!isOrgOwner(account, orgId)) {
    res.status(403).json({ error: 'Only the org owner can remove members.' })
    return
  }
  const org = await db.collection(ORGANISATIONS).findById(orgId)
  if (!org) {
    res.status(404).json({ error: 'Organisation not found.' })
    return
  }
  // An org with no owner cannot be administered by anyone but a platform admin,
  // and nothing here can appoint a replacement — so this is refused rather than
  // recovered from. Hand ownership over first, which also removes you.
  if (String(org.ownerUserId) === userId) {
    res.status(400).json({ error: 'The owner cannot be removed. Transfer ownership first.' })
    return
  }
  await removeMember(userId, orgId)
  res.json({ ok: true })
})

// ── Register a party the org holds ───────────────────────────────────────────
// A row in the shared register, stamped with `orgId`. Unclaimed by design: the
// organisation holds it, and a person claims it only if they are that person.
router.post('/:id/parties', async (req, res) => {
  const orgId = String(req.params.id)
  if (!canManageOrg(req.account, orgId)) {
    res.status(403).json({ error: 'Only org owners and managers can add parties.' })
    return
  }
  const name = str(req.body?.name, 120)
  if (!name) {
    res.status(400).json({ error: 'Party name is required.' })
    return
  }
  const role = toPartyRole(req.body?.role)
  if (!role) {
    res.status(400).json({ error: 'A valid racing role is required (owner, trainer, jockey…).' })
    return
  }
  const now = new Date().toISOString()
  const id = await db.collection(PARTIES).insertOne({
    name,
    role,
    orgId,
    horseId: str(req.body?.horseId, 64),
    taken: false,
    createdAt: now,
    updatedAt: now,
  })
  const created = await db.collection(PARTIES).findById(id)
  res.status(201).json({ party: project(created!) })
})

export default router
