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
import {
  accountCan,
  accountCanAny,
  accountCanOpenModule,
  can,
  canOn,
  scopeFor,
  type AccountUser,
} from './effectiveAccess.js'

export { accountCan, accountCanOpenModule, can, canOn, scopeFor }
export type { AccountUser }

const forbid = (res: Response, msg: string) => res.status(403).json({ error: msg })

/**
 * Run an auth middleware plus its continuation, and ANSWER on failure.
 *
 * Every gate below used to call `void attachAccount(req, res, cb)`. Discarding
 * that promise means a throw anywhere inside — most realistically a transient
 * Mongo failure while `resolveAccount` loads the role definitions — becomes an
 * unhandled rejection. The process-level handler in index.ts logs it and keeps
 * the server alive, which is right, but the REQUEST NEVER GETS A RESPONSE and
 * the client hangs until it times out.
 *
 * `done` is wrapped too: several gates pass an `async () => {...}` as `next`,
 * and `attachAccount` does not await it, so a throw in the continuation was a
 * second, separate way to hang.
 *
 * `headersSent` is checked because the middleware may already have answered 401,
 * or the handler may have streamed part of a response before failing.
 */
function runAuth(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Request,
  res: Response,
  // `unknown`, not `void`: the gates below end branches with `return forbid(...)`,
  // and forbid returns the Response. The value is discarded either way — only
  // whether it is a promise matters.
  done: () => unknown,
): void {
  const fail = (err: unknown): void => {
    console.error('[rbac] auth gate failed:', err instanceof Error ? (err.stack ?? err.message) : err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
  }
  middleware(req, res, () => {
    try {
      const result = done()
      if (result instanceof Promise) void result.catch(fail)
    } catch (err) {
      fail(err)
    }
  }).catch(fail)
}

/** The :id for /:id routes — first segment of the mounted sub-path. */
function firstSegment(req: Request): string | undefined {
  return req.url.split('?')[0].split('/').filter(Boolean)[0]
}

/** POST creates, DELETE deletes, everything else edits. */
function verbForMethod(method: string): 'create' | 'edit' | 'delete' {
  if (method === 'POST') return 'create'
  if (method === 'DELETE') return 'delete'
  return 'edit'
}

/**
 * THE REGISTER RULE: staff are governed by the grid, members by ownership.
 *
 * A staff account acts through its role, so a register write needs that
 * register's verb — until now the four registers were gated on `isAdmin` alone,
 * with `content.draft.create` deciding only whether the sidebar entry appeared.
 * "May start a story draft" was, in effect, who could edit the horse register.
 *
 * A MEMBER holds no role at all, and must keep managing the horse or party they
 * have claimed — gating that on a staff permission would break the claim flow
 * outright. So this returns true for them and the ownership checks below decide.
 */
function staffMay(account: AccountUser | undefined, screen: string, verb: 'create' | 'edit' | 'delete'): boolean {
  if (!isAdmin(account)) return true
  return can(account, screen, verb)
}

// ── The two axes ────────────────────────────────────────────────────────────

/** Holds an admin role. Resolved from `users.roleId`, never from a stored flag. */
export function isAdmin(account: AccountUser | undefined): boolean {
  return !!account && (account.isSuperAdmin || account.isAdmin)
}

/**
 * Platform-wide override: manage every organisation, override ownership, read
 * private records.
 *
 * WAS the `platform.admin` permission, which had exactly two call sites and in
 * both of them meant "superadmin". `role.isSuper` already says that, and says it
 * without a catalogue entry an admin could tick onto a narrow role by mistake.
 */
export function isPlatformAdmin(account: AccountUser | undefined): boolean {
  return account?.isSuperAdmin === true
}

export function canViewTeam(account: AccountUser | undefined): boolean {
  return can(account, 'team', 'view')
}

/** Any write on the roster: invite, change someone's role, remove them. */
export function canManageTeam(account: AccountUser | undefined): boolean {
  return accountCanAny(account, ['team.create', 'team.edit', 'team.delete'])
}

/** DEFINE a role. Strictly more dangerous than deciding who holds one. */
export function canManageRoles(account: AccountUser | undefined): boolean {
  return accountCanAny(account, ['roles.create', 'roles.edit', 'roles.delete'])
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
  opts: { readPublic?: boolean; attachOnRead?: boolean; screen?: string } = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const { readPublic = true, attachOnRead = false, screen } = opts
  return (req, res, next) => {
    if (req.method === 'GET' && readPublic) {
      if (attachOnRead) return runAuth(attachAccountOptional, req, res, next)
      return next()
    }
    runAuth(attachAccount, req, res, () => {
      if (!isAdmin(req.account)) return forbid(res, 'Admin access required.')
      // `screen` narrows "any admin" to "an admin whose role covers this".
      // Without it the gate is the pre-grid behaviour: staff, and that is all.
      if (screen) {
        const verb = verbForMethod(req.method)
        if (!can(req.account, screen, verb)) {
          return forbid(res, `Your role does not allow you to ${verb} these records.`)
        }
      }
      next()
    })
  }
}

/** GET is public; any write requires a signed-in account (admin or not). */
export function authedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return next()
  runAuth(attachAccount, req, res, next)
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
  /** Which register row in the grid governs this collection for STAFF. */
  screen?: string
}) {
  const screen = opts.screen ?? 'horses'
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') {
      if (opts.optionalGet) return runAuth(attachAccountOptional, req, res, next)
      return next()
    }
    runAuth(attachAccount, req, res, async () => {
      const account = req.account
      const verb = verbForMethod(req.method)
      if (!staffMay(account, screen, verb)) {
        return forbid(res, `Your role does not allow you to ${verb} these records.`)
      }
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
  if (req.method === 'GET') return runAuth(attachAccountOptional, req, res, next)

  runAuth(attachAccount, req, res, async () => {
    const account = req.account
    if (!staffMay(account, 'people', verbForMethod(req.method))) {
      return forbid(res, 'Your role does not allow you to change the register.')
    }
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

/**
 * A person's PROFILE, which is a different question from the edges pointing at
 * it: you may edit the person you have claimed an edge to — that is your own
 * profile — or anyone an org you manage fields in the register.
 *
 * Sharing `partyScopedWriteGate` here would compare a person id against party
 * ids and refuse everyone but an admin.
 */
async function accountCanManagePerson(
  account: AccountUser | undefined,
  personId: string,
): Promise<boolean> {
  if (!account) return false
  if (isAdmin(account)) return true
  if (account.parties.some((p) => p.personId === personId)) return true
  const edges = await db.collection(PARTIES).find({ personId })
  return edges.some((e) => e.orgId && canManageOrg(account, String(e.orgId)))
}

export function personScopedWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return runAuth(attachAccountOptional, req, res, next)

  runAuth(attachAccount, req, res, async () => {
    const account = req.account
    if (!staffMay(account, 'people', verbForMethod(req.method))) {
      return forbid(res, 'Your role does not allow you to change the register.')
    }
    if (isAdmin(account)) return next()
    if (req.method === 'POST') return forbid(res, 'Only an admin can add someone to the register.')
    if (req.method === 'DELETE') return forbid(res, 'You cannot remove someone from the register.')

    const id = firstSegment(req)
    if (id && (await accountCanManagePerson(account, id))) return next()
    return forbid(res, 'You can only edit your own profile.')
  })
}

// ── Editorial ───────────────────────────────────────────────────────────────

/**
 * Stories. One verb per method, and SCOPE decides whose records the verb reaches
 * — so `stories.edit` with scope 'own' is what `content.draft.edit_own` used to
 * be, without a second permission id existing to say so.
 */
export function articlesWriteGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') return runAuth(attachAccountOptional, req, res, next)

  runAuth(attachAccount, req, res, async () => {
    const account = req.account!
    if (req.method === 'POST') {
      if (!can(account, 'stories', 'create')) return forbid(res, 'You cannot create stories.')
      return next()
    }

    const verb = req.method === 'DELETE' ? 'delete' : 'edit'
    if (!can(account, 'stories', verb)) {
      return forbid(
        res,
        verb === 'delete' ? 'You cannot delete stories.' : 'You cannot edit stories.',
      )
    }
    // Scope 'all' needs no lookup at all; only 'own' has to read the record.
    if (scopeFor(account, 'stories') === 'all') return next()
    const id = firstSegment(req)
    const doc = id ? await db.collection('articles').findById(id) : null
    if (doc && ownsArticle(doc, account)) return next()
    return forbid(
      res,
      verb === 'delete' ? 'You can only delete your own stories.' : 'You can only edit your own stories.',
    )
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
  if (req.method === 'GET') return runAuth(attachAccountOptional, req, res, next)

  runAuth(attachAccount, req, res, async () => {
    const account = req.account!

    if (req.method === 'POST') {
      // Sub-resources under an existing post are EDITS of it, not creations.
      const segments = req.url.split('?')[0].split('/').filter(Boolean)
      if (segments.length <= 1) {
        if (!can(account, 'blogs', 'create')) return forbid(res, 'You cannot create blog posts.')
        return next()
      }
      return blogWriteGate(req, res, next, segments[0]!, 'edit')
    }

    if (req.method === 'DELETE') {
      const id = firstSegment(req)
      // Deleting a post's MEDIA is an edit of the post; deleting the post is not.
      const isMediaDelete = req.url.split('?')[0].split('/').filter(Boolean).length > 1
      return blogWriteGate(req, res, next, id, isMediaDelete ? 'edit' : 'delete')
    }

    return blogWriteGate(req, res, next, firstSegment(req), 'edit')
  })
}

/**
 * Ownership here is `createdByUserId` and NOTHING else — a blog byline is
 * deliberately free text, so unlike a story it is not an identity claim.
 */
async function blogWriteGate(
  req: Request,
  res: Response,
  next: NextFunction,
  id: string | undefined,
  verb: 'edit' | 'delete',
): Promise<void> {
  const account = req.account!
  if (!can(account, 'blogs', verb)) {
    forbid(res, verb === 'delete' ? 'You cannot delete blog posts.' : 'You cannot edit blog posts.')
    return
  }
  if (scopeFor(account, 'blogs') === 'all') return next()
  const doc = id ? await db.collection('blogs').findById(id) : null
  if (doc && doc.createdByUserId === account.id) return next()
  // A missing doc falls through to 403, not 404: which post ids exist is not
  // something an unauthorised caller needs to learn.
  forbid(res, `You can only ${verb} your own blog posts.`)
}
