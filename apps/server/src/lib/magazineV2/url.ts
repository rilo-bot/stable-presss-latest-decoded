// Pure URL validation — no DOM, safe to import anywhere. Ported from the
// campaign-hq reference (packages/blocks/src/url.ts). Used for QR destinations
// and image URLs on every element write path.

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Validate a user-supplied URL against a protocol allowlist. Returns a safe
 * string, or '' when the URL is unsafe/invalid. Relative paths (/…, #…) allowed.
 */
export function safeUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const value = input.trim();
  if (!value) return '';
  // Reject protocol-relative '//host' (resolves off-origin) — only allow a true
  // same-origin absolute path ('/…', but not '//…') or an in-page anchor.
  if (value.startsWith('//')) return '';
  if (value.startsWith('/') || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return SAFE_URL_PROTOCOLS.has(url.protocol) ? value : '';
  } catch {
    return '';
  }
}
