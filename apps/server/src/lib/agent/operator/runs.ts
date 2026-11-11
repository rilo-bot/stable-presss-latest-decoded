// ---------------------------------------------------------------------------
// Operator run log + metering (collection `agentRuns`).
//
// WHY per STEP rather than once at the end: an operator run is several HTTP
// requests (every client-tool result comes back as a new POST), and any one of
// them can end in Stop, a closed tab or a stream error — where onFinish never
// fires. Recording each finished step means the spend we already incurred is
// always counted, which is what the daily budget is for.
//
// One document per (runId, userId), upserted. The driver collection is used
// directly because the db wrapper has no upsert and a run accumulates from
// several requests: `$inc` / `$push` keep that atomic without a read-modify-
// write. The soft-delete convention is kept (filter + insert on deletedAt: null).
//
// costUsd is an ESTIMATE from list prices (cache writes billed as plain input);
// it exists to cap runaway spend, not to reconcile an invoice.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto'
import type { LanguageModelUsage, StepResult, ToolSet } from 'ai'
import { db, rawCollection } from '../../db.js'
import { AGENT_RUNS } from '../../collections.js'

/** USD per million tokens. Keyed by family: the slug is env-overridable. */
const PRICES = {
  sonnet: { input: 2, output: 10, cached: 0.1 }, // Claude Sonnet 5.5
  opus: { input: 4, output: 20, cached: 0.2 }, // Claude Opus 5.5
} as const

function priceFor(model: string) {
  return /opus/i.test(model) ? PRICES.opus : PRICES.sonnet
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export function usageTotals(usage: LanguageModelUsage | undefined): UsageTotals {
  const input = usage?.inputTokens ?? 0
  const cached = usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens ?? 0
  return { inputTokens: input, outputTokens: usage?.outputTokens ?? 0, cachedInputTokens: Math.min(cached, input) }
}

export function estimateCostUsd(model: string, t: UsageTotals): number {
  const p = priceFor(model)
  const fresh = Math.max(0, t.inputTokens - t.cachedInputTokens)
  return (fresh * p.input + t.cachedInputTokens * p.cached + t.outputTokens * p.output) / 1_000_000
}

/** Per-user spend cap per UTC day, in USD. */
export function dailyBudgetUsd(): number {
  const n = Number(process.env.OPERATOR_DAILY_BUDGET_USD)
  return Number.isFinite(n) && n > 0 ? n : 5
}

const today = () => new Date().toISOString().slice(0, 10)

const RUN_ID = /^[A-Za-z0-9_-]{6,100}$/
/** The client's runId when it is well-formed, else a fresh one for this request. */
export function normaliseRunId(raw: unknown): string {
  return typeof raw === 'string' && RUN_ID.test(raw) ? raw : `srv-${randomUUID()}`
}

/** What this user has spent on the operator today (UTC). Fails OPEN to 0. */
export async function spentTodayUsd(userId: string): Promise<number> {
  const field = `costByDay.${today()}`
  try {
    const rows = await db.collection(AGENT_RUNS).aggregate([
      { $match: { userId, deletedAt: null, [field]: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ])
    return Number(rows[0]?.total) || 0
  } catch (err) {
    // A logging-store outage must not take the operator down with it.
    console.warn('[agent-operator] could not read today\'s spend:', err)
    return 0
  }
}

const clip = (v: unknown, max: number): string => {
  let s: string
  try {
    s = typeof v === 'string' ? v : JSON.stringify(v ?? {})
  } catch {
    s = String(v)
  }
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export interface RunMeta {
  runId: string
  userId: string
  model: string
  /** First user text of the request, for reading the log later. */
  prompt?: string
  path?: string
}

/** Record one finished model step. Never throws. */
export async function recordStep(meta: RunMeta, step: StepResult<ToolSet>): Promise<void> {
  try {
    const totals = usageTotals(step.usage)
    const cost = estimateCostUsd(meta.model, totals)
    const now = new Date().toISOString()
    // Typed loosely, as lib/db.ts types its own $pull update: the driver's
    // UpdateFilter<Document> rejects $push/$each on an untyped document.
    const update: Record<string, unknown> = {
      $setOnInsert: { startedAt: now, prompt: clip(meta.prompt ?? '', 300) },
      $set: { model: meta.model, updatedAt: now, ...(meta.path ? { lastPath: clip(meta.path, 300) } : {}) },
      $addToSet: { models: meta.model },
      $push: {
        steps: {
          $each: [
            {
              at: now,
              model: meta.model,
              finishReason: step.finishReason,
              tools: step.toolCalls.map((c) => ({ name: c.toolName, input: clip(c.input, 300) })),
              ...totals,
            },
          ],
          // A runaway loop must not grow one document without bound.
          $slice: -300,
        },
      },
      $inc: {
        stepCount: 1,
        'totals.inputTokens': totals.inputTokens,
        'totals.outputTokens': totals.outputTokens,
        'totals.cachedInputTokens': totals.cachedInputTokens,
        costUsd: cost,
        [`costByDay.${today()}`]: cost,
      },
    }
    const col = await rawCollection(AGENT_RUNS)
    await col.updateOne({ runId: meta.runId, userId: meta.userId, deletedAt: null }, update, { upsert: true })
  } catch (err) {
    console.warn('[agent-operator] could not record a step:', err)
  }
}
