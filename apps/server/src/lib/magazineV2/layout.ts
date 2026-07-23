// ---------------------------------------------------------------------------
// Magazine Builder v2 — server-side text fitting.
//
// Runs on every write so a text box's fontSize never exceeds what fits its box
// (for autoFit:'shrink' text that declares a maxFontSize ceiling). The server
// has no DOM, so this is a deterministic ESTIMATE (char-metric based); the
// editor does precise measurement client-side and commits the exact size. The
// estimate only ever SHRINKS from maxFontSize, so it is safe (never overflows).
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';

const MIN_FONT = 6;
/** Rough average glyph advance as a fraction of font size (proportional fonts). */
const AVG_GLYPH_EM = 0.52;

/** Strip tags to plain text for length estimation. */
function plainLen(html: string): number {
  return html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim().length;
}

/** Estimate rendered height (px) of `chars` at a given font size inside `boxW`. */
function estimateHeight(chars: number, fontSize: number, lineHeight: number, boxW: number): number {
  if (chars <= 0) return 0;
  const charsPerLine = Math.max(1, Math.floor(boxW / (fontSize * AVG_GLYPH_EM)));
  const lines = Math.ceil(chars / charsPerLine);
  return lines * fontSize * lineHeight;
}

/**
 * Largest font size ≤ maxFontSize whose estimated text height fits `box.h`.
 * Never returns below MIN_FONT.
 */
export function fitFontSize(
  html: string,
  box: { w: number; h: number },
  maxFontSize: number,
  lineHeight: number,
): number {
  const chars = plainLen(html);
  if (chars === 0) return maxFontSize;
  let size = Math.max(MIN_FONT, Math.round(maxFontSize));
  while (size > MIN_FONT && estimateHeight(chars, size, lineHeight, box.w) > box.h) {
    size -= 1;
  }
  return size;
}

/**
 * Recompute fontSize for shrink-to-fit text that declares a maxFontSize.
 * Extracted text (no maxFontSize) keeps its measured size untouched.
 */
export function refitText(elements: MagazineElement[]): MagazineElement[] {
  return elements.map((el) => {
    if (el.type !== 'text' || !el.text) return el;
    const t = el.text;
    if (t.autoFit !== 'shrink' || typeof t.maxFontSize !== 'number') return el;
    const fontSize = fitFontSize(t.content, { w: el.w, h: el.h }, t.maxFontSize, t.lineHeight);
    return { ...el, text: { ...t, fontSize } };
  });
}
