// ---------------------------------------------------------------------------
// AI Activity — the PURE half: query params, aggregation pipelines and the
// shaping of their results. No database here (lib/db.ts refuses to load without
// MONGODB_URI), so all of it is unit-tested in tests/aiActivity.test.ts.
//
// The reads themselves are in aiActivity.ts; the routes in routes/aiActivity;
// the page is apps/web/src/pages/production-system/ai-activity/.
//
// Collection: `aiUsage` — one document per model call (aiUsage.ts). A SESSION is
// the calls that share a `sessionId` (a Stable Hand run, a worker job) for one
// user; a call with no sessionId is a session of its own.
// ---------------------------------------------------------------------------

import { AI_SURFACES, isAiSurface, type AiSurface } from './aiUsage.js'
import { datesBetween } from './operator/activityParams.js'

export { clampInt, isoTimestamp, windowStart } from './operator/activityParams.js'

// ── params ──────────────────────────────────────────────────────────────────

/** A path/query surface, or null. Anything else must not reach a query. */
export function parseSurface(raw: unknown): AiSurface | null {
  return isAiSurface(raw) ? raw : null
}

/** Run ids (`[A-Za-z0-9_-]{6,100}`, `srv-<uuid>`) and job ids (ObjectId hex). */
const SESSION_ID = /^[A-Za-z0-9_-]{1,100}$/
export const isSessionId = (v: unknown): v is string => typeof v === 'string' && SESSION_ID.test(v)

/** A user id as stored (ObjectId hex, or a legacy string id). */
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/
export const isUserId = (v: unknown): v is string => typeof v === 'string' && USER_ID.test(v)

// ── pipelines ───────────────────────────────────────────────────────────────

export interface UsageMatchQuery {
  /** Undefined = every user (the caller already proved the all-scope right). */
  userId?: string
  surface?: AiSurface
  /** First UTC day of the window, YYYY-MM-DD. */
  from: string
}

/**
 * The $match every read opens with. aggregate() adds no soft-delete filter, so
 * `deletedAt: null` is here. Indexes (lib/ensureIndexes.ts): {surface, deletedAt,
 * createdAt}, {userId, surface, deletedAt, createdAt}, {deletedAt, createdAt}.
 */
export function usageMatch(q: UsageMatchQuery): Record<string, unknown> {
  const match: Record<string, unknown> = { deletedAt: null, createdAt: { $gte: `${q.from}T00:00:00.000Z` } }
  if (q.userId) match.userId = q.userId
  if (q.surface) match.surface = q.surface
  return match
}

/** The sums every grouping reports. */
const SUMS = {
  calls: { $sum: 1 },
  inputTokens: { $sum: '$inputTokens' },
  outputTokens: { $sum: '$outputTokens' },
  cachedInputTokens: { $sum: '$cachedInputTokens' },
  reasoningTokens: { $sum: '$reasoningTokens' },
  costUsd: { $sum: '$costUsd' },
  errors: { $sum: { $cond: [{ $eq: ['$ok', false] }, 1, 0] } },
  /** Calls whose cost is a list-price estimate rather than the provider's bill. */
  estimated: { $sum: { $cond: [{ $ne: ['$costSource', 'provider'] }, 1, 0] } },
  durationMs: { $sum: '$durationMs' },
  lastUsedAt: { $max: '$createdAt' },
} as const

/** A call's session: its sessionId (per user), or the call itself when it has none. */
export const SESSION_KEY = {
  $cond: [{ $gt: [{ $ifNull: ['$sessionId', ''] }, ''] }, { s: '$sessionId', u: '$userId' }, { c: '$_id' }],
} as const

/** Distinct, non-empty user ids collected by $addToSet → their count. */
const countUsers = { $size: { $setDifference: ['$users', [null, '']] } }

/** One row per surface + a per-surface, per-day series. */
export function surfacesPipeline(match: Record<string, unknown>): Record<string, unknown>[] {
  return [
    { $match: match },
    {
      $facet: {
        bySurface: [
          { $group: { _id: '$surface', ...SUMS, users: { $addToSet: '$userId' } } },
          { $addFields: { users: countUsers } },
        ],
        sessions: [
          { $group: { _id: { surface: '$surface', key: SESSION_KEY } } },
          { $group: { _id: '$_id.surface', n: { $sum: 1 } } },
        ],
        byDay: [
          { $group: { _id: { surface: '$surface', day: '$day' }, calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' } } },
        ],
      },
    },
  ]
}

/** Totals, per day, per feature, per model and per person for one surface. */
export function detailPipeline(match: Record<string, unknown>): Record<string, unknown>[] {
  const ranked = [{ $sort: { costUsd: -1, calls: -1 } }, { $limit: 50 }]
  return [
    { $match: match },
    {
      $facet: {
        totals: [
          { $group: { _id: null, ...SUMS, users: { $addToSet: '$userId' } } },
          { $addFields: { users: countUsers } },
        ],
        sessionCount: [{ $group: { _id: SESSION_KEY } }, { $count: 'n' }],
        byDay: [
          {
            $group: {
              _id: '$day',
              calls: { $sum: 1 },
              costUsd: { $sum: '$costUsd' },
              inputTokens: { $sum: '$inputTokens' },
              outputTokens: { $sum: '$outputTokens' },
              cachedInputTokens: { $sum: '$cachedInputTokens' },
              errors: SUMS.errors,
            },
          },
        ],
        byFeature: [{ $group: { _id: { $ifNull: ['$feature', ''] }, ...SUMS } }, ...ranked],
        byModel: [{ $group: { _id: { $ifNull: ['$model', ''] }, ...SUMS } }, ...ranked],
        byUser: [
          { $group: { _id: { $ifNull: ['$userId', ''] }, ...SUMS, userName: { $max: '$userName' } } },
          { $sort: { costUsd: -1, calls: -1 } },
          { $limit: 100 },
        ],
      },
    },
  ]
}

/**
 * Newest-first sessions. Grouped over the WHOLE window before the cursor is
 * applied, so a session never splits across two pages; `before` is the previous
 * page's last `lastAt`.
 */
export function sessionsPipeline(
  match: Record<string, unknown>,
  page: { before?: string | null; limit: number },
): Record<string, unknown>[] {
  return [
    { $match: match },
    {
      $group: {
        _id: SESSION_KEY,
        sessionId: { $max: '$sessionId' },
        userId: { $max: '$userId' },
        userName: { $max: '$userName' },
        surface: { $max: '$surface' },
        startedAt: { $min: '$createdAt' },
        ...SUMS,
        features: { $addToSet: '$feature' },
        models: { $addToSet: '$model' },
        kinds: { $addToSet: '$kind' },
        entityType: { $max: '$entityType' },
        entityId: { $max: '$entityId' },
        // A string: the db wrapper only stringifies a TOP-LEVEL _id.
        callId: { $max: { $toString: '$_id' } },
        error: { $max: '$error' },
      },
    },
    ...(page.before ? [{ $match: { lastUsedAt: { $lt: page.before } } }] : []),
    { $sort: { lastUsedAt: -1 } },
    { $limit: page.limit },
  ]
}

/** Calls kept per session drill-down (a big magazine build makes a few hundred). */
export const SESSION_CALL_CAP = 500

/** Every call of one session, oldest first. Index: {sessionId, deletedAt}. */
export function sessionCallsPipeline(q: { sessionId: string; userId?: string; surface?: AiSurface }): Record<string, unknown>[] {
  const match: Record<string, unknown> = { deletedAt: null, sessionId: q.sessionId }
  if (q.userId) match.userId = q.userId
  if (q.surface) match.surface = q.surface
  return [
    { $match: match },
    { $sort: { createdAt: 1 } },
    { $limit: SESSION_CALL_CAP + 1 },
    { $project: { deletedAt: 0 } },
  ]
}

// ── shaping ─────────────────────────────────────────────────────────────────

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))] : []

export interface UsageSums {
  calls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  costUsd: number
  errors: number
  /** Calls whose cost is an estimate (list prices) rather than the provider's bill. */
  estimated: number
  durationMs: number
  lastUsedAt: string | null
}

const ZERO: UsageSums = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
  errors: 0,
  estimated: 0,
  durationMs: 0,
  lastUsedAt: null,
}

export function sumsOf(raw: unknown): UsageSums {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    calls: num(r.calls),
    inputTokens: num(r.inputTokens),
    outputTokens: num(r.outputTokens),
    cachedInputTokens: num(r.cachedInputTokens),
    reasoningTokens: num(r.reasoningTokens),
    costUsd: num(r.costUsd),
    errors: num(r.errors),
    estimated: num(r.estimated),
    durationMs: num(r.durationMs),
    lastUsedAt: str(r.lastUsedAt) || null,
  }
}

function addSums(a: UsageSums, b: UsageSums): UsageSums {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    costUsd: a.costUsd + b.costUsd,
    errors: a.errors + b.errors,
    estimated: a.estimated + b.estimated,
    durationMs: a.durationMs + b.durationMs,
    lastUsedAt: [a.lastUsedAt, b.lastUsedAt].filter(Boolean).sort().pop() ?? null,
  }
}

export interface DayPoint {
  date: string
  calls: number
  costUsd: number
}

export interface SurfaceRow extends UsageSums {
  surface: AiSurface
  sessions: number
  users: number
  days: DayPoint[]
}

export interface SurfacesReport {
  from: string
  to: string
  surfaces: SurfaceRow[]
  totals: UsageSums & { sessions: number }
}

/** Unknown surface strings (none expected) fold into 'other' rather than vanish. */
const surfaceOf = (v: unknown): AiSurface => (isAiSurface(v) ? v : 'other')

/** The surfaces facet → one row per known surface (zeros included), days filled. */
export function shapeSurfaces(facet: unknown, from: string, to: string): SurfacesReport {
  const f = (facet ?? {}) as { bySurface?: unknown[]; sessions?: unknown[]; byDay?: unknown[] }
  const dates = datesBetween(from, to)
  const rows = new Map<AiSurface, SurfaceRow>(
    AI_SURFACES.map((surface) => [
      surface,
      { surface, ...ZERO, sessions: 0, users: 0, days: dates.map((date) => ({ date, calls: 0, costUsd: 0 })) },
    ]),
  )
  for (const raw of f.bySurface ?? []) {
    const r = raw as Record<string, unknown>
    const row = rows.get(surfaceOf(r._id))!
    Object.assign(row, addSums(row, sumsOf(r)))
    row.users += num(r.users)
  }
  for (const raw of f.sessions ?? []) {
    const r = raw as Record<string, unknown>
    rows.get(surfaceOf(r._id))!.sessions += num(r.n)
  }
  for (const raw of f.byDay ?? []) {
    const r = raw as { _id?: { surface?: unknown; day?: unknown }; calls?: unknown; costUsd?: unknown }
    const point = rows.get(surfaceOf(r._id?.surface))!.days.find((d) => d.date === str(r._id?.day))
    if (!point) continue
    point.calls += num(r.calls)
    point.costUsd += num(r.costUsd)
  }
  const surfaces = [...rows.values()]
  const totals = surfaces.reduce((a, s) => ({ ...addSums(a, s), sessions: a.sessions + s.sessions }), {
    ...ZERO,
    sessions: 0,
  })
  return { from, to, surfaces, totals }
}

export interface DetailDay extends DayPoint {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  errors: number
}

export interface BreakdownRow extends UsageSums {
  key: string
}

export interface UserRow extends BreakdownRow {
  userName: string
}

export interface SurfaceDetail {
  from: string
  to: string
  totals: UsageSums & { sessions: number; users: number }
  days: DetailDay[]
  byFeature: BreakdownRow[]
  byModel: BreakdownRow[]
  byUser: UserRow[]
}

/** The detail facet → totals, a filled day series and the three breakdowns. User
 *  names come from `names` (the users collection), else the name stored on the
 *  record, else `fallbackName(userId)`. */
export function shapeDetail(
  facet: unknown,
  from: string,
  to: string,
  names: Map<string, string>,
  fallbackName: (userId: string) => string,
): SurfaceDetail {
  const f = (facet ?? {}) as Record<string, unknown[] | undefined>
  const t = (f.totals?.[0] ?? {}) as Record<string, unknown>
  const byDay = new Map((f.byDay ?? []).map((raw) => [str((raw as Record<string, unknown>)._id), raw as Record<string, unknown>]))
  const days = datesBetween(from, to).map((date): DetailDay => {
    const d = byDay.get(date)
    return {
      date,
      calls: num(d?.calls),
      costUsd: num(d?.costUsd),
      inputTokens: num(d?.inputTokens),
      outputTokens: num(d?.outputTokens),
      cachedInputTokens: num(d?.cachedInputTokens),
      errors: num(d?.errors),
    }
  })
  const rows = (list: unknown[] | undefined): BreakdownRow[] =>
    (list ?? []).map((raw) => {
      const r = raw as Record<string, unknown>
      return { key: str(r._id), ...sumsOf(r) }
    })
  return {
    from,
    to,
    totals: {
      ...sumsOf(t),
      users: num(t.users),
      sessions: num((f.sessionCount?.[0] as Record<string, unknown> | undefined)?.n),
    },
    days,
    byFeature: rows(f.byFeature),
    byModel: rows(f.byModel),
    byUser: (f.byUser ?? []).map((raw) => {
      const r = raw as Record<string, unknown>
      const userId = str(r._id)
      return { key: userId, ...sumsOf(r), userName: names.get(userId) || str(r.userName) || fallbackName(userId) }
    }),
  }
}

export interface SessionSummary extends UsageSums {
  /** Null for a single call that belongs to no session. */
  sessionId: string | null
  /** The call's id when this "session" is one call without a sessionId. */
  callId: string | null
  surface: AiSurface
  userId: string
  userName: string
  startedAt: string
  features: string[]
  models: string[]
  kinds: string[]
  entityType: string
  entityId: string
  /** A readable name for the entity (a magazine's title…), when one was found. */
  entityTitle: string
  /** The newest error message in the session, if any call failed. */
  error: string
}

/** A sessions row → its wire shape. */
export function shapeSession(
  raw: unknown,
  names: Map<string, string>,
  titles: Map<string, string>,
  fallbackName: (userId: string) => string,
): SessionSummary {
  const r = (raw ?? {}) as Record<string, unknown>
  const sessionId = str(r.sessionId) || null
  const userId = str(r.userId)
  const entityType = str(r.entityType)
  const entityId = str(r.entityId)
  return {
    ...sumsOf(r),
    sessionId,
    callId: sessionId ? null : str(r.callId) || null,
    surface: surfaceOf(r.surface),
    userId,
    userName: names.get(userId) || str(r.userName) || fallbackName(userId),
    startedAt: str(r.startedAt),
    features: strs(r.features),
    models: strs(r.models),
    kinds: strs(r.kinds),
    entityType,
    entityId,
    entityTitle: titles.get(`${entityType}:${entityId}`) ?? '',
    error: num(r.errors) > 0 ? str(r.error) : '',
  }
}

export interface SessionCall {
  id: string
  createdAt: string
  surface: AiSurface
  feature: string
  model: string
  kind: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  costUsd: number
  costSource: string
  durationMs: number
  ok: boolean
  error: string
}

/** A stored call → its wire shape (no user/entity fields: the session carries those). */
export function shapeCall(raw: unknown): SessionCall {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(r._id),
    createdAt: str(r.createdAt),
    surface: surfaceOf(r.surface),
    feature: str(r.feature),
    model: str(r.model),
    kind: str(r.kind) || 'text',
    inputTokens: num(r.inputTokens),
    outputTokens: num(r.outputTokens),
    cachedInputTokens: num(r.cachedInputTokens),
    reasoningTokens: num(r.reasoningTokens),
    costUsd: num(r.costUsd),
    costSource: str(r.costSource) || 'unknown',
    durationMs: num(r.durationMs),
    ok: r.ok !== false,
    error: str(r.error),
  }
}

/** Who a call with no signed-in user was: a visitor on the public chat/voice, else the system. */
export function anonymousName(surface: AiSurface | undefined): (userId: string) => string {
  return (userId) =>
    userId ? 'Former staff member' : surface === 'concierge' || surface === 'voice' ? 'Signed-out visitor' : 'Unattributed'
}
