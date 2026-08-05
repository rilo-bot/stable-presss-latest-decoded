// ---------------------------------------------------------------------------
// The racing register — `parties`.
//
// ONE ROW PER (person, role, horse). Someone who both owns and trains a horse has
// two rows; someone who owns two horses has two rows. That is what makes `role` a
// single value instead of an array, and it is why claiming is per-row.
//
// A row is EITHER unclaimed (`taken: false`, no `userId`) — an admin registered a
// trainer who has never signed up — OR claimed (`taken: true`, `userId` set).
// There is no pending/verified state: a claim is immediately true. `taken` is
// derived from `userId`, and only this file writes the pair, so they cannot drift.
//
// Gating is in lib/rbac.ts `partyScopedWriteGate`: register entries are created
// and deleted by admins; a claimed row is editable by whoever claimed it.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { PARTIES } from '../../lib/collections.js'
import { isAdmin } from '../../lib/rbac.js'
import { toPartyRole, type PartyRole } from '../../lib/identity.js'
import { project, type WithMongoId } from '../../lib/project.js'

const router = Router()

/** The stored shape. `taken` is never accepted from a client — it mirrors `userId`. */
interface PartyFields {
  name: string
  role: PartyRole
  imageUrl?: string
  orgId?: string
  horseId?: string
}

const str = (v: unknown, max: number): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : undefined
}

/** Validate the writable body of a register row. */
function readBody(body: unknown): PartyFields | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const name = str(b.name, 120)
  if (!name) return { error: 'A name is required.' }
  const role = toPartyRole(b.role)
  if (!role) return { error: 'A valid racing role is required (owner, trainer, jockey…).' }
  return {
    name,
    role,
    imageUrl: str(b.imageUrl, 2048),
    orgId: str(b.orgId, 64),
    horseId: str(b.horseId, 64),
  }
}

// ── List ─────────────────────────────────────────────────────────────────────
// The register is public: it is how someone finds the row that represents them
// so they can claim it. `userId` is stripped for anonymous and non-owning callers
// — who holds a row is not public information, only that it is taken.
router.get('/', async (req, res) => {
  const account = req.account
  const admin = isAdmin(account)
  const rows = (await db.collection(PARTIES).find()) as WithMongoId[]
  res.json(
    rows.map((row) => {
      const out = project(row)
      if (!admin && out.userId !== account?.id) delete (out as { userId?: unknown }).userId
      return out
    }),
  )
})

// ── Read one ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const found = await db.collection(PARTIES).findById(String(req.params.id))
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const out = project(found)
  if (!isAdmin(req.account) && out.userId !== req.account?.id) {
    delete (out as { userId?: unknown }).userId
  }
  res.json(out)
})

// ── Create a register entry (admin only — see partyScopedWriteGate) ──────────
router.post('/', async (req, res) => {
  const parsed = readBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const now = new Date().toISOString()
  // Created UNCLAIMED. An admin registering a trainer is recording that the
  // trainer exists, not asserting that they are the trainer — the person claims
  // the row themselves, which is the only thing that sets `userId`.
  const id = await db.collection(PARTIES).insertOne({
    ...parsed,
    taken: false,
    createdAt: now,
    updatedAt: now,
  })
  const created = await db.collection(PARTIES).findById(id)
  res.status(201).json(project(created!))
})

// ── Edit a row ───────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = String(req.params.id)
  const parsed = readBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  // `taken` and `userId` are the claim, and the claim is not editable through
  // the register — POST /:id/claim and /:id/release are the only ways to move it.
  const ok = await db.collection(PARTIES).updateOne(id, {
    ...parsed,
    updatedAt: new Date().toISOString(),
  })
  if (!ok) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const updated = await db.collection(PARTIES).findById(id)
  res.json(project(updated!))
})

// ── Claim a row: "this is me" ────────────────────────────────────────────────
router.post('/:id/claim', async (req, res) => {
  const account = req.account!
  const id = String(req.params.id)
  const row = await db.collection(PARTIES).findById(id)
  if (!row) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (row.taken === true || row.userId) {
    // Deliberately the same message whether they already hold it or someone else
    // does — the register does not tell you who a row belongs to.
    if (String(row.userId) === account.id) {
      res.status(409).json({ error: 'You have already claimed this.' })
      return
    }
    res.status(409).json({ error: 'That register entry has already been claimed.' })
    return
  }
  // `taken` and `userId` written together, in the one place that writes them.
  await db.collection(PARTIES).updateOne(id, {
    taken: true,
    userId: account.id,
    updatedAt: new Date().toISOString(),
  })
  const fresh = await db.collection(PARTIES).findById(id)
  res.json(project(fresh!))
})

// ── Release a claim ──────────────────────────────────────────────────────────
// The ROW survives — it goes back to being an unclaimed register entry, because
// the horse links and org pointer on it are still true.
router.post('/:id/release', async (req, res) => {
  const account = req.account!
  const id = String(req.params.id)
  const row = await db.collection(PARTIES).findById(id)
  if (!row) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!isAdmin(account) && String(row.userId) !== account.id) {
    res.status(403).json({ error: 'You can only release a party you have claimed.' })
    return
  }
  await db.collection(PARTIES).updateOne(id, {
    taken: false,
    userId: null,
    updatedAt: new Date().toISOString(),
  })
  const fresh = await db.collection(PARTIES).findById(id)
  res.json(project(fresh!))
})

// ── Delete (admin only — see partyScopedWriteGate) ───────────────────────────
router.delete('/:id', async (req, res) => {
  const ok = await db.collection(PARTIES).deleteOne(String(req.params.id))
  if (!ok) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({ success: true })
})

export default router
