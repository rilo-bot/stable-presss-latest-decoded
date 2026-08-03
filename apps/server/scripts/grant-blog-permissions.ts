/**
 * Grant the new `blog.*` permissions to roles that already exist.
 *
 *   npx tsx scripts/grant-blog-permissions.ts            # dry run, prints a plan
 *   npx tsx scripts/grant-blog-permissions.ts --apply    # writes
 *
 * Why this is required rather than optional: `seedRoles()` is INSERT-ONLY by
 * design — once a superadmin edits a seeded role, a redeploy must never quietly
 * revert it. That contract is right, but it means an environment seeded before
 * the Blogs feature has `administrator`, `editor` and `contributor` rows whose
 * permission arrays were materialised without any `blog.*` entry. Those roles
 * would deploy with Blogs invisible and every write 403-ing, with nothing in the
 * logs to say why.
 *
 * Superadmin is unaffected either way: `accountCan` short-circuits on it before
 * consulting the stored permission set, so it never needed the grant.
 *
 * The mapping mirrors the seed matrix in permissionCatalogue.ts. A role gets a
 * blog permission if it already holds the equivalent story permission, so a
 * hand-built custom role is treated on the same footing as a seeded one and an
 * admin's existing intent is carried across rather than guessed at.
 *
 * STRICTLY ADDITIVE — this only ever adds entries to `permissions`/`modules`.
 * It never removes one, so re-running it is safe and a superadmin who
 * deliberately revokes a blog permission afterwards will not have it handed
 * back by a second run... unless the equivalent story permission is still held,
 * which is why this is a one-off script and not a boot hook.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

/** story permission already held → blog permission to grant */
const IMPLIES: Record<string, string> = {
  'content.draft.create': 'blog.create',
  'content.draft.edit_own': 'blog.edit_own',
  'content.draft.edit_any': 'blog.edit_any',
  'content.publish': 'blog.publish',
}

/**
 * Deleting a blog is not implied by any single story permission — `articles`
 * gates DELETE on `content.draft.edit_any`, so that is the honest equivalent.
 */
const DELETE_IMPLIED_BY = 'content.draft.edit_any'

const BLOGS_MODULE = 'blogs'

interface RoleRow {
  _id: unknown
  slug?: string
  label?: string
  permissions?: unknown
  modules?: unknown
  isImmutable?: boolean
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** The blog permissions a role should gain, given what it already holds. */
function grantsFor(held: string[]): string[] {
  const has = new Set(held)
  const out = new Set<string>()
  for (const [story, blog] of Object.entries(IMPLIES)) {
    if (has.has(story)) out.add(blog)
  }
  if (has.has(DELETE_IMPLIED_BY)) out.add('blog.delete')
  // Only keep what isn't already there, so the plan reads as a real diff.
  return [...out].filter((p) => !has.has(p))
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

    // The immutable superadmin row is display-only — enforcement short-circuits
    // before it is ever read — but keeping it accurate costs nothing and stops
    // the Roles console from showing a superadmin with Blogs unticked.
    const held = asStrings(role.permissions)
    const modules = asStrings(role.modules)

    const newPerms = role.isImmutable
      ? ['blog.create', 'blog.edit_own', 'blog.edit_any', 'blog.publish', 'blog.delete'].filter(
          (p) => !held.includes(p),
        )
      : grantsFor(held)

    const needsModule = newPerms.length > 0 && !modules.includes(BLOGS_MODULE)

    if (newPerms.length === 0 && !needsModule) {
      console.log(`  ${slug.padEnd(16)} — nothing to do`)
      continue
    }

    changed++
    const parts: string[] = []
    if (newPerms.length) parts.push(`+${newPerms.join(' +')}`)
    if (needsModule) parts.push(`+module:${BLOGS_MODULE}`)
    console.log(`  ${slug.padEnd(16)} ${parts.join('  ')}`)

    if (apply) {
      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (newPerms.length) update.permissions = [...held, ...newPerms]
      if (needsModule) update.modules = [...modules, BLOGS_MODULE]
      await db.collection('roles').updateOne({ _id: role._id as never }, { $set: update })
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
