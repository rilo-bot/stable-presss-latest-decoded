// The ONE place that answers "what may this account do?".
//
// Only resolveAccount() produces an AccountUser, so a route cannot run a
// permission check against an unresolved user — that is a compile error.

import { db } from './db.js'
import { ORG_MEMBERS, PARTIES } from './collections.js'
import type { IdentityUser, OrgMemberRow, PartyRow, Role } from './identity.js'
import { SUPERADMIN_ROLE_NAME, getRole, type RoleDoc } from './roleRegistry.js'
import {
  ALL_WORKFLOW_STAGES,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  type PermissionAction,
} from './permissionCatalogue.js'

export interface AccountUser extends IdentityUser {
  /** Holds an admin role. Derived from `roleId` — never stored. */
  isAdmin: boolean
  /** Party rows this account has claimed — racing identities AND horse links. */
  parties: PartyRow[]
  orgMembers: OrgMemberRow[]
  isSuperAdmin: boolean
  /** May be empty for a superadmin: accountCan short-circuits before reading it. */
  permissions: ReadonlySet<PermissionAction>
  modules: ReadonlySet<string>
  workflowStages: ReadonlySet<string>
  /** The resolved role, for display and the client payload. */
  roleDocs: RoleDoc[]
}

/**
 * Two concurrent indexed queries — the role comes off the user document itself
 * and resolves from the registry cache.
 *
 * `isAdmin` is `roleId != null`, NOT "the role resolved". An admin whose role was
 * deleted is still an admin holding nothing, and must stay visible in the roster
 * so someone can repair them.
 */
export async function resolveAccount(identity: IdentityUser): Promise<AccountUser> {
  const permissions = new Set<PermissionAction>()
  const modules = new Set<string>()
  const workflowStages = new Set<string>()

  const [parties, orgMembers, role] = await Promise.all([
    loadParties(identity.id),
    loadOrgMembers(identity.id),
    identity.roleId ? getRole(identity.roleId) : undefined,
  ])

  const roleDocs = role ? [role] : []
  for (const r of roleDocs) {
    for (const p of r.permissions) permissions.add(p)
    for (const m of r.modules) modules.add(m)
    for (const s of r.workflowStages) workflowStages.add(s)
  }

  return {
    ...identity,
    isAdmin: identity.roleId !== null,
    parties,
    orgMembers,
    isSuperAdmin: roleDocs.some((r) => r.isSuper),
    permissions,
    modules,
    workflowStages,
    roleDocs,
  }
}

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

export function accountCanAny(
  account: AccountUser | undefined,
  actions: PermissionAction[],
): boolean {
  return actions.some((a) => accountCan(account, a))
}

export function accountCanOpenModule(account: AccountUser | undefined, moduleId: string): boolean {
  if (!account) return false
  if (account.isSuperAdmin) return true
  return account.modules.has(moduleId)
}

/** Permission check for an identity other than the request's own account. */
export async function identityCan(
  identity: IdentityUser,
  action: PermissionAction,
): Promise<boolean> {
  return accountCan(await resolveAccount(identity), action)
}

// ── Client payload ──────────────────────────────────────────────────────────

interface ClientAccess {
  permissions: PermissionAction[]
  modules: string[]
  workflowStages: string[]
  isSuperAdmin: boolean
  roles: Array<{ name: string; label: string; color?: string; icon?: string }>
}

function derivedRoles(account: AccountUser): Role[] {
  return [...new Set(account.parties.map((p) => p.role))]
}

export function toClientUser(account: AccountUser): Record<string, unknown> {
  // A superadmin falls back to the catalogue, not its role row: accountCan grants
  // everything even when that row is missing, so reading it would hand them an
  // empty payload in exactly that case.
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
      name: r.name,
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
    roles: derivedRoles(account),
    parties: account.parties,
    orgMembers: account.orgMembers,
    access,
  }
}
