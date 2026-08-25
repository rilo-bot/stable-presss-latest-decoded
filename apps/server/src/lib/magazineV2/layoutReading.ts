// ---------------------------------------------------------------------------
// Magazine Builder v2 — what the model SAW in a reference layout image.
//
// The client uploads a picture of a layout ("take this layout") and we build a
// page with that composition carrying their content. This module is the shape of
// the reading, and the TRUST BOUNDARY that turns arbitrary model output into
// something the rest of the pipeline may believe.
//
// Two decisions worth knowing (docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md):
//
//   • The vocabulary is the DSL's OWN — LeafRole, SpaceToken, ColorRef. A second
//     taxonomy would have to be kept in sync with layoutSpec.ts forever, and the
//     conversion step would spend its life translating.
//   • Boxes are NORMALISED (0–1 of the reference), never pixels. That is what
//     makes the reading verifiable (solved box vs read box) and reusable across
//     pages of different sizes — and it keeps the model out of the coordinate
//     business, which is the rule the whole frame-tree design rests on.
//
// Same discipline as normalizeLayoutSpec: hand-coerce, clamp, cap, DROP what is
// invalid, never throw. Pure — no I/O, no LLM, no DOM.
// ---------------------------------------------------------------------------

import {
  COLOR_REFS, LEAF_ROLES, SPACE_TOKENS, TEXT_ALIGNS, MAX_LEAVES, FONT_WEIGHTS,
  type ColorRef, type FontWeight, type LeafRole, type SpaceToken, type TextAlignToken,
} from './layoutSpec.js';

/** Serif or sans — the only distinction a picture honestly supports, and the only
 *  one the DSL can act on (a leaf picks between the page's two faces, not a family). */
export const FONT_FACES = ['serif', 'sans'] as const;
export type FontFace = (typeof FONT_FACES)[number];

/** Relative type weight. NOT a size: px would be a coordinate by another name,
 *  and the reference's pixel sizes mean nothing at our page scale. */
export const EMPHASES = ['dominant', 'normal', 'quiet'] as const;
export type Emphasis = (typeof EMPHASES)[number];

export const BACKGROUNDS = ['light', 'dark', 'photo'] as const;
export type ReadBackground = (typeof BACKGROUNDS)[number];

/** A rectangle in reference space: 0–1, origin top-left. */
export interface ReadBox { x: number; y: number; w: number; h: number }

export interface ReadRegion {
  role: LeafRole;
  box: ReadBox;
  /** Only meaningful where regions genuinely overlap (text over a photo). */
  z?: number;
  emphasis?: Emphasis;
  colorRef?: ColorRef;
  align?: TextAlignToken;
  /**
   * The text's size as a FRACTION OF THE REFERENCE'S HEIGHT (0.06 = a line one
   * sixteenth of the page tall).
   *
   * A fraction, not points and not pixels, for the same reason the boxes are: the
   * model must never author a coordinate or a physical size, and a reference read off
   * a phone photo has no points in it to report. The page it lands on supplies the
   * scale. Height rather than width because that is what type is measured against.
   */
  sizeFrac?: number;
  /** The ink this text is ACTUALLY set in, #rrggbb — as distinct from `colorRef`,
   *  which is a slot in our palette. A reference's red masthead is a colour; "accent"
   *  is a guess at which of our colours it might map to. */
  color?: string;
  /** 400–900, the weight of the face as drawn. */
  weight?: FontWeight;
  /** Serif or sans, which is as much as anyone can honestly read off a picture and
   *  all the DSL can express (`fontRef` chooses between the page's two faces). */
  face?: FontFace;
  /**
   * What the reference actually SAYS here, verbatim and short ("HORIZON", "P. 26",
   * "TRAVEL").
   *
   * Not so it can be copied — the drafter is told to write this magazine's own version
   * and never the reference's brand or subject. It is here because a role cannot say
   * what kind of thing a slot is. "headline" covers both a one-word masthead and a
   * sixty-character article title, and told only the role the drafter writes the
   * latter into the former, which is exactly what a real run produced.
   *
   * Capped hard: long prose is described by `chars`, not transcribed. We are reading a
   * composition, not lifting someone's article.
   */
  text?: string;
  /**
   * Roughly how many characters of text this region holds ALTOGETHER.
   *
   * The length signal, and the more important half of the two. Slot budgets were
   * derived from box AREA, so a wide short masthead band earned a big character
   * allowance and got a sentence. The reference is airy because its text is short —
   * area cannot see that, and this can.
   */
  chars?: number;
  /** Free text the model could not express in the fields above ("two-tone
   *  masthead", "bleeds off the left edge"). Advisory: shown to the user, and
   *  passed to the art-director when we fall back to it. Never parsed. */
  note?: string;
}

export interface ReadPalette { primary: string; secondary: string; accent: string }

export interface LayoutReading {
  /** w/h of the reference. Drives the "this ratio doesn't fit your page" warning. */
  aspect: number;
  background: ReadBackground;
  margin: SpaceToken;
  columns?: number;
  regions: ReadRegion[];
  /** Opt-in on the way in to a page — a brand palette is usually deliberate. */
  palette?: ReadPalette;
  /** The model's own estimate, 0–1. Reported, never used to gate silently. */
  confidence: number;
  notes?: string;
}

// ── Caps ─────────────────────────────────────────────────────────────────────
// MAX_REGIONS matches the DSL's MAX_LEAVES: a reading that cannot fit in a spec is
// a reading we would have to throw away half of anyway, and dropping here (lowest
// confidence first, by area) is at least explicit.
export const MAX_REGIONS = MAX_LEAVES;
export const MAX_COLUMNS = 6;
const MAX_NOTE = 160;
const MAX_NOTES = 600;
/** A region thinner than this in either axis is noise — a rule, a hairline, a
 *  misread edge. It cannot hold content at any page size, and as a partition
 *  input it produces slivers that the solver then has to fight. */
const MIN_SIDE = 0.01;
/**
 * Believable bounds for `sizeFrac`, as fractions of page height.
 *
 * The floor is roughly 5pt on A4 — below it nobody could have read the reference
 * either, so a smaller number is a misread rather than a tiny typeface. The ceiling is
 * a line a third of the page tall, which covers any masthead or cover figure; past
 * that the model has measured a photograph or a block of colour, not a line of type.
 * Out-of-range values are DROPPED rather than clamped: a wrong size silently pinned to
 * the ceiling would be reported to the user as the reference's own type.
 */
const MIN_SIZE_FRAC = 0.004;
const MAX_SIZE_FRAC = 0.34;
/** Verbatim text is for DISPLAY type — a masthead, a tag, a page reference. Past this
 *  a region is prose, and prose is described by `chars` rather than transcribed: we
 *  are reading a composition, not lifting somebody's article. */
export const MAX_REGION_TEXT = 160;
/** A region holding more than this is a misread (the whole page, or a column counted
 *  twice); one holding less than one character holds no text. */
export const MAX_REGION_CHARS = 8000;

// ── Coercion ─────────────────────────────────────────────────────────────────

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function optOneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
/** For a scalar whose legitimate range really is 0–1 (confidence). A value above 1
 *  there can only be a percentage, so the rescue is safe per-value. */
function unit(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return n > 1 && n <= 100 ? n / 100 : n;
}

const boxSides = (o: unknown): number[] => {
  if (!o || typeof o !== 'object') return [];
  const r = o as Record<string, unknown>;
  const b = (r.box ?? r) as Record<string, unknown>;
  return [num(b.w ?? b.width), num(b.h ?? b.height)].filter((n): n is number => n !== null);
};

/**
 * Decide ONCE, for the whole reading, whether the model spoke fractions or
 * percentages — and never per value.
 *
 * Percentages (60 for 0.6) are the likeliest slip, but per-value rescue is a trap:
 * a stray off-page `x: 1.4` in an otherwise perfect fractional reading would be
 * "rescued" to 1.4% and survive as a real region, when the truth is that it belongs
 * off the page and should be dropped. A whole reading is in one unit or the other.
 *
 * The decision reads SIDES only (w/h), not positions: a position can be misread in
 * isolation, whereas in percent units at least one region is inevitably tens of
 * units wide. 1.5 leaves room for a full-bleed box overshooting slightly (w: 1.04)
 * without being mistaken for a percentage.
 */
function scaleOf(regions: unknown[]): 1 | 0.01 {
  let max = 0;
  for (const r of regions) for (const side of boxSides(r)) max = Math.max(max, side);
  return max > 1.5 ? 0.01 : 1;
}
function optStr(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}
const HEX = /^#[0-9a-f]{6}$/i;
function hex(v: unknown): string | null {
  return typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : null;
}

/**
 * Coerce one region, or null to drop it.
 *
 * Boxes are clipped to the page rather than rejected: a model that reads a
 * full-bleed photo as `{x:-0.02, w:1.04}` has read it CORRECTLY (it does bleed) and
 * only expressed it in a space we don't have. Clipping keeps the region; rejecting
 * it would throw away the most important element on a cover.
 */
function coerceRegion(o: unknown, scale: 1 | 0.01): ReadRegion | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const rawBox = (r.box ?? r) as Record<string, unknown>;
  const sx = (v: unknown): number | null => {
    const n = num(v);
    return n === null ? null : n * scale;
  };
  const x0 = sx(rawBox.x);
  const y0 = sx(rawBox.y);
  const w0 = sx(rawBox.w ?? rawBox.width);
  const h0 = sx(rawBox.h ?? rawBox.height);
  if (x0 === null || y0 === null || w0 === null || h0 === null) return null;
  if (w0 <= 0 || h0 <= 0) return null;

  const x = Math.min(1, Math.max(0, x0));
  const y = Math.min(1, Math.max(0, y0));
  const w = Math.min(1 - x, w0 - (x - x0));
  const h = Math.min(1 - y, h0 - (y - y0));
  if (w < MIN_SIDE || h < MIN_SIDE) return null;

  const region: ReadRegion = { role: oneOf(r.role, LEAF_ROLES, 'body'), box: { x, y, w, h } };
  const z = num(r.z);
  if (z !== null) region.z = Math.min(99, Math.max(0, Math.round(z)));
  const emphasis = optOneOf(r.emphasis, EMPHASES);
  if (emphasis) region.emphasis = emphasis;
  const colorRef = optOneOf(r.colorRef, COLOR_REFS);
  if (colorRef) region.colorRef = colorRef;
  const align = optOneOf(r.align, TEXT_ALIGNS);
  if (align) region.align = align;

  // ── Typography ──
  // Every one of these is OPTIONAL and DROPPED when it is not believable. A reading
  // that reports no type is a reading whose page keeps its own, which is the
  // behaviour that existed before these fields and the right thing to fall back to.
  // The alternative — coercing a doubtful number into range — would hand the user a
  // fabricated measurement wearing the reference's name.
  //
  // sizeFrac is scaled by the SAME whole-reading unit decision as the boxes: a model
  // that reported its geometry in percent reported its type sizes that way too.
  const sizeFrac = sx(r.sizeFrac ?? r.fontFrac);
  if (sizeFrac !== null && sizeFrac >= MIN_SIZE_FRAC && sizeFrac <= MAX_SIZE_FRAC) region.sizeFrac = sizeFrac;
  const color = hex(r.color);
  if (color) region.color = color;
  if (FONT_WEIGHTS.includes(num(r.weight) as FontWeight)) region.weight = num(r.weight) as FontWeight;
  const face = optOneOf(r.face, FONT_FACES);
  if (face) region.face = face;

  // What it says, and how much of it there is. Markup is stripped rather than trusted:
  // this reaches a drafter's prompt and, through `hint`, the user's screen.
  const said = typeof r.text === 'string' ? r.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (said && said.length <= MAX_REGION_TEXT) region.text = said;
  const chars = num(r.chars);
  if (chars !== null && chars >= 1 && chars <= MAX_REGION_CHARS) {
    region.chars = Math.round(chars);
  } else if (region.text) {
    // A transcribed line IS its own length, so a model that gave text but no count
    // still teaches the budget. This is the masthead case: "HORIZON" is 7 characters,
    // whatever the band's area works out to.
    region.chars = region.text.length;
  }

  const note = optStr(r.note, MAX_NOTE);
  if (note) region.note = note;
  return region;
}

function coercePalette(o: unknown): ReadPalette | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const p = o as Record<string, unknown>;
  const primary = hex(p.primary);
  const secondary = hex(p.secondary);
  const accent = hex(p.accent);
  // All three or none: a half palette would silently inherit two of the
  // magazine's colours and one of the reference's, which looks like neither.
  if (!primary || !secondary || !accent) return undefined;
  return { primary, secondary, accent };
}

/**
 * Turn untrusted model output into a LayoutReading, or null when there is nothing
 * usable in it.
 *
 * Null means "we could not read this image" — a real answer the caller must show
 * the user, NOT an error to swallow. One region is not usable either: a reading
 * with a single box says nothing about composition, which is the whole point.
 */
export function normalizeLayoutReading(input: unknown): LayoutReading | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;

  const rawRegions = Array.isArray(o.regions) ? o.regions : [];
  const scale = scaleOf(rawRegions);
  let regions = rawRegions.map((r) => coerceRegion(r, scale)).filter((r): r is ReadRegion => r !== null);
  if (regions.length < 2) return null;

  // Over the cap, keep the biggest: area is the honest proxy for how much a region
  // matters to a composition, and the alternative (keeping the first N) would drop
  // the hero photo of any reading that happened to list it last.
  if (regions.length > MAX_REGIONS) {
    regions = [...regions].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, MAX_REGIONS);
  }
  // Reading order — top-to-bottom, then left-to-right. Conversion partitions by
  // geometry so it does not depend on this, but every human-facing surface (the
  // preview list, the notes) reads better in the order the eye takes them.
  regions.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));

  const aspectRaw = num(o.aspect);
  const columnsRaw = num(o.columns);
  const confidenceRaw = unit(o.confidence);

  const reading: LayoutReading = {
    aspect: aspectRaw !== null && aspectRaw > 0 ? Math.min(4, Math.max(0.25, aspectRaw)) : 1 / Math.SQRT2,
    background: oneOf(o.background, BACKGROUNDS, 'light'),
    margin: oneOf(o.margin, SPACE_TOKENS, 'md'),
    regions,
    // No number from the model means no claim about confidence. 0.5 is the honest
    // stand-in; inventing 1 would make an unread image look certain.
    confidence: confidenceRaw !== null ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5,
  };
  if (columnsRaw !== null && columnsRaw >= 1) reading.columns = Math.min(MAX_COLUMNS, Math.round(columnsRaw));
  const palette = coercePalette(o.palette);
  if (palette) reading.palette = palette;
  const notes = optStr(o.notes, MAX_NOTES);
  if (notes) reading.notes = notes;
  return reading;
}

/**
 * Whether the reference's proportions can honestly become this page.
 *
 * A landscape reference is not "the same layout" on a portrait page — the bands
 * that made it work stop working. We normalise small differences and REFUSE to
 * pretend about large ones. 25% is deliberately generous: A4 vs Letter vs a
 * screenshot with a browser chrome band all land well inside it, and a
 * landscape-vs-portrait mismatch lands nowhere near it.
 */
export const ASPECT_TOLERANCE = 0.25;

export function aspectMismatch(reading: LayoutReading, pageW: number, pageH: number): string {
  if (!(pageW > 0 && pageH > 0)) return '';
  const pageAspect = pageW / pageH;
  const off = Math.abs(reading.aspect - pageAspect) / pageAspect;
  if (off <= ASPECT_TOLERANCE) return '';
  const refShape = reading.aspect > 1 ? 'landscape' : 'portrait';
  const pageShape = pageAspect > 1 ? 'landscape' : 'portrait';
  return refShape !== pageShape
    ? `The reference is ${refShape} and this page is ${pageShape}, so the layout can only be adapted, not matched.`
    : `The reference is a noticeably different shape from this page (${Math.round(off * 100)}% off), so proportions will shift.`;
}
