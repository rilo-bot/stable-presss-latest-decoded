/**
 * Where to send someone after they sign in / accept an invite.
 *
 * OPEN-REDIRECT GUARD. These values arrive from a query string or an emailed
 * invite and are fed straight to the router, so they must be a same-origin PATH
 * and nothing else. Mirrors `sanitizeRedirect` in apps/server/src/lib/invites.ts
 * — both ends validate, because either could be the one that's bypassed.
 *
 * Rejected: absolute URLs, protocol-relative `//host`, backslash variants, and
 * anything containing whitespace or control characters.
 */
export function safeRedirect(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (!v || v.length > 512) return fallback;
  if (!v.startsWith('/')) return fallback;
  if (v.startsWith('//') || v.startsWith('/\\')) return fallback;
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return fallback;
  return v;
}

/** The `?next=` param, validated. */
export function nextFromSearch(search: string, fallback: string): string {
  return safeRedirect(new URLSearchParams(search).get('next'), fallback);
}

/**
 * Build a sign-in URL that remembers where the visitor was headed. Used by the
 * route guards so an emailed deep link survives the login detour instead of
 * dumping them on the newsroom home.
 */
export function loginUrlFor(pathname: string, search = '', hash = ''): string {
  const target = `${pathname}${search}${hash}`;
  if (!target || target === '/' || target.startsWith('/login')) return '/login';
  return `/login?next=${encodeURIComponent(target)}`;
}
