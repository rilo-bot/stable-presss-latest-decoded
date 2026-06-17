import { create } from 'zustand';
import { toast } from 'sonner';
import type { Horse } from '@/types/horse';
import { authFetch } from '@/lib/api';

interface HorseState {
  horses: Horse[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  fetchHorses: () => Promise<void>;
  addHorse: (horse: Omit<Horse, 'id' | 'createdAt'>) => Promise<Horse | null>;
  updateHorse: (id: string, updates: Partial<Omit<Horse, 'id' | 'createdAt'>>) => Promise<void>;
  removeHorse: (id: string) => Promise<void>;
}

export const useHorseStore = create<HorseState>()((set, get) => ({
  horses: [],
  loading: false,
  error: null,
  loaded: false,

  fetchHorses: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/horses');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const horses = await res.json();
      set({ horses, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load horses';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addHorse: async (horse) => {
    try {
      const res = await authFetch('/api/horses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(horse),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: Horse = await res.json();
      set((state) => ({ horses: [...state.horses, created] }));
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add horse';
      set({ error: message });
      toast.error(message);
      return null;
    }
  },

  updateHorse: async (id, updates) => {
    const previous = get().horses;
    set((state) => ({
      horses: state.horses.map((h) => (h.id === id ? { ...h, ...updates } : h)),
    }));
    try {
      const res = await authFetch(`/api/horses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Horse = await res.json();
      set((state) => ({
        horses: state.horses.map((h) => (h.id === id ? updated : h)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update horse';
      set({ horses: previous, error: message });
      toast.error(message);
    }
  },

  removeHorse: async (id) => {
    const previous = get().horses;
    set((state) => ({ horses: state.horses.filter((h) => h.id !== id) }));
    try {
      const res = await authFetch(`/api/horses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the horse — restoring it';
      set({ horses: previous, error: message });
      toast.error('Could not delete the horse — restoring it');
    }
  },
}));