// ---------------------------------------------------------------------------
// The role registry — DB-defined roles, plus the in-process cache that makes
// them free to read.
//
// Roles used to be a TypeScript union, so a permission check cost nothing. Now
// they are rows, and a naive implementation would add a database round trip to
// EVERY authenticated request. This module is the answer: one cached
// Map<slug, RoleDoc>, refreshed on a TTL and busted explicitly whenever a role
// is mutated. `attachAccount` resolves permissions out of that map, so the
// request path stays allocation-cheap and does no extra I/O.
//
// Staleness bound: an explicit bust makes a change instant on the instance that
// made it; other instances converge within CACHE_TTL_MS. That is acceptable
// while the API runs single-instance (see docs/MAGAZINE-V2-SCALABILITY-REVIEW.md);
// a horizontally-scaled deployment would want a pub/sub invalidation instead.
//
// See docs/DYNAMIC-RBAC-PLAN.md §1.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import {
  isModuleId,
  isPermissionAction,
  isWorkflowStage,
  type PermissionAction,
} from './permissionCatalogue.js'

/** The immutable, all-access role. Never resolved through the DB. */
export const SUPERADMIN_SLUG = 'superadmin'

/**
 * How many accounts currently hold superadmin.
 *
 * Consulted before ANY change that would take it away from someone — removing
 * the role, moving them to a different one, or removing them from the team
 * outright. Reaching zero is unrecoverable without shell access to re-run the
 * SETUP_SECRET seed, so every one of those paths has to ask.
 */
export async function superadminHolderCount(): Promise<number> {
  const users = await db.collection('users').find()
  return users.filter((u) => Array.isArray(u.staffRoles) && u.staffRoles.includes(SUPERADMIN_SLUG))
    .length
}

/**
 * THE guard on handing out a role. Returns an error message, or null to allow.
 *
 * `team.manage` used to be sufficient on its own, which made it equivalent to
 * superadmin in two steps: `administrator` is seeded with every permission in the
 * catalogue, so a team manager could name their own account and become a full
 * platform admin. Two rules close that (docs/AUTH-RBAC-REVIEW.md C3):
 *
 *   1. NO SELF-SERVICE. Changing your own role is not a roster action.
 *   2. NO AMPLIFICATION. You cannot hand out access you do not hold yourself.
 *      Rule 1 alone only stops the single-actor version — two colleagues who each
 *      held `team.manage` could still promote each other.
 *
 * A superadmin is exempt from rule 2 (they hold every permission by definition)
 * but NOT from rule 1: `superadmin` is the one role whose loss is unrecoverable,
 * so even they change their own through another superadmin.
 *
 * `isSelf` is passed in rather than derived, because the two callers identify the
 * target differently — routes/roles.ts by user id, routes/staff.ts by email.
 * The actor is typed structurally so this file needs no import from
 * effectiveAccess.ts, which imports THIS module (an AccountUser satisfies it).
 */
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

/**
 * THE guard for every path that can take `superadmin` away from someone.
 *
 * Both rules live here because they were previously copy-pasted across four
 * routes and had already diverged: routes/staff.ts checked "only a superadmin may
 * change another superadmin" AND the last-holder count, while
 * routes/roles.ts checked only the count — so anyone holding `team.manage` could
 * demote a superadmin as long as a second one existed. Two paths to one operation
 * with two different rule sets is the classic shape of an access-control bug.
 * See docs/AUTH-RBAC-REVIEW.md H4.
 *
 * `losesSuperadmin` is the caller's answer to "would this operation leave the
 * target without the slug?" — computed at the call site because each route
 * expresses the change differently (replace, pull, clear).
 *
 * Returns a user-facing error message, or null when the change is allowed.
 */
export async function checkSuperadminLoss(
  actor: { isSuperAdmin: boolean },
  losesSuperadmin: boolean,
): Promise<string | null> {
  if (!losesSuperadmin) return null
  if (!actor.isSuperAdmin) return 'Only a superadmin can change another superadmin.'
  // Reaching zero is unrecoverable without shell access to re-run the
  // SETUP_SECRET seed, so this is checked even for a superadmin acting.
  if ((await superadminHolderCount()) <= 1) {
    return 'Cannot remove the last superadmin — the platform would be locked out.'
  }
  return null
}

export interface RoleDoc {
  id: string
  slug: string
  label: string
  description?: string
  color?: string
  /** A lucide icon NAME (e.g. 'Shield'). Components can't cross the wire. */
  icon?: string
  /** Seeded role — protected from deletion. */
  isSystem: boolean
  /** Superadmin only — protected from any edit. */
  isImmutable: boolean
  permissions: PermissionAction[]
  modules: string[]
  workflowStages: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** Normalize a raw Mongo doc, dropping ids the catalogue no longer knows. */
export function projectRole(doc: Record<string, any>): RoleDoc {
  return {
    id: String(doc._id ?? doc.id ?? ''),
    slug: String(doc.slug ?? ''),
    label: String(doc.label ?? ''),
    description: doc.description ? String(doc.description) : undefined,
    color: doc.color ? String(doc.color) : undefined,
    icon: doc.icon ? String(doc.icon) : undefined,
    isSystem: doc.isSystem === true,
    isImmutable: doc.isImmutable === true,
    permissions: Array.isArray(doc.permissions) ? doc.permissions.filter(isPermissionAction) : [],
    modules: Array.isArray(doc.modules) ? doc.modules.filter(isModuleId) : [],
    workflowStages: Array.isArray(doc.workflowStages)
      ? doc.workflowStages.filter(isWorkflowStage)
      : [],
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
/**
 * Bumped on every bust. A load that started before a bust must not commit its
 * (now stale) result afterwards — without this, an edit saved while another
 * request happened to be mid-load would appear to succeed and then not take
 * effect for a full TTL, which is exactly the bug an explicit bust exists to
 * prevent.
 */
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
  const docs = await db.collection('roles').find()
  const map = new Map<string, RoleDoc>()
  for (const doc of docs) {
    const role = projectRole(doc)
    if (role.slug) map.set(role.slug, role)
  }
  // Anything busted while this read was in flight wins; drop our result.
  if (generation === startedAt) {
    cache = map
    cachedAt = Date.now()
  }
  return map
}

/** Every role, keyed by slug. Served from cache unless stale. */
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

export async function getRole(slug: string): Promise<RoleDoc | undefined> {
  return (await getRoles()).get(slug)
}

/** Resolve a list of slugs to role docs, silently dropping unknown ones. */
export async function rolesForSlugs(slugs: string[]): Promise<RoleDoc[]> {
  if (slugs.length === 0) return []
  const all = await getRoles()
  const out: RoleDoc[] = []
  for (const slug of slugs) {
    const role = all.get(slug)
    if (role) out.push(role)
  }
  return out
}
