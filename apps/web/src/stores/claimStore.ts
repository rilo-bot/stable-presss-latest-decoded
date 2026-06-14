import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { PartyRole } from '@/rbac/roles';

/** A pending claim as returned by the verification queue (with claimant + party info). */
export interface PendingClaim {
  id: string;
  partyId: string;
  role: PartyRole;
  status: 'pending' | 'verified' | 'rejected';
  evidenceUrl?: string;
  userId: string;
  claimantName: string;
  claimantEmail: string;
  partyName?: string;
}

interface Result {
  ok: boolean;
  error?: string;
}

interface ClaimState {
  pending: PendingClaim[];
  loading: boolean;
  /** Submit a party-role claim for the current user (creates a pending claim). */
  createClaim: (
    role: PartyRole,
    opts?: { evidenceUrl?: string; partyName?: string; partyId?: string },
  ) => Promise<Result>;
  fetchPending: () => Promise<void>;
  verifyClaim: (id: string) => Promise<Result>;
  rejectClaim: (id: string, reason?: string) => Promise<Result>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
}

export const useClaimStore = create<ClaimState>((set, get) => ({
  pending: [],
  loading: false,

  createClaim: async (role, opts = {}) => {
    try {
      const res = await authFetch('/api/partyClaims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, ...opts }),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not submit your claim.') };
      // Refresh the session so currentUser.partyClaims reflects the new pending claim.
      await useAuthStore.getState().verifySession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  fetchPending: async () => {
    set({ loading: true });
    try {
      const res = await authFetch('/api/partyClaims/pending');
      const data = res.ok ? await res.json() : [];
      set({ pending: Array.isArray(data) ? data : [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  verifyClaim: async (id) => {
    try {
      const res = await authFetch(`/api/partyClaims/${id}/verify`, { method: 'POST' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not verify the claim.') };
      await get().fetchPending();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  rejectClaim: async (id, reason) => {
    try {
      const res = await authFetch(`/api/partyClaims/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not reject the claim.') };
      await get().fetchPending();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
