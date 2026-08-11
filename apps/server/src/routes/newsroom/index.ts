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
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'
import { isAdmin, isPlatformAdmin } from '../../lib/rbac.js'
import { accountCan, scopeFor } from '../../lib/effectiveAccess.js'
import { getCapabilities } from '../../lib/agent/capabilities.js'
import { getAgentModel, isAgentConfigured } from '../../lib/agent/provider.js'
import type { AccountUser } from '../../lib/identity.js'

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
const canReview = (a: AccountUser) => accountCan(a, 'stories.edit')
const canPublish = (a: AccountUser) => accountCan(a, 'stories.publish')

export interface NeedItem {
  id: string
  label: string
  count: number
  /**
   * The module id that holds this work. MUST be a live entry in the client's
   * SIDE_NAV, because the dashboard turns it into a link. A token that matches
   * no module is DROPPED, so a stale one costs an item, never a dead link.
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

/**
 * The role-scoped dashboard summary — and the ONE resolver the AI brief reads.
 *
 * EVERY NUMBER HERE IS A COUNT OF WHAT THIS READER CAN SEE. That is not a nicety:
 * the summary is fed to the model that writes the Overview brief, and a count
 * assembled from everything and trimmed afterwards leaks in the wording — "3
 * stories are awaiting approval" tells you they exist even when you may open
 * none of them. So the filtering happens HERE, before anything is counted, and
 * the page and the brief both read the result.
 *
 * Two axes do the filtering:
 *   `<screen>.view`  may they open the screen at all — no view, no numbers
 *   scope            'own' narrows the story set to their own byline
 */
async function buildNewsroomSummary(account: AccountUser) {
  const seesStories = accountCan(account, 'stories.view')
  const seesHorses = accountCan(account, 'horses.view')
  const seesPeople = accountCan(account, 'people.view')
  const seesRacing = accountCan(account, 'racing-records.view')
  const seesMagazines = accountCan(account, 'magazine.view')

  const [allArticles, horses, parties, races, issues] = await Promise.all([
    seesStories ? db.collection('articles').find() : [],
    seesHorses ? db.collection('horses').find() : [],
    seesPeople ? db.collection('parties').find() : [],
    seesRacing ? db.collection('races').find() : [],
    seesMagazines ? db.collection('issues').find() : [],
  ])

  // Scope 'own' means the pipeline totals are THEIR pipeline. A contributor
  // should not learn the size of the desk's queue from a dashboard.
  const articles =
    scopeFor(account, 'stories') === 'all'
      ? allArticles
      : allArticles.filter((a) => a.author === account.name || a.createdByUserId === account.id)

  const byStatus: Record<string, number> = {}
  for (const a of articles) byStatus[String(a.status)] = (byStatus[String(a.status)] ?? 0) + 1
  const countStatus = (...statuses: string[]) => statuses.reduce((n, s) => n + (byStatus[s] ?? 0), 0)

  const mine = articles.filter((a) => a.author && a.author === account.name)
  const countMine = (...statuses: string[]) =>
    mine.filter((a) => statuses.includes(String(a.status))).length

  const unverifiedHorses = horses.filter((h) => h.verificationStatus === 'unverified').length
  // Parties have no verification axis — a register row is either claimed or not.
  // The unclaimed count is the useful one: those are people an admin registered
  // who have not yet signed up and taken their identity.
  const unclaimedParties = parties.filter((p) => p.taken !== true).length
  const issuesInProgress = issues.filter((d) => !d.publishedAt || d.unpublishedAt).length

  const now = Date.now()
  const upcomingRaces = races.filter((r) => {
    if (r.scheduledAt && Date.parse(String(r.scheduledAt)) > now) return true
    return ['upcoming', 'open', 'scheduled'].includes(String(r.status))
  }).length

  // There is no claim QUEUE any more. A `parties` row is either claimed or not,
  // and claiming it is immediate — no evidence, no verifier, no pending state —
  // so there is nothing for an admin to action. The count and its
  // "Racing-role claims to verify" attention item are gone rather than left
  // reading a `status` field nothing writes, which made them permanently zero.

  // ── "Needs your attention" — only what THIS role acts on, only when non-zero ──
  const needs: NeedItem[] = []
  if (canReview(account)) {
    const c = countStatus('submitted')
    // `where: 'editor-hub'` until that screen was removed. The Submitted column
    // of the board is the same queue, and `resolveWhere` drops any token whose
    // screen the caller cannot open — so a stale id here is a silent dead link.
    if (c) needs.push({ id: 'review-stories', label: 'Stories awaiting your review', count: c, where: 'workflow' })
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
  // These three are already zero for a reader without the matching `.view` —
  // the collection was never fetched — so the guard is the fetch above, not a
  // second condition here that could drift from it.
  if (unverifiedHorses) needs.push({ id: 'verify-horses', label: 'Unverified horses to review', count: unverifiedHorses, where: 'horses' })
  if (unclaimedParties) needs.push({ id: 'unclaimed-parties', label: 'Register entries nobody has claimed', count: unclaimedParties, where: 'people' })
  if (issuesInProgress) needs.push({ id: 'finish-bulletins', label: 'Bulletins in progress', count: issuesInProgress, where: 'magazine' })

  return {
    generatedFor: {
      name: account.name || account.email,
      // The AI brief describes the reader's editorial job, so it wants their
      // and would have made every brief say "roles: reader".
      roles: account.role ? [account.role.label] : [],
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
      unclaimedParties,
      articlesLive: countStatus(...LIVE_STATUSES),
      upcomingRaces,
      issues: issues.length,
      issuesInProgress,
    },
  }
}

router.get('/summary', async (req, res) => {
  const account = req.account!
  if (!isAdmin(account)) {
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
  if (!isAdmin(account)) {
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
        'today and the single best next action, using the real numbers provided. Refer to pages by the names they ' +
        'actually carry: All Stories, Workflow Board, Pipeline Map, Editor Hub, Blogs, Instant Capture, Magazine Builder, ' +
        'Podcast, Horses, People, Media Records, Racing Records, Comments. If nothing needs attention, say so cheerfully. ' +
        'Plain prose only — no markdown, no lists, no headings.\n\n' +
        // The summary has ALREADY been filtered to what this reader may open, so
        // the rule the model needs is simply: nothing beyond it. Mentioning a
        // queue that is absent would tell them it exists, which is the leak the
        // scoping exists to prevent.
        'THE SUMMARY IS THE WHOLE WORLD. It contains only what this colleague is allowed to see. Never invent a number, ' +
        'never mention a screen or a queue that does not appear in it, and never imply there is more you are not showing. ' +
        'If a section is missing or empty, that part of the newsroom is simply not theirs.',
      prompt: `Here is today's live summary for ${summary.generatedFor.name} (roles: ${summary.generatedFor.roles.join(', ')}):\n${JSON.stringify(summary)}\n\nWrite the brief.`,
    })
    res.json({ brief: text.trim() })
  } catch (err) {
    console.error('[newsroom] brief error:', err)
    res.json({ brief: null }) // dashboard falls back to the structured cards
  }
})

export default router
