/**
 * Delete S3 objects that NO database record references any more.
 *
 *   npx tsx scripts/sweep-orphan-objects.ts             # dry run — prints a plan
 *   npx tsx scripts/sweep-orphan-objects.ts --days=30   # only objects older than 30d
 *   npx tsx scripts/sweep-orphan-objects.ts --apply --confirm=<bucket>
 *
 * WHY A SWEEPER RATHER THAN DELETING ON REPLACE
 *
 * Deleting the old object inline when someone swaps a horse photo looks simpler,
 * and it is wrong with the key scheme we have. Upload keys are
 * `public/<kind>/<userId>/<uuid>-<name>` — scoped to the UPLOADER, not to the
 * record — and every image field in the CRM also accepts a pasted URL. So one
 * object can legitimately be referenced by several records (paste a horse's photo
 * URL onto an article, reuse a party photo on a profile), and a replace on one of
 * them tells you nothing about the others. Inline deletion would silently break a
 * published page, surfacing as a missing image days later with no trail back to the
 * edit that caused it.
 *
 * Reachability is the only sound test and it can only be answered by looking at
 * every record at once — which is this script. It also reclaims everything orphaned
 * by every replace that ALREADY happened, which inline deletion never could.
 *
 * Explicit removals still delete immediately (see the blog media DELETE route):
 * there the asset is per-post, its key is recorded, and a person is discarding it
 * on purpose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUCKET IS SHARED, AND THAT IS THE HARD PART
 *
 * `decoded-studios-storage` holds several Decoded Studios products. Its root has
 * ~45 named prefixes and 35 per-record hex-id trees; only a handful are ours. Worse,
 * the overlap is by NAME: another app writes `public/avatar/…`, `public/document/`,
 * `public/logo/`, `public/property/`, `dd-evidence/`, `MEDICAL/`. "Everything under
 * public/avatar/" is therefore NOT a definition of our files, and treating it as one
 * would delete another product's data.
 *
 * So ownership here is PROVEN, not assumed. A key counts as ours only if it parses
 * as our own grammar AND its id segment resolves to a real row in OUR database:
 *
 *   public/<kind>/<userId>/…        userId  ∈ users
 *   public/magazinesV2/<id>/…       id      ∈ magazinesV2
 *   public/blogs/<id>/…             id      ∈ blogs
 *
 * Anything we cannot prove is left alone. That means a hard-deleted parent leaves
 * its objects unsweepable forever — the right trade: incomplete beats destructive.
 * (Record deletes in this codebase are SOFT, so ids normally survive and keep both
 * their ownership claim and their references intact.)
 *
 * FIVE MORE SAFETY RULES, because this is the one script here that destroys data
 * that is not in the database:
 *
 *  1. AGE FLOOR. An object younger than --days (default 7) is never touched. An
 *     upload that has landed but whose record is not saved yet is indistinguishable
 *     from an orphan; time is what tells them apart.
 *  2. WHOLE-DOCUMENT SCAN. References are harvested by stringifying each document,
 *     not from a list of known fields — a field list would be wrong the day someone
 *     adds one, and "no reference found" is a delete.
 *  3. SANITY FLOOR. Implausibly few references aborts the run. A failed DB scan
 *     makes every object look unreferenced, and that must never feed a bulk delete.
 *  4. ENVIRONMENT CONFIRMATION. --apply requires --confirm=<bucket>, so the
 *     operator has to read which database and which bucket are paired.
 *  5. DRY RUN BY DEFAULT.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { ObjectId } from 'mongodb'
import { storage } from '../src/lib/storage.js'

const APPLY = process.argv.includes('--apply')
const daysArg = process.argv.find((a) => a.startsWith('--days='))
const MIN_AGE_DAYS = daysArg ? Math.max(1, parseInt(daysArg.split('=')[1] ?? '7', 10) || 7) : 7
/**
 * --confirm=<bucket name>, required alongside --apply.
 *
 * The failure mode this exists for is specific and has bitten this project before:
 * apps/server/.env points MONGODB_URI at a TEST cluster while S3_BUCKET is the
 * shared production bucket. Reachability is then computed from the wrong database,
 * every production image looks unreferenced, and --apply deletes the lot. No
 * heuristic detects that reliably, so the operator types the bucket name and, in
 * doing so, reads which bucket and which database this run has paired.
 */
const confirmArg = process.argv.find((a) => a.startsWith('--confirm='))
const CONFIRMED_BUCKET = confirmArg ? (confirmArg.split('=')[1] ?? '').trim() : ''

/** The upload kinds in routes/uploads.ts. Keys are `<kind>/<userId>/…`. */
const UPLOAD_KINDS = ['party', 'horse', 'media', 'avatar', 'podcast', 'blog', 'evidence', 'misc'] as const

/**
 * Prefixes we LIST. Narrowing the listing is an efficiency measure only — every
 * key found is still put through the ownership proof below, which is what actually
 * keeps other products' files safe.
 */
const SEARCH_PREFIXES = [
  ...UPLOAD_KINDS.map((k) => `public/${k}/`),
  'public/blogs/',
  'public/magazinesV2/',
  // Legacy, pre-`public/` keys still referenced by older records.
  ...UPLOAD_KINDS.map((k) => `${k}/`),
  'magazinesV2/',
]

/** Below this many referenced keys we assume the scan failed and refuse to delete. */
const MIN_PLAUSIBLE_REFERENCES = 5

/** Roots our keys can start with, longest first so `blogs/` can't read as `blog/`. */
const KEY_ROOTS = [...UPLOAD_KINDS, 'blogs', 'magazinesV2'].sort((a, b) => b.length - a.length)

/**
 * Every S3 key mentioned anywhere in a document.
 *
 * One pattern covers all three forms a key travels in — a bare stored `key`, a
 * proxied `/api/uploads/file/<key>` URL, and a direct bucket/CDN URL — because in
 * all of them the key appears verbatim, optionally behind `public/`. Matching the
 * key SHAPE rather than a list of field names is the point: a new field holding an
 * image URL must not turn that image into an orphan.
 *
 * Deliberately greedy. Over-matching keeps an object alive; under-matching deletes
 * a live one.
 */
function keysIn(text: string): string[] {
  const re = new RegExp(`(?:public/)?(?:${KEY_ROOTS.join('|')})/[^"'\\s?)\\\\]+`, 'g')
  const found: string[] = []
  for (const raw of text.match(re) ?? []) {
    let key = raw
    try {
      key = decodeURIComponent(raw)
    } catch {
      /* keep the raw form — an undecodable match still protects the object */
    }
    // Record both spellings: a record may hold the prefixed key or the legacy
    // un-prefixed one, and either must protect the object.
    found.push(key)
    found.push(key.startsWith('public/') ? key.slice('public/'.length) : `public/${key}`)
  }
  return found
}

interface OwnedIds {
  users: Set<string>
  magazines: Set<string>
  blogs: Set<string>
}

/**
 * Is this key provably ours? Returns the reason it qualifies, or null.
 *
 * The id segment must resolve in our own database. That is what separates our
 * `public/avatar/<ourUserId>/<uuid>-photo.jpg` from the other product's
 * `public/avatar/<theirId>/<uuid>.png` sitting in the very same folder.
 */
function ownedBy(key: string, ids: OwnedIds): string | null {
  const path = key.startsWith('public/') ? key.slice('public/'.length) : key
  const [root = '', segment = '', ...rest] = path.split('/')
  if (!segment || rest.length === 0) return null // never a bare `<root>/<file>`

  if ((UPLOAD_KINDS as readonly string[]).includes(root)) {
    return ids.users.has(segment) ? `${root} upload by a known user` : null
  }
  if (root === 'magazinesV2') return ids.magazines.has(segment) ? 'magazine asset' : null
  if (root === 'blogs') return ids.blogs.has(segment) ? 'blog stock photo' : null
  return null
}

/** Every _id in a collection, as strings — both ObjectId and string ids. */
async function idsOf(database: import('mongodb').Db, name: string): Promise<Set<string>> {
  const out = new Set<string>()
  for await (const doc of database.collection(name).find({}, { projection: { _id: 1 } })) {
    const id = doc._id
    out.add(id instanceof ObjectId ? id.toHexString() : String(id))
  }
  return out
}

async function main(): Promise<void> {
  if (!storage.isConfigured()) {
    console.error('S3 is not configured — nothing to sweep. Set S3_BUCKET/S3_REGION/AWS_* in apps/server/.env')
    process.exit(1)
  }
  const uri = (process.env.MONGODB_URI ?? '').trim()
  if (!uri) {
    console.error('MONGODB_URI is required.')
    process.exit(1)
  }

  const bucket = (process.env.S3_BUCKET ?? '').trim()
  console.log(`\nOrphan sweep — ${APPLY ? 'APPLY (will delete)' : 'DRY RUN'}, age floor ${MIN_AGE_DAYS}d`)
  console.log(`  bucket:   ${bucket}`)
  console.log(`  database: ${uri.replace(/:([^@]+)@/, ':***@')}\n`)

  // The two above MUST describe the same environment. Reachability computed from
  // one environment's database can only ever be nonsense about another's bucket.
  if (APPLY && CONFIRMED_BUCKET !== bucket) {
    console.error(
      'REFUSING TO DELETE.\n\n' +
        'Check that the database and bucket printed above belong to the SAME environment.\n' +
        'A test database against a production bucket makes every live image look orphaned.\n\n' +
        `Then re-run with:  --apply --confirm=${bucket}`,
    )
    process.exit(1)
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  const database = client.db()
  console.log('[db] connected:', uri.replace(/:([^@]+)@/, ':***@'))

  // ── 1. Who we are: the ids that make a key provably ours.
  const ids: OwnedIds = {
    users: await idsOf(database, 'users'),
    magazines: await idsOf(database, 'magazinesV2'),
    blogs: await idsOf(database, 'blogs'),
  }
  console.log(`\nOwnership basis — users: ${ids.users.size}, magazines: ${ids.magazines.size}, blogs: ${ids.blogs.size}`)

  // ── 2. Harvest every key referenced by any document, in any collection.
  const referenced = new Set<string>()
  const collections = await database.listCollections().toArray()
  for (const { name } of collections) {
    let hits = 0
    // Stream rather than toArray(): magazine documents are large and there is no
    // reason to hold a whole collection in memory to scan it.
    for await (const doc of database.collection(name).find({})) {
      const keys = keysIn(JSON.stringify(doc))
      hits += keys.length
      for (const k of keys) referenced.add(k)
    }
    if (hits > 0) console.log(`  ${name}: ${hits} key references`)
  }
  await client.close()

  console.log(`\nReferenced keys: ${referenced.size}`)
  if (referenced.size < MIN_PLAUSIBLE_REFERENCES) {
    console.error(
      `\nABORT: only ${referenced.size} referenced keys found (floor is ${MIN_PLAUSIBLE_REFERENCES}).\n` +
        'That looks like a failed scan, not an empty bucket. Nothing deleted.',
    )
    process.exit(1)
  }

  // ── 3. List the bucket and keep only objects we can PROVE are ours.
  const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000
  const orphans: { key: string; size: number }[] = []
  let listed = 0
  let notOurs = 0
  let tooNew = 0

  for (const prefix of SEARCH_PREFIXES) {
    const objects = await storage.listObjectKeys(prefix)
    listed += objects.length
    for (const obj of objects) {
      if (!ownedBy(obj.key, ids)) {
        notOurs++
        continue
      }
      if (referenced.has(obj.key)) continue
      // Also accept the `public/`-less spelling, for records that stored the key
      // before the prefix existed.
      if (obj.key.startsWith('public/') && referenced.has(obj.key.slice('public/'.length))) continue
      if (obj.lastModified && obj.lastModified.getTime() > cutoff) {
        tooNew++
        continue
      }
      orphans.push({ key: obj.key, size: obj.size })
    }
  }

  const totalBytes = orphans.reduce((sum, o) => sum + o.size, 0)
  const mb = (totalBytes / (1024 * 1024)).toFixed(1)
  console.log(`\nObjects listed under our prefixes: ${listed}`)
  console.log(`  not provably ours (other products share this bucket): ${notOurs}`)
  console.log(`  skipped, younger than ${MIN_AGE_DAYS}d: ${tooNew}`)
  console.log(`  ORPHANS: ${orphans.length} (${mb} MB)\n`)

  for (const o of orphans.slice(0, 40)) console.log(`  ${(o.size / 1024).toFixed(0).padStart(7)} KB  ${o.key}`)
  if (orphans.length > 40) console.log(`  … and ${orphans.length - 40} more`)

  if (!APPLY) {
    console.log(`\nDry run — nothing deleted. To delete: --apply --confirm=${bucket}`)
    return
  }

  let deleted = 0
  let failed = 0
  for (const o of orphans) {
    if (await storage.deleteObject(o.key)) deleted++
    else failed++
  }
  console.log(`\nDeleted ${deleted} objects (${mb} MB). Failed: ${failed}.`)
}

main().catch((err) => {
  console.error('\nSweep failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
