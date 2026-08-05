// ---------------------------------------------------------------------------
// A post's media pool: register an upload, source a stock photo, edit a
// caption, remove an asset.
//
// GATING NOTE. Every route here is a write with MORE THAN ONE path segment, and
// `blogsWriteGate` (lib/rbac.ts) reads that as "editing this post" rather than
// "creating one" — so they run through `blogEditGate` and need edit rights on
// this specific post, never `blog.create`. Adding a route here with a single
// segment would change which permission guards it.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../../lib/db.js'
import {
  blocksUsingMedia,
  normaliseBlocks,
  normaliseMedia,
  normaliseParts,
  partsBlocks,
  readingTimeFor,
} from '../../lib/blog/blocks.js'
import { getStockPhoto, isStockConfigured, storeStockPhoto } from '../../lib/stock.js'
import { storage } from '../../lib/storage.js'
import { optStr, str } from './helpers.js'

const router = Router()

/**
 * POST /api/blogs/:id/media — register an uploaded asset into the pool.
 *
 * The bytes have already gone to S3 via /api/uploads; this records the result.
 */
router.post('/:id/media', async (req, res) => {
  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const incoming = normaliseMedia([{ ...body, uploadedByUserId: req.account!.id }])
  if (incoming.length === 0) {
    res.status(400).json({ error: 'A media url is required.' })
    return
  }
  const asset = incoming[0]!

  const pool = normaliseMedia(found.media)

  // Guard the 16 MB document ceiling. With S3 configured a pool entry is a short
  // URL and this never fires; without it, lib/upload.ts inlines images as base64
  // data URLs and a dozen photos will breach the limit — surfacing as an opaque
  // driver error on save, long after the upload appeared to succeed.
  const inlineBytes = [...pool, asset]
    .filter((m) => m.url.startsWith('data:'))
    .reduce((sum, m) => sum + m.url.length, 0)
  if (inlineBytes > 6_000_000) {
    res.status(413).json({
      error:
        'This post is at the inline-image limit because object storage is not configured on this server. ' +
        'Set up S3 to attach more images.',
      configured: false,
    })
    return
  }

  const now = new Date().toISOString()
  await db.collection('blogs').updateOne(req.params.id, {
    media: [...pool, asset],
    updatedAt: now,
  })
  res.status(201).json({ media: asset })
})

/**
 * POST /api/blogs/:id/media/stock — source a stock photo into the pool.
 *
 * Takes a PROVIDER PHOTO ID, never a URL. That is what makes "never invent an
 * image URL" enforceable rather than a request politely made of a language model:
 * a fabricated id fails to resolve here and nothing is stored, whereas a
 * fabricated URL would become a pool entry pointing at anything at all.
 *
 * The bytes are downloaded and put in our own bucket rather than hotlinked, and
 * the photographer's credit travels into the asset — the renderer already shows a
 * `credit` under an image.
 */
router.post('/:id/media/stock', async (req, res) => {
  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  if (!isStockConfigured()) {
    // Said plainly, because the alternative is the caller quietly substituting
    // something else and the author believing a search happened.
    res.status(503).json({
      error: 'Stock photo search is not set up on this server. Attach a photo directly instead.',
      configured: false,
    })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const photoId = optStr(body.photoId, 12)
  if (!photoId) {
    res.status(400).json({ error: 'A photoId is required.' })
    return
  }

  const candidate = await getStockPhoto(photoId)
  if (!candidate) {
    res.status(404).json({ error: 'That photo id does not exist. Search again and use an id from the results.' })
    return
  }

  const stored = await storeStockPhoto(candidate, `public/blogs/${req.params.id}`)
  if (!stored) {
    res.status(502).json({ error: 'The photo could not be downloaded. Please try another.' })
    return
  }

  const pool = normaliseMedia(found.media)
  const asset = normaliseMedia([
    {
      url: stored.url,
      key: stored.key,
      kind: 'image',
      filename: 'stock.jpg',
      contentType: stored.contentType,
      bytes: stored.bytes,
      width: stored.width,
      height: stored.height,
      // The provider's own description of the photo IS alt text — a description of
      // the image written from the image. Better than an empty alt, and better
      // than one the model guessed without seeing it.
      alt: optStr(body.alt, 500) ?? stored.alt,
      credit: stored.attribution.author ? `Photo: ${stored.attribution.author}` : undefined,
      uploadedByUserId: req.account!.id,
    },
  ])[0]!

  const now = new Date().toISOString()
  await db.collection('blogs').updateOne(req.params.id, {
    media: [...pool, asset],
    updatedAt: now,
  })
  res.status(201).json({ media: asset, attribution: stored.attribution })
})

/** PATCH /api/blogs/:id/media/:mediaId — edit alt / caption / credit. */
router.patch('/:id/media/:mediaId', async (req, res) => {
  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const pool = normaliseMedia(found.media)
  const index = pool.findIndex((m) => m.id === req.params.mediaId)
  if (index < 0) {
    res.status(404).json({ error: 'That asset is not in this post.' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const asset = pool[index]!
  if (body.alt !== undefined) asset.alt = str(body.alt, 500)
  if (body.caption !== undefined) {
    const caption = optStr(body.caption, 1000)
    if (caption) asset.caption = caption
    else delete asset.caption
  }
  if (body.credit !== undefined) {
    const credit = optStr(body.credit, 300)
    if (credit) asset.credit = credit
    else delete asset.credit
  }

  await db.collection('blogs').updateOne(req.params.id, {
    media: pool,
    updatedAt: new Date().toISOString(),
  })
  res.json({ media: asset })
})

/**
 * DELETE /api/blogs/:id/media/:mediaId
 *
 * Refuses while blocks still reference the asset, and names them, unless
 * ?force=true — in which case those blocks go too, since an image block whose
 * asset is gone renders as an invisible hole.
 */
router.delete('/:id/media/:mediaId', async (req, res) => {
  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const pool = normaliseMedia(found.media)
  const asset = pool.find((m) => m.id === req.params.mediaId)
  if (!asset) {
    res.status(404).json({ error: 'That asset is not in this post.' })
    return
  }

  // Parts are searched as well as the body: an image placed inside a part is a
  // use of the asset, and counting only body blocks would report "used in 0
  // places", delete it, and leave a hole in a part the author never looked at.
  const { blocks } = normaliseBlocks(found.blocks, pool)
  const { parts } = normaliseParts(found.parts, pool)
  const usedBy = [...blocksUsingMedia(blocks, asset.id), ...blocksUsingMedia(partsBlocks(parts), asset.id)]
  const force = str(req.query.force, 10) === 'true'

  if (usedBy.length > 0 && !force) {
    res.status(409).json({
      error: `That image is used in ${usedBy.length} place${usedBy.length === 1 ? '' : 's'} in the post.`,
      blockIds: usedBy,
    })
    return
  }

  const nextPool = pool.filter((m) => m.id !== asset.id)
  // Re-normalising against the reduced pool is what drops the now-dangling
  // blocks — the validator already refuses references it cannot resolve, so the
  // cleanup is the same code path as any other write rather than a second one.
  const { blocks: nextBlocks } = normaliseBlocks(found.blocks, nextPool)
  const { parts: nextParts } = normaliseParts(found.parts, nextPool)

  const update: Record<string, unknown> = {
    media: nextPool,
    blocks: nextBlocks,
    parts: nextParts,
    readingTime: readingTimeFor([...nextBlocks, ...partsBlocks(nextParts)]),
    updatedAt: new Date().toISOString(),
  }
  // Clear the slots that pointed at it, or they'd render nothing.
  if (found.thumbnailMediaId === asset.id) update.thumbnailMediaId = null
  if (found.cover?.mediaId === asset.id) update.cover = null
  if (found.seo?.ogMediaId === asset.id) {
    update.seo = { ...(found.seo as Record<string, unknown>), ogMediaId: undefined }
  }

  await db.collection('blogs').updateOne(req.params.id, update)

  // The record is updated; now drop the bytes. This is the one place where an
  // asset is EXPLICITLY discarded by a person, which is what makes deleting safe
  // here and not on a post delete: db.deleteOne is a soft delete, so a "deleted"
  // post is still recoverable and must keep its images.
  //
  // Best-effort by design — storage.deleteObject never throws, and a failed delete
  // leaves an orphan rather than failing a removal the author already saw succeed.
  // Prefer the stored key; fall back to recovering it from the URL for assets
  // saved before keys were recorded.
  if (storage.isConfigured()) {
    if (asset.key) await storage.deleteObject(asset.key)
    else await storage.deleteObjectByUrl(asset.url)
  }

  res.json({ success: true, removedBlocks: usedBy.length })
})

export default router
