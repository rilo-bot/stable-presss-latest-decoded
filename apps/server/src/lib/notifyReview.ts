// ---------------------------------------------------------------------------
// Magazine submission / review notifications.
//
// Sibling of notifyShare.ts and it follows the same contract, for the same
// reason: NONE OF THESE MAY THROW. The state change is already committed by the
// time they run — the page IS submitted, the approval IS recorded — so a provider
// outage must not turn a successful transition into a 500, or worse, into a
// half-applied one where the DB moved and the caller was told it failed.
//
// Failures are logged and reported as `delivered: false` with a concrete reason,
// so the UI can say "approved, but we couldn't email them" instead of implying
// the notification went out.
// ---------------------------------------------------------------------------

import {
  sendMagazineSubmittedEmail,
  sendMagazineReviewedEmail,
  sendMagazinePageRemovedEmail,
} from './email.js'
import { absoluteUrl } from './invites.js'
import { pageNumbersLabel } from './pageLabels.js'

const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')

export interface Delivery {
  delivered: boolean
  error?: string
}

/** Shared failure handling — one place, so all three read the same on a bad day. */
async function attempt(kind: string, fn: () => Promise<{ delivered: boolean }>): Promise<Delivery> {
  try {
    const { delivered } = await fn()
    // send() returns delivered:false WITHOUT throwing only when no provider is
    // configured at all — name that reason rather than leaving it blank.
    if (!delivered) return { delivered: false, error: 'No email provider is configured on the server.' }
    return { delivered: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[review] ${kind} email failed:`, error)
    return { delivered: false, error }
  }
}

interface Common {
  to: string
  title: string
  /** Same-origin path to the magazine, from `magazinePath()`. */
  path: string
  /** 1-based page NUMBERS this concerns. The caller resolves these because it is
   *  the only place that knows the page order. */
  pageNumbers: number[]
}

/** Owner: "N pages are waiting on you." One email per submission event. */
export function notifySubmitted(opts: Common & { submittedBy: string; note?: string }): Promise<Delivery> {
  return attempt('submitted', () =>
    sendMagazineSubmittedEmail({
      to: opts.to,
      magazineTitle: opts.title,
      submittedBy: opts.submittedBy,
      magazineUrl: absoluteUrl(WEB_PUBLIC_URL, opts.path),
      pages: pageNumbersLabel(opts.pageNumbers) || 'pages',
      note: opts.note,
    }),
  )
}

/** Collaborator: approved, or sent back with a note. One email per recipient. */
export function notifyReviewed(
  opts: Common & { reviewedBy: string; decision: 'approved' | 'changes-requested'; note?: string },
): Promise<Delivery> {
  return attempt('reviewed', () =>
    sendMagazineReviewedEmail({
      to: opts.to,
      magazineTitle: opts.title,
      reviewedBy: opts.reviewedBy,
      magazineUrl: absoluteUrl(WEB_PUBLIC_URL, opts.path),
      pages: pageNumbersLabel(opts.pageNumbers) || 'pages',
      decision: opts.decision,
      note: opts.note,
    }),
  )
}

/** Collaborator: a page you had submitted no longer exists. */
export function notifyPageRemoved(opts: Common & { removedBy: string }): Promise<Delivery> {
  return attempt('page removed', () =>
    sendMagazinePageRemovedEmail({
      to: opts.to,
      magazineTitle: opts.title,
      removedBy: opts.removedBy,
      magazineUrl: absoluteUrl(WEB_PUBLIC_URL, opts.path),
      pages: pageNumbersLabel(opts.pageNumbers) || 'a page',
    }),
  )
}
