// ---------------------------------------------------------------------------
// READ-ONLY. What shape is this database's RBAC in, and what would migrating it
// actually do?
//
// Run this BEFORE any migration, against production. It writes nothing — no
// updates, no index changes, no deletes — so it is safe to point at a live
// database from a laptop.
//
// It answers the four questions worth asking before a cutover:
//   1. Which MODEL is this database on? (pre-link / mid / link)
//   2. Which PERMISSION vocabulary do the roles speak? (legacy / new / mixed)
//   3. Who actually holds what — and is anybody about to lose access?
//   4. Is there existing drift that the migration would carry forward?
//
// Usage:
//   MONGODB_URI="<uri>" npx tsx scripts/inspect-rbac-state.ts
// ---------------------------------------------------------------------------

import { MongoClient, type Document } from 'mongodb'
import {
  LEGACY_PERMISSION_ALIASES,
  isPermissionAction,
  normalisePermissions,
} from '../src/lib/permissionCatalogue.js'

const uri = (process.env.MONGODB_URI ?? '').trim()
if (!uri) {
  console.error('MONGODB_URI is required.')
  process.exit(1)
}

const isDefinition = (d: Document) => Array.isArray(d.permissions)
const isLink = (d: Document) => d.userId != null
const line = (s = '') => console.log(s)
const h = (s: string) => {
  line()
  line(`── ${s} ${'─'.repeat(Math.max(0, 66 - s.length))}`)
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  line(`\nDATABASE: ${db.databaseName}   (read-only inspection — nothing will be written)`)

  // `deletedAt: null` ON EVERY COLLECTION, not just users.
  //
  // Deletes are SOFT here — revoking a role stamps the link, deleting a role
  // stamps the definition — so an unfiltered read returns tombstones that look
  // exactly like drift. The first run of this script reported "a link pointing
  // at a user that no longer exists" and counted a deleted role's legacy
  // permissions; both were tombstones. On production that is a false alarm at
  // the worst possible moment, so the filter is the default and tombstones are
  // counted separately, as information rather than as a problem.
  const q = { deletedAt: null }
  const users = await db.collection('users').find(q).toArray()
  const adminRoleRows = await db.collection('adminRoles').find(q).toArray()
  const roleRows = await db.collection('roles').find(q).toArray()
  const tombstones = {
    users: await db.collection('users').countDocuments({ deletedAt: { $ne: null } }),
    adminRoles: await db.collection('adminRoles').countDocuments({ deletedAt: { $ne: null } }),
    roles: await db.collection('roles').countDocuments({ deletedAt: { $ne: null } }),
  }

  const defsInAdminRoles = adminRoleRows.filter(isDefinition)
  const links = adminRoleRows.filter(isLink)
  const withRoleId = users.filter((u) => u.roleId)
  const withIsAdmin = users.filter((u) => u.isAdmin === true)

  // ── 1. Which model? ───────────────────────────────────────────────────────
  h('1. MODEL')
  const model =
    defsInAdminRoles.length > 0 && links.length === 0
      ? 'PRE-LINK — definitions live in adminRoles, users point at them with roleId'
      : defsInAdminRoles.length > 0 && links.length > 0
        ? 'MID-MIGRATION — both shapes present (this is what --keep-legacy leaves)'
        : 'LINK — definitions in `roles`, adminRoles holds only links'
  line(`  ${model}`)
  line()
  line(`  users (live)              : ${users.length}`)
  line(`  users with roleId         : ${withRoleId.length}   ${withRoleId.length ? '(old shape)' : ''}`)
  line(`  users with isAdmin:true   : ${withIsAdmin.length}   ${withIsAdmin.length ? '(new shape)' : ''}`)
  line(`  adminRoles definitions    : ${defsInAdminRoles.length}`)
  line(`  adminRoles links          : ${links.length}`)
  line(`  roles collection          : ${roleRows.length}`)
  line()
  line(
    `  soft-deleted (ignored)    : ${tombstones.users} user(s), ` +
      `${tombstones.adminRoles} link/definition(s), ${tombstones.roles} role(s)`,
  )

  // The definitions to reason about live wherever this database keeps them.
  const definitions = roleRows.length > 0 ? roleRows : defsInAdminRoles

  // ── 2. Which vocabulary? ──────────────────────────────────────────────────
  h('2. PERMISSION VOCABULARY')
  let legacyIds = 0
  let newIds = 0
  let unknownIds = 0
  const unknownSeen = new Set<string>()
  for (const r of definitions) {
    for (const p of (Array.isArray(r.permissions) ? r.permissions : []).map(String)) {
      if (isPermissionAction(p)) newIds++
      else if (p in LEGACY_PERMISSION_ALIASES) legacyIds++
      else {
        unknownIds++
        unknownSeen.add(p)
      }
    }
  }
  line(`  legacy ids : ${legacyIds}`)
  line(`  new ids    : ${newIds}`)
  line(`  unknown    : ${unknownIds}${unknownSeen.size ? `  → ${[...unknownSeen].join(', ')}` : ''}`)
  line()
  line(
    legacyIds > 0 && newIds === 0
      ? '  → needs migrate:permissions'
      : newIds > 0 && legacyIds === 0
        ? '  → already migrated'
        : legacyIds > 0
          ? '  → MIXED. Look at the per-role table below before migrating.'
          : '  → no permissions stored at all (check this is the right database)',
  )
  line(`  roles carrying a \`scopes\` field: ${definitions.filter((r) => r.scopes).length} of ${definitions.length}`)

  // ── 3. Roles, and who holds them ──────────────────────────────────────────
  h('3. ROLES')
  const SEEDED = new Set(['superadmin', 'contributor', 'editor', 'administrator'])
  const holdersOf = new Map<string, number>()
  for (const l of links) holdersOf.set(String(l.roleId), (holdersOf.get(String(l.roleId)) ?? 0) + 1)
  for (const u of withRoleId) holdersOf.set(String(u.roleId), (holdersOf.get(String(u.roleId)) ?? 0) + 1)

  line(`  ${'name'.padEnd(20)}${'kind'.padEnd(10)}${'holders'.padEnd(9)}${'perms'.padEnd(7)}modules`)
  for (const r of definitions) {
    const id = String(r._id)
    const kind = r.isSuper ? 'SUPER' : SEEDED.has(String(r.name)) ? 'seeded' : 'CUSTOM'
    const mods = Array.isArray(r.modules) ? r.modules.length : 0
    line(
      `  ${String(r.name).padEnd(20)}${kind.padEnd(10)}${String(holdersOf.get(id) ?? 0).padEnd(9)}` +
        `${String((r.permissions ?? []).length).padEnd(7)}${mods}`,
    )
  }

  const supers = definitions.filter((r) => r.isSuper === true)
  const superHolders = supers.reduce((n, r) => n + (holdersOf.get(String(r._id)) ?? 0), 0)
  line()
  line(`  superadmin holders: ${superHolders}`)
  if (superHolders === 0) {
    line('  ⚠ NOBODY holds superadmin. Fix that BEFORE migrating —')
    line('    npx tsx scripts/grant-superadmin.ts <email>')
  }

  // ── 4. What migrating would change, per role ──────────────────────────────
  h('4. WHAT migrate:permissions WOULD DO')
  const CUSTOM = definitions.filter((r) => !SEEDED.has(String(r.name)))
  line('  Seeded roles are RESET to the new definitions (not inferred), so only')
  line('  custom roles are shown here — they are the ones derived from modules.')
  line()
  if (CUSTOM.length === 0) {
    line('  No custom roles. The migration is entirely predictable.')
  } else {
    for (const r of CUSTOM) {
      const before = (Array.isArray(r.permissions) ? r.permissions : []).map(String)
      const after = normalisePermissions(before)
      const mods: string[] = Array.isArray(r.modules) ? r.modules.map(String) : []
      const gainsMagazine = mods.some((m) => m === 'magazine-v2' || m === 'magazine')
      line(`  ${r.name}  (${holdersOf.get(String(r._id)) ?? 0} holder(s))`)
      line(`    ${before.length} id(s) → ${after.length} from aliases, plus register/lens verbs from its ${mods.length} module(s)`)
      if (gainsMagazine) line('    → KEEPS Magazine Builder access (it holds the module). --strict-magazine withholds it.')
      if (before.some((p) => !isPermissionAction(p) && !(p in LEGACY_PERMISSION_ALIASES))) {
        line('    ⚠ holds ids in NEITHER vocabulary — those are dropped.')
      }
    }
  }

  // ── 5. Existing drift ─────────────────────────────────────────────────────
  h('5. DRIFT (would be carried forward)')
  const roleIds = new Set(definitions.map((r) => String(r._id)))
  const userIds = new Set(users.map((u) => String(u._id)))
  const problems: string[] = []
  for (const u of withRoleId) {
    if (!roleIds.has(String(u.roleId))) problems.push(`${u.email} points at a role that no longer exists`)
  }
  for (const l of links) {
    if (!userIds.has(String(l.userId))) problems.push(`link ${String(l._id)} → a user that no longer exists`)
    else if (!roleIds.has(String(l.roleId))) problems.push(`link for ${String(l.userId)} → a missing role`)
  }
  const both = users.filter((u) => u.roleId && u.isAdmin === true).length
  if (both && defsInAdminRoles.length === 0) problems.push(`${both} user(s) carry BOTH roleId and isAdmin`)
  const flaggedNoLink = withIsAdmin.filter((u) => !links.some((l) => String(l.userId) === String(u._id)))
  for (const u of flaggedNoLink) problems.push(`${u.email} is isAdmin:true but holds no link (no access)`)

  if (problems.length === 0) line('  ✓ none')
  else for (const p of problems) line(`  ⚠ ${p}`)

  // ── 6. Indexes ────────────────────────────────────────────────────────────
  h('6. INDEXES')
  for (const [name, coll] of [['adminRoles', 'adminRoles'], ['roles', 'roles'], ['users', 'users']] as const) {
    const idx = await db.collection(coll).indexes()
    line(`  ${name}: ${idx.map((i) => i.name).join(', ')}`)
  }
  const stale = (await db.collection('adminRoles').indexes()).find((i) => i.name === 'name_1')
  if (stale) line('  ⚠ adminRoles.name_1 is the DEFINITION-era index — the migration drops it (it must).')

  h('VERDICT')
  if (model.startsWith('PRE-LINK')) {
    line('  Two migrations needed, in this order:')
    line('    1. migrate-admin-roles   (structure: roles + users)')
    line('    2. migrate-permissions   (contents: roles only)')
  } else if (model.startsWith('MID')) {
    line('  Half-migrated. Finish migrate-admin-roles, then migrate-permissions.')
  } else if (legacyIds > 0) {
    line('  Structure is done. Only migrate-permissions is left.')
  } else {
    line('  Fully migrated. Nothing to do.')
  }
  line()

  await client.close()
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
