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
export function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers });
}
