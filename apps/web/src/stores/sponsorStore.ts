import { create } from 'zustand';
import { toast } from 'sonner';
import type { Sponsor } from '@/types/sponsor';
import { authFetch } from '@/lib/api';

interface SponsorState {
  sponsors: Sponsor[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchSponsors: () => Promise<void>;
  addSponsor: (sponsor: Omit<Sponsor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSponsor: (id: string, updates: Partial<Omit<Sponsor, 'id' | 'createdAt'>>) => Promise<void>;
  removeSponsor: (id: string) => Promise<void>;
}

export const useSponsorStore = create<SponsorState>()((set, get) => ({
  sponsors: [],
  loading: false,
  loaded: false,
  error: null,

  fetchSponsors: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/sponsors');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sponsors = await res.json();
      set({ sponsors, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sponsors';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addSponsor: async (sponsor) => {
    try {
      const res = await authFetch('/api/sponsors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sponsor),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: Sponsor = await res.json();
      set((state) => ({ sponsors: [...state.sponsors, created] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add sponsor';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateSponsor: async (id, updates) => {
    const previous = get().sponsors;
    set((state) => ({ sponsors: state.sponsors.map((s) => (s.id === id ? { ...s, ...updates } : s)) }));
    try {
      const res = await authFetch(`/api/sponsors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Sponsor = await res.json();
      set((state) => ({ sponsors: state.sponsors.map((s) => (s.id === id ? updated : s)) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sponsor';
      set({ sponsors: previous, error: message });
      toast.error(message);
    }
  },

  removeSponsor: async (id) => {
    const previous = get().sponsors;
    set((state) => ({ sponsors: state.sponsors.filter((s) => s.id !== id) }));
    try {
      const res = await authFetch(`/api/sponsors/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Sponsor removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete sponsor — restoring it';
      set({ sponsors: previous, error: message });
      toast.error(message);
    }
  },
}));
