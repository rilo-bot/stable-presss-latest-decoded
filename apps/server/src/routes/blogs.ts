// ---------------------------------------------------------------------------
// Blogs API.
//
// Two things here differ deliberately from routes/articles.ts, and both are
// fixes for problems that route has rather than stylistic preference:
//
//  1. The list is PAGINATED and PROJECTED, via aggregate(). `articles` does
//     `find()` — which loads every document in the collection — and then
//     filters in JS. A blog carries its whole block list and media pool, so
//     doing that here would ship megabytes to render a page of cards.
//
//  2. Writes carry `baseUpdatedAt` and 409 on a stale save. Two people editing
//     one post with last-write-wins silently destroys work.
//
// Everything the client sends passes through normaliseBlocks/normaliseMedia
// (lib/blog/blocks.ts) before it is stored. See docs/BLOG-SYSTEM-PLAN.md.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../lib/db.js'
import { accountCan } from '../lib/effectiveAccess.js'
import { canAccessNewsroom } from '../lib/rbac.js'
import {
  BLOG_STATUSES,
  blocksUsingMedia,
  deriveExcerpt,
  normaliseBlocks,
  normaliseMedia,
  readingTimeFor,
  type Block,
  type BlogMedia,
  type BlogStatus,
} from '../lib/blog/blocks.js'
import { nextSlugHistory, slugify, uniqueSlug } from '../lib/blog/slug.js'

const router = Router()

type WithMongoId = { _id: string; [key: string]: unknown }
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string }
}

function isBlogStatus(v: unknown): v is BlogStatus {
  return typeof v === 'string' && (BLOG_STATUSES as readonly string[]).includes(v)
}

// ── Visibility ──────────────────────────────────────────────────────────────

/**
 * Is this post visible to the public right now?
 *
 * `publishAt` is resolved HERE, at read time, rather than by a scheduled job.
 * Nothing in this codebase ever flips a dated record to live — articles have
 * had a `scheduled` status and a `scheduledFor` field since the workflow
 * landed and no cron or worker has ever acted on either, so a story parked
 * there stays parked forever. Answering the question on read has no moving
 * parts to forget. See BLOG-SYSTEM-PLAN §7.1.
 */
function isLive(doc: Record<string, unknown>, now = Date.now()): boolean {
  if (doc.status !== 'published') return false
  if (typeof doc.publishAt === 'string' && doc.publishAt) {
    const at = Date.parse(doc.publishAt)
    if (Number.isFinite(at) && at > now) return false
  }
  return true
}

/** May this caller see posts that aren't live? */
function canSeeDrafts(req: { account?: Parameters<typeof accountCan>[0] }): boolean {
  return (
    canAccessNewsroom(req.account) ||
    accountCan(req.account, 'blog.edit_any') ||
    accountCan(req.account, 'blog.create')
  )
}

// ── Field coercion ──────────────────────────────────────────────────────────

function str(v: unknown, max = 1000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}
function optStr(v: unknown, max = 1000): string | undefined {
  const s = str(v, max).trim()
  return s.length > 0 ? s : undefined
}
function strArray(v: unknown, max = 50, itemMax = 80): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  for (const item of v) {
    const s = str(item, itemMax).trim()
    if (s) seen.add(s)
    if (seen.size >= max) break
  }
  return [...seen]
}

interface AuthorInput {
  name?: unknown
  partyId?: unknown
  userId?: unknown
  avatarUrl?: unknown
  bio?: unknown
}

/** "Blog by" — free text, so a pen name works, optionally bound to a Party. */
function normaliseAuthor(v: unknown, fallbackName: string): Record<string, unknown> {
  const raw = (v ?? {}) as AuthorInput
  const author: Record<string, unknown> = {
    name: optStr(raw.name, 120) ?? fallbackName,
  }
  const partyId = optStr(raw.partyId, 64)
  if (partyId) author.partyId = partyId
  const userId = optStr(raw.userId, 64)
  if (userId) author.userId = userId
  const avatarUrl = optStr(raw.avatarUrl, 500_000)
  if (avatarUrl) author.avatarUrl = avatarUrl
  const bio = optStr(raw.bio, 1000)
  if (bio) author.bio = bio
  return author
}

const COVER_TREATMENTS = ['hero-full', 'hero-split', 'inset', 'none'] as const

function normaliseCover(v: unknown, poolIds: Set<string>): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as Record<string, unknown>
  const mediaId = optStr(raw.mediaId, 64)
  if (!mediaId || !poolIds.has(mediaId)) return undefined
  const treatment = (COVER_TREATMENTS as readonly unknown[]).includes(raw.treatment)
    ? (raw.treatment as string)
    : 'hero-full'
  const cover: Record<string, unknown> = { mediaId, treatment }
  if (Array.isArray(raw.focal) && raw.focal.length === 2) {
    const [x, y] = raw.focal
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      cover.focal = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]
    }
  }
  return cover
}

function normaliseSeo(v: unknown, poolIds: Set<string>): Record<string, unknown> {
  const raw = (v ?? {}) as Record<string, unknown>
  const seo: Record<string, unknown> = {}
  const metaTitle = optStr(raw.metaTitle, 200)
  if (metaTitle) seo.metaTitle = metaTitle
  const metaDescription = optStr(raw.metaDescription, 400)
  if (metaDescription) seo.metaDescription = metaDescription
  const ogMediaId = optStr(raw.ogMediaId, 64)
  if (ogMediaId && poolIds.has(ogMediaId)) seo.ogMediaId = ogMediaId
  const canonicalUrl = optStr(raw.canonicalUrl, 500)
  if (canonicalUrl && /^https?:\/\//i.test(canonicalUrl)) seo.canonicalUrl = canonicalUrl
  if (raw.noindex === true) seo.noindex = true
  return seo
}

const TIERS = ['free', 'standard', 'premium'] as const

// ── Shared write path ───────────────────────────────────────────────────────

interface BuiltContent {
  media: BlogMedia[]
  blocks: Block[]
  dropped: number
  fields: Record<string, unknown>
}

/**
 * Build the storable shape from a request body. The media pool is normalised
 * FIRST because every other reference — blocks, cover, thumbnail, OG image —
 * is validated against the ids it produces, so a dangling reference can never
 * reach the database.
 */
function buildContent(body: Record<string, unknown>, fallbackAuthor: string): BuiltContent {
  const media = normaliseMedia(body.media)
  const poolIds = new Set(media.map((m) => m.id))
  const { blocks, dropped } = normaliseBlocks(body.blocks, media)

  const fields: Record<string, unknown> = {
    title: str(body.title, 300).trim(),
    author: normaliseAuthor(body.author, fallbackAuthor),
    tags: strArray(body.tags),
    linkedHorseIds: strArray(body.linkedHorseIds, 50, 64),
    linkedPartyIds: strArray(body.linkedPartyIds, 50, 64),
    seo: normaliseSeo(body.seo, poolIds),
    readingTime: readingTimeFor(blocks),
  }

  const subtitle = optStr(body.subtitle, 300)
  if (subtitle) fields.subtitle = subtitle
  else fields.subtitle = ''

  // An author who clears the excerpt gets one derived rather than an empty card.
  fields.excerpt = optStr(body.excerpt, 500) ?? deriveExcerpt(blocks)

  const category = optStr(body.category, 80)
  fields.category = category ?? ''

  const cover = normaliseCover(body.cover, poolIds)
  if (cover) fields.cover = cover
  else fields.cover = null

  const thumbnailMediaId = optStr(body.thumbnailMediaId, 64)
  fields.thumbnailMediaId = thumbnailMediaId && poolIds.has(thumbnailMediaId) ? thumbnailMediaId : null

  fields.minTier = (TIERS as readonly unknown[]).includes(body.minTier) ? body.minTier : 'free'

  return { media, blocks, dropped, fields }
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/blogs — paginated card list.
 *
 * Returns a PROJECTION (no blocks, no media pool) plus a resolved thumbnail
 * URL, because that is all a card needs and the full documents are large.
 */
router.get('/', async (req, res) => {
  const seeDrafts = canSeeDrafts(req)

  const page = Math.max(1, parseInt(str(req.query.page, 10), 10) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(str(req.query.limit, 10), 10) || 12))
  const skip = (page - 1) * limit

  const match: Record<string, unknown> = { deletedAt: null }

  const status = str(req.query.status, 20)
  if (isBlogStatus(status)) match.status = status
  else if (!seeDrafts) match.status = 'published'

  // Future-dated posts are filtered in the QUERY, not afterwards in JS. Doing it
  // after the $skip/$limit would silently return short pages, and the $count
  // below — which does not see a JS filter — would disagree with the rows,
  // giving the client a wrong total and a "load more" button that lies.
  if (!seeDrafts) {
    match.$and = [{ $or: [{ publishAt: null }, { publishAt: { $lte: new Date().toISOString() } }] }]
  }

  const tag = optStr(req.query.tag, 80)
  if (tag) match.tags = tag
  const category = optStr(req.query.category, 80)
  if (category) match.category = category

  const q = optStr(req.query.q, 120)
  if (q) {
    // Escaped so a user searching "C++" or "(2026)" doesn't send an invalid
    // regex — or a catastrophically backtracking one — into the database.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rx = { $regex: safe, $options: 'i' }
    match.$or = [{ title: rx }, { subtitle: rx }, { excerpt: rx }, { 'author.name': rx }]
  }

  const sortField = str(req.query.sort, 20) === 'updated' ? 'updatedAt' : 'publishedAt'

  try {
    const rows = await db.collection('blogs').aggregate([
      { $match: match },
      // Drafts have no publishedAt; fall back so they sort sensibly rather than
      // clustering at the end of every staff listing.
      { $addFields: { _sortAt: { $ifNull: [`$${sortField}`, '$updatedAt'] } } },
      { $sort: { _sortAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          slug: 1, title: 1, subtitle: 1, excerpt: 1, author: 1, category: 1, tags: 1,
          status: 1, publishedAt: 1, publishAt: 1, readingTime: 1, updatedAt: 1, createdAt: 1,
          createdByUserId: 1, thumbnailMediaId: 1, cover: 1,
          // Only the pool entries a card could need, so the projection stays small.
          media: {
            $filter: {
              input: { $ifNull: ['$media', []] },
              as: 'm',
              cond: { $in: ['$$m.id', [{ $ifNull: ['$thumbnailMediaId', ''] }, { $ifNull: ['$cover.mediaId', ''] }]] },
            },
          },
        },
      },
    ])

    // Visibility was decided in the $match above, so this only shapes the rows.
    // `live` still travels because a staff listing shows both and the card needs
    // to say which is which.
    const now = Date.now()
    const items = rows.map((doc) => {
      const pool = Array.isArray(doc.media) ? (doc.media as BlogMedia[]) : []
      const thumb =
        pool.find((m) => m.id === doc.thumbnailMediaId) ??
        pool.find((m) => m.id === doc.cover?.mediaId)
      const { media, cover, thumbnailMediaId, _sortAt, ...rest } = doc
      return {
        ...project(rest as WithMongoId),
        thumbnailUrl: thumb?.url,
        thumbnailAlt: thumb?.alt ?? '',
        live: isLive(doc, now),
      }
    })

    const total = await db.collection('blogs').aggregate([{ $match: match }, { $count: 'n' }])
    res.json({
      items,
      page,
      limit,
      total: total[0]?.n ?? 0,
      hasMore: skip + items.length < (total[0]?.n ?? 0),
    })
  } catch (err) {
    console.error('[blogs] list failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Could not load blog posts.' })
  }
})

/**
 * GET /api/blogs/:idOrSlug — one full post.
 *
 * Resolves a retired slug to the current one so links already in the wild keep
 * working, rather than 404-ing the moment a published post is retitled.
 */
router.get('/:idOrSlug', async (req, res) => {
  const key = req.params.idOrSlug
  const seeDrafts = canSeeDrafts(req)

  let doc = await db.collection('blogs').findById(key)
  if (!doc) {
    const bySlug = await db.collection('blogs').find({ slug: key })
    doc = bySlug[0] ?? null
  }
  if (!doc) {
    const byHistory = await db.collection('blogs').find({ slugHistory: key })
    const moved = byHistory[0]
    if (moved) {
      res.status(301).json({ movedTo: moved.slug, id: moved._id })
      return
    }
  }

  if (!doc || (!seeDrafts && !isLive(doc))) {
    // An unpublished post is "not found" to the public, not "forbidden" —
    // a 403 would confirm that a post with that slug exists.
    res.status(404).json({ error: 'Not found' })
    return
  }

  res.json({ ...project(doc), live: isLive(doc) })
})

/** POST /api/blogs — create. */
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const account = req.account!

  const title = str(body.title, 300).trim()
  if (!title) {
    res.status(400).json({ error: 'A title is required.' })
    return
  }

  const built = buildContent(body, account.displayName)
  const now = new Date().toISOString()
  const slug = await uniqueSlug(optStr(body.slug, 120) ?? title)

  // Creating straight into `published` needs the publish permission — otherwise
  // "new post, status: published" walks straight past the gate. Exactly the hole
  // that let a contributor self-publish a story before the workflow was enforced.
  let status: BlogStatus = 'draft'
  if (isBlogStatus(body.status) && body.status === 'published') {
    if (!accountCan(account, 'blog.publish')) {
      res.status(403).json({ error: 'You cannot publish blog posts.' })
      return
    }
    status = 'published'
  }

  const doc: Record<string, unknown> = {
    ...built.fields,
    slug,
    slugHistory: [],
    blocks: built.blocks,
    media: built.media,
    status,
    publishedAt: status === 'published' ? now : null,
    publishAt: null,
    createdAt: now,
    updatedAt: now,
    createdByUserId: account.id,
  }

  try {
    const id = await db.collection('blogs').insertOne(doc)
    const created = await db.collection('blogs').findById(id)
    if (!created) {
      res.status(500).json({ error: 'Could not create the post.' })
      return
    }
    res.status(201).json({ ...project(created), droppedBlocks: built.dropped })
  } catch (err) {
    // The unique partial index is the real guard against a slug race; this
    // only happens when two creates land in the same instant.
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: 'That slug was just taken — try saving again.' })
      return
    }
    console.error('[blogs] create failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Could not create the post.' })
  }
})

/** PUT /api/blogs/:id — full save. */
router.put('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const account = req.account!

  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  // Optimistic concurrency. Without it, two editors on one post silently
  // overwrite each other and the loser has no idea their work is gone.
  // Omitting baseUpdatedAt skips the check, so a deliberate force-save is still
  // possible — the composer sends it on every autosave.
  const base = optStr(body.baseUpdatedAt, 40)
  if (base && found.updatedAt && base !== found.updatedAt) {
    res.status(409).json({
      error: 'Someone else saved this post while you were editing. Reload to get their changes.',
      currentUpdatedAt: found.updatedAt,
    })
    return
  }

  const title = str(body.title, 300).trim()
  if (!title) {
    res.status(400).json({ error: 'A title is required.' })
    return
  }

  const built = buildContent(body, account.displayName)
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { ...built.fields, blocks: built.blocks, media: built.media, updatedAt: now }

  // ── Slug ──
  // A published post's slug is its public identity, so a change is recorded in
  // slugHistory and the old one keeps resolving.
  const wantedSlug = optStr(body.slug, 120)
  if (wantedSlug && slugify(wantedSlug) !== found.slug) {
    const next = await uniqueSlug(wantedSlug, req.params.id)
    update.slug = next
    update.slugHistory = nextSlugHistory(found.slugHistory, found.slug, next, !!found.publishedAt)
  }

  // ── Status ──
  // Publishing through PUT is allowed but still gated; the dedicated /publish
  // endpoint exists for the common case.
  if (isBlogStatus(body.status) && body.status !== found.status) {
    if (!accountCan(account, 'blog.publish')) {
      res.status(403).json({
        error: body.status === 'published' ? 'You cannot publish blog posts.' : 'You cannot unpublish blog posts.',
      })
      return
    }
    update.status = body.status
    if (body.status === 'published' && !found.publishedAt) update.publishedAt = now
  }

  try {
    await db.collection('blogs').updateOne(req.params.id, update)
    const updated = await db.collection('blogs').findById(req.params.id)
    if (!updated) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ...project(updated), droppedBlocks: built.dropped })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: 'That slug is already taken.' })
      return
    }
    console.error('[blogs] update failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Could not save the post.' })
  }
})

/** POST /api/blogs/:id/publish — { published: boolean }. */
router.post('/:id/publish', async (req, res) => {
  const account = req.account!
  if (!accountCan(account, 'blog.publish')) {
    res.status(403).json({ error: 'You cannot publish blog posts.' })
    return
  }

  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const published = (req.body ?? {}).published !== false
  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: published ? 'published' : 'draft',
    updatedAt: now,
  }
  // publishedAt records the FIRST time it went live and is never rewritten —
  // an unpublish/republish cycle must not silently re-date the post and jump it
  // back to the top of the index.
  if (published && !found.publishedAt) update.publishedAt = now

  await db.collection('blogs').updateOne(req.params.id, update)
  const updated = await db.collection('blogs').findById(req.params.id)
  res.json(updated ? { ...project(updated), live: isLive(updated) } : { success: true })
})

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

  const { blocks } = normaliseBlocks(found.blocks, pool)
  const usedBy = blocksUsingMedia(blocks, asset.id)
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

  const update: Record<string, unknown> = {
    media: nextPool,
    blocks: nextBlocks,
    readingTime: readingTimeFor(nextBlocks),
    updatedAt: new Date().toISOString(),
  }
  // Clear the slots that pointed at it, or they'd render nothing.
  if (found.thumbnailMediaId === asset.id) update.thumbnailMediaId = null
  if (found.cover?.mediaId === asset.id) update.cover = null
  if (found.seo?.ogMediaId === asset.id) {
    update.seo = { ...(found.seo as Record<string, unknown>), ogMediaId: undefined }
  }

  await db.collection('blogs').updateOne(req.params.id, update)
  res.json({ success: true, removedBlocks: usedBy.length })
})

/** DELETE /api/blogs/:id — soft delete, matching every other collection. */
router.delete('/:id', async (req, res) => {
  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const now = new Date().toISOString()
  await db.collection('blogs').updateOne(req.params.id, { deletedAt: now, updatedAt: now })
  res.json({ success: true })
})

export default router