// ---------------------------------------------------------------------------
// AI usage metering — one record per model call, for every AI surface.
//
// Feeds the Campaign Engine "AI Activity" page (The Stable Hand, Magazine
// Builder, Story AI, …). Every model handed out by lib/agent/provider.ts is
// wrapped with `aiUsageMiddleware`, so a call is metered no matter which route,
// tool loop or worker job made it — nothing has to remember to log.
//
// WHO made the call travels in an AsyncLocalStorage context set at the edge
// (`withAiUsage({ surface, userId, … }, fn)` in a route or job). The context is
// read when the model call STARTS, so a stream that finishes after the request
// handler returned is still attributed correctly.
//
// Storage is pluggable (`setAiUsageSink`): the API and the worker install the
// Mongo sink at boot (aiUsageStore.ts). Without a sink — unit tests, scripts —
// records are dropped, so importing a model never needs a database.
//
// Recording is fire-and-forget and never throws into the model call.
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from 'node:async_hooks'
import type { LanguageModelMiddleware } from 'ai'

/** The AI surfaces listed on the AI Activity page. Keep in sync with the web list. */
export const AI_SURFACES = [
  'stable-hand',
  'magazine-builder',
  'story-ai',
  'article-ai',
  'blog-ai',
  'profile-ai',
  'concierge',
  'compose',
  'newsroom',
  'instant',
  'documents',
  'voice',
  'other',
] as const
export type AiSurface = (typeof AI_SURFACES)[number]

const SURFACE_SET = new Set<string>(AI_SURFACES)
/** True for one of the known surfaces (validates a query param or a client hint). */
export const isAiSurface = (v: unknown): v is AiSurface => typeof v === 'string' && SURFACE_SET.has(v)

export interface AiUsageContext {
  surface?: AiSurface
  /** Finer step inside a surface, e.g. 'planner', 'copy', 'layout', 'studio-chat'. */
  feature?: string
  userId?: string
  userName?: string
  /** What the work was about, e.g. { entityType: 'magazine', entityId: '…' }. */
  entityType?: string
  entityId?: string
  /** Groups calls into one session/run/job on the activity page. */
  sessionId?: string
}

export interface AiUsageRecord extends AiUsageContext {
  surface: AiSurface
  model: string
  kind: 'text' | 'image' | 'speech' | 'transcription'
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  /** USD. From OpenRouter's own usage accounting when present, else list prices. */
  costUsd: number
  costSource: 'provider' | 'estimate' | 'unknown'
  durationMs: number
  ok: boolean
  error?: string
  createdAt: string
  /** UTC day, YYYY-MM-DD — what the activity page groups by. */
  day: string
}

const als = new AsyncLocalStorage<AiUsageContext>()

/** Run `fn` with AI usage attribution. Nested calls inherit and override fields. */
export function withAiUsage<T>(ctx: AiUsageContext, fn: () => T): T {
  const parent = als.getStore() ?? {}
  return als.run({ ...parent, ...stripUndefined(ctx) }, fn)
}

/** The attribution in force right now (empty object outside any context). */
export function currentAiUsage(): AiUsageContext {
  return als.getStore() ?? {}
}

type Sink = (record: AiUsageRecord) => Promise<void> | void
let sink: Sink | null = null

/** Install where records go (the Mongo sink, at API/worker boot). */
export function setAiUsageSink(next: Sink | null): void {
  sink = next
}

/** Record one call. Never throws, never awaits the sink from the caller's view. */
export function recordAiUsage(
  entry: Omit<AiUsageRecord, 'createdAt' | 'day' | 'surface' | 'costUsd' | 'costSource'> & {
    surface?: AiSurface
    costUsd?: number
    /** What a supplied costUsd is: the provider's bill (default) or the caller's own
     *  estimate (e.g. voice, priced per minute / character in voiceUsage.ts). */
    costSource?: 'provider' | 'estimate'
  },
): void {
  if (!sink) return
  const now = new Date()
  const ctx = currentAiUsage()
  const surface = entry.surface ?? ctx.surface ?? 'other'
  const provided = typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd) ? entry.costUsd : undefined
  const estimate = provided === undefined ? estimateCostUsd(entry.model, entry) : undefined
  const record: AiUsageRecord = {
    ...ctx,
    ...entry,
    surface,
    costUsd: provided ?? estimate ?? 0,
    costSource:
      provided !== undefined ? (entry.costSource ?? 'provider') : estimate !== undefined ? 'estimate' : 'unknown',
    createdAt: now.toISOString(),
    day: now.toISOString().slice(0, 10),
  }
  try {
    Promise.resolve(sink(record)).catch((err: unknown) => {
      console.warn('[ai-usage] record failed:', err instanceof Error ? err.message : err)
    })
  } catch (err) {
    console.warn('[ai-usage] record failed:', err instanceof Error ? err.message : err)
  }
}

// ── list prices (USD per million tokens) — fallback when the provider reports no cost ──

const PRICES: { match: RegExp; input: number; output: number; cached: number }[] = [
  { match: /claude-opus-5\.5/i, input: 4, output: 20, cached: 0.2 },
  { match: /claude-opus/i, input: 5, output: 25, cached: 0.5 },
  { match: /claude-sonnet-5/i, input: 2, output: 10, cached: 0.1 },
  { match: /claude-sonnet-4\.6/i, input: 3, output: 15, cached: 0.3 },
  { match: /claude-haiku-5/i, input: 0.1, output: 0.5, cached: 0.01 },
  { match: /gpt-5\.6-sol/i, input: 4.4, output: 22, cached: 0.44 },
  { match: /nano-banana-2\.1/i, input: 1.5, output: 7.5, cached: 0.15 },
  { match: /gemini-2\.5-flash-image/i, input: 0.3, output: 2.5, cached: 0.03 },
]

export function estimateCostUsd(
  model: string,
  t: { inputTokens: number; outputTokens: number; cachedInputTokens: number },
): number | undefined {
  const p = PRICES.find((row) => row.match.test(model))
  if (!p) return undefined
  const fresh = Math.max(0, t.inputTokens - t.cachedInputTokens)
  return (fresh * p.input + t.cachedInputTokens * p.cached + t.outputTokens * p.output) / 1_000_000
}

// ── the middleware every provider model is wrapped with ──

interface V4Usage {
  inputTokens?: { total?: number; cacheRead?: number }
  outputTokens?: { total?: number; reasoning?: number }
}

function tokensOf(usage: V4Usage | undefined) {
  return {
    inputTokens: usage?.inputTokens?.total ?? 0,
    outputTokens: usage?.outputTokens?.total ?? 0,
    cachedInputTokens: usage?.inputTokens?.cacheRead ?? 0,
    reasoningTokens: usage?.outputTokens?.reasoning ?? 0,
  }
}

/** OpenRouter puts its billed cost at providerMetadata.openrouter.usage.cost. */
function providerCost(meta: unknown): number | undefined {
  const cost = (meta as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter?.usage?.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined
}

const ANTHROPIC = /^anthropic\//i

/**
 * Meters every call and, for Claude models, drops sampling parameters the
 * current Claude models reject (temperature/topP/topK return a 400 on Opus 5.5
 * and Sonnet 5.5). Call sites keep their temperatures so an env override back
 * to a GPT/Gemini model still gets them.
 */
export function aiUsageMiddleware(defaults: { modelId: string; surface?: AiSurface; feature?: string }): LanguageModelMiddleware {
  const base = stripUndefined({ surface: defaults.surface, feature: defaults.feature })
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      if (!ANTHROPIC.test(defaults.modelId)) return params
      const { temperature: _t, topP: _p, topK: _k, ...rest } = params
      return rest
    },
    wrapGenerate: async ({ doGenerate }) => {
      const ctx = attribution(base)
      const started = Date.now()
      try {
        const result = await doGenerate()
        withAiUsage(ctx, () =>
          recordAiUsage({
            model: defaults.modelId,
            kind: 'text',
            ...tokensOf(result.usage as V4Usage),
            costUsd: providerCost(result.providerMetadata),
            durationMs: Date.now() - started,
            ok: true,
          }),
        )
        return result
      } catch (err) {
        withAiUsage(ctx, () => recordFailure(defaults.modelId, started, err))
        throw err
      }
    },
    wrapStream: async ({ doStream }) => {
      const ctx = attribution(base)
      const started = Date.now()
      let result: Awaited<ReturnType<typeof doStream>>
      try {
        result = await doStream()
      } catch (err) {
        withAiUsage(ctx, () => recordFailure(defaults.modelId, started, err))
        throw err
      }
      let recorded = false
      const meter = new TransformStream<any, any>({
        transform(part, controller) {
          if (!recorded && part?.type === 'finish') {
            recorded = true
            withAiUsage(ctx, () =>
              recordAiUsage({
                model: defaults.modelId,
                kind: 'text',
                ...tokensOf(part.usage as V4Usage),
                costUsd: providerCost(part.providerMetadata),
                durationMs: Date.now() - started,
                ok: true,
              }),
            )
          }
          controller.enqueue(part)
        },
      })
      return { ...result, stream: result.stream.pipeThrough(meter) }
    },
  }
}

/** Route/job context first; the model's own step label (planner, copy, layout…) is the
 *  more specific one, so it wins over a context feature; the context's surface wins. */
function attribution(base: Partial<{ surface: AiSurface; feature: string }>): AiUsageContext {
  const ctx = currentAiUsage()
  return { ...ctx, surface: ctx.surface ?? base.surface, feature: base.feature ?? ctx.feature }
}

function recordFailure(model: string, started: number, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  // An abort (Stop, closed tab) is not a failure worth listing.
  if (/abort/i.test(message)) return
  recordAiUsage({
    model,
    kind: 'text',
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
    durationMs: Date.now() - started,
    ok: false,
    error: message.slice(0, 300),
  })
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}
