// Team invitations - one-time tokens for the "you've been invited" email link.
//
// THE TOKEN IS A CREDENTIAL: 32 bytes of entropy, stored only as a SHA-256 hash,
// single-use (redemption deletes every invite row for the address), and bounded
// by the expiry below.

import crypto from 'crypto'
import { db } from './db.js'
import { INVITES } from './collections.js'

const INVITE_TTL_DAYS = 14
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000

export const INVITE_RESEND_COOLDOWN_MS = 60 * 1000

interface InviteRow {
  _id: string
  email: string
  role: string
  tokenHash?: string
  expiresAt?: string
  invitedBy?: string
  invitedByName?: string
  lastSentAt?: string
  createdAt: string
  [key: string]: unknown
}

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** One-way hash. Only this ever reaches the database. */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function inviteExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + INVITE_TTL_MS).toISOString()
}

export function expiresInLabel(): string {
  return `${INVITE_TTL_DAYS} days`
}

export function isExpired(row: Record<string, any>): boolean {
  if (typeof row.expiresAt !== 'string' || !row.expiresAt) return false
  return Date.now() > new Date(row.expiresAt).getTime()
}

/**
 * Look up an invite by its RAW token, compared against the stored hash.
 *
 * Returns null for unknown OR expired tokens - deliberately the same answer, so
 * the endpoint cannot be used to probe which tokens ever existed.
 */
export async function findInviteByToken(rawToken: string): Promise<InviteRow | null> {
  if (!rawToken || rawToken.length < 20) return null
  const rows = (await db.collection(INVITES).find({
    tokenHash: hashInviteToken(rawToken),
  })) as unknown as InviteRow[]
  const row = rows[0]
  return !row || isExpired(row) ? null : row
}

export function inviteUrl(webBaseUrl: string, rawToken: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}/invite/${rawToken}`
}

/** Whitespace or a C0/DEL control character. Both enable URL/header smuggling. */
function hasWhitespaceOrControl(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c <= 0x20 || c === 0x7f) return true
  }
  return false
}

/**
 * OPEN-REDIRECT GUARD. This value is stored, emailed, and fed to the router, so
 * it must be a same-origin PATH. Rejects absolute URLs, protocol-relative `//`,
 * the `/\` parser trick, and anything carrying whitespace or control characters.
 */
export function sanitizeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v || v.length > 512) return undefined
  if (!v.startsWith('/')) return undefined
  if (v.startsWith('//') || v.startsWith('/\\')) return undefined
  if (hasWhitespaceOrControl(v)) return undefined
  return v
}

export function magazinePath(magazineId: string, version: 'v1' | 'v2' = 'v2'): string {
  return version === 'v2'
    ? `/production-system/magazine-v2/${magazineId}`
    : `/production-system/magazine/${magazineId}`
}

export function absoluteUrl(webBaseUrl: string, path: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}
