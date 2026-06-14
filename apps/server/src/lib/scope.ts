// ---------------------------------------------------------------------------
// Relationship scope (server mirror of apps/web/src/rbac/scope.ts).
//
// A party's reach over horses comes from the dated party↔horse links plus the
// legacy direct id-array fields on the horse — never from the role alone.
// These pure functions back the server permission gate so enforcement matches
// the web engine. See RBAC.md §6.
// ---------------------------------------------------------------------------

import type { AccountUser } from './identity.js'

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
export function manageablePartyIds(account: AccountUser): string[] {
  // `selfRegistered` unset counts as self-registered (every legacy/dashboard claim
  // is one); only an explicit `false` (claiming a pre-existing party) opts out.
  return account.partyClaims
    .filter((c) => c.status === 'verified' || (c.status === 'pending' && c.selfRegistered !== false))
    .map((c) => c.partyId)
}

/**
 * Horse ids the account currently has authorised access to — the union of horses
 * linked to any manageable party claim they hold and any organisation they belong
 * to. Current links only (a past relationship grants no write access).
 */
export function authorisedHorseIds(account: AccountUser, data: ScopeData): string[] {
  const partyIds = [
    ...manageablePartyIds(account),
    ...account.orgMemberships.map((m) => m.orgId),
  ]
  const ids = new Set<string>()
  for (const pid of partyIds) {
    for (const hid of horsesLinkedToParty(pid, data, true)) ids.add(hid)
  }
  return [...ids]
}
