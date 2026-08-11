// The racing register - the EDGE table.
//
// ONE ROW PER (person, role, horse), which is why `role` is a single value. The
// row says "this person fills this role, on this horse, for this org". WHO the
// person is lives once in `people` and is joined in on read, never stored here.
//
// A row is either unclaimed (taken: false, no userId) or claimed. There is no
// pending/verified state. Only this file writes taken + userId, together.

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { PARTIES, PEOPLE } from '../../lib/collections.js'
import { isAdmin } from '../../lib/rbac.js'
import { toPartyRole, type PartyRole, type PartyRow } from '../../lib/identity.js'
import { toPartyRows } from '../../lib/effectiveAccess.js'

const router = Router()

/** `taken` is never accepted from a client - it mirrors `userId`. */
interface PartyFields {
  personId: string
  role: PartyRole
  orgId?: string
  horseId?: string
}

const str = (v: unknown, max: number): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : undefined
}

async function readBody(body: unknown): Promise<PartyFields | { error: string }> {
  const b = (body ?? {}) as Record<string, unknown>
  const personId = str(b.personId, 64)
  if (!personId) return { error: 'A person is required.' }
  if (!(await db.collection(PEOPLE).findById(personId))) {
    return { error: 'That person is not in the register.' }
  }
  const role = toPartyRole(b.role)
  if (!role) return { error: 'A valid racing role is required (owner, trainer, jockey…).' }
  return {
    personId,
    role,
    orgId: str(b.orgId, 64),
    horseId: str(b.horseId, 64),
  }
}

/** That a row is taken is public; by WHOM is not, except to admins and the owner. */
function redact(rows: PartyRow[], accountId: string | undefined, admin: boolean): PartyRow[] {
  if (admin) return rows
  return rows.map((r) => (r.userId === accountId ? r : { ...r, userId: undefined }))
}

router.get('/', async (req, res) => {
  const rows = await toPartyRows(await db.collection(PARTIES).find())
  res.json(redact(rows, req.account?.id, isAdmin(req.account)))
})

router.get('/:id', async (req, res) => {
  const found = await db.collection(PARTIES).findById(String(req.params.id))
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const [row] = await toPartyRows([found])
  res.json(redact([row!], req.account?.id, isAdmin(req.account))[0])
})

router.post('/', async (req, res) => {
  const parsed = await readBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const now = new Date().toISOString()
  // UNCLAIMED: recording that a trainer fills a role does not assert who they
  // are. Only the person claiming it sets `userId`.
  const id = await db.collection(PARTIES).insertOne({
    ...parsed,
    taken: false,
    createdAt: now,
    updatedAt: now,
  })
  const created = await db.collection(PARTIES).findById(id)
  const [row] = await toPartyRows([created!])
  res.status(201).json(row)
})

router.put('/:id', async (req, res) => {
  const id = String(req.params.id)
  const parsed = await readBody(req.body)
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
  const [row] = await toPartyRows([updated!])
  res.json(row)
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
  const [out] = await toPartyRows([fresh!])
  res.json(out)
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
  const [out] = await toPartyRows([fresh!])
  res.json(out)
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
