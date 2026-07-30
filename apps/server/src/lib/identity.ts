// ---------------------------------------------------------------------------
// Identity model — the PERSISTED user shape.
//
// Staff/editorial roles are NO LONGER a TypeScript union. They are rows in the
// `roles` collection, referenced from `user.staffRoles[]` by slug, and resolved
// through lib/roleRegistry.ts. This file owns only what is stored on the user
// doc; what an account may DO lives in lib/effectiveAccess.ts.
//
// Two role axes, deliberately kept in separate arrays so a superadmin-created
// slug can never collide with a racing identity:
//
//   roles[]       STATIC  — 'reader' + verified PartyRoles ('trainer', 'owner'…)
//   staffRoles[]  DYNAMIC — slugs into the `roles` collection
//
// See RBAC.md and docs/DYNAMIC-RBAC-PLAN.md.
// ---------------------------------------------------------------------------

export type ReaderRole = 'reader'

/**
 * Racing identities. STATIC by design — these are bound to horsePartyLinks,
 * ROLE_BINDINGS and the claim-verification flow, and are a different axis from
 * "what may this employee do". Deliberately excluded from dynamic RBAC.
 */
export type PartyRole =
  | 'owner'
  | 'trainer'
  | 'jockey'
  | 'breeder'
  | 'bloodstock agent'
  | 'syndicate manager'
  | 'personnel'

/** Org-membership roles — scoped to one organisation. Also static by design. */
export type OrgRole = 'org_owner' | 'org_manager' | 'org_member'

/** Roles stored in user.roles[] — the static axis only. */
export type Role = ReaderRole | PartyRole

/** A slug into the `roles` collection. Any string; validity is a DB question. */
export type RoleSlug = string

export const PARTY_ROLES: PartyRole[] = [
  'owner',
  'trainer',
  'jockey',
  'breeder',
  'bloodstock agent',
  'syndicate manager',
  'personnel',
]

const STATIC_ROLES = new Set<string>(['reader', ...PARTY_ROLES])

/** Narrow an arbitrary stored string to the static `roles[]` axis. */
export function isStaticRole(v: unknown): v is Role {
  return typeof v === 'string' && STATIC_ROLES.has(v)
}

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

/**
 * The persisted user shape — plain, JSON-safe, no resolved permissions.
 *
 * This type CANNOT be used for an authorization check: `accountCan` requires an
 * `AccountUser`, which only `attachAccount` can produce. That split is
 * deliberate — it makes "forgot to resolve permissions" a compile error rather
 * than a silent allow/deny.
 */
export interface IdentityUser {
  id: string
  email: string
  displayName: string
  createdAt: string
  /** STATIC axis: 'reader' + verified party roles. */
  roles: Role[]
  subscriptionTier: SubscriptionTier
  partyClaims: PartyClaim[]
  orgMemberships: OrgMembership[]
  /** DYNAMIC axis: slugs into the `roles` collection. */
  staffRoles: RoleSlug[]
}

/**
 * Guarantee a user doc has the full identity shape. `raw` is a projected doc
 * ({ id, … }).
 *
 * The two role axes are kept strictly apart. `roles[]` is filtered down to
 * values that are actually static roles, so a stray string in that array can
 * never be mistaken for a party identity; anything dynamic must arrive through
 * `staffRoles[]`, which is the only path to a permission.
 */
export function withIdentityDefaults(raw: Record<string, any>): IdentityUser {
  const rawRoles: string[] = Array.isArray(raw.roles)
    ? raw.roles.filter((r: unknown): r is string => typeof r === 'string')
    : []

  // Static axis: 'reader' plus verified party identities, nothing else.
  let roles = rawRoles.filter(isStaticRole)
  if (!roles.includes('reader')) roles = ['reader', ...roles]

  // Dynamic axis: role slugs, resolved against the `roles` collection.
  const staff = Array.isArray(raw.staffRoles)
    ? [...new Set(raw.staffRoles.filter((r: unknown): r is string => typeof r === 'string'))]
    : []

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
    staffRoles: staff,
  }
}

/**
 * Convenience re-export. `AccountUser` (IdentityUser + resolved permissions)
 * lives in effectiveAccess.ts, but most callers import their identity types
 * from here. Type-only, so it is erased at compile time and creates no runtime
 * import cycle.
 */
export type { AccountUser } from './effectiveAccess.js'

/** Persisted fields for a brand-new reader account (default state of every signup). */
export function newReaderFields(): Pick<
  IdentityUser,
  'roles' | 'subscriptionTier' | 'partyClaims' | 'orgMemberships' | 'staffRoles'
> {
  return {
    roles: ['reader'],
    subscriptionTier: 'free',
    partyClaims: [],
    orgMemberships: [],
    staffRoles: [],
  }
}
