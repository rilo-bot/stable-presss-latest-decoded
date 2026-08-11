// OTP hashing, JWT signing, and the two session middlewares.
// Session is a Bearer JWT (no cookies), so CORS stays simple.

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { USERS } from './collections.js'
import { withIdentityDefaults } from './identity.js'
import { resolveAccount, type AccountUser } from './effectiveAccess.js'

const IS_PROD = process.env.PROD === 'true'
const RAW_JWT_SECRET = (process.env.JWT_SECRET ?? '').trim()

// Fail CLOSED in production: a missing secret would fall back to a public
// constant, letting anyone forge an admin token. process.exit, not throw, so the
// crash-guard in index.ts can't keep a broken process alive.
if (!RAW_JWT_SECRET && IS_PROD) {
  console.error('[auth] FATAL: JWT_SECRET is required when PROD=true.')
  process.exit(1)
}
if (!RAW_JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using an insecure dev secret.')
}
const JWT_SECRET = RAW_JWT_SECRET || 'dev-only-insecure-secret'
const TOKEN_TTL = '7d'

/** What `signToken` requires. Verified tokens are read as `VerifiedClaims`. */
interface TokenClaims {
  sub: string
  email: string
  /**
   * Session generation, compared against `users.tokenVersion` on every request.
   *
   * REQUIRED, so forgetting it is a compile error. It was optional once, and the
   * OTP path quietly stopped sending it - which made "sign out everywhere" a
   * PERMANENT lockout, because every freshly-issued token then read as v0 and
   * was revoked on its very next request.
   */
  v: number
}

/** A token off the wire. `v` may be absent on one issued before it existed. */
type VerifiedClaims = Omit<TokenClaims, 'v'> & { v?: number }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      account?: AccountUser
    }
  }
}

export function genOtp(): string {
  return (crypto.randomBytes(4).readUInt32BE(0) % 1_000_000).toString().padStart(6, '0')
}

export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex')
}

export function signToken(claims: TokenClaims): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

function claimsFromHeader(req: Request): VerifiedClaims | null {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as VerifiedClaims
  } catch {
    return null
  }
}

/**
 * Signed out everywhere?
 *
 * Read from the LIVE document rather than the token, so bumping
 * `users.tokenVersion` invalidates every session on its next request. This is
 * the only way to revoke a Bearer JWT — once signed, a token cannot be taken
 * back, so something server-side has to be checked on every request. It costs
 * nothing: the document is already loaded to resolve permissions.
 *
 * There was a `status === 'suspended'` check here too. Soft-deleting the user
 * already revokes instantly (findById treats a tombstoned doc as gone), and it
 * is reversible, so `status` was a second field saying the same thing — the
 * kind of pair that drifts.
 */
function isRevoked(claims: VerifiedClaims, doc: Record<string, unknown>): boolean {
  const current = typeof doc.tokenVersion === 'number' ? doc.tokenVersion : 0
  return (claims.v ?? 0) < current
}

/** Why a session did not resolve. `ok` means `req.account` is now set. */
type LoadResult = 'ok' | 'no-token' | 'no-account' | 'revoked'

const UNAUTHORIZED: Record<Exclude<LoadResult, 'ok'>, string> = {
  'no-token': 'Authentication required',
  'no-account': 'Account not found',
  revoked: 'Your session has ended. Please sign in again.',
}

/**
 * Resolve the caller onto `req.account`, and report WHY if it could not.
 *
 * The shared body of both middlewares below. It never touches the response —
 * deciding what a failure MEANS is the caller's job, and that decision is the
 * only thing the two of them actually disagree about.
 *
 * Idempotent: some routers sit behind an outer gate that already resolved the
 * account, and repeating this would re-run the user lookup plus every query in
 * `resolveAccount`. This guard used to live only in `attachAccount`, so the
 * optional form paid twice whenever it was mounted at both router and route
 * level — which is why `routes/comments` had to avoid re-listing it by hand.
 */
async function loadAccount(req: Request): Promise<LoadResult> {
  if (req.account) return 'ok'

  const claims = claimsFromHeader(req)
  if (!claims) return 'no-token'
  const doc = await db.collection(USERS).findById(claims.sub)
  if (!doc) return 'no-account'
  if (isRevoked(claims, doc)) return 'revoked'

  req.account = await resolveAccount(withIdentityDefaults({ id: doc._id, ...doc }))
  return 'ok'
}

/**
 * An UNEXPECTED failure while resolving a session — not "no token", which is a
 * normal answer, but the database being unreachable underneath `resolveAccount`.
 *
 * Both middlewares are `async`, and Express 4 does not forward a rejected
 * promise from one. Anything that escaped became an unhandled rejection: the
 * process-level handler logged it, the server stayed up, and THE REQUEST NEVER
 * GOT A RESPONSE — the client hung until it timed out. Measured at 15s on
 * `/api/staff` before this existed.
 *
 * Answering 500 here rather than at the call sites is deliberate: `attachAccount`
 * is mounted directly (`router.use(attachAccount)`, or inline per route) in
 * around eighteen routers that never go through rbac.ts's gates, so a wrapper
 * there could only ever fix a fraction of them.
 *
 * Note this cannot fire for an anonymous caller: with no token `loadAccount`
 * returns before it touches the database. Only a signed-in user can reach it,
 * which is why the optional form answers 500 too rather than silently
 * downgrading someone to the logged-out view of their own drafts.
 */
function failClosed(req: Request, res: Response, err: unknown): void {
  console.error(
    `[auth] session resolution failed for ${req.method} ${req.originalUrl}:`,
    err instanceof Error ? (err.stack ?? err.message) : err,
  )
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
}

/**
 * Load the live user and resolve its permissions onto `req.account`, or 401.
 *
 * The only producer of an AccountUser, and therefore the only way a route can
 * reach a permission check. The JWT carries no role data — every authorization
 * input is read live, so a role change takes effect on the next request.
 *
 * The ONLY place in the API that answers 401. Everything else answers 403: this
 * one means "I don't know who you are", the other means "I know, and no".
 */
export async function attachAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const outcome = await loadAccount(req)
    if (outcome === 'ok') return next()
    res.status(401).json({ error: UNAUTHORIZED[outcome] })
  } catch (err) {
    failClosed(req, res, err)
  }
}

/**
 * Like attachAccount, but a missing or revoked session proceeds anonymously.
 *
 * For routes that are PUBLIC but whose answer depends on who is asking — an
 * unpublished blog post 404s for a stranger and renders for its author, from one
 * handler. The outcome is deliberately discarded; that is the whole difference.
 *
 * It takes `_res` because it has no way to reject by construction: there is no
 * path through this function that can send a response.
 */
export async function attachAccountOptional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await loadAccount(req)
    next()
  } catch (err) {
    // "Proceeds anonymously" covers a MISSING or INVALID session, not a database
    // outage. Carrying on here would show a signed-in author the logged-out view
    // of their own drafts, which reads as data loss rather than an incident.
    failClosed(req, res, err)
  }
}
