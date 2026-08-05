// ---------------------------------------------------------------------------
// Identity model — the PERSISTED user shape.
//
// `users` holds FOUR identity fields and nothing else: name, email, isAdmin,
// lastLogin (plus `_id` and `createdAt`). Every other axis is its own collection
// — see lib/collections.ts for the whole model in one place:
//
//   admins      → adminRoles   the admin role (one per user)
//   parties                    racing identities + horse links (one row per role)
//   orgMembers                 organisation membership
//
// This file owns only what is stored on the user document; what an account may DO
// lives in lib/effectiveAccess.ts.
// ---------------------------------------------------------------------------

/** Racing identities. STATIC by design — a fixed vocabulary, not configurable. */
export type PartyRole =
  | 'owner'
  | 'trainer'
  | 'jockey'
  | 'breeder'
  | 'bloodstock agent'
  | 'syndicate manager'
  | 'personnel'

/**
 * Org-membership roles — scoped to one organisation. Static by design.
 *
 * Unprefixed: these values only ever appear on an `orgMembers` row, so an `org_`
 * prefix restated the collection name in every comparison.
 */
export type OrgRole = 'owner' | 'manager' | 'member'

export const ORG_ROLES: OrgRole[] = ['owner', 'manager', 'member']

/** Narrow an untrusted value to an OrgRole, defaulting to the least privileged. */
export function toOrgRole(value: unknown): OrgRole {
  return value === 'owner' || value === 'manager' ? value : 'member'
}

/**
 * Derived on the wire from claimed party rows. Never stored.
 *
 * There is no 'reader' role. There are exactly TWO categories of account —
 * users and admins — so "reader" was never a role, just the absence of one. An
 * account with no claimed party has an empty list.
 */
export type Role = PartyRole

/** The name the seeded all-access role is created with. Authority is `isSuper`. */
export const SUPERADMIN_ROLE_NAME = 'superadmin'

export const PARTY_ROLES: PartyRole[] = [
  'owner',
  'trainer',
  'jockey',
  'breeder',
  'bloodstock agent',
  'syndicate manager',
  'personnel',
]

/** Narrow an untrusted value to a PartyRole, or undefined. */
export function toPartyRole(value: unknown): PartyRole | undefined {
  return PARTY_ROLES.includes(value as PartyRole) ? (value as PartyRole) : undefined
}

/**
 * One row in `parties`. Doubles as the REGISTER and the CLAIM.
 *
 * Staff create a row for a trainer or owner who has never signed up —
 * `taken: false`, no `userId`. A user claiming it flips `taken` and sets `userId`.
 * There is no pending/verified state: a claim is immediately true.
 *
 * ONE ROW PER ROLE. Someone who is both owner and trainer of a horse gets two
 * rows, which is what makes `role` a single value rather than an array.
 */
export interface PartyRow {
  id: string
  name: string
  imageUrl?: string
  role: PartyRole
  /** Claimed by a user. Derived from `userId` — only lib/parties.ts writes both. */
  taken: boolean
  userId?: string
  orgId?: string
  horseId?: string
}

/** One row in `orgMembers`. */
export interface OrgMemberRow {
  id: string
  orgId: string
  role: OrgRole
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
  name: string
  email: string
  createdAt: string
  /**
   * ADMIN or user — the only two categories there are. The role in `admins`
   * decides what an admin may do; this says whether they are one.
   *
   * A DENORMALISED COPY of "has an `admins` row", kept so listing admins is one
   * indexed query. Written only by lib/admins.ts, and never trusted for access —
   * `resolveAccount` overwrites it from the row before any check can read it.
   */
  isAdmin: boolean
  /** Last successful sign-in, ISO. `null` until they have logged in once. */
  lastLogin: string | null
}

/**
 * Guarantee a user doc has the full identity shape. `raw` is a projected doc
 * ({ id, … }).
 *
 * Only the stored identity fields. Anything role- or membership-related is a
 * separate collection and is resolved by lib/effectiveAccess.ts.
 */
export function withIdentityDefaults(raw: Record<string, any>): IdentityUser {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    isAdmin: raw.isAdmin === true,
    lastLogin: typeof raw.lastLogin === 'string' && raw.lastLogin ? raw.lastLogin : null,
  }
}

/**
 * Convenience re-export. `AccountUser` (IdentityUser + resolved permissions)
 * lives in effectiveAccess.ts, but most callers import their identity types
 * from here. Type-only, so it is erased at compile time and creates no runtime
 * import cycle.
 */
export type { AccountUser } from './effectiveAccess.js'

/**
 * Persisted fields for a brand-new account — the default state of every signup.
 *
 * Written EXPLICITLY rather than left absent so `find({ isAdmin: false })` behaves
 * predictably. Becoming an admin means an `admins` row, which only lib/admins.ts
 * creates.
 */
export function newUserFields(): Pick<IdentityUser, 'isAdmin' | 'lastLogin'> {
  return {
    isAdmin: false,
    lastLogin: null,
  }
}
