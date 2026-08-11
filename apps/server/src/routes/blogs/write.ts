// ---------------------------------------------------------------------------
// Blog writes: create, full save, publish/unpublish, delete.
//
// Two rules run through all of them:
//
//  1. Writes carry `baseUpdatedAt` and 409 on a stale save. Two people editing
//     one post with last-write-wins silently destroys work.
//  2. `blogs.publish` is checked on EVERY path that can set status to published —
//     POST, PUT and /publish alike — because any one of them left ungated is a
//     way around the other two.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../../lib/db.js'
import { accountCan } from '../../lib/effectiveAccess.js'
import {
  normaliseParts,
  partsBlocks,
  readingTimeFor,
  type BlogPart,
  type BlogStatus,
} from '../../lib/blog/blocks.js'
import { nextSlugHistory, slugify, uniqueSlug } from '../../lib/blog/slug.js'
import { buildContent } from './content.js'
import { isBlogStatus, optStr, project, str } from './helpers.js'
import { isLive } from './visibility.js'

const router = Router()

/** POST /api/blogs — create. */
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const account = req.account!

  // A blank title is fine on a DRAFT — plenty of posts start as a paragraph with
  // the headline decided last, and forcing a placeholder like "Untitled post"
  // into the data means it has to be noticed and deleted later. The title is
  // required to PUBLISH instead, which is where it actually matters.
  const title = str(body.title, 300).trim()

  const built = buildContent(body, account.name)
  const now = new Date().toISOString()

  // A slug supplied at creation is a deliberate choice and locks; one derived
  // from the title stays free to follow later title edits (see the PUT handler).
  const givenSlug = optStr(body.slug, 120)
  const slug = await uniqueSlug(givenSlug ?? title)

  // Creating straight into `published` needs the publish permission — otherwise
  // "new post, status: published" walks straight past the gate. Exactly the hole
  // that let a contributor self-publish a story before the workflow was enforced.
  let status: BlogStatus = 'draft'
  if (isBlogStatus(body.status) && body.status === 'published') {
    if (!accountCan(account, 'blogs.publish')) {
      res.status(403).json({ error: 'You cannot publish blog posts.' })
      return
    }
    status = 'published'
  }

  const doc: Record<string, unknown> = {
    ...built.fields,
    slug,
    slugHistory: [],
    slugLocked: !!givenSlug,
    blocks: built.blocks,
    parts: built.parts ?? [],
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

  // Blank is allowed here for the same reason it is on create — the gate is at
  // publish time.
  const title = str(body.title, 300).trim()

  const built = buildContent(body, account.name)
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { ...built.fields, blocks: built.blocks, media: built.media, updatedAt: now }

  // What this save is working with, parts-wise: the ones it sent, or the ones
  // already stored when it said nothing about them. Both the reading time and
  // the "is this post empty" gate below have to reason about the post as it will
  // BE, not just the half of it this request happened to carry.
  const storedParts = normaliseParts(found.parts, built.media).parts
  const effectiveParts = built.parts ?? storedParts
  if (!built.parts) {
    update.readingTime = readingTimeFor([...built.blocks, ...partsBlocks(storedParts)])
  }

  // ── Slug ──
  //
  // A published post's slug is its public identity, so a change is recorded in
  // slugHistory and the old one keeps resolving.
  //
  // An UNPUBLISHED post's slug follows its title. Without that, a post created
  // as "Untitled post" keeps that slug however many times it is retitled, and
  // every draft ends up at /blog/untitled-post-N — the composer sends the slug
  // it was given, so "unchanged" is indistinguishable from "intended" unless we
  // decide it here.
  //
  // `slugLocked` is what stops that from overriding a deliberate choice: the
  // first time a caller sends a slug that differs from the stored one, the slug
  // is theirs and the title stops driving it.
  const wantedSlug = optStr(body.slug, 120)
  const explicitChange = !!wantedSlug && slugify(wantedSlug) !== found.slug
  const locked = found.slugLocked === true || explicitChange

  let nextSlug: string | undefined
  if (explicitChange) {
    nextSlug = await uniqueSlug(wantedSlug, req.params.id)
    update.slugLocked = true
  } else if (!locked && !found.publishedAt) {
    const fromTitle = slugify(title)
    // Only when it actually differs, or every autosave would re-run uniqueSlug.
    if (fromTitle && fromTitle !== found.slug) {
      nextSlug = await uniqueSlug(title, req.params.id)
    }
  }

  if (nextSlug && nextSlug !== found.slug) {
    update.slug = nextSlug
    update.slugHistory = nextSlugHistory(found.slugHistory, found.slug, nextSlug, !!found.publishedAt)
  }

  // ── Status ──
  // Publishing through PUT is allowed but still gated; the dedicated /publish
  // endpoint exists for the common case.
  if (isBlogStatus(body.status) && body.status !== found.status) {
    if (!accountCan(account, 'blogs.publish')) {
      res.status(403).json({
        error: body.status === 'published' ? 'You cannot publish blog posts.' : 'You cannot unpublish blog posts.',
      })
      return
    }
    // The same title/content gate as POST /:id/publish. Without it this route is
    // simply a way around it.
    if (body.status === 'published') {
      if (!title) {
        res.status(400).json({ error: 'Give the post a title before publishing it.' })
        return
      }
      // A post whose writing lives entirely in its parts is not empty.
      if (built.blocks.length === 0 && partsBlocks(effectiveParts).length === 0) {
        res.status(400).json({ error: 'This post is empty — add something before publishing.' })
        return
      }
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
  if (!accountCan(account, 'blogs.publish')) {
    res.status(403).json({ error: 'You cannot publish blog posts.' })
    return
  }

  const found = await db.collection('blogs').findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const published = (req.body ?? {}).published !== false

  // A title is required to go LIVE, not to exist. A published post with no
  // headline has nothing to show on a card, in a share, or as a page title, and
  // its slug would be a bare "post-N".
  if (published) {
    const title = typeof found.title === 'string' ? found.title.trim() : ''
    if (!title) {
      res.status(400).json({ error: 'Give the post a title before publishing it.' })
      return
    }
    const hasContent =
      (Array.isArray(found.blocks) && found.blocks.length > 0) ||
      partsBlocks(found.parts as BlogPart[] | undefined).length > 0
    if (!hasContent) {
      res.status(400).json({ error: 'This post is empty — add something before publishing.' })
      return
    }
  }

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
