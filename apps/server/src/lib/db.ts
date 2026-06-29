// ---------------------------------------------------------------------------
// Database Client — dual mode (gated by PROD flag)
//
// WebContainer / local dev:  always in-memory Map. PROD is unset/false.
// Deployment (Render/etc.):  MongoDB, ONLY when BOTH PROD=true AND MONGODB_URI set.
//
// This gate is intentional: WebContainer is a sandboxed preview and must never
// reach out to a real database. Real persistence belongs to deployment only,
// where hosting env sets PROD=true and provides a production MONGODB_URI.
// If MONGODB_URI leaks into a non-prod env, it is ignored.
// ---------------------------------------------------------------------------

import { MongoClient, ObjectId } from 'mongodb'
import type { Db } from 'mongodb'
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

const IS_PROD = process.env.PROD === 'true'
const MONGODB_URI = (process.env.MONGODB_URI ?? '').trim()
const USE_MONGO = IS_PROD && !!MONGODB_URI

// ---------------------------------------------------------------------------
// In-memory storage (development / WebContainer)
// ---------------------------------------------------------------------------

let idCounter = 0
function genId(): string {
  return Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 8)
}

const store = new Map<string, Doc[]>()

function getStore(name: string): Doc[] {
  if (!store.has(name)) store.set(name, [])
  return store.get(name)!
}

function matchesQuery(doc: Doc, query: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(query)) {
    if (doc[key] !== val) return false
  }
  return true
}

function memoryCollection(name: string) {
  return {
    async find(query?: Record<string, unknown>): Promise<Doc[]> {
      // Soft delete: never surface tombstoned docs to readers.
      const docs = getStore(name).filter((d) => !d.deletedAt)
      if (!query || Object.keys(query).length === 0) return [...docs]
      return docs.filter((d) => matchesQuery(d, query))
    },
    async findById(id: string): Promise<Doc | null> {
      const doc = getStore(name).find((d) => d._id === id) ?? null
      // A soft-deleted doc is treated as gone.
      if (doc && doc.deletedAt) return null
      return doc
    },
    async insertOne(doc: Record<string, unknown>): Promise<string> {
      const id = genId()
      const newDoc = { ...doc, _id: id } as Doc
      getStore(name).push(newDoc)
      return id
    },
    async updateOne(id: string, update: Record<string, unknown>): Promise<boolean> {
      const docs = getStore(name)
      const idx = docs.findIndex((d) => d._id === id)
      if (idx === -1 || docs[idx]!.deletedAt) return false
      docs[idx] = { ...docs[idx]!, ...update, _id: id }
      return true
    },
    // Soft delete only — we never splice the row out of the store. The doc is
    // stamped with `deletedAt` so find()/findById() hide it while the data
    // remains recoverable. There is no hard-delete path anywhere.
    async deleteOne(id: string): Promise<boolean> {
      const docs = getStore(name)
      const idx = docs.findIndex((d) => d._id === id)
      if (idx === -1 || docs[idx]!.deletedAt) return false
      docs[idx] = { ...docs[idx]!, deletedAt: new Date().toISOString(), _id: id }
      return true
    },
  }
}

// ---------------------------------------------------------------------------
// Real MongoDB collection (when MONGODB_URI is set)
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
  if (USE_MONGO) return mongoCollection(name)
  return memoryCollection(name)
}

if (IS_PROD && !MONGODB_URI) {
  console.warn('[db] PROD=true but MONGODB_URI not set — falling back to in-memory (data will not persist across restarts)')
} else if (!IS_PROD && MONGODB_URI) {
  console.warn('[db] MONGODB_URI is set but PROD!=true — ignoring (in-memory mode). This is expected in WebContainer preview.')
}

/** True when connected to MongoDB (not in-memory). Health checks use this. */
export const db = { collection, isProduction: () => USE_MONGO }
