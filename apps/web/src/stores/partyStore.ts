import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch, authFetchRetry } from '@/lib/api';
import { useAuthStore, type PartyRow } from '@/stores/authStore';
import type { PartyRole } from '@/types/party';

/** What a client may write on an edge. `taken`/`userId` are claim-only. */
export interface PartyDraft {
  personId: string;
  role: PartyRole;
  orgId?: string;
  horseId?: string;
}

/**
 * The register: party EDGES, one per person × role × horse. The person's name
 * and photo ride along on each row, resolved server-side — they are read-only
 * projections, so edit the person through peopleStore, not here.
 */
interface PartyState {
  parties: PartyRow[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  fetchParties: (force?: boolean) => Promise<void>;
  addParty: (party: PartyDraft) => Promise<string>;
  updateParty: (id: string, updates: PartyDraft) => Promise<void>;
  removeParty: (id: string) => Promise<boolean>;
  /** "This is me." Immediate — there is no verification step. */
  claimParty: (id: string) => Promise<{ ok: boolean; error?: string }>;
  releaseParty: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
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
      const res = await authFetchRetry('/api/parties');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ parties: await res.json(), loading: false, loaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load the register';
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
      if (!res.ok) throw new Error(await readError(res, `HTTP ${res.status}`));
      const created: PartyRow = await res.json();
      set((s) => ({ parties: [...s.parties, created] }));
      return created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add the register entry';
      set({ error: message });
      toast.error(message);
      return '';
    }
  },

  updateParty: async (id, updates) => {
    const previous = get().parties;
    set((s) => ({ parties: s.parties.map((p) => (p.id === id ? { ...p, ...updates } : p)) }));
    try {
      const res = await authFetch(`/api/parties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(await readError(res, `HTTP ${res.status}`));
      const updated: PartyRow = await res.json();
      set((s) => ({ parties: s.parties.map((p) => (p.id === id ? updated : p)) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update the register entry';
      set({ parties: previous, error: message });
      toast.error(message);
    }
  },

  removeParty: async (id) => {
    const previous = get().parties;
    set((s) => ({ parties: s.parties.filter((p) => p.id !== id) }));
    try {
      const res = await authFetch(`/api/parties/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, `HTTP ${res.status}`));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the entry — restoring it';
      set({ parties: previous, error: message });
      toast.error(message);
      return false;
    }
  },

  claimParty: async (id) => {
    try {
      const res = await authFetch(`/api/parties/${id}/claim`, { method: 'POST' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not claim that entry.') };
      const updated: PartyRow = await res.json();
      set((s) => ({ parties: s.parties.map((p) => (p.id === id ? updated : p)) }));
      // The claim widens what this account can reach, and scope is resolved
      // server-side — so the session must be re-read, not patched locally.
      await useAuthStore.getState().verifySession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  releaseParty: async (id) => {
    try {
      const res = await authFetch(`/api/parties/${id}/release`, { method: 'POST' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not release that entry.') };
      const updated: PartyRow = await res.json();
      set((s) => ({ parties: s.parties.map((p) => (p.id === id ? updated : p)) }));
      await useAuthStore.getState().verifySession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
