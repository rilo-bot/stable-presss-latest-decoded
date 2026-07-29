import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { StaffRole } from '@/rbac/roles';

/** One grantable action, as described by the server catalogue. */
export interface PermissionMeta {
  id: string;
  label: string;
  group: string;
  description: string;
}

/** One navigation surface a role can be given access to. */
export interface ModuleMeta {
  id: string;
  label: string;
  section: string;
  requiresPermission?: string;
}

export interface BuiltinRoleMeta {
  key: StaffRole;
  label: string;
  permissions: string[];
  modules: string[];
}

export interface CustomRole {
  id: string;
  key: string;
  label: string;
  description?: string;
  color?: string;
  permissions: string[];
  modules: string[];
  createdAt: string;
  updatedAt: string;
  assigneeCount?: number;
}

export interface RoleDraft {
  label: string;
  description?: string;
  color?: string;
  permissions: string[];
  modules: string[];
}

interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

interface RoleState {
  catalogue: { permissions: PermissionMeta[]; modules: ModuleMeta[]; builtinRoles: BuiltinRoleMeta[] } | null;
  roles: CustomRole[];
  loading: boolean;
  loaded: boolean;
  fetchCatalogue: () => Promise<void>;
  fetchRoles: () => Promise<void>;
  createRole: (draft: RoleDraft) => Promise<Result>;
  updateRole: (id: string, draft: RoleDraft) => Promise<Result>;
  deleteRole: (id: string) => Promise<Result>;
  assignRole: (roleId: string, userId: string) => Promise<Result>;
  unassignRole: (roleId: string, userId: string) => Promise<Result>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
}

/**
 * Role edits change what the CURRENT admin can see too (they may hold the role
 * they just edited), so re-resolve the session after any mutation.
 */
async function refreshSession() {
  await useAuthStore.getState().verifySession();
}

export const useRoleStore = create<RoleState>((set, get) => ({
  catalogue: null,
  roles: [],
  loading: false,
  loaded: false,

  fetchCatalogue: async () => {
    if (get().catalogue) return;
    try {
      const res = await authFetch('/api/roles/catalogue');
      if (!res.ok) return;
      set({ catalogue: await res.json() });
    } catch {
      /* ignore — the view renders an empty catalogue state */
    }
  },

  fetchRoles: async () => {
    set({ loading: true });
    try {
      const res = await authFetch('/api/roles');
      const data = res.ok ? await res.json() : null;
      set({ roles: Array.isArray(data?.roles) ? data.roles : [], loading: false, loaded: true });
    } catch {
      set({ loading: false, loaded: true });
    }
  },

  createRole: async (draft) => {
    try {
      const res = await authFetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not create the role.') };
      const data = await res.json().catch(() => null);
      await get().fetchRoles();
      return { ok: true, id: data?.role?.id };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  updateRole: async (id, draft) => {
    try {
      const res = await authFetch(`/api/roles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not save the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  deleteRole: async (id) => {
    try {
      const res = await authFetch(`/api/roles/${id}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not delete the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  assignRole: async (roleId, userId) => {
    try {
      const res = await authFetch(`/api/roles/${roleId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not assign the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  unassignRole: async (roleId, userId) => {
    try {
      const res = await authFetch(`/api/roles/${roleId}/assign/${userId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not remove the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
