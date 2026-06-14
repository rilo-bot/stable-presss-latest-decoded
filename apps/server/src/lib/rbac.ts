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
import { authorisedHorseIds, manageablePartyIds } from './scope.js'

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

/**
 * Can the account write this horse's data? Staff always; otherwise the creator,
 * or a current verified-party / org link to the horse (mirror of the web
 * `canManageHorse`). Loads horses + links live so role/claim changes take effect
 * without re-issuing a token.
 */
export async function accountCanManageHorse(
  account: AccountUser | undefined,
  horseId: string,
): Promise<boolean> {
  if (!account) return false
  if (isStaff(account)) return true
  const horse = await db.collection('horses').findById(horseId)
  if (!horse) return false
  if (horse.createdByUserId && horse.createdByUserId === account.id) return true
  const horses = await db.collection('horses').find()
  const links = await db.collection('horsePartyLinks').find()
  return authorisedHorseIds(account, { horses, links }).includes(horseId)
}

/**
 * Horse-scoped write gate: GET is public (optionally account-aware so the
 * handler can filter private/unverified rows); writes require staff OR an
 * authorised relationship to the target horse.
 *   - `idIsHorse`   the router's :id IS the horse id (the horses router itself);
 *                   POST is allowed for any signed-in account (the handler stamps
 *                   creator + auto-links their owner party).
 *   - otherwise     a child record keyed by `horse_id` (body on POST; looked up
 *                   from `collection` on PUT/DELETE).
 *   - `optionalGet` attach the account on GET (for visibility filtering).
 */
export function horseScopedWriteGate(opts: {
  collection: string
  idIsHorse?: boolean
  optionalGet?: boolean
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') {
      if (opts.optionalGet) {
        void attachAccountOptional(req, res, next)
        return
      }
      return next()
    }
    void attachAccount(req, res, async () => {
      const account = req.account
      if (isStaff(account)) return next()

      if (req.method === 'POST') {
        if (opts.idIsHorse) return next() // create a horse: handler stamps creator + auto-links owner
        const horseId = typeof req.body?.horse_id === 'string' ? req.body.horse_id : undefined
        if (horseId && (await accountCanManageHorse(account, horseId))) return next()
        return forbid(res, 'You can only add records to horses you manage.')
      }

      // PUT / DELETE on /:id
      const id = firstSegment(req)
      if (!id) return forbid(res, 'Not allowed.')
      let horseId: string | undefined
      if (opts.idIsHorse) {
        horseId = id
      } else {
        const rec = await db.collection(opts.collection).findById(id)
        horseId = rec?.horse_id ? String(rec.horse_id) : undefined
      }
      if (horseId && (await accountCanManageHorse(account, horseId))) return next()
      return forbid(res, 'You can only modify horses you manage.')
    })
  }
}

/** First non-empty path segment of the mounted sub-path (the :id for /:id routes). */
function firstSegment(req: Request): string | undefined {
  return req.url.split('?')[0].split('/').filter(Boolean)[0]
}

/**
 * Can the account edit this party's profile? Staff always; otherwise the account
 * that manages it — a verified or provisional (pending self-registered) claim on
 * it, or the creator of a self-registered party. Mirror of the web `canManageParty`.
 */
export async function accountCanManageParty(
  account: AccountUser | undefined,
  partyId: string,
): Promise<boolean> {
  if (!account) return false
  if (isStaff(account)) return true
  if (manageablePartyIds(account).includes(partyId)) return true
  const party = await db.collection('parties').findById(partyId)
  return !!party && party.createdByUserId === account.id
}

/**
 * Party write gate. GET is account-aware (so the handler can hide unverified
 * parties from the public). Creation/deletion of register entries stays staff-only
 * — member parties are minted by the claim flow. A member may PUT only their OWN
 * party profile (provisional self-service); the handler strips verify fields so
 * they can't self-promote to the public site.
 */
export function partyScopedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    void attachAccountOptional(req, res, next)
    return
  }
  void attachAccount(req, res, async () => {
    const account = req.account
    if (isStaff(account)) return next()
    if (req.method === 'POST') return forbid(res, 'Staff maintain the party register.')
    if (req.method === 'DELETE') return forbid(res, 'You cannot delete a party.')
    const id = firstSegment(req)
    if (id && (await accountCanManageParty(account, id))) return next()
    return forbid(res, 'You can only edit your own party profile.')
  })
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

/**
 * Gate for /api/issues (published magazine bulletins): GET is public but loads
 * the account optionally (so staff can also see unpublished issues for
 * management); publishing/unpublishing/deleting is staff-only.
 */
export function issuesGate(req: Request, res: Response, next: NextFunction): void {
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
