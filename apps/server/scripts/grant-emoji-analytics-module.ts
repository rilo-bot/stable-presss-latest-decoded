/**
 * Give existing roles the `emoji-analytics` module.
 *
 *   npx tsx scripts/grant-emoji-analytics-module.ts            # dry run, prints a plan
 *   npx tsx scripts/grant-emoji-analytics-module.ts --apply    # writes
 *
 * Same reason as grant-instant-module.ts: `seedRoles()` is INSERT-ONLY, so a role
 * row written before this module existed has a `modules` array without it. The
 * sidebar filters on that array and ProductionSystemLayout redirects away from a
 * screen whose module the role lacks — so without this the screen is invisible to
 * every role except superadmin (whose module list is materialised from the
 * catalogue at read time), with nothing in the logs to say why.
 *
 * The gate is `analytics.view`, the same permission the module row carries: a
 * role that may read the newsroom's numbers may read the reader-sentiment ones.
 * No new permission is granted here — the screen is static sample data and calls
 * no endpoint at all.
 *
 * STRICTLY ADDITIVE and safe to re-run. A superadmin who deliberately unticks the
 * module gets it back only from another explicit run, which is why this is a
 * one-off script rather than a boot hook.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const MODULE = 'emoji-analytics'
const ENABLING_PERMISSION = 'analytics.view'

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

    if (modules.includes(MODULE)) {
      console.log(`  ${slug.padEnd(16)} — already has it`)
      continue
    }

    // The immutable superadmin row is display-only (enforcement short-circuits
    // before it is read), but keeping it accurate stops the Roles console from
    // showing a superadmin with the module unticked.
    const eligible = role.isImmutable || held.includes(ENABLING_PERMISSION)
    if (!eligible) {
      console.log(`  ${slug.padEnd(16)} — skipped (no ${ENABLING_PERMISSION})`)
      continue
    }

    changed++
    console.log(`  ${slug.padEnd(16)} +module:${MODULE}`)

    if (apply) {
      await db.collection('roles').updateOne(
        { _id: role._id as never },
        { $set: { modules: [...modules, MODULE], updatedAt: new Date().toISOString() } },
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
