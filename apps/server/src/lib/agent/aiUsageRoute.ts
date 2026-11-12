// ---------------------------------------------------------------------------
// AI usage attribution at the EDGE — the Express side of aiUsage.ts.
//
// `aiSurface('story-ai')` is a middleware that runs the rest of the request
// (the handler and everything it awaits, including a stream it starts) inside
// `withAiUsage({ surface, userId, userName, … })`. Every metered model call made
// while serving that request is then attributed to the surface and the person,
// with no change to the handler itself.
//
// ORDER MATTERS: put it AFTER any body parser on the same chain. A parser calls
// next() from a stream 'end' event, which runs outside the context a middleware
// opened before it — so a parser placed after this would drop the attribution.
// The /api/agent/* JSON parsers sit on the mounts in routes/index.ts, ahead of
// every router, so router-level use is safe; a route-level `raw()` must come
// first in its chain.
//
// Hints: a few endpoints serve several surfaces (document ingest backs the
// Magazine Builder's AI panel today, and anything later). They accept an
// optional `?surface=&entityType=&entityId=` hint from the client, validated
// here — a hint only labels the record; it grants nothing.
// ---------------------------------------------------------------------------

import type { Request, RequestHandler } from 'express'
import { isAiSurface, withAiUsage, type AiSurface, type AiUsageContext } from './aiUsage.js'

const HINT_ID = /^[A-Za-z0-9_-]{1,100}$/
const HINT_TYPE = /^[a-z][a-z0-9-]{0,31}$/

/** The validated attribution hint in a query object. Anything malformed is dropped. */
export function usageHint(query: Record<string, unknown> | undefined): AiUsageContext {
  const q = query ?? {}
  const out: AiUsageContext = {}
  if (isAiSurface(q.surface)) out.surface = q.surface
  if (typeof q.entityType === 'string' && HINT_TYPE.test(q.entityType)) out.entityType = q.entityType
  if (typeof q.entityId === 'string' && HINT_ID.test(q.entityId)) out.entityId = q.entityId
  return out
}

/** `{ entityType, entityId }` when both are well-formed, else nothing. For reading
 *  what a studio request is about out of its (untrusted) body. */
export function entityFrom(type: unknown, id: unknown): AiUsageContext {
  if (typeof type !== 'string' || !HINT_TYPE.test(type)) return {}
  if (typeof id !== 'string' || !HINT_ID.test(id)) return {}
  return { entityType: type, entityId: id }
}

export interface AiSurfaceOptions {
  /** A finer label for every call on this route, e.g. 'daily-brief'. */
  feature?: string
  /** Per-request extras (entity, session) read from the request. */
  context?: (req: Request) => AiUsageContext
  /** Accept the client's `?surface=&entityType=&entityId=` hint (see usageHint). */
  acceptHint?: boolean
}

/** Attribute every model call made while serving the request to `surface` + the caller. */
export function aiSurface(surface: AiSurface, opts: AiSurfaceOptions = {}): RequestHandler {
  return (req, _res, next) => {
    const account = req.account
    const ctx: AiUsageContext = {
      surface,
      feature: opts.feature,
      userId: account?.id,
      userName: account?.name || account?.email || undefined,
      ...(opts.context ? opts.context(req) : {}),
      ...(opts.acceptHint ? usageHint(req.query as Record<string, unknown>) : {}),
    }
    withAiUsage(ctx, () => next())
  }
}

// ── Magazine Builder ─────────────────────────────────────────────────────────

/** Path segments under /issues that are actions, not a magazine id. */
const NOT_AN_ID = new Set(['blank', 'prepare', 'generate', 'upload'])

/**
 * The magazine id in a Magazine Builder router path (`/issues/:id/…`), or
 * undefined. Router-level middleware runs before route params are parsed, so the
 * id is read off the path itself.
 */
export function magazineIdFromPath(path: string): string | undefined {
  const m = /^\/issues\/([^/?#]+)/.exec(path)
  const id = m?.[1]
  if (!id || NOT_AN_ID.has(id) || !HINT_ID.test(id)) return undefined
  return id
}

/** Every AI call the Magazine Builder router makes → 'magazine-builder', with the magazine. */
export const magazineAiUsage: RequestHandler = aiSurface('magazine-builder', {
  context: (req) => {
    const entityId = magazineIdFromPath(req.path)
    return entityId ? { entityType: 'magazine', entityId } : {}
  },
})
