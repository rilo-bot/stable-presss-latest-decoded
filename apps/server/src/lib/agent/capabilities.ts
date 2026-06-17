// ---------------------------------------------------------------------------
// Capability resolver — the SINGLE source of truth for "what can this account
// do right now", derived straight from the RBAC layer (rbac.ts + scope.ts).
//
// Two shapes, one logic:
//   - summariseCapabilities()  — cheap, synchronous, account-only. Injected into
//     every agent system prompt so guidance is exact ("you can do X here; Y needs
//     a verified trainer claim") instead of generic.
//   - getCapabilities()        — DB-backed, structured Capability[] for the
//     `whatCanIDo` tool and (Phase D) the Production System dashboard quick
//     actions. Same rules, richer detail (stable size, pending claims, where).
//
// It NEVER grants anything — it only DESCRIBES the gates the REST routes already
// enforce. So it can drift no further than the gates themselves.
// ---------------------------------------------------------------------------

import { db } from '../db.js'
import { isStaff, isAdmin, contentCan } from '../rbac.js'
import { manageablePartyIds, authorisedHorseIds } from '../scope.js'
import type { AccountUser } from '../identity.js'

export type CapabilityCategory =
  | 'account'
  | 'racing'
  | 'editorial'
  | 'organisation'
  | 'subscription'

export interface Capability {
  /** Stable id (also a good quick-action key for the dashboard). */
  id: string
  label: string
  category: CapabilityCategory
  allowed: boolean
  /** When blocked: why + how to unlock. When allowed: optional extra context. */
  reason?: string
  /** Where in the app to do this (path or page name). */
  where?: string
}

export interface CapabilityReport {
  signedIn: boolean
  identity: {
    name?: string
    roles: string[]
    isStaff: boolean
    isAdmin: boolean
    subscriptionTier?: string
  }
  /** Concrete counts that make guidance specific. */
  stable: { manageableHorses: number; manageableParties: number; pendingClaims: number }
  organisations: Array<{ orgId: string; orgRole: string }>
  capabilities: Capability[]
}

const isPublisher = (a: AccountUser) => a.roles.includes('publisher') || a.roles.includes('administrator')
const isReviewer = (a: AccountUser) =>
  a.roles.includes('editor') || a.roles.includes('legal_reviewer') || a.roles.includes('administrator')

/** The capability list for a signed-in account. Pure: needs only the account + counts. */
function buildCapabilities(
  account: AccountUser,
  counts: { manageableHorses: number; manageableParties: number },
): Capability[] {
  const staff = isStaff(account)
  const admin = isAdmin(account)
  const hasParty = counts.manageableParties > 0
  const premium = account.subscriptionTier === 'premium'
  const orgManage = account.orgMemberships.some(
    (m) => m.orgRole === 'org_owner' || m.orgRole === 'org_manager',
  )

  const caps: Capability[] = [
    // ── Racing / member self-service ──
    { id: 'follow-horse', label: 'Follow a horse', category: 'racing', allowed: true, where: 'Horses' },
    { id: 'place-tip', label: 'Place a tip', category: 'racing', allowed: true, where: 'Tipping Ring' },
    {
      id: 'register-horse',
      label: 'Register a horse',
      category: 'racing',
      allowed: true,
      reason: 'It joins your stable and stays hidden from the public until staff verify it.',
      where: 'Dashboard → My Stable',
    },
    {
      id: 'claim-role',
      label: 'Claim a racing role',
      category: 'racing',
      allowed: true,
      reason: 'Owner, trainer, jockey, breeder, agent, syndicate manager or personnel — staff verify it, then editing unlocks.',
      where: 'Dashboard → Racing Roles',
    },
    {
      id: 'manage-stable',
      label: 'Manage your stable',
      category: 'racing',
      allowed: counts.manageableHorses > 0,
      reason:
        counts.manageableHorses > 0
          ? `You manage ${counts.manageableHorses} horse(s).`
          : 'Claim a racing role or register a horse first — then your stable unlocks.',
      where: 'Dashboard → My Stable',
    },
    {
      id: 'edit-own-party',
      label: 'Edit your own party profile',
      category: 'racing',
      allowed: hasParty,
      reason: hasParty
        ? `You manage ${counts.manageableParties} party profile(s).`
        : 'Claiming a racing role mints your party profile — then it becomes editable.',
      where: 'Profile Studio',
    },

    // ── Subscription ──
    {
      id: 'read-premium',
      label: 'Read premium articles',
      category: 'subscription',
      allowed: premium,
      reason: premium ? 'Your plan includes premium content.' : 'Switch to the premium plan to unlock it.',
      where: 'Dashboard → Your Plan',
    },
  ]

  // ── Editorial (staff only) ──
  if (staff) {
    caps.push(
      {
        id: 'create-draft',
        label: 'Create a story draft',
        category: 'editorial',
        allowed: contentCan(account, 'content.draft.create'),
        reason: contentCan(account, 'content.draft.create')
          ? undefined
          : 'Your editorial role does not include drafting — an editor can assign you.',
        where: 'Newsroom → Drafts',
      },
      {
        id: 'edit-any-story',
        label: 'Edit any story',
        category: 'editorial',
        allowed: contentCan(account, 'content.draft.edit_any'),
        reason: contentCan(account, 'content.draft.edit_any') ? undefined : 'Reserved for editors, legal reviewers and publishers.',
        where: 'Newsroom → All Stories',
      },
      {
        id: 'review-story',
        label: 'Review stories',
        category: 'editorial',
        allowed: isReviewer(account),
        reason: isReviewer(account) ? undefined : 'Reserved for editors, legal reviewers and administrators.',
        where: 'Newsroom → In Review',
      },
      {
        id: 'publish-story',
        label: 'Publish & distribute stories',
        category: 'editorial',
        allowed: isPublisher(account),
        reason: isPublisher(account) ? undefined : 'Publishing is reserved for publishers and administrators.',
        where: 'Newsroom → Workflow Board',
      },
      {
        id: 'manage-bulletins',
        label: 'Build & publish bulletins',
        category: 'editorial',
        allowed: true,
        where: 'Newsroom → Magazine Studio',
      },
      {
        id: 'manage-racing-data',
        label: 'Edit racing data (horses, parties, media, entries)',
        category: 'editorial',
        allowed: true,
        where: 'Newsroom → Production Systems',
      },
      {
        id: 'verify-claims',
        label: 'Verify racing-role claims',
        category: 'editorial',
        allowed: admin,
        reason: admin ? undefined : 'Administrators verify claims globally; org owners/managers verify claims for their own parties.',
        where: 'Verify Claims',
      },
      {
        id: 'manage-team',
        label: 'Manage the team',
        category: 'editorial',
        allowed: admin,
        reason: admin ? undefined : 'Reserved for administrators.',
        where: 'Newsroom → Team',
      },
    )
  }

  // ── Organisation ──
  if (account.orgMemberships.length) {
    caps.push({
      id: 'manage-org',
      label: 'Manage your organisation',
      category: 'organisation',
      allowed: orgManage,
      reason: orgManage
        ? 'Invite members, add managed parties, verify members’ claims.'
        : 'You are a member — owners and managers run the organisation.',
      where: 'My Organisation',
    })
  }

  return caps
}

/** DB-backed, structured capability report (for the whatCanIDo tool + dashboard). */
export async function getCapabilities(account?: AccountUser): Promise<CapabilityReport> {
  if (!account) {
    return {
      signedIn: false,
      identity: { roles: ['guest'], isStaff: false, isAdmin: false },
      stable: { manageableHorses: 0, manageableParties: 0, pendingClaims: 0 },
      organisations: [],
      capabilities: [
        { id: 'browse', label: 'Browse public horses, parties, news, bulletins & the podcast', category: 'account', allowed: true },
        { id: 'follow-horse', label: 'Follow a horse', category: 'racing', allowed: false, reason: 'Create a free account to follow horses.', where: 'Sign up' },
        { id: 'place-tip', label: 'Place a tip', category: 'racing', allowed: false, reason: 'Tipping needs a free account.', where: 'Sign up' },
        { id: 'claim-role', label: 'Claim a racing role', category: 'racing', allowed: false, reason: 'Create a free account, then claim your role from the Dashboard.', where: 'Sign up' },
      ],
    }
  }

  const partyIds = manageablePartyIds(account)
  const [horses, links] = await Promise.all([
    db.collection('horses').find(),
    db.collection('horsePartyLinks').find(),
  ])
  const manageableHorses = isStaff(account)
    ? horses.length
    : authorisedHorseIds(account, { horses, links }).length
  const pendingClaims = account.partyClaims.filter((c) => c.status === 'pending').length

  return {
    signedIn: true,
    identity: {
      name: account.displayName || account.email,
      roles: account.roles,
      isStaff: isStaff(account),
      isAdmin: isAdmin(account),
      subscriptionTier: account.subscriptionTier,
    },
    stable: { manageableHorses, manageableParties: partyIds.length, pendingClaims },
    organisations: account.orgMemberships.map((m) => ({ orgId: m.orgId, orgRole: m.orgRole })),
    capabilities: buildCapabilities(account, { manageableHorses, manageableParties: partyIds.length }),
  }
}

/**
 * Cheap, synchronous capability summary for the system prompt. Account-only (no
 * DB) so prompt building stays fast and side-effect free. Counts that need the DB
 * (exact stable size) are deliberately omitted here — the model can call
 * `whatCanIDo` when it needs them.
 */
export function summariseCapabilities(account?: AccountUser): string {
  if (!account) {
    return [
      'CAPABILITIES — this reader is a GUEST.',
      'CAN now: browse all public horses, parties, news, bulletins, the podcast and the tipping leaderboard.',
      'NEEDS a free account: follow horses, place tips, claim a racing role, manage a stable, edit any profile.',
      'When something they want needs an account, warmly point them to Sign up / Log in — never as a scold.',
    ].join('\n')
  }

  const staff = isStaff(account)
  const admin = isAdmin(account)
  const partyIds = manageablePartyIds(account)
  const can: string[] = ['follow horses', 'place tips', 'register a horse (joins their stable, hidden until staff verify)']
  const gated: string[] = []

  if (partyIds.length) can.push(`edit their own party profile (${partyIds.length})`)
  else gated.push('editing a party profile → claim a racing role from the Dashboard to mint it')

  const pending = account.partyClaims.filter((c) => c.status === 'pending')
  if (pending.length) gated.push(`${pending.length} racing-role claim(s) pending staff verification (read-only until verified)`)

  if (account.subscriptionTier !== 'premium') gated.push('premium articles → switch plan on Dashboard → Your Plan')

  if (staff) {
    can.push('work in the Newsroom', 'build & publish bulletins in the Magazine Studio')
    if (contentCan(account, 'content.draft.create')) can.push('create story drafts')
    if (contentCan(account, 'content.draft.edit_any')) can.push('edit any story')
    if (isReviewer(account)) can.push('review stories')
    if (isPublisher(account)) can.push('publish & distribute stories')
    if (admin) can.push('verify racing-role claims', 'manage the team')
    else gated.push('verifying claims & managing the team → administrator only')
  }

  const orgManage = account.orgMemberships.filter((m) => m.orgRole === 'org_owner' || m.orgRole === 'org_manager')
  if (orgManage.length) can.push(`manage their organisation(s) (${orgManage.length})`)

  return [
    'CAPABILITIES (use these to guide precisely — offer the EXACT next step, never a generic answer).',
    `Roles: ${account.roles.join(', ') || 'reader'}. Subscription: ${account.subscriptionTier}.`,
    `CAN now: ${can.join('; ')}.`,
    gated.length ? `GATED (always offer the unlock path): ${gated.join('; ')}.` : 'Nothing is gated for this reader right now.',
    'For exact stable counts or a full breakdown, call the whatCanIDo tool.',
  ].filter(Boolean).join('\n')
}
