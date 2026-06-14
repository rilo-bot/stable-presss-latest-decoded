import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import type { StaffRole } from '@/rbac/roles';

export interface StaffUser {
  userId: string;
  displayName: string;
  email: string;
  staffRoles: StaffRole[];
}

export interface PendingGrant {
  email: string;
  role: StaffRole;
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
  grant: (email: string, role: StaffRole) => Promise<Result>;
  revoke: (userId: string, role: StaffRole) => Promise<Result>;
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

  grant: async (email, role) => {
    try {
      const res = await authFetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not grant the role.') };
      await get().fetchStaff();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  revoke: async (userId, role) => {
    try {
      const res = await authFetch(`/api/staff/${userId}/roles/${role}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not revoke the role.') };
      await get().fetchStaff();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
