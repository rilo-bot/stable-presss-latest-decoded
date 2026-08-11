/**
 * The editorial workflow, server side. Mirrors `apps/web/src/lib/workflow.tsx`
 * and `apps/web/src/types/article.ts`.
 *
 * This file exists because the workflow was previously advisory. `PUT
 * /api/articles/:id` did `status: body.status` with no validation, and
 * `articlesWriteGate` authorised *editing the article*, not the *transition* —
 * so anyone holding `content.draft.edit_own` could PUT `status: 'published'` on
 * their own story and self-publish, skipping approval entirely. The permissions
 * that were supposed to gate that (`stories.publish`, `stories.publish`,
 * `stories.publish`) were only ever checked in the browser.
 */
import type { PermissionAction } from './permissionCatalogue.js'

export const ARTICLE_STATUSES = ['draft', 'submitted', 'approved', 'scheduled', 'published'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export function isArticleStatus(v: unknown): v is ArticleStatus {
  return typeof v === 'string' && (ARTICLE_STATUSES as readonly string[]).includes(v)
}

// ── The retired `channels` axis ─────────────────────────────────────────────
//
// A story used to carry `channels: ('news' | 'newsletter' | 'bulletin')[]`, and
// publishing to the latter two took `content.newsletter` / `content.bulletin`.
// The axis is GONE: a published story is news, and it appears on /news under its
// category like every other one.
//
// It was removed rather than left at one value because neither extra channel had
// anywhere to land. `/bulletins` is the magazine newsstand — both builders freeze
// their pages into `issues`, and the bulletin-story list under it was a fallback
// that only rendered when no issue had ever been published. `/newsletter` was a
// story index for a newsletter that does not exist: nothing in this codebase
// sends email beyond sign-in OTPs, so "distribute a story via newsletter" was a
// permission an editor could hold and an action nobody could take.
//
// Stored `channels` arrays are simply IGNORED on read — there is no migration,
// because the field never gated visibility on its own. `status: 'published'` did,
// and still does. See `isLive` in apps/web/src/types/article.ts, now the only
// question a story answers about where it appears.

export interface Move {
  to: ArticleStatus
  label: string
  permission: PermissionAction
}

/** Every legal move out of each stage, and the permission it demands. */
const MOVES: Record<ArticleStatus, Move[]> = {
  draft: [{ to: 'submitted', label: 'Submit', permission: 'stories.edit' }],
  submitted: [
    { to: 'approved', label: 'Approve', permission: 'stories.publish' },
    { to: 'draft', label: 'Request changes', permission: 'stories.edit' },
  ],
  approved: [
    { to: 'scheduled', label: 'Schedule', permission: 'stories.publish' },
    { to: 'published', label: 'Publish now', permission: 'stories.publish' },
    { to: 'submitted', label: 'Send back', permission: 'stories.edit' },
  ],
  scheduled: [
    { to: 'published', label: 'Publish', permission: 'stories.publish' },
    { to: 'approved', label: 'Unschedule', permission: 'stories.publish' },
  ],
  published: [],
}

export function movesFrom(status: ArticleStatus): Move[] {
  return MOVES[status] ?? []
}

/** The move descriptor for a transition, or undefined if it is not legal. */
export function findMove(from: ArticleStatus, to: ArticleStatus): Move | undefined {
  return movesFrom(from).find((m) => m.to === to)
}

/**
 * The permission that authorises putting a story INTO a stage, regardless of
 * where it came from. Used on create, where there is no "from" to check a
 * transition against. `draft` is null: anyone who may create a story may create
 * a draft, which is what `stories.create` already gates.
 */
export function enterPermission(to: ArticleStatus): PermissionAction | null {
  switch (to) {
    case 'draft':
      return null
    case 'submitted':
      return 'stories.edit'
    case 'approved':
      return 'stories.publish'
    case 'scheduled':
      return 'stories.publish'
    case 'published':
      return 'stories.publish'
  }
}

/**
 * A story stored under one of the twelve retired statuses, expressed in the five.
 *
 * `newsletter` and `bulletin` were LIVE states the public site keyed off, so they
 * fold to `published` — they are news like everything else now. (They used to
 * carry their old status across as a distribution channel; that axis is gone, see
 * the note above.) The review gates fold back to `submitted` (the one approval
 * step now covers them), `revision` returns to Draft with the flag that replaced
 * it, and `archived` goes back to Draft because there is no longer a stage that
 * means "was live, isn't now".
 *
 * Resolved on read and PERSISTED (see reconcileStories in routes/articles.ts)
 * rather than by a migration script, so there is nothing to remember to run and
 * no window in which a legacy story is invisible to the public site.
 */
export function normaliseLegacyStatus(
  raw: unknown,
): { status: ArticleStatus; changesRequested?: boolean } | null {
  if (isArticleStatus(raw)) return null
  switch (raw) {
    case 'editorial_review':
    case 'legal_review':
    case 'compliance':
      return { status: 'submitted' }
    case 'publisher_review':
      return { status: 'approved' }
    case 'revision':
      return { status: 'draft', changesRequested: true }
    case 'newsletter':
    case 'bulletin':
      return { status: 'published' }
    case 'archived':
      return { status: 'draft' }
    default:
      // An id nobody recognises: Draft is the safe home — reachable by staff,
      // invisible to the public.
      return { status: 'draft' }
  }
}
