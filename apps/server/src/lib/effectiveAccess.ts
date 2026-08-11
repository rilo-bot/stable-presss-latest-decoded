// The ONE place that answers "what may this account do?".
//
// Only resolveAccount() produces an AccountUser, so a route cannot run a
// permission check against an unresolved user — that is a compile error.

import { db } from './db.js'
import { ORG_MEMBERS, PARTIES } from './collections.js'
import { loadPeople } from './people.js'
import type { IdentityUser, OrgMemberRow, PartyRow, Role } from './identity.js'
import { SUPERADMIN_ROLE_NAME, getRole, linkForUser, type RoleDoc } from './roleRegistry.js'
import {
  ALL_WORKFLOW_STAGES,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  permissionId,
  type PermissionAction,
  type RoleScopes,
  type Verb,
} from './permissionCatalogue.js'

export interface AccountUser extends IdentityUser {
  /** Party rows this account has claimed — racing identities AND horse links. */
  parties: PartyRow[]
  orgMembers: OrgMemberRow[]
  isSuperAdmin: boolean
  /** May be empty for a superadmin: accountCan short-circuits before reading it. */
  permissions: ReadonlySet<PermissionAction>
  /**
   * Per-screen reach of the verbs that act on an existing record. Absent means
   * 'own' — the safe default, and the reason a role that has never been given a
   * scope cannot accidentally edit everyone's work.
   */
  scopes: RoleScopes
  modules: ReadonlySet<string>
  workflowStages: ReadonlySet<string>
  /**
   * The ONE role this account holds, or null.
   *
   * Was `roleDocs: RoleDoc[]`, left over from a model that allowed several — so
   * every caller indexed `[0]`, which reads like "the first of many" when it is
   * "the only one". One admin, one role.
   */
  role: RoleDoc | null
}

/**
 * Three concurrent indexed queries: the party edges, the org memberships, and
 * the `adminRoles` link that says which role this account holds. The role
 * DEFINITION then comes off the registry cache, not the database.
 *
 * `isAdmin` GATES the role lookup rather than being derived from it. A normal
 * reader has no link row to find, so `linkForUser` is skipped entirely — and an
 * account whose `isAdmin` write failed after its link row landed resolves to no
 * permissions at all, which is the fail-closed half of the write ordering in
 * roleRegistry.ts.
 *
 * An admin whose role ROW was deleted keeps `isAdmin: true` and holds nothing —
 * still visible in the roster so someone can repair them.
 */
export async function resolveAccount(identity: IdentityUser): Promise<AccountUser> {
  const permissions = new Set<PermissionAction>()
  const modules = new Set<string>()
  const workflowStages = new Set<string>()

  const [parties, orgMembers, link] = await Promise.all([
    loadParties(identity.id),
    loadOrgMembers(identity.id),
    identity.isAdmin ? linkForUser(identity.id) : null,
  ])

  const role = link ? ((await getRole(link.roleId)) ?? null) : null
  if (role) {
    for (const p of role.permissions) permissions.add(p)
    for (const m of role.modules) modules.add(m)
    for (const s of role.workflowStages) workflowStages.add(s)
  }

  return {
    ...identity,
    parties,
    orgMembers,
    isSuperAdmin: role?.isSuper === true,
    permissions,
    scopes: role?.scopes ?? {},
    modules,
    workflowStages,
    role,
  }
}

async function loadParties(userId: string): Promise<PartyRow[]> {
  if (!userId) return []
  const rows = await db.collection(PARTIES).find({ userId })
  return toPartyRows(rows)
}

/**
 * Project party edges with their person joined in — ONE extra query for the
 * whole batch, however many edges there are.
 */
export async function toPartyRows(rows: Array<Record<string, any>>): Promise<PartyRow[]> {
  const people = await loadPeople(rows.map((r) => (r.personId ? String(r.personId) : undefined)))
  return rows.map((r) => {
    const person = people.get(String(r.personId))
    return {
      id: String(r._id ?? r.id),
      personId: String(r.personId ?? ''),
      name: person?.name ?? '',
      imageUrl: person?.imageUrl,
      role: r.role as PartyRow['role'],
      taken: r.taken === true,
      userId: r.userId ? String(r.userId) : undefined,
      orgId: r.orgId ? String(r.orgId) : undefined,
      horseId: r.horseId ? String(r.horseId) : undefined,
    }
  })
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

// ── Screen × verb ───────────────────────────────────────────────────────────

/**
 * Does this account hold `<screen>.<verb>` at all?
 *
 * The shape every route should use — `can(account, 'stories', 'edit')` reads as
 * the question being asked, and a typo in either half is a compile error.
 */
export function can(account: AccountUser | undefined, screen: string, verb: Verb): boolean {
  return accountCan(account, permissionId(screen, verb))
}

/**
 * …and does SCOPE allow it on THIS record?
 *
 * Scope narrows the three verbs that act on something that already exists. With
 * 'all' the holder reaches everyone's work; with 'own' — the default, applied
 * whenever a role has never been given a scope — only their own.
 *
 * `owns` is passed in rather than guessed here because ownership is not one
 * thing: a story matches on `createdByUserId` OR a byline, while a blog post
 * matches on `createdByUserId` only (its byline is free text, so it is not an
 * identity claim). See `ownsArticle` in rbac.ts.
 */
export function canOn(
  account: AccountUser | undefined,
  screen: string,
  verb: Verb,
  owns: boolean,
): boolean {
  if (!account) return false
  if (account.isSuperAdmin) return true
  if (!can(account, screen, verb)) return false
  return scopeFor(account, screen) === 'all' || owns
}

/** 'own' unless the role says otherwise. Superadmin always reaches everything. */
export function scopeFor(account: AccountUser | undefined, screen: string): 'own' | 'all' {
  if (!account) return 'own'
  if (account.isSuperAdmin) return 'all'
  return account.scopes[screen] === 'all' ? 'all' : 'own'
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
  /** Same shape the server checks with, so the UI can hide what it cannot do. */
  scopes: RoleScopes
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
  const shown = account.role
    ? [account.role]
    : account.isSuperAdmin
      ? [{ name: SUPERADMIN_ROLE_NAME, label: 'Superadmin', color: undefined, icon: 'ShieldCheck' }]
      : []

  const access: ClientAccess = {
    permissions: account.isSuperAdmin
      ? PERMISSION_CATALOGUE.map((p) => p.id)
      : [...account.permissions],
    scopes: account.scopes,
    modules: account.isSuperAdmin ? MODULE_CATALOGUE.map((m) => m.id) : [...account.modules],
    workflowStages: account.isSuperAdmin ? [...ALL_WORKFLOW_STAGES] : [...account.workflowStages],
    isSuperAdmin: account.isSuperAdmin,
    // Still an ARRAY on the wire (the client renders badges from it) but it can
    // now only ever hold zero or one entry.
    roles: shown.map((r) => ({ name: r.name, label: r.label, color: r.color, icon: r.icon })),
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
