import { Router } from 'express'
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'

type WithMongoId = { _id: string; [key: string]: unknown }
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string }
}

const router = Router()

// Every notification route is personal — must be signed in.
router.use(attachAccount)

// ── List the current user's notifications (newest first) ──
router.get('/', async (req, res) => {
  const account = req.account!
  const items = await db.collection('notifications').find({ recipientUserId: account.id })
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  res.json(items.map(project))
})

// ── Mark one as read (own only) ──
router.post('/:id/read', async (req, res) => {
  const account = req.account!
  const doc = await db.collection('notifications').findById(req.params.id)
  if (!doc || doc.recipientUserId !== account.id) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await db.collection('notifications').updateOne(req.params.id, { read: true })
  res.json({ ok: true })
})

// ── Mark all the user's notifications read ──
router.post('/read-all', async (req, res) => {
  const account = req.account!
  const items = await db.collection('notifications').find({ recipientUserId: account.id })
  await Promise.all(
    items.filter((n) => !n.read).map((n) => db.collection('notifications').updateOne(n._id, { read: true })),
  )
  res.json({ ok: true })
})

export default router
