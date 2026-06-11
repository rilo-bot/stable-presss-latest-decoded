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

/** Sanitize inline rich text down to the safe formatting allowlist. */
export function sanitizeRichText(html: string): string {
  installHook();
  return DOMPurify.sanitize(html ?? '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/** Strip ALL tags — used when we want plain text from a pasted fragment. */
export function toPlainText(html: string): string {
  installHook();
  return DOMPurify.sanitize(html ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
