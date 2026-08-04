// ---------------------------------------------------------------------------
// Team invitations — one-time tokens for the "you've been invited" email link.
//
// An invite row lives in `pendingStaffGrants` (the same collection the
// apply-on-first-sign-in flow already reads), now carrying a token so the
// recipient can be sent a link instead of being told to go and find the site.
//
// SECURITY MODEL
//
// The raw token is generated once, put in the email, and never stored — only
// its SHA-256 hash is, exactly like an OTP. A database leak therefore cannot be
// replayed into an account, and nobody with database access can mint a session.
//
// THE TOKEN IS A CREDENTIAL. It was not always: the flow used to email a link
// that only carried context, then email a SECOND message with a 6-digit code to
// prove the recipient owned the mailbox. That was two emails and four steps to
// join a newsroom you had been invited to, and the code established the same
// fact the link already had — it was sent to that address and nowhere else. So
// `POST /api/invites/:token/accept` now redeems directly (routes/invites.ts).
//
// What holds that up:
//   - 32 bytes of entropy, so the token is neither guessable nor enumerable
//   - SINGLE USE. Redemption deletes every invite row for the address, so a
//     forwarded link is spent and a sibling invite cannot change the role after
//     the fact.
//   - the 14-day expiry below is now a real bound on a live credential, not a
//     cosmetic one — shorten it here if that window ever feels too wide.
//   - redemption requires a user action on the page, never a bare page load;
//     see the note in routes/invites.ts on mail scanners.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import { db } from './db.js'

/** How long an invite link stays valid. */
export const INVITE_TTL_DAYS = 14
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000

/** Minimum gap between re-sends of the same invite. */
export const INVITE_RESEND_COOLDOWN_MS = 60 * 1000

export const COLLECTION = 'pendingStaffGrants'

export interface InviteRow {
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

/** A URL-safe, high-entropy token. 32 bytes — not guessable, not enumerable. */
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

export function isExpired(row: Record<string, any>): boolean {
  // A row with no expiry predates the token flow. Treat it as live — it can
  // still only be redeemed by someone who controls the mailbox.
  if (typeof row.expiresAt !== 'string' || !row.expiresAt) return false
  return Date.now() > new Date(row.expiresAt).getTime()
}

/**
 * Look up an invite by its RAW token. Compares against the stored hash, so the
 * raw value never has to be persisted or logged.
 *
 * Returns null for unknown OR expired tokens — deliberately the same answer, so
 * the endpoint can't be used to probe which tokens ever existed.
 */
export async function findInviteByToken(rawToken: string): Promise<InviteRow | null> {
  if (!rawToken || rawToken.length < 20) return null
  const rows = (await db.collection(COLLECTION).find({
    tokenHash: hashInviteToken(rawToken),
  })) as unknown as InviteRow[]
  const row = rows[0]
  if (!row || isExpired(row)) return null
  return row
}

/** The link that goes in the email. */
export function inviteUrl(webBaseUrl: string, rawToken: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}/invite/${rawToken}`
}

/**
 * Where to send someone AFTER they accept — e.g. straight to the magazine that
 * was shared with them, rather than dumping them on the newsroom home.
 *
 * OPEN-REDIRECT GUARD. This value is stored, emailed, and eventually fed to the
 * router, so it must be a same-origin PATH and nothing else. Rejected:
 *   - absolute URLs      https://evil.test/...   (phishing via our own domain)
 *   - protocol-relative  //evil.test/...         (looks relative, isn't)
 *   - backslash tricks   /\evil.test             (some parsers read as //)
 *   - anything not starting with a single '/'
 * Returns undefined for anything suspicious, so the caller falls back to the
 * default landing page rather than following it.
 */
export function sanitizeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v || v.length > 512) return undefined
  if (!v.startsWith('/')) return undefined
  if (v.startsWith('//') || v.startsWith('/\\')) return undefined
  // No whitespace or control characters — those enable URL/header smuggling.
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return undefined
  return v
}

/**
 * Path to a magazine in the web app — the deep link a share email points at.
 *
 * Was `/newsroom/...`; the web app still redirects that prefix here, so links
 * in already-sent emails keep working.
 */
export function magazinePath(magazineId: string, version: 'v1' | 'v2' = 'v2'): string {
  return version === 'v2'
    ? `/production-system/magazine-v2/${magazineId}`
    : `/production-system/magazine/${magazineId}`
}

/** Turn a relative path into the absolute URL an email can link to. */
export function absoluteUrl(webBaseUrl: string, path: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export function expiresInLabel(): string {
  return `${INVITE_TTL_DAYS} days`
}
