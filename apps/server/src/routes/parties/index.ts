// The racing register.
//
// ONE ROW PER (person, role, horse) - which is why `role` is a single value.
// A row is either unclaimed (taken: false, no userId) or claimed. There is no
// pending/verified state. Only this file writes taken + userId, together.

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { PARTIES } from '../../lib/collections.js'
import { isAdmin } from '../../lib/rbac.js'
import { toPartyRole, type PartyRole } from '../../lib/identity.js'
import { project, type WithMongoId } from '../../lib/project.js'

const router = Router()

/** `taken` is never accepted from a client - it mirrors `userId`. */
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

// Public: this is how someone finds the row that represents them. `userId` is
// stripped for other callers - that a row is taken is public, by whom is not.
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

router.post('/', async (req, res) => {
  const parsed = readBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const now = new Date().toISOString()
  // UNCLAIMED: registering a trainer records that they exist, it does not
  // assert who they are. Only the person claiming it sets `userId`.
  const id = await db.collection(PARTIES).insertOne({
    ...parsed,
    taken: false,
    createdAt: now,
    updatedAt: now,
  })
  const created = await db.collection(PARTIES).findById(id)
  res.status(201).json(project(created!))
})

router.put('/:id', async (req, res) => {
  const id = String(req.params.id)
  const parsed = readBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  // The claim is not editable here: /:id/claim and /:id/release own it.
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

// "This is me".
router.post('/:id/claim', async (req, res) => {
  const account = req.account!
  const id = String(req.params.id)
  const row = await db.collection(PARTIES).findById(id)
  if (!row) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (row.taken === true || row.userId) {
    if (String(row.userId) === account.id) {
      res.status(409).json({ error: 'You have already claimed this.' })
      return
    }
    res.status(409).json({ error: 'That register entry has already been claimed.' })
    return
  }
  await db.collection(PARTIES).updateOne(id, {
    taken: true,
    userId: account.id,
    updatedAt: new Date().toISOString(),
  })
  const fresh = await db.collection(PARTIES).findById(id)
  res.json(project(fresh!))
})

// The ROW survives as an unclaimed entry: its horse and org links are still true.
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

router.delete('/:id', async (req, res) => {
  const ok = await db.collection(PARTIES).deleteOne(String(req.params.id))
  if (!ok) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({ success: true })
})

export default router
