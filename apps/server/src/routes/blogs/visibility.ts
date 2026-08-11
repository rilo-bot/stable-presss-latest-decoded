// ---------------------------------------------------------------------------
// Who may see which post.
//
// Two questions: is this post public at all (`isLive`), and may THIS caller see
// posts that are not (`canSeeDrafts`).
//
// There used to be a third — `gateForTier`, which trimmed a "premium" post to a
// teaser. Subscriptions are gone (the tier on the account and the subscription
// route were both deleted), so the gate was reading a field nothing set: every
// post came back `locked: false` for everyone. A paywall that is always open is
// worse than no paywall, because the code reads as if one is being enforced.
// Removed along with `minTier` rather than left standing as scaffolding.
// ---------------------------------------------------------------------------

import { accountCan } from '../../lib/effectiveAccess.js'
import { isAdmin } from '../../lib/rbac.js'

/**
 * Is this post visible to the public right now?
 *
 * `publishAt` is resolved HERE, at read time, rather than by a scheduled job.
 * Nothing in this codebase ever flips a dated record to live — articles have
 * had a `scheduled` status and a `scheduledFor` field since the workflow
 * landed and no cron or worker has ever acted on either, so a story parked
 * there stays parked forever. Answering the question on read has no moving
 * parts to forget. See BLOG-SYSTEM-PLAN §7.1.
 */
export function isLive(doc: Record<string, unknown>, now = Date.now()): boolean {
  if (doc.status !== 'published') return false
  if (typeof doc.publishAt === 'string' && doc.publishAt) {
    const at = Date.parse(doc.publishAt)
    if (Number.isFinite(at) && at > now) return false
  }
  return true
}

/** May this caller see posts that aren't live? */
export function canSeeDrafts(req: { account?: Parameters<typeof accountCan>[0] }): boolean {
  return isAdmin(req.account) || accountCan(req.account, 'blogs.view')
}
