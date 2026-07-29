// ---------------------------------------------------------------------------
// Identity model — role families, subscription tiers, and normalization.
//
// Mirrors apps/web/src/rbac/roles.ts + entitlement.ts. The web side owns UI
// affordances; this is the server's source of truth for the persisted shape and
// is where defaults/normalization (lazy migration on read) happen.
//
// See RBAC.md for the full model.
// ---------------------------------------------------------------------------

export type ReaderRole = 'reader'
export type StaffRole =
  | 'contributor'
  | 'editor'
  | 'legal_reviewer'
  | 'podcast_producer'
  | 'publisher'
  | 'administrator'
export type PartyRole =
  | 'owner'
  | 'trainer'
  | 'jockey'
  | 'breeder'
  | 'bloodstock agent'
  | 'syndicate manager'
  | 'personnel'
export type OrgRole = 'org_owner' | 'org_manager' | 'org_member'

/** Roles stored in user.roles[]. Org roles are scoped → live in orgMemberships. */
export type Role = ReaderRole | StaffRole | PartyRole

export const STAFF_ROLES: StaffRole[] = [
  'contributor',
  'editor',
  'legal_reviewer',
  'podcast_producer',
  'publisher',
  'administrator',
]

export const PARTY_ROLES: PartyRole[] = [
  'owner',
  'trainer',
  'jockey',
  'breeder',
  'bloodstock agent',
  'syndicate manager',
  'personnel',
]

export type SubscriptionTier = 'free' | 'standard' | 'premium'

export interface PartyClaim {
  id: string
  partyId: string
  role: PartyRole
  status: 'pending' | 'verified' | 'rejected'
  evidenceUrl?: string
  verifiedBy?: string
  verifierType?: 'admin' | 'org'
  verifiedAt?: string
  rejectionReason?: string
  /**
   * True when this claim registered the account's OWN person-party (minted for
   * them), rather than claiming a pre-existing party. Self-registered claims get
   * PROVISIONAL access immediately — the member may manage their own party + the
   * horses/data they create while still `pending`. Their work stays `unverified`
   * (hidden from the public) until staff verification flips it live. A claim on an
   * EXISTING party (selfRegistered=false) stays view-only until verified.
   */
  selfRegistered?: boolean
}

export interface OrgMembership {
  orgId: string
  orgRole: OrgRole
}

/** The shape every user doc conforms to after normalization. */
export interface AccountUser {
  id: string
  email: string
  displayName: string
  createdAt: string
  roles: Role[]
  subscriptionTier: SubscriptionTier
  partyClaims: PartyClaim[]
  orgMemberships: OrgMembership[]
  /**
   * Admin-defined custom roles assigned to this account (ids into `customRoles`).
   * Layered ON TOP of `roles[]` — they add navigation surfaces and UI
   * affordances, they never replace a staff role. See lib/effectiveAccess.ts.
   */
  customRoleIds: string[]
  /** Derived: highest-privilege staff role if any, else 'reader'. Back-compat for token + UI. */
  role: Role
}

const STAFF_RANK: Record<StaffRole, number> = {
  administrator: 6,
  publisher: 5,
  editor: 4,
  legal_reviewer: 3,
  podcast_producer: 2,
  contributor: 1,
}

function isStaffRole(r: unknown): r is StaffRole {
  return typeof r === 'string' && (STAFF_ROLES as string[]).includes(r)
}

/** Highest-privilege staff role the user holds, else 'reader'. */
export function primaryRole(roles: Role[]): Role {
  let best: StaffRole | null = null
  for (const r of roles) {
    if (isStaffRole(r) && (!best || STAFF_RANK[r] > STAFF_RANK[best])) best = r
  }
  return best ?? 'reader'
}

/**
 * Guarantee a (possibly legacy single-`role`) user doc has the full identity
 * shape. Doubles as lazy migration on read. `raw` is a projected doc ({ id, … }).
 */
export function withIdentityDefaults(raw: Record<string, any>): AccountUser {
  const legacyRole = typeof raw.role === 'string' ? raw.role : undefined
  let roles: Role[] = Array.isArray(raw.roles)
    ? raw.roles.filter((r: unknown): r is Role => typeof r === 'string')
    : []
  if (roles.length === 0) {
    // Derive from the legacy single-role field: staff role → keep it, else reader.
    roles = isStaffRole(legacyRole) ? ['reader', legacyRole] : ['reader']
  }
  if (!roles.includes('reader')) roles = ['reader', ...roles]

  const tier: SubscriptionTier =
    raw.subscriptionTier === 'standard' || raw.subscriptionTier === 'premium'
      ? raw.subscriptionTier
      : 'free'

  return {
    id: String(raw.id),
    email: String(raw.email ?? ''),
    displayName: String(raw.displayName ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    roles,
    subscriptionTier: tier,
    partyClaims: Array.isArray(raw.partyClaims) ? raw.partyClaims : [],
    orgMemberships: Array.isArray(raw.orgMemberships) ? raw.orgMemberships : [],
    customRoleIds: Array.isArray(raw.customRoleIds)
      ? raw.customRoleIds.filter((r: unknown): r is string => typeof r === 'string')
      : [],
    role: primaryRole(roles),
  }
}

/** Persisted fields for a brand-new reader account (default state of every signup). */
export function newReaderFields(): Pick<
  AccountUser,
  'roles' | 'subscriptionTier' | 'partyClaims' | 'orgMemberships' | 'customRoleIds'
> {
  return {
    roles: ['reader'],
    subscriptionTier: 'free',
    partyClaims: [],
    orgMemberships: [],
    customRoleIds: [],
  }
}
