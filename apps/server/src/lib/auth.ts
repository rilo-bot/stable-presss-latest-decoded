// ---------------------------------------------------------------------------
// Auth primitives — OTP hashing, JWT signing/verification, and a requireAuth
// middleware. Session is a Bearer JWT (no cookies), so CORS stays simple.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { withIdentityDefaults } from './identity.js'
import { resolveAccount, type AccountUser } from './effectiveAccess.js'

const IS_PROD = process.env.PROD === 'true'
const RAW_JWT_SECRET = (process.env.JWT_SECRET ?? '').trim()

// Fail CLOSED in production: a missing secret would otherwise fall back to a
// public constant, letting anyone forge an admin token. process.exit (not throw)
// so the crash-guard in index.ts can't keep a broken, insecure process alive.
if (!RAW_JWT_SECRET && IS_PROD) {
  console.error('[auth] FATAL: JWT_SECRET is required when PROD=true. Refusing to start with an insecure secret.')
  process.exit(1)
}
if (!RAW_JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using an insecure dev secret. Set JWT_SECRET in production.')
}
const JWT_SECRET = RAW_JWT_SECRET || 'dev-only-insecure-secret'
const TOKEN_TTL = '7d'

export interface TokenClaims {
  sub: string // user id
  email: string
  /**
   * Session generation. Compared against `users.tokenVersion` on every
   * authenticated request, so bumping that field invalidates every token already
   * issued for the account — the only way to sign someone out before the 7-day
   * expiry (docs/AUTH-RBAC-REVIEW.md L5).
   *
   * Optional: tokens issued before this existed carry no `v`, and are treated as
   * version 0 so nobody is logged out by the deploy itself.
   */
  v?: number
}

/** Cryptographically-random 6-digit code, zero-padded. */
export function genOtp(): string {
  // 0–999999 from 4 random bytes, padded to 6 digits.
  const n = crypto.randomBytes(4).readUInt32BE(0) % 1_000_000
  return n.toString().padStart(6, '0')
}

/** One-way hash of an OTP — codes are never stored in plaintext. */
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex')
}

export function signToken(claims: TokenClaims): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string): TokenClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenClaims
  } catch {
    return null
  }
}

// Augment Express's Request so handlers can read req.user (token claims) and
// req.account (the live, normalized user record) after the auth middleware.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenClaims
      account?: AccountUser
    }
  }
}

/** Extract a valid Bearer token's claims, or null. */
function claimsFromHeader(req: Request): TokenClaims | null {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return token ? verifyToken(token) : null
}

/** Reject requests without a valid Bearer token; attaches req.user otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const claims = claimsFromHeader(req)
  if (!claims) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  req.user = claims
  next()
}

/**
 * Attach req.user if a valid token is present, but never reject. Lets a route
 * serve anonymous and authenticated callers differently (e.g. hide drafts).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const claims = claimsFromHeader(req)
  if (claims) req.user = claims
  next()
}

/**
 * Like requireAuth, but also loads the LIVE user record and RESOLVES its role
 * slugs into a permission set, attaching the result to req.account.
 *
 * This is the only producer of an AccountUser, and therefore the only way a
 * route can reach a permission check. Roles come from the in-process registry
 * cache, so resolution adds no database round trip. The JWT carries only
 * {sub,email} — every authorization input is read live, so a role edit takes
 * effect on the next request rather than the next login.
 *
 * Rejects with 401 if the token or user is invalid.
 */
export async function attachAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Idempotent: some routers sit behind an outer gate that already resolved the
  // account (see horseScopedWriteGate). Re-resolving would cost a second user
  // lookup on every write for no benefit.
  if (req.account) {
    next()
    return
  }
  const claims = claimsFromHeader(req)
  if (!claims) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  const doc = await db.collection('users').findById(claims.sub)
  if (!doc) {
    res.status(401).json({ error: 'Account not found' })
    return
  }
  if (isRevoked(claims, doc)) {
    res.status(401).json({ error: 'Your session has ended. Please sign in again.' })
    return
  }
  req.user = claims
  req.account = await resolveAccount(withIdentityDefaults({ id: doc._id, ...doc }))
  next()
}

/**
 * Has this token been invalidated by a session bump, or the account suspended?
 *
 * Both are read from the LIVE user document rather than the token, so revocation
 * takes effect on the next request instead of the next login — the same reason the
 * JWT carries no permission data.
 */
function isRevoked(claims: TokenClaims, doc: Record<string, unknown>): boolean {
  if (doc.status === 'suspended') return true
  const current = typeof doc.tokenVersion === 'number' ? doc.tokenVersion : 0
  return (claims.v ?? 0) < current
}

/**
 * Like attachAccount but never rejects: loads + attaches req.account when a valid
 * token resolves to a real user, otherwise proceeds anonymously. For routes that
 * serve everyone but tailor the response to the caller (e.g. hide private records).
 */
export async function attachAccountOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const claims = claimsFromHeader(req)
  if (claims) {
    const doc = await db.collection('users').findById(claims.sub)
    // A revoked or suspended session proceeds ANONYMOUSLY here rather than 401-ing —
    // that is this middleware's contract — but it must not resolve to an account.
    if (doc && !isRevoked(claims, doc)) {
      req.user = claims
      req.account = await resolveAccount(withIdentityDefaults({ id: doc._id, ...doc }))
    }
  }
  next()
}
