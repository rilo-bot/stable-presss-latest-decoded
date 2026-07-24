// ---------------------------------------------------------------------------
// Magazine Builder v2 — content-aware text fitting + colour-contrast helpers.
//
// Pure and server-safe (no DOM) so the generator can bake a non-overflowing font
// size into every generated text element and keep it legible over any scrim /
// panel / photo, and the client can reuse the same maths. Measurement is a
// deterministic per-font heuristic (character-advance estimate) — accurate enough
// to stop text overflowing or leaving dead space; the editor refines it with real
// DOM measurement on edit. The estimate only ever SHRINKS from maxFontSize, so it
// is safe (never overflows).
//
// Ported verbatim from the campaign-hq reference (packages/blocks/src/layoutFit.ts)
// so generated pages fit + read identically; `refitText` (the server write-path
// hook) is kept here and adapted to the opts-based `fitFontSize`.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';

const TAG_RE = /<[^>]+>/g;

/** Plain length/word view of (possibly inline-HTML) text, for measurement. */
function toPlain(html: string): string {
  return html
    .replace(TAG_RE, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Average glyph advance as a fraction of font-size, chosen by font family +
 *  weight. Heavier weights and sans faces run wider; serifs a touch narrower.
 *  Deliberately errs slightly WIDE so the fit result never overflows. */
function advanceRatio(fontFamily: string, fontWeight: number): number {
  const f = fontFamily.toLowerCase();
  let base: number;
  if (/oswald|condensed|bebas|impact/.test(f)) base = 0.46;
  else if (/playfair|dm serif|bodoni|didot/.test(f)) base = 0.5;
  else if (/georgia|times|garamond|serif/.test(f)) base = 0.49;
  else base = 0.53; // sans-serif default (Inter/Arial/Helvetica/Montserrat)
  if (fontWeight >= 700) base += 0.035;
  else if (fontWeight >= 600) base += 0.02;
  return base;
}

/** Estimate how many wrapped lines `text` takes at `fontSize` in `boxWidthPx`,
 *  honouring explicit newlines. Character-based greedy wrap (approximate). */
function estimateLines(text: string, fontSize: number, boxWidthPx: number, fontFamily: string, fontWeight: number): number {
  const charW = fontSize * advanceRatio(fontFamily, fontWeight);
  const charsPerLine = Math.max(1, Math.floor(boxWidthPx / charW));
  let lines = 0;
  for (const rawLine of toPlain(text).split('\n')) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1; // a blank line still occupies a row
      continue;
    }
    let col = 0;
    let lineCount = 1;
    for (const word of words) {
      const wlen = word.length;
      if (col === 0) {
        col = wlen;
        // A single word longer than the line wraps internally (break-word).
        if (wlen > charsPerLine) lineCount += Math.floor(wlen / charsPerLine);
      } else if (col + 1 + wlen <= charsPerLine) {
        col += 1 + wlen;
      } else {
        lineCount += 1;
        col = wlen;
        if (wlen > charsPerLine) lineCount += Math.floor(wlen / charsPerLine);
      }
    }
    lines += lineCount;
  }
  return Math.max(1, lines);
}

/** The rendered height (px) of `text` at `fontSize` in a `boxWidthPx` column. */
export function estimateTextHeight(opts: {
  text: string;
  fontSize: number;
  boxWidthPx: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: number;
}): number {
  const lines = estimateLines(opts.text, opts.fontSize, opts.boxWidthPx, opts.fontFamily, opts.fontWeight);
  return lines * opts.fontSize * opts.lineHeight;
}

/**
 * Largest font size in [minFontSize, maxFontSize] at which `text` fits inside
 * boxW×boxH (with optional maxLines cap). Never returns above max or below min;
 * if it can't fit even at min, returns min (the renderer then clips cleanly).
 */
export function fitFontSize(opts: {
  text: string;
  boxW: number;
  boxH: number;
  maxFontSize: number;
  minFontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: number;
  maxLines?: number;
}): number {
  const { text, boxW, boxH, lineHeight, fontFamily, fontWeight } = opts;
  const max = Math.max(6, opts.maxFontSize);
  const min = Math.max(6, Math.min(opts.minFontSize, max));
  if (!toPlain(text).trim()) return max;
  const fits = (size: number): boolean => {
    const lines = estimateLines(text, size, boxW, fontFamily, fontWeight);
    if (opts.maxLines && lines > opts.maxLines) return false;
    return lines * size * lineHeight <= boxH;
  };
  if (fits(max)) return max;
  // Integer binary search for the largest fitting size.
  let lo = min;
  let hi = max;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// ── Colour / contrast ────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function relativeLuminance(hex: string): number {
  if (!HEX_RE.test(hex)) return 0;
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.4;
}

/**
 * Return `desired` if it reads acceptably on `bg`; otherwise the palette colour
 * (light or dark) that contrasts best. Keeps generated text legible over any
 * scrim/panel/background colour without a model call.
 */
export function readableColor(desired: string, bg: string, light: string, dark: string): string {
  const MIN = 3.5; // large display text — a touch below the 4.5 body threshold
  if (HEX_RE.test(desired) && HEX_RE.test(bg) && contrastRatio(desired, bg) >= MIN) return desired;
  const candLight = HEX_RE.test(light) ? light : '#ffffff';
  const candDark = HEX_RE.test(dark) ? dark : '#111111';
  return contrastRatio(candLight, bg) >= contrastRatio(candDark, bg) ? candLight : candDark;
}

// ── Server write-path hook ─────────────────────────────────────────────────────

/**
 * Recompute fontSize for shrink-to-fit text that declares a maxFontSize.
 * Extracted text (no maxFontSize) keeps its measured size untouched. Runs on
 * every element write (via writePipeline.normalizeElements).
 */
export function refitText(elements: MagazineElement[]): MagazineElement[] {
  return elements.map((el) => {
    if (el.type !== 'text' || !el.text) return el;
    const t = el.text;
    if (t.autoFit !== 'shrink' || typeof t.maxFontSize !== 'number') return el;
    const fontSize = fitFontSize({
      text: t.content,
      boxW: el.w,
      boxH: el.h,
      maxFontSize: t.maxFontSize,
      minFontSize: Math.max(6, Math.round(t.maxFontSize * 0.55)),
      lineHeight: t.lineHeight,
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
    });
    return { ...el, text: { ...t, fontSize } };
  });
}
