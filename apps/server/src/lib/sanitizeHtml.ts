/**
 * Server-side rich-text sanitizer — the trust boundary for magazine text regions.
 *
 * The client sanitizes text on write, but the API must not trust that: a staff
 * collaborator could PATCH a page's content directly (bypassing the client) and
 * inject script/handlers that would later run in another editor's session. This
 * mirrors the client allowlist (apps/web/src/editor/lib/sanitize.ts) so anything
 * persisted through the API is reduced to the same safe inline-formatting set.
 */

import DOMPurify from 'isomorphic-dompurify';

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

let hookInstalled = false;
function installHook() {
  if (hookInstalled) return;
  hookInstalled = true;
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

/** Sanitize a single inline rich-text string down to the safe allowlist. */
export function sanitizeRichText(html: string): string {
  installHook();
  return DOMPurify.sanitize(html ?? '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

type MaybeTextContent = { kind?: unknown; html?: unknown; [k: string]: unknown };

/** Sanitize the `html` of every text region in a page's content map. */
export function sanitizeContentMap(
  content: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, c] of Object.entries(content)) {
    const region = c as MaybeTextContent;
    if (c && typeof c === 'object' && region.kind === 'text' && typeof region.html === 'string') {
      out[id] = { ...region, html: sanitizeRichText(region.html) };
    } else {
      out[id] = c;
    }
  }
  return out;
}

/** Sanitize text regions across an array of pages (each page has a `content` map). */
export function sanitizePages(pages: unknown[]): unknown[] {
  return pages.map((p) => {
    const page = p as { content?: unknown };
    if (p && typeof p === 'object' && page.content && typeof page.content === 'object') {
      return { ...(p as object), content: sanitizeContentMap(page.content as Record<string, unknown>) };
    }
    return p;
  });
}
