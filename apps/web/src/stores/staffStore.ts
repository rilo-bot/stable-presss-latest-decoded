import { create } from 'zustand';
import { authFetch } from '@/lib/api';

export interface StaffUser {
  userId: string;
  displayName: string;
  email: string;
  /** Role SLUGS into the server's `roles` collection. */
  staffRoles: string[];
}

export interface PendingGrant {
  id: string;
  email: string;
  /** Role SLUG. Re-validated against the live registry at sign-in. */
  role: string;
}

interface Result {
  ok: boolean;
  error?: string;
}

interface StaffState {
  staff: StaffUser[];
  pending: PendingGrant[];
  loading: boolean;
  fetchStaff: () => Promise<void>;
  invite: (email: string, slug: string) => Promise<Result>;
  cancelInvite: (id: string) => Promise<Result>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  staff: [],
  pending: [],
  loading: false,

  fetchStaff: async () => {
    set({ loading: true });
    try {
      const res = await authFetch('/api/staff');
      const data = res.ok ? await res.json() : { staff: [], pending: [] };
      set({ staff: data.staff ?? [], pending: data.pending ?? [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  invite: async (email, slug) => {
    try {
      const res = await authFetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: slug }),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not send the invite.') };
      await get().fetchStaff();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  cancelInvite: async (id) => {
    try {
      const res = await authFetch(`/api/staff/pending/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not cancel the invite.') };
      await get().fetchStaff();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
