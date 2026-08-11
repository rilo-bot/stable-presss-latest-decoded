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

export type Verb = 'view' | 'create' | 'edit' | 'delete' | 'publish';

/**
 * ONE ROW OF THE GRID — a screen, and the verbs it supports.
 *
 * This is the whole shape the console needs: `verbs` says which columns this row
 * draws, so a row can never offer a checkbox the server would ignore. Mirrors
 * SCREEN_CATALOGUE in apps/server/src/lib/permissionCatalogue.ts.
 */
export interface ScreenMeta {
  id: string;
  label: string;
  section: string;
  verbs: Verb[];
  /** Records here have an author, so the Own/All control applies. */
  scoped?: boolean;
  /** This screen shows another screen's records; its actions use THAT screen's verbs. */
  lensOver?: string;
  description: string;
}

/** A role as stored in the database. Every role in the platform is one of these. */
export interface Role {
  id: string;
  name: string;
  label: string;
  description?: string;
  color?: string;
  icon?: string;
  /** Seeded role — cannot be deleted (but may be edited). */
  isSystem: boolean;
  /** Superadmin — cannot be edited or deleted. */
  isImmutable: boolean;
  permissions: string[];
  /** Per-screen reach of view/edit/delete. Absent means 'own'. */
  scopes: Record<string, 'own' | 'all'>;
  /** DERIVED server-side from each `<id>.view`; read-only here. */
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
  scopes: Record<string, 'own' | 'all'>;
}

interface Result {
  ok: boolean;
  error?: string;
  name?: string;
}

interface Catalogue {
  /** The grid: one entry per row, in sidebar order. */
  screens: ScreenMeta[];
  /** Column order. */
  verbs: Verb[];
  /** The flat list, for anything that still renders ids rather than the grid. */
  permissions: PermissionMeta[];
}

interface RoleState {
  catalogue: Catalogue | null;
  roles: Role[];
  loading: boolean;
  loaded: boolean;
  fetchCatalogue: () => Promise<void>;
  fetchRoles: () => Promise<void>;
  createRole: (draft: RoleDraft) => Promise<Result>;
  updateRole: (name: string, draft: RoleDraft) => Promise<Result>;
  deleteRole: (name: string) => Promise<Result>;
  /** One role per person — this REPLACES whatever they held, it doesn't add. */
  assignRole: (name: string, userId: string) => Promise<Result>;
  unassignRole: (name: string, userId: string) => Promise<Result>;
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
      return { ok: true, name: data?.role?.name };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  updateRole: async (name, draft) => {
    try {
      const res = await authFetch(`/api/roles/${name}`, {
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

  deleteRole: async (name) => {
    try {
      const res = await authFetch(`/api/roles/${name}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not delete the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },

  assignRole: async (name, userId) => {
    try {
      const res = await authFetch(`/api/roles/${name}/assign`, {
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

  unassignRole: async (name, userId) => {
    try {
      const res = await authFetch(`/api/roles/${name}/assign/${userId}`, { method: 'DELETE' });
      if (!res.ok) return { ok: false, error: await readError(res, 'Could not remove the role.') };
      await get().fetchRoles();
      await refreshSession();
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  },
}));
