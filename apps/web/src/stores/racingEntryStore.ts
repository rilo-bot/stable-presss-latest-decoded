import { create } from 'zustand';
import { toast } from 'sonner';
import type { RacingEntry } from '@/types/racingEntry';
import { apiUrl } from '@/lib/api';

interface RacingEntryState {
  entries: RacingEntry[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchEntries: () => Promise<void>;
  addEntry: (entry: Omit<RacingEntry, 'id' | 'createdAt'>) => Promise<string>;
  updateEntry: (id: string, updates: Partial<Omit<RacingEntry, 'id' | 'createdAt'>>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
}

export const useRacingEntryStore = create<RacingEntryState>()((set, get) => ({
  entries: [],
  loading: false,
  loaded: false,
  error: null,

  fetchEntries: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch(apiUrl('/api/racingEntries'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entries = await res.json();
      set({ entries, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load racing entries';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addEntry: async (entry) => {
    try {
      const res = await fetch(apiUrl('/api/racingEntries'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: RacingEntry = await res.json();
      set((state) => ({ entries: [created, ...state.entries] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add racing entry';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateEntry: async (id, updates) => {
    const previous = get().entries;
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
    try {
      const res = await fetch(apiUrl(`/api/racingEntries/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: RacingEntry = await res.json();
      set((state) => ({
        entries: state.entries.map((e) => (e.id === id ? updated : e)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update racing entry';
      set({ entries: previous, error: message });
      toast.error(message);
    }
  },

  removeEntry: async (id) => {
    const previous = get().entries;
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
    try {
      const res = await fetch(apiUrl(`/api/racingEntries/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Racing record removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete racing entry — restoring it';
      set({ entries: previous, error: message });
      toast.error(message);
    }
  },
}));
