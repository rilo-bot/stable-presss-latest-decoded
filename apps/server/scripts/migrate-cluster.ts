// ---------------------------------------------------------------------------
// Copy a whole database from ONE Atlas cluster to ANOTHER.
//
// The sibling script clone-db.ts copies within a single cluster (one URI, two
// database names) for migration rehearsals. This one crosses clusters, which is
// a different job: two connections, and the database NAME may differ on each
// side — our target is `stable-press-prod` where the source is
// `stable-press-prod-data`. Both names are taken from the URI PATH, so the
// script copies into exactly the database the app will later open (lib/db.ts
// calls `client.db()` with no argument and inherits the URI's default).
//
// NOTHING IS WRITTEN TO THE SOURCE. It is opened, read, and closed.
//
// Soft-deleted documents are copied too, deliberately. Deletes here stamp
// `deletedAt` rather than removing rows, and several unique indexes are PARTIAL
// on `{deletedAt: null}` — a "tidy" copy that dropped tombstones would change
// behaviour, not just size.
//
// Indexes are copied explicitly rather than left to ensureIndexes() on first
// boot. ensureIndexes would rebuild the baseline set, but only the specs that
// live in code; copying listIndexes() output means the new cluster matches the
// old one even where the two have drifted, and means the target is correct
// BEFORE any app process points at it.
//
// Usage:
//   SOURCE_URI="<old>" TARGET_URI="<new>" npx tsx scripts/migrate-cluster.ts
//   SOURCE_URI="<old>" TARGET_URI="<new>" npx tsx scripts/migrate-cluster.ts --apply
//   SOURCE_URI="<old>" TARGET_URI="<new>" npx tsx scripts/migrate-cluster.ts --verify
//
//   --apply      do the copy (default is a dry run that writes nothing)
//   --overwrite  drop each target collection first; required if the target
//                database already holds documents
//   --verify     compare document counts on both sides and exit non-zero on any
//                mismatch. Run it after --apply, and again at cutover.
// ---------------------------------------------------------------------------

import { MongoClient } from 'mongodb'
import type { Db, Document } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const OVERWRITE = process.argv.includes('--overwrite')
const VERIFY_ONLY = process.argv.includes('--verify')

const SOURCE_URI = (process.env.SOURCE_URI ?? '').trim()
const TARGET_URI = (process.env.TARGET_URI ?? '').trim()

if (!SOURCE_URI || !TARGET_URI) {
  console.error('Usage: SOURCE_URI="<uri>" TARGET_URI="<uri>" npx tsx scripts/migrate-cluster.ts [--apply] [--overwrite] [--verify]')
  console.error('Both URIs must end with the database name, e.g. .../stable-press-prod')
  process.exit(1)
}

/**
 * The database name from a connection string's PATH — the same value the driver
 * hands back from `client.db()`, which is what the app itself will open. A URI
 * with no path is rejected rather than defaulting: connecting the API to a
 * database called `test` is the single most expensive typo available here.
 */
function dbNameFromUri(uri: string, label: string): string {
  // Strip the scheme, then take the path segment before any query string.
  const afterHost = uri.replace(/^mongodb(\+srv)?:\/\/[^/]+/, '')
  const name = afterHost.replace(/^\//, '').split('?')[0]
  if (!name) {
    console.error(`${label} has no database name in its path. Refusing.`)
    console.error(`  Expected something like mongodb+srv://user:pass@host/stable-press-prod`)
    process.exit(1)
  }
  return decodeURIComponent(name)
}

/** Host only — used for the same-place guard and for safe logging. */
const hostOf = (uri: string): string => uri.replace(/^mongodb(\+srv)?:\/\//, '').replace(/^[^@]*@/, '').split('/')[0]

const sourceDbName = dbNameFromUri(SOURCE_URI, 'SOURCE_URI')
const targetDbName = dbNameFromUri(TARGET_URI, 'TARGET_URI')

if (hostOf(SOURCE_URI) === hostOf(TARGET_URI) && sourceDbName === targetDbName) {
  console.error('SOURCE and TARGET are the same database on the same cluster. Refusing.')
  process.exit(1)
}

/** Documents per insertMany. Bounded so a large collection never has to fit in memory. */
const BATCH = 500

/** Internal collections MongoDB manages itself; copying them is neither possible nor wanted. */
const isSystem = (name: string): boolean => name.startsWith('system.')

interface Counts {
  name: string
  source: number
  target: number
}

async function listCollectionNames(db: Db): Promise<string[]> {
  const infos = await db.listCollections().toArray()
  return infos
    .filter((c) => (c.type ?? 'collection') === 'collection' && !isSystem(c.name))
    .map((c) => c.name)
    .sort()
}

/**
 * Copy one collection's documents in bounded batches, preserving `_id` exactly —
 * every cross-document reference in this schema is an _id, so a copy that
 * regenerated them would silently sever the lot.
 */
async function copyDocuments(from: Db, to: Db, name: string): Promise<number> {
  const cursor = from.collection(name).find({}).batchSize(BATCH)
  let batch: Document[] = []
  let copied = 0

  const flush = async (): Promise<void> => {
    if (!batch.length) return
    await to.collection(name).insertMany(batch, { ordered: true })
    copied += batch.length
    batch = []
  }

  for await (const doc of cursor) {
    batch.push(doc)
    if (batch.length >= BATCH) await flush()
  }
  await flush()
  return copied
}

/**
 * Recreate the source's indexes on the target, minus the automatic `_id_`.
 *
 * `v` and `ns` are server-managed bookkeeping that createIndexes rejects, so
 * they are stripped; everything else (unique, partialFilterExpression,
 * expireAfterSeconds, sparse, collation, the index NAME) is carried across
 * verbatim. The TTL on magazine jobs and the partial-unique indexes that enforce
 * one-role-per-admin and one-report-per-reader all live in those options.
 */
async function copyIndexes(from: Db, to: Db, name: string): Promise<number> {
  const specs = await from.collection(name).listIndexes().toArray()
  const wanted = specs
    .filter((s) => s.name !== '_id_')
    .map(({ v: _v, ns: _ns, ...keep }) => keep as { key: Document; name: string })
  if (!wanted.length) return 0
  await to.collection(name).createIndexes(wanted as never)
  return wanted.length
}

async function main(): Promise<void> {
  const sourceClient = new MongoClient(SOURCE_URI, { serverSelectionTimeoutMS: 15000 })
  const targetClient = new MongoClient(TARGET_URI, { serverSelectionTimeoutMS: 15000 })
  await Promise.all([sourceClient.connect(), targetClient.connect()])

  const from = sourceClient.db(sourceDbName)
  const to = targetClient.db(targetDbName)

  console.log(`\n  SOURCE  ${hostOf(SOURCE_URI)} / ${sourceDbName}`)
  console.log(`  TARGET  ${hostOf(TARGET_URI)} / ${targetDbName}`)
  console.log(VERIFY_ONLY ? '\n  (VERIFY — comparing counts, nothing written)\n' : APPLY ? '\n  (APPLY — the target will be written to)\n' : '\n  (DRY RUN — nothing written)\n')

  const names = await listCollectionNames(from)
  const counts: Counts[] = []

  // ---- verify: compare both sides and say nothing else --------------------
  if (VERIFY_ONLY) {
    const targetNames = new Set(await listCollectionNames(to))
    let mismatches = 0
    for (const name of [...new Set([...names, ...targetNames])].sort()) {
      const source = names.includes(name) ? await from.collection(name).countDocuments() : 0
      const target = targetNames.has(name) ? await to.collection(name).countDocuments() : 0
      const flag = source === target ? ' ' : '✗'
      if (source !== target) mismatches++
      console.log(`  ${flag} ${name.padEnd(28)} ${String(source).padStart(7)} → ${String(target).padStart(7)}`)
    }
    await Promise.all([sourceClient.close(), targetClient.close()])
    if (mismatches) {
      console.error(`\n✗ ${mismatches} collection(s) differ. The target is NOT a faithful copy.`)
      process.exit(1)
    }
    console.log('\n✓ Every collection matches. Safe to cut over.')
    return
  }

  // ---- guard: never write over a target that already holds data -----------
  if (APPLY && !OVERWRITE) {
    for (const name of await listCollectionNames(to)) {
      if ((await to.collection(name).countDocuments()) > 0) {
        console.error(`Target ${targetDbName} already holds documents (${name}). Refusing.`)
        console.error('Re-run with --overwrite to drop each target collection first.')
        await Promise.all([sourceClient.close(), targetClient.close()])
        process.exit(1)
      }
    }
  }

  let totalDocs = 0
  let totalIndexes = 0

  for (const name of names) {
    const source = await from.collection(name).countDocuments()
    totalDocs += source

    if (!APPLY) {
      const indexCount = (await from.collection(name).listIndexes().toArray()).length - 1
      totalIndexes += Math.max(indexCount, 0)
      console.log(`  ${name.padEnd(28)} ${String(source).padStart(7)} docs  ${String(Math.max(indexCount, 0)).padStart(2)} idx`)
      counts.push({ name, source, target: 0 })
      continue
    }

    if (OVERWRITE) await to.collection(name).drop().catch(() => undefined)
    const copied = await copyDocuments(from, to, name)
    const indexes = await copyIndexes(from, to, name)
    totalIndexes += indexes
    const target = await to.collection(name).countDocuments()
    counts.push({ name, source, target })
    const flag = source === target ? ' ' : '✗'
    console.log(`  ${flag} ${name.padEnd(28)} ${String(copied).padStart(7)} docs  ${String(indexes).padStart(2)} idx`)
  }

  console.log(`\n  ${names.length} collection(s), ${totalDocs} document(s), ${totalIndexes} index(es)`)

  await Promise.all([sourceClient.close(), targetClient.close()])

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to copy.')
    return
  }

  const bad = counts.filter((c) => c.source !== c.target)
  if (bad.length) {
    console.error(`\n✗ ${bad.length} collection(s) did not land with a matching count:`)
    for (const c of bad) console.error(`    ${c.name}: ${c.source} → ${c.target}`)
    process.exit(1)
  }
  console.log(`\n✓ ${targetDbName} matches ${sourceDbName}, count for count. The source was not modified.`)
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
