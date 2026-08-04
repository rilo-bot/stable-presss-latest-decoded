// ---------------------------------------------------------------------------
// Production System dashboard — staff-only, role-scoped.
//   GET  /api/newsroom/summary — live aggregates + the caller's capabilities
//                                (one fetch powers the whole dashboard).
//   POST /api/newsroom/brief   — a short AI "Studio brief" narrating the summary.
//
// Everything is computed live from real collections and scoped to what the
// caller's editorial role actually acts on — no stored dashboard doc, nothing to
// manage. The capability list reuses lib/agent/capabilities.ts so the dashboard's
// quick actions and the AI assistant share one source of truth.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { generateText } from 'ai'
import { db } from '../lib/db.js'
import { attachAccount } from '../lib/auth.js'
import { canAccessNewsroom, isPlatformAdmin } from '../lib/rbac.js'
import { accountCan } from '../lib/effectiveAccess.js'
import { getCapabilities } from '../lib/agent/capabilities.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'
import { PARTY_MEMBERSHIPS } from '../lib/membership.js'
import type { AccountUser } from '../lib/identity.js'

const router = Router()
router.use(attachAccount)

/**
 * "Live" is one status now. It used to be three, because newsletter/bulletin
 * were statuses rather than distribution channels.
 */
const LIVE_STATUSES = ['published']

// "Needs your attention" is driven by what the caller can ACT on. These used to
// hardcode role slugs, which meant a superadmin-created role could never surface
// a queue no matter what it was granted.
const canReview = (a: AccountUser) => accountCan(a, 'content.editorial_review')
const canPublish = (a: AccountUser) => accountCan(a, 'content.publish')

export interface NeedItem {
  id: string
  label: string
  count: number
  /**
   * The module id that holds this work. MUST be a live entry in the client's
   * SIDE_NAV (or the 'claims' route), because the dashboard turns it into a link.
   *
   * Three of these pointed at screens that had been deleted — 'review' and
   * 'drafts' (SIDE_NAV rows removed when the 12-status workflow collapsed to 5
   * stages) and 'bulletin-templates' (the v1 Magazine Studio) — so four of the
   * seven items were links that dumped the user back on the Overview. The client
   * now aliases the old tokens defensively as well, in
   * pages/production-system/overview/navTargets.ts.
   */
  where: string
}

/** The role-scoped dashboard summary. Pure aggregation over live collections. */
async function buildNewsroomSummary(account: AccountUser) {
  const [articles, horses, parties, races, issues] = await Promise.all([
    db.collection('articles').find(),
    db.collection('horses').find(),
    db.collection('parties').find(),
    db.collection('races').find(),
    db.collection('issues').find(),
  ])

  const byStatus: Record<string, number> = {}
  for (const a of articles) byStatus[String(a.status)] = (byStatus[String(a.status)] ?? 0) + 1
  const countStatus = (...statuses: string[]) => statuses.reduce((n, s) => n + (byStatus[s] ?? 0), 0)

  const mine = articles.filter((a) => a.author && a.author === account.displayName)
  const countMine = (...statuses: string[]) =>
    mine.filter((a) => statuses.includes(String(a.status))).length

  const unverifiedHorses = horses.filter((h) => h.verificationStatus === 'unverified').length
  const unverifiedParties = parties.filter((p) => p.verificationStatus === 'unverified').length
  const issuesInProgress = issues.filter((d) => !d.publishedAt || d.unpublishedAt).length

  const now = Date.now()
  const upcomingRaces = races.filter((r) => {
    if (r.scheduledAt && Date.parse(String(r.scheduledAt)) > now) return true
    return ['upcoming', 'open', 'scheduled'].includes(String(r.status))
  }).length

  // Pending racing-role claims this account may verify (admins see all; org
  // verification is layered separately — non-admins get 0 here for now).
  // P2: one indexed count. Was a full users scan on EVERY dashboard load.
  let pendingClaims = 0
  if (isPlatformAdmin(account)) {
    pendingClaims = await db.collection(PARTY_MEMBERSHIPS).count({ status: 'pending' })
  }

  // ── "Needs your attention" — only what THIS role acts on, only when non-zero ──
  const needs: NeedItem[] = []
  if (canReview(account)) {
    const c = countStatus('submitted')
    if (c) needs.push({ id: 'review-stories', label: 'Stories awaiting your review', count: c, where: 'editor-hub' })
  }
  // The separate legal / compliance queues are gone: approval is one step now,
  // so anyone who can review sees the same Submitted queue above.
  if (canPublish(account)) {
    const c = countStatus('approved', 'scheduled')
    if (c) needs.push({ id: 'publish-stories', label: 'Stories ready to publish or schedule', count: c, where: 'workflow' })
  }
  // A sent-back story is a Draft with `changesRequested` set, not its own status.
  const myChangesRequested = mine.filter(
    (a) => a.status === 'draft' && a.changesRequested,
  ).length
  if (myChangesRequested) {
    // Both of these land on the board's Draft column — a sent-back story and a
    // work-in-progress draft are the same status.
    needs.push({ id: 'my-revisions', label: 'Your stories need changes', count: myChangesRequested, where: 'workflow' })
  }
  const myDrafts = countMine('draft')
  if (myDrafts) needs.push({ id: 'my-drafts', label: 'Your drafts in progress', count: myDrafts, where: 'workflow' })
  if (pendingClaims) needs.push({ id: 'verify-claims', label: 'Racing-role claims to verify', count: pendingClaims, where: 'claims' })
  if (unverifiedHorses) needs.push({ id: 'verify-horses', label: 'Unverified horses to review', count: unverifiedHorses, where: 'horses' })
  if (unverifiedParties) needs.push({ id: 'verify-parties', label: 'Unverified parties to review', count: unverifiedParties, where: 'parties' })
  if (issuesInProgress) needs.push({ id: 'finish-bulletins', label: 'Bulletins in progress', count: issuesInProgress, where: 'magazine-v2' })

  return {
    generatedFor: {
      name: account.displayName || account.email,
      // The AI brief describes the reader's editorial job, so it wants their
      // ROLE LABELS — `roles` is now the static axis ('reader' + party roles)
      // and would have made every brief say "roles: reader".
      roles: account.roleDocs.map((r) => r.label),
      isPlatformAdmin: isPlatformAdmin(account),
    },
    stories: {
      total: articles.length,
      mine: mine.length,
      live: countStatus(...LIVE_STATUSES),
      byStatus,
    },
    needsAttention: needs,
    snapshot: {
      horses: horses.length,
      unverifiedHorses,
      parties: parties.length,
      unverifiedParties,
      articlesLive: countStatus(...LIVE_STATUSES),
      upcomingRaces,
      issues: issues.length,
      issuesInProgress,
    },
  }
}

router.get('/summary', async (req, res) => {
  const account = req.account!
  if (!canAccessNewsroom(account)) {
    res.status(403).json({ error: 'Staff access required.' })
    return
  }
  const [summary, capabilities] = await Promise.all([
    buildNewsroomSummary(account),
    getCapabilities(account),
  ])
  res.json({ summary, capabilities: capabilities.capabilities })
})

router.post('/brief', async (req, res) => {
  const account = req.account!
  if (!canAccessNewsroom(account)) {
    res.status(403).json({ error: 'Staff access required.' })
    return
  }
  if (!isAgentConfigured()) {
    res.json({ brief: null })
    return
  }
  try {
    const summary = await buildNewsroomSummary(account)
    const { text } = await generateText({
      model: getAgentModel(),
      system:
        'You are the editor-in-chief of Stable Press writing a short daily Production System brief for a colleague. ' +
        'Open by greeting them by first name. In 2–4 warm, specific sentences, tell them what most needs their attention ' +
        'today and the single best next action, using the real numbers provided. Refer to pages by name (In Review, ' +
        'Workflow Board, Magazine Studio, Verify Claims, the Production Systems). If nothing needs attention, say so ' +
        'cheerfully. Plain prose only — no markdown, no lists, no headings. Never invent numbers beyond what is given.',
      prompt: `Here is today's live summary for ${summary.generatedFor.name} (roles: ${summary.generatedFor.roles.join(', ')}):\n${JSON.stringify(summary)}\n\nWrite the brief.`,
    })
    res.json({ brief: text.trim() })
  } catch (err) {
    console.error('[newsroom] brief error:', err)
    res.json({ brief: null }) // dashboard falls back to the structured cards
  }
})

export default router
