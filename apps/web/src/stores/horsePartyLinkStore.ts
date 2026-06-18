import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch, authFetchRetry } from '@/lib/api';
import type { HorsePartyLink } from '@/types/horsePartyLink';

interface HorsePartyLinkState {
  links: HorsePartyLink[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  /** Pass force=true to refetch even when already loaded (e.g. after a server
   *  side-effect created a link, like horse registration auto-linking the owner). */
  fetchHorsePartyLinks: (force?: boolean) => Promise<void>;
  addLink: (
    link: Omit<HorsePartyLink, 'id' | 'createdAt'>
  ) => Promise<string>;
  updateLink: (
    id: string,
    updates: Partial<Omit<HorsePartyLink, 'id' | 'createdAt'>>
  ) => Promise<void>;
  removeLink: (id: string) => Promise<boolean>;
  /** Returns all links for a given horse */
  getLinksForHorse: (horseId: string) => HorsePartyLink[];
  /** Returns all links for a given party */
  getLinksForParty: (partyId: string) => HorsePartyLink[];
}

export const useHorsePartyLinkStore = create<HorsePartyLinkState>()(
  (set, get) => ({
    links: [],
    loading: false,
    error: null,
    loaded: false,

    fetchHorsePartyLinks: async (force = false) => {
      if (get().loading) return;
      if (get().loaded && !force) return;
      set({ loading: true, error: null });
      try {
        const res = await authFetchRetry('/api/horsePartyLinks');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const links = await res.json();
        set({ links, loading: false, loaded: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load';
        set({ loading: false, error: message });
        toast.error(message);
      }
    },

    addLink: async (link) => {
      try {
        const res = await authFetch('/api/horsePartyLinks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(link),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created: HorsePartyLink = await res.json();
        set((state) => ({ links: [...state.links, created] }));
        return created.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create link';
        set({ error: message });
        toast.error(message);
        return '';
      }
    },

    updateLink: async (id, updates) => {
      const previous = get().links;
      set((state) => ({
        links: state.links.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      }));
      try {
        const res = await authFetch(`/api/horsePartyLinks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated: HorsePartyLink = await res.json();
        set((state) => ({
          links: state.links.map((l) => (l.id === id ? updated : l)),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update link';
        set({ links: previous, error: message });
        toast.error(message);
      }
    },

    removeLink: async (id) => {
      const previous = get().links;
      set((state) => ({ links: state.links.filter((l) => l.id !== id) }));
      try {
        const res = await authFetch(`/api/horsePartyLinks/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not delete the link — restoring it';
        set({ links: previous, error: message });
        toast.error('Could not delete the link — restoring it');
        return false;
      }
    },

    getLinksForHorse: (horseId) =>
      get().links.filter((l) => l.horse_id === horseId),

    getLinksForParty: (partyId) =>
      get().links.filter((l) => l.party_id === partyId),
  })
);