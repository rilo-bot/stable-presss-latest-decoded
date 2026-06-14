import { create } from 'zustand';
import { toast } from 'sonner';
import type { BreakingNewsItem } from '@/types/breakingNews';
import { authFetch } from '@/lib/api';

interface BreakingNewsState {
  items: BreakingNewsItem[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchBreakingNews: () => Promise<void>;
  addItem: (item: Omit<BreakingNewsItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateItem: (id: string, updates: Partial<Omit<BreakingNewsItem, 'id' | 'createdAt'>>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export const useBreakingNewsStore = create<BreakingNewsState>()((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,

  fetchBreakingNews: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/breakingNews');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      set({ items, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load breaking news';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addItem: async (item) => {
    try {
      const res = await authFetch('/api/breakingNews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: BreakingNewsItem = await res.json();
      set((state) => ({ items: [...state.items, created] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add item';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateItem: async (id, updates) => {
    const previous = get().items;
    set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)) }));
    try {
      const res = await authFetch(`/api/breakingNews/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: BreakingNewsItem = await res.json();
      set((state) => ({ items: state.items.map((i) => (i.id === id ? updated : i)) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update item';
      set({ items: previous, error: message });
      toast.error(message);
    }
  },

  removeItem: async (id) => {
    const previous = get().items;
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    try {
      const res = await authFetch(`/api/breakingNews/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Item removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete item — restoring it';
      set({ items: previous, error: message });
      toast.error(message);
    }
  },
}));
