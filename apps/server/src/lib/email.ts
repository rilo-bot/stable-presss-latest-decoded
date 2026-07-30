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
// Every template goes through `layout()` so a second email can never drift from
// the first, and every send returns { delivered } rather than throwing on a
// non-configured provider — callers decide whether undelivered is fatal.
// ---------------------------------------------------------------------------

import { Resend } from 'resend'
import nodemailer, { type Transporter } from 'nodemailer'

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
 * Dispatch: Resend first, then SMTP. Throws on a genuine provider failure (after
 * the fallback is exhausted); returns { delivered: false } only when NOTHING is
 * configured at all.
 */
async function send({ to, subject, text, html, kind }: Message): Promise<{ delivered: boolean }> {
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

// ── Shared layout ───────────────────────────────────────────────────────────

const BRAND = '#0a2342'
const MUTED = '#41506b'
const FAINT = '#9aa3b2'

function layout(opts: { heading: string; body: string; footer?: string }): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:480px;margin:0 auto;padding:32px 24px;color:${BRAND}">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${FAINT};margin:0 0 8px">Stable Press</p>
    <h1 style="font-size:22px;margin:0 0 16px">${opts.heading}</h1>
    ${opts.body}
    <p style="font-size:12px;line-height:1.6;color:${FAINT};margin:24px 0 0">
      ${opts.footer ?? "If you didn't expect this email, you can safely ignore it."}
    </p>
  </div>`
}

/** Escape untrusted text before it goes into an HTML template. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;padding:13px 26px;border-radius:6px">${esc(label)}</a>`
}

// ── OTP ─────────────────────────────────────────────────────────────────────

export async function sendOtpEmail(to: string, code: string): Promise<{ delivered: boolean }> {
  if (!isEmailConfigured()) {
    console.info(`[email] (dev) OTP for ${to}: ${code} — no provider configured, not emailing`)
    return { delivered: false }
  }
  return send({
    to,
    kind: 'OTP',
    subject: 'Your Stable Press verification code',
    text: `Your Stable Press verification code is ${code}. It expires shortly and can only be used once.`,
    html: layout({
      heading: 'Your verification code',
      body: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 24px">
          Enter this code to continue signing in. It expires shortly and can only be used once.
        </p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:10px;font-family:monospace;background:#f4f6fa;border:1px solid #e2e7f0;border-radius:8px;padding:18px;text-align:center;color:${BRAND}">
          ${esc(code)}
        </div>`,
      footer: "If you didn't request this, you can safely ignore this email.",
    }),
  })
}

// ── Team invite ─────────────────────────────────────────────────────────────

export interface InviteEmail {
  to: string
  /** Role label as shown in the UI, e.g. "Editor". */
  roleLabel: string
  /** Who sent it — display name or email. */
  invitedBy: string
  /** Absolute accept URL carrying the one-time token. */
  acceptUrl: string
  /** Human expiry, e.g. "14 days". */
  expiresIn: string
}

/** Invite for someone with NO account yet — the link starts their signup. */
export async function sendInviteEmail(invite: InviteEmail): Promise<{ delivered: boolean }> {
  const { to, roleLabel, invitedBy, acceptUrl, expiresIn } = invite
  return send({
    to,
    kind: 'team invite',
    subject: `${invitedBy} invited you to Stable Press`,
    text:
      `${invitedBy} has invited you to join Stable Press as ${roleLabel}.\n\n` +
      `Accept the invitation: ${acceptUrl}\n\n` +
      `This link expires in ${expiresIn} and can only be used once.`,
    html: layout({
      heading: `You've been invited as ${esc(roleLabel)}`,
      body: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 24px">
          <strong>${esc(invitedBy)}</strong> has invited you to join the Stable Press newsroom as
          <strong>${esc(roleLabel)}</strong>. Accept below to set up your account — it takes about a minute.
        </p>
        <p style="margin:0 0 24px">${button(acceptUrl, 'Accept invitation')}</p>
        <p style="font-size:12px;line-height:1.6;color:${FAINT};margin:0">
          Or paste this link into your browser:<br>
          <span style="word-break:break-all;color:${MUTED}">${esc(acceptUrl)}</span>
        </p>`,
      footer: `This invitation expires in ${esc(expiresIn)} and can only be used once. If you weren't expecting it, you can safely ignore this email.`,
    }),
  })
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
  const { to, magazineTitle, sharedBy, magazineUrl, scope } = opts
  return send({
    to,
    kind: 'magazine share',
    subject: `${sharedBy} shared "${magazineTitle}" with you`,
    text:
      `${sharedBy} has shared the magazine "${magazineTitle}" with you on Stable Press.\n\n` +
      `${scope}\n\nOpen it: ${magazineUrl}`,
    html: layout({
      heading: 'A magazine was shared with you',
      body: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 20px">
          <strong>${esc(sharedBy)}</strong> shared
          <strong>&ldquo;${esc(magazineTitle)}&rdquo;</strong> with you.
        </p>
        <p style="font-size:13px;line-height:1.6;color:${FAINT};margin:0 0 24px">${esc(scope)}</p>
        <p style="margin:0 0 24px">${button(magazineUrl, 'Open the magazine')}</p>
        <p style="font-size:12px;line-height:1.6;color:${FAINT};margin:0">
          Or paste this link into your browser:<br>
          <span style="word-break:break-all;color:${MUTED}">${esc(magazineUrl)}</span>
        </p>`,
      footer: "You'll be asked to sign in first if you aren't already.",
    }),
  })
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
  const { to, roleLabel, invitedBy, newsroomUrl } = opts
  return send({
    to,
    kind: 'role granted',
    subject: `You've been given the ${roleLabel} role on Stable Press`,
    text:
      `${invitedBy} has given you the ${roleLabel} role on Stable Press.\n\n` +
      `Open the newsroom: ${newsroomUrl}`,
    html: layout({
      heading: `You're now ${esc(roleLabel)}`,
      body: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 24px">
          <strong>${esc(invitedBy)}</strong> has given you the <strong>${esc(roleLabel)}</strong> role.
          It is active now — sign in with your existing account to use it.
        </p>
        <p style="margin:0 0 8px">${button(newsroomUrl, 'Open the newsroom')}</p>`,
      footer: 'If this looks wrong, contact whoever administers your newsroom.',
    }),
  })
}
