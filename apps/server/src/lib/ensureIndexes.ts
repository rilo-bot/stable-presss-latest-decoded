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
]

/**
 * Create the baseline indexes. Never throws — a failure on one index is logged
 * and the rest still proceed, so a transient hiccup can't take down startup.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  const results = await Promise.allSettled(
    INDEX_SPECS.map((spec) => db.collection(spec.collection).createIndex(spec.keys)),
  )
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
