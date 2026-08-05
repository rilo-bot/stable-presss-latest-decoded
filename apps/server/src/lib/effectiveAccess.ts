// Effective access — the ONE place that answers "what may this account do?".
//
// Only resolveAccount() can produce an AccountUser, so a route cannot run a
// permission check against an unresolved user. That is a compile error, not a
// silent allow.

import { db } from './db.js'
import { ORG_MEMBERS, PARTIES } from './collections.js'
import type { IdentityUser, OrgMemberRow, PartyRow, Role } from './identity.js'
import { SUPERADMIN_ROLE_NAME, type RoleDoc } from './roleRegistry.js'
import { adminRecordFor } from './admins.js'
import {
  ALL_WORKFLOW_STAGES,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  type PermissionAction,
} from './permissionCatalogue.js'

/** An identity whose roles have been resolved. Required for every auth check. */
export interface AccountUser extends IdentityUser {
  /** Party rows this account has claimed — its racing identities AND horse links. */
  parties: PartyRow[]
  /** Organisations this account belongs to, with its role in each. */
  orgMembers: OrgMemberRow[]
  /** True when the account holds the immutable superadmin role. */
  isSuperAdmin: boolean
  /**
   * Union of every held role's permissions. NOT consulted for a superadmin —
   * accountCan short-circuits first, so this may legitimately be empty for one
   * whose role row is missing.
   */
  permissions: ReadonlySet<PermissionAction>
  /** Union of every held role's navigation surfaces. */
  modules: ReadonlySet<string>
  /** Union of every held role's visible workflow stages. */
  workflowStages: ReadonlySet<string>
  /** The resolved role docs, for display and for the client payload. */
  roleDocs: RoleDoc[]
}

/** Unrestricted access. Reads the  field, never the role name. */
export function hasSuperRole(roleDocs: RoleDoc[]): boolean {
  return roleDocs.some((r) => r.isSuper)
}

/**
 * Resolve an identity into an AccountUser.
 *
 * All three axes are their own collections: the role from `admins` → `adminRoles`,
 * memberships from `parties` and `orgMembers`. Three concurrent indexed queries =
 * one round trip; the role itself is a registry cache hit, not a second query.
 */
export async function resolveAccount(identity: IdentityUser): Promise<AccountUser> {
  const permissions = new Set<PermissionAction>()
  const modules = new Set<string>()
  const workflowStages = new Set<string>()

  const [admin, parties, orgMembers] = await Promise.all([
    adminRecordFor(identity.id),
    loadParties(identity.id),
    loadOrgMembers(identity.id),
  ])

  const roleDocs = admin.role ? [admin.role] : []
  for (const role of roleDocs) {
    for (const p of role.permissions) permissions.add(p)
    for (const m of role.modules) modules.add(m)
    for (const s of role.workflowStages) workflowStages.add(s)
  }

  return {
    ...identity,
    // FROM THE `admins` ROW, never from the stored flag.
    //
    // `users.isAdmin` is a denormalised copy that can drift — a half-applied
    // grant, a hand-edited document — and `isAdmin()` is what every category
    // check reads. Trusting the stored value made `isAdmin: true` with no row a
    // full admin account holding no role and appearing in no roster.
    //
    // Note this is `admin.isAdmin` (the row exists) and NOT `roleDocs.length`
    // (the row exists AND its roleId still resolves). An admin whose role was
    // deleted is still an admin, holding nothing — they must stay visible in the
    // roster so someone can repair them.
    isAdmin: admin.isAdmin,
    parties,
    orgMembers,
    isSuperAdmin: hasSuperRole(roleDocs),
    permissions,
    modules,
    workflowStages,
    roleDocs,
  }
}

/** Party rows this user has claimed. */
async function loadParties(userId: string): Promise<PartyRow[]> {
  if (!userId) return []
  const rows = await db.collection(PARTIES).find({ userId })
  return rows.map((r) => ({
    id: String(r._id),
    name: String(r.name ?? ''),
    imageUrl: r.imageUrl ? String(r.imageUrl) : undefined,
    role: r.role as PartyRow['role'],
    taken: r.taken === true,
    userId: r.userId ? String(r.userId) : undefined,
    orgId: r.orgId ? String(r.orgId) : undefined,
    horseId: r.horseId ? String(r.horseId) : undefined,
  }))
}

async function loadOrgMembers(userId: string): Promise<OrgMemberRow[]> {
  if (!userId) return []
  const rows = await db.collection(ORG_MEMBERS).find({ userId })
  return rows.map((r) => ({
    id: String(r._id),
    orgId: String(r.orgId),
    role: r.role as OrgMemberRow['role'],
  }))
}

/** THE authorization check. Superadmin short-circuits before any lookup. */
export function accountCan(
  account: AccountUser | undefined,
  action: PermissionAction,
): boolean {
  if (!account) return false
  if (account.isSuperAdmin) return true
  return account.permissions.has(action)
}

/** Permission check for an identity other than the request's own account. */
export async function identityCan(
  identity: IdentityUser,
  action: PermissionAction,
): Promise<boolean> {
  return accountCan(await resolveAccount(identity), action)
}

/** Filter identities down to those holding a permission. */
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

/** Party roles this account holds, from its claimed rows. */
function derivedRoles(account: AccountUser): Role[] {
  const roles = new Set<Role>()
  for (const p of account.parties) roles.add(p.role)
  return [...roles]
}

/** JSON-safe projection of an AccountUser for the web app. */
export function toClientUser(account: AccountUser): Record<string, unknown> {
  // Superadmin falls back to the catalogue, not its role row: accountCan grants
  // everything even when that row is missing, so reading it here would hand a
  // superadmin an empty payload in exactly that case.
  const superRoles = account.roleDocs.length
    ? account.roleDocs
    : [{ name: SUPERADMIN_ROLE_NAME, label: 'Superadmin', color: undefined, icon: 'ShieldCheck' }]

  const access: ClientAccess = {
    permissions: account.isSuperAdmin
      ? PERMISSION_CATALOGUE.map((p) => p.id)
      : [...account.permissions],
    modules: account.isSuperAdmin ? MODULE_CATALOGUE.map((m) => m.id) : [...account.modules],
    workflowStages: account.isSuperAdmin ? [...ALL_WORKFLOW_STAGES] : [...account.workflowStages],
    isSuperAdmin: account.isSuperAdmin,
    roles: (account.isSuperAdmin ? superRoles : account.roleDocs).map((r) => ({
      slug: r.name,
      label: r.label,
      color: r.color,
      icon: r.icon,
    })),
  }

  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
    isAdmin: account.isAdmin,
    lastLogin: account.lastLogin,
    // Derived, never stored.
    roles: derivedRoles(account),
    parties: account.parties,
    orgMembers: account.orgMembers,
    access,
  }
}
