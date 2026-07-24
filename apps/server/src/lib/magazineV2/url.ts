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

/**
 * True for hostnames that must never be fetched server-side — loopback, private
 * (RFC-1918), link-local (incl. the 169.254.169.254 cloud-metadata endpoint),
 * and IPv6 loopback/ULA/link-local. Used to keep image URLs that get rendered by
 * the server (Puppeteer PDF export of a published issue) from reaching internal
 * hosts. Hostname comparison only — DNS-rebinding is out of scope here.
 */
export function isBlockedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 ULA
  if (h.startsWith('fe80:')) return true; // IPv6 link-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

/**
 * Validate a URL that will be stored as an image the SERVER may fetch/render
 * (e.g. a magazine cover frozen into the public snapshot and rasterised by the
 * headless-Chromium PDF route). Allows same-origin relative paths and http(s)
 * URLs to public hosts only. Returns '' when unsafe/invalid so callers can reject.
 */
export function safePublicImageUrl(input: unknown): string {
  const value = safeUrl(input); // protocol allowlist + relative-path handling
  if (!value) return '';
  if (value.startsWith('/') || value.startsWith('#')) return value; // same-origin
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (isBlockedImageHost(url.hostname)) return '';
    return value;
  } catch {
    return '';
  }
}
