// ---------------------------------------------------------------------------
// Server-side permission enforcement.
//
// Replaces the old blanket "any logged-in user may write" gate with role-aware
// middleware. Mirrors the enforcing subset of the web engine (apps/web/src/rbac).
//
// Interim posture (Phase B): racing DATA writes are staff-only; tipping is open
// to any authenticated user; articles use the editorial matrix with author match.
// Party/organisation-scoped write access is layered in Phase C/D — see the
// `// TODO(phase C/D)` seams. See RBAC.md §6.
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { attachAccount, attachAccountOptional } from './auth.js'
import { STAFF_ROLES, type AccountUser, type OrgRole, type StaffRole } from './identity.js'

type ContentAction =
  | 'content.draft.create'
  | 'content.draft.edit_own'
  | 'content.draft.edit_any'

// Mirror of the content slice of apps/web/src/lib/permissions.ts.
const CONTENT_PERMS: Record<StaffRole, ContentAction[]> = {
  contributor: ['content.draft.create', 'content.draft.edit_own'],
  editor: ['content.draft.create', 'content.draft.edit_own', 'content.draft.edit_any'],
  legal_reviewer: ['content.draft.edit_any'],
  podcast_producer: [],
  publisher: ['content.draft.edit_any'],
  administrator: ['content.draft.create', 'content.draft.edit_own', 'content.draft.edit_any'],
}

export function isStaff(account: AccountUser | undefined): boolean {
  return !!account && account.roles.some((r) => (STAFF_ROLES as string[]).includes(r))
}

/** Holds the administrator role. Admins can grant staff roles (incl. administrator). */
export function isAdmin(account: AccountUser | undefined): boolean {
  return !!account && account.roles.includes('administrator')
}

/** The account's role within a given organisation, if any. */
export function orgRoleIn(account: AccountUser | undefined, orgId: string): OrgRole | undefined {
  return account?.orgMemberships.find((m) => m.orgId === orgId)?.orgRole
}

/** May run operational org actions (add members/parties): owner, manager, or a global admin. */
export function canManageOrg(account: AccountUser | undefined, orgId: string): boolean {
  if (isAdmin(account)) return true
  const r = orgRoleIn(account, orgId)
  return r === 'org_owner' || r === 'org_manager'
}

/** Owner-only actions (members/roles/billing/delete): the org owner or a global admin. */
export function isOrgOwner(account: AccountUser | undefined, orgId: string): boolean {
  if (isAdmin(account)) return true
  return orgRoleIn(account, orgId) === 'org_owner'
}

function contentCan(account: AccountUser | undefined, action: ContentAction): boolean {
  if (!account) return false
  return account.roles.some(
    (r) => (STAFF_ROLES as string[]).includes(r) && CONTENT_PERMS[r as StaffRole]?.includes(action),
  )
}

const forbid = (res: Response, msg: string) => res.status(403).json({ error: msg })

/** GET is public; any write requires a signed-in account (any role, incl. reader). */
export function authedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next()
  void attachAccount(req, res, next)
}

/** GET is public; any write requires a STAFF account. */
export function staffWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next()
  void attachAccount(req, res, () => {
    if (!isStaff(req.account)) {
      forbid(res, 'Staff access required.')
      return
    }
    next()
  })
}

/** First non-empty path segment of the mounted sub-path (the :id for /:id routes). */
function firstSegment(req: Request): string | undefined {
  return req.url.split('?')[0].split('/').filter(Boolean)[0]
}

/** Editorial gate for /api/articles: create/edit_own(author match)/edit_any. */
export function articlesWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next()
  void attachAccount(req, res, async () => {
    const account = req.account!
    if (req.method === 'POST') {
      if (!contentCan(account, 'content.draft.create')) return forbid(res, 'You cannot create stories.')
      return next()
    }
    if (req.method === 'DELETE') {
      if (!contentCan(account, 'content.draft.edit_any')) return forbid(res, 'You cannot delete this story.')
      return next()
    }
    // PUT — edit_any wins; otherwise edit_own requires the author to match.
    if (contentCan(account, 'content.draft.edit_any')) return next()
    if (contentCan(account, 'content.draft.edit_own')) {
      const id = firstSegment(req)
      const doc = id ? await db.collection('articles').findById(id) : null
      if (doc && doc.author === account.displayName) return next()
    }
    return forbid(res, 'You can only edit your own drafts.')
  })
}

/**
 * Gate for /api/reports: GET loads the account optionally (so the handler can
 * filter private records by visibility); writes are staff-only.
 */
export function reportsGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    void attachAccountOptional(req, res, next)
    return
  }
  void attachAccount(req, res, () => {
    if (!isStaff(req.account)) {
      forbid(res, 'Staff access required.')
      return
    }
    next()
  })
}
