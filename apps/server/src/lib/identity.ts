export type PartyRole =
  | 'owner'
  | 'trainer'
  | 'jockey'
  | 'breeder'
  | 'bloodstock agent'
  | 'syndicate manager'
  | 'personnel'

export type OrgRole = 'owner' | 'manager' | 'member'

export type Role = PartyRole

export const SUPERADMIN_ROLE_NAME = 'superadmin'

const PARTY_ROLES: PartyRole[] = [
  'owner',
  'trainer',
  'jockey',
  'breeder',
  'bloodstock agent',
  'syndicate manager',
  'personnel',
]

export function toPartyRole(value: unknown): PartyRole | undefined {
  return PARTY_ROLES.includes(value as PartyRole) ? (value as PartyRole) : undefined
}

export function toOrgRole(value: unknown): OrgRole {
  return value === 'owner' || value === 'manager' ? value : 'member'
}

/**
 * One row in `parties`: an EDGE joining a person to a role, and optionally to a
 * horse and an org. One row per person × role × horse.
 *
 * `name` and `imageUrl` are the PERSON's, resolved at read time from `people`.
 * They are never written to the edge — that duplication is what the split
 * exists to prevent, so treat them as read-only projections.
 */
export interface PartyRow {
  id: string
  personId: string
  name: string
  imageUrl?: string
  role: PartyRole
  taken: boolean
  userId?: string
  orgId?: string
  horseId?: string
}

export interface OrgMemberRow {
  id: string
  orgId: string
  role: OrgRole
}

/**
 * The stored user shape.
 *
 * `isAdmin` is the CATEGORY — true means this account is staff. WHICH role they
 * hold is not here: it is the one `adminRoles` row pointing at them, so a normal
 * reader carries no role reference of any kind.
 *
 * Cannot be used for an authorization check: `accountCan` takes an `AccountUser`,
 * which only `resolveAccount` produces — and resolveAccount is what reads the
 * link row. A bare IdentityUser knows the category and nothing about permissions.
 */
export interface IdentityUser {
  id: string
  name: string
  email: string
  createdAt: string
  isAdmin: boolean
  lastLogin: string | null
}

export function withIdentityDefaults(raw: Record<string, any>): IdentityUser {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    // Strict `=== true`: a missing field, a legacy string, or a stray truthy
    // value must never read as staff.
    isAdmin: raw.isAdmin === true,
    lastLogin: typeof raw.lastLogin === 'string' && raw.lastLogin ? raw.lastLogin : null,
  }
}

/** A brand-new account is never staff and holds no link row. */
export function newUserFields(): Pick<IdentityUser, 'isAdmin' | 'lastLogin'> {
  return { isAdmin: false, lastLogin: null }
}

export type { AccountUser } from './effectiveAccess.js'
