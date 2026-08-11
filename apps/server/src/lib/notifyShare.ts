// ---------------------------------------------------------------------------
// "A magazine was shared with you" notification.
//
// Shared by the v1 and v2 magazine routes so the two can't drift in wording or
// in failure behaviour.
//
// NEVER THROWS. The share is already committed by the time this runs — the
// collaborator has access whether or not the email lands — so a provider
// outage must not turn a successful share into a 500. Failures are logged and
// reported as `false` so the UI can say "shared, but we couldn't email them".
// ---------------------------------------------------------------------------

import { sendMagazineShareEmail } from './email.js'
import { absoluteUrl } from './invites.js'
import { pageNumbersLabel } from './pageLabels.js'

const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')

/**
 * Human phrasing for which pages they can touch — NAMING them, not just counting.
 *
 * "You can edit 3 pages" told the recipient nothing they could act on; they had to
 * open the magazine to discover which three. The page-naming itself now lives in
 * `pageNumbersLabel` so this email and the submission/review emails phrase the
 * same set of pages identically.
 */
function scopeLabel(pages: number[] | 'all', total: number): string {
  if (pages === 'all') {
    return total > 0
      ? `You can edit every page (${total} in total).`
      : 'You can edit every page.'
  }
  const list = pageNumbersLabel(pages)
  if (!list) return 'No pages are assigned to you yet.'
  return total > 0
    ? `You can edit ${list} of ${total}.`
    : `You can edit ${list}.`
}

/** `delivered` = the email actually went out. On failure, `error` carries the
 *  concrete reason (provider rejection, or "not configured") so the caller can
 *  SHOW it instead of a vague "couldn't email them" — a swallowed reason is a bug
 *  you can't act on. Never throws: the share is already committed. */
export async function notifyShared(opts: {
  to: string
  sharedBy: string
  title: string
  /** Same-origin path to the magazine, from `magazinePath()`. */
  path: string
  /** 1-based page NUMBERS they may edit, or 'all'. Resolved by the caller, which
   *  is the only place that knows the page order. */
  pages: number[] | 'all'
  /** How many pages the magazine has, so the scope reads "3 of 12". */
  totalPages: number
}): Promise<{ delivered: boolean; error?: string }> {
  try {
    const { delivered } = await sendMagazineShareEmail({
      to: opts.to,
      magazineTitle: opts.title,
      sharedBy: opts.sharedBy,
      magazineUrl: absoluteUrl(WEB_PUBLIC_URL, opts.path),
      scope: scopeLabel(opts.pages, opts.totalPages),
    })
    // `send()` returns delivered:false WITHOUT throwing only when no provider is
    // configured — name that reason rather than leaving it blank.
    if (!delivered) return { delivered: false, error: 'No email provider is configured on the server.' }
    return { delivered: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[share] magazine share email failed:', error)
    return { delivered: false, error }
  }
}
