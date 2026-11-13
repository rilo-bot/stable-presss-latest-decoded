// ---------------------------------------------------------------------------
// Magazine Builder v2 — element rich-text sanitisation (the write trust
// boundary). Runs on EVERY element write path (manual, AI-agent, extraction,
// generation) so nothing persisted through the API can carry script/handlers.
// Reuses the existing server sanitiser (same allowlist as v1 magazines).
// ---------------------------------------------------------------------------

import { sanitizeRichText } from '../sanitizeHtml.js';
import type { MagazineElement } from './model.js';

// Markdown emphasis the models write into copy ("The People Behind the
// *Thoroughbred*") is not markup here — it printed as literal asterisks on the page
// (user report 2026-11-13). Turned into the <em>/<strong> the rich text already
// supports. Only a run wrapped tight on both sides counts, so a footnote star, a
// "5*" rating or a lone "*" is left as typed.
const STRONG = /(^|[\s(“"'‘>])\*\*([^*\s](?:[^*\n]*?[^*\s])?)\*\*(?=$|[\s).,;:!?”"'’<])/g;
const EM = /(^|[\s(“"'‘>])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?=$|[\s).,;:!?”"'’<])/g;

export function markdownEmphasisToHtml(s: string): string {
  if (!s || !s.includes('*')) return s;
  return s.replace(STRONG, '$1<strong>$2</strong>').replace(EM, '$1<em>$2</em>');
}

/** Sanitise the inline HTML of every text element in a list (in place-safe copy). */
export function sanitizeElements(elements: MagazineElement[]): MagazineElement[] {
  return elements.map((el) => {
    if (el.type === 'text' && el.text) {
      return { ...el, text: { ...el.text, content: sanitizeRichText(markdownEmphasisToHtml(el.text.content)) } };
    }
    return el;
  });
}
