import { create } from 'zustand';
import type { Party } from '@/types/party';
import { authFetch } from '@/lib/api';
import { toast } from 'sonner';

interface PartyState {
  parties: Party[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  fetchParties: (force?: boolean) => Promise<void>;
  addParty: (party: Omit<Party, 'id' | 'createdAt'>) => Promise<string>;
  updateParty: (id: string, updates: Partial<Omit<Party, 'id' | 'createdAt'>>) => Promise<void>;
  removeParty: (id: string) => Promise<boolean>;
}

export const usePartyStore = create<PartyState>()((set, get) => ({
  parties: [],
  loading: false,
  error: null,
  loaded: false,

  fetchParties: async (force?: boolean) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetch('/api/parties');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parties = await res.json();
      set({ parties, loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load parties';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  addParty: async (party) => {
    try {
      const res = await authFetch('/api/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(party),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: Party = await res.json();
      set((state) => ({ parties: [...state.parties, created] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add party';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateParty: async (id, updates) => {
    const previous = get().parties;
    set((state) => ({
      parties: state.parties.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    try {
      const res = await authFetch(`/api/parties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Party = await res.json();
      set((state) => ({
        parties: state.parties.map((p) => (p.id === id ? updated : p)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update party';
      set({ parties: previous, error: message });
      toast.error(message);
    }
  },

  removeParty: async (id) => {
    const previous = get().parties;
    set((state) => ({ parties: state.parties.filter((p) => p.id !== id) }));
    try {
      const res = await authFetch(`/api/parties/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the party — restoring it';
      set({ parties: previous, error: message });
      toast.error('Could not delete the party — restoring it');
      return false;
    }
  },
}));