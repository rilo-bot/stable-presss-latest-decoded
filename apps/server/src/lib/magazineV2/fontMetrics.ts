// ---------------------------------------------------------------------------
// Magazine Builder v2 — measured font metrics (the principled text-width model).
//
// This REPLACES the old `advanceRatio` jugaad in layout.ts, which classified
// fonts by pattern-matching their family NAME (`/oswald|condensed|bebas/…`) and
// added magic weight bumps (`+0.035` for bold). Here every number is a real
// glyph advance measured in headless Chromium with the actual font loaded (see
// scripts/measure-font-metrics.mjs); nothing is inferred from the font's name.
//
// The width of a run is the sum of its glyphs' measured advances (× font size ×
// the measured per-weight scale) plus letter-spacing — the same thing the
// browser does, minus kerning (which only ever makes real text NARROWER, so
// ignoring it keeps the estimate conservative → text never overflows its box).
//
// Family resolution mirrors the CSS cascade: walk the font-family stack and use
// the first family we have measured; only if none match do we fall back by the
// stack's OWN generic keyword (serif / sans-serif / …) to the widest measured
// font of that category — widest = conservative, so an unknown family still
// can't overflow. No name-based classification anywhere.
//
// Pure + server-safe: static data + arithmetic, no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { FONT_METRICS, type FontMetricEntry, type FontMetricCategory } from './fontMetrics.data.js';

/** A family's widest measured mean advance (across its weights) — used to rank
 *  fallbacks by "widest = most conservative". */
function maxBase(e: FontMetricEntry): number {
  let m = 0;
  for (const w of e.weights) m = Math.max(m, e.base[String(w)] ?? 0);
  return m;
}

/** The widest-mean-advance measured entry in a category — the conservative
 *  fallback (a wider estimate can only shrink text more, never overflow). */
function widestOf(category: FontMetricCategory): FontMetricEntry | undefined {
  let best: FontMetricEntry | undefined;
  for (const e of Object.values(FONT_METRICS)) {
    if (e.category === category && (!best || maxBase(e) > maxBase(best))) best = e;
  }
  return best;
}

/** Nearest measured weight to `weight` (exact if present). */
function nearestWeight(entry: FontMetricEntry, weight: number): number {
  let best = entry.weights[0] ?? 400;
  let bestDist = Infinity;
  for (const w of entry.weights) {
    const d = Math.abs(w - weight);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

// Precomputed once. `sans` always exists (Arial/Inter/…); serif/script fall
// back to sans if a category were ever empty.
const FALLBACK_SANS = widestOf('sans')!;
const FALLBACK_SERIF = widestOf('serif') ?? FALLBACK_SANS;
const FALLBACK_SCRIPT = widestOf('script') ?? FALLBACK_SANS;

/** CSS generic-family keywords — never a real measured face; used only to pick
 *  a fallback bucket from the stack's own declaration. */
const GENERIC_SERIF = new Set(['serif', 'ui-serif']);
const GENERIC_SCRIPT = new Set(['cursive', 'fantasy']);

/** Split a CSS font-family value into normalised family names, in cascade order.
 *  Plain string ops (strip quotes/whitespace, lowercase) — not classification. */
function splitStack(fontFamily: string): string[] {
  return fontFamily
    .split(',')
    .map((s) => s.split("'").join('').split('"').join('').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve a CSS font-family value to a measured metric entry, honouring the
 * cascade: the first named family we have measured wins; otherwise the stack's
 * trailing generic keyword picks a conservative same-category fallback.
 */
export function resolveFontMetrics(fontFamily: string | undefined): FontMetricEntry {
  const parts = splitStack(fontFamily ?? '');
  for (const p of parts) {
    const hit = FONT_METRICS[p];
    if (hit) return hit;
  }
  for (const p of parts) {
    if (GENERIC_SERIF.has(p)) return FALLBACK_SERIF;
    if (GENERIC_SCRIPT.has(p)) return FALLBACK_SCRIPT;
    // 'sans-serif' / 'monospace' / 'system-ui' / unknown → widest sans (safe).
  }
  return FALLBACK_SANS;
}

/** East-Asian WIDE / full-width code points (CJK, kana, Hangul, full-width
 *  forms, emoji): these render ~1em, far wider than a Latin mean advance, so
 *  they must NOT fall back to `base` or the line width is under-counted. */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals … symbols/punctuation
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana, Katakana, CJK compat
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compat forms
    (cp >= 0xff00 && cp <= 0xff60) || // Full-width forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Full-width signs
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B+ (supplementary)
  );
}

/** Conservative advance for a glyph OUTSIDE the measured ASCII table. Wide
 *  scripts and the common editorial punctuation that renders ~1em (em-dash,
 *  ellipsis, horizontal bar) get ~1em so they can never be under-counted;
 *  accented Latin, quotes and en-dash render ≈ their base letter, for which the
 *  weight mean `base` is already a safe over-estimate. Never returns < base. */
function unmeasuredAdvance(cp: number, base: number): number {
  if (isWideCodePoint(cp)) return Math.max(base, 1.0);
  if (cp === 0x2014 /* — em dash */ || cp === 0x2015 /* ― horizontal bar */ || cp === 0x2026 /* … ellipsis */) return Math.max(base, 1.0);
  return base;
}

/**
 * Width (px) of `text` laid out on a SINGLE line — the sum of measured glyph
 * advances (at the nearest measured weight) × font size, plus letter-spacing.
 * Glyphs outside the measured ASCII table are estimated CONSERVATIVELY by
 * Unicode range (see unmeasuredAdvance): wide/full-width and em-dash/ellipsis
 * get ~1em so they're never under-counted, other non-ASCII keeps the weight
 * mean. Conservative by construction (ignores kerning, which only narrows real
 * text), so a fit derived from it never overflows — including for non-ASCII.
 */
export function measureRunWidthPx(
  text: string,
  fontFamily: string | undefined,
  fontWeight: number,
  fontSizePx: number,
  letterSpacing = 0,
): number {
  const entry = resolveFontMetrics(fontFamily);
  const w = String(nearestWeight(entry, fontWeight));
  const adv = entry.adv[w] ?? {};
  const base = entry.base[w] ?? 0.6;
  let em = 0;
  let count = 0;
  for (const ch of text) {
    const measured = adv[ch];
    if (measured !== undefined) em += measured;
    else {
      const cp = ch.codePointAt(0) ?? 0;
      em += cp < 0x80 ? base : unmeasuredAdvance(cp, base);
    }
    count += 1;
  }
  return em * fontSizePx + Math.max(0, letterSpacing) * count;
}
