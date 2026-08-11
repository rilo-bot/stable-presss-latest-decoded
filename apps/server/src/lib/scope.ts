// Relationship scope: which horses an account reaches, and how.
//
// A party row carries `horseId` directly, so this is indexed queries rather than
// a join through a link table.

import { db } from './db.js'
import { PARTIES } from './collections.js'
import type { AccountUser } from './effectiveAccess.js'

/** Scope depends only on claimed parties and org membership, never on permissions. */
type ScopedAccount = Pick<AccountUser, 'parties' | 'orgMembers'>

/** Every claimed row qualifies: in this model a claim IS the identity. */
export function manageablePartyIds(account: ScopedAccount): string[] {
  return account.parties.map((p) => p.id)
}

function ownHorseIds(account: ScopedAccount): string[] {
  return account.parties.filter((p) => p.horseId).map((p) => p.horseId!)
}

async function horsesForOrgs(orgIds: string[]): Promise<string[]> {
  if (orgIds.length === 0) return []
  const rows = await db.collection(PARTIES).find({ orgId: { $in: [...new Set(orgIds)] } })
  return rows.filter((r) => r.horseId).map((r) => String(r.horseId))
}

/** Own party rows, plus orgs the account OWNS or MANAGES. */
export async function writableHorseIds(account: ScopedAccount): Promise<string[]> {
  const orgIds = account.orgMembers
    .filter((m) => m.role === 'owner' || m.role === 'manager')
    .map((m) => m.orgId)
  return [...new Set([...ownHorseIds(account), ...(await horsesForOrgs(orgIds))])]
}

/**
 * Wider than writable: belonging to an organisation gets you SIGHT of its
 * horses; your role in it decides whether you can change them.
 */
export async function visibleHorseIds(account: ScopedAccount): Promise<string[]> {
  const orgIds = account.orgMembers.map((m) => m.orgId)
  return [...new Set([...ownHorseIds(account), ...(await horsesForOrgs(orgIds))])]
}
