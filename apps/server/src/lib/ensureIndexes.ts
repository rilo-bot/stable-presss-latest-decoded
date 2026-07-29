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
  options?: { unique?: boolean; partialFilterExpression?: Record<string, unknown> }
}

const INDEX_SPECS: IndexSpec[] = [
  // Page reads: pagesFor() does find({ magazineId }) ordered by `index`. Hit on
  // every issue load, page GET, status poll, publish, and structural op.
  { collection: COL.pages, keys: { magazineId: 1, deletedAt: 1, index: 1 } },
  // Worker queue: claimOne({ status: 'queued' }) sorted by createdAt (hot path,
  // polled ~every 2s per worker) and the idle sweep's find({ status: 'running' }).
  { collection: COL.jobs, keys: { status: 1, deletedAt: 1, createdAt: 1 } },
  // Per-magazine media library: find({ magazineId }).
  { collection: COL.media, keys: { magazineId: 1, deletedAt: 1 } },
  // Per-magazine chat thread: match { magazineId } + range/sort on createdAt for
  // the paginated GET /issues/:id/chat (grows unbounded, so it must not scan).
  { collection: COL.chat, keys: { magazineId: 1, deletedAt: 1, createdAt: -1 } },
  // Issue library list: served newest-first by updatedAt.
  { collection: COL.issues, keys: { deletedAt: 1, updatedAt: -1 } },
  // User lookup by email (collaborator-add and auth paths).
  { collection: 'users', keys: { email: 1, deletedAt: 1 } },
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
