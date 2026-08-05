// ---------------------------------------------------------------------------
// Instant — capture-to-draft.
//   POST /api/agent/instant/vision?filename=  — raw image bytes → { note }
//   POST /api/agent/instant/draft             — notes + brief   → { draft }
//
// There is deliberately NO save endpoint here. A saved draft goes out through
// the existing POST /api/articles and POST /api/blogs, which is where the
// workflow gate (lib/workflow.ts) and the block validator (lib/blog/blocks.ts)
// live. A bespoke save path would sidestep both — the exact hole that let a
// contributor self-publish before the workflow was enforced.
//
// Gating: STAFF ONLY, on every route. This is the most expensive model surface in
// the product (up to seven calls per draft) and there is no token metering
// anywhere in the codebase yet, so an anonymous caller must not be able to reach
// it. `attachAccountOptional` — which several older agent routes use — would do
// exactly that.
// ---------------------------------------------------------------------------

import { Router, raw } from 'express'
import { attachAccount } from '../../lib/auth.js'
import { isAdmin } from '../../lib/rbac.js'
import { rateLimit } from '../../lib/rateLimit.js'
import { isAgentConfigured } from '../../lib/agent/provider.js'
import {
  MAX_PHOTOS,
  describePhoto,
  generateDraft,
  hasSomethingToWorkWith,
  isTransient,
  normaliseInputs,
  type InstantMode,
} from '../../lib/agent/instantDraft.js'

const router = Router()

const MB = 1024 * 1024
// Matches the image cap in routes/uploads.ts, so a photo that stores will read.
const IMAGE_MAX_BYTES = 15 * MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

router.use(attachAccount)
router.use((req, res, next) => {
  if (!isAdmin(req.account)) {
    res.status(403).json({ error: 'Staff access required.' })
    return
  }
  next()
})

// 40 model-backed calls per 5 minutes per account. One draft with the maximum six
// photos costs seven, so this is roughly five full drafts — generous for a person
// on a phone, closed to a loop.
router.use(rateLimit('agent-instant', 40, 5 * 60_000))

function guardConfigured(res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (isAgentConfigured()) return true
  res.status(503).json({
    error: 'Instant is resting — OPENROUTER_API_KEY is not configured on the server.',
  })
  return false
}

/**
 * POST /api/agent/instant/vision?filename=
 * Body: raw image bytes. Content-Type header = the image's type.
 *
 * One photo per call, bytes straight from the browser — the same proxied shape as
 * /api/uploads/direct and /api/agent/editor/ingest. Per-photo rather than one
 * batched call so a single unreadable photo costs that photo and not the draft,
 * and so each request body stays bounded.
 */
router.post('/vision', raw({ type: () => true, limit: '16mb' }), async (req, res) => {
  if (!guardConfigured(res)) return

  const contentType = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()
  if (!IMAGE_TYPES.has(contentType)) {
    res.status(415).json({ error: `I can read photos (JPG, PNG, WebP, GIF) — "${contentType || 'that type'}" isn't one.` })
    return
  }

  const bytes = req.body as Buffer
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    res.status(400).json({ error: 'That photo came through empty — please try again.' })
    return
  }
  if (bytes.length > IMAGE_MAX_BYTES) {
    res.status(413).json({ error: `That photo is too large (max ${IMAGE_MAX_BYTES / MB} MB).` })
    return
  }

  const name = String(req.query.filename ?? 'photo.jpg').slice(0, 200)
  const index = Number(req.query.index ?? 0)
  const total = Number(req.query.total ?? 1)

  try {
    const note = await describePhoto({
      bytes,
      contentType,
      name,
      index: Number.isFinite(index) ? index : 0,
      total: Number.isFinite(total) && total > 0 ? total : 1,
    })
    res.json({ note })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read that photo.'
    // Everything describePhoto throws is transient by construction; a 502 tells
    // the browser to offer a retry rather than blaming the photo.
    res.status(isTransient(err) ? 502 : 500).json({ error: message })
  }
})

/**
 * POST /api/agent/instant/draft
 * Body: { mode, topic?, transcript?, imageNotes[] }
 * → { draft }
 *
 * The draft is NOT persisted. It goes back to the browser for the review step,
 * and only the reviewed version is saved — through the gated create endpoints.
 */
router.post('/draft', async (req, res) => {
  if (!guardConfigured(res)) return

  const body = (req.body ?? {}) as Record<string, unknown>
  const mode: InstantMode = body.mode === 'blog' ? 'blog' : 'story'

  if (Array.isArray(body.imageNotes) && body.imageNotes.length > MAX_PHOTOS) {
    res.status(413).json({ error: `Instant works with up to ${MAX_PHOTOS} photos at a time.` })
    return
  }

  const inputs = normaliseInputs(body)
  if (!hasSomethingToWorkWith(inputs)) {
    res.status(400).json({ error: 'Add a topic, a photo, or a voice note first.' })
    return
  }

  try {
    const draft = await generateDraft(mode, inputs)
    res.json({ draft })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not write that draft.'
    res.status(isTransient(err) ? 502 : 500).json({ error: message })
  }
})

export default router
