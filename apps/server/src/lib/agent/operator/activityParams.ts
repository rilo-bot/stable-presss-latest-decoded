// ---------------------------------------------------------------------------
// Stablehand Activity — the PURE query-parameter helpers, kept apart from
// activity.ts so they can be tested without a database (lib/db.ts refuses to
// load without MONGODB_URI).
// ---------------------------------------------------------------------------

export const DAY_MS = 86_400_000

/** An integer query param, clamped. Junk falls back to the default. */
export function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** An ISO timestamp, or nothing. Anything else must not reach a query. */
export function isoTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * The activity pages (AI Activity, The Stable Hand's run log) count from this
 * moment on; older records stay stored but are not shown. AI_ACTIVITY_SINCE (an
 * ISO timestamp) moves it; AI_ACTIVITY_SINCE=none shows everything.
 */
const DEFAULT_ACTIVITY_SINCE = '2026-11-12T16:00:00.000Z' // 9:30 pm India time

export function activitySince(): string | null {
  const raw = (process.env.AI_ACTIVITY_SINCE ?? '').trim()
  if (raw.toLowerCase() === 'none') return null
  return (raw && isoTimestamp(raw)) || DEFAULT_ACTIVITY_SINCE
}

/** An ISO lower bound, raised to activitySince() when that is later. */
export function notBeforeActivitySince(iso: string): string {
  const since = activitySince()
  return since && since > iso ? since : iso
}

/** UTC YYYY-MM-DD of the first day in a window of `days` days ending today. */
export function windowStart(days: number, now = new Date()): string {
  return new Date(now.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10)
}

/** Every UTC date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}


/** Same shape runs.ts accepts for a client runId (plus its `srv-<uuid>` fallback). */
const RUN_ID = /^[A-Za-z0-9_-]{6,100}$/
export const isRunId = (v: unknown): v is string => typeof v === 'string' && RUN_ID.test(v)
