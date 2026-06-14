import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { OrgRole, PartyRole } from '@/rbac/roles';

export interface OrgSummary {
  id: string;
  name: string;
  party_type: string;
  base_location?: string;
  myRole: OrgRole;
}

export interface OrgMember {
  userId: string;
  displayName: string;
  email: string;
  orgRole: OrgRole;
}

export interface ManagedParty {
  id: string;
  name: string;
  party_type: string;
  roles: PartyRole[];
  managedByOrgId: string;
}

export interface OrgDetail {
  org: { id: string; name: string; base_location?: string; profession?: string };
  members: OrgMember[];
  managedParties: ManagedParty[];
  horseIds: string[];
}

interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

interface OrgState {
  mine: OrgSummary[];
  detail: OrgDetail | null;
  loading: boolean;
  createOrg: (data: { name: string; base_location?: string }) => Promise<Result>;
  fetchMine: () => Promise<void>;
  fetchOrg: (id: string) => Promise<void>;
  addMember: (orgId: string, email: string, orgRole: OrgRole) => Promise<Result>;
  removeMember: (orgId: string, userId: string) => Promise<Result>;
  createManagedParty: (
    orgId: string,
    data: { name: string; roles: PartyRole[] },
  ) => Promise<Result>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
}

export const useOrgStore = create<OrgState>((set, get) => ({
  mine: [],
  detail: null,
  loading: false,

  createOrg: async (data) => {
    try {
      const res = await authFetch('/api/organisations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: body?.error ?? 'Could not create the organisation.' };
      // Creator gained an org_owner membership — refresh the session.
      await useAuthStore.getState().verifySession();
      return { ok: true, id: body?.org?.id };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  fetchMine: async () => {
    try {
      const res = await authFetch('/api/organisations/mine');
      const data = res.ok ? await res.json() : [];
      set({ mine: Array.isArray(data) ? data : [] });
    } catch {
      /* ignore */
    }
  },

  fetchOrg: async (id) => {
    set({ loading: true });
    try {
      const res = await authFetch(`/api/organisations/${id}`);
      const data = res.ok ? await res.json() : null;
      set({ detail: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addMember: async (orgId, email, orgRole) => {
    try {
      const res = await authFetch(`/api/organisations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, orgRole }),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not add the member.') };
      await get().fetchOrg(orgId);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  removeMember: async (orgId, userId) => {
    try {
      const res = await authFetch(`/api/organisations/${orgId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not remove the member.') };
      await get().fetchOrg(orgId);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  createManagedParty: async (orgId, data) => {
    try {
      const res = await authFetch(`/api/organisations/${orgId}/managed-parties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not add the party.') };
      await get().fetchOrg(orgId);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
