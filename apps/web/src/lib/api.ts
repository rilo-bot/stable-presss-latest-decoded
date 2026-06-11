/**
 * Resolves API endpoint URLs.
 *
 * Most `/api/*` requests are intercepted by the in-browser mock API
 * (see lib/mockApi.ts), which matches relative paths — so the default is to
 * return the path unchanged.
 *
 * Auth requests (`/api/auth/*`) are NOT mocked: they hit the real backend.
 * In local dev that's the Vite proxy → http://localhost:3001. In production,
 * build with VITE_API_URL=<backend origin> and it is prefixed here so those
 * requests reach the deployed server.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (API_BASE && path.startsWith('/')) return `${API_BASE}${path}`;
  return path;
}
