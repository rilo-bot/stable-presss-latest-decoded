/**
 * Browser calls to the Express API.
 * - Dev: VITE_API_URL unset → relative paths like `/api/...` use the Vite proxy.
 * - Prod: VITE_API_URL is the backend origin (injected at build time).
 */
export function getApiOrigin(): string {
  const v = import.meta.env.VITE_API_URL
  if (typeof v !== 'string' || !v.trim()) return ''
  let o = v.trim()
  while (o.endsWith('/')) o = o.slice(0, -1)
  return o
}

/** Use for every `fetch` to the backend (path must start with `/api`). */
export function apiUrl(apiPath: string): string {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const origin = getApiOrigin()
  return origin ? `${origin}${path}` : path
}
