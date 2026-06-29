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
  fetchArticles: () => Promise<void>;
  /** Resolves with the created article (with server-assigned id), or null on failure. */
  addArticle: (article: Omit<Article, 'id' | 'createdAt'>) => Promise<Article | null>;
  /** Resolves `true` if the save reached the server, `false` if it failed (and was rolled back). */
  updateArticle: (id: string, updates: ArticleUpdate) => Promise<boolean>;
  removeArticle: (id: string) => Promise<void>;
  publishArticle: (id: string) => Promise<void>;
  setStatus: (id: string, status: ArticleStatus) => Promise<void>;
}

export const useArticleStore = create<ArticleState>()((set, get) => ({
  articles: [],
  loading: false,
  loaded: false,
  error: null,

  fetchArticles: async () => {
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
      toast.error(message);
    }
  },

  addArticle: async (article) => {
    try {
      const res = await authFetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete article';
      set({ articles: previous, error: message });
      toast.error(`Could not delete the article — restoring it`);
    }
  },

  publishArticle: async (id) => {
    const previous = get().articles;
    set({
      articles: previous.map((a) =>
        a.id === id ? { ...a, status: 'published', publishedAt: new Date() } : a
      ),
    });
    try {
      const res = await authFetch(`/api/articles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published', publishedAt: new Date() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = normalizeArticle(await res.json());
      set((state) => ({
        articles: state.articles.map((a) => (a.id === id ? updated : a)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish article';
      set({ articles: previous, error: message });
      toast.error(message);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = normalizeArticle(await res.json());
      set((state) => ({
        articles: state.articles.map((a) => (a.id === id ? updated : a)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set article status';
      set({ articles: previous, error: message });
      toast.error(message);
    }
  },
}));