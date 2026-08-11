/**
 * Resolves API endpoint URLs.
 *
 * All `/api/*` requests hit the real Express backend. In local dev that's the
 * Vite proxy → http://localhost:8080. In production, build with
 * VITE_API_URL=<backend origin> and it is prefixed here so those requests
 * reach the deployed server.
 */
import { useAuthStore } from '@/stores/authStore';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (API_BASE && path.startsWith('/')) return `${API_BASE}${path}`;
  return path;
}

/**
 * fetch() that attaches the current session's Bearer token. Use for any route
 * served by the REAL backend that requires authentication (the in-browser mock
 * ignores auth). The token is read at call time, so the import cycle with the
 * auth store (it imports apiUrl from here) is harmless — neither side touches
 * the other during module init.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(apiUrl(path), { ...init, headers });

  // A token that stops being accepted mid-session ends the session HERE.
  //
  // `verifySession()` only runs on app load, so before this an expired or
  // revoked token left the persisted `currentUser.access` rendering the whole
  // admin shell — sidebar, modules, every affordance — against an API refusing
  // every call. The user saw empty lists and silent failures rather than "please
  // sign in". Guarded on `token`, so a public read that 401s for its own reasons
  // cannot clear a session that was never established.
  if (res.status === 401 && token) useAuthStore.getState().logout();
  return res;
}

/**
 * authFetch with bounded retry for TRANSIENT failures — a network error, 429, or
 * 5xx (e.g. a Render cold-start returning 502 before the server is warm). A real
 * client error (4xx other than 429) returns immediately, and a definite success
 * returns immediately. Use ONLY for idempotent reads (GET); never for writes.
 */
export async function authFetchRetry(path: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastError: unknown = new Error('Request failed');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await authFetch(path, init);
      // Success, a redirect the caller has to read, or a genuine client error we
      // shouldn't retry — return as-is.
      //
      // The 3xx case is load-bearing: `res.ok` is 200–299 only, so a 301 used to
      // fall through to the retry branch, burn all three attempts and then THROW.
      // /api/blogs/:slug answers 301 with the current slug when an old one is
      // requested, so every link to a renamed post died in here instead of
      // redirecting — which is the entire point of keeping a slug history.
      if (res.ok || (res.status >= 300 && res.status < 400)) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return res;
      lastError = new Error(`HTTP ${res.status}`); // 5xx / 429 — worth retrying
    } catch (err) {
      lastError = err; // network/CORS failure — worth retrying
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1))); // 400ms, 800ms backoff
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}
