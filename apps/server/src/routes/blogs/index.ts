// ---------------------------------------------------------------------------
// Blogs API — 10 endpoints, assembled from three route groups.
//
//   reads.ts   GET  /                        paginated card list
//              GET  /:idOrSlug               one full post (301s a retired slug)
//   media.ts   POST /:id/media               register an uploaded asset
//              POST /:id/media/stock         source a stock photo
//              PATCH  /:id/media/:mediaId    edit alt / caption / credit
//              DELETE /:id/media/:mediaId    remove an asset (+ its blocks)
//   write.ts   POST   /                      create
//              PUT    /:id                   full save (optimistic concurrency)
//              POST   /:id/publish           publish / unpublish
//              DELETE /:id                   soft delete
//
// Supporting modules, none of which register a route:
//   helpers.ts     id projection + the field coercers
//   visibility.ts  isLive / canSeeDrafts / gateForTier (the paywall)
//   content.ts     request body → storable post shape (normalisation)
//
// GROUP ORDER. Registered most-specific-first, so a broad pattern can never
// shadow a narrower one. It happens not to matter today — Express matches a
// route against the WHOLE remaining path, so `DELETE /:id` (one segment) cannot
// swallow `DELETE /:id/media/:mediaId` (three) whichever order they are in — but
// relying on that would make adding, say, `DELETE /:id/*` a silent trap.
//
// Everything a client sends passes through normaliseBlocks/normaliseMedia
// (lib/blog/blocks.ts) before it is stored. See docs/BLOG-SYSTEM-PLAN.md.
//
// Auth is NOT here: the mount in routes/index.ts wraps this router in
// `blogsWriteGate`, which attaches the account optionally on GET and enforces
// the `blog.*` permission axis on writes. See lib/rbac.ts.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import readsRouter from './reads.js'
import mediaRouter from './media.js'
import writeRouter from './write.js'

const router = Router()

router.use(readsRouter)
router.use(mediaRouter)
router.use(writeRouter)

export default router
