// ---------------------------------------------------------------------------
// Magazine Builder v2 — element rich-text sanitisation (the write trust
// boundary). Runs on EVERY element write path (manual, AI-agent, extraction,
// generation) so nothing persisted through the API can carry script/handlers.
// Reuses the existing server sanitiser (same allowlist as v1 magazines).
// ---------------------------------------------------------------------------

import { sanitizeRichText } from '../sanitizeHtml.js';
import type { MagazineElement } from './model.js';

/** Sanitise the inline HTML of every text element in a list (in place-safe copy). */
export function sanitizeElements(elements: MagazineElement[]): MagazineElement[] {
  return elements.map((el) => {
    if (el.type === 'text' && el.text) {
      return { ...el, text: { ...el.text, content: sanitizeRichText(el.text.content) } };
    }
    return el;
  });
}
