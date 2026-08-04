/**
 * Give existing roles the `podcast` module.
 *
 *   npx tsx scripts/grant-podcast-module.ts            # dry run, prints a plan
 *   npx tsx scripts/grant-podcast-module.ts --apply    # writes
 *
 * Why this is required rather than optional: podcast production used to be a page
 * of its own at /podcast/workflow, gated on `newsroom.access` and nothing else. It
 * is a Campaign Engine screen now, which adds the MODULE axis — and `seedRoles()`
 * is INSERT-ONLY by design, so every role row written before this has a `modules`
 * array with no `podcast` entry. The rail filters on that array and
 * ProductionSystemLayout redirects away from a screen whose module the role lacks,
 * so without this the screen is invisible to every role except superadmin (whose
 * module list is materialised from the catalogue at read time) — and the people
 * who were producing episodes yesterday simply lose the surface.
 *
 * No PERMISSION is granted here, deliberately: this is a move, not a widening.
 * A role gets the module only if it already holds a podcast power, so the set of
 * people who can produce episodes is exactly what it was before the move.
 *
 * STRICTLY ADDITIVE — it only ever adds `podcast` to `modules`. Re-running is
 * safe, and a superadmin who deliberately unticks the module afterwards will have
 * it handed back only by another explicit run.
 *
 * RESTART THE API AFTERWARDS. roleRegistry filters each role's stored modules
 * against the MODULE_CATALOGUE compiled into the running process, so an API
 * started before the catalogue row existed strips `podcast` back out on every
 * request — DB row correct, session payload without it, no rail entry, nothing in
 * the logs. See the same note in grant-instant-module.ts.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const PODCAST_MODULE = 'podcast'

/**
 * Holding ANY podcast power means this role was doing podcast work before the
 * move and must keep its surface. Listed rather than prefix-matched so a future
 * `podcast.*` id has to be considered here on purpose.
 */
const ENABLING_PERMISSIONS = [
  'podcast.manage',
  'podcast.episode.create',
  'podcast.episode.edit_own',
  'podcast.episode.edit_any',
  'podcast.audio.upload',
  'podcast.guests.manage',
  'podcast.episode.schedule',
  'podcast.episode.submit_review',
  'podcast.episode.approve',
  'podcast.episode.publish',
  'podcast.distribution.manage',
  'podcast.episode.delete',
  'podcast.read_all',
]

interface RoleRow {
  _id: unknown
  slug?: string
  permissions?: unknown
  modules?: unknown
  isImmutable?: boolean
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const uri = (process.env.MONGODB_URI ?? '').trim()
  if (!uri) {
    console.error('MONGODB_URI is not set. Point it at the environment you mean to migrate.')
    process.exit(1)
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  const db = client.db()
  console.log(`[migrate] connected: ${uri.replace(/:([^@]+)@/, ':***@')}`)
  console.log(apply ? '[migrate] APPLY — writing changes\n' : '[migrate] DRY RUN — no writes (pass --apply)\n')

  const roles = (await db.collection('roles').find({ deletedAt: null }).toArray()) as RoleRow[]
  let changed = 0

  for (const role of roles) {
    const slug = String(role.slug ?? '(no slug)')
    const held = asStrings(role.permissions)
    const modules = asStrings(role.modules)

    if (modules.includes(PODCAST_MODULE)) {
      console.log(`  ${slug.padEnd(16)} — already has it`)
      continue
    }

    // The immutable superadmin row is display-only (enforcement short-circuits
    // before it is read), but keeping it accurate stops the Roles console from
    // showing a superadmin with Podcast unticked.
    const eligible = role.isImmutable || ENABLING_PERMISSIONS.some((p) => held.includes(p))
    if (!eligible) {
      console.log(`  ${slug.padEnd(16)} — skipped (holds no podcast permission)`)
      continue
    }

    changed++
    console.log(`  ${slug.padEnd(16)} +module:${PODCAST_MODULE}`)

    if (apply) {
      await db.collection('roles').updateOne(
        { _id: role._id as never },
        { $set: { modules: [...modules, PODCAST_MODULE], updatedAt: new Date().toISOString() } },
      )
    }
  }

  console.log(
    `\n[migrate] ${changed} role(s) ${apply ? 'updated' : 'would change'} of ${roles.length} examined.`,
  )
  if (changed > 0 && apply) {
    console.log('[migrate] Restart the API so the role cache picks these up (or wait for its TTL).')
  }
  await client.close()
}

main().catch((err) => {
  console.error('[migrate] failed:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
