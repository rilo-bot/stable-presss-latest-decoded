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
 *
 * WHY THIS IS NOT ENOUGH ON ITS OWN. Gates now map the HTTP METHOD to a verb —
 * `can(account, 'horses', verbForMethod(req.method))` — so `'horses.delete'`
 * never appears as a literal anywhere even though DELETE is fully gated. Grep
 * cannot see a string that is assembled at runtime, so `gatedScreens` below
 * looks for the gate DECLARATION instead. The method → verb mapping itself is
 * one shared helper with tests (tests/permissions.test.ts).
 */
function references(needle: string, root: string, excludes: string[]): number {
  // A bare id is matched as `'id'`; a longer form (see gatedScreens) already
  // carries its own quotes and is matched verbatim.
  const pattern = needle.includes("'") ? needle : `'${needle}'`
  let out = ''
  try {
    out = execFileSync(
      'git',
      ['grep', '-l', '--fixed-strings', pattern, '--', root],
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

/**
 * `<screen>.view` IS the navigation gate, by construction: the sidebar is
 * derived from it (`modulesForPermissions`) and ProductionSystemLayout enforces
 * it per URL. So a `.view` with no other reference is legitimately enforced.
 *
 * This is STRICTER than the old rule it replaces, which whitelisted whichever id
 * a module happened to name in `requiresPermission` — including write verbs like
 * `roles.manage`. Now: every verb that is not `view` must appear in SERVER code
 * or the check fails.
 */
const isNavGate = (id: PermissionAction) => id.endsWith('.view')

/**
 * Screens whose verbs are enforced by a method-mapping gate.
 *
 * Proven, not declared: a screen counts only when server code contains one of
 * the gate forms below with that screen's id as a LITERAL. Deleting the gate
 * deletes the proof, and the check fails.
 */
function gatedScreens(): Set<string> {
  const found = new Set<string>()
  for (const screen of new Set(PERMISSION_CATALOGUE.map((p) => p.id.slice(0, p.id.lastIndexOf('.'))))) {
    const forms = [
      `screen: '${screen}'`, //        adminGate / horseScopedWriteGate option
      `screen ?? '${screen}'`, //      the default in horseScopedWriteGate
      `, '${screen}', `, //            can(account, 'stories', verb)
      `(account, '${screen}'`, //      staffMay(account, 'people', …)
      `(req.account, '${screen}'`,
    ]
    if (forms.some((f) => references(f, SERVER_SRC, [CATALOGUE_FILE]) > 0)) found.add(screen)
  }
  return found
}

const gated = gatedScreens()
const screenOf = (id: PermissionAction) => id.slice(0, id.lastIndexOf('.'))
const verbOf = (id: PermissionAction) => id.slice(id.lastIndexOf('.') + 1)

/**
 * A METHOD-MAPPING GATE CANNOT REACH `publish`, so it is not proof of one.
 *
 * `verbForMethod` yields view (GET), create (POST to the collection), delete
 * (DELETE) or edit (everything else) — 'publish' is not in its range. Crediting a
 * screen's whole verb list to that one gate therefore marked every `.publish` as
 * enforced on the strength of a check that could never fire. That is exactly how
 * `magazine.publish` sat green in this report while its only appearance in server
 * code chose an icon in the share dialog, and a role with Publish deliberately
 * unticked could put an edition on the public newsstand.
 *
 * So a `.publish` must be proven on its own: either the literal id appears in
 * server code, or an explicit two-argument gate names the verb.
 */
const isMethodUnreachable = (id: PermissionAction) => verbOf(id) === 'publish'

/** `can(req.account, 'magazine', 'publish')` — the verb as a literal, not a variable. */
function explicitVerbGate(id: PermissionAction): boolean {
  return references(`'${screenOf(id)}', '${verbOf(id)}'`, SERVER_SRC, [CATALOGUE_FILE]) > 0
}

/** The one question: is there real proof this permission is checked server-side? */
function isServerEnforced(r: Row): boolean {
  if (r.server > 0) return true
  if (isMethodUnreachable(r.id)) return explicitVerbGate(r.id)
  return gated.has(screenOf(r.id))
}

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
  module: isNavGate(p.id),
}))

// Buckets are MUTUALLY EXCLUSIVE and must sum to rows.length — an id that falls
// through every printed bucket is exactly the thing this script exists to catch,
// so the totals are asserted rather than trusted.
const serverEnforced = rows.filter(isServerEnforced)
const rest = rows.filter((r) => !isServerEnforced(r))
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
