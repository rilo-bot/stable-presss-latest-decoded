import type { SubscriptionTier } from '@/rbac/entitlement';

/**
 * Where a story sits in the editorial workflow. Five stages, nothing else.
 *
 * The previous twelve conflated three different things into one field: workflow
 * position (draft/submitted/approved/scheduled/published), per-department
 * sign-off gates (editorial_review, legal_review, compliance, publisher_review),
 * and distribution channel (newsletter, bulletin). The gates are gone — approval
 * is one action now — and distribution moved to `channels`, which is what it
 * always was: a story can run on the site AND in the newsletter, something a
 * single status could never express.
 *
 * Legacy values are migrated by `apps/server/scripts/migrate-article-status.ts`.
 */
export const ARTICLE_STATUSES = ['draft', 'submitted', 'approved', 'scheduled', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Where a published story is distributed. Independent of workflow position. */
export const ARTICLE_CHANNELS = ['news', 'newsletter', 'bulletin'] as const;
export type ArticleChannel = (typeof ARTICLE_CHANNELS)[number];

export function isArticleStatus(v: unknown): v is ArticleStatus {
  return typeof v === 'string' && (ARTICLE_STATUSES as readonly string[]).includes(v);
}

export function isArticleChannel(v: unknown): v is ArticleChannel {
  return typeof v === 'string' && (ARTICLE_CHANNELS as readonly string[]).includes(v);
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  author: string;
  publishedAt: Date | null;
  linkedHorseIds: string[];
  status: ArticleStatus;
  imageUrl?: string;
  category?: string;
  readingTime?: number;
  tags?: string[];
  createdAt: Date;
  /** Minimum subscription tier to read the full article. Defaults to free. */
  minTier?: SubscriptionTier;
  /** Editorial assignment / instruction note attached by an editor. */
  assignmentNote?: string;

  /**
   * Distribution channels. Empty/absent behaves as `['news']`, so a story that
   * predates the field still appears on the news index once published.
   */
  channels?: ArticleChannel[];

  /**
   * Set when an editor sends a story back from Submitted. The story returns to
   * Draft, so without this flag its card would be indistinguishable from one
   * nobody has looked at yet.
   */
  changesRequested?: boolean;
  /** The editor's note explaining what needs changing. */
  changesRequestedNote?: string;

  /**
   * When a scheduled story should go live (ISO). "Scheduled" used to be a status
   * with no date behind it — the podcast workflow already did this properly.
   */
  scheduledFor?: string;
}

/** Channels a story actually goes out on, applying the `['news']` default. */
export function articleChannels(article: Pick<Article, 'channels'>): ArticleChannel[] {
  const set = article.channels?.filter(isArticleChannel) ?? [];
  return set.length > 0 ? set : ['news'];
}

/**
 * Is this story visible to the public? The one place that question is answered.
 * Was a three-value status check (`published`/`newsletter`/`bulletin`) repeated
 * across Landing, NewsIndex, ArticleDetail, Compensation and the media library.
 */
export function isLive(article: Pick<Article, 'status'>): boolean {
  return article.status === 'published';
}

/** Is this story live and carried on the given channel? */
export function isLiveOn(
  article: Pick<Article, 'status' | 'channels'>,
  channel: ArticleChannel,
): boolean {
  return isLive(article) && articleChannels(article).includes(channel);
}
