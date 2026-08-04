// ---------------------------------------------------------------------------
// Startup index bootstrap.
//
// The app previously created NO indexes, so every find()/claimOne() was a
// collection scan that grew with total data volume (see
// docs/MAGAZINE-V2-SCALABILITY-REVIEW.md, risk #1). This runs once per process
// right after the Mongo connection is established (see db.ts) and is fully
// idempotent — createIndex is a no-op when an index with the same derived name
// already exists, so it's safe on every boot. In MongoDB 4.2+ index builds are
// non-blocking, so this does not stall reads.
//
// Every key set includes `deletedAt` because db.ts folds `deletedAt: null` into
// every find()/updateOne()/claimOne() query, so an index that omits it can't
// fully serve those queries.
// ---------------------------------------------------------------------------

import type { Db } from 'mongodb'
import { COL } from './magazineV2/collections.js'

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
  // Page reads: pagesFor() does find({ magazineId }) ordered by `index`. Hit on
  // every issue load, page GET, status poll, publish, and structural op.
  { collection: COL.pages, keys: { magazineId: 1, deletedAt: 1, index: 1 } },
  // Worker queue: claimOne({ status: 'queued' }) sorted by createdAt (hot path,
  // polled ~every 2s per worker) and the idle sweep's find({ status: 'running' }).
  { collection: COL.jobs, keys: { status: 1, deletedAt: 1, createdAt: 1 } },
  // Reap finished jobs. Nothing ever deleted a `done` job, so the queue was
  // append-only for the life of the deployment — every issue ever generated left a
  // permanent row behind. `expireAfterSeconds: 0` means "expire exactly at the time
  // in the field", and the worker only stamps `expiresAt` once a job is terminal
  // (see terminalStamp() in apps/worker/src/queue.ts), so a queued or running job
  // has no such field and can never be collected no matter how long it takes.
  //
  // This is a HARD delete by the server's TTL monitor, not the soft delete used
  // everywhere else — correct here, because a finished job is disposable
  // infrastructure and its outcome has already been written onto the magazine.
  { collection: COL.jobs, keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  // Per-magazine media library: find({ magazineId }).
  { collection: COL.media, keys: { magazineId: 1, deletedAt: 1 } },
  // Per-magazine chat thread: match { magazineId } + range/sort on createdAt for
  // the paginated GET /issues/:id/chat (grows unbounded, so it must not scan).
  { collection: COL.chat, keys: { magazineId: 1, deletedAt: 1, createdAt: -1 } },
  // Issue library list: served newest-first by updatedAt.
  { collection: COL.magazines, keys: { deletedAt: 1, updatedAt: -1 } },
  // Blogs. The public index sorts published posts newest-first, and the staff
  // list sorts everything by last touched — both run through aggregate() with a
  // $skip/$limit, so they must not scan.
  { collection: 'blogs', keys: { deletedAt: 1, status: 1, publishedAt: -1 } },
  { collection: 'blogs', keys: { deletedAt: 1, updatedAt: -1 } },
  { collection: 'blogs', keys: { tags: 1, deletedAt: 1 } },
  // Retired slugs still resolve (301), so this lookup is on the public read path.
  { collection: 'blogs', keys: { slugHistory: 1, deletedAt: 1 } },
  // ── Stories & the public newsstand ──
  //
  // Deliberately NOT one index per collection. Most registers (horses, parties,
  // horsePartyLinks, podcastEpisodes, breakingNews, sponsors) are read with a bare
  // `find()` and no filter at all — the screens genuinely list everything. An index
  // cannot make an unfiltered scan cheaper, so adding one there would be decoration
  // that costs write throughput and buys nothing. What those routes actually need is
  // pagination; until they have it, the scan is the honest cost. `organisations` is
  // only ever read by id, which `_id_` already serves. Indexes below exist ONLY
  // where a query really filters or sorts.
  //
  // articles: reconcileStories() runs find({ status: 'scheduled' }) and the legacy
  // heal runs find({ status: { $nin: … } }) on the way into the list route, and the
  // public list now filters status server-side (routes/articles.ts). One index on
  // status serves all three.
  { collection: 'articles', keys: { status: 1, deletedAt: 1 } },
  // The published-issue newsstand: GET /api/issues matches { unpublishedAt: null }
  // and sorts publishedAt desc (an aggregate, so `deletedAt` is matched explicitly).
  // Equality keys first, then the sort key, so one index serves both. The staff
  // ?includeUnpublished=1 path drops the unpublishedAt equality and therefore sorts
  // in memory — acceptable: it is opt-in, authenticated, and small.
  { collection: COL.published, keys: { deletedAt: 1, unpublishedAt: 1, publishedAt: -1 } },
  // One member's notification list — per-user and unbounded, so it must not scan
  // the whole collection to find a single reader's rows.
  { collection: 'notifications', keys: { recipientUserId: 1, deletedAt: 1 } },
  // "Does this member already have a tipper profile" — checked on the create path
  // and read on every tipping screen.
  { collection: 'tipperProfiles', keys: { userId: 1, deletedAt: 1 } },
  // A slug is a post's public identity — uniqueness is enforced in the database,
  // not just by uniqueSlug(), because two concurrent creates would both pass an
  // application-level check. PARTIAL on deletedAt:null for the same reason the
  // roles index below is: deletes are soft, and a tombstone must not hold its
  // slug hostage forever.
  {
    collection: 'blogs',
    keys: { slug: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // User lookup by email (collaborator-add and auth paths).
  //
  // UNIQUE, for exactly the reason the blogs.slug index above is: signup checks
  // for an existing address at the application level (routes/auth.ts), and two
  // concurrent signups for the same address would both pass it. Duplicate users
  // make `find({ email })[0]` arbitrary, so sign-in, invite-apply and org
  // member-add could each pick a different row for one person.
  // Partial on deletedAt:null because deletes are soft.
  //
  // If the collection ALREADY holds duplicates this build fails — ensureIndexes
  // runs under Promise.allSettled, so it logs and the other indexes still apply.
  // `scripts/migrate-user-model.ts --check` reports duplicate emails so they can
  // be merged first. See docs/AUTH-RBAC-REVIEW.md M6.
  {
    collection: 'users',
    keys: { email: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // The staff axis is a scalar field on the user (docs/USER-MODEL-PLAN.md §1.2), so
  // the roster, assignee counts, superadmin-holder count and "is this person staff"
  // are all one indexed lookup instead of the full-collection scans they are today.
  { collection: 'users', keys: { staffRoleSlug: 1, deletedAt: 1 } },
  // Sign-in reads the newest OTP for an address on an UNAUTHENTICATED, unthrottled
  // endpoint, and `deleteOne` is a soft delete — so this collection only grows and
  // every request scanned all of it. See docs/AUTH-RBAC-REVIEW.md M7.
  { collection: 'otps', keys: { email: 1, deletedAt: 1, createdAt: -1 } },
  // ── Membership edges (docs/USER-MODEL-PLAN.md §3) ──
  // Unique keys are PARTIAL on deletedAt:null: the reconciler in lib/membership.ts
  // soft-deletes rows that leave the user document, and a tombstone must not stop
  // the same (user, party, role) being re-created later.
  {
    collection: 'partyMemberships',
    keys: { userId: 1, partyId: 1, role: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // The verification queue: filter by status, oldest first, PAGINATED — which the
  // embedded array could not support at all.
  { collection: 'partyMemberships', keys: { status: 1, deletedAt: 1, createdAt: 1 } },
  // Verify/reject resolve by the original embedded claim id, which is what the web
  // app sends. Not unique: a soft-deleted row keeps its claimId, and re-adding the
  // same claim is legal.
  { collection: 'partyMemberships', keys: { claimId: 1, deletedAt: 1 } },
  // "Who is behind this party" (lib/notify.ts usersForParty, on every horse-link write).
  { collection: 'partyMemberships', keys: { partyId: 1, status: 1, deletedAt: 1 } },
  // Scope resolution, on every authenticated request once P2 lands.
  { collection: 'partyMemberships', keys: { userId: 1, status: 1, deletedAt: 1 } },
  {
    collection: 'orgMemberships',
    keys: { userId: 1, orgId: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // One org's member list (routes/organisations.ts, currently a full users scan).
  { collection: 'orgMemberships', keys: { orgId: 1, deletedAt: 1 } },
  { collection: 'orgMemberships', keys: { userId: 1, deletedAt: 1 } },
  // Invite links resolve by token hash on an unauthenticated route — the one
  // lookup an anonymous caller can trigger, so it must not scan.
  { collection: 'pendingStaffGrants', keys: { tokenHash: 1 } },
  { collection: 'pendingStaffGrants', keys: { email: 1 } },
  // Dynamic RBAC: slug is the key stored on every user, so it must be unique.
  // Enforced in the database, not just in the create/rename handler — two
  // concurrent creates would otherwise both pass the application-level check.
  //
  // PARTIAL on `deletedAt: null`, because deletes here are soft. A plain unique
  // index keeps a tombstoned row occupying its slug forever, so deleting a role
  // and creating another with the same name fails with E11000. The filter also
  // covers docs where `deletedAt` is absent entirely, matching how db.ts reads.
  {
    collection: 'roles',
    keys: { slug: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // ── Reactions (docs/REACTIONS-PLAN.md) ──
  // NOTE: none of these carry `deletedAt`, unlike every index above. Reactions
  // are the one collection that opts OUT of the soft-delete convention and go
  // through lib/reactions.ts + rawCollection() instead of db.collection().
  //
  // This index is not an optimisation — it IS the "one reaction per reader"
  // rule. Enforced application-side only, two taps in flight at once would each
  // pass the check and write a row, and every count the dashboard prints would
  // silently stop being a count of people. Plain UNIQUE with no partial filter,
  // precisely because clearing a reaction REMOVES the row rather than stamping
  // it — a tombstone would hold the key and block the reader's next pick.
  {
    collection: 'reactions',
    keys: { targetType: 1, targetId: 1, userId: 1 },
    options: { unique: true },
  },
  // The count aggregation for one target.
  { collection: 'reactions', keys: { targetType: 1, targetId: 1 } },
  // Every part of a post in ONE query instead of N+1 — a post may carry up to
  // 20 parts, each its own reaction target.
  { collection: 'reactions', keys: { parentId: 1 } },
  // The analytics date window.
  { collection: 'reactions', keys: { createdAt: -1 } },
  // ── Comments (docs/COMMENTS-PLAN.md) ──
  //
  // Unlike `reactions` above, comments DO carry `deletedAt` in every key set:
  // they go through the normal `db.collection()` wrapper and its soft delete,
  // because a comment is a paragraph somebody wrote rather than a single field
  // re-entered in one click, and a moderation decision should stay reversible.
  //
  // The thread read: match one target, newest first, cursor-paginated on
  // createdAt. Equality keys first, then the sort key, so ONE index serves the
  // match, the sort and the `createdAt: { $lt: cursor }` range together.
  { collection: 'comments', keys: { targetType: 1, targetId: 1, deletedAt: 1, createdAt: -1 } },
  // The moderation queue's working list: reported-and-still-visible, most
  // reported first. Without this, opening the queue scans every comment ever
  // left — the one screen that grows with the whole platform's conversation.
  { collection: 'comments', keys: { deletedAt: 1, status: 1, reportCount: -1 } },
  // "Everything, newest first" — the queue's `all` filter and the hidden list.
  { collection: 'comments', keys: { deletedAt: 1, createdAt: -1 } },
  // ONE REPORT PER READER PER COMMENT. Like the reactions unique index, this is
  // not an optimisation — it IS the rule, and `reportCount` is only a count of
  // PEOPLE because of it. Two taps racing each other would otherwise each pass
  // the application-level check and write a row, and the number a moderator
  // triages on would quietly stop meaning what it says.
  //
  // PARTIAL on `deletedAt: null`, unlike reactions' plain unique index, because
  // reports go through the soft-delete wrapper: a tombstoned report must not
  // hold the key and block the same reader reporting a restored comment again.
  {
    collection: 'commentReports',
    keys: { commentId: 1, userId: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  // Recounting a comment's reports after each new one, and the "have I already
  // reported these?" lookup for a whole page of a thread.
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
