/**
 * Client-side sanitizer for blog inline text.
 *
 * Mirrors `sanitizeBlogInline` in apps/server/src/lib/sanitizeHtml.ts. The
 * server is the trust boundary and re-sanitizes everything on write, so this is
 * defence in depth on two fronts: what the composer commits to the store, and
 * what the renderer paints from a payload that arrived over the wire.
 *
 * Deliberately separate from `editor/lib/sanitize.ts` for the same reason the
 * two allowlists are separate on the server — blogs allow anchors and magazine
 * text regions do not, and widening the shared one would quietly change what
 * every magazine page accepts.
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'span', 'br', 'a', 'code', 'sup', 'sub', 'mark',
];
const ALLOWED_ATTR = ['style', 'href', 'title', 'target', 'rel'];

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
]);

let hookInstalled = false;

function installHook() {
  if (hookInstalled) return;
  hookInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (!el.getAttribute) return;

    // Style allowlist, matching the magazine sanitizer.
    if (el.hasAttribute('style')) {
      const kept = (el.getAttribute('style') ?? '')
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .filter((decl) => {
          const prop = decl.split(':')[0]?.trim().toLowerCase();
          const value = decl.slice(decl.indexOf(':') + 1).toLowerCase();
          if (!prop || !ALLOWED_STYLE_PROPS.has(prop)) return false;
          if (/url\(|expression|javascript:|@import/.test(value)) return false;
          return true;
        });
      if (kept.length) el.setAttribute('style', kept.join('; '));
      else el.removeAttribute('style');
    }

    // Anchors: only http(s), in-page and site-relative targets survive, and an
    // external link never gets to keep the opener window.
    if (el.tagName?.toLowerCase() === 'a') {
      const href = el.getAttribute('href') ?? '';
      const external = /^https?:\/\//i.test(href);
      if (!external && !href.startsWith('#') && !href.startsWith('/')) {
        el.removeAttribute('href');
        return;
      }
      if (external) {
        el.setAttribute('rel', 'nofollow noopener noreferrer');
        el.setAttribute('target', '_blank');
      } else {
        el.removeAttribute('target');
      }
    }
  });
}

// Sanitizing is a full parse + tree walk, and the renderer calls it for every
// text block on every render. The output is a pure function of the input, so
// memoize behind a bounded cache — the same treatment editor/lib/sanitize.ts
// gives its own hot path.
const cache = new Map<string, string>();
const CACHE_MAX = 500;

/** Sanitize one inline rich-text string from a blog block. */
export function sanitizeBlogHtml(html: string): string {
  const key = html ?? '';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  installHook();
  const clean = DOMPurify.sanitize(key, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, clean);
  return clean;
}

/** Strip every tag — for excerpts, counts and plain-text contexts. */
export function blogPlainText(html: string): string {
  installHook();
  return DOMPurify.sanitize(html ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
