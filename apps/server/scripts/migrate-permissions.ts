// ---------------------------------------------------------------------------
// Rewrite every role onto the screen × verb model.
//
//   permissions   the old ids → `<screen>.<verb>` (see LEGACY_PERMISSION_ALIASES)
//   scopes        NEW — 'own' | 'all' per screen, replacing the edit_own/edit_any
//                 pairs. `edit_any` in the old array becomes 'all'.
//   modules       DELETED from the row. Derived from each `<id>.view` now.
//   workflowStages DELETED from the row. Derived from `workflow.view`.
//
// SAFE TO DELAY, NOT SAFE TO SKIP. The app reads through the same alias map at
// runtime (`projectRole` → `normalisePermissions`), so an unmigrated role
// resolves correctly today. What the migration buys is that the STORED row stops
// being a lie — until it runs, the Roles console writes new ids while the row
// still carries old ones, and the aliases cannot be removed.
//
// TWO THINGS IT DOES THAT THE ALIASES CANNOT:
//
//   1. THE REGISTERS. `content.draft.create` gated the four Stables screens for
//      navigation only, so "may start a story draft" decided who could edit the
//      horse register. Those verbs are real now, and are granted from the role's
//      old MODULE list — the honest record of which registers it could open —
//      never from that permission.
//
//   2. MAGAZINES. They had no permission at all: every staff member could build,
//      share and delete an edition. Roles that held the module keep that access
//      (--strict-magazine withholds it instead and makes an admin re-grant).
//
// Usage:
//   npx tsx scripts/migrate-permissions.ts                  # dry run, prints the diff
//   npx tsx scripts/migrate-permissions.ts --apply
//   npx tsx scripts/migrate-permissions.ts --apply --strict-magazine
//
// Needs MONGODB_URI. RESTART THE API AFTERWARDS.
// ---------------------------------------------------------------------------

import { MongoClient } from 'mongodb'
import {
  BUILTIN_ROLE_PERMISSIONS,
  BUILTIN_ROLE_SCOPES,
  LEGACY_SCOPE_ALL,
  PERMISSION_CATALOGUE,
  SCOPED_SCREENS,
  normalisePermissions,
  type PermissionAction,
  type SeedRoleName,
} from '../src/lib/permissionCatalogue.js'

const APPLY = process.argv.includes('--apply')
const STRICT_MAGAZINE = process.argv.includes('--strict-magazine')
const uri = (process.env.MONGODB_URI ?? '').trim()

if (!uri) {
  console.error('MONGODB_URI is required.')
  process.exit(1)
}

/**
 * Old module id → the register verbs it should become.
 *
 * Read from `modules`, not from `permissions`: the module list is the only place
 * that recorded which registers a role could actually open. `delete` is withheld
 * everywhere — removing register entries was admin-only before, and a migration
 * must not hand out a power nobody had.
 */
const REGISTER_FROM_MODULE: Record<string, string> = {
  horses: 'horses',
  parties: 'people',
  'media-production-system': 'media-records',
  'racing-production-system': 'racing-records',
}

const MAGAZINE_MODULES = ['magazine-v2', 'magazine']

const SEEDED: SeedRoleName[] = ['contributor', 'editor', 'administrator']

function migrateRole(doc: Record<string, any>): { permissions: PermissionAction[]; scopes: Record<string, string> } {
  const oldPermissions: string[] = Array.isArray(doc.permissions) ? doc.permissions.map(String) : []
  const oldModules: string[] = Array.isArray(doc.modules) ? doc.modules.map(String) : []

  // SEEDED ROLES ARE RESET, NOT INFERRED.
  //
  // Their old `modules` array was itself DERIVED from `content.draft.create`
  // (builtinModulesFor), so it is not a record of what anyone decided — it is a
  // record of that one permission. Inferring from it handed `contributor` the
  // Magazine Builder including publish, which it never had. The new definitions
  // are the intent, so use them.
  if (doc.isSuper === true) {
    return {
      permissions: PERMISSION_CATALOGUE.map((p) => p.id),
      scopes: Object.fromEntries(SCOPED_SCREENS.map((s) => [s, 'all'])),
    }
  }
  const seeded = SEEDED.find((n) => n === doc.name)
  if (seeded) {
    return {
      permissions: [...BUILTIN_ROLE_PERMISSIONS[seeded]],
      scopes: { ...BUILTIN_ROLE_SCOPES[seeded] },
    }
  }

  const next = new Set<string>(normalisePermissions(oldPermissions))

  // 1. The four registers, from the modules the role could open.
  for (const [moduleId, screen] of Object.entries(REGISTER_FROM_MODULE)) {
    if (!oldModules.includes(moduleId)) continue
    next.add(`${screen}.view`)
    // Write access followed staff-ness before, so anyone who could open the
    // register could edit it. Create and edit are preserved; delete is not.
    next.add(`${screen}.create`)
    next.add(`${screen}.edit`)
  }

  // 2. Magazines, which had no permission of their own.
  if (!STRICT_MAGAZINE && oldModules.some((m) => MAGAZINE_MODULES.includes(m))) {
    for (const verb of ['view', 'create', 'edit', 'publish']) next.add(`magazine.${verb}`)
  }

  // 3. The lens screens kept their own module rows; carry those across.
  for (const [moduleId, screen] of [
    ['workflow', 'workflow'],
    ['pipeline', 'pipeline'],
    ['editor-hub', 'editor-hub'],
    ['instant', 'instant'],
    ['comment-moderation', 'comments'],
    ['emoji-analytics', 'emoji-analytics'],
    ['analytics', 'analytics'],
    ['team', 'team'],
    ['roles', 'roles'],
    ['settings', 'settings'],
    ['all-stories', 'stories'],
    ['blogs', 'blogs'],
    ['podcast', 'podcast'],
  ] as const) {
    if (oldModules.includes(moduleId)) next.add(`${screen}.view`)
  }

  const permissions = normalisePermissions([...next])

  // 4. Scope. `edit_any` in the old array meant everyone's work.
  const scopes: Record<string, string> = {}
  for (const [legacyId, screen] of Object.entries(LEGACY_SCOPE_ALL)) {
    if (oldPermissions.includes(legacyId)) scopes[screen] = 'all'
  }
  return { permissions, scopes }
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()

  const roles = await db.collection('roles').find({ deletedAt: null }).toArray()
  console.log(`\n${roles.length} role(s) in ${db.databaseName}\n`)

  let changed = 0
  for (const role of roles) {
    const { permissions, scopes } = migrateRole(role)
    const before: string[] = Array.isArray(role.permissions) ? role.permissions.map(String) : []

    const added = permissions.filter((p) => !before.includes(p))
    const removed = before.filter((p) => !permissions.includes(p as PermissionAction))

    console.log(`  ${role.name}`)
    console.log(`    ${before.length} old id(s) → ${permissions.length} new`)
    if (removed.length) console.log(`    dropped : ${removed.join(', ')}`)
    if (added.length) console.log(`    added   : ${added.join(', ')}`)
    console.log(`    scopes  : ${Object.keys(scopes).length ? JSON.stringify(scopes) : '(all own)'}`)

    if (APPLY) {
      await db.collection('roles').updateOne(
        { _id: role._id },
        {
          $set: { permissions, scopes, updatedAt: new Date().toISOString() },
          // The two derived axes stop being stored. Leaving them would let a
          // stale array outlive the model that read it.
          $unset: { modules: '', workflowStages: '' },
        },
      )
      changed++
    }
  }

  if (APPLY) {
    console.log(`\n✓ rewrote ${changed} role(s). RESTART THE API — roleRegistry caches definitions.`)
  } else {
    console.log('\nDry run. Nothing was written. Re-run with --apply.')
    if (!STRICT_MAGAZINE) {
      console.log('Magazine access is PRESERVED for roles that hold the module; --strict-magazine withholds it.')
    }
  }

  await client.close()
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
