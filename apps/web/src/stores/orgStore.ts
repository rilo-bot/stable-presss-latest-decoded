import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { PartyRow } from '@/stores/authStore';
import type { OrgRole, PartyRole } from '@/rbac/roles';

/**
 * Mirrors the `organisations` collection: name, owner, description, bio. There
 * is no location or profession on an org — those belong to a person.
 */
export interface OrgSummary {
  id: string;
  name: string;
  description?: string;
  bio?: string;
  myRole: OrgRole;
}

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
}

export interface OrgDetail {
  org: { id: string; name: string; description?: string; bio?: string };
  members: OrgMember[];
  /** Register edges this org fields, with the person joined in. */
  parties: PartyRow[];
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
  createOrg: (data: { name: string; description?: string; bio?: string }) => Promise<Result>;
  fetchMine: () => Promise<void>;
  fetchOrg: (id: string) => Promise<void>;
  addMember: (orgId: string, email: string, role: OrgRole) => Promise<Result>;
  removeMember: (orgId: string, userId: string) => Promise<Result>;
  /**
   * Field someone in the register under this org. ONE role per entry — the row
   * is an edge, so a person who both trains and owns gets two.
   */
  addOrgParty: (
    orgId: string,
    data: { personId: string; role: PartyRole; horseId?: string } | { name: string; role: PartyRole; horseId?: string },
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
      // The creator gained an owner membership — refresh the session so scope
      // resolution picks it up.
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

  addMember: async (orgId, email, role) => {
    try {
      const res = await authFetch(`/api/organisations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `role`, not `orgRole`: the server reads `body.role` and defaults an
        // unrecognised value to 'member', so the wrong key silently demoted
        // every owner and manager it was asked to add.
        body: JSON.stringify({ email, role }),
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

  addOrgParty: async (orgId, data) => {
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
