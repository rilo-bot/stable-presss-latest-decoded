import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Article, ArticleStatus } from '@/types/article';

/**
 * Fields a partial article edit may set. `null` is allowed on the optional
 * `category` / `readingTime` so an editor can explicitly CLEAR them: a bare
 * `undefined` is dropped by JSON.stringify and the server would keep the old
 * value, whereas `null` is sent and persisted (the store does a `$set`/merge).
 */
/**
 * Read the server's reason off a failed response.
 *
 * The workflow is enforced server-side now, so a rejected move comes back as a
 * 403/409 carrying a sentence worth showing ("You cannot approve this story.",
 * "A story cannot go from draft to published."). Throwing a bare `HTTP 409`
 * threw that away and left the user with a status code.
 */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return `${fallback} (HTTP ${res.status})`;
}

export type ArticleUpdate = Partial<Omit<Article, 'category' | 'readingTime' | 'imageUrl' | 'tags'>> & {
  category?: string | null;
  readingTime?: number | null;
  imageUrl?: string | null;
  tags?: string[] | null;
};

/**
 * Coerce a raw API article into the shape the UI relies on. The server doesn't
 * default array fields, so legacy/seed docs can arrive without linkedHorseIds —
 * which the type claims is always present. Normalising here keeps every
 * consumer (board cards, detail page, forms) safe from undefined-array reads.
 */
function normalizeArticle(a: Article): Article {
  return { ...a, linkedHorseIds: a.linkedHorseIds ?? [] };
}

interface ArticleState {
  articles: Article[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /**
   * `silent` suppresses the error toast, for callers whose audience cannot act on
   * it. The public front page is the one that matters: a reader who cannot reach
   * /api/articles got a red toast reading "HTTP 500" — a message that tells them
   * nothing, blames nothing they did, and appears on a page they did not ask to
   * debug. The store still records `error`, so the page can say something honest in
   * the space where the stories would have been.
   *
   * Newsroom callers keep the toast: a staff member who has just filed something
   * needs to know the list is stale.
   */
  fetchArticles: (options?: { silent?: boolean }) => Promise<void>;
  /** Resolves with the created article (with server-assigned id), or null on failure. */
  addArticle: (article: Omit<Article, 'id' | 'createdAt'>) => Promise<Article | null>;
  /** Resolves `true` if the save reached the server, `false` if it failed (and was rolled back). */
  updateArticle: (id: string, updates: ArticleUpdate) => Promise<boolean>;
  /** Resolves `true` if the delete stuck, `false` if it failed (and was restored). */
  removeArticle: (id: string) => Promise<boolean>;
  /**
   * Move a story to another stage. Resolves `false` when the server refuses the
   * move, so callers can hold their confirmation toast until it lands.
   *
   * `publishArticle` used to sit alongside this — a second, hand-rolled copy of
   * the same PUT that also sent `publishedAt`, which the server now owns. It had
   * no callers.
   */
  setStatus: (id: string, status: ArticleStatus) => Promise<boolean>;
}

export const useArticleStore = create<ArticleState>()((set, get) => ({
  articles: [],
  loading: false,
  loaded: false,
  error: null,

  fetchArticles: async (options?: { silent?: boolean }) => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/articles');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const articles = (await res.json()) as Article[];
      set({ articles: articles.map(normalizeArticle), loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load articles';
      set({ loading: false, error: message });
      if (!options?.silent) toast.error(message);
    }
  },

  addArticle: async (article) => {
    try {
      const res = await authFetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article),
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not create the story'));
      const created = normalizeArticle(await res.json());
      set((state) => ({ articles: [...state.articles, created] }));
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create article';
      set({ error: message });
      toast.error(message);
      return null;
    }
  },

  updateArticle: async (id, updates) => {
    const previous = get().articles;
    set({
      articles: previous.map((a) => (a.id === id ? ({ ...a, ...updates } as Article) : a)),
    });
    try {
      const res = await authFetch(`/api/articles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      // Same treatment as setStatus: a rejected save carries a sentence worth
      // reading ("You cannot publish to the newsletter."), and `HTTP 403` is not
      // it.
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not save the story'));
      const updated = normalizeArticle(await res.json());
      set((state) => ({
        articles: state.articles.map((a) => (a.id === id ? updated : a)),
      }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update article';
      set({ articles: previous, error: message });
      toast.error(message);
      return false;
    }
  },

  removeArticle: async (id) => {
    const previous = get().articles;
    set({ articles: previous.filter((a) => a.id !== id) });
    try {
      const res = await authFetch(`/api/articles/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not delete the story'));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete article';
      set({ articles: previous, error: message });
      toast.error(message);
      return false;
    }
  },

  setStatus: async (id, status) => {
    const previous = get().articles;
    set({
      articles: previous.map((a) => (a.id === id ? { ...a, status } : a)),
    });
    try {
      const res = await authFetch(`/api/articles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not move the story'));
      const updated = normalizeArticle(await res.json());
      set((state) => ({
        articles: state.articles.map((a) => (a.id === id ? updated : a)),
      }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set article status';
      set({ articles: previous, error: message });
      toast.error(message);
      return false;
    }
  },
}));