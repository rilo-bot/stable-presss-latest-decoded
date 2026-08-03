/**
 * Blog store.
 *
 * Unlike articleStore, this does NOT hold "every post ever" in one array. The
 * list endpoint is paginated and returns a projection (no blocks, no media
 * pool), so the store keeps two separate things: a page of card summaries, and
 * at most one fully-loaded post. Loading every blog to render an index is the
 * pattern that makes the articles list slow, and a blog document is far larger.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch, authFetchRetry } from '@/lib/api';
import type { Blog, BlogSummary } from '@/types/blog';

/** Read the server's reason off a failed response, mirroring articleStore. */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Non-JSON body — fall through.
  }
  return `${fallback} (HTTP ${res.status})`;
}

export interface BlogListFilters {
  status?: 'draft' | 'published';
  tag?: string;
  category?: string;
  q?: string;
  sort?: 'published' | 'updated';
}

interface BlogListResponse {
  items: BlogSummary[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * A post the server reports as moved. The detail endpoint answers 301 with the
 * current slug when an old one is requested, so a link that predates a rename
 * still lands on the post instead of a 404.
 */
export interface BlogMoved {
  movedTo: string;
}

interface BlogState {
  items: BlogSummary[];
  page: number;
  total: number;
  hasMore: boolean;
  listLoading: boolean;
  listError: string | null;

  current: Blog | null;
  currentLoading: boolean;
  currentError: string | null;
  /** Set when the requested slug was retired; the page redirects to this one. */
  movedTo: string | null;

  fetchList: (filters?: BlogListFilters, page?: number) => Promise<void>;
  loadMore: (filters?: BlogListFilters) => Promise<void>;
  fetchOne: (idOrSlug: string) => Promise<Blog | null>;
  clearCurrent: () => void;

  createBlog: (input: Partial<Blog>) => Promise<Blog | null>;
  saveBlog: (id: string, input: Partial<Blog> & { baseUpdatedAt?: string }) => Promise<Blog | null>;
  setPublished: (id: string, published: boolean) => Promise<boolean>;
  removeBlog: (id: string) => Promise<boolean>;
}

function queryFrom(filters: BlogListFilters | undefined, page: number, limit = 12): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.tag) params.set('tag', filters.tag);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.q) params.set('q', filters.q);
  if (filters?.sort) params.set('sort', filters.sort);
  return params.toString();
}

export const useBlogStore = create<BlogState>()((set, get) => ({
  items: [],
  page: 1,
  total: 0,
  hasMore: false,
  listLoading: false,
  listError: null,

  current: null,
  currentLoading: false,
  currentError: null,
  movedTo: null,

  fetchList: async (filters, page = 1) => {
    set({ listLoading: true, listError: null });
    try {
      const res = await authFetchRetry(`/api/blogs?${queryFrom(filters, page)}`);
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not load posts'));
      const data = (await res.json()) as BlogListResponse;
      set({
        items: data.items,
        page: data.page,
        total: data.total,
        hasMore: data.hasMore,
        listLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load posts';
      set({ listLoading: false, listError: message });
    }
  },

  loadMore: async (filters) => {
    const { page, hasMore, listLoading, items } = get();
    if (!hasMore || listLoading) return;
    set({ listLoading: true });
    try {
      const res = await authFetchRetry(`/api/blogs?${queryFrom(filters, page + 1)}`);
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not load more posts'));
      const data = (await res.json()) as BlogListResponse;
      // De-duplicate by id: a post published between page loads shifts the
      // window, and appending blindly would show the same card twice.
      const seen = new Set(items.map((i) => i.id));
      set({
        items: [...items, ...data.items.filter((i) => !seen.has(i.id))],
        page: data.page,
        total: data.total,
        hasMore: data.hasMore,
        listLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load more posts';
      set({ listLoading: false, listError: message });
    }
  },

  fetchOne: async (idOrSlug) => {
    set({ currentLoading: true, currentError: null, movedTo: null });
    try {
      const res = await authFetchRetry(`/api/blogs/${encodeURIComponent(idOrSlug)}`);

      // A retired slug — the post exists under a new one.
      if (res.status === 301) {
        const body = (await res.json()) as BlogMoved;
        set({ currentLoading: false, movedTo: body.movedTo });
        return null;
      }
      if (res.status === 404) {
        set({ currentLoading: false, currentError: 'notfound', current: null });
        return null;
      }
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not load the post'));

      const blog = (await res.json()) as Blog;
      set({ current: blog, currentLoading: false });
      return blog;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load the post';
      set({ currentLoading: false, currentError: message });
      return null;
    }
  },

  clearCurrent: () => set({ current: null, currentError: null, movedTo: null }),

  createBlog: async (input) => {
    try {
      const res = await authFetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not create the post'));
      const blog = (await res.json()) as Blog;
      set({ current: blog });
      return blog;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the post');
      return null;
    }
  },

  saveBlog: async (id, input) => {
    try {
      const res = await authFetch(`/api/blogs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not save the post'));

      const blog = (await res.json()) as Blog & { droppedBlocks?: number };
      // The server drops blocks it cannot validate (a dangling image, an unknown
      // kind). Saying so beats letting content vanish silently between saves.
      if (blog.droppedBlocks && blog.droppedBlocks > 0) {
        toast.warning(
          `${blog.droppedBlocks} block${blog.droppedBlocks === 1 ? '' : 's'} could not be saved and ${
            blog.droppedBlocks === 1 ? 'was' : 'were'
          } removed.`,
        );
      }
      set({ current: blog });
      return blog;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the post');
      return null;
    }
  },

  setPublished: async (id, published) => {
    try {
      const res = await authFetch(`/api/blogs/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published }),
      });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not change the status'));
      const blog = (await res.json()) as Blog;
      set((s) => ({
        current: s.current?.id === id ? blog : s.current,
        items: s.items.map((i) => (i.id === id ? { ...i, status: blog.status, publishedAt: blog.publishedAt } : i)),
      }));
      toast.success(published ? 'Post published.' : 'Post moved back to draft.');
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the status');
      return false;
    }
  },

  removeBlog: async (id) => {
    try {
      const res = await authFetch(`/api/blogs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await failureMessage(res, 'Could not delete the post'));
      set((s) => ({
        items: s.items.filter((i) => i.id !== id),
        total: Math.max(0, s.total - 1),
        current: s.current?.id === id ? null : s.current,
      }));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the post');
      return false;
    }
  },
}));
