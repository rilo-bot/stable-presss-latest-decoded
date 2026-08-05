// Admin roles: the definitions, and who holds them.
//
// A role is held by ONE field — `users.roleId`. Assigning is a single write, so
// there is no join table and nothing that can half-apply.

import { db } from './db.js'
import { ADMIN_ROLES, USERS } from './collections.js'
import {
  isModuleId,
  isPermissionAction,
  normaliseWorkflowStages,
  type PermissionAction,
} from './permissionCatalogue.js'

export { SUPERADMIN_ROLE_NAME } from './identity.js'
export { ADMIN_ROLES }

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
  modules: string[]
  workflowStages: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export function projectRole(doc: Record<string, any>): RoleDoc {
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
    permissions: Array.isArray(doc.permissions) ? doc.permissions.filter(isPermissionAction) : [],
    modules: Array.isArray(doc.modules) ? doc.modules.filter(isModuleId) : [],
    workflowStages: normaliseWorkflowStages(doc.workflowStages),
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    createdAt: String(doc.createdAt ?? ''),
    updatedAt: String(doc.updatedAt ?? ''),
  }
}

// ── Cache ───────────────────────────────────────────────────────────────────

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
  for (const doc of await db.collection(ADMIN_ROLES).find()) {
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
  return inflight
}

/** One role by EITHER its id or its name. */
export async function getRole(idOrName: string): Promise<RoleDoc | undefined> {
  return (await getRoles()).get(idOrName)
}

/**
 * The role a user document holds, or null.
 *
 * Takes the DOCUMENT, not an id — the role is a field on it, so this costs a
 * cache hit and no query. `null` also covers a roleId whose role was deleted:
 * they are still an admin, holding nothing.
 */
export async function roleOfUser(user: Record<string, any> | null | undefined): Promise<RoleDoc | null> {
  const id = user?.roleId ? String(user.roleId) : ''
  return id ? ((await getRole(id)) ?? null) : null
}

// ── Who holds a role ────────────────────────────────────────────────────────

export async function assignRole(userId: string, roleId: string): Promise<void> {
  if (!userId || !roleId) throw new Error('assignRole needs a userId and a roleId')
  await db.collection(USERS).updateOne(userId, { roleId, updatedAt: new Date().toISOString() })
}

/** The ACCOUNT survives — bylines, posts and uploads still reference it. */
export async function clearRole(userId: string): Promise<void> {
  if (!userId) return
  await db.collection(USERS).updateOne(userId, { roleId: null, updatedAt: new Date().toISOString() })
}

/** Unassign a role being deleted. Returns how many people lost it. */
export async function clearRoleEverywhere(roleId: string): Promise<number> {
  if (!roleId) return 0
  const holders = await db.collection(USERS).find({ roleId })
  for (const u of holders) await clearRole(String(u._id))
  return holders.length
}

export async function assigneeCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const u of await db.collection(USERS).find({ roleId: { $ne: null } })) {
    const id = u.roleId ? String(u.roleId) : ''
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

// ── Guards ──────────────────────────────────────────────────────────────────

/** THE guard on handing out a role. Returns an error message, or null to allow. */
export function denyRoleGrant(
  actor: { isSuperAdmin: boolean; permissions: ReadonlySet<PermissionAction> },
  role: RoleDoc,
  isSelf: boolean,
): string | null {
  if (isSelf) return 'You cannot change your own role. Ask another administrator to do it.'
  if (actor.isSuperAdmin) return null
  const missing = role.permissions.filter((p) => !actor.permissions.has(p))
  if (missing.length > 0) {
    return `You cannot grant "${role.label}" — it includes access you do not hold yourself.`
  }
  return null
}

/** THE guard for every path that can take superadmin away from someone. */
export async function checkSuperadminLoss(
  actor: { isSuperAdmin: boolean },
  losesSuperadmin: boolean,
): Promise<string | null> {
  if (!losesSuperadmin) return null
  if (!actor.isSuperAdmin) return 'Only a superadmin can change another superadmin.'
  // Reaching zero is unrecoverable without shell access, so this is checked even
  // for a superadmin acting.
  if ((await superadminCount()) <= 1) {
    return 'Cannot remove the last superadmin — the platform would be locked out.'
  }
  return null
}
