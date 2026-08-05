// Route gates.
//
// TWO AXES, NOTHING ELSE:
//   isAdmin(account)            the CATEGORY — holds an admin role
//   accountCan(account, action) the PERMISSION, from that role. isSuper wins.

import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { attachAccount, attachAccountOptional } from './auth.js'
import { PARTIES } from './collections.js'
import type { OrgRole } from './identity.js'
import { writableHorseIds, manageablePartyIds } from './scope.js'
import { accountCan, accountCanAny, accountCanOpenModule, type AccountUser } from './effectiveAccess.js'

export { accountCan, accountCanOpenModule }
export type { AccountUser }

type ContentAction = 'content.draft.create' | 'content.draft.edit_own' | 'content.draft.edit_any'

const forbid = (res: Response, msg: string) => res.status(403).json({ error: msg })

/** The :id for /:id routes — first segment of the mounted sub-path. */
function firstSegment(req: Request): string | undefined {
  return req.url.split('?')[0].split('/').filter(Boolean)[0]
}

// ── The two axes ────────────────────────────────────────────────────────────

/** Holds an admin role. Resolved from `users.roleId`, never from a stored flag. */
export function isAdmin(account: AccountUser | undefined): boolean {
  return !!account && (account.isSuperAdmin || account.isAdmin)
}

/** Platform-wide override. A PERMISSION — a narrow admin role does not have it. */
export function isPlatformAdmin(account: AccountUser | undefined): boolean {
  return accountCan(account, 'platform.admin')
}

export function canViewTeam(account: AccountUser | undefined): boolean {
  return accountCanAny(account, ['team.view', 'team.manage'])
}

export function canManageTeam(account: AccountUser | undefined): boolean {
  return accountCan(account, 'team.manage')
}

/** DEFINE a role. Strictly more dangerous than deciding who holds one. */
export function canManageRoles(account: AccountUser | undefined): boolean {
  return accountCan(account, 'roles.manage')
}

function contentCan(account: AccountUser | undefined, action: ContentAction): boolean {
  return accountCan(account, action)
}

// ── Organisations ───────────────────────────────────────────────────────────

export function orgRoleIn(account: AccountUser | undefined, orgId: string): OrgRole | undefined {
  return account?.orgMembers.find((m) => m.orgId === orgId)?.role
}

export function canManageOrg(account: AccountUser | undefined, orgId: string): boolean {
  if (isPlatformAdmin(account)) return true
  const r = orgRoleIn(account, orgId)
  return r === 'owner' || r === 'manager'
}

export function isOrgOwner(account: AccountUser | undefined, orgId: string): boolean {
  if (isPlatformAdmin(account)) return true
  return orgRoleIn(account, orgId) === 'owner'
}

// ── Gates ───────────────────────────────────────────────────────────────────

/**
 * THE admin-only gate. Was five hand-copied middlewares that had begun to differ
 * in which methods they let through.
 *
 *   adminGate()                        public read, admin write
 *   adminGate({ readPublic: false })   admin only, every method
 *   adminGate({ attachOnRead: true })  public read, handler sees the caller
 */
export function adminGate(
  opts: { readPublic?: boolean; attachOnRead?: boolean } = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const { readPublic = true, attachOnRead = false } = opts
  return (req, res, next) => {
    if (req.method === 'GET' && readPublic) {
      if (attachOnRead) return void attachAccountOptional(req, res, next)
      return next()
    }
    void attachAccount(req, res, () => {
      if (!isAdmin(req.account)) return forbid(res, 'Admin access required.')
      next()
    })
  }
}

/** GET is public; any write requires a signed-in account (admin or not). */
export function authedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next()
  void attachAccount(req, res, next)
}

// ── Horses ──────────────────────────────────────────────────────────────────

/** Admins always; otherwise the creator, or reachable through scope. */
async function accountCanManageHorse(
  account: AccountUser | undefined,
  horseId: string,
): Promise<boolean> {
  if (!account) return false
  if (isAdmin(account)) return true
  const horse = await db.collection('horses').findById(horseId)
  if (!horse) return false
  if (horse.createdByUserId && horse.createdByUserId === account.id) return true
  // WRITE scope excludes horses reached only through an org they are a plain
  // member of.
  return (await writableHorseIds(account)).includes(horseId)
}

/**
 * GET is public (optionally account-aware); writes need an admin or an
 * authorised relationship to the target horse.
 *
 *   idIsHorse   the router's :id IS the horse id (the horses router itself)
 *   otherwise   a child record keyed by `horse_id`
 */
export function horseScopedWriteGate(opts: {
  collection: string
  idIsHorse?: boolean
  optionalGet?: boolean
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') {
      if (opts.optionalGet) return void attachAccountOptional(req, res, next)
      return next()
    }
    void attachAccount(req, res, async () => {
      const account = req.account
      if (isAdmin(account)) return next()

      if (req.method === 'POST') {
        if (opts.idIsHorse) return next()
        const horseId = typeof req.body?.horse_id === 'string' ? req.body.horse_id : undefined
        if (horseId && (await accountCanManageHorse(account, horseId))) return next()
        return forbid(res, 'You can only add records to horses you manage.')
      }

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

      // A body that RE-POINTS the record at another horse must be authorised too.
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

// ── Parties ─────────────────────────────────────────────────────────────────

async function accountCanManageParty(
  account: AccountUser | undefined,
  partyId: string,
): Promise<boolean> {
  if (!account) return false
  if (isAdmin(account)) return true
  if (manageablePartyIds(account).includes(partyId)) return true
  const party = await db.collection(PARTIES).findById(partyId)
  const orgId = party?.orgId ? String(party.orgId) : ''
  return !!orgId && canManageOrg(account, orgId)
}

/**
 * Creating and deleting register entries is admin-only — the register is shared,
 * and someone who needs an identity CLAIMS one rather than minting a rival row.
 * A claimed row is editable by whoever claimed it.
 */
export function partyScopedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return void attachAccountOptional(req, res, next)

  void attachAccount(req, res, async () => {
    const account = req.account
    if (isAdmin(account)) return next()

    const segments = req.url.split('?')[0].split('/').filter(Boolean)
    // /:id/claim and /:id/release enforce their own rules in the handler.
    if (req.method === 'POST' && segments.length > 1) return next()
    if (req.method === 'POST') return forbid(res, 'Only an admin can add a register entry.')
    if (req.method === 'DELETE') return forbid(res, 'You cannot delete a register entry.')

    const id = firstSegment(req)
    if (id && (await accountCanManageParty(account, id))) return next()
    return forbid(res, 'You can only edit a party you have claimed.')
  })
}

// ── Editorial ───────────────────────────────────────────────────────────────

export function articlesWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return void attachAccountOptional(req, res, next)

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
    if (contentCan(account, 'content.draft.edit_any')) return next()
    if (contentCan(account, 'content.draft.edit_own')) {
      const id = firstSegment(req)
      const doc = id ? await db.collection('articles').findById(id) : null
      if (doc && ownsArticle(doc, account)) return next()
    }
    return forbid(res, 'You can only edit your own drafts.')
  })
}

export function ownsArticle(doc: Record<string, unknown>, account: AccountUser | undefined): boolean {
  if (!account) return false
  if (typeof doc.createdByUserId === 'string' && doc.createdByUserId) {
    return doc.createdByUserId === account.id
  }
  return typeof doc.author === 'string' && doc.author === account.name
}

/**
 * GET attaches the account optionally: a post that is not live must 404 for
 * everyone but the people who may see drafts.
 *
 * Ownership is `createdByUserId`, NOT a display-name match the way articles do —
 * a blog byline is deliberately free text, so it is not an identity claim.
 */
export function blogsWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return void attachAccountOptional(req, res, next)

  void attachAccount(req, res, async () => {
    const account = req.account!

    if (req.method === 'POST') {
      // Sub-resources under an existing post are EDITS of it, not creations.
      const segments = req.url.split('?')[0].split('/').filter(Boolean)
      if (segments.length <= 1) {
        if (!accountCan(account, 'blog.create')) return forbid(res, 'You cannot create blog posts.')
        return next()
      }
      return blogEditGate(req, res, next, segments[0]!)
    }

    if (req.method === 'DELETE') {
      const id = firstSegment(req)
      const isMediaDelete = req.url.split('?')[0].split('/').filter(Boolean).length > 1
      if (isMediaDelete) return blogEditGate(req, res, next, id)
      if (!accountCan(account, 'blog.delete')) return forbid(res, 'You cannot delete blog posts.')
      return next()
    }

    return blogEditGate(req, res, next, firstSegment(req))
  })
}

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
    // A missing doc falls through to 403, not 404: which post ids exist is not
    // something an unauthorised caller needs to learn.
  }
  forbid(res, 'You can only edit your own blog posts.')
}
