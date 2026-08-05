
import { db } from './db.js'
import { PARTIES } from './collections.js'
import type { AccountUser } from './effectiveAccess.js'

/**
 * Scope depends only on the claimed party rows and org memberships, never on
 * resolved permissions. Typed structurally so anything carrying those two
 * satisfies it.
 */
type ScopedAccount = Pick<AccountUser, 'parties' | 'orgMembers'>

/**
 * Party-row ids the account may act through.
 *
 * Every claimed row qualifies. There is no verification step in this model — a
 * claim is the identity — so the old verified/pending-and-self-registered filter
 * has nothing left to test.
 */
export function manageablePartyIds(account: ScopedAccount): string[] {
  return account.parties.map((p) => p.id)
}

/** Org ids the account may ACT for. Read access is wider — see below. */
function writableOrgIds(account: ScopedAccount): string[] {
  return account.orgMembers
    .filter((m) => m.role === 'owner' || m.role === 'manager')
    .map((m) => m.orgId)
}

/** Every org the account belongs to, whatever their role in it. */
function allOrgIds(account: ScopedAccount): string[] {
  return account.orgMembers.map((m) => m.orgId)
}

/** Horse ids reached through a set of organisations, in ONE indexed query. */
async function horsesForOrgs(orgIds: string[]): Promise<string[]> {
  if (orgIds.length === 0) return []
  const rows = await db.collection(PARTIES).find({ orgId: { $in: [...new Set(orgIds)] } })
  return rows.filter((r) => r.horseId).map((r) => String(r.horseId))
}

/** Horse ids the account's OWN claimed party rows point at. */
function ownHorseIds(account: ScopedAccount): string[] {
  return account.parties.filter((p) => p.horseId).map((p) => p.horseId!)
}

/** Horse ids the account may WRITE: own party rows + orgs it owns or manages. */
export async function writableHorseIds(account: ScopedAccount): Promise<string[]> {
  const viaOrgs = await horsesForOrgs(writableOrgIds(account))
  return [...new Set([...ownHorseIds(account), ...viaOrgs])]
}

/**
 * Horse ids the account may SEE — as writable, plus horses reached through an org
 * it is merely a MEMBER of. Being in an organisation gets you visibility of its
 * horses; your role in it decides whether you can change them.
 */
export async function visibleHorseIds(account: ScopedAccount): Promise<string[]> {
  const viaOrgs = await horsesForOrgs(allOrgIds(account))
  return [...new Set([...ownHorseIds(account), ...viaOrgs])]
}
