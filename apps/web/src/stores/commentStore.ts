/**
 * Reader comments — the client half of the one mechanism.
 *
 * One store for every surface that has a comment thread (stories, blog posts,
 * bulletin editions), keyed by `targetType:targetId`, exactly like
 * `reactionStore` — which this deliberately mirrors, because a comment and the
 * reaction attached to it are the same opinion and the two stores are read side
 * by side on the same page.
 *
 * ── THE CATEGORY IS NEVER FETCHED ──
 *
 * A comment arrives carrying an `emoji` key and nothing else about its sentiment.
 * Positive / Neutral / Negative is derived through `sideOf()` from
 * `@/types/reactions` — the one file that owns the scale. Nothing in this store,
 * and nothing in any component, may keep a second copy of that mapping.
 *
 * ── POSTING TOUCHES THE REACTION STORE TOO ──
 *
 * The server records the comment's emoji as the reader's reaction, through the
 * same lib the bar uses. So after a successful post this store refreshes the
 * reaction counts for the same target: without that, the bar above the thread
 * keeps showing the reader's old pick until they reload, and the page shows two
 * different answers to one question.
 *
 * NOT persisted. `mine` and `reportedByMe` belong to the account, so a
 * localStorage copy could only ever disagree with the server.
 */
import { create } from 'zustand';

import { authFetch, authFetchRetry } from '@/lib/api';
import { useReactionStore } from '@/stores/reactionStore';
import type { EmojiKey } from '@/types/reactions';

/**
 * Where a comment can be left. A deliberate SUBSET of the reaction targets —
 * `blogPart` is missing, because parts are RATED separately but the discussion is
 * about the piece. Mirrors COMMENT_TARGET_TYPES on the server.
 */
export type CommentTargetType = 'blog' | 'story' | 'bulletin';

/** The longest comment the server will store. The textarea enforces the same. */
export const MAX_COMMENT_LENGTH = 2000;

/** How long an author may edit. Mirrors EDIT_WINDOW_MS in lib/comments.ts. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface Comment {
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  /** Empty string on a comment an editor hid — see `hidden`. */
  body: string;
  /** The scale key. The three-way category is derived from it, never stored. */
  emoji: EmojiKey;
  authorId: string;
  authorName: string;
  isStaff: boolean;
  createdAt: string;
  /** Present only when the author changed it. */
  editedAt?: string;
  /** The caller's own comment — what makes Edit and Delete appear. */
  mine: boolean;
  reportedByMe: boolean;
  /** Removed by an editor. Renders as a tombstone, not as nothing. */
  hidden: boolean;
}

export interface Thread {
  items: Comment[];
  /** Every comment on the target, not just the ones loaded. */
  total: number;
  /** Cursor for the next page. Absent when the thread is exhausted. */
  nextCursor?: string;
  loading: boolean;
  /** A second page in flight, which disables the button rather than the thread. */
  loadingMore: boolean;
  /** The thread failed to load at all — distinct from a failed write. */
  loadError: string | null;
}

export const threadKey = (targetType: CommentTargetType, targetId: string): string =>
  `${targetType}:${targetId}`;

/** An untouched thread, so a section can render before (or without) any data. */
export function emptyThread(): Thread {
  return { items: [], total: 0, loading: false, loadingMore: false, loadError: null };
}

/**
 * Coerce a server row. A row missing its id or body shape is DROPPED rather than
 * rendered half-formed — one malformed comment must not blank a whole thread.
 */
function normalise(raw: unknown): Comment | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.targetType !== 'string' || typeof row.targetId !== 'string') return null;
  const comment: Comment = {
    id: row.id,
    targetType: row.targetType as CommentTargetType,
    targetId: row.targetId,
    body: typeof row.body === 'string' ? row.body : '',
    emoji: (typeof row.emoji === 'string' ? row.emoji : 'undecided') as EmojiKey,
    authorId: typeof row.authorId === 'string' ? row.authorId : '',
    authorName: typeof row.authorName === 'string' && row.authorName ? row.authorName : 'A reader',
    isStaff: row.isStaff === true,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    mine: row.mine === true,
    reportedByMe: row.reportedByMe === true,
    hidden: row.hidden === true,
  };
  if (typeof row.editedAt === 'string' && row.editedAt) comment.editedAt = row.editedAt;
  return comment;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return 'Sign in to join the conversation.';
  // The server says "Not found" for anything unpublished, which is the right answer
  // for an API and the wrong sentence for a reader looking at the thing. The pages
  // hide the section on a draft, so this only fires when something is unpublished
  // WHILE it is open.
  if (res.status === 404) return 'This is not open for comments.';
  if (res.status === 429) return 'That is a lot of comments at once. Give it a minute.';
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* a non-JSON body is not worth a second failure */
  }
  return fallback;
}

interface CommentState {
  byKey: Record<string, Thread>;
  /** Per-thread write error — shown above the form it belongs to. */
  errors: Record<string, string | null>;
  /** A write is in flight for this thread, so the form disables itself. */
  posting: Record<string, boolean>;
  /** The comment id currently being edited or deleted, so one row can spin. */
  busyId: Record<string, string | null>;

  /** First page of a thread. Replaces whatever was loaded. */
  load: (targetType: CommentTargetType, targetId: string) => Promise<void>;
  /** The next page, appended. */
  loadMore: (targetType: CommentTargetType, targetId: string) => Promise<void>;
  /** Post a comment. Returns false when it did not stick. */
  post: (
    targetType: CommentTargetType,
    targetId: string,
    body: string,
    emoji: EmojiKey,
  ) => Promise<boolean>;
  /** Edit your own, inside the window. */
  edit: (
    targetType: CommentTargetType,
    targetId: string,
    id: string,
    body: string,
    emoji: EmojiKey,
  ) => Promise<boolean>;
  /** Delete your own (or anyone's, with `comments.moderate`). */
  remove: (targetType: CommentTargetType, targetId: string, id: string) => Promise<boolean>;
  /** Flag one for an editor. Idempotent on the server. */
  report: (targetType: CommentTargetType, targetId: string, id: string) => Promise<boolean>;
  /** Clear a thread's write error without retrying. */
  clearError: (targetType: CommentTargetType, targetId: string) => void;
  /** Drop everything — for sign-out, since `mine` belonged to that account. */
  reset: () => void;
}

export const useCommentStore = create<CommentState>((set, get) => ({
  byKey: {},
  errors: {},
  posting: {},
  busyId: {},

  load: async (targetType, targetId) => {
    if (!targetId) return;
    const key = threadKey(targetType, targetId);
    const existing = get().byKey[key] ?? emptyThread();
    set((s) => ({ byKey: { ...s.byKey, [key]: { ...existing, loading: true, loadError: null } } }));

    const params = new URLSearchParams({ targetType, targetId });
    try {
      const res = await authFetchRetry(`/api/comments?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as { items?: unknown; total?: unknown; nextCursor?: unknown };
      const items = Array.isArray(page.items)
        ? page.items.map(normalise).filter((c): c is Comment => c !== null)
        : [];
      set((s) => ({
        byKey: {
          ...s.byKey,
          [key]: {
            items,
            total: typeof page.total === 'number' ? page.total : items.length,
            ...(typeof page.nextCursor === 'string' && page.nextCursor
              ? { nextCursor: page.nextCursor }
              : {}),
            loading: false,
            loadingMore: false,
            loadError: null,
          },
        },
      }));
    } catch {
      // A failed thread load says so, unlike a failed reaction load which leaves
      // honest zeros. The difference: zero reactions is a real state a bar can
      // show, but an empty thread would claim nobody has commented — which may be
      // false, and is the one thing a comment section must not get wrong.
      set((s) => ({
        byKey: {
          ...s.byKey,
          [key]: {
            ...(s.byKey[key] ?? emptyThread()),
            loading: false,
            loadError: 'The comments did not load.',
          },
        },
      }));
    }
  },

  loadMore: async (targetType, targetId) => {
    const key = threadKey(targetType, targetId);
    const thread = get().byKey[key];
    if (!thread?.nextCursor || thread.loadingMore) return;

    set((s) => ({ byKey: { ...s.byKey, [key]: { ...thread, loadingMore: true } } }));
    const params = new URLSearchParams({ targetType, targetId, before: thread.nextCursor });
    try {
      const res = await authFetchRetry(`/api/comments?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as { items?: unknown; total?: unknown; nextCursor?: unknown };
      const fetched = Array.isArray(page.items)
        ? page.items.map(normalise).filter((c): c is Comment => c !== null)
        : [];
      set((s) => {
        const current = s.byKey[key] ?? emptyThread();
        // Dedupe on id: a comment deleted between the two requests shifts the
        // window, and appending blindly would show one row twice.
        const seen = new Set(current.items.map((c) => c.id));
        const merged = [...current.items, ...fetched.filter((c) => !seen.has(c.id))];
        const next: Thread = {
          ...current,
          items: merged,
          total: typeof page.total === 'number' ? page.total : current.total,
          loadingMore: false,
        };
        if (typeof page.nextCursor === 'string' && page.nextCursor) next.nextCursor = page.nextCursor;
        else delete next.nextCursor;
        return { byKey: { ...s.byKey, [key]: next } };
      });
    } catch {
      set((s) => ({
        byKey: { ...s.byKey, [key]: { ...(s.byKey[key] ?? emptyThread()), loadingMore: false } },
      }));
    }
  },

  post: async (targetType, targetId, body, emoji) => {
    const key = threadKey(targetType, targetId);
    set((s) => ({ posting: { ...s.posting, [key]: true }, errors: { ...s.errors, [key]: null } }));

    // NOT optimistic, deliberately. A reaction is a tile lighting up and rolling
    // back costs nothing; a comment that appears, then vanishes because the server
    // refused it, is a reader who cannot tell whether their words were published.
    // The form stays filled and disabled for the one round trip instead.
    try {
      const res = await authFetch(`/api/comments/${targetType}/${targetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, emoji }),
      });
      if (!res.ok) {
        const message = await errorFrom(res, 'That comment did not post.');
        set((s) => ({ posting: { ...s.posting, [key]: false }, errors: { ...s.errors, [key]: message } }));
        return false;
      }
      const comment = normalise(await res.json());
      set((s) => {
        const thread = s.byKey[key] ?? emptyThread();
        return {
          byKey: comment
            ? {
                ...s.byKey,
                // Newest first, so a new comment goes to the TOP — which is where
                // the reader is already looking.
                [key]: { ...thread, items: [comment, ...thread.items], total: thread.total + 1 },
              }
            : s.byKey,
          posting: { ...s.posting, [key]: false },
        };
      });

      // The server recorded this emoji as the reader's reaction. Refresh the bar
      // so it agrees with the comment that just appeared underneath it.
      void useReactionStore.getState().load(targetType, targetId, targetType === 'blog');
      return true;
    } catch {
      set((s) => ({
        posting: { ...s.posting, [key]: false },
        errors: { ...s.errors, [key]: 'Could not reach the server. Your comment is still here — try again.' },
      }));
      return false;
    }
  },

  edit: async (targetType, targetId, id, body, emoji) => {
    const key = threadKey(targetType, targetId);
    set((s) => ({ busyId: { ...s.busyId, [key]: id }, errors: { ...s.errors, [key]: null } }));
    try {
      const res = await authFetch(`/api/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, emoji }),
      });
      if (!res.ok) {
        const message = await errorFrom(res, 'That edit did not save.');
        set((s) => ({ busyId: { ...s.busyId, [key]: null }, errors: { ...s.errors, [key]: message } }));
        return false;
      }
      const updated = normalise(await res.json());
      set((s) => {
        const thread = s.byKey[key] ?? emptyThread();
        return {
          byKey: updated
            ? {
                ...s.byKey,
                [key]: { ...thread, items: thread.items.map((c) => (c.id === id ? updated : c)) },
              }
            : s.byKey,
          busyId: { ...s.busyId, [key]: null },
        };
      });
      void useReactionStore.getState().load(targetType, targetId, targetType === 'blog');
      return true;
    } catch {
      set((s) => ({
        busyId: { ...s.busyId, [key]: null },
        errors: { ...s.errors, [key]: 'Could not reach the server. Try again in a moment.' },
      }));
      return false;
    }
  },

  remove: async (targetType, targetId, id) => {
    const key = threadKey(targetType, targetId);
    set((s) => ({ busyId: { ...s.busyId, [key]: id }, errors: { ...s.errors, [key]: null } }));
    try {
      const res = await authFetch(`/api/comments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const message = await errorFrom(res, 'That did not delete.');
        set((s) => ({ busyId: { ...s.busyId, [key]: null }, errors: { ...s.errors, [key]: message } }));
        return false;
      }
      set((s) => {
        const thread = s.byKey[key] ?? emptyThread();
        return {
          byKey: {
            ...s.byKey,
            [key]: {
              ...thread,
              items: thread.items.filter((c) => c.id !== id),
              total: Math.max(0, thread.total - 1),
            },
          },
          busyId: { ...s.busyId, [key]: null },
        };
      });
      // The reaction SURVIVES a deleted comment — the reader said how the piece sat
      // with them, and withdrawing the words is not withdrawing the verdict. So
      // there is nothing to refresh here on purpose.
      return true;
    } catch {
      set((s) => ({
        busyId: { ...s.busyId, [key]: null },
        errors: { ...s.errors, [key]: 'Could not reach the server. Try again in a moment.' },
      }));
      return false;
    }
  },

  report: async (targetType, targetId, id) => {
    const key = threadKey(targetType, targetId);
    // Optimistic HERE, unlike posting: the only visible change is the reader's own
    // control saying "Reported", and the server is idempotent — so a failure that
    // rolled it back would be the only way this could mislead, and it does.
    set((s) => {
      const thread = s.byKey[key] ?? emptyThread();
      return {
        byKey: {
          ...s.byKey,
          [key]: { ...thread, items: thread.items.map((c) => (c.id === id ? { ...c, reportedByMe: true } : c)) },
        },
      };
    });
    try {
      const res = await authFetch(`/api/comments/${id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const message = await errorFrom(res, 'That report did not send.');
        set((s) => {
          const thread = s.byKey[key] ?? emptyThread();
          return {
            byKey: {
              ...s.byKey,
              [key]: {
                ...thread,
                items: thread.items.map((c) => (c.id === id ? { ...c, reportedByMe: false } : c)),
              },
            },
            errors: { ...s.errors, [key]: message },
          };
        });
        return false;
      }
      return true;
    } catch {
      set((s) => {
        const thread = s.byKey[key] ?? emptyThread();
        return {
          byKey: {
            ...s.byKey,
            [key]: {
              ...thread,
              items: thread.items.map((c) => (c.id === id ? { ...c, reportedByMe: false } : c)),
            },
          },
          errors: { ...s.errors, [key]: 'Could not reach the server. Try again in a moment.' },
        };
      });
      return false;
    }
  },

  clearError: (targetType, targetId) => {
    const key = threadKey(targetType, targetId);
    set((s) => ({ errors: { ...s.errors, [key]: null } }));
  },

  reset: () => set({ byKey: {}, errors: {}, posting: {}, busyId: {} }),
}));

/**
 * "just now" / "14 minutes ago" / "3 Aug".
 *
 * Relative inside a day, absolute beyond it. A thread is read for its recency, so
 * "2 hours ago" is the useful fact about a comment from today; "17 days ago" is
 * arithmetic nobody asked for, and the date is shorter to read. The full instant
 * is always on the element's `title`.
 */
export function relativeTime(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Is this comment still inside its author's edit window? */
export function withinEditWindow(comment: Comment, now = Date.now()): boolean {
  const at = Date.parse(comment.createdAt);
  return Number.isFinite(at) && now - at <= EDIT_WINDOW_MS;
}
