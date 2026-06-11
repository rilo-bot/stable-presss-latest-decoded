// ---------------------------------------------------------------------------
// Auth primitives — OTP hashing, JWT signing/verification, and a requireAuth
// middleware. Session is a Bearer JWT (no cookies), so CORS stays simple.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

const JWT_SECRET = (process.env.JWT_SECRET ?? '').trim() || 'dev-only-insecure-secret'
const TOKEN_TTL = '7d'

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using an insecure dev secret. Set JWT_SECRET in production.')
}

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

// Augment Express's Request so handlers can read req.user after requireAuth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenClaims
    }
  }
}

/** Reject requests without a valid Bearer token; attaches req.user otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const claims = token ? verifyToken(token) : null
  if (!claims) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  req.user = claims
  next()
}
