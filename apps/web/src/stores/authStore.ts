import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiUrl } from '@/lib/api';

export type UserRole =
  | 'contributor'
  | 'editor'
  | 'legal_reviewer'
  | 'podcast_producer'
  | 'publisher'
  | 'administrator';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
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
  /** Step 1 — Signup: register pending details and ask for a code. */
  requestSignupOtp: (
    email: string,
    displayName: string,
    role: UserRole
  ) => Promise<OtpRequestResult>;
  /** Step 2 — Verify the code; on success stores the user + JWT. */
  verifyOtp: (email: string, code: string) => Promise<VerifyResult>;
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

      requestLoginOtp: async (email) => {
        try {
          const { data } = await postJson('/api/auth/request-otp', { email, mode: 'login' });
          if (data?.ok) return { ok: true, devCode: data.devCode };
          return { ok: false, error: data?.error ?? 'Could not send a code. Please try again.' };
        } catch {
          return { ok: false, error: 'Network error. Please check your connection and try again.' };
        }
      },

      requestSignupOtp: async (email, displayName, role) => {
        try {
          const { data } = await postJson('/api/auth/request-otp', {
            email,
            mode: 'signup',
            displayName,
            role,
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
            set({ currentUser: data.user as AuthUser, token: data.token as string });
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
          if (data?.user) set({ currentUser: data.user as AuthUser });
        } catch {
          /* offline — keep the persisted session optimistically */
        }
      },

      logout: () => set({ currentUser: null, token: null }),
    }),
    {
      name: 'stablepress-auth',
      version: 2, // bumped from the old client-only {users,currentUser} shape
      migrate: () => ({ currentUser: null, token: null }),
      partialize: (s) => ({ currentUser: s.currentUser, token: s.token }),
    }
  )
);
