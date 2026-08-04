// ---------------------------------------------------------------------------
// Staff analytics.
//
// One endpoint today: the reader-reaction report behind
// /production-system/emoji-analytics. It returns per-item COUNTS and nothing
// weighted — see the note above `reactionsReport` in lib/reactions.ts for why
// the scoring stays on the client with the one shared scale.
//
// This is also where `analytics.view` stops being a permission the browser
// merely respects. It gated the sidebar module and nothing else, so the data it
// was supposed to protect had no server-side check to walk past; now the data
// exists, so the check does too.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import type { Request, Response } from 'express'
import { attachAccount } from '../lib/auth.js'
import { accountCan } from '../lib/effectiveAccess.js'
import { REACTION_TARGET_TYPES, isTargetType, reactionsReport } from '../lib/reactions.js'
import type { ReactionTargetType } from '../lib/reactions.js'

const router = Router()

/** Express 4 does not await handlers — a throw would hang the request, not 500. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      console.error('[analytics]', err instanceof Error ? err.message : err)
      if (!res.headersSent) res.status(500).json({ error: 'Could not build that report.' })
    })
  }
}

/** YYYY-MM-DD, or nothing. Anything else is not a date and must not reach a query. */
function isoDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

const today = (): string => new Date().toISOString().slice(0, 10)

/**
 * GET /api/analytics/reactions?from=&to=&types=blog,story
 *
 * `types` is a comma list; omitted or empty means every type. Unknown values are
 * dropped rather than 400-ing — a filter chip that gets renamed should narrow
 * the report, not break the page.
 *
 * Staff reactions are excluded. `?includeStaff=1` puts them back for anyone who
 * wants to see the building's own answers; there is no UI for it on purpose.
 */
router.get('/reactions', attachAccount, handle(async (req, res) => {
  if (!accountCan(req.account, 'analytics.view')) {
    res.status(403).json({ error: 'You do not have access to analytics.' })
    return
  }

  const to = isoDate(req.query.to) ?? today()
  // Default window matches the screen's own default control (last 90 days), so a
  // request with no dates answers the same question the page asks on open.
  const from = isoDate(req.query.from) ?? new Date(Date.parse(`${to}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10)
  if (from > to) {
    res.status(400).json({ error: 'The start of the range is after its end.' })
    return
  }

  const raw = typeof req.query.types === 'string' ? req.query.types.split(',') : []
  const types = raw.map((t) => t.trim()).filter(isTargetType) as ReactionTargetType[]

  const includeStaff = req.query.includeStaff === '1' || req.query.includeStaff === 'true'
  const report = await reactionsReport({ from, to, types, includeStaff })
  if (report.truncated > 0) {
    console.warn(`[analytics] reactions report capped — ${report.truncated} reacted items left out`)
  }

  res.json({ from, to, types: types.length ? types : [...REACTION_TARGET_TYPES], ...report })
}))

export default router
