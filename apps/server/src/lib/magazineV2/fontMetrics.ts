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

/**
 * Width (px) of `text` laid out on a SINGLE line — the sum of measured glyph
 * advances (at the nearest measured weight) × font size, plus letter-spacing.
 * Glyphs outside the measured ASCII table fall back to that weight's mean
 * advance (`base`). Conservative by construction (ignores kerning, which only
 * narrows real text), so a fit derived from it never overflows.
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
    em += adv[ch] ?? base;
    count += 1;
  }
  return em * fontSizePx + Math.max(0, letterSpacing) * count;
}
