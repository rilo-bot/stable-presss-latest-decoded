// ---------------------------------------------------------------------------
// Reactions API — thin. Every rule lives in lib/reactions.ts.
//
// Three endpoints for four surfaces (blogs, blog parts, stories, bulletins),
// because a reaction is the same act everywhere and a route per content type
// would be four places to forget the paywall check. `targetType` is a path
// segment, validated against the shared list before anything else runs.
//
// Self-gated, like /api/partyClaims and /api/notifications: reads attach the
// account OPTIONALLY (anyone may see the counts; only a signed-in caller gets
// `mine` back), writes require one. See docs/REACTIONS-PLAN.md §6 for why the
// identity is an account rather than a device.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import type { Request, Response } from 'express'
import { attachAccount, attachAccountOptional } from '../../lib/auth.js'
import { rateLimit } from '../../lib/rateLimit.js'
import {
  assertReactable,
  clearReaction,
  countsFor,
  isEmojiKey,
  isTargetType,
  setReaction,
} from '../../lib/reactions.js'

const router = Router()

// 60 writes a minute per account. A reader changing their mind a few times is
// normal and must not be punished; a loop hammering the upsert is not.
router.use(rateLimit('reactions', 60, 60_000))

/**
 * Wrap an async handler so a rejected promise becomes a 500 instead of a HANG.
 *
 * Express 4 does not await route handlers, so a throw inside an `async (req,res)`
 * never reaches the error middleware and the response is simply never sent — the
 * client waits until it times out. That is not hypothetical here: an invalid
 * aggregation stage produced exactly this during development, and the symptom
 * was a request that never came back rather than an error anyone could read.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      console.error('[reactions]', err instanceof Error ? err.message : err)
      if (!res.headersSent) res.status(500).json({ error: 'Could not record that just now.' })
    })
  }
}

/**
 * GET /api/reactions?targetType=blog&targetId=X&withParts=1
 *
 * Returns an array — one entry per target — because a blog post asks for itself
 * and all of its parts in a single call. Always includes the requested target
 * even when nothing has been recorded against it, so the bar renders honest
 * zeros rather than a spinner that never resolves.
 */
router.get('/', attachAccountOptional, handle(async (req, res) => {
  const targetType = req.query.targetType
  const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : ''
  if (!isTargetType(targetType) || !targetId) {
    res.status(400).json({ error: 'targetType and targetId are required.' })
    return
  }

  const rows = await countsFor(targetType, targetId, {
    withParts: req.query.withParts === '1' || req.query.withParts === 'true',
    userId: req.account?.id,
  })
  res.json(rows)
}))

/**
 * PUT /api/reactions/:targetType/:targetId — set or change a reaction.
 *
 * PUT rather than POST because one reader has at most one reaction to a thing:
 * sending it twice leaves the same single row, which is exactly what the unique
 * index guarantees underneath.
 */
router.put('/:targetType/:targetId', attachAccount, handle(async (req, res) => {
  const targetType = String(req.params.targetType ?? '')
  const targetId = String(req.params.targetId ?? '')
  if (!isTargetType(targetType) || !targetId) {
    res.status(400).json({ error: 'Unknown reaction target.' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  if (!isEmojiKey(body.emoji)) {
    res.status(400).json({ error: 'Pick one of the seven reactions.' })
    return
  }
  const parentId = typeof body.parentId === 'string' ? body.parentId : undefined

  // Reactable = readable. Re-derived here from the target's own record, never
  // taken on the client's word — this is a write on a public endpoint.
  const gate = await assertReactable(targetType, targetId, parentId, req.account)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error })
    return
  }

  // `gate.parentId` (not the body's) is what gets stored: it is the post the
  // part was actually found on.
  await setReaction({
    targetType,
    targetId,
    parentId: gate.parentId,
    emoji: body.emoji,
    account: req.account!,
  })

  const rows = await countsFor(targetType, targetId, { userId: req.account!.id })
  res.json(rows[0])
}))

/**
 * DELETE /api/reactions/:targetType/:targetId — clear your own reaction.
 *
 * No visibility gate: this only ever removes the caller's own row, and a post
 * that has since been unpublished or gone premium must still let the reader
 * take their reaction back. Returns the counts either way, so a double-click
 * settles on the same answer instead of erroring.
 */
router.delete('/:targetType/:targetId', attachAccount, handle(async (req, res) => {
  const targetType = String(req.params.targetType ?? '')
  const targetId = String(req.params.targetId ?? '')
  if (!isTargetType(targetType) || !targetId) {
    res.status(400).json({ error: 'Unknown reaction target.' })
    return
  }

  await clearReaction(targetType, targetId, req.account!.id)
  const rows = await countsFor(targetType, targetId, { userId: req.account!.id })
  res.json(rows[0])
}))

export default router
