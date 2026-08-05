import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch, authFetchRetry } from '@/lib/api';
import type { Person } from '@/types/party';

/**
 * The people behind the register. Separate from partyStore because a person is
 * one row and their roles are many — editing a profile is one write, wherever
 * they appear.
 */
interface PeopleState {
  people: Person[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  fetchPeople: (force?: boolean) => Promise<void>;
  byId: (id: string | undefined) => Person | undefined;
  addPerson: (person: Omit<Person, 'id'>) => Promise<string>;
  updatePerson: (id: string, updates: Partial<Omit<Person, 'id'>>) => Promise<void>;
  removePerson: (id: string) => Promise<boolean>;
}

export const usePeopleStore = create<PeopleState>()((set, get) => ({
  people: [],
  loading: false,
  error: null,
  loaded: false,

  fetchPeople: async (force?: boolean) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const res = await authFetchRetry('/api/people');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ people: await res.json(), loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load people';
      set({ loading: false, error: message });
      toast.error(message);
    }
  },

  byId: (id) => (id ? get().people.find((p) => p.id === id) : undefined),

  addPerson: async (person) => {
    try {
      const res = await authFetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(person),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: Person = await res.json();
      set((s) => ({ people: [...s.people, created] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add the person';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updatePerson: async (id, updates) => {
    const previous = get().people;
    set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...updates } : p)) }));
    try {
      // PUT is a full replace on the server, so send the merged record rather
      // than the patch — a partial body would blank every field left out.
      const merged = get().people.find((p) => p.id === id);
      const res = await authFetch(`/api/people/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Person = await res.json();
      set((s) => ({ people: s.people.map((p) => (p.id === id ? updated : p)) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update the person';
      set({ people: previous, error: message });
      toast.error(message);
    }
  },

  removePerson: async (id) => {
    const previous = get().people;
    set((s) => ({ people: s.people.filter((p) => p.id !== id) }));
    try {
      const res = await authFetch(`/api/people/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // 409 when register entries still point here — surface the real reason.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove the person';
      set({ people: previous, error: message });
      toast.error(message);
      return false;
    }
  },
}));
