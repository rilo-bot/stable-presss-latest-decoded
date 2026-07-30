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

const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')

/** Human phrasing for which pages they can touch. */
function scopeLabel(pageIds: string[] | 'all'): string {
  if (pageIds === 'all') return 'You can edit every page.'
  const n = pageIds.length
  if (n === 0) return 'No pages are assigned to you yet.'
  return `You can edit ${n} page${n !== 1 ? 's' : ''}.`
}

export async function notifyShared(opts: {
  to: string
  sharedBy: string
  title: string
  /** Same-origin path to the magazine, from `magazinePath()`. */
  path: string
  pageIds: string[] | 'all'
}): Promise<boolean> {
  try {
    const { delivered } = await sendMagazineShareEmail({
      to: opts.to,
      magazineTitle: opts.title,
      sharedBy: opts.sharedBy,
      magazineUrl: absoluteUrl(WEB_PUBLIC_URL, opts.path),
      scope: scopeLabel(opts.pageIds),
    })
    return delivered
  } catch (err) {
    console.error('[share] magazine share email failed:', err instanceof Error ? err.message : err)
    return false
  }
}
