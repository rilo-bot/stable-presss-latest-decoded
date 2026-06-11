// ---------------------------------------------------------------------------
// Email delivery — OTP codes via SendGrid, with a dev fallback.
//
// When SENDGRID_API_KEY is unset (local dev / WebContainer) we DON'T send mail:
// the code is logged to the server console and the route surfaces it to the UI
// as a "Dev preview". The moment a real key + verified sender are configured,
// the same call sends a real email and the dev preview disappears.
// ---------------------------------------------------------------------------

import sgMail from '@sendgrid/mail'

const SENDGRID_API_KEY = (process.env.SENDGRID_API_KEY ?? '').trim()
const FROM_EMAIL = (process.env.SENDGRID_FROM_EMAIL ?? '').trim()

let _configured = false
function ensureConfigured(): boolean {
  if (!SENDGRID_API_KEY || !FROM_EMAIL) return false
  if (!_configured) {
    sgMail.setApiKey(SENDGRID_API_KEY)
    _configured = true
  }
  return true
}

/** True when both a SendGrid key and a from-address are present. */
export function isEmailConfigured(): boolean {
  return !!SENDGRID_API_KEY && !!FROM_EMAIL
}

function otpHtml(code: string): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a2342">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9aa3b2;margin:0 0 8px">Stable Press</p>
    <h1 style="font-size:22px;margin:0 0 16px">Your verification code</h1>
    <p style="font-size:14px;line-height:1.6;color:#41506b;margin:0 0 24px">
      Enter this code to continue signing in. It expires shortly and can only be used once.
    </p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:10px;font-family:monospace;background:#f4f6fa;border:1px solid #e2e7f0;border-radius:8px;padding:18px;text-align:center;color:#0a2342">
      ${code}
    </div>
    <p style="font-size:12px;line-height:1.6;color:#9aa3b2;margin:24px 0 0">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>`
}

/**
 * Send a one-time passcode to `to`. Returns whether a real email was dispatched
 * (false means dev-fallback console logging).
 */
export async function sendOtpEmail(to: string, code: string): Promise<{ delivered: boolean }> {
  if (!ensureConfigured()) {
    console.info(`[email] (dev) OTP for ${to}: ${code}  — SendGrid not configured, not emailing`)
    return { delivered: false }
  }
  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: 'Your Stable Press verification code',
    text: `Your Stable Press verification code is ${code}. It expires shortly and can only be used once.`,
    html: otpHtml(code),
  })
  console.info(`[email] OTP sent to ${to} via SendGrid`)
  return { delivered: true }
}
