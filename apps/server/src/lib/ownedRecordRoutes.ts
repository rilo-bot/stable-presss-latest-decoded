// ---------------------------------------------------------------------------
// CRUD + sharing for an owned production-system collection.
//
// A factory rather than two hand-written routers: Media Records and Racing Data
// have identical access rules, and the previous copies had already drifted (one
// validated `title`, the other `horse_id`, and NEITHER filtered or stamped an
// owner). One implementation means one place to get the rules right.
//
// Access rules live in lib/recordSharing.ts. See that file for the model.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from './db.js'
import { attachAccount } from './auth.js'
import { withIdentityDefaults } from './identity.js'
import { identityCan } from './effectiveAccess.js'
import {
  canManageRecord,
  canViewRecord,
  ownershipFields,
  sharesOf,
  viewerFlags,
  visibleRecords,
  type OwnedRecord,
  type RecordShare,
} from './recordSharing.js'

type WithMongoId = { _id: string; [key: string]: unknown }

export interface OwnedRecordOptions {
  /** Mongo collection name. */
  collection: string
  /** Singular noun for error copy, e.g. 'media record'. */
  label: string
  /** Field that must be present on create. */
  requiredField: string
}

export function ownedRecordRouter(opts: OwnedRecordOptions): Router {
  const { collection, label, requiredField } = opts
  const router = Router()

  /** Strip _id → id and attach the caller's capability flags. */
  const project = (doc: WithMongoId, account: Express.Request['account']) => {
    const { _id, ...rest } = doc
    const record = rest as OwnedRecord
    return {
      id: _id,
      ...rest,
      sharedWith: sharesOf(record),
      ...viewerFlags(account, record),
    }
  }

  // Every route needs to know WHO is asking — visibility is per-caller. These
  // used to be unauthenticated on GET and returned the whole collection.
  router.use(attachAccount)

  // ── List — only what the caller may see ────────────────────────────────────
  router.get('/', async (req, res) => {
    const items = (await db.collection(collection).find()) as WithMongoId[]
    res.json(visibleRecords(req.account, items as OwnedRecord[]).map((d) => project(d as WithMongoId, req.account)))
  })

  // ── Read one ───────────────────────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    const found = await db.collection(collection).findById(String(req.params.id))
    // 404 rather than 403 for a record they may not see — telling someone a
    // record exists but isn't theirs leaks the record's existence.
    if (!found || !canViewRecord(req.account, found)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(project(found, req.account))
  })

  // ── Create — stamps the creator ────────────────────────────────────────────
  router.post('/', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (!body[requiredField]) {
      res.status(400).json({ error: `${requiredField} is required` })
      return
    }
    const now = new Date().toISOString()
    const doc: Record<string, unknown> = {
      ...body,
      ...ownershipFields(req.account!),
      createdAt: now,
      updatedAt: now,
    }
    delete doc.id
    const id = await db.collection(collection).insertOne(doc)
    const created = await db.collection(collection).findById(id)
    if (!created) {
      res.status(500).json({ error: 'failed to create' })
      return
    }
    res.status(201).json(project(created, req.account))
  })

  // ── Update — creator or admin ──────────────────────────────────────────────
  router.put('/:id', async (req, res) => {
    const id = String(req.params.id)
    const found = await db.collection(collection).findById(id)
    if (!found || !canViewRecord(req.account, found)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!canManageRecord(req.account, found)) {
      res.status(403).json({ error: `This ${label} was shared with you for reference. You cannot edit it.` })
      return
    }
    const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date().toISOString() }
    // Ownership is server-owned. A client that echoes the record back on save
    // must not be able to reassign it or widen who can see it.
    delete updateData.id
    delete updateData.createdByUserId
    delete updateData.createdByName
    delete updateData.sharedWith
    delete updateData.mine
    delete updateData.canEdit
    delete updateData.canShare
    delete updateData.sharedWithMe
    await db.collection(collection).updateOne(id, updateData)
    const updated = await db.collection(collection).findById(id)
    res.json(project(updated!, req.account))
  })

  // ── Delete — creator or admin ──────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    const id = String(req.params.id)
    const found = await db.collection(collection).findById(id)
    if (!found || !canViewRecord(req.account, found)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!canManageRecord(req.account, found)) {
      res.status(403).json({ error: `Only the person who created this ${label} can delete it.` })
      return
    }
    await db.collection(collection).deleteOne(id)
    res.json({ ok: true })
  })

  // ── Share with a colleague ─────────────────────────────────────────────────
  router.post('/:id/share', async (req, res) => {
    const id = String(req.params.id)
    const found = await db.collection(collection).findById(id)
    if (!found || !canViewRecord(req.account, found)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!canManageRecord(req.account, found)) {
      res.status(403).json({ error: `Only the person who created this ${label} can share it.` })
      return
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'A valid email is required.' })
      return
    }
    const target = (await db.collection('users').find({ email }))[0]
    if (!target) {
      res.status(404).json({ error: 'No account with that email.' })
      return
    }
    const identity = withIdentityDefaults({ id: target._id, ...target })
    // Sharing cannot be a back door into the newsroom — the recipient must
    // already be allowed in.
    if (!(await identityCan(identity, 'newsroom.access'))) {
      res.status(400).json({ error: 'That person does not have newsroom access, so they cannot be added.' })
      return
    }
    if (identity.id === found.createdByUserId) {
      res.status(409).json({ error: `They created this ${label}.` })
      return
    }
    if (sharesOf(found).some((s) => s.userId === identity.id)) {
      res.status(409).json({ error: 'Already shared with that person.' })
      return
    }

    const share: RecordShare = {
      userId: identity.id,
      email: identity.email,
      displayName: identity.displayName,
      sharedAt: new Date().toISOString(),
      sharedBy: req.account!.id,
    }
    // $addToSet on the array, not a read-modify-write of the whole record —
    // two people sharing at once must not drop one of the entries.
    await db.collection(collection).addToSet(id, 'sharedWith', share)
    const fresh = await db.collection(collection).findById(id)
    res.status(201).json(project(fresh!, req.account))
  })

  // ── Revoke a share ─────────────────────────────────────────────────────────
  router.delete('/:id/share/:userId', async (req, res) => {
    const id = String(req.params.id)
    const found = await db.collection(collection).findById(id)
    if (!found || !canViewRecord(req.account, found)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!canManageRecord(req.account, found)) {
      res.status(403).json({ error: `Only the person who created this ${label} can change sharing.` })
      return
    }
    const userId = String(req.params.userId)
    const remaining = sharesOf(found).filter((s) => s.userId !== userId)
    await db.collection(collection).updateOne(id, { sharedWith: remaining })
    const fresh = await db.collection(collection).findById(id)
    res.json(project(fresh!, req.account))
  })

  return router
}
