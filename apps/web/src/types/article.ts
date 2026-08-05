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
 * A story still stored under one of the retired twelve is folded into these five
 * by the server, on read, the first time anyone lists stories — see
 * `normaliseLegacyStatus` in `apps/server/src/lib/workflow.ts`. There is no
 * migration to run.
 */
export const ARTICLE_STATUSES = ['draft', 'submitted', 'approved', 'scheduled', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export function isArticleStatus(v: unknown): v is ArticleStatus {
  return typeof v === 'string' && (ARTICLE_STATUSES as readonly string[]).includes(v);
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
  /** Editorial assignment / instruction note attached by an editor. */
  assignmentNote?: string;

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

/**
 * Is this story visible to the public? The one place that question is answered,
 * and now the ONLY question a story answers about where it appears.
 *
 * Was a three-value status check (`published`/`newsletter`/`bulletin`) repeated
 * across Landing, NewsIndex, ArticleDetail, Compensation and the media library.
 * Then briefly `isLive` + `isLiveOn(article, channel)`, while a story could be
 * distributed to a newsletter or a bulletin as well as the site.
 *
 * The channel axis is gone: a published story is news, and it appears on /news
 * under its category. `isLiveOn` went with it — nothing needs to ask "live, but
 * where?" any more, because there is only one where.
 */
export function isLive(article: Pick<Article, 'status'>): boolean {
  return article.status === 'published';
}
