// ---------------------------------------------------------------------------
// Auth primitives — OTP hashing, JWT signing/verification, and a requireAuth
// middleware. Session is a Bearer JWT (no cookies), so CORS stays simple.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { db } from './db.js'
import { withIdentityDefaults, type AccountUser } from './identity.js'

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
  role: string
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
 * Like requireAuth, but also loads the LIVE user record and attaches the
 * normalized account to req.account. Permission checks read roles/claims/tier
 * from here so changes take effect without re-issuing a token (the JWT only
 * carries {sub,email,role}). Rejects with 401 if the token or user is invalid.
 */
export async function attachAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  req.user = claims
  req.account = withIdentityDefaults({ id: doc._id, ...doc })
  next()
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
    if (doc) {
      req.user = claims
      req.account = withIdentityDefaults({ id: doc._id, ...doc })
    }
  }
  next()
}
