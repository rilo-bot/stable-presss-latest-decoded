
import { db } from './db.js'
import { ADMIN_ROLES } from './collections.js'
import {
  isModuleId,
  isPermissionAction,
  normaliseWorkflowStages,
  type PermissionAction,
} from './permissionCatalogue.js'

export { ADMIN_ROLES }

/**
 * The immutable, all-access role. Never resolved through the DB.
 *
 * Defined in identity.ts (a leaf module with no runtime imports) so the staff-axis
 * primitives — the slug and `primaryStaffRole` — live in one place. Re-exported
 * here because every existing call site imports it from the registry.
 */
export { SUPERADMIN_ROLE_NAME } from './identity.js'
import { SUPERADMIN_ROLE_NAME } from './identity.js'

/** THE guard on handing out a role. Returns an error message, or null to allow. */
export function denyRoleGrant(
  actor: { isSuperAdmin: boolean; permissions: ReadonlySet<PermissionAction> },
  role: RoleDoc,
  isSelf: boolean,
): string | null {
  if (isSelf) {
    return 'You cannot change your own role. Ask another administrator to do it.'
  }
  if (actor.isSuperAdmin) return null
  const missing = role.permissions.filter((p) => !actor.permissions.has(p))
  if (missing.length > 0) {
    return `You cannot grant "${role.label}" — it includes access you do not hold yourself.`
  }
  return null
}

/** THE guard for every path that can take `superadmin` away from someone. */
export async function checkSuperadminLoss(
  actor: { isSuperAdmin: boolean },
  losesSuperadmin: boolean,
): Promise<string | null> {
  if (!losesSuperadmin) return null
  if (!actor.isSuperAdmin) return 'Only a superadmin can change another superadmin.'
  // Reaching zero is unrecoverable without shell access to re-run the
  // SETUP_SECRET seed, so this is checked even for a superadmin acting.
  // Imported lazily: lib/admins.ts imports this module for getRole().
  if ((await (await import('./admins.js')).superadminCount()) <= 1) {
    return 'Cannot remove the last superadmin — the platform would be locked out.'
  }
  return null
}

export interface RoleDoc {
  id: string
  /** Human-readable role name, unique. The reference key is  (admins.roleId). */
  name: string
  label: string
  description?: string
  color?: string
  /** A lucide icon NAME (e.g. 'Shield'). Components can't cross the wire. */
  icon?: string
  /** Seeded role — protected from deletion. */
  isSystem: boolean
  /** Superadmin only — protected from any edit. */
  isImmutable: boolean
  /**
   * Unrestricted access. Replaces the `name === 'superadmin'` string test.
   *
   * A FIELD rather than a name comparison because the name is now editable, and a
   * rename must not be able to silently strip omnipotence — or grant it.
   */
  isSuper: boolean
  permissions: PermissionAction[]
  modules: string[]
  workflowStages: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** Normalize a raw Mongo doc, dropping ids the catalogue no longer knows. */
export function projectRole(doc: Record<string, any>): RoleDoc {
  const name = String(doc.name ?? '')
  return {
    id: String(doc._id ?? doc.id ?? ''),
    name,
    label: String(doc.label ?? ''),
    description: doc.description ? String(doc.description) : undefined,
    color: doc.color ? String(doc.color) : undefined,
    icon: doc.icon ? String(doc.icon) : undefined,
    isSystem: doc.isSystem === true,
    isImmutable: doc.isImmutable === true,
    isSuper: doc.isSuper === true,
    permissions: Array.isArray(doc.permissions) ? doc.permissions.filter(isPermissionAction) : [],
    modules: Array.isArray(doc.modules) ? doc.modules.filter(isModuleId) : [],
    // Retired stage ids are remapped, not dropped — see normaliseWorkflowStages.
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
/** In-flight load, so a burst of concurrent requests triggers ONE query. */
let inflight: Promise<Map<string, RoleDoc>> | null = null
/** Bumped on every bust. A load that started before a bust must not commit its */
let generation = 0

/** Drop the cache. Call after every write to the roles collection. */
export function bustRoleCache(): void {
  cache = null
  cachedAt = 0
  inflight = null
  generation++
}

async function loadRoles(): Promise<Map<string, RoleDoc>> {
  const startedAt = generation
  const docs = await db.collection(ADMIN_ROLES).find()
  const map = new Map<string, RoleDoc>()
  for (const doc of docs) {
    const role = projectRole(doc)
    // Indexed under BOTH keys, in one map, on purpose.
    //
    // `admins.roleId` references `_id`, so resolution looks a role up by id; the
    // Roles console and its URLs still address roles by name. Ids are Mongo
    // ObjectId hex and role names are slugs, so the two key spaces cannot collide,
    // and one map means one cache to bust rather than two that could disagree.
    if (role.id) map.set(role.id, role)
    if (role.name) map.set(role.name, role)
  }
  // Anything busted while this read was in flight wins; drop our result.
  if (generation === startedAt) {
    cache = map
    cachedAt = Date.now()
  }
  return map
}

/** Every role, keyed by BOTH id and name. Served from cache unless stale. */
export function getRoles(): Promise<Map<string, RoleDoc>> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return Promise.resolve(cache)
  // Collapse concurrent misses onto a single load.
  if (!inflight) {
    const load = loadRoles()
    inflight = load
    // Clear on BOTH settle paths. Clearing only on success (inside loadRoles)
    // meant one failed read left a rejected promise parked here forever, and
    // every later getRoles() re-returned it — permanently breaking every
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
