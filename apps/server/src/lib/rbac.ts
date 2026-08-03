// ---------------------------------------------------------------------------
// Server-side permission enforcement.
//
// NO ROLE SLUG APPEARS IN THIS FILE. Every gate asks what the account may DO,
// never what it IS. The two old role-family tests are gone:
//
//   isStaff(account)  →  canAccessNewsroom(account)   // 'newsroom.access'
//   isAdmin(account)  →  isPlatformAdmin(account)     // 'platform.admin'
//
// They were deleted rather than deprecated so the compiler enumerated every
// call site during the migration — a missed one is an access-control bug that
// no test would necessarily catch. See docs/DYNAMIC-RBAC-PLAN.md §2.
//
// Racing scope (which horses/parties an account may write) is a separate axis
// and still comes from relationships, never from a role. See scope.ts, RBAC.md §6.
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { attachAccount, attachAccountOptional } from './auth.js'
import type { OrgRole } from './identity.js'
import { writableHorseIds, manageablePartyIds } from './scope.js'
import { accountCan, accountCanOpenModule, type AccountUser } from './effectiveAccess.js'
import type { PermissionAction } from './permissionCatalogue.js'

export { accountCan, accountCanOpenModule }
export type { AccountUser }

type ContentAction =
  | 'content.draft.create'
  | 'content.draft.edit_own'
  | 'content.draft.edit_any'

/**
 * May the account use newsroom tooling and see unverified/private records?
 * This is what `isStaff()` meant. It is now a grantable permission, so a role
 * can have data access without the newsroom, or the reverse.
 */
export function canAccessNewsroom(account: AccountUser | undefined): boolean {
  return accountCan(account, 'newsroom.access')
}

/**
 * Platform-wide administrative override — verify any claim, manage any
 * organisation, see everything. This is what `isAdmin()` meant.
 */
export function isPlatformAdmin(account: AccountUser | undefined): boolean {
  return accountCan(account, 'platform.admin')
}

/** The account's role within a given organisation, if any. */
export function orgRoleIn(account: AccountUser | undefined, orgId: string): OrgRole | undefined {
  return account?.orgMemberships.find((m) => m.orgId === orgId)?.orgRole
}

/** May run operational org actions (add members/parties): owner, manager, or a platform admin. */
export function canManageOrg(account: AccountUser | undefined, orgId: string): boolean {
  if (isPlatformAdmin(account)) return true
  const r = orgRoleIn(account, orgId)
  return r === 'org_owner' || r === 'org_manager'
}

/** Owner-only actions (members/roles/billing/delete): the org owner or a platform admin. */
export function isOrgOwner(account: AccountUser | undefined, orgId: string): boolean {
  if (isPlatformAdmin(account)) return true
  return orgRoleIn(account, orgId) === 'org_owner'
}

export function contentCan(account: AccountUser | undefined, action: ContentAction): boolean {
  return accountCan(account, action)
}

/**
 * May DEFINE roles — create them, change what they grant, delete them.
 * Distinct from canManageTeam: deciding what a role can do is a different
 * (and strictly more dangerous) power than deciding who holds it.
 */
export function canManageRoles(account: AccountUser | undefined): boolean {
  return accountCan(account, 'roles.manage')
}

/** May manage the roster — invite people and assign/unassign existing roles. */
export function canManageTeam(account: AccountUser | undefined): boolean {
  return accountCan(account, 'team.manage')
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
    if (!canAccessNewsroom(req.account)) {
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
  if (canAccessNewsroom(account)) return true
  const horse = await db.collection('horses').findById(horseId)
  if (!horse) return false
  if (horse.createdByUserId && horse.createdByUserId === account.id) return true
  const horses = await db.collection('horses').find()
  const links = await db.collection('horsePartyLinks').find()
  // WRITE scope: excludes horses reachable only through an org the account is a
  // plain member of (docs/AUTH-RBAC-REVIEW.md H8).
  return writableHorseIds(account, { horses, links }).includes(horseId)
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
      if (canAccessNewsroom(account)) return next()

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
      if (!horseId || !(await accountCanManageHorse(account, horseId))) {
        return forbid(res, 'You can only modify horses you manage.')
      }

      // A body that RE-POINTS the record at a different horse has to be authorised
      // for the DESTINATION as well. Checking only the pre-image was a horizontal
      // privilege escalation: every handler here does `{ ...req.body }`, so a caller
      // could move a record they legitimately own onto a horse they do not manage.
      // On horsePartyLinks that was severe rather than merely untidy — it re-pointed
      // the caller's OWN party at someone else's horse, and a current party↔horse
      // link is exactly what writableHorseIds() reads, so the move granted write
      // access to that horse and to every child record hanging off it.
      // See docs/AUTH-RBAC-REVIEW.md C1.
      if (!opts.idIsHorse && req.method === 'PUT') {
        const target = typeof req.body?.horse_id === 'string' ? req.body.horse_id : undefined
        if (target && target !== horseId && !(await accountCanManageHorse(account, target))) {
          return forbid(res, 'You cannot move this record to a horse you do not manage.')
        }
      }
      return next()
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
  if (canAccessNewsroom(account)) return true
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
    if (canAccessNewsroom(account)) return next()
    // Members may create a provisional party (e.g. adding a trainer from a horse
    // page); the handler stamps it unverified + createdByUserId so it stays hidden
    // from the public until staff verify it.
    if (req.method === 'POST') {
      if (!account) return forbid(res, 'Sign in to add a party.')
      return next()
    }
    if (req.method === 'DELETE') return forbid(res, 'You cannot delete a party.')
    const id = firstSegment(req)
    if (id && (await accountCanManageParty(account, id))) return next()
    return forbid(res, 'You can only edit your own party profile.')
  })
}

/**
 * Editorial gate for /api/articles: create / edit_own / edit_any.
 *
 * GET attaches the account OPTIONALLY rather than being flatly public. It used
 * to `return next()` with no account at all, which meant the handler had no way
 * to tell a reader from an editor and so returned the entire collection —
 * drafts, submitted copy and editors' notes — to anyone who asked. The handler
 * decides visibility now (`canSeePipeline`), and it needs an account to do it.
 */
export function articlesWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    void attachAccountOptional(req, res, next)
    return
  }
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
    // PUT — edit_any wins; otherwise edit_own requires ownership.
    if (contentCan(account, 'content.draft.edit_any')) return next()
    if (contentCan(account, 'content.draft.edit_own')) {
      const id = firstSegment(req)
      const doc = id ? await db.collection('articles').findById(id) : null
      if (doc && ownsArticle(doc, account)) return next()
    }
    return forbid(res, 'You can only edit your own drafts.')
  })
}

/**
 * Does this account own the story?
 *
 * `createdByUserId` is the real answer and is stamped on every story created
 * since the field landed. The `author` fallback is for stories that predate it:
 * ownership used to be `doc.author === account.displayName`, which breaks the
 * moment two staff share a name or one is renamed, and the byline is free text
 * for editors — it was never an identity claim. Blogs already do it this way.
 */
export function ownsArticle(doc: Record<string, unknown>, account: AccountUser | undefined): boolean {
  if (!account) return false
  if (typeof doc.createdByUserId === 'string' && doc.createdByUserId) {
    return doc.createdByUserId === account.id
  }
  return typeof doc.author === 'string' && doc.author === account.displayName
}

/**
 * Gate for /api/blogs.
 *
 * GET attaches the account OPTIONALLY rather than being flatly public: the
 * handler needs to know whether the caller may see drafts, and a post that is
 * not live must 404 for everyone else. `articlesWriteGate` can skip that only
 * because the articles list leaks unpublished stories to the public already —
 * not a precedent worth copying.
 *
 * Ownership is by `createdByUserId`, NOT by matching a display name the way
 * articles do (`doc.author === account.displayName`). That comparison breaks
 * the moment two staff share a name or one renames themselves, and on a blog
 * the byline is deliberately free text — an author may publish under a pen name
 * — so it is not an identity claim at all.
 */
export function blogsWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    void attachAccountOptional(req, res, next)
    return
  }
  void attachAccount(req, res, async () => {
    const account = req.account!

    if (req.method === 'POST') {
      // Sub-resources under an existing post (media registration, publish) are
      // edits of that post, not creations — they must not pass on `blog.create`.
      const segments = req.url.split('?')[0].split('/').filter(Boolean)
      if (segments.length <= 1) {
        if (!accountCan(account, 'blog.create')) return forbid(res, 'You cannot create blog posts.')
        return next()
      }
      return blogEditGate(req, res, next, segments[0]!)
    }

    if (req.method === 'DELETE') {
      const id = firstSegment(req)
      // DELETE /:id/media/:mediaId edits the post; DELETE /:id removes it.
      const isMediaDelete = req.url.split('?')[0].split('/').filter(Boolean).length > 1
      if (isMediaDelete) return blogEditGate(req, res, next, id)
      if (!accountCan(account, 'blog.delete')) return forbid(res, 'You cannot delete blog posts.')
      return next()
    }

    // PUT / PATCH
    return blogEditGate(req, res, next, firstSegment(req))
  })
}

/** May the caller edit this specific post? edit_any wins; else they must own it. */
async function blogEditGate(
  req: Request,
  res: Response,
  next: NextFunction,
  id: string | undefined,
): Promise<void> {
  const account = req.account!
  if (accountCan(account, 'blog.edit_any')) return next()
  if (accountCan(account, 'blog.edit_own')) {
    const doc = id ? await db.collection('blogs').findById(id) : null
    if (doc && doc.createdByUserId === account.id) return next()
    // A missing doc falls through to 403 rather than 404 on purpose: telling an
    // unauthorised caller which post ids exist is a probe they don't need.
  }
  forbid(res, 'You can only edit your own blog posts.')
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
    if (!canAccessNewsroom(req.account)) {
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
    if (!canAccessNewsroom(req.account)) {
      forbid(res, 'Staff access required.')
      return
    }
    next()
  })
}
