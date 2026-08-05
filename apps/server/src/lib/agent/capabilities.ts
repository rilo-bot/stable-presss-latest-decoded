// ---------------------------------------------------------------------------
// Capability resolver — the SINGLE source of truth for "what can this account
// do right now", derived straight from the RBAC layer (rbac.ts + scope.ts).
//
// ONE RULE TABLE, TWO RENDERINGS.
//
//   CAPABILITY_RULES        the rules, written once
//   getCapabilities()       renders them as structured Capability[] for the
//                           `whatCanIDo` tool and the dashboard quick actions
//   summariseCapabilities() renders the SAME rules as prose for the agent system
//                           prompts — cheap and synchronous, no DB
//
// It used to be two hand-written copies of the same logic, and they had already
// drifted: the prose knew about the blog permissions and the structured list did
// not mention blogs at all. A rule added below now shows up in both.
//
// This file NEVER grants anything — it only DESCRIBES the gates the REST routes
// already enforce. So it can drift no further than the gates themselves.
// ---------------------------------------------------------------------------

import { db } from '../db.js'
import { MAGAZINE_V2_ENABLED } from '../magazineV2/config.js'
import { isAdmin, isPlatformAdmin } from '../rbac.js'
import { accountCan } from '../effectiveAccess.js'
import { manageablePartyIds, visibleHorseIds } from '../scope.js'
import type { AccountUser } from '../identity.js'

type CapabilityCategory = 'account' | 'racing' | 'editorial' | 'organisation'

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
  identity: { name?: string; isAdmin: boolean; isPlatformAdmin: boolean }
  /** Concrete counts that make guidance specific. */
  stable: { manageableHorses: number; manageableParties: number }
  organisations: Array<{ orgId: string; role: string }>
  capabilities: Capability[]
}

// The staff magazine surface: the free-form Magazine Builder (v2) when the
// MAGAZINE_V2 flag is on, else the legacy template Magazine Studio.
const MAGAZINE_SURFACE = MAGAZINE_V2_ENABLED ? 'Magazine Builder' : 'Magazine Studio'

/**
 * Everything a rule is allowed to look at.
 *
 * `horses` is `null` when the caller could not afford the query — that is the
 * prompt path, which is synchronous by design. A rule that needs the number must
 * cope with not having it rather than triggering a read.
 */
interface Ctx {
  account: AccountUser
  admin: boolean
  platformAdmin: boolean
  parties: number
  horses: number | null
}

interface Rule {
  id: string
  label: string
  category: CapabilityCategory
  where?: string
  /** Omit the rule entirely — e.g. editorial rows for a non-admin. */
  when?: (c: Ctx) => boolean
  allowed: (c: Ctx) => boolean
  /** Extra context when allowed, or the unlock path when blocked. */
  reason?: (c: Ctx) => string | undefined
  /** Shown to signed-out visitors. A rule without one is hidden from guests. */
  guestReason?: string
}

// Capability-based, not role-based: these used to test for hardcoded slugs
// ('publisher', 'editor', 'legal_reviewer', 'administrator'), which no longer
// exist as a fixed set. They follow whatever a superadmin configures.
const CAPABILITY_RULES: Rule[] = [
  // ── Anyone ────────────────────────────────────────────────────────────────
  {
    id: 'browse',
    label: 'Browse public horses, parties, news, bulletins & the podcast',
    category: 'account',
    allowed: () => true,
  },

  // ── Racing / self-service ─────────────────────────────────────────────────
  {
    id: 'follow-horse',
    label: 'Follow a horse',
    category: 'racing',
    where: 'Horses',
    allowed: () => true,
    guestReason: 'Create a free account to follow horses.',
  },
  {
    id: 'place-tip',
    label: 'Place a tip',
    category: 'racing',
    where: 'Tipping Ring',
    allowed: () => true,
    guestReason: 'Tipping needs a free account.',
  },
  {
    id: 'register-horse',
    label: 'Register a horse',
    category: 'racing',
    where: 'Dashboard → My Stable',
    allowed: () => true,
    reason: () => 'It joins your stable and stays hidden from the public until staff verify it.',
    guestReason: 'Create a free account to register a horse.',
  },
  {
    id: 'claim-role',
    label: 'Claim a racing identity',
    category: 'racing',
    where: 'Dashboard → Racing Roles',
    allowed: () => true,
    // No verification step: claiming a register entry takes effect immediately,
    // so this must not promise an approval that never comes.
    reason: () =>
      'Find yourself in the register — owner, trainer, jockey, breeder, agent, syndicate manager or personnel — and claim it. It is yours straight away.',
    guestReason: 'Create a free account, then claim your identity from the Dashboard.',
  },
  {
    id: 'manage-stable',
    label: 'Manage your stable',
    category: 'racing',
    where: 'Dashboard → My Stable',
    allowed: (c) => c.horses === null || c.horses > 0,
    reason: (c) =>
      c.horses === null
        ? undefined
        : c.horses > 0
          ? `You manage ${c.horses} horse(s).`
          : 'Claim a racing identity or register a horse first — then your stable unlocks.',
  },
  {
    id: 'edit-own-party',
    label: 'Edit your own party profile',
    category: 'racing',
    where: 'Profile Studio',
    allowed: (c) => c.parties > 0,
    reason: (c) =>
      c.parties > 0
        ? `You hold ${c.parties} party profile(s).`
        : 'Claiming a racing identity is what makes a profile yours to edit.',
  },

  // ── Editorial (admins only) ───────────────────────────────────────────────
  {
    id: 'create-draft',
    label: 'Create a story draft',
    category: 'editorial',
    where: 'Production System → Workflow Board → File a Story (manual, or the AI Story Studio)',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'content.draft.create'),
    reason: (c) =>
      accountCan(c.account, 'content.draft.create')
        ? undefined
        : 'Your role does not include drafting — an administrator can grant it.',
  },
  {
    id: 'edit-any-story',
    label: 'Edit any story',
    category: 'editorial',
    where: 'Production System → All Stories',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'content.draft.edit_any'),
    reason: (c) =>
      accountCan(c.account, 'content.draft.edit_any') ? undefined : 'Reserved for editors and publishers.',
  },
  {
    id: 'review-story',
    label: 'Review stories',
    category: 'editorial',
    where: 'Production System → Editor Hub',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'content.editorial_review'),
    reason: (c) =>
      accountCan(c.account, 'content.editorial_review') ? undefined : 'Reserved for editors and administrators.',
  },
  {
    id: 'publish-story',
    label: 'Publish & distribute stories',
    category: 'editorial',
    where: 'Production System → Workflow Board',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'content.publish'),
    reason: (c) =>
      accountCan(c.account, 'content.publish') ? undefined : 'Publishing is reserved for publishers and administrators.',
  },
  // Blogs are a SEPARATE permission axis from stories (blog.* vs content.*).
  // They were missing from the structured list entirely, so the dashboard never
  // showed the Blogs module while the prompt happily described it.
  {
    id: 'write-blog',
    label: 'Write blog posts',
    category: 'editorial',
    where: 'Production System → Blogs',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'blog.create'),
    reason: (c) => (accountCan(c.account, 'blog.create') ? undefined : 'Your role does not include the Blogs module.'),
  },
  {
    id: 'edit-any-blog',
    label: 'Edit any blog post',
    category: 'editorial',
    where: 'Production System → Blogs',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'blog.edit_any'),
    reason: (c) => (accountCan(c.account, 'blog.edit_any') ? undefined : 'You can edit your own posts only.'),
  },
  {
    id: 'publish-blog',
    label: 'Publish blog posts',
    category: 'editorial',
    where: 'Production System → Blogs',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'blog.publish'),
    reason: (c) =>
      accountCan(c.account, 'blog.publish') ? undefined : 'An editor with blog publishing rights takes it live.',
  },
  {
    id: 'manage-bulletins',
    label: 'Build & publish bulletins',
    category: 'editorial',
    where: `Production System → ${MAGAZINE_SURFACE}`,
    when: (c) => c.admin,
    allowed: () => true,
  },
  {
    id: 'manage-racing-data',
    label: 'Edit racing data (horses, parties, media, entries)',
    category: 'editorial',
    where: 'Production System → Horses / People / Media Records / Racing Records',
    when: (c) => c.admin,
    allowed: () => true,
  },
  {
    id: 'manage-team',
    label: 'Manage the team',
    category: 'editorial',
    where: 'Production System → Team Members',
    when: (c) => c.admin,
    allowed: (c) => accountCan(c.account, 'team.manage'),
    reason: (c) => (accountCan(c.account, 'team.manage') ? undefined : 'Reserved for administrators.'),
  },

  // ── Organisation ──────────────────────────────────────────────────────────
  {
    id: 'manage-org',
    label: 'Manage your organisation',
    category: 'organisation',
    where: 'My Organisation',
    when: (c) => c.account.orgMembers.length > 0,
    allowed: (c) => c.account.orgMembers.some((m) => m.role === 'owner' || m.role === 'manager'),
    reason: (c) =>
      c.account.orgMembers.some((m) => m.role === 'owner' || m.role === 'manager')
        ? 'Invite members and register the parties the organisation holds.'
        : 'You are a member — owners and managers run the organisation.',
  },
]

/** Build the context every rule reads. `horses: null` = "not looked up". */
function contextFor(account: AccountUser, horses: number | null): Ctx {
  return {
    account,
    admin: isAdmin(account),
    platformAdmin: isPlatformAdmin(account),
    parties: manageablePartyIds(account).length,
    horses,
  }
}

/** Apply the rule table to one account. */
function evaluate(ctx: Ctx): Capability[] {
  return CAPABILITY_RULES.filter((r) => !r.when || r.when(ctx)).map((r) => {
    const allowed = r.allowed(ctx)
    return {
      id: r.id,
      label: r.label,
      category: r.category,
      allowed,
      reason: r.reason?.(ctx),
      where: r.where,
    }
  })
}

/** The same table, as seen by a signed-out visitor. */
function guestCapabilities(): Capability[] {
  return CAPABILITY_RULES.filter((r) => r.id === 'browse' || r.guestReason).map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category,
    allowed: r.id === 'browse',
    reason: r.guestReason,
    where: r.guestReason ? 'Sign up' : undefined,
  }))
}

/** DB-backed, structured capability report (for the whatCanIDo tool + dashboard). */
export async function getCapabilities(account?: AccountUser): Promise<CapabilityReport> {
  if (!account) {
    return {
      signedIn: false,
      identity: { isAdmin: false, isPlatformAdmin: false },
      stable: { manageableHorses: 0, manageableParties: 0 },
      organisations: [],
      capabilities: guestCapabilities(),
    }
  }

  // An admin's number is the whole register; everyone else's comes from their own
  // claimed party rows and their orgs. Only the ADMIN branch needs the collection,
  // so the non-admin path no longer loads every horse to count a handful.
  const horses = isAdmin(account)
    ? await db.collection('horses').count()
    : (await visibleHorseIds(account)).length
  const ctx = contextFor(account, horses)

  return {
    signedIn: true,
    identity: {
      name: account.name || account.email,
      isAdmin: ctx.admin,
      isPlatformAdmin: ctx.platformAdmin,
    },
    stable: { manageableHorses: horses, manageableParties: ctx.parties },
    organisations: account.orgMembers.map((m) => ({ orgId: m.orgId, role: m.role })),
    capabilities: evaluate(ctx),
  }
}

/**
 * The SAME rules as prose, for the agent system prompts.
 *
 * Synchronous and DB-free so prompt building stays fast — which is why the
 * stable count is absent here (`horses: null`) and the model is told to call
 * `whatCanIDo` when it needs the number.
 */
export function summariseCapabilities(account?: AccountUser): string {
  const caps = account ? evaluate(contextFor(account, null)) : guestCapabilities()
  const can: string[] = []
  const gated: string[] = []
  for (const c of caps) {
    if (c.id === 'browse') continue
    if (c.allowed) can.push(c.reason ? `${c.label} — ${c.reason}` : c.label)
    else gated.push(c.reason ? `${c.label} → ${c.reason}` : c.label)
  }

  if (!account) {
    return [
      'CAPABILITIES — this reader is a GUEST.',
      'CAN now: browse all public horses, parties, news, bulletins, the podcast and the tipping leaderboard.',
      `NEEDS a free account: ${gated.join('; ')}.`,
      'When something they want needs an account, warmly point them to Sign up / Log in — never as a scold.',
    ].join('\n')
  }

  const identities = account.parties.map((p) => p.role)
  return [
    'CAPABILITIES (use these to guide precisely — offer the EXACT next step, never a generic answer).',
    `Account: ${isAdmin(account) ? 'ADMIN' : 'user'}${identities.length ? `, racing identities: ${[...new Set(identities)].join(', ')}` : ', no racing identity claimed'}.`,
    `CAN now: ${can.join('; ')}.`,
    gated.length ? `GATED (always offer the unlock path): ${gated.join('; ')}.` : 'Nothing is gated for this reader right now.',
    'For exact stable counts or a full breakdown, call the whatCanIDo tool.',
  ].join('\n')
}
