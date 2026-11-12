// ---------------------------------------------------------------------------
// Stablehand Activity — READ side of the operator run log (`agentRuns`).
//
// runs.ts writes one document per (runId, userId) as each model step finishes;
// this file answers the three questions the Production System's "Stablehand
// Activity" screen asks of it: which runs happened, what one run did step by
// step, and what the operator cost per day. Routes live in
// routes/agentOperator/index.ts; the screen in
// apps/web/src/pages/production-system/screens/StablehandActivityScreen.tsx.
//
// Every read goes through the db wrapper's aggregate(), which does NOT add the
// soft-delete filter — so each pipeline opens with `deletedAt: null` itself.
// ---------------------------------------------------------------------------

import { db } from '../../db.js'
import { AGENT_RUNS, USERS } from '../../collections.js'
import { dailyBudgetUsd, spentTodayUsd, type UsageTotals } from './runs.js'
import { datesBetween, windowStart } from './activityParams.js'

export { clampInt, isoTimestamp, isRunId } from './activityParams.js'

const PROMPT_PREVIEW = 200

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

function totalsOf(raw: unknown): UsageTotals {
  const t = (raw ?? {}) as Record<string, unknown>
  return {
    inputTokens: num(t.inputTokens),
    outputTokens: num(t.outputTokens),
    cachedInputTokens: num(t.cachedInputTokens),
  }
}

/** userId → display name, in ONE query. Missing users read as "Former staff member". */
async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))]
  const out = new Map<string, string>()
  if (unique.length === 0) return out
  const users = await db.collection(USERS).findByIds(unique)
  for (const u of users) {
    const name = str(u.name).trim() || str(u.email).trim()
    if (name) out.set(String(u._id), name)
  }
  return out
}

// ── List ────────────────────────────────────────────────────────────────────

export interface RunSummary {
  runId: string
  userId: string
  userName: string
  startedAt: string
  updatedAt: string
  model: string
  models: string[]
  prompt: string
  lastPath: string
  stepCount: number
  totals: UsageTotals
  costUsd: number
}

export interface ListRunsQuery {
  /** Undefined = every user (the caller already proved the all-scope right). */
  userId?: string
  days: number
  limit: number
  /** Page cursor: only runs last updated strictly before this. */
  before?: string | null
}

/**
 * Newest-first runs touched in the window. Sorted on `updatedAt` — the last
 * step's time — because a run that is still going belongs at the top.
 *
 * Index: { userId, deletedAt, updatedAt: -1 } for Mine, { deletedAt, updatedAt: -1 }
 * for Everyone (lib/ensureIndexes.ts).
 */
export async function listRuns(q: ListRunsQuery): Promise<{ runs: RunSummary[]; nextBefore: string | null }> {
  const since = `${windowStart(q.days)}T00:00:00.000Z`
  const updatedAt: Record<string, string> = { $gte: since }
  if (q.before) updatedAt.$lt = q.before
  const match: Record<string, unknown> = { deletedAt: null, updatedAt }
  if (q.userId) match.userId = q.userId

  const rows = await db.collection(AGENT_RUNS).aggregate([
    { $match: match },
    { $sort: { updatedAt: -1 } },
    { $limit: q.limit },
    // The step log stays in the database: a list never needs it, and one run
    // may carry up to 300 of them.
    {
      $project: {
        _id: 0,
        runId: 1,
        userId: 1,
        startedAt: 1,
        updatedAt: 1,
        model: 1,
        models: 1,
        prompt: 1,
        lastPath: 1,
        stepCount: 1,
        totals: 1,
        costUsd: 1,
      },
    },
  ])

  const names = await namesFor(rows.map((r) => str(r.userId)))
  const runs = rows.map((r): RunSummary => {
    const userId = str(r.userId)
    return {
      runId: str(r.runId),
      userId,
      userName: names.get(userId) ?? 'Former staff member',
      startedAt: str(r.startedAt),
      updatedAt: str(r.updatedAt),
      model: str(r.model),
      models: Array.isArray(r.models) ? r.models.filter((m: unknown): m is string => typeof m === 'string') : [],
      prompt: clip(str(r.prompt), PROMPT_PREVIEW),
      lastPath: str(r.lastPath),
      stepCount: num(r.stepCount),
      totals: totalsOf(r.totals),
      costUsd: num(r.costUsd),
    }
  })
  const last = runs[runs.length - 1]
  return { runs, nextBefore: runs.length === q.limit && last ? last.updatedAt : null }
}

// ── One run ─────────────────────────────────────────────────────────────────

export interface RunStep extends UsageTotals {
  at: string
  model: string
  finishReason: string
  tools: { name: string; input: string }[]
}

export interface RunDetail extends RunSummary {
  steps: RunStep[]
}


/**
 * One run with its full step log. A runId is unique per USER, not globally, so
 * `userId` narrows it; without one the newest matching run wins.
 */
export async function getRun(runId: string, userId?: string): Promise<RunDetail | null> {
  const match: Record<string, unknown> = { deletedAt: null, runId }
  if (userId) match.userId = userId
  const [r] = await db.collection(AGENT_RUNS).aggregate([
    { $match: match },
    { $sort: { updatedAt: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, costByDay: 0 } },
  ])
  if (!r) return null
  const names = await namesFor([str(r.userId)])
  const steps: RunStep[] = (Array.isArray(r.steps) ? r.steps : []).map((s: Record<string, unknown>) => ({
    at: str(s.at),
    model: str(s.model),
    finishReason: str(s.finishReason),
    tools: (Array.isArray(s.tools) ? s.tools : []).map((t: Record<string, unknown>) => ({
      name: str(t?.name),
      input: str(t?.input),
    })),
    ...totalsOf(s),
  }))
  return {
    runId: str(r.runId),
    userId: str(r.userId),
    userName: names.get(str(r.userId)) ?? 'Former staff member',
    startedAt: str(r.startedAt),
    updatedAt: str(r.updatedAt),
    model: str(r.model),
    models: Array.isArray(r.models) ? r.models.filter((m: unknown): m is string => typeof m === 'string') : [],
    // The full stored prompt (runs.ts caps it at 300) — this is the detail view.
    prompt: str(r.prompt),
    lastPath: str(r.lastPath),
    stepCount: num(r.stepCount),
    totals: totalsOf(r.totals),
    costUsd: num(r.costUsd),
    steps,
  }
}

// ── Usage per day ───────────────────────────────────────────────────────────

export interface UsageDay extends UsageTotals {
  date: string
  costUsd: number
  runs: number
}

export interface UsageReport {
  from: string
  to: string
  days: UsageDay[]
  totals: UsageTotals & { costUsd: number; runs: number }
  /** The CALLER's own budget, whatever the scope — the cap is per user. */
  /** budgetUsd is null when no daily cap is configured (the default). */
  today: { date: string; spentUsd: number; budgetUsd: number | null }
}

/**
 * Per-UTC-day cost, runs and tokens for the window.
 *
 * Cost and run counts come from `costByDay` (a run that spanned midnight counts
 * on both days — it did spend on both). Tokens come from the step log, since
 * costByDay holds only dollars; runs.ts keeps the last 300 steps of a run, so a
 * runaway past that under-counts its earliest tokens — never its cost.
 *
 * Only runs updated inside the window can hold a day inside it, so the match
 * on `updatedAt` is exact, not an approximation, and it uses the list index.
 */
export async function usageReport(opts: { userId?: string; days: number; caller: string }): Promise<UsageReport> {
  const from = windowStart(opts.days)
  const to = new Date().toISOString().slice(0, 10)
  const match: Record<string, unknown> = { deletedAt: null, updatedAt: { $gte: `${from}T00:00:00.000Z` } }
  if (opts.userId) match.userId = opts.userId

  const [facets, spentUsd] = await Promise.all([
    db.collection(AGENT_RUNS).aggregate([
      { $match: match },
      {
        $facet: {
          cost: [
            { $project: { day: { $objectToArray: { $ifNull: ['$costByDay', {}] } } } },
            { $unwind: '$day' },
            { $match: { 'day.k': { $gte: from } } },
            { $group: { _id: '$day.k', costUsd: { $sum: '$day.v' }, runs: { $sum: 1 } } },
          ],
          // Distinct runs: summing the per-day counts would count a run that
          // crossed midnight twice.
          runCount: [{ $count: 'n' }],
          tokens: [
            { $project: { steps: { at: 1, inputTokens: 1, outputTokens: 1, cachedInputTokens: 1 } } },
            { $unwind: '$steps' },
            { $match: { 'steps.at': { $gte: `${from}T00:00:00.000Z` } } },
            {
              $group: {
                _id: { $substrBytes: ['$steps.at', 0, 10] },
                inputTokens: { $sum: '$steps.inputTokens' },
                outputTokens: { $sum: '$steps.outputTokens' },
                cachedInputTokens: { $sum: '$steps.cachedInputTokens' },
              },
            },
          ],
        },
      },
    ]),
    spentTodayUsd(opts.caller),
  ])

  const f = (facets[0] ?? {}) as {
    cost?: Record<string, unknown>[]
    tokens?: Record<string, unknown>[]
    runCount?: Record<string, unknown>[]
  }
  const cost = new Map((f.cost ?? []).map((r) => [str(r._id), r]))
  const tokens = new Map((f.tokens ?? []).map((r) => [str(r._id), r]))

  const days = datesBetween(from, to).map((date): UsageDay => {
    const c = cost.get(date)
    return { date, costUsd: num(c?.costUsd), runs: num(c?.runs), ...totalsOf(tokens.get(date)) }
  })
  const totals = days.reduce(
    (a, d) => ({
      costUsd: a.costUsd + d.costUsd,
      runs: a.runs + d.runs,
      inputTokens: a.inputTokens + d.inputTokens,
      outputTokens: a.outputTokens + d.outputTokens,
      cachedInputTokens: a.cachedInputTokens + d.cachedInputTokens,
    }),
    { costUsd: 0, runs: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  )

  totals.runs = num(f.runCount?.[0]?.n)

  return { from, to, days, totals, today: { date: to, spentUsd, budgetUsd: dailyBudgetUsd() } }
}
