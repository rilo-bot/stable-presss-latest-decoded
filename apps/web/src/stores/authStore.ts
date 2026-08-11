import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiUrl } from '@/lib/api';
import type { PartyRole, OrgRole } from '@/rbac/roles';

/**
 * One row of the racing register: an EDGE joining a person to a role, and
 * optionally to a horse and an org. One row per person × role × horse.
 *
 * `name` and `imageUrl` are the PERSON's, resolved server-side at read time and
 * never stored on the edge — treat them as read-only projections and edit the
 * person through peopleStore. There is no pending/verified state: a row is
 * claimed or it is not.
 *
 * Mirrors `PartyRow` in apps/server/src/lib/identity.ts.
 */
export interface PartyRow {
  id: string;
  personId: string;
  name: string;
  imageUrl?: string;
  role: PartyRole;
  taken: boolean;
  userId?: string;
  orgId?: string;
  horseId?: string;
}

/** Membership of one organisation. Mirrors `OrgMemberRow` on the server. */
export interface OrgMember {
  id: string;
  orgId: string;
  role: OrgRole;
}

/** The admin role the user holds, for display. Keyed by `name`, not a slug. */
export interface AssignedRole {
  name: string;
  label: string;
  color?: string;
  /** A lucide icon NAME — resolved to a component by lib/roleDisplay.tsx. */
  icon?: string;
}

/**
 * What the signed-in user may actually do, resolved SERVER-side. This is the
 * ONLY source of permission truth on the client — there is no local role matrix,
 * because roles are rows in a database that a superadmin edits at runtime.
 */
export interface ResolvedAccess {
  /** Granted action ids, e.g. 'stories.publish'. */
  permissions: string[];
  /**
   * How far each screen's verbs reach: 'own' (the default) or 'all'. This is
   * what replaced the `edit_own` / `edit_any` pairs — one verb, plus a scope.
   */
  scopes: Record<string, 'own' | 'all'>;
  /** Navigation surfaces the user may open — DERIVED from each `<id>.view`. */
  modules: string[];
  /** Kanban columns the user may see. */
  workflowStages: string[];
  /** Unrestricted access. Rendered as a badge; enforcement is server-side. */
  isSuperAdmin: boolean;
  /** The role itself, for display (label, colour, icon). At most one. */
  roles: AssignedRole[];
}

/**
 * The signed-in account. Mirrors `toClientUser` in
 * apps/server/src/lib/effectiveAccess.ts — keep the two in step.
 *
 * There are exactly TWO categories of account: users, and admins. `isAdmin` is
 * the whole test, and the server derives it from `users.roleId` rather than
 * storing it, so it cannot drift from the role the account actually holds.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  /** Holds an admin role. Server-derived — never sent up, never stored. */
  isAdmin: boolean;
  lastLogin: string | null;
  /** Racing roles, derived from the register rows below. Display only. */
  roles: PartyRole[];
  parties: PartyRow[];
  orgMembers: OrgMember[];
  /** Server-resolved effective access. Absent only on a partial payload. */
  access?: ResolvedAccess;
}

/**
 * Normalize a raw user payload from the API into a complete AuthUser.
 *
 * `previous` carries forward `access` when an endpoint returns a user object
 * without it, so a partial response cannot blank the whole navigation until the
 * next session check.
 */
function hydrateUser(raw: any, previous?: AuthUser | null): AuthUser {
  const rawAccess = raw?.access;
  const access: ResolvedAccess | undefined = rawAccess
    ? {
        permissions: Array.isArray(rawAccess.permissions) ? rawAccess.permissions : [],
        scopes:
          rawAccess.scopes && typeof rawAccess.scopes === 'object' ? rawAccess.scopes : {},
        modules: Array.isArray(rawAccess.modules) ? rawAccess.modules : [],
        workflowStages: Array.isArray(rawAccess.workflowStages) ? rawAccess.workflowStages : [],
        isSuperAdmin: rawAccess.isSuperAdmin === true,
        roles: Array.isArray(rawAccess.roles) ? rawAccess.roles : [],
      }
    : previous?.access;

  return {
    id: String(raw?.id ?? ''),
    email: String(raw?.email ?? ''),
    name: String(raw?.name ?? ''),
    createdAt: String(raw?.createdAt ?? ''),
    isAdmin: raw?.isAdmin === true,
    lastLogin: typeof raw?.lastLogin === 'string' ? raw.lastLogin : null,
    roles: Array.isArray(raw?.roles) ? raw.roles : [],
    parties: Array.isArray(raw?.parties) ? raw.parties : [],
    orgMembers: Array.isArray(raw?.orgMembers) ? raw.orgMembers : [],
    access,
  };
}

export interface OtpRequestResult {
  ok: boolean;
  error?: string;
  /** Present only in dev (when email isn't configured) — shows the code in the UI. */
  devCode?: string;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

export interface AcceptInviteResult extends VerifyResult {
  /** Where the invite pointed, if anywhere — e.g. a shared magazine. */
  redirectTo?: string;
}

interface AuthState {
  currentUser: AuthUser | null;
  token: string | null;

  /**
   * Step 1 — ask the server to email a one-time code. LOGIN AND SIGNUP BOTH.
   *
   * There is no `mode`: the server decides whether this address needs an account
   * when the code is spent, so the two screens differ only in whether they pass
   * `name` (and an account created without one gets a name derived from the
   * address). Was `requestLoginOtp` + `requestSignupOtp`, which differed by one
   * field and a string literal.
   *
   * Signing up grants NO role. Becoming an admin means `users.roleId`, which only
   * an existing admin can set.
   */
  requestOtp: (email: string, name?: string) => Promise<OtpRequestResult>;
  /** Step 2 — Verify the code; on success stores the user + JWT. */
  verifyOtp: (email: string, code: string) => Promise<VerifyResult>;
  /**
   * Redeem a team-invite link. One call replaces the whole OTP round trip: the
   * server creates the account if it is new, applies the invited role, and
   * returns a session in the same shape `verifyOtp` gets. `name` is required
   * only for an address with no account yet.
   */
  acceptInvite: (token: string, name?: string) => Promise<AcceptInviteResult>;
  /** Validate a persisted token against the server; clears session on 401. */
  verifySession: () => Promise<void>;
  logout: () => void;
}

async function postJson(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON / empty body */
  }
  return { status: res.status, data };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      token: null,

      requestOtp: async (email, name) => {
        try {
          const { data } = await postJson('/api/auth/start', name ? { email, name } : { email });
          if (data?.ok) return { ok: true, devCode: data.devCode };
          return { ok: false, error: data?.error ?? 'Could not send a code. Please try again.' };
        } catch {
          return { ok: false, error: 'Network error. Please check your connection and try again.' };
        }
      },

      verifyOtp: async (email, code) => {
        try {
          const { data } = await postJson('/api/auth/verify', { email, code });
          if (data?.token && data?.user) {
            set({ currentUser: hydrateUser(data.user), token: data.token as string });
            return { ok: true };
          }
          return { ok: false, error: data?.error ?? 'Verification failed. Please try again.' };
        } catch {
          return { ok: false, error: 'Network error. Please check your connection and try again.' };
        }
      },

      acceptInvite: async (token, name) => {
        try {
          const { data } = await postJson(
            `/api/invites/${encodeURIComponent(token)}/accept`,
            name ? { name } : {},
          );
          if (data?.token && data?.user) {
            set({ currentUser: hydrateUser(data.user), token: data.token as string });
            return { ok: true, redirectTo: data.redirectTo };
          }
          return { ok: false, error: data?.error ?? 'Could not accept the invitation. Please try again.' };
        } catch {
          return { ok: false, error: 'Network error. Please check your connection and try again.' };
        }
      },

      verifySession: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const res = await fetch(apiUrl('/api/auth/me'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401) {
            set({ currentUser: null, token: null });
            return;
          }
          const data = await res.json();
          if (data?.user) set({ currentUser: hydrateUser(data.user, get().currentUser) });
        } catch {
          /* offline — keep the persisted session optimistically */
        }
      },

      logout: () => set({ currentUser: null, token: null }),
    }),
    {
      name: 'stablepress-auth',
      // v5: the user payload was reshaped — `name` (was displayName), `parties`
      // (was partyClaims), `orgMembers` (was orgMemberships), and the
      // subscription tier / staffRoles axes are gone. A v4 session would hydrate
      // with a blank name and no register rows, so reset instead.
      // v6: every permission id changed shape (`content.draft.edit_any` →
      // `stories.edit` + a scope). A v5 session would render its sidebar and its
      // buttons from ids the server no longer issues.
      //
      // The TOKEN is still valid, so this does NOT sign anyone out — it drops
      // only the resolved access, which `verifySession()` refetches on boot.
      // Until it lands, `can()` sees no payload and answers false, so the app
      // fails closed rather than showing affordances from a stale grant.
      version: 6,
      migrate: (persisted, from) => {
        if (from < 5) return { currentUser: null, token: null };
        const s = (persisted ?? {}) as { currentUser?: AuthUser | null; token?: string | null };
        return {
          token: s.token ?? null,
          currentUser: s.currentUser ? { ...s.currentUser, access: undefined } : null,
        };
      },
      partialize: (s) => ({ currentUser: s.currentUser, token: s.token }),
    }
  )
);

// ── Selector hooks ────────────────────────────────────────────────────────────

/** True if the current user holds the given racing role. */
export function useHasRole(role: PartyRole): boolean {
  return useAuthStore((s) => !!s.currentUser?.roles.includes(role));
}

/** True if the current user holds an admin role. THE admin test. */
export function useIsAdmin(): boolean {
  return useAuthStore((s) => s.currentUser?.isAdmin === true);
}

/** Racing roles the user can currently act as. */
export function useActivePartyRoles(): PartyRole[] {
  return useAuthStore((s) => [...new Set((s.currentUser?.parties ?? []).map((p) => p.role))]);
}
