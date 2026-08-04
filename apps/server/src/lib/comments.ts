// ---------------------------------------------------------------------------
// Reader comments — the ONE mechanism, for every surface that has a scale.
//
// This is the only file in the server that touches the `comments` collection or
// the `commentReports` collection. Same rule, and same reason, as
// lib/reactions.ts: the sentiment on a comment and the reaction on the bar above
// it are THE SAME OPINION on THE SAME seven-point scale, so a second
// implementation that disagreed by one rule would put two different answers to
// one question on one page.
//
// See docs/COMMENTS-PLAN.md. Five decisions are baked in here:
//
//  • SIGNED-IN ONLY, exactly like reactions. `userId` is the identity, so an
//    author can edit and delete their own words, moderation is traceable to a
//    person, and spam is a rate limit rather than a research project. There is
//    still no cookie layer anywhere in this server (no cookie-parser, no
//    res.cookie, no req.cookies), so an anonymous commenter would mean a signed
//    device cookie plus SameSite/Secure/CORS-credentials work across the split
//    web/api origins — a cross-cutting change for one feature.
//
//  • COMMENTABLE = REACTABLE. The visibility gate is `assertReactable()` from
//    lib/reactions.ts, called unchanged. Not a copy of its rules — the function
//    itself. You may comment on what you may react to, which is what you may
//    read, and on nothing else.
//
//  • THE CATEGORY IS NOT STORED. A comment stores an `emoji` key from the shared
//    scale and NOTHING else about its sentiment. Positive / Neutral / Negative is
//    derived on read through the scale's own `side` field, in the one file that
//    owns the scale (apps/web/src/types/reactions.ts). A stored category would be
//    a second opinion axis that could disagree with the emoji sitting next to it
//    — the precise failure the shared scale module was extracted to prevent.
//
//  • POSTING A COMMENT SETS YOUR REACTION. The emoji you attach to a comment is
//    an opinion about the same piece the bar above asks about, so it goes through
//    `setReaction()` too. Without that, a reader who says "🤩 loved it" in words
//    is absent from every reaction figure, and the page shows them two controls
//    for one question that disagree with each other.
//
//  • THE AUTHOR'S NAME IS NOT DENORMALISED. Only `userId` is stored; display
//    names are resolved on read in ONE batched query. A snapshot copied onto
//    every row is what produced the drift `resolveAccount` exists to avoid — a
//    reader who corrects their name would keep the old one on every comment they
//    have ever left. `authorNameAtPost` is written as a FALLBACK only, read when
//    the account itself is gone.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import {
  assertReactable,
  isEmojiKey,
  setReaction,
  type ReactionEmojiKey,
  type ReactionTargetType,
} from './reactions.js'
import { canAccessNewsroom } from './rbac.js'
import type { AccountUser } from './effectiveAccess.js'

const COLLECTION = 'comments'
const REPORTS = 'commentReports'

// ── The vocabulary ──────────────────────────────────────────────────────────

/**
 * Where a comment can be left: the three things a reader FINISHES.
 *
 * A deliberate SUBSET of `REACTION_TARGET_TYPES` — `blogPart` is absent. A part
 * carries its own reaction bar because rating a section takes one tap and says
 * something the post-level score cannot. A comment thread per section is a
 * different proposition: eight threads on one post fragments the conversation
 * into eight rooms with nobody in them, and the reader who wants to discuss the
 * piece has to choose where. Parts are still RATED separately; the discussion is
 * about the piece.
 *
 * The values that ARE here are spelled the same as the reaction types on purpose,
 * so `assertReactable` takes them without translation.
 */
export const COMMENT_TARGET_TYPES = ['blog', 'story', 'bulletin'] as const
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number]

export function isCommentTargetType(v: unknown): v is CommentTargetType {
  return typeof v === 'string' && (COMMENT_TARGET_TYPES as readonly string[]).includes(v)
}

/**
 * The longest comment we will store.
 *
 * Enforced HERE as well as in the textarea's `maxLength`, because a client-side
 * limit is a courtesy and not a constraint — the endpoint is public to any
 * signed-in account with a fetch call. Long enough for a considered paragraph or
 * three; short enough that one comment cannot be an article.
 */
export const MAX_COMMENT_LENGTH = 2000

/** The shortest. Guards the empty submit and the single stray keystroke. */
export const MIN_COMMENT_LENGTH = 2

/**
 * How long an author may edit their own comment.
 *
 * A window rather than forever: a reply, a reaction or a quote elsewhere can be
 * built on what a comment said, and silently rewriting it hours later changes a
 * conversation other people have already had. Fifteen minutes covers the typo and
 * the sentence that came out wrong, which is what editing is for. Every edit is
 * marked `editedAt` and the UI says so, so even inside the window nothing is
 * changed invisibly.
 */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/** One page of a thread. Capped so a long thread cannot be asked for whole. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface CommentView {
  id: string
  targetType: CommentTargetType
  targetId: string
  body: string
  /**
   * The scale key this comment was written under. The CATEGORY (positive /
   * neutral / negative) is derived from it by the client and is never stored —
   * see the header note.
   */
  emoji: ReactionEmojiKey
  authorId: string
  authorName: string
  /** Written by an account that can reach the newsroom. Not rendered publicly. */
  isStaff: boolean
  createdAt: string
  /** Present only when the author has changed it, so the UI can say "edited". */
  editedAt?: string
  /** True for the caller's own comment — what makes Edit and Delete appear. */
  mine: boolean
  /** The caller has already reported this one; the control says so and disables. */
  reportedByMe: boolean
  /**
   * A comment an editor has hidden. `body` is EMPTY on a hidden comment for
   * everyone except a moderator — see `viewOf`.
   */
  hidden: boolean
  /** Reports outstanding. Only ever sent to a moderator. */
  reportCount?: number
  /** Only sent to a moderator. */
  hiddenReason?: string
}

export interface CommentPage {
  items: CommentView[]
  /** Every visible comment on the target, not just this page. */
  total: number
  /** Pass as `before` to get the next page. Absent when the thread is exhausted. */
  nextCursor?: string
}

/** Failure carries the status the route should send, so the route stays thin. */
export type CommentResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404; error: string }

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * One page of a thread, newest first.
 *
 * Newest first because a comment thread on a published piece is a feed and not a
 * transcript: the reader arriving a week later wants what was said last, and the
 * alternative puts the oldest comment permanently at the top of every page view.
 *
 * Cursor pagination on `createdAt` rather than `$skip`: a comment posted while
 * someone is reading page 1 shifts every offset by one, so a `$skip`-paged thread
 * shows the same comment twice and hides another. The cursor is an instant, so it
 * does not move.
 *
 * `total` is counted, never derived from `items.length` — the count is the whole
 * thread and the items are one page of it.
 */
export async function listComments(opts: {
  targetType: CommentTargetType
  targetId: string
  limit?: number
  /** ISO instant; return comments strictly older than this. */
  before?: string
  /** The caller, for `mine` / `reportedByMe` and the moderator's extra fields. */
  account?: AccountUser
  /** A moderator sees hidden comments' text and the report counts. */
  canModerate?: boolean
}): Promise<CommentPage> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)

  const query: Record<string, unknown> = {
    targetType: opts.targetType,
    targetId: opts.targetId,
  }
  if (opts.before) query.createdAt = { $lt: opts.before }

  // `find()` folds in `deletedAt: null`, so a comment its author deleted is gone
  // from here without a second filter. A HIDDEN comment is not deleted and is
  // still returned — it becomes a tombstone in `viewOf`, because a comment that
  // simply vanishes reads as a bug to the people who were reading it, and as
  // censorship to the person who wrote it.
  const [rows, total] = await Promise.all([
    db.collection(COLLECTION).aggregate([
      { $match: { ...query, deletedAt: null } },
      { $sort: { createdAt: -1 } },
      { $limit: limit + 1 }, // one extra: its existence IS the next cursor
    ]),
    db.collection(COLLECTION).count({ targetType: opts.targetType, targetId: opts.targetId }),
  ])

  const page = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? String(page[page.length - 1]?.createdAt ?? '') : undefined

  const [names, reported] = await Promise.all([
    resolveAuthorNames(page),
    reportedByCaller(page, opts.account?.id),
  ])

  return {
    items: page.map((row) =>
      viewOf(row, {
        names,
        reported,
        viewerId: opts.account?.id,
        canModerate: !!opts.canModerate,
      }),
    ),
    total,
    ...(nextCursor ? { nextCursor } : {}),
  }
}

/**
 * Current display names for the authors of these comments, in ONE query.
 *
 * Resolved rather than denormalised (see the header note). Distinct ids only, so
 * a thread of forty comments by three people costs three lookups' worth of work
 * inside one `$in`.
 */
async function resolveAuthorNames(rows: Record<string, unknown>[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => String(r.userId ?? '')).filter(Boolean))]
  if (!ids.length) return new Map()

  // `find` on the wrapper cannot express `_id: { $in: [...] }` across this
  // codebase's two id shapes (ObjectId and plain string), so the lookups go
  // through findById — which handles both — concurrently.
  const found = await Promise.all(ids.map(async (id) => [id, await db.collection('users').findById(id)] as const))
  const out = new Map<string, string>()
  for (const [id, doc] of found) {
    const name = typeof doc?.displayName === 'string' ? doc.displayName.trim() : ''
    if (name) out.set(id, name)
  }
  return out
}

/** Which of these comments the caller has already reported, in one query. */
async function reportedByCaller(
  rows: Record<string, unknown>[],
  userId: string | undefined,
): Promise<Set<string>> {
  if (!userId || !rows.length) return new Set()
  const ids = rows.map((r) => String(r._id))
  const mine = await db.collection(REPORTS).find({ userId, commentId: { $in: ids } })
  return new Set(mine.map((r) => String(r.commentId)))
}

/**
 * One stored row as one reader sees it.
 *
 * A hidden comment keeps its ROW and loses its TEXT. The alternatives are both
 * worse: deleting it makes a thread other people were reading change shape with
 * no explanation, and leaving the text up makes hiding it pointless. The
 * tombstone says an editor removed it and by what name it was signed, so the
 * conversation around it still parses.
 *
 * A moderator sees the text, because deciding whether to restore something you
 * cannot read is not a decision.
 */
function viewOf(
  row: Record<string, unknown>,
  ctx: { names: Map<string, string>; reported: Set<string>; viewerId?: string; canModerate: boolean },
): CommentView {
  const id = String(row._id)
  const authorId = String(row.userId ?? '')
  const hidden = row.status === 'hidden'
  const emoji = isEmojiKey(row.emoji) ? row.emoji : 'undecided'

  // The live name, then the snapshot taken at post time, then a neutral label.
  // The middle step only fires when the account itself has gone — a comment must
  // still be attributable to something, and "Anonymous" on a signed-in-only
  // system would be a lie about how it was written.
  const authorName =
    ctx.names.get(authorId) ||
    (typeof row.authorNameAtPost === 'string' && row.authorNameAtPost.trim()) ||
    'A former member'

  const view: CommentView = {
    id,
    targetType: row.targetType as CommentTargetType,
    targetId: String(row.targetId ?? ''),
    body: hidden && !ctx.canModerate ? '' : String(row.body ?? ''),
    emoji,
    authorId,
    authorName,
    isStaff: row.isStaff === true,
    createdAt: String(row.createdAt ?? ''),
    mine: !!ctx.viewerId && authorId === ctx.viewerId,
    reportedByMe: ctx.reported.has(id),
    hidden,
  }
  if (typeof row.editedAt === 'string' && row.editedAt) view.editedAt = row.editedAt
  if (ctx.canModerate) {
    view.reportCount = typeof row.reportCount === 'number' ? row.reportCount : 0
    if (typeof row.hiddenReason === 'string' && row.hiddenReason) view.hiddenReason = row.hiddenReason
  }
  return view
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Normalise a submitted body, or say why it cannot be stored.
 *
 * Collapses runs of blank lines to a single break: a comment padded with twenty
 * newlines is a comment that takes over the page it is on, and the reader who did
 * it is not usually trying to. Everything else about the text is left alone —
 * this is a length and whitespace check, not a content filter.
 */
export function normaliseBody(raw: unknown): CommentResult<string> {
  if (typeof raw !== 'string') {
    return { ok: false, status: 400, error: 'Write something first.' }
  }
  const body = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (body.length < MIN_COMMENT_LENGTH) {
    return { ok: false, status: 400, error: 'Write something first.' }
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `That is longer than a comment can be — ${MAX_COMMENT_LENGTH} characters at most.`,
    }
  }
  return { ok: true, value: body }
}

/**
 * Post a comment, and record the reaction that came with it.
 *
 * The gate is `assertReactable` — the same function the reaction endpoint calls,
 * not a copy of its rules. So "commentable" cannot drift from "reactable", and
 * neither can drift from "readable": a draft, a pulled edition and a paywalled
 * piece a free reader cannot see all refuse a comment for the same reason and
 * with the same status code.
 *
 * The reaction is written FIRST and its failure is fatal to the comment. That
 * ordering is deliberate: a comment stamped 🤩 whose reaction never landed is a
 * page showing one reader two different answers to one question, and the reader
 * cannot tell which one counted.
 */
export async function postComment(input: {
  targetType: CommentTargetType
  targetId: string
  body: unknown
  emoji: unknown
  account: AccountUser
}): Promise<CommentResult<CommentView>> {
  const body = normaliseBody(input.body)
  if (!body.ok) return body

  if (!isEmojiKey(input.emoji)) {
    return { ok: false, status: 400, error: 'Pick where you stand on the scale first.' }
  }

  const gate = await assertReactable(
    input.targetType as ReactionTargetType,
    input.targetId,
    undefined,
    input.account,
  )
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.error }

  // Same act, same store, same one-per-reader unique index as tapping the bar.
  await setReaction({
    targetType: input.targetType as ReactionTargetType,
    targetId: input.targetId,
    emoji: input.emoji,
    account: input.account,
  })

  const now = new Date().toISOString()
  const id = await db.collection(COLLECTION).insertOne({
    targetType: input.targetType,
    targetId: input.targetId,
    userId: input.account.id,
    // FALLBACK ONLY — read when the account is gone. See the header note.
    authorNameAtPost: input.account.displayName ?? '',
    body: body.value,
    emoji: input.emoji,
    // Stamped from the ACCOUNT, never the client, exactly as reactions do it.
    isStaff: canAccessNewsroom(input.account),
    status: 'visible',
    reportCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })

  const fresh = await db.collection(COLLECTION).findById(id)
  if (!fresh) return { ok: false, status: 404, error: 'That comment did not save.' }
  return {
    ok: true,
    value: viewOf(fresh, {
      names: new Map([[input.account.id, input.account.displayName ?? '']]),
      reported: new Set(),
      viewerId: input.account.id,
      canModerate: false,
    }),
  }
}

/**
 * Edit your own comment, inside the window.
 *
 * Ownership is checked against the STORED `userId` rather than anything the
 * client sent, and a comment an editor has hidden is not editable — rewriting a
 * removed comment to something acceptable would launder it back into a thread
 * without a moderator seeing the new text.
 *
 * The emoji may change too, and changing it moves the reader's reaction with it:
 * the two are one opinion, so an edit that revised the verdict but left the
 * reaction alone would recreate the disagreement `postComment` exists to prevent.
 */
export async function editComment(input: {
  id: string
  body: unknown
  emoji: unknown
  account: AccountUser
}): Promise<CommentResult<CommentView>> {
  const row = await db.collection(COLLECTION).findById(input.id)
  if (!row) return { ok: false, status: 404, error: 'That comment is no longer there.' }
  if (String(row.userId ?? '') !== input.account.id) {
    return { ok: false, status: 403, error: 'You can only edit your own comment.' }
  }
  if (row.status === 'hidden') {
    return { ok: false, status: 403, error: 'An editor has removed this comment. It cannot be edited.' }
  }

  const posted = Date.parse(String(row.createdAt ?? ''))
  if (!Number.isFinite(posted) || Date.now() - posted > EDIT_WINDOW_MS) {
    return {
      ok: false,
      status: 403,
      error: 'The edit window has closed. You can delete it and post again.',
    }
  }

  const body = normaliseBody(input.body)
  if (!body.ok) return body
  if (!isEmojiKey(input.emoji)) {
    return { ok: false, status: 400, error: 'Pick where you stand on the scale.' }
  }

  const now = new Date().toISOString()
  await db.collection(COLLECTION).updateOne(input.id, {
    body: body.value,
    emoji: input.emoji,
    editedAt: now,
    updatedAt: now,
  })

  // The target is re-gated on the way through `setReaction`'s own caller in
  // postComment but not here — an edit is not a new opinion on a new thing, and a
  // piece that went premium or was pulled since must still let its author fix a
  // typo. The reaction upsert touches only this reader's own row.
  if (isCommentTargetType(row.targetType)) {
    await setReaction({
      targetType: row.targetType as ReactionTargetType,
      targetId: String(row.targetId ?? ''),
      emoji: input.emoji,
      account: input.account,
    })
  }

  const fresh = await db.collection(COLLECTION).findById(input.id)
  if (!fresh) return { ok: false, status: 404, error: 'That comment is no longer there.' }
  return {
    ok: true,
    value: viewOf(fresh, {
      names: new Map([[input.account.id, input.account.displayName ?? '']]),
      reported: new Set(),
      viewerId: input.account.id,
      canModerate: false,
    }),
  }
}

/**
 * Delete a comment. The author's own, or anyone's with `comments.moderate`.
 *
 * A SOFT delete — `deletedAt`, through the normal wrapper — unlike a reaction,
 * which hard-deletes because a unique index would otherwise collide with its own
 * tombstone. Comments carry no unique key and are not a single field a reader can
 * re-enter with one click: what someone wrote is worth keeping recoverable, and a
 * moderation decision that turns out to be wrong should be reversible by someone
 * with database access even after the tombstone drops out of every read.
 *
 * The reader's REACTION survives a deleted comment. They said how the piece sat
 * with them; withdrawing the words is not withdrawing the verdict, and the bar
 * still shows their pick where they can take it back themselves.
 */
export async function deleteComment(input: {
  id: string
  account: AccountUser
  canModerate: boolean
}): Promise<CommentResult<{ id: string }>> {
  const row = await db.collection(COLLECTION).findById(input.id)
  if (!row) return { ok: false, status: 404, error: 'That comment is no longer there.' }

  const mine = String(row.userId ?? '') === input.account.id
  if (!mine && !input.canModerate) {
    return { ok: false, status: 403, error: 'You can only delete your own comment.' }
  }

  await db.collection(COLLECTION).deleteOne(input.id)
  return { ok: true, value: { id: input.id } }
}

// ── Reporting ───────────────────────────────────────────────────────────────

/**
 * Report a comment. One per reader per comment.
 *
 * Uniqueness is a database index, not a check above it (see ensureIndexes) — the
 * count is the number of PEOPLE who objected, and a reader who taps twice must
 * not be two of them. `reportCount` on the comment is the denormalised total the
 * moderation queue sorts on; the rows are what make it auditable.
 *
 * Reporting does NOT hide anything. A hide is an editorial decision made by a
 * person with `comments.moderate`; an auto-hide at N reports is a brigade's
 * delete button.
 */
export async function reportComment(input: {
  id: string
  reason: unknown
  account: AccountUser
}): Promise<CommentResult<{ reported: true }>> {
  const row = await db.collection(COLLECTION).findById(input.id)
  if (!row) return { ok: false, status: 404, error: 'That comment is no longer there.' }
  if (String(row.userId ?? '') === input.account.id) {
    return { ok: false, status: 400, error: 'That is your own comment.' }
  }

  const existing = await db.collection(REPORTS).find({ commentId: input.id, userId: input.account.id })
  // Idempotent: a second tap answers the same way rather than erroring, because
  // the reader's intent ("this should be looked at") is already recorded.
  if (existing.length > 0) return { ok: true, value: { reported: true } }

  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : ''
  const now = new Date().toISOString()
  await db.collection(REPORTS).insertOne({
    commentId: input.id,
    userId: input.account.id,
    reason,
    createdAt: now,
    deletedAt: null,
  })

  // Recounted from the rows rather than $inc'd, so the number on the comment can
  // never drift from the reports that justify it.
  const count = await db.collection(REPORTS).count({ commentId: input.id })
  await db.collection(COLLECTION).updateOne(input.id, { reportCount: count, updatedAt: now })

  return { ok: true, value: { reported: true } }
}

// ── Moderation ──────────────────────────────────────────────────────────────

/**
 * Hide or restore a comment. `comments.moderate` only; enforced in the route.
 *
 * `hiddenReason` is required on a hide and is for the moderation log, not the
 * reader — the public tombstone says an editor removed it and nothing more.
 * Publishing the reason would make every removal an argument in the thread it was
 * removed from.
 */
export async function setCommentHidden(input: {
  id: string
  hidden: boolean
  reason: unknown
  account: AccountUser
}): Promise<CommentResult<CommentView>> {
  const row = await db.collection(COLLECTION).findById(input.id)
  if (!row) return { ok: false, status: 404, error: 'That comment is no longer there.' }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: input.hidden ? 'hidden' : 'visible',
    updatedAt: now,
  }
  if (input.hidden) {
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : ''
    if (!reason) return { ok: false, status: 400, error: 'Say why it is being removed.' }
    update.hiddenReason = reason
    update.hiddenBy = input.account.id
    update.hiddenAt = now
  } else {
    // Cleared on restore rather than left behind: a visible comment carrying the
    // reason it was once removed would show that reason to the next moderator as
    // though it were live.
    update.hiddenReason = ''
    update.hiddenBy = ''
    update.hiddenAt = ''
  }

  await db.collection(COLLECTION).updateOne(input.id, update)
  const fresh = await db.collection(COLLECTION).findById(input.id)
  if (!fresh) return { ok: false, status: 404, error: 'That comment is no longer there.' }

  const names = await resolveAuthorNames([fresh])
  return {
    ok: true,
    value: viewOf(fresh, { names, reported: new Set(), viewerId: input.account.id, canModerate: true }),
  }
}

export interface ModerationRow extends CommentView {
  /** What the comment is on, so a moderator can read it in context. */
  targetTitle: string
  /** Where to go and read it. Empty when the piece can no longer be resolved. */
  targetHref: string
}

export interface ModerationQueue {
  items: ModerationRow[]
  /** Reported-and-still-visible comments, whatever filter is applied. */
  reportedCount: number
  hiddenCount: number
  /** How many rows the cap left out. 0 in every normal case. */
  truncated: number
}

/** A moderator cannot be shown an unbounded thread of every comment ever left. */
const MAX_QUEUE_ROWS = 200

/**
 * The moderation queue.
 *
 * `reported` — visible comments somebody objected to, most-reported first. This
 * is the working list; it is what the screen opens on.
 * `hidden`  — what has already been removed, so a decision can be reversed.
 * `all`     — the whole feed, newest first, for looking something up.
 *
 * Titles are resolved per row through the same point lookups the reactions report
 * uses, and a comment whose piece has been deleted is still LISTED — unlike the
 * analytics leaderboard, which drops those. The reason they differ: a leaderboard
 * row nobody can click is noise, but a reported comment nobody can action is a
 * report that never gets answered.
 */
export async function moderationQueue(opts: {
  filter: 'reported' | 'hidden' | 'all'
  account: AccountUser
}): Promise<ModerationQueue> {
  const base: Record<string, unknown> = { deletedAt: null }
  const match =
    opts.filter === 'reported'
      ? { ...base, status: { $ne: 'hidden' }, reportCount: { $gt: 0 } }
      : opts.filter === 'hidden'
        ? { ...base, status: 'hidden' }
        : base

  const sort: Record<string, 1 | -1> =
    opts.filter === 'reported' ? { reportCount: -1, createdAt: -1 } : { createdAt: -1 }

  const [rows, reportedCount, hiddenCount] = await Promise.all([
    db.collection(COLLECTION).aggregate([
      { $match: match },
      { $sort: sort },
      { $limit: MAX_QUEUE_ROWS + 1 },
    ]),
    db.collection(COLLECTION).count({ status: { $ne: 'hidden' }, reportCount: { $gt: 0 } }),
    db.collection(COLLECTION).count({ status: 'hidden' }),
  ])

  const kept = rows.slice(0, MAX_QUEUE_ROWS)
  const names = await resolveAuthorNames(kept)
  const targets = await describeTargets(kept)

  return {
    items: kept.map((row) => {
      const view = viewOf(row, {
        names,
        reported: new Set(),
        viewerId: opts.account.id,
        canModerate: true,
      })
      const target = targets.get(`${String(row.targetType)}:${String(row.targetId)}`)
      return {
        ...view,
        targetTitle: target?.title ?? 'A piece that has since been deleted',
        targetHref: target?.href ?? '',
      }
    }),
    reportedCount,
    hiddenCount,
    truncated: rows.length > MAX_QUEUE_ROWS ? 1 : 0,
  }
}

/**
 * Title and public URL for each distinct target in a set of comments.
 *
 * One lookup per distinct piece, not per comment: a thread of thirty comments on
 * one post would otherwise fetch that post thirty times.
 */
async function describeTargets(
  rows: Record<string, unknown>[],
): Promise<Map<string, { title: string; href: string }>> {
  const keys = new Map<string, { type: string; id: string }>()
  for (const row of rows) {
    const type = String(row.targetType ?? '')
    const id = String(row.targetId ?? '')
    if (type && id) keys.set(`${type}:${id}`, { type, id })
  }

  const out = new Map<string, { title: string; href: string }>()
  await Promise.all(
    [...keys.entries()].map(async ([key, { type, id }]) => {
      if (type === 'story') {
        const doc = await db.collection('articles').findById(id)
        if (doc) out.set(key, { title: str(doc.title) || 'Untitled story', href: `/articles/${id}` })
        return
      }
      if (type === 'blog') {
        const doc = await db.collection('blogs').findById(id)
        // The public URL of a post is its SLUG, not its id — /blog/:id resolves
        // to nothing, so a row linked by id would send a moderator to a 404.
        if (doc) {
          const slug = str(doc.slug)
          out.set(key, {
            title: str(doc.title) || 'Untitled post',
            href: slug ? `/blog/${slug}` : '',
          })
        }
        return
      }
      const issue = await db.collection('issues').findById(id)
      if (issue) out.set(key, { title: str(issue.title) || 'Untitled edition', href: `/bulletins/${id}` })
    }),
  )
  return out
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
