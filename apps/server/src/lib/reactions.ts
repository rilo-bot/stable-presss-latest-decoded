// ---------------------------------------------------------------------------
// Reader reactions — the ONE mechanism, for every surface that has a scale.
//
// This is the only file in the server that touches the `reactions` collection.
// Nothing else may name it, query it, or compute a score from it. The reason is
// the same one that put the seven-point scale in a shared module rather than in
// the two screens that draw it: the staff Emoji Analytics dashboard reads these
// rows, and a second implementation that disagreed by one rule — soft delete,
// the staff filter, what "live" means — would make every number on that screen
// quietly wrong rather than loudly broken.
//
// See docs/REACTIONS-PLAN.md. Three decisions are baked in here:
//
//  • SIGNED-IN ONLY. `userId` is the identity, so one-per-reader is a database
//    constraint rather than a sentence in the UI, and a count is a count of
//    PEOPLE. There is no cookie layer anywhere in this server (no cookie-parser,
//    no res.cookie, no req.cookies), so an anonymous device identity would mean
//    a new dependency plus SameSite/Secure/CORS-credentials work across the
//    split web/api origins — a cross-cutting change for one feature.
//
//  • A READER MAY CHANGE THEIR PICK, freely. `setReaction` is an upsert. A
//    locked-in misclick is worse data than a considered change.
//
//  • THE WEIGHT IS NEVER STORED. Only the emoji key. The scale was re-weighted
//    once before it shipped and may be again; a weight copied onto every row
//    would make all of history wrong that day and force a backfill, where
//    deriving keeps it a config change. Weighting happens on the read side, in
//    the web app's `weightOf()`.
// ---------------------------------------------------------------------------

import { db, rawCollection } from './db.js'
import { tierAllows } from './paywall.js'
import { canAccessNewsroom } from './rbac.js'
import type { AccountUser } from './effectiveAccess.js'

const COLLECTION = 'reactions'

// ── The vocabulary ──────────────────────────────────────────────────────────

export const REACTION_TARGET_TYPES = ['blog', 'blogPart', 'story', 'bulletin'] as const
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number]

/**
 * The seven keys, in scale order.
 *
 * Deliberately a duplicate of the keys in `apps/web/src/types/reactions.ts` and
 * NOT a copy of that module: the server needs the key SET to validate what a
 * client sends, and nothing else from it. The weights, the labels and the
 * colours stay in one place on the web side, where they are actually used. So
 * the only thing that could fork here is the list of legal keys — and a new key
 * that reached storage without passing this array would be rejected on write,
 * which is a loud failure rather than a silent one.
 */
export const REACTION_EMOJI_KEYS = [
  'reallyHate', 'hate', 'dislike', 'undecided', 'sortOf', 'like', 'love',
] as const
export type ReactionEmojiKey = (typeof REACTION_EMOJI_KEYS)[number]

export function isTargetType(v: unknown): v is ReactionTargetType {
  return typeof v === 'string' && (REACTION_TARGET_TYPES as readonly string[]).includes(v)
}
export function isEmojiKey(v: unknown): v is ReactionEmojiKey {
  return typeof v === 'string' && (REACTION_EMOJI_KEYS as readonly string[]).includes(v)
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ReactionCounts {
  targetType: ReactionTargetType
  targetId: string
  /** One entry per key in `REACTION_EMOJI_KEYS`, always all seven, zeros included. */
  counts: Record<ReactionEmojiKey, number>
  /** The number of PEOPLE who reacted, which is the sum of `counts`. */
  total: number
  /** The caller's own pick, or null when they have none / aren't signed in. */
  mine: ReactionEmojiKey | null
}

function emptyCounts(): Record<ReactionEmojiKey, number> {
  return Object.fromEntries(REACTION_EMOJI_KEYS.map((k) => [k, 0])) as Record<ReactionEmojiKey, number>
}

/** Failure carries the status the route should send, so the route stays thin. */
export type Reactable =
  | { ok: true; parentId?: string }
  | { ok: false; status: 404 | 403; error: string }

// ── Is this thing reactable? ────────────────────────────────────────────────

/**
 * Reactable = readable. Nothing more permissive, nothing less.
 *
 * This re-derives the target's own visibility rather than trusting the client,
 * because a reaction is a write to a public endpoint: without it, a POST with a
 * guessed id would record opinions on unpublished drafts, and the dashboard
 * would then rank a story nobody outside the building has read. The paywall is
 * re-checked for the same reason the blog read route checks it server-side — a
 * reader shown only the first paragraph is being asked a question they cannot
 * answer.
 *
 * Staff are NOT waved through. Someone who can see a draft in the composer
 * still may not react to it; `canSeeDrafts` governs reading the work, not
 * seeding its reception.
 */
export async function assertReactable(
  targetType: ReactionTargetType,
  targetId: string,
  parentId: string | undefined,
  account: AccountUser | undefined,
): Promise<Reactable> {
  const tier = account?.subscriptionTier
  const gone = { ok: false, status: 404, error: 'Not found' } as const

  if (targetType === 'blog' || targetType === 'blogPart') {
    // A part is identified by its own uuid but LIVES on a post, and the post is
    // what carries the status and the tier — so both cases resolve the post.
    const postId = targetType === 'blog' ? targetId : parentId
    if (!postId) return { ok: false, status: 404, error: 'Which post is this part on?' }

    const post = await db.collection('blogs').findById(postId)
    if (!post || !isBlogLive(post)) return gone
    if (!tierAllows(tier, post.minTier)) {
      return { ok: false, status: 403, error: 'This post is for subscribers.' }
    }

    if (targetType === 'blog') return { ok: true }

    // The part must ACTUALLY be on that post. Without this check a made-up uuid
    // would create an orphan row that no page can ever show and the dashboard
    // would nonetheless count — a phantom section with a reception.
    const parts = Array.isArray(post.parts) ? (post.parts as { id?: unknown }[]) : []
    if (!parts.some((p) => p?.id === targetId)) return gone
    return { ok: true, parentId: postId }
  }

  if (targetType === 'story') {
    const story = await db.collection('articles').findById(targetId)
    if (!story || story.status !== 'published') return gone
    if (!tierAllows(tier, story.minTier)) {
      return { ok: false, status: 403, error: 'This story is for subscribers.' }
    }
    return { ok: true }
  }

  // Bulletins are magazine ISSUES, not articles — the newsstand. An issue is
  // live until it is pulled, which `unpublishedAt` records; there is no status
  // field to read. Issues carry no tier of their own.
  const issue = await db.collection('issues').findById(targetId)
  if (!issue || issue.unpublishedAt) return gone
  return { ok: true }
}

/**
 * Mirrors `isLive` in routes/blogs.ts — status plus a `publishAt` resolved at
 * read time, because nothing in this codebase ever flips a dated record to live.
 */
function isBlogLive(doc: Record<string, unknown>, now = Date.now()): boolean {
  if (doc.status !== 'published') return false
  if (typeof doc.publishAt === 'string' && doc.publishAt) {
    const at = Date.parse(doc.publishAt)
    if (Number.isFinite(at) && at > now) return false
  }
  return true
}

// ── Reading ─────────────────────────────────────────────────────────────────

interface CountRow {
  _id: { t: ReactionTargetType; id: string; e: ReactionEmojiKey }
  n: number
}
interface MineRow {
  targetType: ReactionTargetType
  targetId: string
  emoji: ReactionEmojiKey
}

/**
 * Counts for one target — and, when `withParts`, for every part of it too.
 *
 * `withParts` is why `parentId` is stored on a part's reaction at all. A post
 * with eight parts needs nine sets of counts, and nine round trips would make
 * the reader page wait on a feature nobody asked to wait for. The `$or` turns
 * that into ONE query, and the caller's own picks ride along in the same
 * aggregation through `$facet` rather than costing a second trip.
 *
 * Always returns a row for the requested target, zeros included: a post nobody
 * has reacted to is a real answer, not a missing one, and the bar must render.
 */
export async function countsFor(
  targetType: ReactionTargetType,
  targetId: string,
  opts: { withParts?: boolean; userId?: string } = {},
): Promise<ReactionCounts[]> {
  const col = await rawCollection(COLLECTION)

  const match: Record<string, unknown> =
    opts.withParts && targetType === 'blog'
      ? { $or: [{ targetType: 'blog', targetId }, { parentId: targetId }] }
      : { targetType, targetId }

  // The `mine` branch is OMITTED for an anonymous caller rather than stubbed with
  // an empty-ish stage: a $facet sub-pipeline must be non-empty, and `$limit: 0`
  // — the obvious stub — is rejected by MongoDB outright.
  const facetStages: Record<string, Record<string, unknown>[]> = {
    counts: [{ $group: { _id: { t: '$targetType', id: '$targetId', e: '$emoji' }, n: { $sum: 1 } } }],
  }
  if (opts.userId) {
    facetStages.mine = [
      { $match: { userId: opts.userId } },
      { $project: { _id: 0, targetType: 1, targetId: 1, emoji: 1 } },
    ]
  }

  const [facet] = await col
    .aggregate<{ counts?: CountRow[]; mine?: MineRow[] }>([{ $match: match }, { $facet: facetStages }])
    .toArray()

  const byTarget = new Map<string, ReactionCounts>()
  const keyOf = (t: string, id: string) => `${t}:${id}`
  const ensure = (t: ReactionTargetType, id: string): ReactionCounts => {
    const k = keyOf(t, id)
    let row = byTarget.get(k)
    if (!row) {
      row = { targetType: t, targetId: id, counts: emptyCounts(), total: 0, mine: null }
      byTarget.set(k, row)
    }
    return row
  }

  // The requested target always exists in the result, reacted to or not.
  ensure(targetType, targetId)

  for (const row of facet?.counts ?? []) {
    if (!isTargetType(row._id?.t) || !isEmojiKey(row._id?.e)) continue
    const target = ensure(row._id.t, String(row._id.id))
    target.counts[row._id.e] = row.n
    target.total += row.n
  }
  for (const row of facet?.mine ?? []) {
    if (!isTargetType(row.targetType) || !isEmojiKey(row.emoji)) continue
    ensure(row.targetType, String(row.targetId)).mine = row.emoji
  }

  return [...byTarget.values()]
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Record (or change) one reader's reaction. Upsert, keyed on exactly the fields
 * the unique index covers — so two taps racing each other resolve to one row
 * rather than two, in the database rather than in a hopeful check above it.
 *
 * `isStaff` is stamped from the ACCOUNT, never from the client, so the
 * dashboard can exclude the building's own reactions from the readership's.
 */
export async function setReaction(input: {
  targetType: ReactionTargetType
  targetId: string
  parentId?: string
  emoji: ReactionEmojiKey
  account: AccountUser
}): Promise<void> {
  const col = await rawCollection(COLLECTION)
  const now = new Date().toISOString()
  const set: Record<string, unknown> = {
    emoji: input.emoji,
    updatedAt: now,
    isStaff: canAccessNewsroom(input.account),
  }
  if (input.parentId) set.parentId = input.parentId

  await col.updateOne(
    { targetType: input.targetType, targetId: input.targetId, userId: input.account.id },
    {
      $set: set,
      $setOnInsert: {
        targetType: input.targetType,
        targetId: input.targetId,
        userId: input.account.id,
        createdAt: now,
      },
    },
    { upsert: true },
  )
}

/**
 * Remove a reader's reaction entirely.
 *
 * A HARD delete, and it has to be: the unique index has no partial filter, so a
 * soft-deleted row would keep occupying (targetType, targetId, userId) and the
 * reader's next pick would fail with a duplicate key. There is nothing to
 * recover either — a reaction is one field, re-entered with one click.
 */
export async function clearReaction(
  targetType: ReactionTargetType,
  targetId: string,
  userId: string,
): Promise<boolean> {
  const col = await rawCollection(COLLECTION)
  const result = await col.deleteOne({ targetType, targetId, userId })
  return result.deletedCount > 0
}
