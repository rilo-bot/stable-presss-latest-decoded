// ---------------------------------------------------------------------------
// Website customisation — GET is public, PUT needs `settings.manage`.
//
// The GET has to be open: the public navbar renders this for signed-out readers,
// so gating it would leave every guest looking at the default six tabs while the
// site's own settings said otherwise. It exposes nothing but six booleans that
// are already visible in the markup.
//
// The PUT is the reason `settings.manage` is back in the permission catalogue.
// It was removed when the Settings screen was static text — a checkbox that
// governed nothing — with a note in permissionCatalogue.ts to re-add it in the
// same commit as the endpoint that enforces it. This is that endpoint.
//
// A superadmin passes `accountCan` by short-circuit, and the `administrator`
// role is materialised from the whole catalogue, so both hold it without being
// named here. No role slug appears in this file (see lib/rbac.ts).
// ---------------------------------------------------------------------------

import { Router, type Request, type Response, type NextFunction } from 'express'
import { attachAccount } from '../../lib/auth.js'
import { accountCan } from '../../lib/rbac.js'
import {
  PUBLIC_NAV_KEYS,
  normalisePublicNav,
  readPublicNav,
  writePublicNav,
  type PublicNavVisibility,
} from '../../lib/siteSettings.js'

const router = Router()

const requireManageSettings = (req: Request, res: Response, next: NextFunction): void => {
  if (!accountCan(req.account, 'settings.manage')) {
    res.status(403).json({ error: 'You do not have permission to change website settings.' })
    return
  }
  next()
}

// read — public (the navbar needs it before anyone signs in)
router.get('/', async (_req, res) => {
  res.json({ publicNav: await readPublicNav() })
})

// write — `settings.manage`
router.put('/public-nav', attachAccount, requireManageSettings, async (req, res) => {
  const body = (req.body ?? {}) as { publicNav?: unknown }
  if (typeof body.publicNav !== 'object' || body.publicNav === null || Array.isArray(body.publicNav)) {
    res.status(400).json({ error: 'publicNav must be an object of section → boolean.' })
    return
  }

  // Refuse a map that would hide EVERY section. It is almost certainly a mistake
  // — a public site with no navigation at all — and it is far easier to reject
  // here than to explain to whoever finds the empty header later.
  const next: PublicNavVisibility = normalisePublicNav(body.publicNav)
  if (PUBLIC_NAV_KEYS.every((key) => next[key] === false)) {
    res.status(400).json({ error: 'At least one public section must stay visible.' })
    return
  }

  res.json({ publicNav: await writePublicNav(next, req.account?.id) })
})

export default router
