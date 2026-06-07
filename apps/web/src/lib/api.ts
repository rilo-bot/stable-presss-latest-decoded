/**
 * Resolves API endpoint URLs.
 *
 * In this frontend-only deployment, all requests are intercepted by the
 * in-browser mock API (see lib/mockApi.ts). The mock intercepts any path
 * matching /api/* regardless of origin, so relative paths work fine.
 */
export function apiUrl(path: string): string {
  return path;
}
