// ---------------------------------------------------------------------------
// Database Client — MongoDB, always
//
// Every environment (local dev, preview, deployment) runs against a real
// MongoDB. There is NO in-memory fallback: the backend APIs must behave
// identically everywhere and persist real data. The `PROD` flag no longer
// gates the database — it only affects security posture elsewhere (JWT
// secret / OTP delivery). If MONGODB_URI is missing we fail fast at import
// time rather than silently serving an ephemeral store.
// ---------------------------------------------------------------------------

import { MongoClient, ObjectId } from 'mongodb'
import type { Db } from 'mongodb'
import { ensureIndexes } from './ensureIndexes.js'
// Using `any` for the index signature (not `unknown`) is deliberate. Routes
// freely read `doc.createdAt`, `doc.title`, `doc.dueDate`, etc. and feed
// them into `new Date()`, string ops, comparisons — strict `tsc` rejects
// every one of those when the value is `unknown`. Loosening this single
// index signature prevents a very common Render deploy failure. Explicit
// fields stay well-typed.
interface Doc {
  _id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

const MONGODB_URI = (process.env.MONGODB_URI ?? '').trim()

// Fail fast: no URI means no backend. We no longer degrade to an in-memory
// store, so a misconfigured environment must surface loudly at startup rather
// than quietly persisting nothing.
if (!MONGODB_URI) {
  throw new Error(
    '[db] MONGODB_URI is required. The in-memory fallback has been removed — ' +
      'set MONGODB_URI in apps/server/.env (or the deployment environment).',
  )
}

// ---------------------------------------------------------------------------
// MongoDB collection
// ---------------------------------------------------------------------------

let mongoDb: Db | null = null
let mongoConnected = false
// Cache the in-flight connect so concurrent requests share ONE attempt instead
// of each spawning a client. Cleared on failure so the next request can retry —
// important for transient DNS/network blips reaching Atlas (mongodb+srv needs
// extra SRV/TXT lookups that can intermittently fail behind some resolvers).
let mongoDbPromise: Promise<Db> | null = null

async function getMongoDb(): Promise<Db> {
  if (mongoDb) return mongoDb
  if (!mongoDbPromise) {
    // serverSelectionTimeoutMS: fail in 8s instead of the 30s default so a bad
    // request errors quickly rather than hanging the connection pool.
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
    mongoDbPromise = client
      .connect()
      .then((c) => {
        mongoDb = c.db()
        mongoConnected = true
        console.log('[db] MongoDB connected:', MONGODB_URI.replace(/:([^@]+)@/, ':***@'))
        // Fire-and-forget: create baseline indexes once per process. Idempotent
        // and non-blocking, so it never stalls or fails the connection. ensureIndexes
        // swallows its own errors (logs them), so the void promise can't reject.
        void ensureIndexes(mongoDb)
        return mongoDb
      })
      .catch((err) => {
        // Drop the cached attempt so the NEXT request reconnects from scratch.
        mongoDbPromise = null
        throw err
      })
  }
  return mongoDbPromise
}

function mongoCollection(name: string) {
  return {
    async find(query?: Record<string, unknown>): Promise<Doc[]> {
      const db = await getMongoDb()
      // Soft delete: `deletedAt: null` matches both missing and null, so
      // tombstoned docs are excluded from every read.
      const finalQuery = { ...(query ?? {}), deletedAt: null }
      const docs = await db.collection(name).find(finalQuery).toArray()
      return docs.map((d) => ({ ...d, _id: d._id.toString() })) as Doc[]
    },
    /**
     * Count matching live documents WITHOUT loading them.
     *
     * Exists because several call sites only wanted a number and were doing
     * `(await find()).length` — which pulled every document in the collection into
     * the API process to count it (docs/AUTH-RBAC-REVIEW.md, the ten scan sites).
     * Same implicit `deletedAt: null` as find(), so counts and reads agree.
     */
    async count(query?: Record<string, unknown>): Promise<number> {
      const db = await getMongoDb()
      return db.collection(name).countDocuments({ ...(query ?? {}), deletedAt: null })
    },
    // Run an aggregation pipeline. Unlike find(), this does NOT auto-inject the
    // `deletedAt: null` soft-delete filter — add a `$match` stage yourself when it
    // matters. Used for cheap server-side rollups (e.g. per-magazine page counts)
    // instead of loading full documents into the API just to count them.
    async aggregate(pipeline: Record<string, unknown>[]): Promise<Doc[]> {
      const db = await getMongoDb()
      const docs = await db.collection(name).aggregate(pipeline).toArray()
      return docs.map((d) => ({ ...d, _id: d._id == null ? d._id : String(d._id) })) as Doc[]
    },
    async findById(id: string): Promise<Doc | null> {
      const db = await getMongoDb()
      let doc
      try {
        doc = await db.collection(name).findOne({ _id: new ObjectId(id) })
      } catch {
        doc = await db.collection(name).findOne({ _id: id as any })
      }
      // A soft-deleted doc is treated as gone.
      if (!doc || doc.deletedAt) return null
      return { ...doc, _id: doc._id.toString() } as Doc
    },
    async insertOne(doc: Record<string, unknown>): Promise<string> {
      const db = await getMongoDb()
      const result = await db.collection(name).insertOne(doc)
      return result.insertedId.toString()
    },
    async updateOne(id: string, update: Record<string, unknown>): Promise<boolean> {
      const db = await getMongoDb()
      let result
      // Guard with `deletedAt: null` so a soft-deleted doc can't be mutated.
      try {
        result = await db.collection(name).updateOne({ _id: new ObjectId(id), deletedAt: null }, { $set: update })
      } catch {
        result = await db.collection(name).updateOne({ _id: id as any, deletedAt: null }, { $set: update })
      }
      return result.modifiedCount > 0
    },
    // Atomic compare-and-set — the condition is folded into the query filter, so
    // MongoDB evaluates match-and-update as one atomic operation. Returns true iff
    // a live doc matched the condition (matchedCount, so a no-op $set still counts
    // as "won the race"). Callers use a `false` return as a concurrency conflict.
    async updateOneIf(
      id: string,
      condition: Record<string, unknown>,
      update: Record<string, unknown>,
    ): Promise<boolean> {
      const db = await getMongoDb()
      let result
      try {
        result = await db.collection(name).updateOne({ _id: new ObjectId(id), deletedAt: null, ...condition }, { $set: update })
      } catch {
        result = await db.collection(name).updateOne({ _id: id as any, deletedAt: null, ...condition }, { $set: update })
      }
      return result.matchedCount > 0
    },
    // Atomically claim ONE matching live doc — the worker queue uses this to
    // grab the oldest queued job without two workers taking the same one.
    // `$set`s `set` (and optionally `$inc`s `inc`) on the FIRST doc matching
    // `filter` ordered by createdAt, returning it AFTER the update, or null if
    // nothing matched. Atomic because findOneAndUpdate match-and-update is a
    // single server operation, so it's safe across worker replicas.
    async claimOne(
      filter: Record<string, unknown>,
      set: Record<string, unknown>,
      inc?: Record<string, number>,
    ): Promise<Doc | null> {
      const db = await getMongoDb()
      const update: Record<string, unknown> = { $set: set }
      if (inc && Object.keys(inc).length) update.$inc = inc
      const doc = await db.collection(name).findOneAndUpdate(
        { ...filter, deletedAt: null },
        update,
        { sort: { createdAt: 1 }, returnDocument: 'after', includeResultMetadata: false },
      )
      if (!doc) return null
      return { ...doc, _id: doc._id.toString() } as Doc
    },
    // Atomic array add/remove on ONE doc. Read-modify-write on an array field
    // loses concurrent updates (two admins editing the same user's roles at once
    // drops one of the writes); $addToSet / $pull are evaluated server-side, so
    // they don't. Prefer these over find-then-updateOne for any array field.
    async addToSet(id: string, field: string, value: unknown): Promise<boolean> {
      const db = await getMongoDb()
      const update = { $addToSet: { [field]: value } }
      let result
      try {
        result = await db.collection(name).updateOne({ _id: new ObjectId(id), deletedAt: null }, update)
      } catch {
        result = await db.collection(name).updateOne({ _id: id as any, deletedAt: null }, update)
      }
      return result.matchedCount > 0
    },
    async pullFrom(id: string, field: string, value: unknown): Promise<boolean> {
      const db = await getMongoDb()
      const update = { $pull: { [field]: value } } as Record<string, unknown>
      let result
      try {
        result = await db.collection(name).updateOne({ _id: new ObjectId(id), deletedAt: null }, update)
      } catch {
        result = await db.collection(name).updateOne({ _id: id as any, deletedAt: null }, update)
      }
      return result.matchedCount > 0
    },
    // $pull a value from an array field across EVERY live doc. Used to clean up
    // references when the thing being referenced is deleted.
    async pullFromAll(field: string, value: unknown): Promise<number> {
      const db = await getMongoDb()
      const result = await db
        .collection(name)
        .updateMany({ deletedAt: null }, { $pull: { [field]: value } } as Record<string, unknown>)
      return result.modifiedCount
    },
    // Soft delete only — stamp `deletedAt` instead of removing the document, so
    // find()/findById() hide it while the data stays recoverable. There is no
    // hard-delete path anywhere.
    async deleteOne(id: string): Promise<boolean> {
      const db = await getMongoDb()
      const deletedAt = new Date().toISOString()
      let result
      try {
        result = await db.collection(name).updateOne({ _id: new ObjectId(id), deletedAt: null }, { $set: { deletedAt } })
      } catch {
        result = await db.collection(name).updateOne({ _id: id as any, deletedAt: null }, { $set: { deletedAt } })
      }
      return result.modifiedCount > 0
    },
  }
}

// ---------------------------------------------------------------------------
// Exported client — auto-selects based on environment
// ---------------------------------------------------------------------------

function collection(name: string) {
  return mongoCollection(name)
}

/**
 * The raw driver collection, with NO soft-delete filter and NO id normalisation.
 *
 * An escape hatch with exactly ONE legitimate user today: `lib/reactions.ts`.
 * Reactions carry a UNIQUE index on (targetType, targetId, userId) — that index
 * IS the "one reaction per reader" rule — and a soft-deleted row still occupies
 * its key. So a reader who clears a reaction and picks again would collide with
 * their own tombstone. Reactions therefore HARD-delete, which the wrapper above
 * deliberately cannot do.
 *
 * Do not reach for this to avoid `deletedAt`. Everything else in the app is
 * recoverable on purpose; a reaction is a single field a reader can re-enter in
 * one click, so there is nothing to recover.
 */
export async function rawCollection(name: string) {
  const database = await getMongoDb()
  return database.collection(name)
}

/**
 * Always true — the backend is MongoDB-only. Retained so existing health-check
 * and migration callers keep working without change.
 */
export const db = { collection, isProduction: () => true }
