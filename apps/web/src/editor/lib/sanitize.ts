/**
 * Rich-text sanitizer for editable magazine text.
 *
 * Text regions store inline HTML produced by contentEditable + execCommand
 * (bold / italic / underline / color). That HTML is rendered publicly, so it
 * MUST be sanitized to a tight allowlist to prevent stored XSS, and to stop
 * pasted content from injecting styles that break the fixed print layout.
 *
 * Used both on write (when committing to the store) and on read (in the public
 * read-only views) as defense in depth.
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'span', 'br'];
const ALLOWED_ATTR = ['style'];

// Only these CSS properties may survive inside a style="" attribute.
const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
]);

let _hookInstalled = false;

function installHook() {
  if (_hookInstalled) return;
  _hookInstalled = true;
  // Strip every CSS declaration that isn't on the allowlist.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (!el.getAttribute || !el.hasAttribute('style')) return;
    const style = el.getAttribute('style') ?? '';
    const kept = style
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .filter((decl) => {
        const prop = decl.split(':')[0]?.trim().toLowerCase();
        const value = decl.slice(decl.indexOf(':') + 1).toLowerCase();
        if (!prop || !ALLOWED_STYLE_PROPS.has(prop)) return false;
        // Belt-and-braces: reject anything that could smuggle a URL/expression.
        if (/url\(|expression|javascript:|@import/.test(value)) return false;
        return true;
      });
    if (kept.length) el.setAttribute('style', kept.join('; '));
    else el.removeAttribute('style');
  });
}

// Sanitizing is a full HTML parse + tree walk. The read-only page renderer calls
// this for EVERY text element on EVERY render — e.g. once per drag frame (~60/s)
// for every box on the page — so it dominated the editor's interactive cost. The
// output is a pure function of the input string (the tag/attr/style allowlist and
// the hook are module constants), so memoize behind a bounded cache: unchanged
// copy re-renders become a map lookup instead of a re-parse.
const _cache = new Map<string, string>();
const _CACHE_MAX = 1000;

/** Sanitize inline rich text down to the safe formatting allowlist. */
export function sanitizeRichText(html: string): string {
  const key = html ?? '';
  const hit = _cache.get(key);
  if (hit !== undefined) return hit;
  installHook();
  const clean = DOMPurify.sanitize(key, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  // Bound memory: evict the oldest entry (Map preserves insertion order).
  if (_cache.size >= _CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }
  _cache.set(key, clean);
  return clean;
}

/** Strip ALL tags — used when we want plain text from a pasted fragment. */
export function toPlainText(html: string): string {
  installHook();
  return DOMPurify.sanitize(html ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
