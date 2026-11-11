// ---------------------------------------------------------------------------
// Email delivery.
//
// Provider precedence: Resend (primary) → SMTP (fallback) → dev console.
//
// Resend is the intended provider (RESEND_API_KEY + RESEND_FROM_EMAIL). If Resend
// is unconfigured, OR a Resend send fails at runtime, we fall back to a plain SMTP
// server (SMTP_HOST/PORT/USER/PASS, from SMTP_FROM or the Resend from) so mail
// still goes out. With neither configured we DON'T send: the payload is logged and
// the caller surfaces the reason.
//
// Every template is built by ./emailTemplates.ts and goes through its one
// `layout()`, so a second email can never drift from the first; every send
// returns { delivered } rather than throwing on a non-configured provider —
// callers decide whether undelivered is fatal.
// ---------------------------------------------------------------------------

import { Resend } from 'resend'
import nodemailer, { type Transporter } from 'nodemailer'
import {
  otpEmail,
  inviteEmail,
  roleGrantedEmail,
  magazineShareEmail,
  magazineSubmittedEmail,
  magazineReviewedEmail,
  magazinePageRemovedEmail,
  type InviteEmail,
} from './emailTemplates.js'

const RESEND_API_KEY = (process.env.RESEND_API_KEY ?? '').trim()
const RESEND_FROM = (process.env.RESEND_FROM_EMAIL ?? '').trim()

// SMTP fallback (used if Resend is unconfigured or a Resend send fails).
const SMTP_HOST = (process.env.SMTP_HOST ?? '').trim()
const SMTP_PORT = Number(process.env.SMTP_PORT ?? '') || 587
const SMTP_USER = (process.env.SMTP_USER ?? '').trim()
const SMTP_PASS = (process.env.SMTP_PASS ?? '').trim()
// true → implicit TLS (port 465); false → STARTTLS (587). Defaults to true on 465.
const SMTP_SECURE = /^(1|true|yes|on)$/i.test((process.env.SMTP_SECURE ?? '').trim()) || SMTP_PORT === 465
const SMTP_FROM = (process.env.SMTP_FROM ?? RESEND_FROM).trim()

const hasResend = !!RESEND_API_KEY && !!RESEND_FROM
const hasSmtp = !!SMTP_HOST && !!SMTP_FROM

/** True when at least one provider (Resend or SMTP) can actually send. */
export function isEmailConfigured(): boolean {
  return hasResend || hasSmtp
}

let _resend: Resend | null = null
function resendClient(): Resend {
  if (!_resend) _resend = new Resend(RESEND_API_KEY)
  return _resend
}

let _smtp: Transporter | null = null
function smtpTransport(): Transporter {
  if (!_smtp) {
    _smtp = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  }
  return _smtp
}

interface Message {
  to: string
  subject: string
  text: string
  html: string
  /** Logged on success, so the console says which template went out. */
  kind: string
}

/**
 * A subject line is a MAIL HEADER, and several templates interpolate user-controlled
 * text into it (a magazine title, a person's display name). Titles are only trimmed
 * on the way in, so a newline can reach here — and a newline in a header is how header
 * injection works. Both transports happen to encode subjects safely today, but that is
 * their choice, not ours: strip the control characters once, centrally, so no template
 * has to remember. Also capped, because some providers reject very long subjects.
 */
function headerSafe(subject: string): string {
  // Control characters only. The class must NOT contain a space-to-hyphen range or
  // a bare hyphen, or it would rewrite ordinary punctuation in a magazine title.
  // eslint-disable-next-line no-control-regex
  return subject.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 200)
}

/**
 * Dispatch: Resend first, then SMTP. Throws on a genuine provider failure (after
 * the fallback is exhausted); returns { delivered: false } only when NOTHING is
 * configured at all.
 */
async function send({ to, subject: rawSubject, text, html, kind }: Message): Promise<{ delivered: boolean }> {
  const subject = headerSafe(rawSubject)
  // Primary: Resend.
  if (hasResend) {
    try {
      // The SDK reports API errors in the response body rather than throwing, so
      // an unchecked call silently "succeeds" on a rejected send.
      const { error } = await resendClient().emails.send({ from: RESEND_FROM, to, subject, text, html })
      if (error) throw new Error(`Resend refused the message: ${error.message ?? String(error)}`)
      console.info(`[email] ${kind} sent to ${to} via resend`)
      return { delivered: true }
    } catch (err) {
      // Resend failed. Fall back to SMTP if we have it; otherwise rethrow so the
      // caller can surface the real reason (never swallow it).
      if (!hasSmtp) throw err
      console.warn(`[email] resend failed (${err instanceof Error ? err.message : String(err)}) — falling back to SMTP`)
    }
  }

  // Fallback (or primary, if Resend is unconfigured): SMTP.
  if (hasSmtp) {
    await smtpTransport().sendMail({ from: SMTP_FROM, to, subject, text, html })
    console.info(`[email] ${kind} sent to ${to} via smtp`)
    return { delivered: true }
  }

  console.info(`[email] (dev) ${kind} → ${to} — no provider configured, not emailing`)
  return { delivered: false }
}

// ── Templates ───────────────────────────────────────────────────────────────
//
// Every message is built in ./emailTemplates.ts — a pure module with no provider
// and no env — so the markup can be previewed or tested without sending anything.
// The functions below only pick the template and hand it to `send()`.

export type { InviteEmail }

// ── OTP ─────────────────────────────────────────────────────────────────────

export async function sendOtpEmail(to: string, code: string): Promise<{ delivered: boolean }> {
  if (!isEmailConfigured()) {
    console.info(`[email] (dev) OTP for ${to}: ${code} — no provider configured, not emailing`)
    return { delivered: false }
  }
  return send({ to, kind: 'OTP', ...otpEmail(code) })
}

// ── Team invite ─────────────────────────────────────────────────────────────

/** Invite for someone with NO account yet — the link starts their signup. */
export async function sendInviteEmail(invite: InviteEmail): Promise<{ delivered: boolean }> {
  return send({ to: invite.to, kind: 'team invite', ...inviteEmail(invite) })
}

// ── Magazine share ──────────────────────────────────────────────────────────

/**
 * "X shared «Title» with you." The link is a deep link to the magazine itself;
 * if they aren't signed in, the app captures it as `?next=` and returns them
 * there after sign-in rather than dropping them on the newsroom home.
 */
export async function sendMagazineShareEmail(opts: {
  to: string
  magazineTitle: string
  sharedBy: string
  magazineUrl: string
  /** 'all' or a count of specific pages, already phrased for a human. */
  scope: string
}): Promise<{ delivered: boolean }> {
  return send({ to: opts.to, kind: 'magazine share', ...magazineShareEmail(opts) })
}

// ── Magazine submissions & review ───────────────────────────────────────────
//
// Three notifications around the per-page review flow. The state change is
// ALREADY committed when these run, so they report delivery rather than gating
// anything, and they NAME the pages (via `pageNumbersLabel`) instead of counting
// them — "pages 4, 5 and 6" is something the recipient can act on without
// opening the magazine first.

/** To the OWNER: a collaborator has sent pages for review. */
export async function sendMagazineSubmittedEmail(opts: {
  to: string
  magazineTitle: string
  submittedBy: string
  magazineUrl: string
  /** Already phrased, e.g. "pages 4, 5 and 6". */
  pages: string
  note?: string
}): Promise<{ delivered: boolean }> {
  return send({ to: opts.to, kind: 'magazine submitted', ...magazineSubmittedEmail(opts) })
}

/** To the COLLABORATOR: the owner has approved, or sent pages back. */
export async function sendMagazineReviewedEmail(opts: {
  to: string
  magazineTitle: string
  reviewedBy: string
  magazineUrl: string
  pages: string
  decision: 'approved' | 'changes-requested'
  note?: string
}): Promise<{ delivered: boolean }> {
  const kind = `magazine ${opts.decision === 'approved' ? 'approved' : 'changes requested'}`
  return send({ to: opts.to, kind, ...magazineReviewedEmail(opts) })
}

/**
 * To the COLLABORATOR: a page they had submitted was deleted by the owner.
 *
 * Sent because the alternative is silence — their work simply vanishes and the
 * next thing they see is a magazine with one fewer page and no explanation.
 */
export async function sendMagazinePageRemovedEmail(opts: {
  to: string
  magazineTitle: string
  removedBy: string
  magazineUrl: string
  pages: string
}): Promise<{ delivered: boolean }> {
  return send({ to: opts.to, kind: 'magazine page removed', ...magazinePageRemovedEmail(opts) })
}

/**
 * Notification for someone who ALREADY has an account. There is no token here —
 * the role is applied the moment it is granted, so a one-time link would be
 * meaningless. This just tells them, and points at the newsroom.
 */
export async function sendRoleGrantedEmail(opts: {
  to: string
  roleLabel: string
  invitedBy: string
  newsroomUrl: string
}): Promise<{ delivered: boolean }> {
  return send({ to: opts.to, kind: 'role granted', ...roleGrantedEmail(opts) })
}
