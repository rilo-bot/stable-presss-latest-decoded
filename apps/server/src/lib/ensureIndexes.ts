import type { Db } from 'mongodb'
import { COL } from './magazineV2/collections.js'
import {
  ADMIN_ROLES,
  INVITES,
  ORGANISATIONS,
  ORG_MEMBERS,
  OTPS,
  PARTIES,
  PEOPLE,
  ROLES,
  USERS,
} from './collections.js'

interface IndexSpec {
  collection: string
  keys: Record<string, 1 | -1>
  options?: {
    unique?: boolean
    partialFilterExpression?: Record<string, unknown>
    /** TTL: seconds after the indexed DATE field before MongoDB deletes the doc. */
    expireAfterSeconds?: number
  }
}

const INDEX_SPECS: IndexSpec[] = [
  // Page reads, ordered by index. Hit on every issue load and structural op.
  { collection: COL.pages, keys: { magazineId: 1, deletedAt: 1, index: 1 } },
  // Worker queue: claimOne({ status: queued }) by createdAt. Polled every ~2s.
  { collection: COL.jobs, keys: { status: 1, deletedAt: 1, createdAt: 1 } },
  // TTL reap of finished jobs. The worker stamps expiresAt only when terminal.
  { collection: COL.jobs, keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  // Per-magazine media library: find({ magazineId }).
  { collection: COL.media, keys: { magazineId: 1, deletedAt: 1 } },
  // Per-magazine chat thread. Grows unbounded, so it must not scan.
  { collection: COL.chat, keys: { magazineId: 1, deletedAt: 1, createdAt: -1 } },
  // The review audit trail is APPEND-ONLY and never pruned, so it only grows. Every
  // read is one magazine's rows newest-first — without this, opening the trail scans
  // every review event ever recorded, for every magazine.
  { collection: COL.reviews, keys: { magazineId: 1, deletedAt: 1, at: -1 } },
  // Issue library list: served newest-first by updatedAt.
  { collection: COL.magazines, keys: { deletedAt: 1, updatedAt: -1 } },
  // Blogs: public index (published, newest first) and the staff list.
  { collection: 'blogs', keys: { deletedAt: 1, status: 1, publishedAt: -1 } },
  { collection: 'blogs', keys: { deletedAt: 1, updatedAt: -1 } },
  { collection: 'blogs', keys: { tags: 1, deletedAt: 1 } },
  // Retired slugs still resolve (301), so this lookup is on the public read path.
  { collection: 'blogs', keys: { slugHistory: 1, deletedAt: 1 } },
  // ── Stories & the public newsstand ──
  { collection: 'articles', keys: { status: 1, deletedAt: 1 } },
  // The published-issue newsstand. Equality keys first, then the sort key.
  { collection: COL.published, keys: { deletedAt: 1, unpublishedAt: 1, publishedAt: -1 } },
  // One member's notification list. Per-user and unbounded.
  { collection: 'notifications', keys: { recipientUserId: 1, deletedAt: 1 } },
  // Does this member already have a tipper profile?
  { collection: 'tipperProfiles', keys: { userId: 1, deletedAt: 1 } },
  // A slug is a post public identity. PARTIAL, because deletes are soft.
  {
    collection: 'blogs',
    keys: { slug: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // User lookup by email (collaborator-add and auth paths).
  {
    collection: USERS,
    keys: { email: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // Sign-in reads the newest OTP for an address, on an unauthenticated route.
  { collection: OTPS, keys: { email: 1, deletedAt: 1, createdAt: -1 } },
  // The admin roster: find({ isAdmin: true }).
  { collection: USERS, keys: { isAdmin: 1, deletedAt: 1 } },
  // ONE ROLE PER ADMIN. This index IS the rule — a second link row for the same
  // person is rejected by the database rather than by a check someone can forget.
  //
  // PARTIAL, and that is load-bearing: `db.deleteOne` SOFT-deletes, so revoking a
  // role leaves a tombstoned link row behind. Without the filter that tombstone
  // keeps occupying `userId`, and re-granting a role to the same person throws
  // E11000 — which Express 4 does not forward from an async handler, so the
  // request hangs forever rather than erroring. Verified: a `{deletedAt: null}`
  // partial filter DOES cover documents missing the field, and DOES exclude ones
  // where it is set, which is exactly the behaviour needed here.
  {
    collection: ADMIN_ROLES,
    keys: { userId: 1 },
    // `userId: {$exists: true}` as well as the soft-delete filter, because
    // `adminRoles` can legitimately hold rows WITHOUT a userId: during a
    // migration run with --keep-legacy it still carries the old role
    // DEFINITIONS, and every one of those would index as `userId: null` — so the
    // second definition collides with the first and the index cannot be built.
    // Verified by rehearsing the migration against a scratch database.
    options: {
      unique: true,
      partialFilterExpression: { userId: { $exists: true }, deletedAt: null },
    },
  },
  // "Who holds this role?" — the assignee tally and role deletion.
  { collection: ADMIN_ROLES, keys: { roleId: 1 } },
  // A role NAME is unique, enforced in the database. PARTIAL: deletes are soft.
  {
    collection: ROLES,
    keys: { name: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // parties. NOT unique: unclaimed rows have no userId, and one person may hold
  // the same role on two horses.
  { collection: PARTIES, keys: { userId: 1, deletedAt: 1 } },
  // Scope resolution reads these on every authenticated request (lib/scope.ts).
  { collection: PARTIES, keys: { orgId: 1, deletedAt: 1 } },
  { collection: PARTIES, keys: { horseId: 1, deletedAt: 1 } },
  // The unclaimed register: "who can I claim?" filtered by role.
  { collection: PARTIES, keys: { taken: 1, role: 1, deletedAt: 1 } },
  // Every read that shows a party name joins the person in through this.
  { collection: PARTIES, keys: { personId: 1, deletedAt: 1 } },
  // people. Names are how the register is searched and sorted.
  { collection: PEOPLE, keys: { name: 1, deletedAt: 1 } },
  {
    collection: ORG_MEMBERS,
    keys: { userId: 1, orgId: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // One org's member list.
  { collection: ORG_MEMBERS, keys: { orgId: 1, deletedAt: 1 } },
  { collection: ORG_MEMBERS, keys: { userId: 1, deletedAt: 1 } },
  // The organisation a member belongs to, and who owns it.
  { collection: ORGANISATIONS, keys: { ownerUserId: 1, deletedAt: 1 } },
  // Invite links resolve by token hash on an unauthenticated route.
  { collection: INVITES, keys: { tokenHash: 1 } },
  { collection: INVITES, keys: { email: 1 } },
  // ── Reactions (docs/REACTIONS-PLAN.md) ──
  {
    collection: 'reactions',
    keys: { targetType: 1, targetId: 1, userId: 1 },
    options: { unique: true },
  },
  // The count aggregation for one target.
  { collection: 'reactions', keys: { targetType: 1, targetId: 1 } },
  // Every part of a post in ONE query instead of N+1.
  { collection: 'reactions', keys: { parentId: 1 } },
  // The analytics date window.
  { collection: 'reactions', keys: { createdAt: -1 } },
  // ── Comments (docs/COMMENTS-PLAN.md) ──
  { collection: 'comments', keys: { targetType: 1, targetId: 1, deletedAt: 1, createdAt: -1 } },
  // The moderation queue: reported-and-still-visible, most reported first.
  { collection: 'comments', keys: { deletedAt: 1, status: 1, reportCount: -1 } },
  // "Everything, newest first" — the queue's `all` filter and the hidden list.
  { collection: 'comments', keys: { deletedAt: 1, createdAt: -1 } },
  // ONE REPORT PER READER PER COMMENT. This IS the rule, not an optimisation.
  {
    collection: 'commentReports',
    keys: { commentId: 1, userId: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // Recount a comment reports, and "have I already reported these?".
  { collection: 'commentReports', keys: { commentId: 1, deletedAt: 1 } },
  { collection: 'commentReports', keys: { userId: 1, deletedAt: 1 } },
]

/** The name MongoDB derives for an index when none is given. */
const derivedName = (keys: Record<string, 1 | -1>): string =>
  Object.entries(keys)
    .map(([k, v]) => `${k}_${v}`)
    .join('_')

/**
 * createIndex, but tolerant of an index that already exists with DIFFERENT
 * options. MongoDB rejects that outright (codes 85/86) rather than amending it,
 * which would otherwise strand an environment on the old definition forever —
 * exactly the case when a unique index gains a partial filter.
 */
async function createOrReplaceIndex(db: Db, spec: IndexSpec): Promise<void> {
  try {
    await db.collection(spec.collection).createIndex(spec.keys, spec.options ?? {})
  } catch (err) {
    const code = (err as { code?: number }).code
    if (code !== 85 && code !== 86) throw err
    const name = derivedName(spec.keys)
    console.warn(`[db] index ${spec.collection}.${name} exists with different options — recreating`)
    await db.collection(spec.collection).dropIndex(name)
    await db.collection(spec.collection).createIndex(spec.keys, spec.options ?? {})
  }
}

/**
 * Create the baseline indexes. Never throws — a failure on one index is logged
 * and the rest still proceed, so a transient hiccup can't take down startup.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  const results = await Promise.allSettled(INDEX_SPECS.map((spec) => createOrReplaceIndex(db, spec)))
  let ok = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ok++
    } else {
      const spec = INDEX_SPECS[i]
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.error(`[db] ensureIndex ${spec.collection} ${JSON.stringify(spec.keys)} failed:`, reason)
    }
  })
  console.log(`[db] ensured ${ok}/${INDEX_SPECS.length} indexes`)
}
