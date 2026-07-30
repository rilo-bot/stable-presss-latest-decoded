import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

/**
 * One grantable action, as described by the server catalogue.
 * `resource` is the grid row it belongs to; `short` is its checkbox caption.
 */
export interface PermissionMeta {
  id: string;
  label: string;
  resource: string;
  short: string;
  description: string;
}

/** One navigation surface a role can be given access to. */
export interface ModuleMeta {
  id: string;
  label: string;
  section: string;
  requiresPermission?: string;
}

/** One Kanban column a role can be given visibility of. */
export interface WorkflowStageMeta {
  id: string;
  label: string;
}

/** A role as stored in the database. Every role in the platform is one of these. */
export interface Role {
  id: string;
  slug: string;
  label: string;
  description?: string;
  color?: string;
  icon?: string;
  /** Seeded role — cannot be deleted (but may be edited). */
  isSystem: boolean;
  /** Superadmin — cannot be edited or deleted. */
  isImmutable: boolean;
  permissions: string[];
  modules: string[];
  workflowStages: string[];
  createdAt: string;
  updatedAt: string;
  assigneeCount?: number;
}

export interface RoleDraft {
  label: string;
  description?: string;
  color?: string;
  icon?: string;
  permissions: string[];
  modules: string[];
  workflowStages: string[];
}

interface Result {
  ok: boolean;
  error?: string;
  slug?: string;
}

interface Catalogue {
  permissions: PermissionMeta[];
  modules: ModuleMeta[];
  workflowStages: WorkflowStageMeta[];
}

interface RoleState {
  catalogue: Catalogue | null;
  roles: Role[];
  loading: boolean;
  loaded: boolean;
  fetchCatalogue: () => Promise<void>;
  fetchRoles: () => Promise<void>;
  createRole: (draft: RoleDraft) => Promise<Result>;
  updateRole: (slug: string, draft: RoleDraft) => Promise<Result>;
  deleteRole: (slug: string) => Promise<Result>;
  /** One role per person — this REPLACES whatever they held, it doesn't add. */
  assignRole: (slug: string, userId: string) => Promise<Result>;
  unassignRole: (slug: string, userId: string) => Promise<Result>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return data?.error ?? fallback;
}

/**
 * Any role mutation can change what the ACTING admin sees (they may hold the
 * role they just edited), so re-resolve the session afterwards.
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
      return { ok: true, slug: data?.role?.slug };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  updateRole: async (slug, draft) => {
    try {
      const res = await authFetch(`/api/roles/${slug}`, {
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

  deleteRole: async (slug) => {
    try {
      const res = await authFetch(`/api/roles/${slug}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not delete the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  assignRole: async (slug, userId) => {
    try {
      const res = await authFetch(`/api/roles/${slug}/assign`, {
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

  unassignRole: async (slug, userId) => {
    try {
      const res = await authFetch(`/api/roles/${slug}/assign/${userId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not remove the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
