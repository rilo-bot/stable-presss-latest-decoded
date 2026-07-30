/**
 * The editorial workflow, server side. Mirrors `apps/web/src/lib/workflow.tsx`
 * and `apps/web/src/types/article.ts`.
 *
 * This file exists because the workflow was previously advisory. `PUT
 * /api/articles/:id` did `status: body.status` with no validation, and
 * `articlesWriteGate` authorised *editing the article*, not the *transition* —
 * so anyone holding `content.draft.edit_own` could PUT `status: 'published'` on
 * their own story and self-publish, skipping approval entirely. The permissions
 * that were supposed to gate that (`content.approve`, `content.schedule`,
 * `content.publish`) were only ever checked in the browser.
 */
import type { PermissionAction } from './permissionCatalogue.js'

export const ARTICLE_STATUSES = ['draft', 'submitted', 'approved', 'scheduled', 'published'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_CHANNELS = ['news', 'newsletter', 'bulletin'] as const
export type ArticleChannel = (typeof ARTICLE_CHANNELS)[number]

export function isArticleStatus(v: unknown): v is ArticleStatus {
  return typeof v === 'string' && (ARTICLE_STATUSES as readonly string[]).includes(v)
}

export function isArticleChannel(v: unknown): v is ArticleChannel {
  return typeof v === 'string' && (ARTICLE_CHANNELS as readonly string[]).includes(v)
}

export interface Move {
  to: ArticleStatus
  label: string
  permission: PermissionAction
}

/** Every legal move out of each stage, and the permission it demands. */
const MOVES: Record<ArticleStatus, Move[]> = {
  draft: [{ to: 'submitted', label: 'Submit', permission: 'content.submit' }],
  submitted: [
    { to: 'approved', label: 'Approve', permission: 'content.approve' },
    { to: 'draft', label: 'Request changes', permission: 'content.send_revision' },
  ],
  approved: [
    { to: 'scheduled', label: 'Schedule', permission: 'content.schedule' },
    { to: 'published', label: 'Publish now', permission: 'content.publish' },
    { to: 'submitted', label: 'Send back', permission: 'content.send_revision' },
  ],
  scheduled: [
    { to: 'published', label: 'Publish', permission: 'content.publish' },
    { to: 'approved', label: 'Unschedule', permission: 'content.schedule' },
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
 * a draft, which is what `content.draft.create` already gates.
 */
export function enterPermission(to: ArticleStatus): PermissionAction | null {
  switch (to) {
    case 'draft':
      return null
    case 'submitted':
      return 'content.submit'
    case 'approved':
      return 'content.approve'
    case 'scheduled':
      return 'content.schedule'
    case 'published':
      return 'content.publish'
  }
}

/** The permission required to put a story out on a given channel. */
export function channelPermission(channel: ArticleChannel): PermissionAction | null {
  switch (channel) {
    case 'news':
      return null
    case 'newsletter':
      return 'content.newsletter'
    case 'bulletin':
      return 'content.bulletin'
  }
}

/**
 * Normalise a `channels` value off the wire: drop unknown entries, de-duplicate,
 * and treat empty as absent so the reader's `['news']` default applies.
 */
export function normaliseChannels(v: unknown): ArticleChannel[] | undefined {
  if (!Array.isArray(v)) return undefined
  const seen = new Set<ArticleChannel>()
  for (const entry of v) if (isArticleChannel(entry)) seen.add(entry)
  return seen.size > 0 ? [...seen] : undefined
}
