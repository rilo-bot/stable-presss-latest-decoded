// Admin roles: the DEFINITIONS (`roles`), and WHO HOLDS ONE (`adminRoles`).
//
// TWO COLLECTIONS, TWO JOBS:
//   roles       what a role may do — permissions, modules, workflow stages
//   adminRoles  { userId, roleId, assignedAt } — the link. UNIQUE on userId,
//               so "one role per admin" is a database constraint, not a habit.
//
// `users.isAdmin` is the CATEGORY flag and is written in the same breath as the
// link row. Two writes cannot be made atomic without a transaction, so the ORDER
// is chosen so that a half-applied change always fails CLOSED:
//
//   grant   link row first, then isAdmin:true
//           → if the second write dies, a link exists but the account is not
//             staff, and resolveAccount refuses to read the role at all.
//   revoke  isAdmin:false first, then delete the link
//           → if the second write dies, the account is already not staff.
//
// Either way the failure mode is "no access", never "access they shouldn't have".
// `npm run check:admins` finds and repairs any row left stranded that way.

import { db } from './db.js'
import { ADMIN_ROLES, ROLES, USERS } from './collections.js'
import {
  ALL_WORKFLOW_STAGES,
  modulesForPermissions,
  normalisePermissions,
  normaliseScopes,
  type PermissionAction,
  type RoleScopes,
} from './permissionCatalogue.js'

export { SUPERADMIN_ROLE_NAME } from './identity.js'
export { ADMIN_ROLES, ROLES }

export interface RoleDoc {
  id: string
  /** Unique, human-readable. Assignments reference `_id`, so a rename is free. */
  name: string
  label: string
  description?: string
  color?: string
  /** A lucide icon NAME (e.g. 'Shield'). Components can't cross the wire. */
  icon?: string
  /** Seeded — cannot be deleted. */
  isSystem: boolean
  /** Superadmin — cannot be edited. */
  isImmutable: boolean
  /** Unrestricted access. A FIELD, not a name comparison: names are editable. */
  isSuper: boolean
  permissions: PermissionAction[]
  /** Per-screen 'own' | 'all' for the verbs that act on existing records. */
  scopes: RoleScopes
  /**
   * DERIVED from `permissions`, not stored. A nav entry exists when the role
   * holds that screen's `view`, so the module list cannot disagree with the
   * permissions the way the old stored array could.
   */
  modules: string[]
  /**
   * DERIVED. The board shows every column to anyone who can open it; which
   * cards appear is scope, and which transitions are allowed is the verb.
   */
  workflowStages: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export function projectRole(doc: Record<string, any>): RoleDoc {
  // Legacy ids are mapped here rather than by migration alone, so a role row
  // written by an older process is correct on the very first read.
  const permissions = normalisePermissions(doc.permissions)
  const rawPermissions = Array.isArray(doc.permissions) ? doc.permissions.map(String) : []
  return {
    id: String(doc._id ?? doc.id ?? ''),
    name: String(doc.name ?? ''),
    label: String(doc.label ?? ''),
    description: doc.description ? String(doc.description) : undefined,
    color: doc.color ? String(doc.color) : undefined,
    icon: doc.icon ? String(doc.icon) : undefined,
    isSystem: doc.isSystem === true,
    isImmutable: doc.isImmutable === true,
    isSuper: doc.isSuper === true,
    permissions,
    scopes: normaliseScopes(doc.scopes, rawPermissions),
    modules: modulesForPermissions(permissions),
    // Every column, for anyone who can open the board at all.
    workflowStages: permissions.includes('workflow.view') ? [...ALL_WORKFLOW_STAGES] : [],
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    createdAt: String(doc.createdAt ?? ''),
    updatedAt: String(doc.updatedAt ?? ''),
  }
}

// ── Definition cache ────────────────────────────────────────────────────────
//
// PER-PROCESS. `bustRoleCache()` clears this instance's copy and nobody else's,
// so if the API is ever run on more than one dyno a role edit takes up to
// CACHE_TTL_MS to reach the others. "A role change takes effect on the next
// request" — stated confidently elsewhere — is true of a single process only.
// Same caveat `lib/rateLimit.ts` carries; both want a shared store (Redis)
// before scaling out horizontally.

const CACHE_TTL_MS = 60_000

let cache: Map<string, RoleDoc> | null = null
let cachedAt = 0
let inflight: Promise<Map<string, RoleDoc>> | null = null
/** A load that started before a bust must not commit its stale result. */
let generation = 0

export function bustRoleCache(): void {
  cache = null
  cachedAt = 0
  inflight = null
  generation++
}

async function loadRoles(): Promise<Map<string, RoleDoc>> {
  const startedAt = generation
  const map = new Map<string, RoleDoc>()
  for (const doc of await db.collection(ROLES).find()) {
    const role = projectRole(doc)
    // Keyed by BOTH id and name: assignments look up by id, the console by name.
    // ObjectId hex and slugs cannot collide, so one map serves both.
    if (role.id) map.set(role.id, role)
    if (role.name) map.set(role.name, role)
  }
  if (generation === startedAt) {
    cache = map
    cachedAt = Date.now()
  }
  return map
}

/**
 * The definitions, cached.
 *
 * SERVES STALE ON FAILURE. If the reload throws — a momentary Atlas blip is the
 * realistic case — a previously loaded map is returned instead of rejecting.
 * That matters more than it looks: `resolveAccount` awaits this on every
 * authenticated request, and the gates in rbac.ts used to invoke the auth
 * middleware as `void attachAccount(...)`, so a rejection here became an
 * unhandled rejection and the REQUEST HUNG rather than erroring. The gates catch
 * properly now, but authorization surviving a blip is worth having regardless.
 *
 * A cold start with no cache at all still rejects — there is nothing to serve.
 */
export function getRoles(): Promise<Map<string, RoleDoc>> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return Promise.resolve(cache)
  if (!inflight) {
    const load = loadRoles()
    inflight = load
    // Cleared on BOTH paths: a rejected promise parked here would break every
    // authorization check until the process restarted.
    void load
      .catch(() => undefined)
      .finally(() => {
        if (inflight === load) inflight = null
      })
  }
  return inflight.catch((err) => {
    if (cache) {
      console.warn(
        '[rbac] role reload failed, serving the cached definitions:',
        err instanceof Error ? err.message : err,
      )
      return cache
    }
    throw err
  })
}

/** One role by EITHER its id or its name. */
export async function getRole(idOrName: string): Promise<RoleDoc | undefined> {
  return (await getRoles()).get(idOrName)
}

/**
 * Every DISTINCT definition.
 *
 * USE THIS TO ITERATE, never `getRoles().values()` — that map keys each role
 * under BOTH its id and its name, so iterating it yields everything twice. Two
 * call sites were each de-duplicating by hand, and one of them
 * (`scripts/grant-superadmin.ts`) only worked because both keys happened to
 * point at the same object reference: building two `projectRole` results in
 * `loadRoles` would have silently broken it.
 */
export async function listRoles(): Promise<RoleDoc[]> {
  const map = await getRoles()
  return [...new Map([...map.values()].map((r) => [r.id, r])).values()]
}

// ── The link ────────────────────────────────────────────────────────────────

/** Not exported: every consumer wants `roleOfUser`, not the raw row. */
interface AdminRoleLink {
  id: string
  userId: string
  roleId: string
  assignedAt: string
  assignedBy?: string
}

function projectLink(doc: Record<string, any>): AdminRoleLink {
  return {
    id: String(doc._id),
    userId: String(doc.userId ?? ''),
    roleId: String(doc.roleId ?? ''),
    assignedAt: String(doc.assignedAt ?? ''),
    assignedBy: doc.assignedBy ? String(doc.assignedBy) : undefined,
  }
}

/** The link row for one user, or null. At most one — `userId` is unique. */
export async function linkForUser(userId: string): Promise<AdminRoleLink | null> {
  if (!userId) return null
  const rows = await db.collection(ADMIN_ROLES).find({ userId })
  return rows[0] ? projectLink(rows[0]) : null
}

/** Link rows for many users in ONE query. Keyed by userId. */
export async function linksForUsers(userIds: string[]): Promise<Map<string, AdminRoleLink>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const rows = await db.collection(ADMIN_ROLES).find({ userId: { $in: ids } })
  return new Map(rows.map((r) => [String(r.userId), projectLink(r)]))
}

/**
 * The role a user holds, or null.
 *
 * Takes the DOCUMENT so the `isAdmin` gate can be applied without a second read:
 * a non-staff account holds nothing by definition, so there is no link to look
 * for. `null` also covers an admin whose role row was deleted — they are still
 * staff, holding nothing, and must stay visible in the roster to be repaired.
 */
export async function roleOfUser(user: Record<string, any> | null | undefined): Promise<RoleDoc | null> {
  if (!user || user.isAdmin !== true) return null
  const link = await linkForUser(String(user._id ?? user.id ?? ''))
  return link ? ((await getRole(link.roleId)) ?? null) : null
}

// ── Granting ────────────────────────────────────────────────────────────────

/**
 * THE only writer of the link + `users.isAdmin`. Link FIRST — see the header for
 * why the order is what makes a half-applied grant fail closed.
 *
 * Replaces rather than appends: one role per admin, and the unique index on
 * `userId` would reject a second row anyway.
 */
export async function assignRole(userId: string, roleId: string, assignedBy?: string): Promise<void> {
  if (!userId || !roleId) throw new Error('assignRole needs a userId and a roleId')
  const now = new Date().toISOString()

  const existing = await db.collection(ADMIN_ROLES).find({ userId })
  if (existing[0]) {
    await db.collection(ADMIN_ROLES).updateOne(String(existing[0]._id), {
      roleId,
      assignedAt: now,
      assignedBy,
    })
    // Unreachable for data written since the unique index on `userId` landed —
    // kept as a one-shot repair for rows that predate it. `check:admins` is the
    // maintained version of this.
    for (const dupe of existing.slice(1)) await db.collection(ADMIN_ROLES).deleteOne(String(dupe._id))
  } else {
    await db.collection(ADMIN_ROLES).insertOne({ userId, roleId, assignedAt: now, assignedBy })
  }

  await db.collection(USERS).updateOne(userId, { isAdmin: true, updatedAt: now })
}

/**
 * THE only revoker. `isAdmin` FIRST, so a failure leaves them not-staff.
 *
 * The ACCOUNT survives — bylines, posts and uploads still reference it.
 */
export async function clearRole(userId: string): Promise<void> {
  if (!userId) return
  await db.collection(USERS).updateOne(userId, { isAdmin: false, updatedAt: new Date().toISOString() })
  for (const row of await db.collection(ADMIN_ROLES).find({ userId })) {
    await db.collection(ADMIN_ROLES).deleteOne(String(row._id))
  }
}

/** Unassign a role being deleted. Returns how many people lost it. */
export async function clearRoleEverywhere(roleId: string): Promise<number> {
  if (!roleId) return 0
  const holders = await db.collection(ADMIN_ROLES).find({ roleId })
  for (const row of holders) await clearRole(String(row.userId))
  return holders.length
}

/** How many admins hold each role, keyed by roleId. ONE query. */
export async function assigneeCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const row of await db.collection(ADMIN_ROLES).find()) {
    const id = row.roleId ? String(row.roleId) : ''
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

export async function superadminCount(): Promise<number> {
  let n = 0
  for (const [roleId, holders] of await assigneeCounts()) {
    if ((await getRole(roleId))?.isSuper) n += holders
  }
  return n
}

// The two guards that used to live here — `denyRoleGrant` and
// `checkSuperadminLoss` — moved to lib/roleGrant.ts. They are POLICY, not
// storage, and roleGrant.ts exists to own the policy; this file now does one
// job: reading and writing role definitions and the links to them.
