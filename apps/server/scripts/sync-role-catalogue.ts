// ---------------------------------------------------------------------------
// Reconcile stored role rows with the CURRENT permission catalogue.
//
// `seedRoles` is insert-only by design: once a superadmin edits a seeded role, a
// redeploy must never quietly revert their change. The cost of that contract is
// that the catalogue can move underneath a role row and nothing notices —
// permissions removed from the catalogue linger, and permissions ADDED to it
// never reach the roles that ought to hold everything.
//
// This script closes both gaps, and only those two:
//
//   1. PRUNE ids that no longer exist in the catalogue, from every role. They
//      authorize nothing (accountCan matches against the catalogue), but they
//      survive every round-trip through the Roles console and show up in audits
//      as if they were real. Three retired workflow gates and two superseded
//      workflow-column permissions are the current crop.
//
//   2. TOP UP the two roles whose contract is "holds everything" — `superadmin`
//      and `administrator`. Any other role is left strictly alone: adding a new
//      permission to `editor` is a policy decision for a human, not a migration.
//
//   3. RE-DERIVE MODULES for the SEEDED roles, additively. A seeded role's module
//      list is computed from the module catalogue's `requiresPermission` at seed
//      time (`builtinModulesFor`), so when a module's gate CHANGES the stored list
//      silently goes stale. That just happened: the `team` module moved from
//      `team.manage` to `team.view`, which is what makes `team.view` mean something
//      — but `editor` was seeded before the change and so still had no Team screen,
//      holding the permission that is supposed to grant it.
//
// It NEVER removes a valid permission or module from a role, and never touches a
// custom (non-seeded) role beyond pruning dead ids.
//
// Usage:
//   npx tsx scripts/sync-role-catalogue.ts            # dry run (default)
//   npx tsx scripts/sync-role-catalogue.ts --apply
// ---------------------------------------------------------------------------

import { db } from '../src/lib/db.js'
import {
  ALL_WORKFLOW_STAGES,
  BUILTIN_ROLE_LABELS,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  builtinModulesFor,
  isModuleId,
  isPermissionAction,
  isWorkflowStage,
  type SeedRoleSlug,
} from '../src/lib/permissionCatalogue.js'
import { SUPERADMIN_SLUG, bustRoleCache } from '../src/lib/roleRegistry.js'

const APPLY = process.argv.includes('--apply')

/** The roles whose documented contract is "every permission, always". */
const HOLDS_EVERYTHING = new Set([SUPERADMIN_SLUG, 'administrator'])

const ALL_PERMISSIONS = PERMISSION_CATALOGUE.map((p) => p.id)
const ALL_MODULES = MODULE_CATALOGUE.map((m) => m.id)

interface Change {
  slug: string
  prunedPermissions: string[]
  prunedModules: string[]
  prunedStages: string[]
  addedPermissions: string[]
  addedModules: string[]
  addedStages: string[]
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

async function main(): Promise<void> {
  const roles = await db.collection('roles').find()
  console.log(
    `catalogue: ${ALL_PERMISSIONS.length} permissions, ${ALL_MODULES.length} modules, ` +
      `${ALL_WORKFLOW_STAGES.length} stages`,
  )
  console.log(`roles in DB: ${roles.length}${APPLY ? '' : '   (DRY RUN — pass --apply to write)'}\n`)

  const changes: Change[] = []

  for (const role of roles) {
    const slug = String(role.slug)
    const permissions = asArray(role.permissions)
    const modules = asArray(role.modules)
    const stages = asArray(role.workflowStages)

    // 1. Prune anything the catalogue no longer defines.
    const keptPermissions = permissions.filter(isPermissionAction)
    const keptModules = modules.filter(isModuleId)
    // Stages are REMAPPED rather than dropped on read (normaliseWorkflowStages),
    // so only genuinely unknown ids are pruned here — a retired-but-mapped id is
    // still meaningful and must survive.
    const keptStages = stages.filter(isWorkflowStage)

    const change: Change = {
      slug,
      prunedPermissions: permissions.filter((p) => !isPermissionAction(p)),
      prunedModules: modules.filter((m) => !isModuleId(m)),
      prunedStages: stages.filter((s) => !isWorkflowStage(s)),
      addedPermissions: [],
      addedModules: [],
      addedStages: [],
    }

    let nextPermissions = keptPermissions
    let nextModules = keptModules
    let nextStages = keptStages

    // 2. Top up the everything-roles.
    if (HOLDS_EVERYTHING.has(slug)) {
      const havePerms = new Set(keptPermissions)
      const haveMods = new Set(keptModules)
      const haveStages = new Set(keptStages)
      change.addedPermissions = ALL_PERMISSIONS.filter((p) => !havePerms.has(p))
      change.addedModules = ALL_MODULES.filter((m) => !haveMods.has(m))
      change.addedStages = ALL_WORKFLOW_STAGES.filter((s) => !haveStages.has(s))
      // These roles hold the complete catalogue by definition, so the target IS
      // the catalogue — in catalogue order, so the stored arrays read the same way
      // the console renders them.
      nextPermissions = ALL_PERMISSIONS.slice()
      nextModules = ALL_MODULES.slice()
      nextStages = ALL_WORKFLOW_STAGES.slice()
    } else if (slug in BUILTIN_ROLE_LABELS) {
      // Seeded, non-everything role: re-derive its module list from the catalogue
      // and ADD anything missing. Additive only — a superadmin who removed a module
      // from `editor` keeps that decision; what this recovers is a module whose
      // `requiresPermission` changed after the role row was written.
      const haveMods = new Set(keptModules)
      const shouldHave = builtinModulesFor(slug as SeedRoleSlug)
      change.addedModules = shouldHave.filter((m) => !haveMods.has(m))
      if (change.addedModules.length > 0) {
        nextModules = ALL_MODULES.filter((m) => haveMods.has(m) || change.addedModules.includes(m))
      }
    }

    const touched =
      change.prunedPermissions.length > 0 ||
      change.prunedModules.length > 0 ||
      change.prunedStages.length > 0 ||
      change.addedPermissions.length > 0 ||
      change.addedModules.length > 0 ||
      change.addedStages.length > 0

    if (!touched) {
      console.log(`${slug.padEnd(16)} ✓ in sync`)
      continue
    }

    changes.push(change)
    console.log(`${slug.padEnd(16)} needs changes`)
    if (change.prunedPermissions.length) console.log(`   − permissions: ${change.prunedPermissions.join(', ')}`)
    if (change.prunedModules.length) console.log(`   − modules    : ${change.prunedModules.join(', ')}`)
    if (change.prunedStages.length) console.log(`   − stages     : ${change.prunedStages.join(', ')}`)
    if (change.addedPermissions.length) console.log(`   + permissions: ${change.addedPermissions.join(', ')}`)
    if (change.addedModules.length) console.log(`   + modules    : ${change.addedModules.join(', ')}`)
    if (change.addedStages.length) console.log(`   + stages     : ${change.addedStages.join(', ')}`)

    if (APPLY) {
      await db.collection('roles').updateOne(String(role._id), {
        permissions: nextPermissions,
        modules: nextModules,
        workflowStages: nextStages,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  console.log()
  if (changes.length === 0) {
    console.log('Nothing to do — every role matches the catalogue.')
    return
  }
  if (APPLY) {
    // The registry caches role docs for 60s; without this the running process
    // would serve the pre-sync permissions until the TTL lapsed.
    bustRoleCache()
    console.log(`Applied changes to ${changes.length} role(s). Role cache busted.`)
  } else {
    console.log(`${changes.length} role(s) would change. Re-run with --apply to write.`)
  }
}

main()
  .catch((err) => {
    console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
    process.exitCode = 1
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 300))
