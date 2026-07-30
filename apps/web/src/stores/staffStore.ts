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
  invitedByName?: string;
  /** When the emailed link stops working. */
  expiresAt?: string;
  /** Server-computed — an expired invite needs resending, not waiting on. */
  expired: boolean;
  lastSentAt?: string;
}

interface Result {
  ok: boolean;
  error?: string;
  /** False when the invite was saved but no email went out. */
  emailed?: boolean;
  /** 'immediate' = they already had an account, so the role applies now. */
  applied?: 'immediate' | 'pending';
}

interface StaffState {
  staff: StaffUser[];
  pending: PendingGrant[];
  loading: boolean;
  /** False when the server has no mail provider — invites save but don't send. */
  emailConfigured: boolean;
  fetchStaff: () => Promise<void>;
  invite: (email: string, slug: string) => Promise<Result>;
  resendInvite: (id: string) => Promise<Result>;
  cancelInvite: (id: string) => Promise<Result>;
  /** Re-send an existing member's "you have access" email. No token involved. */
  resendAccess: (userId: string) => Promise<Result>;
  /** Revoke every role. The account survives; they drop back to reader. */
  removeMember: (userId: string) => Promise<Result>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  staff: [],
  pending: [],
  loading: false,
  emailConfigured: true,

  fetchStaff: async () => {
    set({ loading: true });
    try {
      const res = await authFetch('/api/staff');
      const data = res.ok ? await res.json() : { staff: [], pending: [] };
      set({
        staff: data.staff ?? [],
        pending: data.pending ?? [],
        emailConfigured: data.emailConfigured !== false,
        loading: false,
      });
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
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 502 means the invite WAS saved but the email failed. Refresh so the
        // new row shows up with a Resend button, and report it as a partial
        // success rather than a failure the admin might retry into a duplicate.
        await get().fetchStaff();
        return {
          ok: false,
          error: data?.error ?? 'Could not send the invite.',
          emailed: false,
          applied: data?.applied,
        };
      }
      await get().fetchStaff();
      return { ok: true, emailed: data?.emailed !== false, applied: data?.applied };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  resendInvite: async (id) => {
    try {
      const res = await authFetch(`/api/staff/pending/${id}/resend`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: data?.error ?? 'Could not resend the invite.' };
      await get().fetchStaff();
      return { ok: true, emailed: data?.emailed !== false };
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

  resendAccess: async (userId) => {
    try {
      const res = await authFetch(`/api/staff/member/${userId}/resend`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: data?.error ?? 'Could not send the email.' };
      return { ok: true, emailed: data?.emailed !== false };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  removeMember: async (userId) => {
    try {
      const res = await authFetch(`/api/staff/member/${userId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not remove them.') };
      await get().fetchStaff();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
