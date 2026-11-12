// ---------------------------------------------------------------------------
// AI Activity — the READS behind the Campaign Engine "AI Activity" page.
//
// Everything that shapes a query or a result is pure and lives in
// aiActivityQuery.ts (unit-tested); this file only runs the pipelines and
// resolves the names a person reads: user names from `users`, and the title of
// what a session was about (a magazine, an article…).
//
// Routes: routes/aiActivity. Page: apps/web/src/pages/production-system/ai-activity/.
// ---------------------------------------------------------------------------

import { db } from '../db.js'
import { AI_USAGE, PARTIES, USERS } from '../collections.js'
import { COL } from '../magazineV2/collections.js'
import type { AiSurface } from './aiUsage.js'
import {
  SESSION_CALL_CAP,
  anonymousName,
  detailPipeline,
  sessionCallsPipeline,
  sessionsPipeline,
  shapeCall,
  shapeDetail,
  shapeSession,
  shapeSurfaces,
  surfacesPipeline,
  usageMatch,
  windowStart,
  type SessionCall,
  type SessionSummary,
  type SurfaceDetail,
  type SurfacesReport,
} from './aiActivityQuery.js'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const today = () => new Date().toISOString().slice(0, 10)

/** userId → display name, in ONE query. */
async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return out
  for (const u of await db.collection(USERS).findByIds(unique)) {
    const name = str(u.name).trim() || str(u.email).trim()
    if (name) out.set(String(u._id), name)
  }
  return out
}

/** Where an entity's readable name lives, per entityType the meter records. */
const TITLE_SOURCES: Record<string, { collection: string; fields: string[] }> = {
  magazine: { collection: COL.magazines, fields: ['title', 'name'] },
  article: { collection: 'articles', fields: ['title', 'headline'] },
  blog: { collection: 'blogs', fields: ['title'] },
  horse: { collection: 'horses', fields: ['name'] },
  party: { collection: PARTIES, fields: ['name', 'displayName'] },
}

/** `${entityType}:${entityId}` → title, one query per entity type present. Fails soft. */
async function titlesFor(rows: { entityType: string; entityId: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const byType = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.entityType || !r.entityId || !TITLE_SOURCES[r.entityType]) continue
    let ids = byType.get(r.entityType)
    if (!ids) byType.set(r.entityType, (ids = new Set()))
    ids.add(r.entityId)
  }
  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      const source = TITLE_SOURCES[type]!
      try {
        for (const doc of await db.collection(source.collection).findByIds([...ids])) {
          const title = source.fields.map((f) => str(doc[f]).trim()).find(Boolean)
          if (title) out.set(`${type}:${String(doc._id)}`, title)
        }
      } catch (err) {
        console.warn('[ai-activity] title lookup failed:', err instanceof Error ? err.message : err)
      }
    }),
  )
  return out
}

// ── the overview: one row per surface ───────────────────────────────────────

export interface SurfacesQuery {
  /** Undefined = every user (the caller already proved the all-scope right). */
  userId?: string
  days: number
}

export async function surfacesReport(q: SurfacesQuery): Promise<SurfacesReport & { meteredSince: string | null }> {
  const from = windowStart(q.days)
  const facets = await db.collection(AI_USAGE).aggregate(surfacesPipeline(usageMatch({ userId: q.userId, from })))
  // meteredSince is no longer reported: the page shows usage without a "since" note.
  return { ...shapeSurfaces(facets[0], from, today()), meteredSince: null }
}

// ── one surface ─────────────────────────────────────────────────────────────

export interface SessionsQuery {
  userId?: string
  surface: AiSurface
  days: number
  limit: number
  before?: string | null
}

export interface SessionsPage {
  sessions: SessionSummary[]
  nextBefore: string | null
}

export async function surfaceSessions(q: SessionsQuery): Promise<SessionsPage> {
  const match = usageMatch({ userId: q.userId, surface: q.surface, from: windowStart(q.days) })
  const rows = await db.collection(AI_USAGE).aggregate(sessionsPipeline(match, { before: q.before, limit: q.limit }))
  const [names, titles] = await Promise.all([
    namesFor(rows.map((r) => str(r.userId))),
    titlesFor(rows.map((r) => ({ entityType: str(r.entityType), entityId: str(r.entityId) }))),
  ])
  const sessions = rows.map((r) => shapeSession(r, names, titles, anonymousName(q.surface)))
  const last = sessions[sessions.length - 1]
  return { sessions, nextBefore: sessions.length === q.limit && last?.lastUsedAt ? last.lastUsedAt : null }
}

export async function surfaceDetail(
  q: Omit<SessionsQuery, 'before'>,
): Promise<SurfaceDetail & SessionsPage & { surface: AiSurface }> {
  const from = windowStart(q.days)
  const match = usageMatch({ userId: q.userId, surface: q.surface, from })
  const [facets, page] = await Promise.all([
    db.collection(AI_USAGE).aggregate(detailPipeline(match)),
    surfaceSessions({ ...q, before: null }),
  ])
  const byUser = ((facets[0] as { byUser?: { _id?: unknown }[] } | undefined)?.byUser ?? []).map((r) => str(r._id))
  const names = await namesFor(byUser)
  return { surface: q.surface, ...shapeDetail(facets[0], from, today(), names, anonymousName(q.surface)), ...page }
}

// ── one session ─────────────────────────────────────────────────────────────

export interface SessionDetail {
  sessionId: string
  surface: AiSurface
  userId: string
  userName: string
  entityType: string
  entityId: string
  entityTitle: string
  calls: SessionCall[]
  /** True when the session has more than SESSION_CALL_CAP calls (the oldest are shown). */
  truncated: boolean
}

/** Every call of one session, or null when there is none (or not the caller's). */
export async function sessionDetail(q: { sessionId: string; userId?: string; surface?: AiSurface }): Promise<SessionDetail | null> {
  const rows = await db.collection(AI_USAGE).aggregate(sessionCallsPipeline(q))
  if (rows.length === 0) return null
  const head = rows[0]!
  const userId = str(head.userId)
  const entityType = str(head.entityType)
  const entityId = str(head.entityId)
  const [names, titles] = await Promise.all([namesFor([userId]), titlesFor([{ entityType, entityId }])])
  const calls = rows.slice(0, SESSION_CALL_CAP).map(shapeCall)
  const surface = calls[0]!.surface
  return {
    sessionId: q.sessionId,
    surface,
    userId,
    userName: names.get(userId) || str(head.userName) || anonymousName(surface)(userId),
    entityType,
    entityId,
    entityTitle: titles.get(`${entityType}:${entityId}`) ?? '',
    calls,
    truncated: rows.length > SESSION_CALL_CAP,
  }
}
