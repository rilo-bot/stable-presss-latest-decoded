import { create } from 'zustand';
import { toast } from 'sonner';
import type { MediaItem } from '@/types/mediaItem';
import { apiUrl } from '@/lib/api';

interface MediaState {
  items: MediaItem[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  addItem: (item: Omit<MediaItem, 'id' | 'createdAt'>) => Promise<string>;
  updateItem: (id: string, updates: Partial<Omit<MediaItem, 'id' | 'createdAt'>>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export const useMediaStore = create<MediaState>()((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,

  fetchItems: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch(apiUrl('/api/mediaItems'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      set({ items, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load media items';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addItem: async (item) => {
    try {
      const res = await fetch(apiUrl('/api/mediaItems'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: MediaItem = await res.json();
      set((state) => ({ items: [created, ...state.items] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add media item';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateItem: async (id, updates) => {
    const previous = get().items;
    set((state) => ({
      items: state.items.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
    try {
      const res = await fetch(apiUrl(`/api/mediaItems/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: MediaItem = await res.json();
      set((state) => ({
        items: state.items.map((m) => (m.id === id ? updated : m)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update media item';
      set({ items: previous, error: message });
      toast.error(message);
    }
  },

  removeItem: async (id) => {
    const previous = get().items;
    set((state) => ({ items: state.items.filter((m) => m.id !== id) }));
    try {
      const res = await fetch(apiUrl(`/api/mediaItems/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Media record removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete media item — restoring it';
      set({ items: previous, error: message });
      toast.error(message);
    }
  },
}));
