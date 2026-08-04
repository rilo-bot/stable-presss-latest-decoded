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

// ── The staff dashboard's report ────────────────────────────────────────────
//
// What the Emoji Analytics screen reads. It returns COUNTS, never rows, and it
// deliberately does NOT compute a score.
//
// Both of those are on purpose:
//
//  • Counts, not rows, because shipping one object per reaction to a browser is
//    the load-everything pattern this codebase already has a review about. The
//    payload here is bounded by the published catalogue, not by traffic.
//
//  • No score, because scoring means weights, and the weights live in exactly
//    one file (`apps/web/src/types/reactions.ts`). A server copy would be a
//    second scale waiting to disagree with the first — the precise failure the
//    shared module was extracted to prevent. The client multiplies these counts
//    by that one scale, so a re-weighting stays a one-file change and re-scores
//    all of history correctly.

export interface ReportItem {
  id: string
  title: string
  type: ReactionTargetType
  /** Display label only — the dashboard does no category maths. */
  category?: string
  /** For a blog part: the post it belongs to. A part is never read alone. */
  parentTitle?: string
  publishedAt: string
  /** Per-emoji counts in `REACTION_EMOJI_KEYS` order, all seven, zeros included. */
  counts: number[]
}

export interface ReactionsReport {
  items: ReportItem[]
  /** Distinct people, which per-item counts cannot give: one reader reacts to many items. */
  reactors: number
  /** How much was published up to `to`, per type — the denominator of "coverage". */
  publishedByType: Record<ReactionTargetType, number>
  /** How many reacted items were dropped by the cap. 0 in every normal case. */
  truncated: number
  /**
   * Staff reactions left out of the figures above. Reported, never silently
   * dropped: staff test their own reaction bars, so "I reacted and the dashboard
   * shows nothing" is the first thing this feature does to the people who build
   * it. The number turns that into an explanation instead of a bug hunt. Always
   * 0 when `includeStaff` is on, because then nothing was excluded.
   */
  staffExcluded: number
}

/**
 * Metadata is fetched for at most this many reacted items.
 *
 * A hard stop rather than a silent one: the route logs whatever it drops and the
 * response carries `truncated`, because a dashboard that quietly leaves things
 * out is worse than one that says it did. Reacted items are bounded by the
 * published catalogue, so reaching this means the catalogue outgrew the design
 * of this endpoint — at which point ranking belongs on the server.
 */
const MAX_REPORT_ITEMS = 500

const dayEnd = (isoDate: string): string => `${isoDate}T23:59:59.999Z`

interface GroupRow {
  _id: { t: ReactionTargetType; id: string; p?: string; e: ReactionEmojiKey }
  n: number
}

export async function reactionsReport(opts: {
  from: string
  to: string
  types: ReactionTargetType[]
  /** Staff reactions are excluded by default — see `isStaff` on setReaction. */
  includeStaff?: boolean
}): Promise<ReactionsReport> {
  const col = await rawCollection(COLLECTION)

  const match: Record<string, unknown> = {
    createdAt: { $gte: opts.from, $lte: dayEnd(opts.to) },
  }
  if (opts.types.length) match.targetType = { $in: opts.types }
  if (!opts.includeStaff) match.isStaff = { $ne: true }

  const [facet] = await col
    .aggregate<{ counts?: GroupRow[]; reactors?: { n: number }[] }>([
      { $match: match },
      {
        $facet: {
          counts: [
            { $group: { _id: { t: '$targetType', id: '$targetId', p: '$parentId', e: '$emoji' }, n: { $sum: 1 } } },
          ],
          reactors: [{ $group: { _id: '$userId' } }, { $count: 'n' }],
        },
      },
    ])
    .toArray()

  // Count what the staff filter removed, over the SAME window and types, so the
  // page can say "your own reactions are here, just not counted" rather than
  // showing an unexplained zero.
  const staffExcluded = opts.includeStaff
    ? 0
    : await col.countDocuments({ ...match, isStaff: true })

  // Fold the (target, emoji) rows into one counts vector per target.
  const byTarget = new Map<string, { type: ReactionTargetType; id: string; parentId?: string; counts: number[] }>()
  for (const row of facet?.counts ?? []) {
    const t = row._id?.t
    const id = row._id?.id == null ? '' : String(row._id.id)
    const e = row._id?.e
    if (!isTargetType(t) || !id || !isEmojiKey(e)) continue
    const key = `${t}:${id}`
    let entry = byTarget.get(key)
    if (!entry) {
      entry = { type: t, id, parentId: row._id.p ? String(row._id.p) : undefined, counts: REACTION_EMOJI_KEYS.map(() => 0) }
      byTarget.set(key, entry)
    }
    entry.counts[REACTION_EMOJI_KEYS.indexOf(e)] = row.n
  }

  const all = [...byTarget.values()]
  const kept = all.slice(0, MAX_REPORT_ITEMS)

  const [items, publishedByType] = await Promise.all([
    describeTargets(kept),
    publishedCounts(opts.to, opts.types),
  ])

  return {
    items,
    reactors: facet?.reactors?.[0]?.n ?? 0,
    publishedByType,
    truncated: all.length - kept.length,
    // `isStaff: true` replaces the `$ne: true` already in `match` — same window,
    // same types, opposite side of the one filter.
    staffExcluded,
  }
}

/**
 * Put a title, a date and a category on each reacted target.
 *
 * Point lookups by `_id`, run concurrently — `findById` is the only reader that
 * copes with this codebase's two id shapes (ObjectId and plain string), and it
 * applies the same soft-delete rule as every other read, so a deleted piece
 * drops out of the dashboard rather than appearing as an untitled row.
 *
 * A target whose record has gone is DROPPED, not shown as "Unknown": its
 * reactions still exist, but a leaderboard row nobody can click is noise.
 */
async function describeTargets(
  targets: { type: ReactionTargetType; id: string; parentId?: string; counts: number[] }[],
): Promise<ReportItem[]> {
  // One read per distinct blog, not per part: a post with eight reacted parts
  // would otherwise be fetched nine times.
  const blogCache = new Map<string, Record<string, unknown> | null>()
  const readBlog = async (id: string) => {
    if (!blogCache.has(id)) blogCache.set(id, await db.collection('blogs').findById(id))
    return blogCache.get(id) ?? null
  }

  const out = await Promise.all(
    targets.map(async (t): Promise<ReportItem | null> => {
      const base = { id: t.id, type: t.type, counts: t.counts }

      if (t.type === 'story') {
        const doc = await db.collection('articles').findById(t.id)
        if (!doc) return null
        return {
          ...base,
          title: str(doc.title) || 'Untitled story',
          category: str(doc.category) || undefined,
          publishedAt: isoOf(doc.publishedAt ?? doc.createdAt),
        }
      }

      if (t.type === 'blog') {
        const doc = await readBlog(t.id)
        if (!doc) return null
        return {
          ...base,
          title: str(doc.title) || 'Untitled post',
          category: str(doc.category) || undefined,
          publishedAt: isoOf(doc.publishedAt ?? doc.createdAt),
        }
      }

      if (t.type === 'blogPart') {
        if (!t.parentId) return null
        const post = await readBlog(t.parentId)
        if (!post) return null
        const parts = Array.isArray(post.parts) ? (post.parts as Record<string, unknown>[]) : []
        const part = parts.find((p) => p?.id === t.id)
        // The part was deleted out of the post it was on. Its reactions are real
        // but there is nothing left to name them after.
        if (!part) return null
        return {
          ...base,
          title: str(part.title) || 'Untitled part',
          parentTitle: str(post.title) || 'Untitled post',
          publishedAt: isoOf(post.publishedAt ?? post.createdAt),
        }
      }

      const issue = await db.collection('issues').findById(t.id)
      if (!issue) return null
      return {
        ...base,
        title: str(issue.title) || 'Untitled edition',
        publishedAt: isoOf(issue.publishedAt ?? issue.createdAt),
      }
    }),
  )

  return out.filter((i): i is ReportItem => i !== null)
}

/**
 * How much was published up to `to` — the "reacted on N of M published" figure.
 *
 * Counted, never loaded: an issue document embeds its whole page array, so
 * pulling issues in to length an array would read megabytes to produce one
 * number. `blogPart` is the sum of every part on every live post, which is why
 * it goes through an aggregation rather than a countDocuments.
 *
 * Deliberately counts everything published up to `to`, NOT only what was
 * published inside the window: a June post can still be earning reactions in
 * August, and excluding it would flatter the coverage figure.
 */
async function publishedCounts(
  to: string,
  types: ReactionTargetType[],
): Promise<Record<ReactionTargetType, number>> {
  const wanted = (t: ReactionTargetType) => types.length === 0 || types.includes(t)
  const upTo = dayEnd(to)
  const out: Record<ReactionTargetType, number> = { story: 0, blog: 0, blogPart: 0, bulletin: 0 }

  const [story, blog, bulletin, parts] = await Promise.all([
    wanted('story')
      ? db.collection('articles').count({ status: 'published', publishedAt: { $lte: upTo } })
      : Promise.resolve(0),
    wanted('blog')
      ? db.collection('blogs').count({ status: 'published', publishedAt: { $lte: upTo } })
      : Promise.resolve(0),
    wanted('bulletin')
      ? db.collection('issues').count({ unpublishedAt: null, publishedAt: { $lte: upTo } })
      : Promise.resolve(0),
    wanted('blogPart')
      ? db.collection('blogs').aggregate([
          { $match: { deletedAt: null, status: 'published', publishedAt: { $lte: upTo } } },
          { $group: { _id: null, n: { $sum: { $size: { $ifNull: ['$parts', []] } } } } },
        ])
      : Promise.resolve([]),
  ])

  out.story = story as number
  out.blog = blog as number
  out.bulletin = bulletin as number
  const partRows = parts as { n?: unknown }[]
  out.blogPart = typeof partRows[0]?.n === 'number' ? partRows[0].n : 0
  return out
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** An ISO date string, whatever shape the source stored. */
function isoOf(v: unknown): string {
  if (typeof v === 'string' && v) return v
  if (v instanceof Date) return v.toISOString()
  return new Date(0).toISOString()
}
