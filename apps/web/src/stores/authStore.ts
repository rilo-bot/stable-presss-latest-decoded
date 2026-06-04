import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface StoredUser extends AuthUser {
  // no password — OTP only
}

// In-memory OTP store (not persisted — expires on refresh, which is intentional)
interface PendingOtp {
  email: string;
  code: string;
  expiresAt: number; // ms timestamp
  pendingUser?: Omit<StoredUser, 'id' | 'createdAt'>; // set during signup flow
}

let _pendingOtp: PendingOtp | null = null;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

interface AuthState {
  users: StoredUser[];
  currentUser: AuthUser | null;
  /**
   * Step 1 — Login: check the email exists, generate + "send" an OTP.
   * Returns { ok, error?, otpPreview? } — otpPreview is shown in the UI
   * since we have no real email service.
   */
  requestLoginOtp: (email: string) => { ok: boolean; error?: string; otpPreview?: string };
  /**
   * Step 1 — Signup: validate the email is new, store pending user data,
   * generate + "send" an OTP.
   */
  requestSignupOtp: (
    email: string,
    displayName: string,
    role: UserRole
  ) => { ok: boolean; error?: string; otpPreview?: string };
  /**
   * Step 2 — Verify the OTP for either flow and sign the user in (or create
   * their account first for signup).
   */
  verifyOtp: (email: string, code: string) => { ok: boolean; error?: string };
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUser: null,

      requestLoginOtp: (email) => {
        const found = get().users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (!found) {
          return { ok: false, error: 'No account found with that email address.' };
        }
        const code = generateOtp();
        _pendingOtp = {
          email: email.toLowerCase(),
          code,
          expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
        };
        // In a real system we'd send an email here.
        console.info(`[OTP] Login code for ${email}: ${code}`);
        return { ok: true, otpPreview: code };
      },

      requestSignupOtp: (email, displayName, role) => {
        const existing = get().users.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        );
        if (existing) {
          return { ok: false, error: 'An account with this email already exists.' };
        }
        const code = generateOtp();
        _pendingOtp = {
          email: email.toLowerCase(),
          code,
          expiresAt: Date.now() + 10 * 60 * 1000,
          pendingUser: { email: email.toLowerCase(), displayName, role },
        };
        console.info(`[OTP] Signup code for ${email}: ${code}`);
        return { ok: true, otpPreview: code };
      },

      verifyOtp: (email, code) => {
        const otp = _pendingOtp;
        if (!otp) {
          return { ok: false, error: 'No pending verification. Please request a new code.' };
        }
        if (otp.email !== email.toLowerCase()) {
          return { ok: false, error: 'Email mismatch. Please start again.' };
        }
        if (Date.now() > otp.expiresAt) {
          _pendingOtp = null;
          return { ok: false, error: 'Your code has expired. Please request a new one.' };
        }
        if (otp.code !== code.trim()) {
          return { ok: false, error: 'Incorrect code. Please check and try again.' };
        }

        // Valid OTP
        _pendingOtp = null;

        if (otp.pendingUser) {
          // Signup path — create the account
          const newUser: StoredUser = {
            id: crypto.randomUUID(),
            email: otp.pendingUser.email,
            displayName: otp.pendingUser.displayName,
            role: otp.pendingUser.role,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            users: [...state.users, newUser],
            currentUser: newUser,
          }));
        } else {
          // Login path — find existing user and sign in
          const found = get().users.find(
            (u) => u.email.toLowerCase() === email.toLowerCase()
          );
          if (!found) {
            return { ok: false, error: 'Account not found. Please sign up first.' };
          }
          set({ currentUser: found });
        }

        return { ok: true };
      },

      logout: () => set({ currentUser: null }),
    }),
    { name: 'stablepress-auth' }
  )
);
