/**
 * Give existing roles the `instant` module.
 *
 *   npx tsx scripts/grant-instant-module.ts            # dry run, prints a plan
 *   npx tsx scripts/grant-instant-module.ts --apply    # writes
 *
 * Why this is required rather than optional: `seedRoles()` is INSERT-ONLY by
 * design, so a role row written before Instant existed has a `modules` array with
 * no `instant` entry. The sidebar filters on that array and
 * ProductionSystemLayout redirects away from a screen whose module the role
 * lacks — so without this the module is invisible to every role except
 * superadmin (whose module list is materialised from the catalogue at read time),
 * with nothing in the logs to say why.
 *
 * No PERMISSION is granted here, and that is deliberate. Instant creates nothing
 * of its own: its two modes save through `POST /api/articles` and
 * `POST /api/blogs`, which already demand `content.draft.create` and
 * `blog.create`. So the only thing a role needs is the surface, and it is only
 * worth having if the role can already file one of the two. A role with neither
 * permission gets no module — it would open onto the screen's own
 * "no draft permissions" state, which is honest but pointless.
 *
 * STRICTLY ADDITIVE — it only ever adds `instant` to `modules`. Re-running is
 * safe, and a superadmin who deliberately unticks the module afterwards will have
 * it handed back only by another explicit run of this script (which is why this
 * is a one-off, not a boot hook).
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const INSTANT_MODULE = 'instant'

/** Holding EITHER of these means Instant has somewhere to save to. */
const ENABLING_PERMISSIONS = ['content.draft.create', 'blog.create']

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

    if (modules.includes(INSTANT_MODULE)) {
      console.log(`  ${slug.padEnd(16)} — already has it`)
      continue
    }

    // The immutable superadmin row is display-only (enforcement short-circuits
    // before it is read), but keeping it accurate stops the Roles console from
    // showing a superadmin with Instant unticked.
    const eligible = role.isImmutable || ENABLING_PERMISSIONS.some((p) => held.includes(p))
    if (!eligible) {
      console.log(`  ${slug.padEnd(16)} — skipped (can create neither stories nor posts)`)
      continue
    }

    changed++
    console.log(`  ${slug.padEnd(16)} +module:${INSTANT_MODULE}`)

    if (apply) {
      await db.collection('roles').updateOne(
        { _id: role._id as never },
        { $set: { modules: [...modules, INSTANT_MODULE], updatedAt: new Date().toISOString() } },
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
