// People in the racing world - the profile behind a party edge.
//
// Public to read: this is how someone finds the person who represents them
// before claiming their edge in the register. Writes are gated by the mount.

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { PARTIES, PEOPLE } from '../../lib/collections.js'
import { projectPerson, readPersonBody } from '../../lib/people.js'

const router = Router()

router.get('/', async (_req, res) => {
  const rows = await db.collection(PEOPLE).find()
  res.json(
    rows
      .map(projectPerson)
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
})

router.get('/:id', async (req, res) => {
  const found = await db.collection(PEOPLE).findById(String(req.params.id))
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(projectPerson(found))
})

router.post('/', async (req, res) => {
  const parsed = readPersonBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const now = new Date().toISOString()
  const id = await db.collection(PEOPLE).insertOne({ ...parsed, createdAt: now, updatedAt: now })
  const created = await db.collection(PEOPLE).findById(id)
  res.status(201).json(projectPerson(created!))
})

router.put('/:id', async (req, res) => {
  const parsed = readPersonBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const id = String(req.params.id)
  const ok = await db.collection(PEOPLE).updateOne(id, {
    ...parsed,
    updatedAt: new Date().toISOString(),
  })
  if (!ok) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const updated = await db.collection(PEOPLE).findById(id)
  res.json(projectPerson(updated!))
})

// Refused while edges still point here, rather than leaving nameless rows in
// the register. Release or delete the edges first.
router.delete('/:id', async (req, res) => {
  const id = String(req.params.id)
  const edges = await db.collection(PARTIES).count({ personId: id })
  if (edges > 0) {
    res.status(409).json({
      error: `This person still holds ${edges} entr${edges === 1 ? 'y' : 'ies'} in the register. Remove those first.`,
    })
    return
  }
  const ok = await db.collection(PEOPLE).deleteOne(id)
  if (!ok) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({ success: true })
})

export default router
