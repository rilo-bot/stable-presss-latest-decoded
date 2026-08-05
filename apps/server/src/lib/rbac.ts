// ---------------------------------------------------------------------------
// Route gates and the category test.
//
// TWO CATEGORIES, ONE AXIS EACH:
//
//   isAdmin(account)              — the CATEGORY. Holds an `admins` row, so they
//                                   may enter the admin app at all.
//   accountCan(account, action)   — the PERMISSION, from the role in that row.
//                                   Superadmin (`isSuper`) short-circuits to true.
//
// Nothing else. `isAdminAccount` (a second name for the first) and the five
// hand-copied "staff only" middlewares are gone: one `adminGate` replaces them,
// so a change to what admin-only means happens in one place.
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { attachAccount, attachAccountOptional } from './auth.js'
import type { OrgRole } from './identity.js'
import { writableHorseIds, manageablePartyIds } from './scope.js'
import { accountCan, accountCanAny, accountCanOpenModule, type AccountUser } from './effectiveAccess.js'

export { accountCan, accountCanOpenModule }
export type { AccountUser }

type ContentAction =
  | 'content.draft.create'
  | 'content.draft.edit_own'
  | 'content.draft.edit_any'

/**
 * THE category test: is this an admin account?
 *
 * Reads the resolved `isAdmin`, which `resolveAccount` derives from the `admins`
 * row — never the stored `users.isAdmin` flag. A superadmin is an admin by
 * definition, but the check is spelled out because a superadmin whose role row is
 * missing must still get in.
 */
export function isAdmin(account: AccountUser | undefined): boolean {
  if (!account) return false
  return account.isSuperAdmin || account.isAdmin
}

/**
 * Platform-wide administrative override — manage any organisation, see
 * everything, override ownership. A PERMISSION, not a category: an admin holding
 * a narrow role does not have it.
 */
export function isPlatformAdmin(account: AccountUser | undefined): boolean {
  return accountCan(account, 'platform.admin')
}

/** May the account READ the team roster? Writing it needs `team.manage`. */
export function canViewTeam(account: AccountUser | undefined): boolean {
  return accountCanAny(account, ['team.view', 'team.manage'])
}

/** The account's role within a given organisation, if any. */
export function orgRoleIn(account: AccountUser | undefined, orgId: string): OrgRole | undefined {
  return account?.orgMembers.find((m) => m.orgId === orgId)?.role
}

/** May run operational org actions (add members/parties): owner, manager, or a platform admin. */
export function canManageOrg(account: AccountUser | undefined, orgId: string): boolean {
  if (isPlatformAdmin(account)) return true
  const r = orgRoleIn(account, orgId)
  return r === 'owner' || r === 'manager'
}

/** Owner-only actions (members/roles/delete): the org owner or a platform admin. */
export function isOrgOwner(account: AccountUser | undefined, orgId: string): boolean {
  if (isPlatformAdmin(account)) return true
  return orgRoleIn(account, orgId) === 'owner'
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

/** First non-empty path segment of the mounted sub-path (the :id for /:id routes). */
function firstSegment(req: Request): string | undefined {
  return req.url.split('?')[0].split('/').filter(Boolean)[0]
}

// ── Gates ───────────────────────────────────────────────────────────────────

/**
 * THE admin-only gate. Was five hand-copied middlewares (`staffWriteGate`,
 * `reportsGate`, `issuesGate`, and inline blocks in two agent routers) that had
 * already begun to differ in which methods they let through.
 *
 *   readPublic     GET bypasses the gate entirely (default true).
 *   attachOnRead   attach the account on GET without requiring one, so the
 *                  handler can widen the response for an admin.
 *
 * `adminGate()` with no options is "public read, admin write".
 * `adminGate({ readPublic: false })` is "admin only, every method".
 */
export function adminGate(
  opts: { readPublic?: boolean; attachOnRead?: boolean } = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const { readPublic = true, attachOnRead = false } = opts
  return (req, res, next) => {
    if (req.method === 'GET' && readPublic) {
      if (attachOnRead) {
        void attachAccountOptional(req, res, next)
        return
      }
      next()
      return
    }
    void attachAccount(req, res, () => {
      if (!isAdmin(req.account)) {
        forbid(res, 'Admin access required.')
        return
      }
      next()
    })
  }
}

/** GET is public; any write requires a signed-in account (admin or not). */
export function authedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next()
  void attachAccount(req, res, next)
}

/**
 * Can the account write this horse's data? Admins always; otherwise the creator,
 * or a claimed party row pointing at the horse, or an org they own or manage.
 * Read live so a claim change takes effect without re-issuing a token.
 */
export async function accountCanManageHorse(
  account: AccountUser | undefined,
  horseId: string,
): Promise<boolean> {
  if (!account) return false
  if (isAdmin(account)) return true
  const horse = await db.collection('horses').findById(horseId)
  if (!horse) return false
  if (horse.createdByUserId && horse.createdByUserId === account.id) return true
  // WRITE scope: excludes horses reachable only through an org the account is a
  // plain member of.
  return (await writableHorseIds(account)).includes(horseId)
}

/**
 * Horse-scoped write gate: GET is public (optionally account-aware so the
 * handler can filter private rows); writes require an admin OR an authorised
 * relationship to the target horse.
 *   - `idIsHorse`   the router's :id IS the horse id (the horses router itself);
 *                   POST is allowed for any signed-in account (the handler stamps
 *                   creator + auto-creates their owner party row).
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
      if (isAdmin(account)) return next()

      if (req.method === 'POST') {
        if (opts.idIsHorse) return next() // create a horse: handler stamps creator + owner party
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

/**
 * Can the account edit this party row? Admins always; otherwise the account that
 * claimed it (`userId`), or an org they own or manage.
 */
export async function accountCanManageParty(
  account: AccountUser | undefined,
  partyId: string,
): Promise<boolean> {
  if (!account) return false
  if (isAdmin(account)) return true
  if (manageablePartyIds(account).includes(partyId)) return true
  const party = await db.collection('parties').findById(partyId)
  if (!party) return false
  const orgId = party.orgId ? String(party.orgId) : ''
  return !!orgId && canManageOrg(account, orgId)
}

/**
 * Party register gate. GET is account-aware (unclaimed register rows are public;
 * the handler decides what else the caller sees). Creating a register entry and
 * deleting one stay admin-only. A signed-in user may PUT a row they have claimed,
 * and claiming happens through POST /:id/claim, which carries its own rules.
 */
export function partyScopedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    void attachAccountOptional(req, res, next)
    return
  }
  void attachAccount(req, res, async () => {
    const account = req.account
    if (isAdmin(account)) return next()

    const segments = req.url.split('?')[0].split('/').filter(Boolean)
    // POST /:id/claim and POST /:id/release are claim operations, not register
    // writes — the handler enforces "is it already taken", which is the real rule.
    if (req.method === 'POST' && segments.length > 1) return next()
    // Creating a register entry is admin-only: the register is a shared record,
    // and a user who needs an identity claims one rather than minting a rival row.
    if (req.method === 'POST') return forbid(res, 'Only an admin can add a register entry.')
    if (req.method === 'DELETE') return forbid(res, 'You cannot delete a register entry.')

    const id = firstSegment(req)
    if (id && (await accountCanManageParty(account, id))) return next()
    return forbid(res, 'You can only edit a party you have claimed.')
  })
}

/** Editorial gate for /api/articles: create / edit_own / edit_any. */
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

/** Does this account own the story? */
export function ownsArticle(doc: Record<string, unknown>, account: AccountUser | undefined): boolean {
  if (!account) return false
  if (typeof doc.createdByUserId === 'string' && doc.createdByUserId) {
    return doc.createdByUserId === account.id
  }
  return typeof doc.author === 'string' && doc.author === account.name
}

/**
 * Gate for /api/blogs.
 *
 * GET attaches the account OPTIONALLY rather than being flatly public: the
 * handler needs to know whether the caller may see drafts, and a post that is
 * not live must 404 for everyone else.
 *
 * Ownership is by `createdByUserId`, NOT by matching a display name the way
 * articles do (`doc.author === account.name`). That comparison breaks the moment
 * two people share a name or one renames themselves, and on a blog the byline is
 * deliberately free text — an author may publish under a pen name — so it is not
 * an identity claim at all.
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
