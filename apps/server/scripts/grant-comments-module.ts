/**
 * Give existing roles the `comments.edit` permission and the
 * `comment-moderation` module.
 *
 *   npx tsx scripts/grant-comments-module.ts            # dry run, prints a plan
 *   npx tsx scripts/grant-comments-module.ts --apply    # writes
 *
 * Same reason as grant-emoji-analytics-module.ts: `seedRoles()` is INSERT-ONLY, so
 * a role row written before this feature existed has neither the new permission
 * nor the new module id. The sidebar filters on the module array and
 * ProductionSystemLayout redirects away from a screen whose module the role lacks
 * — so without this the Comments desk is invisible to every role except superadmin
 * (whose module list is materialised from the catalogue at read time), with nothing
 * in the logs to say why.
 *
 * UNLIKE the emoji-analytics grant, this one hands out a NEW PERMISSION as well as
 * a module, because there was no existing permission that meant "may act on
 * another reader's comment". That makes it a real privilege change, so it is
 * deliberately narrow:
 *
 *   • A role gets it only if it already holds `stories.publish` — the power to put
 *     words in front of the public is the honest prerequisite for deciding which
 *     of the public's words stay up. In practice that is editors and
 *     administrators, and not contributors.
 *   • The immutable superadmin row is updated for display only; enforcement
 *     short-circuits before it is read.
 *   • Nothing is ever removed, and re-running changes nothing on a role that
 *     already has both.
 *
 * A superadmin who deliberately unticks either gets it back only from another
 * explicit run, which is why this is a one-off script and not a boot hook.
 *
 * AFTER APPLYING: restart the API. `roleRegistry` filters each role's stored
 * modules against the MODULE_CATALOGUE compiled into the RUNNING process, so a
 * server started before this feature shipped strips `comment-moderation` out of
 * every role on every request no matter what the database says.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const MODULE = 'comment-moderation'
const PERMISSION = 'comments.edit'
/** Holding this is what makes a role eligible. See the note above. */
const PREREQUISITE = 'stories.publish'

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

    const needsPermission = !held.includes(PERMISSION)
    const needsModule = !modules.includes(MODULE)

    if (!needsPermission && !needsModule) {
      console.log(`  ${slug.padEnd(16)} — already has both`)
      continue
    }

    const eligible = role.isImmutable || held.includes(PREREQUISITE)
    if (!eligible) {
      console.log(`  ${slug.padEnd(16)} — skipped (no ${PREREQUISITE})`)
      continue
    }

    changed++
    const additions = [needsPermission ? `+${PERMISSION}` : '', needsModule ? `+module:${MODULE}` : '']
      .filter(Boolean)
      .join(' ')
    console.log(`  ${slug.padEnd(16)} ${additions}`)

    if (apply) {
      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (needsPermission) update.permissions = [...held, PERMISSION]
      if (needsModule) update.modules = [...modules, MODULE]
      await db.collection('roles').updateOne({ _id: role._id as never }, { $set: update })
    }
  }

  console.log(
    `\n[migrate] ${changed} role(s) ${apply ? 'updated' : 'would change'} of ${roles.length} examined.`,
  )
  if (changed > 0 && apply) {
    console.log('[migrate] RESTART THE API — the running process filters modules against its own catalogue.')
  }
  await client.close()
}

main().catch((err) => {
  console.error('[migrate] failed:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
