import { create } from 'zustand';
import { toast } from 'sonner';
import type { MediaItem } from '@/types/mediaItem';
import { authFetch } from '@/lib/api';
import { shareRecord, unshareRecord, type ShareResult } from '@/lib/recordSharing';

interface MediaState {
  items: MediaItem[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  addItem: (item: Omit<MediaItem, 'id' | 'createdAt'>) => Promise<string>;
  updateItem: (id: string, updates: Partial<Omit<MediaItem, 'id' | 'createdAt'>>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  /** Grant read access to a colleague, by email. */
  shareItem: (id: string, email: string) => Promise<ShareResult>;
  /** Revoke one person's access. */
  unshareItem: (id: string, userId: string) => Promise<ShareResult>;
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
      const res = await authFetch('/api/mediaItems');
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
      const res = await authFetch('/api/mediaItems', {
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
      const res = await authFetch(`/api/mediaItems/${id}`, {
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
      const res = await authFetch(`/api/mediaItems/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Media record removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete media item — restoring it';
      set({ items: previous, error: message });
      toast.error(message);
    }
  },

  // Both share calls return the whole updated record — the server recomputes
  // `sharedWith` and the viewer flags, so we replace rather than patch.
  shareItem: async (id, email) => {
    const r = await shareRecord<MediaItem>('mediaItems', id, email);
    if (r.ok && r.record) {
      set((state) => ({ items: state.items.map((m) => (m.id === id ? r.record! : m)) }));
    }
    return r;
  },

  unshareItem: async (id, userId) => {
    const r = await unshareRecord<MediaItem>('mediaItems', id, userId);
    if (r.ok && r.record) {
      set((state) => ({ items: state.items.map((m) => (m.id === id ? r.record! : m)) }));
    }
    return r;
  },
}));
