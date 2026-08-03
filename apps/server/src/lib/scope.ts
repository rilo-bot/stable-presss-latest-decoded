// ---------------------------------------------------------------------------
// Relationship scope (server mirror of apps/web/src/rbac/scope.ts).
//
// A party's reach over horses comes from the dated party↔horse links plus the
// legacy direct id-array fields on the horse — never from the role alone.
// These pure functions back the server permission gate so enforcement matches
// the web engine. See RBAC.md §6.
// ---------------------------------------------------------------------------

import type { IdentityUser, PartyClaim, OrgMembership } from './identity.js'

/**
 * Scope depends only on the PERSISTED identity (claims + memberships), never on
 * resolved permissions — racing reach comes from relationships, not roles. Typed
 * against IdentityUser so a resolved AccountUser also satisfies it.
 */
type ScopedAccount = Pick<IdentityUser, 'partyClaims' | 'orgMemberships'>

/** A raw horse/link doc as returned by db.collection().find() (carries _id). */
export interface ScopeDoc {
  _id?: string
  id?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface ScopeData {
  horses: ScopeDoc[]
  links: ScopeDoc[]
}

/** Legacy direct party-id array fields on the horse (mirror of ROLE_BINDINGS horseField). */
const HORSE_PARTY_ID_FIELDS = [
  'ownerIds',
  'trainerIds',
  'jockeyIds',
  'breederIds',
  'bloodstockAgentIds',
  'syndicateManagerIds',
  'personnelIds',
]

function isCurrent(link: ScopeDoc): boolean {
  return !link.end_date
}

function horseKey(h: ScopeDoc): string {
  return String(h._id ?? h.id)
}

/** Horse ids a party is linked to via ANY relationship (links + legacy id-arrays). */
export function horsesLinkedToParty(partyId: string, data: ScopeData, currentOnly = false): string[] {
  const ids = new Set<string>()

  for (const l of data.links) {
    if (l.party_id !== partyId) continue
    if (currentOnly && !isCurrent(l)) continue
    ids.add(String(l.horse_id))
  }

  for (const h of data.horses) {
    for (const f of HORSE_PARTY_ID_FIELDS) {
      const arr = h[f]
      if (Array.isArray(arr) && arr.includes(partyId)) {
        ids.add(horseKey(h))
        break
      }
    }
  }

  return [...ids]
}

/**
 * Party-ids the account may act through (write). A claim qualifies when it is
 * VERIFIED, or PENDING but self-registered (provisional access to one's own
 * party — see PartyClaim.selfRegistered).
 */
export function manageablePartyIds(account: ScopedAccount): string[] {
  // `selfRegistered` unset counts as self-registered (every legacy/dashboard claim
  // is one); only an explicit `false` (claiming a pre-existing party) opts out.
  return account.partyClaims
    .filter((c: PartyClaim) => c.status === 'verified' || (c.status === 'pending' && c.selfRegistered !== false))
    .map((c: PartyClaim) => c.partyId)
}

/** Org ids the account may ACT for. Read access is wider — see below. */
function writableOrgIds(account: ScopedAccount): string[] {
  return account.orgMemberships
    .filter((m: OrgMembership) => m.orgRole === 'org_owner' || m.orgRole === 'org_manager')
    .map((m: OrgMembership) => m.orgId)
}

/** Every org the account belongs to, whatever their role in it. */
function allOrgIds(account: ScopedAccount): string[] {
  return account.orgMemberships.map((m: OrgMembership) => m.orgId)
}

function horsesFor(partyIds: string[], data: ScopeData): string[] {
  const ids = new Set<string>()
  for (const pid of partyIds) {
    for (const hid of horsesLinkedToParty(pid, data, true)) ids.add(hid)
  }
  return [...ids]
}

/**
 * Horse ids the account may WRITE — the union of horses currently linked to a
 * manageable party claim they hold, or to an organisation they OWN OR MANAGE.
 * Current links only: a past relationship grants no write access.
 *
 * READ AND WRITE SCOPE ARE DIFFERENT, and conflating them was a real over-grant.
 * The previous single `authorisedHorseIds` fed BOTH the visibility filter and
 * `accountCanManageHorse`, and mapped EVERY `orgMemberships` entry to a party id
 * without consulting `orgRole` — so a plain `org_member` could edit every horse the
 * org was linked to, plus its sales, reports, media and racing entries. RBAC.md §4.3
 * says org_member "Cannot edit org-wide data" and §6 that access is "their org role
 * × the org's scope"; the role half was being dropped.
 * See docs/AUTH-RBAC-REVIEW.md H8.
 */
export function writableHorseIds(account: ScopedAccount, data: ScopeData): string[] {
  return horsesFor([...manageablePartyIds(account), ...writableOrgIds(account)], data)
}

/**
 * Horse ids the account may SEE — same as writable, plus horses reachable through
 * an org they are merely a MEMBER of. Being in an organisation is what gets you
 * visibility of its horses; your role in it is what decides whether you can change
 * them.
 */
export function visibleHorseIds(account: ScopedAccount, data: ScopeData): string[] {
  return horsesFor([...manageablePartyIds(account), ...allOrgIds(account)], data)
}
