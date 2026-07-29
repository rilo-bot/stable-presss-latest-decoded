// ---------------------------------------------------------------------------
// Effective access — the ONE place that answers "what may this account do?".
//
// An AccountUser is an IdentityUser whose role slugs have been resolved through
// the registry into a flat permission/module set. Only `resolveAccount` (called
// by attachAccount) can produce one, so a route physically cannot run a
// permission check against an unresolved user — that is a compile error, not a
// silent allow.
//
// Superadmin short-circuits BEFORE any lookup. It never consults the registry,
// so an empty, stale, or corrupted `roles` collection cannot lock it out.
//
// Permissions are the union across EVERY role the account holds. There is no
// ranking and no "primary role" — that concept caused the old collapse bug
// where podcast_producer + editor silently dropped every producer permission.
//
// See docs/DYNAMIC-RBAC-PLAN.md §1.
// ---------------------------------------------------------------------------

import type { IdentityUser, RoleSlug } from './identity.js'
import { SUPERADMIN_SLUG, rolesForSlugs, type RoleDoc } from './roleRegistry.js'
import type { PermissionAction } from './permissionCatalogue.js'

/** An identity whose roles have been resolved. Required for every auth check. */
export interface AccountUser extends IdentityUser {
  /** True when the account holds the immutable superadmin role. */
  isSuperAdmin: boolean
  /** Union of every held role's permissions. Empty for superadmin — see accountCan. */
  permissions: ReadonlySet<PermissionAction>
  /** Union of every held role's navigation surfaces. */
  modules: ReadonlySet<string>
  /** Union of every held role's visible workflow stages. */
  workflowStages: ReadonlySet<string>
  /** The resolved role docs, for display and for the client payload. */
  roleDocs: RoleDoc[]
}

/** Cheap, synchronous, DB-free superadmin test. */
export function hasSuperAdminSlug(staffRoles: RoleSlug[] | undefined): boolean {
  return !!staffRoles && staffRoles.includes(SUPERADMIN_SLUG)
}

/**
 * Resolve an identity into an AccountUser. Reads the role registry, which is
 * served from an in-process cache, so this is a Map lookup on the hot path
 * rather than a database round trip.
 */
export async function resolveAccount(identity: IdentityUser): Promise<AccountUser> {
  const isSuperAdmin = hasSuperAdminSlug(identity.staffRoles)

  const permissions = new Set<PermissionAction>()
  const modules = new Set<string>()
  const workflowStages = new Set<string>()

  const roleDocs = await rolesForSlugs(identity.staffRoles)
  for (const role of roleDocs) {
    for (const p of role.permissions) permissions.add(p)
    for (const m of role.modules) modules.add(m)
    for (const s of role.workflowStages) workflowStages.add(s)
  }

  return { ...identity, isSuperAdmin, permissions, modules, workflowStages, roleDocs }
}

/**
 * THE authorization check. Superadmin is answered without touching the
 * resolved set at all, so it holds even if its role row is missing.
 */
export function accountCan(
  account: AccountUser | undefined,
  action: PermissionAction,
): boolean {
  if (!account) return false
  if (account.isSuperAdmin) return true
  return account.permissions.has(action)
}

/**
 * Permission check for an identity that is NOT the request's own account —
 * "may this OTHER person be added as a collaborator?", for example. Resolves
 * through the cached registry, so it costs a Map lookup.
 *
 * Prefer `accountCan(req.account, …)` for the caller's own permissions.
 */
export async function identityCan(
  identity: IdentityUser,
  action: PermissionAction,
): Promise<boolean> {
  return accountCan(await resolveAccount(identity), action)
}

/**
 * Filter a list of identities down to those holding a permission. Resolves the
 * registry ONCE for the whole list rather than per row.
 */
export async function identitiesWith<T extends IdentityUser>(
  identities: T[],
  action: PermissionAction,
): Promise<T[]> {
  const resolved = await Promise.all(
    identities.map(async (i) => ({ i, ok: await identityCan(i, action) })),
  )
  return resolved.filter((r) => r.ok).map((r) => r.i)
}

/** True if the account has ANY of the given permissions. */
export function accountCanAny(
  account: AccountUser | undefined,
  actions: PermissionAction[],
): boolean {
  return actions.some((a) => accountCan(account, a))
}

/** May the account open this navigation surface? */
export function accountCanOpenModule(account: AccountUser | undefined, moduleId: string): boolean {
  if (!account) return false
  if (account.isSuperAdmin) return true
  return account.modules.has(moduleId)
}

// ── Client payload ──────────────────────────────────────────────────────────

export interface ClientAccess {
  permissions: PermissionAction[]
  modules: string[]
  workflowStages: string[]
  isSuperAdmin: boolean
  roles: Array<{ slug: string; label: string; color?: string; icon?: string }>
}

/**
 * JSON-safe projection of an AccountUser for the web app. Sets don't serialize,
 * and the resolved role docs carry more than the client needs — so serialization
 * goes through here rather than spreading `req.account` into a response.
 */
export function toClientUser(account: AccountUser): Record<string, unknown> {
  const access: ClientAccess = {
    // Superadmin's sets are empty (it short-circuits), so materialise its role
    // doc's stored lists instead — otherwise the UI would render nothing.
    permissions: account.isSuperAdmin
      ? [...new Set(account.roleDocs.flatMap((r) => r.permissions))]
      : [...account.permissions],
    modules: account.isSuperAdmin
      ? [...new Set(account.roleDocs.flatMap((r) => r.modules))]
      : [...account.modules],
    workflowStages: account.isSuperAdmin
      ? [...new Set(account.roleDocs.flatMap((r) => r.workflowStages))]
      : [...account.workflowStages],
    isSuperAdmin: account.isSuperAdmin,
    roles: account.roleDocs.map((r) => ({
      slug: r.slug,
      label: r.label,
      color: r.color,
      icon: r.icon,
    })),
  }

  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt,
    roles: account.roles,
    staffRoles: account.staffRoles,
    subscriptionTier: account.subscriptionTier,
    partyClaims: account.partyClaims,
    orgMemberships: account.orgMemberships,
    access,
  }
}
