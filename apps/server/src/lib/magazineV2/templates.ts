// ---------------------------------------------------------------------------
// Magazine Builder v2 — curated page-layout library for from-scratch generation.
//
// Unlike a digitized upload (whose layout comes from the source PDF), a
// generated magazine's layout is chosen from this fixed set of premium page
// templates. The generation pipeline's "art director" agent only PICKS a page
// kind and maps copy into named slots — it never emits raw coordinates (LLM
// free-positioning overlaps and looks rough). Each slot's box is stored as
// fractions of the page (0..1); composePage() resolves them to canonical pixels
// and to concrete palette/font values, producing raw element objects that the
// caller MUST still run through validateElements + sanitizeElements (same
// guardrails as extraction — this data is model-shaped and untrusted).
//
// Ported faithfully from the campaign-hq reference
// (packages/blocks/src/magazineTemplates.ts). Server-safe: pure data + one pure
// function, no React/DOM.
// ---------------------------------------------------------------------------

import { PAGE_W, PAGE_H } from './config.js';
import type { TextRole, ElementVAlign } from './model.js';
import { fitFontSize, readableColor } from './layout.js';

export { PAGE_W, PAGE_H };

export const PAGE_TEMPLATE_KINDS = [
  'cover',
  'contents',
  'feature-full-bleed',
  'two-column-article',
  'photo-grid',
  'pull-quote',
  'stat-infographic',
  'back-cover',
] as const;
export type PageTemplateKind = (typeof PAGE_TEMPLATE_KINDS)[number];

export type SlotRole = 'text' | 'image' | 'qr' | 'shape';

/** Which named palette colour a slot resolves to at fill time. */
export type ColorRef = 'text' | 'bg' | 'primary' | 'secondary' | 'accent';
/** Which font of the plan's pairing a text slot uses. */
export type FontRef = 'display' | 'body';

export interface SlotStyle {
  fontRef?: FontRef;
  fontSize?: number; // px in canonical space — the MAXIMUM (fit shrinks from here)
  minFontSize?: number; // fit floor; defaults to ~55% of fontSize
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  align?: 'left' | 'center' | 'right';
  vAlign?: ElementVAlign; // vertical placement of copy within the box
  lineHeight?: number;
  maxLines?: number; // hard cap on wrapped lines (fit shrinks to respect it)
  colorRef?: ColorRef; // text colour (text slots) — resolved to hex
  fit?: 'cover' | 'contain'; // image slots
  fillRef?: ColorRef; // shape slots — resolved to hex
}

/** Which stacking role a slot plays — lets layout validation tell an
 *  intentional text-over-image/scrim stack apart from two colliding content
 *  boxes. "background" spans behind; "overlay" is a scrim/panel over it;
 *  "content" is the text/qr/photo the reader consumes. Defaults inferred. */
export type SlotLayer = 'background' | 'overlay' | 'content';

export interface PageTemplateSlot {
  id: string; // stable within the template, e.g. "headline"
  role: SlotRole;
  textRole?: TextRole; // for text slots
  required: boolean;
  /** Box as fractions of page width/height (0..1). Resolved to px at fill. */
  box: { x: number; y: number; w: number; h: number };
  z: number;
  layer?: SlotLayer;
  style?: SlotStyle;
}

export interface PageTemplate {
  id: string;
  kind: PageTemplateKind;
  description: string; // shown to the art-director agent to help it choose
  slots: PageTemplateSlot[];
}

// ── palette / fonts the composer resolves refs against ───────────────────────

export interface GenPalette {
  primary: string; // #rrggbb
  secondary: string;
  accent: string;
  bg: string;
  text: string;
}
export interface GenFonts {
  display: string; // CSS font-family stack
  body: string;
}

/** One filled slot. The art-director/curator agents produce these per page. */
export interface SlotFill {
  slotId: string;
  text?: string; // text slots — plain or inline HTML (sanitized downstream)
  image?: { url: string; assetId: string; alt: string }; // a stored MediaAsset
  qrUrl?: string; // qr slots — scan destination
  /** Fallback for an image slot the curator couldn't source (or a shape slot
   *  override): render a flat palette colour instead of a picture. */
  shapeFill?: string; // #rrggbb
}

// ── the template library ─────────────────────────────────────────────────────

// Shared layout constants — a consistent 8% side margin and an editorial type
// scale. Text boxes are sized to hold their wrapped copy (headlines get room
// for 2 lines); the renderer wraps + clips generated text to these boxes.
const M = 0.08; // side margin
const CW = 0.84; // content width

const COVER: PageTemplate = {
  id: 'cover-hero-v1',
  kind: 'cover',
  description: 'Full-bleed cover photo with a dark bottom scrim, a thin accent rule, a kicker line, a large title lockup, a subtitle, and a small scan QR in the corner.',
  slots: [
    { id: 'hero', role: 'image', required: true, z: 0, box: { x: 0, y: 0, w: 1, h: 1 }, style: { fit: 'cover' } },
    { id: 'scrim', role: 'shape', required: false, z: 1, box: { x: 0, y: 0.46, w: 1, h: 0.54 }, style: { fillRef: 'text' } },
    { id: 'accentRule', role: 'shape', required: false, z: 2, box: { x: M, y: 0.55, w: 0.14, h: 0.007 }, style: { fillRef: 'accent' } },
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 2, box: { x: M, y: 0.585, w: CW, h: 0.04 }, style: { fontRef: 'body', fontSize: 30, fontWeight: 700, align: 'left', colorRef: 'accent' } },
    { id: 'title', role: 'text', textRole: 'headline', required: true, z: 2, box: { x: M, y: 0.64, w: CW, h: 0.19 }, style: { fontRef: 'display', fontSize: 104, fontWeight: 800, align: 'left', colorRef: 'bg', lineHeight: 1.03 } },
    { id: 'subtitle', role: 'text', textRole: 'subhead', required: false, z: 2, box: { x: M, y: 0.85, w: 0.66, h: 0.09 }, style: { fontRef: 'body', fontSize: 34, fontWeight: 400, align: 'left', colorRef: 'bg', lineHeight: 1.3 } },
    { id: 'scanqr', role: 'qr', required: false, z: 3, box: { x: 0.8, y: 0.86, w: 0.12, h: 0.09 } },
  ],
};

const CONTENTS: PageTemplate = {
  id: 'contents-v1',
  kind: 'contents',
  description: "A clean 'in this issue' contents page: a big section title, an accent rule, and up to five entry lines (each a page number + title + one-line description).",
  slots: [
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 1, box: { x: M, y: 0.08, w: CW, h: 0.035 }, style: { fontRef: 'body', fontSize: 24, fontWeight: 700, align: 'left', colorRef: 'accent' } },
    { id: 'title', role: 'text', textRole: 'headline', required: true, z: 1, box: { x: M, y: 0.115, w: CW, h: 0.11 }, style: { fontRef: 'display', fontSize: 88, fontWeight: 800, align: 'left', colorRef: 'text', lineHeight: 1.02 } },
    { id: 'rule', role: 'shape', required: false, z: 1, box: { x: M, y: 0.245, w: 0.24, h: 0.006 }, style: { fillRef: 'accent' } },
    { id: 'entry1', role: 'text', textRole: 'body', required: false, z: 1, box: { x: M, y: 0.3, w: CW, h: 0.11 }, style: { fontRef: 'body', fontSize: 32, fontWeight: 500, align: 'left', colorRef: 'text', lineHeight: 1.3 } },
    { id: 'entry2', role: 'text', textRole: 'body', required: false, z: 1, box: { x: M, y: 0.43, w: CW, h: 0.11 }, style: { fontRef: 'body', fontSize: 32, fontWeight: 500, align: 'left', colorRef: 'text', lineHeight: 1.3 } },
    { id: 'entry3', role: 'text', textRole: 'body', required: false, z: 1, box: { x: M, y: 0.56, w: CW, h: 0.11 }, style: { fontRef: 'body', fontSize: 32, fontWeight: 500, align: 'left', colorRef: 'text', lineHeight: 1.3 } },
    { id: 'entry4', role: 'text', textRole: 'body', required: false, z: 1, box: { x: M, y: 0.69, w: CW, h: 0.11 }, style: { fontRef: 'body', fontSize: 32, fontWeight: 500, align: 'left', colorRef: 'text', lineHeight: 1.3 } },
  ],
};

const FEATURE_FULL_BLEED: PageTemplate = {
  id: 'feature-full-bleed-v1',
  kind: 'feature-full-bleed',
  description: 'An edge-to-edge feature photo with a gradient scrim, an accent kicker, an overlaid headline, a supporting deck paragraph, and a byline.',
  slots: [
    { id: 'photo', role: 'image', required: true, z: 0, box: { x: 0, y: 0, w: 1, h: 1 }, style: { fit: 'cover' } },
    { id: 'scrim', role: 'shape', required: false, z: 1, box: { x: 0, y: 0.42, w: 1, h: 0.58 }, style: { fillRef: 'text' } },
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 2, box: { x: M, y: 0.55, w: CW, h: 0.04 }, style: { fontRef: 'body', fontSize: 26, fontWeight: 700, align: 'left', colorRef: 'accent' } },
    { id: 'headline', role: 'text', textRole: 'headline', required: true, z: 2, box: { x: M, y: 0.6, w: CW, h: 0.17 }, style: { fontRef: 'display', fontSize: 82, fontWeight: 800, align: 'left', colorRef: 'bg', lineHeight: 1.05 } },
    { id: 'deck', role: 'text', textRole: 'body', required: false, z: 2, box: { x: M, y: 0.79, w: 0.78, h: 0.12 }, style: { fontRef: 'body', fontSize: 30, fontWeight: 400, align: 'left', colorRef: 'bg', lineHeight: 1.4 } },
    { id: 'byline', role: 'text', textRole: 'byline', required: false, z: 2, box: { x: M, y: 0.93, w: 0.7, h: 0.035 }, style: { fontRef: 'body', fontSize: 22, fontWeight: 700, align: 'left', colorRef: 'accent' } },
  ],
};

const TWO_COLUMN_ARTICLE: PageTemplate = {
  id: 'two-column-article-v1',
  kind: 'two-column-article',
  description: 'A standard article page: an accent kicker, a headline, a byline, a supporting photo with a caption, and two columns of body copy.',
  slots: [
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 1, box: { x: M, y: 0.07, w: CW, h: 0.03 }, style: { fontRef: 'body', fontSize: 22, fontWeight: 700, align: 'left', colorRef: 'accent' } },
    { id: 'headline', role: 'text', textRole: 'headline', required: true, z: 1, box: { x: M, y: 0.105, w: CW, h: 0.14 }, style: { fontRef: 'display', fontSize: 68, fontWeight: 700, align: 'left', colorRef: 'text', lineHeight: 1.05 } },
    { id: 'byline', role: 'text', textRole: 'byline', required: false, z: 1, box: { x: M, y: 0.25, w: CW, h: 0.03 }, style: { fontRef: 'body', fontSize: 22, fontWeight: 600, align: 'left', colorRef: 'primary' } },
    { id: 'photo', role: 'image', required: false, z: 1, box: { x: M, y: 0.3, w: CW, h: 0.28 }, style: { fit: 'cover' } },
    { id: 'caption', role: 'text', textRole: 'caption', required: false, z: 2, box: { x: M, y: 0.585, w: CW, h: 0.035 }, style: { fontRef: 'body', fontSize: 19, fontWeight: 400, align: 'left', colorRef: 'secondary' } },
    { id: 'bodyLeft', role: 'text', textRole: 'body', required: true, z: 1, box: { x: M, y: 0.64, w: 0.4, h: 0.3 }, style: { fontRef: 'body', fontSize: 24, fontWeight: 400, align: 'left', colorRef: 'text', lineHeight: 1.5 } },
    { id: 'bodyRight', role: 'text', textRole: 'body', required: false, z: 1, box: { x: 0.52, y: 0.64, w: 0.4, h: 0.3 }, style: { fontRef: 'body', fontSize: 24, fontWeight: 400, align: 'left', colorRef: 'text', lineHeight: 1.5 } },
  ],
};

const PHOTO_GRID: PageTemplate = {
  id: 'photo-grid-v1',
  kind: 'photo-grid',
  description: 'A photo essay: an accent kicker + headline over a 2x2 grid of images, with a one-line caption strip beneath.',
  slots: [
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 1, box: { x: M, y: 0.06, w: CW, h: 0.03 }, style: { fontRef: 'body', fontSize: 22, fontWeight: 700, align: 'left', colorRef: 'accent' } },
    { id: 'headline', role: 'text', textRole: 'headline', required: true, z: 1, box: { x: M, y: 0.095, w: CW, h: 0.1 }, style: { fontRef: 'display', fontSize: 60, fontWeight: 700, align: 'left', colorRef: 'text', lineHeight: 1.05 } },
    { id: 'photo1', role: 'image', required: true, z: 1, box: { x: M, y: 0.22, w: 0.405, h: 0.31 }, style: { fit: 'cover' } },
    { id: 'photo2', role: 'image', required: false, z: 1, box: { x: 0.515, y: 0.22, w: 0.405, h: 0.31 }, style: { fit: 'cover' } },
    { id: 'photo3', role: 'image', required: false, z: 1, box: { x: M, y: 0.55, w: 0.405, h: 0.31 }, style: { fit: 'cover' } },
    { id: 'photo4', role: 'image', required: false, z: 1, box: { x: 0.515, y: 0.55, w: 0.405, h: 0.31 }, style: { fit: 'cover' } },
    { id: 'caption', role: 'text', textRole: 'caption', required: false, z: 1, box: { x: M, y: 0.88, w: CW, h: 0.05 }, style: { fontRef: 'body', fontSize: 20, fontWeight: 400, align: 'left', colorRef: 'secondary', lineHeight: 1.3 } },
  ],
};

const PULL_QUOTE: PageTemplate = {
  id: 'pull-quote-v1',
  kind: 'pull-quote',
  description: 'A full-page pull-quote: an oversized centered quotation between two short accent rules, with an attribution byline.',
  slots: [
    { id: 'ruleTop', role: 'shape', required: false, z: 1, box: { x: 0.44, y: 0.26, w: 0.12, h: 0.008 }, style: { fillRef: 'accent' } },
    { id: 'quote', role: 'text', textRole: 'pullquote', required: true, z: 1, box: { x: 0.12, y: 0.33, w: 0.76, h: 0.34 }, style: { fontRef: 'display', fontSize: 60, fontWeight: 700, align: 'center', vAlign: 'center', colorRef: 'text', lineHeight: 1.22 } },
    { id: 'attribution', role: 'text', textRole: 'byline', required: false, z: 1, box: { x: 0.2, y: 0.71, w: 0.6, h: 0.05 }, style: { fontRef: 'body', fontSize: 26, fontWeight: 700, align: 'center', colorRef: 'primary' } },
    { id: 'ruleBottom', role: 'shape', required: false, z: 1, box: { x: 0.44, y: 0.78, w: 0.12, h: 0.008 }, style: { fillRef: 'accent' } },
  ],
};

// A by-the-numbers page. Each stat sits on a full-width coloured bar, with the
// big figure on the LEFT and its label on the RIGHT — separate boxes that don't
// overlap even if copy runs long (both wrap + clip within the bar).
const STAT_INFOGRAPHIC: PageTemplate = {
  id: 'stat-infographic-v1',
  kind: 'stat-infographic',
  description: "A by-the-numbers page: a title, then three coloured bars. Each bar shows a SHORT figure (e.g. '4.8%', '15,000+', '$12B') on the left and a short label describing it on the right.",
  slots: [
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 2, box: { x: M, y: 0.07, w: CW, h: 0.03 }, style: { fontRef: 'body', fontSize: 22, fontWeight: 700, align: 'left', colorRef: 'accent' } },
    { id: 'title', role: 'text', textRole: 'headline', required: true, z: 2, box: { x: M, y: 0.105, w: CW, h: 0.1 }, style: { fontRef: 'display', fontSize: 60, fontWeight: 800, align: 'left', colorRef: 'text', lineHeight: 1.05 } },
    { id: 'bar1', role: 'shape', required: false, z: 0, box: { x: M, y: 0.25, w: CW, h: 0.17 }, style: { fillRef: 'primary' } },
    { id: 'stat1', role: 'text', textRole: 'headline', required: true, z: 1, box: { x: 0.1, y: 0.28, w: 0.34, h: 0.11 }, style: { fontRef: 'display', fontSize: 82, fontWeight: 800, align: 'left', colorRef: 'bg', lineHeight: 1 } },
    { id: 'label1', role: 'text', textRole: 'caption', required: false, z: 1, box: { x: 0.46, y: 0.29, w: 0.44, h: 0.09 }, style: { fontRef: 'body', fontSize: 26, fontWeight: 500, align: 'left', colorRef: 'bg', lineHeight: 1.25 } },
    { id: 'bar2', role: 'shape', required: false, z: 0, box: { x: M, y: 0.44, w: CW, h: 0.17 }, style: { fillRef: 'secondary' } },
    { id: 'stat2', role: 'text', textRole: 'headline', required: false, z: 1, box: { x: 0.1, y: 0.47, w: 0.34, h: 0.11 }, style: { fontRef: 'display', fontSize: 82, fontWeight: 800, align: 'left', colorRef: 'bg', lineHeight: 1 } },
    { id: 'label2', role: 'text', textRole: 'caption', required: false, z: 1, box: { x: 0.46, y: 0.48, w: 0.44, h: 0.09 }, style: { fontRef: 'body', fontSize: 26, fontWeight: 500, align: 'left', colorRef: 'bg', lineHeight: 1.25 } },
    { id: 'bar3', role: 'shape', required: false, z: 0, box: { x: M, y: 0.63, w: CW, h: 0.17 }, style: { fillRef: 'accent' } },
    { id: 'stat3', role: 'text', textRole: 'headline', required: false, z: 1, box: { x: 0.1, y: 0.66, w: 0.34, h: 0.11 }, style: { fontRef: 'display', fontSize: 82, fontWeight: 800, align: 'left', colorRef: 'text', lineHeight: 1 } },
    { id: 'label3', role: 'text', textRole: 'caption', required: false, z: 1, box: { x: 0.46, y: 0.67, w: 0.44, h: 0.09 }, style: { fontRef: 'body', fontSize: 26, fontWeight: 500, align: 'left', colorRef: 'text', lineHeight: 1.25 } },
  ],
};

const BACK_COVER: PageTemplate = {
  id: 'back-cover-v1',
  kind: 'back-cover',
  description: 'A closing call-to-action page on a solid colour panel: an accent rule, a bold CTA headline, a short paragraph, a large scannable QR, and a scan label.',
  slots: [
    { id: 'panel', role: 'shape', required: false, z: 0, box: { x: 0, y: 0, w: 1, h: 1 }, style: { fillRef: 'primary' } },
    { id: 'accentRule', role: 'shape', required: false, z: 1, box: { x: 0.1, y: 0.16, w: 0.14, h: 0.008 }, style: { fillRef: 'accent' } },
    { id: 'cta', role: 'text', textRole: 'headline', required: true, z: 1, box: { x: 0.1, y: 0.19, w: 0.8, h: 0.2 }, style: { fontRef: 'display', fontSize: 84, fontWeight: 800, align: 'left', colorRef: 'bg', lineHeight: 1.05 } },
    { id: 'body', role: 'text', textRole: 'body', required: false, z: 1, box: { x: 0.1, y: 0.41, w: 0.72, h: 0.16 }, style: { fontRef: 'body', fontSize: 30, fontWeight: 400, align: 'left', colorRef: 'bg', lineHeight: 1.45 } },
    { id: 'qr', role: 'qr', required: true, z: 1, box: { x: 0.1, y: 0.62, w: 0.24, h: 0.185 } },
    { id: 'qrLabel', role: 'text', textRole: 'caption', required: false, z: 1, box: { x: 0.38, y: 0.67, w: 0.5, h: 0.12 }, style: { fontRef: 'body', fontSize: 28, fontWeight: 600, align: 'left', colorRef: 'bg', lineHeight: 1.35 } },
  ],
};

// A universal, deliberately foolproof layout: generous non-overlapping boxes,
// centred copy, one optional image. Used as the fallback when a page fails
// layout validation, so every page still ships clean.
export const SAFE_TEMPLATE: PageTemplate = {
  id: 'safe-fallback-v1',
  kind: 'two-column-article',
  description: 'A safe single-column fallback layout.',
  slots: [
    { id: 'kicker', role: 'text', textRole: 'subhead', required: false, z: 1, layer: 'content', box: { x: M, y: 0.1, w: CW, h: 0.04 }, style: { fontRef: 'body', fontSize: 24, fontWeight: 700, align: 'left', colorRef: 'accent', maxLines: 1 } },
    { id: 'headline', role: 'text', textRole: 'headline', required: true, z: 1, layer: 'content', box: { x: M, y: 0.15, w: CW, h: 0.16 }, style: { fontRef: 'display', fontSize: 64, fontWeight: 700, align: 'left', colorRef: 'text', lineHeight: 1.08, maxLines: 3 } },
    { id: 'photo', role: 'image', required: false, z: 1, layer: 'content', box: { x: M, y: 0.34, w: CW, h: 0.3 }, style: { fit: 'cover' } },
    { id: 'body', role: 'text', textRole: 'body', required: false, z: 1, layer: 'content', box: { x: M, y: 0.67, w: CW, h: 0.26 }, style: { fontRef: 'body', fontSize: 26, fontWeight: 400, align: 'left', colorRef: 'text', lineHeight: 1.5 } },
  ],
};

export const PAGE_TEMPLATES: PageTemplate[] = [
  COVER,
  CONTENTS,
  FEATURE_FULL_BLEED,
  TWO_COLUMN_ARTICLE,
  PHOTO_GRID,
  PULL_QUOTE,
  STAT_INFOGRAPHIC,
  BACK_COVER,
];

const BY_ID = new Map(PAGE_TEMPLATES.map((t) => [t.id, t]));

export function getPageTemplate(id: string): PageTemplate | undefined {
  return BY_ID.get(id);
}

/** Templates valid for a given page kind (≥1 for every kind). */
export function templatesForKind(kind: PageTemplateKind): PageTemplate[] {
  return PAGE_TEMPLATES.filter((t) => t.kind === kind);
}

/** The safe default template for a kind — used when the art-director agent
 *  fails or returns an unknown template id. */
export function defaultTemplateForKind(kind: PageTemplateKind): PageTemplate {
  return templatesForKind(kind)[0] ?? TWO_COLUMN_ARTICLE;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function paletteColor(palette: GenPalette, ref: ColorRef | undefined, fallback: string): string {
  if (!ref) return fallback;
  const v = palette[ref];
  return typeof v === 'string' && HEX_RE.test(v) ? v : fallback;
}

function px(fraction: number, extent: number): number {
  return Math.round(fraction * extent);
}

/** Do two fractional boxes overlap by more than a hair? */
function boxesOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, tol = 0.01): boolean {
  return a.x < b.x + b.w - tol && a.x + a.w > b.x + tol && a.y < b.y + b.h - tol && a.y + a.h > b.y + tol;
}

/**
 * Deterministically turn a template + its slot fills + the plan's palette/fonts
 * into a page background and a list of RAW element objects (canonical px).
 *
 * The caller MUST pass the result's `elements` through validateElements +
 * sanitizeElements before persisting — this output is intentionally loose
 * (it's assembled from model-provided copy) and relies on those guardrails.
 */
export function composePage(
  template: PageTemplate,
  fills: SlotFill[],
  theme: { palette: GenPalette; fonts: GenFonts },
): { background: { type: 'color' | 'image'; value: string }; elements: unknown[] } {
  const { palette, fonts } = theme;
  const fillById = new Map(fills.map((f) => [f.slotId, f]));
  const elements: unknown[] = [];

  // What colour sits behind a text slot, for contrast: the topmost lower-z
  // shape/image the text overlaps. A shape resolves to its palette fill; an
  // image is unknown at compose time, so assume dark (photos usually are) so we
  // pick light text over it. Falls back to the white page background.
  const bgBehind = (slot: PageTemplateSlot): string => {
    let best: { z: number; color: string } | null = null;
    for (const other of template.slots) {
      if (other === slot || other.z >= slot.z) continue;
      if (!boxesOverlap(slot.box, other.box)) continue;
      if (other.role === 'shape') {
        const color = paletteColor(palette, other.style?.fillRef, palette.primary);
        if (!best || other.z > best.z) best = { z: other.z, color };
      } else if (other.role === 'image') {
        if (!best || other.z > best.z) best = { z: other.z, color: '#1a1a1a' };
      }
    }
    return best?.color ?? palette.bg;
  };

  for (const slot of template.slots) {
    const fill = fillById.get(slot.id);
    const box = {
      x: px(slot.box.x, PAGE_W),
      y: px(slot.box.y, PAGE_H),
      w: px(slot.box.w, PAGE_W),
      h: px(slot.box.h, PAGE_H),
    };
    const base = { ...box, rotation: 0, zIndex: slot.z, locked: false, source: 'ai-agent' as const };

    if (slot.role === 'text') {
      const content = fill?.text ?? '';
      // Skip ANY empty text slot — required included. An empty required slot used
      // to emit an invisible, zero-content text element that just occupied a dead
      // box; required copy is now guaranteed upstream by backfillDraft, so a still-
      // empty slot here (e.g. an unfillable figure) should simply be dropped.
      if (!content) continue;
      const s = slot.style ?? {};
      const maxFont = s.fontSize ?? 28;
      const minFont = s.minFontSize ?? Math.max(12, Math.round(maxFont * 0.55));
      const fontFamily = s.fontRef === 'display' ? fonts.display : fonts.body;
      const fontWeight = s.fontWeight ?? 400;
      const lineHeight = s.lineHeight ?? 1.3;
      // Shrink the font so the actual copy fits this box (no overflow / clip),
      // and keep the text legible against whatever sits behind it.
      const fontSize = fitFontSize({
        text: content || 'Ag',
        boxW: box.w,
        boxH: box.h,
        maxFontSize: maxFont,
        minFontSize: minFont,
        lineHeight,
        fontFamily,
        fontWeight,
        maxLines: s.maxLines,
      });
      const desired = paletteColor(palette, s.colorRef, palette.text);
      const color = readableColor(desired, bgBehind(slot), palette.bg, palette.text);
      elements.push({
        ...base,
        type: 'text',
        text: {
          content,
          role: slot.textRole ?? 'body',
          fontFamily,
          fontSize,
          maxFontSize: maxFont,
          fontWeight,
          color,
          align: s.align ?? 'left',
          lineHeight,
          autoFit: 'shrink',
          ...(s.vAlign ? { vAlign: s.vAlign } : {}),
        },
      });
    } else if (slot.role === 'image') {
      if (fill?.image?.url) {
        elements.push({
          ...base,
          type: 'image',
          image: { assetId: fill.image.assetId, url: fill.image.url, alt: fill.image.alt, fit: slot.style?.fit ?? 'cover' },
        });
      } else if (fill?.shapeFill && HEX_RE.test(fill.shapeFill)) {
        // Curator couldn't source a photo — degrade the slot to a flat block.
        elements.push({ ...base, type: 'shape', shape: { fill: fill.shapeFill } });
      }
      // else: no fill → leave the slot empty (white page shows through).
    } else if (slot.role === 'shape') {
      const fillHex =
        fill?.shapeFill && HEX_RE.test(fill.shapeFill)
          ? fill.shapeFill
          : paletteColor(palette, slot.style?.fillRef, palette.primary);
      elements.push({ ...base, type: 'shape', shape: { fill: fillHex } });
    } else if (slot.role === 'qr') {
      const url = fill?.qrUrl ?? '';
      if (!url && !slot.required) continue;
      elements.push({ ...base, type: 'qr', qr: { url, fg: palette.text, bg: palette.bg } });
    }
  }

  // Generated pages sit on a white background; full-bleed photos are image
  // ELEMENTS at zIndex 0, so a missing hero degrades to clean white rather
  // than a broken background image.
  return { background: { type: 'color', value: '#ffffff' }, elements };
}
