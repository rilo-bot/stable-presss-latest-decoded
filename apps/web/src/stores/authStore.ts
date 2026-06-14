import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiUrl } from '@/lib/api';
import type { Role, StaffRole, PartyRole, OrgRole } from '@/rbac/roles';
import { primaryStaffRole } from '@/rbac/roles';
import type { SubscriptionTier } from '@/rbac/entitlement';

/**
 * Back-compat alias: the six editorial roles. Existing UI (Newsroom, KanbanColumn,
 * permission matrix) types against this. A reader/party with no staff role has
 * `role: undefined`.
 */
export type UserRole = StaffRole;

/** A self-claimed racing identity, pending until verified. See RBAC.md §7. */
export interface PartyClaim {
  id: string;
  partyId: string;
  role: PartyRole;
  status: 'pending' | 'verified' | 'rejected';
  evidenceUrl?: string;
  verifiedBy?: string;
  verifierType?: 'admin' | 'org';
  verifiedAt?: string;
  rejectionReason?: string;
}

/** Membership of one organisation, with a scoped org role. */
export interface OrgMembership {
  orgId: string;
  orgRole: OrgRole;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  /** All global roles (reader + staff + verified party roles). */
  roles: Role[];
  /** Entitlement axis — gates premium content only. */
  subscriptionTier: SubscriptionTier;
  partyClaims: PartyClaim[];
  orgMemberships: OrgMembership[];
  /** Derived: highest staff role, or undefined for non-staff. Back-compat for can()/UI. */
  role?: UserRole;
}

/** Normalize a raw user payload from the API into a complete AuthUser. */
function hydrateUser(raw: any): AuthUser {
  const roles: Role[] =
    Array.isArray(raw?.roles) && raw.roles.length > 0 ? raw.roles : ['reader'];
  return {
    id: String(raw?.id ?? ''),
    email: String(raw?.email ?? ''),
    displayName: String(raw?.displayName ?? ''),
    createdAt: String(raw?.createdAt ?? ''),
    roles,
    subscriptionTier: (raw?.subscriptionTier as SubscriptionTier) ?? 'free',
    partyClaims: Array.isArray(raw?.partyClaims) ? raw.partyClaims : [],
    orgMemberships: Array.isArray(raw?.orgMemberships) ? raw.orgMemberships : [],
    role: primaryStaffRole(roles),
  };
}

export interface OtpRequestResult {
  ok: boolean;
  error?: string;
  /** Present only in dev (when SendGrid isn't configured) — shows the code in the UI. */
  devCode?: string;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

interface AuthState {
  currentUser: AuthUser | null;
  token: string | null;

  /** Step 1 — Login: ask the server to email a one-time code. */
  requestLoginOtp: (email: string) => Promise<OtpRequestResult>;
  /** Step 1 — Signup: register pending details and ask for a code. Every new
   *  account starts as a reader; roles/tier are layered on after signup. */
  requestSignupOtp: (
    email: string,
    displayName: string
  ) => Promise<OtpRequestResult>;
  /** Step 2 — Verify the code; on success stores the user + JWT. */
  verifyOtp: (email: string, code: string) => Promise<VerifyResult>;
  /** Validate a persisted token against the server; clears session on 401. */
  verifySession: () => Promise<void>;
  /** Set the current user's subscription tier (entitlement axis). */
  setSubscriptionTier: (tier: SubscriptionTier) => Promise<{ ok: boolean; error?: string }>;
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

      requestLoginOtp: async (email) => {
        try {
          const { data } = await postJson('/api/auth/request-otp', { email, mode: 'login' });
          if (data?.ok) return { ok: true, devCode: data.devCode };
          return { ok: false, error: data?.error ?? 'Could not send a code. Please try again.' };
        } catch {
          return { ok: false, error: 'Network error. Please check your connection and try again.' };
        }
      },

      requestSignupOtp: async (email, displayName) => {
        try {
          const { data } = await postJson('/api/auth/request-otp', {
            email,
            mode: 'signup',
            displayName,
          });
          if (data?.ok) return { ok: true, devCode: data.devCode };
          return { ok: false, error: data?.error ?? 'Could not send a code. Please try again.' };
        } catch {
          return { ok: false, error: 'Network error. Please check your connection and try again.' };
        }
      },

      verifyOtp: async (email, code) => {
        try {
          const { data } = await postJson('/api/auth/verify-otp', { email, code });
          if (data?.token && data?.user) {
            set({ currentUser: hydrateUser(data.user), token: data.token as string });
            return { ok: true };
          }
          return { ok: false, error: data?.error ?? 'Verification failed. Please try again.' };
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
          if (data?.user) set({ currentUser: hydrateUser(data.user) });
        } catch {
          /* offline — keep the persisted session optimistically */
        }
      },

      setSubscriptionTier: async (tier) => {
        try {
          const token = get().token;
          const res = await fetch(apiUrl('/api/subscription'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ tier }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) return { ok: false, error: data?.error ?? 'Could not update your plan.' };
          if (data?.user) set({ currentUser: hydrateUser(data.user) });
          return { ok: true };
        } catch {
          return { ok: false, error: 'Network error. Please try again.' };
        }
      },

      logout: () => set({ currentUser: null, token: null }),
    }),
    {
      name: 'stablepress-auth',
      // v3: multi-role identity (roles[] + subscriptionTier + claims + memberships).
      // Reset persisted session so the new shape is re-fetched fresh from the server.
      version: 3,
      migrate: () => ({ currentUser: null, token: null }),
      partialize: (s) => ({ currentUser: s.currentUser, token: s.token }),
    }
  )
);

// ── Selector hooks ────────────────────────────────────────────────────────────

/** True if the current user holds the given global role. */
export function useHasRole(role: Role): boolean {
  return useAuthStore((s) => !!s.currentUser?.roles.includes(role));
}

/** The current user's subscription tier (free when signed out). */
export function useSubscriptionTier(): SubscriptionTier {
  return useAuthStore((s) => s.currentUser?.subscriptionTier ?? 'free');
}

/** Verified party roles the user can currently act as. */
export function useActivePartyRoles(): PartyRole[] {
  return useAuthStore((s) =>
    (s.currentUser?.partyClaims ?? [])
      .filter((c) => c.status === 'verified')
      .map((c) => c.role),
  );
}
