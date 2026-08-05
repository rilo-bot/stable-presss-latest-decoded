// ---------------------------------------------------------------------------
// Blog reads: the paginated card list, and one full post.
//
// The list is PAGINATED and PROJECTED via aggregate(). routes/articles does
// `find()` — loading every document in the collection — and then filters in JS.
// A blog carries its whole block list and media pool, so doing that here would
// ship megabytes to render a page of cards.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../../lib/db.js'
import type { BlogMedia } from '../../lib/blog/blocks.js'
import { isBlogStatus, optStr, project, str, type WithMongoId } from './helpers.js'
import { canSeeDrafts, gateForTier, isLive } from './visibility.js'

const router = Router()

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

  // Staff and anyone who can edit posts read the whole document — the composer
  // loads through this same endpoint and needs every block. Everyone else is
  // subject to the post's own tier.
  const full = { ...project(doc), live: isLive(doc) }
  res.json(seeDrafts ? full : gateForTier(full, req.account?.subscriptionTier))
})

export default router
