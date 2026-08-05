// ---------------------------------------------------------------------------
// Comments API — thin. Every rule lives in lib/comments.ts.
//
// Shaped exactly like routes/reactions.ts, and for the same reason: a comment is
// the same act on a story, a post and an edition, so a router per content type
// would be three places to forget the paywall check. `targetType` is a path
// segment, validated against the shared list before anything else runs.
//
// Self-gated: the thread is PUBLIC to read (anyone may see what readers said, and
// a signed-in caller additionally learns which comments are theirs and which they
// have reported), while every write requires an account. See
// docs/COMMENTS-PLAN.md §3 for why the identity is an account rather than a
// device — the short version is that this server has no cookie layer at all.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import type { Request, Response } from 'express'
import { attachAccount, attachAccountOptional } from '../../lib/auth.js'
import { accountCan } from '../../lib/effectiveAccess.js'
import { rateLimit } from '../../lib/rateLimit.js'
import {
  deleteComment,
  editComment,
  isCommentTargetType,
  listComments,
  moderationQueue,
  postComment,
  reportComment,
  setCommentHidden,
} from '../../lib/comments.js'

const router = Router();

/**
 * Resolve the account BEFORE the rate limiter, so the limit is per ACCOUNT.
 *
 * This ordering is load-bearing and was found by testing, not by reading.
 * `rateLimit` keys on `req.account?.id` and falls back to `req.ip` — and its own
 * doc comment says the account key exists "so one user can't be blocked by
 * another behind the same proxy". Mounted above the auth middleware, `req.account`
 * is always undefined when the limiter runs, so every caller sharing an IP shares
 * one bucket and that promise is silently broken. Three test accounts on one
 * machine hit 429 after four writes between them.
 *
 * `attachAccountOptional` here costs nothing extra: the write routes below still
 * carry `attachAccount`, which is idempotent (it returns early when `req.account`
 * is already set) and still 401s when there is no valid token. GETs pay the same
 * lookup they always did.
 *
 * NOTE: `routes/reactions.ts` has the identical shape and therefore the identical
 * behaviour — its 60/minute is per IP, not per account. Not changed here; flagged
 * in docs/COMMENTS-PLAN.md §11.
 */
router.use(attachAccountOptional)

/**
 * 20 writes a minute per account.
 *
 * Tighter than reactions' 60, because a reaction is a tap a reader legitimately
 * changes their mind about several times while a comment is a paragraph somebody
 * typed. Twenty covers a lively thread and an author fixing two typos; it does not
 * cover a script. GETs are not counted — `rateLimit` skips them.
 */
router.use(rateLimit('comments', 20, 60_000))

/** Express 4 does not await handlers — a throw would HANG the request, not 500. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      console.error('[comments]', err instanceof Error ? err.message : err)
      if (!res.headersSent) res.status(500).json({ error: 'Could not do that just now.' })
    })
  }
}

/** Whoever is asking may work the queue. Never inferred from the client. */
const canModerate = (req: Request): boolean => accountCan(req.account, 'comments.moderate')

// ── Moderation ──────────────────────────────────────────────────────────────
//
// Mounted BEFORE the parameterised routes below. `/moderation` would otherwise be
// swallowed by `GET /:targetType/:targetId`-shaped patterns — Express matches in
// registration order, and a literal path registered after a parameter never runs.

/**
 * GET /api/comments/moderation?filter=reported|hidden|all
 *
 * The whole queue in one response — reported, hidden and their counts — because
 * the screen shows all three at once and three requests to draw one page is three
 * chances for it to half-load.
 */
router.get('/moderation', attachAccount, handle(async (req, res) => {
  if (!canModerate(req)) {
    res.status(403).json({ error: 'You do not have access to comment moderation.' })
    return
  }
  const raw = String(req.query.filter ?? 'reported')
  const filter = raw === 'hidden' || raw === 'all' ? raw : 'reported'
  res.json({ filter, ...(await moderationQueue({ filter, account: req.account! })) })
}))

/** POST /api/comments/:id/hide — remove a comment from public view. */
router.post('/:id/hide', attachAccount, handle(async (req, res) => {
  if (!canModerate(req)) {
    res.status(403).json({ error: 'You do not have access to comment moderation.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  const result = await setCommentHidden({
    id: String(req.params.id ?? ''),
    hidden: true,
    reason: body.reason,
    account: req.account!,
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json(result.value)
}))

/** POST /api/comments/:id/restore — put a hidden comment back. */
router.post('/:id/restore', attachAccount, handle(async (req, res) => {
  if (!canModerate(req)) {
    res.status(403).json({ error: 'You do not have access to comment moderation.' })
    return
  }
  const result = await setCommentHidden({
    id: String(req.params.id ?? ''),
    hidden: false,
    reason: '',
    account: req.account!,
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json(result.value)
}))

/**
 * POST /api/comments/:id/report — flag a comment for an editor to look at.
 *
 * One per reader per comment, enforced by a unique index. Reporting hides nothing:
 * an auto-hide at N reports is a brigade's delete button.
 */
router.post('/:id/report', attachAccount, handle(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const result = await reportComment({
    id: String(req.params.id ?? ''),
    reason: body.reason,
    account: req.account!,
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json(result.value)
}))

// ── The thread ──────────────────────────────────────────────────────────────

/**
 * GET /api/comments?targetType=blog&targetId=X&limit=20&before=<iso>
 *
 * Public. `before` is the cursor from the previous page — an instant rather than
 * an offset, so a comment posted while someone is reading page 1 cannot make page
 * 2 repeat a row and skip another.
 */
// No `attachAccountOptional` here — the router-level one above already ran, and
// unlike `attachAccount` it is NOT idempotent, so listing it again would cost a
// second user lookup on every thread read.
router.get('/', handle(async (req, res) => {
  const targetType = req.query.targetType
  const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : ''
  if (!isCommentTargetType(targetType) || !targetId) {
    res.status(400).json({ error: 'targetType and targetId are required.' })
    return
  }

  const limitRaw = Number(req.query.limit)
  const page = await listComments({
    targetType,
    targetId,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined,
    before: typeof req.query.before === 'string' && req.query.before ? req.query.before : undefined,
    account: req.account,
    canModerate: canModerate(req),
  })
  res.json(page)
}))

/**
 * POST /api/comments/:targetType/:targetId — leave a comment.
 *
 * The body carries `emoji`, which is REQUIRED: the scale is where the comment
 * says whether it is for or against, and a thread of unplaced opinions is what
 * this feature exists instead of. The same pick is recorded as the reader's
 * reaction, through the same lib the bar uses.
 */
router.post('/:targetType/:targetId', attachAccount, handle(async (req, res) => {
  const targetType = String(req.params.targetType ?? '')
  const targetId = String(req.params.targetId ?? '')
  if (!isCommentTargetType(targetType) || !targetId) {
    res.status(400).json({ error: 'Unknown comment target.' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const result = await postComment({
    targetType,
    targetId,
    body: body.body,
    emoji: body.emoji,
    account: req.account!,
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.status(201).json(result.value)
}))

/**
 * PATCH /api/comments/:id — edit your own, inside the window.
 *
 * PATCH rather than PUT: the request replaces the two fields an author owns (the
 * text and the pick) and touches nothing else about the row — not its author, not
 * its timestamps, not its moderation state.
 */
router.patch('/:id', attachAccount, handle(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const result = await editComment({
    id: String(req.params.id ?? ''),
    body: body.body,
    emoji: body.emoji,
    account: req.account!,
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json(result.value)
}))

/**
 * DELETE /api/comments/:id — your own, or anyone's with `comments.moderate`.
 *
 * A moderator deleting rather than hiding is the stronger action and is offered
 * separately in the UI: hiding leaves a tombstone so the thread still parses,
 * deleting removes the comment from it entirely.
 */
router.delete('/:id', attachAccount, handle(async (req, res) => {
  const result = await deleteComment({
    id: String(req.params.id ?? ''),
    account: req.account!,
    canModerate: canModerate(req),
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json(result.value)
}))

export default router
