// ---------------------------------------------------------------------------
// Fail if a catalogue permission is enforced NOWHERE.
//
// This is the guard for the whole class of bug that
// docs/CRM-MODULES-PERMISSIONS-REVIEW.md documented: 18 of 44 permissions were
// enforced only in the browser and 7 were enforced nowhere at all, while every
// one of them rendered as a grantable checkbox in the Roles console. An
// administrator ticked "Manage payouts" and believed they had restricted
// something. Nothing had changed.
//
// A permission counts as enforced when it is:
//   • referenced in server code  → a real gate, OR
//   • a module's `requiresPermission` → it controls a navigation surface, which
//     the server computes and ProductionSystemLayout enforces per URL, OR
//   • referenced in web code     → it gates controls on a screen
//
// The web-only case is legitimate for screens with no backend (a static Settings
// page), but it is the weakest tier — so it is REPORTED even when it passes, to
// keep the count visible rather than letting it drift upward unnoticed.
//
// Usage:  npx tsx scripts/check-permission-enforcement.ts
// Exits 1 when a permission is unenforced, so CI can run it.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  type PermissionAction,
} from '../src/lib/permissionCatalogue.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const SERVER_SRC = path.resolve(here, '../src')
const WEB_SRC = path.resolve(here, '../../web/src')

// The catalogue is where these ids are DEFINED; a mention there is not a use.
const CATALOGUE_FILE = 'permissionCatalogue.ts'
// The web mirrors the union as a type. Declaring the type is not a use either.
const WEB_UNION_FILE = path.join('lib', 'permissions.ts')

/**
 * Count references to a literal `'id'` under `root`, excluding the files that
 * merely declare it. Uses git's grep so it honours .gitignore and stays fast.
 */
function references(id: string, root: string, excludes: string[]): number {
  let out = ''
  try {
    out = execFileSync(
      'git',
      ['grep', '-l', '--fixed-strings', `'${id}'`, '--', root],
      { encoding: 'utf8', cwd: root },
    )
  } catch {
    return 0 // git grep exits 1 when nothing matches
  }
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((file) => !excludes.some((ex) => file.includes(ex))).length
}

const moduleGated = new Set<PermissionAction>(
  MODULE_CATALOGUE.map((m) => m.requiresPermission).filter((p): p is PermissionAction => !!p),
)

interface Row {
  id: PermissionAction
  server: number
  web: number
  module: boolean
}

const rows: Row[] = PERMISSION_CATALOGUE.map((p) => ({
  id: p.id,
  server: references(p.id, SERVER_SRC, [CATALOGUE_FILE]),
  web: references(p.id, WEB_SRC, [WEB_UNION_FILE]),
  module: moduleGated.has(p.id),
}))

// Buckets are MUTUALLY EXCLUSIVE and must sum to rows.length — an id that falls
// through every printed bucket is exactly the thing this script exists to catch,
// so the totals are asserted rather than trusted.
const serverEnforced = rows.filter((r) => r.server > 0)
const rest = rows.filter((r) => r.server === 0)
const moduleGate = rest.filter((r) => r.module)
const webOnly = rest.filter((r) => !r.module && r.web > 0)
const unenforced = rest.filter((r) => !r.module && r.web === 0)

const fmt = (rs: Row[]) => (rs.length ? `  ${rs.map((r) => r.id).join(', ')}` : '')
console.log(`Permissions in catalogue: ${rows.length}`)
console.log(`  server-enforced : ${serverEnforced.length}`)
console.log(`  module gate     : ${moduleGate.length}${fmt(moduleGate)}`)
console.log(`  web-only        : ${webOnly.length}${fmt(webOnly)}`)
console.log(`  UNENFORCED      : ${unenforced.length}${fmt(unenforced)}`)

const counted = serverEnforced.length + moduleGate.length + webOnly.length + unenforced.length
if (counted !== rows.length) {
  console.error(`\nBUG IN THIS SCRIPT: ${counted} categorised but ${rows.length} in the catalogue.`)
  process.exit(1)
}
console.log()

if (unenforced.length > 0) {
  console.error('UNENFORCED PERMISSIONS — these are grantable and do nothing:')
  for (const r of unenforced) console.error(`  ✗ ${r.id}`)
  console.error(
    '\nEither enforce it, or remove it from PERMISSION_CATALOGUE and add it to the\n' +
      'RESERVED list there. A permission an admin can grant but nothing checks is a\n' +
      'lie told by the Roles console.',
  )
  process.exit(1)
}

console.log('✓ every catalogue permission is enforced somewhere')
