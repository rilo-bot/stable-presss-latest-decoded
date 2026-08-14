// ---------------------------------------------------------------------------
// Magazine Builder v2 — content-aware text fitting + colour-contrast helpers.
//
// Pure and server-safe (no DOM) so the generator can bake a non-overflowing font
// size into every generated text element and keep it legible over any scrim /
// panel / photo, and the client can reuse the same maths. Width comes from
// MEASURED per-font glyph advances (fontMetrics.ts) — real numbers read from the
// actual fonts, NOT a pattern-match on the font's name. The estimate only ever
// SHRINKS from maxFontSize and leans conservative (ignores kerning), so it is
// safe (never overflows); the editor refines it with real DOM measurement on edit.
//
// Originally ported from the campaign-hq reference (packages/blocks/src/layoutFit.ts);
// the name-classifying `advanceRatio` heuristic has since been replaced by the
// measured metrics table. `refitText` (the server write-path hook) is kept here.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';
import { measureRunWidthPx } from './fontMetrics.js';

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

/** Apply a CSS text-transform to plain text for measurement (uppercase widens
 *  real glyphs — we measure the transformed glyphs directly rather than guess). */
function applyTransform(plain: string, textTransform: string): string {
  if (textTransform === 'uppercase') return plain.toUpperCase();
  if (textTransform === 'lowercase') return plain.toLowerCase();
  return plain;
}

/** Estimate how many wrapped lines `text` takes at `fontSize` in `boxWidthPx`,
 *  honouring explicit newlines. Greedy word-wrap measured in PIXELS from the
 *  font's real glyph advances (fontMetrics), so a proportional face wraps where
 *  it actually would — no fixed chars-per-line assumption. `letterSpacing` and
 *  `textTransform` feed straight into the measurement (uppercase measures the
 *  uppercased glyphs; negative letter-spacing is clamped to stay conservative). */
function estimateLines(
  text: string,
  fontSize: number,
  boxWidthPx: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacing = 0,
  textTransform: string = 'none',
): number {
  const plain = applyTransform(toPlain(text), textTransform);
  const measure = (s: string): number => measureRunWidthPx(s, fontFamily, fontWeight, fontSize, letterSpacing);
  const spaceW = measure(' ');
  const box = Math.max(1, boxWidthPx);
  let lines = 0;
  for (const rawLine of plain.split('\n')) {
    // Whitespace tokenisation (not a classification heuristic).
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1; // a blank line still occupies a row
      continue;
    }
    let colW = 0; // measured width (px) of the current line so far
    let lineCount = 1;
    for (const word of words) {
      const wW = measure(word);
      if (colW === 0) {
        colW = wW;
        // A single word wider than the box wraps internally (break-word).
        if (wW > box) lineCount += Math.floor(wW / box);
      } else if (colW + spaceW + wW <= box) {
        colW += spaceW + wW;
      } else {
        lineCount += 1;
        colW = wW;
        if (wW > box) lineCount += Math.floor(wW / box);
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
  letterSpacing?: number;
  textTransform?: string;
}): number {
  const lines = estimateLines(
    opts.text,
    opts.fontSize,
    opts.boxWidthPx,
    opts.fontFamily,
    opts.fontWeight,
    opts.letterSpacing ?? 0,
    opts.textTransform ?? 'none',
  );
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
  letterSpacing?: number;
  textTransform?: string;
}): number {
  const { text, boxW, boxH, lineHeight, fontFamily, fontWeight } = opts;
  const letterSpacing = opts.letterSpacing ?? 0;
  const textTransform = opts.textTransform ?? 'none';
  const max = Math.max(6, opts.maxFontSize);
  const min = Math.max(6, Math.min(opts.minFontSize, max));
  if (!toPlain(text).trim()) return max;
  // The longest single WORD, for the width guard below.
  const words = applyTransform(toPlain(text), textTransform).split(/\s+/).filter(Boolean);
  const widestWordPx = (size: number): number => {
    let w = 0;
    for (const word of words) w = Math.max(w, measureRunWidthPx(word, fontFamily, fontWeight, size, letterSpacing));
    return w;
  };
  const fits = (size: number): boolean => {
    // A single word wider than the box breaks mid-word (e.g. "THOROUG|HBRED") —
    // that always reads as broken, so shrink until the longest word fits.
    if (words.length && boxW > 0 && widestWordPx(size) > boxW + 0.5) return false;
    const lines = estimateLines(text, size, boxW, fontFamily, fontWeight, letterSpacing, textTransform);
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
 *
 * Honours the element's OWN `minFontSize` when it carries one. The 55%-of-ceiling
 * default is a reasonable guess for hand-made text, but it is not a print floor: a body
 * slot composed with an 8pt floor would be re-fitted from `24 × 0.55 = 13px` (6.3pt) on
 * the very next save, so the legibility rule would hold only until someone dragged the
 * box. Carrying the floor on the element is what makes it durable.
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
      minFontSize: typeof t.minFontSize === 'number' ? t.minFontSize : Math.max(6, Math.round(t.maxFontSize * 0.55)),
      lineHeight: t.lineHeight,
      fontFamily: t.fontFamily,
      fontWeight: t.fontWeight,
      letterSpacing: t.letterSpacing,
      textTransform: t.textTransform,
    });
    return { ...el, text: { ...t, fontSize } };
  });
}
