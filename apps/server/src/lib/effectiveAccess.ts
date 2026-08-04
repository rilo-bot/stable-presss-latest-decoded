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

import { db } from './db.js'
import { ORG_MEMBERSHIPS, PARTY_MEMBERSHIPS } from './membership.js'
import { isStaffIdentity } from './identity.js'
import type { IdentityUser, OrgMembership, PartyClaim, Role, RoleSlug } from './identity.js'
import { SUPERADMIN_SLUG, rolesForSlugs, type RoleDoc } from './roleRegistry.js'
import {
  ALL_WORKFLOW_STAGES,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  type PermissionAction,
} from './permissionCatalogue.js'

/** An identity whose roles have been resolved. Required for every auth check. */
export interface AccountUser extends IdentityUser {
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

/** Cheap, synchronous, DB-free superadmin test. */
export function hasSuperAdminSlug(staffRoles: RoleSlug[] | undefined): boolean {
  return !!staffRoles && staffRoles.includes(SUPERADMIN_SLUG)
}

/**
 * Resolve an identity into an AccountUser.
 *
 * P2 KEYSTONE (docs/USER-MODEL-PLAN.md §4). The two 1:many membership axes now
 * come from their own collections instead of embedded arrays on the user document.
 * `AccountUser` keeps its exact previous SHAPE, which is what makes this cheap:
 * every consumer — lib/scope.ts, orgRoleIn, routes/horses.ts, every agent file,
 * toClientUser and therefore the whole web app — reads the same field names and
 * needed no change at all.
 *
 * COST: the staff axis and its permissions still cost ZERO extra queries — the
 * slug rides on the user document already fetched, and the role registry is an
 * in-process cache. The two membership lookups are equality matches on indexed
 * fields issued CONCURRENTLY, so this is one extra network round trip.
 *
 * Deliberately NOT cached on the user document: a denormalised snapshot is exactly
 * what produced the hand-synced `roles[]` array and its drift.
 */
export async function resolveAccount(identity: IdentityUser): Promise<AccountUser> {
  const isSuperAdmin = hasSuperAdminSlug(identity.staffRoles)

  const permissions = new Set<PermissionAction>()
  const modules = new Set<string>()
  const workflowStages = new Set<string>()

  const [roleDocs, memberships] = await Promise.all([
    rolesForSlugs(identity.staffRoles),
    loadMemberships(identity.id),
  ])
  for (const role of roleDocs) {
    for (const p of role.permissions) permissions.add(p)
    for (const m of role.modules) modules.add(m)
    for (const s of role.workflowStages) workflowStages.add(s)
  }

  return {
    ...identity,
    ...memberships,
    isSuperAdmin,
    permissions,
    modules,
    workflowStages,
    roleDocs,
  }
}

/**
 * The two membership axes for one user, read from the edge collections and shaped
 * back into the arrays every existing consumer expects.
 *
 * Rejected claims are loaded too: the account payload shows a member why a claim
 * failed, and `manageablePartyIds` filters by status itself rather than assuming
 * the list is pre-filtered.
 */
/** Only reachable for a row written before `claimId` existed. */
function warnMissingClaimId(rowId: unknown): string {
  console.warn(
    `[rbac] partyMemberships row ${String(rowId)} has no claimId — verify/reject cannot ` +
      'resolve it. Run: npx tsx scripts/migrate-user-model.ts --apply',
  )
  return String(rowId)
}

async function loadMemberships(
  userId: string,
): Promise<Pick<IdentityUser, 'partyClaims' | 'orgMemberships'>> {
  if (!userId) return { partyClaims: [], orgMemberships: [] }
  const [partyRows, orgRows] = await Promise.all([
    db.collection(PARTY_MEMBERSHIPS).find({ userId }),
    db.collection(ORG_MEMBERSHIPS).find({ userId }),
  ])
  return {
    partyClaims: partyRows.map((r) => ({
      // The client sends this id back to verify/reject, and findClaim() looks it up
      // by `claimId` — so falling back to the row's _id produces an id that resolves
      // to NOTHING. Warn rather than fail silently: the row is readable, but that
      // claim cannot be actioned until the backfill gives it a claimId.
      id: String(r.claimId || warnMissingClaimId(r._id)),
      partyId: String(r.partyId),
      role: r.role as PartyClaim['role'],
      status: r.status as PartyClaim['status'],
      evidenceUrl: r.evidenceKey ? String(r.evidenceKey) : undefined,
      verifiedBy: r.verifiedBy ? String(r.verifiedBy) : undefined,
      verifierType: r.verifierType as PartyClaim['verifierType'],
      verifiedAt: r.verifiedAt ? String(r.verifiedAt) : undefined,
      rejectionReason: r.rejectionReason ? String(r.rejectionReason) : undefined,
      selfRegistered: r.selfRegistered !== false,
    })),
    orgMemberships: orgRows.map((r) => ({
      orgId: String(r.orgId),
      orgRole: r.orgRole as OrgMembership['orgRole'],
    })),
  }
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
 * The static `roles[]` axis, computed from verified party memberships.
 *
 * 'reader' is the floor every account holds (RBAC.md §4.1). A party role joins the
 * list only once VERIFIED — a pending claim grants provisional scope over your own
 * records but is not a racing identity you may advertise.
 */
function derivedRoles(account: AccountUser): Role[] {
  const roles = new Set<Role>(['reader'])
  for (const c of account.partyClaims) {
    if (c.status === 'verified') roles.add(c.role)
  }
  return [...roles]
}

/**
 * JSON-safe projection of an AccountUser for the web app. Sets don't serialize,
 * and the resolved role docs carry more than the client needs — so serialization
 * goes through here rather than spreading `req.account` into a response.
 */
export function toClientUser(account: AccountUser): Record<string, unknown> {
  // Superadmin is derived from the CATALOGUE, not from its role row. accountCan
  // short-circuits before any lookup, so the server grants everything even when
  // that row is missing — reading the row here would hand the client an empty
  // payload in exactly that case, leaving a superadmin with no sidebar on a
  // platform that considers them omnipotent.
  const superRoles = account.roleDocs.length
    ? account.roleDocs
    : [{ slug: SUPERADMIN_SLUG, label: 'Superadmin', color: undefined, icon: 'ShieldCheck' }]

  // `newsroom.access` is not in the catalogue and no role can hold it — holding a
  // staff role IS newsroom access (see identity.ts `isStaffIdentity`). It is
  // emitted here as a DERIVED flag so the browser keeps asking one question
  // (`RequireStaff` → `can('newsroom.access')`) instead of learning a second way
  // to test the same fact. Without this line every staff route in the SPA would
  // bounce to the public site.
  const implicit: PermissionAction[] =
    account.isSuperAdmin || isStaffIdentity(account) ? ['newsroom.access'] : []

  const access: ClientAccess = {
    permissions: account.isSuperAdmin
      ? [...implicit, ...PERMISSION_CATALOGUE.map((p) => p.id)]
      : [...implicit, ...account.permissions],
    modules: account.isSuperAdmin ? MODULE_CATALOGUE.map((m) => m.id) : [...account.modules],
    workflowStages: account.isSuperAdmin ? [...ALL_WORKFLOW_STAGES] : [...account.workflowStages],
    isSuperAdmin: account.isSuperAdmin,
    roles: (account.isSuperAdmin ? superRoles : account.roleDocs).map((r) => ({
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
    // DERIVED, not stored. `roles[]` was a hand-synced cache of 'reader' + verified
    // party roles, kept in step by one manual line in routes/partyClaims.ts — a
    // second source of truth that any new code path could forget to update.
    // Computing it here keeps `currentUser.roles` and `useHasRole` working on the
    // client while the stored duplicate goes away. See docs/USER-MODEL-PLAN.md §4.
    roles: derivedRoles(account),
    staffRoles: account.staffRoles,
    subscriptionTier: account.subscriptionTier,
    partyClaims: account.partyClaims,
    orgMemberships: account.orgMemberships,
    access,
  }
}
