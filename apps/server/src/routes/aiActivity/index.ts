// ---------------------------------------------------------------------------
// GET /api/ai-activity/* — the Campaign Engine "AI Activity" page (read-only).
//
// Every AI surface's usage from the `aiUsage` meter (lib/agent/aiUsage.ts):
// The Stable Hand, Magazine Builder, Story AI, Article AI, Blog AI, …
//
//   GET /surfaces?scope=mine|all&days=N                one row per surface + daily series
//   GET /surfaces/:surface?scope&days&limit            totals, by day / feature / model / person,
//                                                      and the first page of sessions
//   GET /surfaces/:surface/sessions?scope&days&before&limit   older sessions (paging)
//   GET /sessions/:sessionId?userId=&surface=          every call of one session
//
// Same gate as Stable Hand Activity (routes/agentOperator): staff and invited
// team members see their OWN usage; everyone's needs `analytics.view` — AI
// spend is a production number. Superadmins pass accountCan's short-circuit.
//
// Every query param is validated (aiActivityQuery.ts); nothing from the request
// reaches Mongo as an object.
// ---------------------------------------------------------------------------

import { Router, type NextFunction, type Request, type Response } from 'express'
import { attachAccount } from '../../lib/auth.js'
import { isAdmin } from '../../lib/rbac.js'
import { accountCan, type AccountUser } from '../../lib/effectiveAccess.js'
import { sessionDetail, surfaceDetail, surfaceSessions, surfacesReport } from '../../lib/agent/aiActivity.js'
import { clampInt, isSessionId, isUserId, isoTimestamp, parseSurface } from '../../lib/agent/aiActivityQuery.js'

const router = Router()

router.use(attachAccount)
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isAdmin(req.account)) {
    res.status(403).json({ error: 'AI activity is for staff and invited team members.' })
    return
  }
  next()
})

const canSeeAll = (account: AccountUser | undefined) => accountCan(account, 'analytics.view')

/** Express 4 does not await handlers — a throw would hang the request, not 500. */
function read(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      console.error('[ai-activity] read failed:', err instanceof Error ? err.message : err)
      if (!res.headersSent) res.status(500).json({ error: 'Could not load AI activity.' })
    })
  }
}

/** 'mine' unless 'all' was asked for. Answers 403 itself when 'all' is not allowed. */
function scopeOf(req: Request, res: Response): 'mine' | 'all' | null {
  if (req.query.scope !== 'all') return 'mine'
  if (canSeeAll(req.account)) return 'all'
  res.status(403).json({ error: "Seeing everyone's AI activity needs the Analytics permission." })
  return null
}

const daysOf = (req: Request) => clampInt(req.query.days, 30, 1, 90)

router.get(
  '/surfaces',
  read(async (req, res) => {
    const scope = scopeOf(req, res)
    if (!scope) return
    const days = daysOf(req)
    const report = await surfacesReport({ userId: scope === 'mine' ? req.account!.id : undefined, days })
    res.json({ scope, canSeeAll: canSeeAll(req.account), windowDays: days, ...report })
  }),
)

router.get(
  '/surfaces/:surface',
  read(async (req, res) => {
    const surface = parseSurface(req.params.surface)
    if (!surface) {
      res.status(404).json({ error: 'There is no AI surface by that name.' })
      return
    }
    const scope = scopeOf(req, res)
    if (!scope) return
    const days = daysOf(req)
    const detail = await surfaceDetail({
      userId: scope === 'mine' ? req.account!.id : undefined,
      surface,
      days,
      limit: clampInt(req.query.limit, 25, 1, 100),
    })
    res.json({ scope, canSeeAll: canSeeAll(req.account), windowDays: days, ...detail })
  }),
)

router.get(
  '/surfaces/:surface/sessions',
  read(async (req, res) => {
    const surface = parseSurface(req.params.surface)
    if (!surface) {
      res.status(404).json({ error: 'There is no AI surface by that name.' })
      return
    }
    const scope = scopeOf(req, res)
    if (!scope) return
    const days = daysOf(req)
    const page = await surfaceSessions({
      userId: scope === 'mine' ? req.account!.id : undefined,
      surface,
      days,
      limit: clampInt(req.query.limit, 25, 1, 100),
      before: isoTimestamp(req.query.before),
    })
    res.json({ scope, canSeeAll: canSeeAll(req.account), windowDays: days, surface, ...page })
  }),
)

router.get(
  '/sessions/:sessionId',
  read(async (req, res) => {
    const { sessionId } = req.params
    if (!isSessionId(sessionId)) {
      res.status(400).json({ error: 'That is not a session id.' })
      return
    }
    const account = req.account!
    const asked = isUserId(req.query.userId) ? req.query.userId : undefined
    // Without the all-scope right the lookup is pinned to the caller, so someone
    // else's session answers 404 — the same as one that does not exist.
    const userId = canSeeAll(account) ? asked : account.id
    const session = await sessionDetail({ sessionId, userId, surface: parseSurface(req.query.surface) ?? undefined })
    if (!session) {
      res.status(404).json({ error: 'Session not found.' })
      return
    }
    res.json({ session })
  }),
)

export default router
