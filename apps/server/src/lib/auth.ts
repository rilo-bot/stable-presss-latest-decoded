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

/**
 * Load the live user and resolve its permissions onto `req.account`.
 *
 * The only producer of an AccountUser, and therefore the only way a route can
 * reach a permission check. The JWT carries no role data — every authorization
 * input is read live, so a role change takes effect on the next request.
 */
export async function attachAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Idempotent: some routers sit behind an outer gate that already resolved it.
  if (req.account) return next()

  const claims = claimsFromHeader(req)
  if (!claims) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  const doc = await db.collection(USERS).findById(claims.sub)
  if (!doc) {
    res.status(401).json({ error: 'Account not found' })
    return
  }
  if (isRevoked(claims, doc)) {
    res.status(401).json({ error: 'Your session has ended. Please sign in again.' })
    return
  }
  req.account = await resolveAccount(withIdentityDefaults({ id: doc._id, ...doc }))
  next()
}

/** Like attachAccount, but a missing or revoked session proceeds anonymously. */
export async function attachAccountOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const claims = claimsFromHeader(req)
  if (claims) {
    const doc = await db.collection(USERS).findById(claims.sub)
    if (doc && !isRevoked(claims, doc)) {
      req.account = await resolveAccount(withIdentityDefaults({ id: doc._id, ...doc }))
    }
  }
  next()
}
