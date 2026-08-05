// ---------------------------------------------------------------------------
// Who may see which post, and how much of it.
//
// Three questions, kept together because they are the same question at three
// depths: is this post public at all (`isLive`), may THIS caller see non-public
// posts (`canSeeDrafts`), and how much of a public post does their subscription
// entitle them to (`gateForTier`).
// ---------------------------------------------------------------------------

import { accountCan } from '../../lib/effectiveAccess.js'
import { canAccessNewsroom } from '../../lib/rbac.js'
import { tierAllows } from '../../lib/paywall.js'
import type { Block, BlogMedia } from '../../lib/blog/blocks.js'

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
  return (
    canAccessNewsroom(req.account) ||
    accountCan(req.account, 'blog.edit_any') ||
    accountCan(req.account, 'blog.create')
  )
}

/**
 * Strip a paywalled post down to its free teaser.
 *
 * This has to happen on the SERVER. The reader page computes the same `locked`
 * decision and renders a Paywall, but until this existed the response still
 * carried every block and the whole media pool — so a premium post was readable
 * in full from the network tab, or with one curl. A client cannot enforce a
 * paywall over content it has already been handed.
 *
 * The teaser is the first paragraph, which is exactly what the page showed above
 * the gate anyway, so the visible result is unchanged for a legitimate reader.
 */
export function gateForTier(doc: Record<string, unknown>, tier: unknown): Record<string, unknown> {
  if (tierAllows(tier, doc.minTier)) return doc

  const blocks = Array.isArray(doc.blocks) ? (doc.blocks as Block[]) : []
  const teaser = blocks.filter((b) => b.kind === 'paragraph').slice(0, 1)

  // The pool is trimmed to the cover, because the rest of it is a list of URLs
  // for photographs belonging to text we just withheld. The cover stays: it is
  // already public on every card in /blog, and the gated page still needs to look
  // like the post it is asking you to buy.
  const cover = (doc.cover ?? null) as { mediaId?: string } | null
  const pool = Array.isArray(doc.media) ? (doc.media as BlogMedia[]) : []
  const media = cover?.mediaId ? pool.filter((m) => m.id === cover.mediaId) : []

  // Parts go too. They are body copy that happens to be titled, so leaving them
  // in the response would hand over most of a paywalled post while the page
  // dutifully drew a gate above them — the same hole the block list had.
  return { ...doc, blocks: teaser, parts: [], media, locked: true }
}
