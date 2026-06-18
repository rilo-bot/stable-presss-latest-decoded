import { create } from 'zustand';
import { toast } from 'sonner';
import type { Horse } from '@/types/horse';
import { authFetch, authFetchRetry } from '@/lib/api';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';

interface HorseState {
  horses: Horse[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  /** Pass force=true to refetch even when already loaded (e.g. after login, so a
   *  member's own unverified/draft horses appear with the now-attached token). */
  fetchHorses: (force?: boolean) => Promise<void>;
  addHorse: (horse: Omit<Horse, 'id' | 'createdAt'>) => Promise<Horse | null>;
  updateHorse: (id: string, updates: Partial<Omit<Horse, 'id' | 'createdAt'>>) => Promise<void>;
  removeHorse: (id: string) => Promise<void>;
}

export const useHorseStore = create<HorseState>()((set, get) => ({
  horses: [],
  loading: false,
  error: null,
  loaded: false,

  // Guard mirrors the link store: in-flight calls dedupe; an already-loaded list
  // is reused unless force=true. A FAILED load leaves loaded=false so the next
  // mount retries — and the GET itself retries transient cold-start 5xx/network
  // errors (authFetchRetry), the usual "sometimes the horses don't load" cause.
  fetchHorses: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetchRetry('/api/horses');
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
      // The server auto-links the creating party (under its role). Force-refetch
      // links so the new connection shows immediately on the horse's page.
      void useHorsePartyLinkStore.getState().fetchHorsePartyLinks(true);
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