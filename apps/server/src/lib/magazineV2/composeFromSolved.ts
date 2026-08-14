// ---------------------------------------------------------------------------
// Magazine Builder v2 — compose solved layout → raw elements.
//
// Bridges the deterministic solver (solveLayout.ts) to the element model. It
// takes a SolvedLayout (absolute integer leaf boxes) + the resolved content for
// each leaf + the theme (palette/fonts), and emits raw element objects — which
// the caller MUST still run through normalizeElements (validate→sanitize→refit),
// exactly like composePage's output. This is the NEW render path for AI-authored
// layouts; the existing fixed-template composePage stays untouched.
//
// Font sizes are NOT authored by the AI — they come from a curated editorial
// TYPE SCALE keyed by leaf role (the "always modern" tokens), then shrunk to the
// solved box by the existing fitFontSize. Colours resolve palette tokens and are
// contrast-repaired against whatever sits behind the text (readableColor). No
// coordinates, weights, or magic pixel nudges here — geometry came entirely from
// the solver.
// ---------------------------------------------------------------------------

import { fitFontSize, readableColor } from './layout.js';
import type { GenPalette, GenFonts } from './templates.js';
import { MIN_DISPLAY_PT, MIN_PROSE_PT, PROSE_ROLES, type ColorRef, type LeafNode, type LeafRole } from './layoutSpec.js';
import type { SolvedLayout, SolvedLeaf, Rect } from './solveLayout.js';
import { ROLE_SCALE, TEXT_ROLES, ptToPx } from './roleScale.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Resolved content for one leaf (produced by the asset curator / ContentDoc). */
export interface LeafFill {
  text?: string; // text roles — plain or inline HTML (sanitized downstream)
  image?: { url: string; assetId: string; alt: string }; // a stored MediaAsset
  qrUrl?: string; // qr roles
  shapeFill?: string; // #rrggbb — image fallback (no photo) or shape override
  iconName?: string; // icon roles — registry glyph name
  iconSrc?: string; // icon roles — uploaded custom icon URL
  iconColor?: string; // icon tint
}
export type ResolvedContent = Record<string, LeafFill>;

export interface ComposedFromSolved {
  background: { type: 'color' | 'image'; value: string };
  elements: unknown[];
}

function paletteColor(palette: GenPalette, ref: ColorRef | undefined, fallback: string): string {
  if (!ref) return fallback;
  const v = palette[ref];
  return typeof v === 'string' && HEX_RE.test(v) ? v : fallback;
}

/** The colour a leaf asked for: an exact hex outranks a palette slot, which outranks
 *  the role's default. The palette is a convenience, never a cage. */
function leafColor(node: LeafNode, palette: GenPalette, refFallback: ColorRef | undefined, fallback: string): string {
  if (node.color && HEX_RE.test(node.color)) return node.color;
  return paletteColor(palette, node.colorRef ?? refFallback, fallback);
}

/**
 * The type size for a text leaf, in page px.
 *
 * The art-director's `fontPt` wins; the role's ceiling is only the default. Both are
 * then handed to `fitFontSize` as a CEILING, so an over-ambitious size still shrinks
 * to its box rather than overflowing — the AI decides the intent, the measurement
 * decides what actually fits.
 *
 * The floor is the one thing the AI does not get to choose, and it is not taste: at
 * 150 DPI a 14px body is 6.7pt, which is smaller than a passport's fine print.
 */
export function typeSizeFor(node: LeafNode, role: LeafRole, scale: { maxFontSize: number; minFontSize: number }): { max: number; min: number } {
  const floorPt = PROSE_ROLES.has(role) ? MIN_PROSE_PT : MIN_DISPLAY_PT;
  const floor = ptToPx(floorPt);
  // THE FLOOR APPLIES WHETHER OR NOT ANYONE DECIDED.
  //
  // It used to apply only where the art-director had named a size, because raising the
  // role DEFAULTS (body 14px = 6.7pt, caption 12px = 5.8pt) without fit-aware authoring
  // converts shrink-to-fit into overflow. That precondition has since been met — the
  // copywriter is given a character budget measured from the real box, and the fit report
  // says when type had to be cut — and a real page then shipped with a panel of copy
  // shrunk to about 5.5pt, which is the worst thing on the sheet. So it applies to both
  // paths now: below this, the words are on the page but nobody can read them.
  const asked = node.fontPt === undefined ? scale.maxFontSize : ptToPx(node.fontPt);
  const min = node.fontPt === undefined ? Math.max(scale.minFontSize, floor) : floor;
  return { max: Math.max(asked, min), min };
}

/** Shift a hex colour toward black (amt<0) or white (amt>0), amt in [-1,1]. */
function shade(hexColor: string, amt: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hexColor);
  if (!m) return hexColor;
  const n = parseInt(m[1]!, 16);
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = adj((n >> 16) & 0xff);
  const g = adj((n >> 8) & 0xff);
  const b = adj(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * The page's background PAINT — a subtle diagonal gradient of a bold background
 * colour (for depth / a modern editorial feel), or the flat colour for the
 * default near-white page (clean white should never be washed). Returned as a CSS
 * `background` value; the renderer applies it via the shorthand, so it works in the
 * editor, the public viewer and the PDF with no renderer change. Contrast math
 * still uses the flat base hex (a gradient stays close to it), so legibility of
 * overlaid text is unaffected.
 */
function backgroundPaint(palette: GenPalette, ref: ColorRef | undefined, base: string): string {
  if (!ref || ref === 'bg' || base.toLowerCase() === palette.bg.toLowerCase()) return base;
  return `linear-gradient(135deg, ${shade(base, 0.12)} 0%, ${base} 45%, ${shade(base, -0.22)} 100%)`;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * The colour sitting behind a text leaf, for contrast: the topmost LOWER-z leaf
 * that overlaps it. A shape resolves to its fill; an image is unknown at compose
 * time so we assume dark (photos usually are) — this is the interim behaviour the
 * auto-scrim task replaces. Falls back to the page background colour.
 */
// A near-black wash for scrims — a shape laid over a photo so overlaid text
// stays legible. It renders semi-transparent (SCRIM_OPACITY), so the picture
// shows through instead of a solid block hiding it.
const SCRIM_FILL = '#0e0e0e';
const SCRIM_OPACITY = 0.55;

/** A `shape` leaf is a SCRIM when it sits over (higher-z than, overlapping) an
 *  image — its job is contrast for text, not a solid panel. Panels over the page
 *  background (stat bars, back-cover panel) are NOT scrims and stay opaque. */
function isScrimShape(leaf: SolvedLeaf, all: SolvedLeaf[]): boolean {
  if (leaf.node.role !== 'shape') return false;
  return all.some((o) => o !== leaf && o.z < leaf.z && o.node.role === 'image' && rectsOverlap(leaf.box, o.box));
}

function bgBehind(leaf: SolvedLeaf, all: SolvedLeaf[], palette: GenPalette, pageBg: string, scrims: Set<SolvedLeaf>): string {
  let best: { z: number; color: string } | null = null;
  for (const other of all) {
    if (other === leaf || other.z >= leaf.z) continue;
    if (!rectsOverlap(leaf.box, other.box)) continue;
    if (other.node.role === 'shape') {
      // A scrim reads as its dark wash (→ light text); a solid panel as its fill.
      const c = scrims.has(other) ? SCRIM_FILL : paletteColor(palette, other.node.colorRef, palette.primary);
      if (!best || other.z > best.z) best = { z: other.z, color: c };
    } else if (other.node.role === 'image') {
      if (!best || other.z > best.z) best = { z: other.z, color: '#1a1a1a' };
    }
  }
  return best?.color ?? pageBg;
}

function buildElement(leaf: SolvedLeaf, fill: LeafFill | undefined, theme: { palette: GenPalette; fonts: GenFonts }, behind: string, isScrim: boolean): unknown | null {
  const { node, box, z } = leaf;
  const base = { x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, zIndex: z, locked: false, source: 'ai-agent' as const };
  const { palette, fonts } = theme;
  const role = node.role as LeafRole;

  // Deliberate emptiness. The solver has already given it its share of the track, which
  // is the entire job — there is nothing to draw, and drawing anything (even a
  // transparent box) would put a click target over the page's whitespace.
  if (role === 'spacer') return null;

  if (role === 'image') {
    if (fill?.image?.url) {
      return { ...base, type: 'image', image: { assetId: fill.image.assetId, url: fill.image.url, alt: fill.image.alt, fit: node.fit ?? 'cover' } };
    }
    if (fill?.shapeFill && HEX_RE.test(fill.shapeFill)) {
      return { ...base, type: 'shape', shape: { fill: fill.shapeFill } }; // no photo → tinted block
    }
    return null; // empty image slot → page background shows through
  }

  if (role === 'shape') {
    // A scrim over a photo → a wash the text can be read through. How dark, and what
    // colour, is now the art-director's call; these constants are only the default.
    if (isScrim) {
      return {
        ...base,
        type: 'shape',
        shape: { fill: node.fill ?? paletteColor(palette, node.colorRef, SCRIM_FILL), opacity: node.opacity ?? SCRIM_OPACITY },
      };
    }
    const f = node.fill ?? (fill?.shapeFill && HEX_RE.test(fill.shapeFill) ? fill.shapeFill : paletteColor(palette, node.colorRef, palette.primary));
    return { ...base, type: 'shape', shape: { fill: f, ...(node.opacity !== undefined ? { opacity: node.opacity } : {}) } };
  }

  if (role === 'qr') {
    const url = fill?.qrUrl ?? '';
    if (!url) return null;
    // A QR CODE IS SQUARE — that is physics, not preference. Given a 1200×160 band it
    // used to become a 1200×160 element with a small glyph adrift in the middle: over a
    // thousand pixels of invisible, selectable dead space at the foot of the page.
    // The element is now the largest square that fits, centred in the box it was given.
    const side = Math.max(1, Math.min(box.w, box.h));
    const sq = { x: box.x + Math.round((box.w - side) / 2), y: box.y + Math.round((box.h - side) / 2), w: side, h: side };
    return { ...base, ...sq, type: 'qr', qr: { url, fg: node.color ?? palette.text, bg: palette.bg } };
  }

  if (role === 'icon') {
    // A glyph is square too — same reasoning as the QR above.
    const side = Math.max(1, Math.min(box.w, box.h));
    const sq = { x: box.x + Math.round((box.w - side) / 2), y: box.y + Math.round((box.h - side) / 2), w: side, h: side };
    const icon: Record<string, unknown> = {};
    // The glyph name is authored by the art-director ON THE LEAF (node.iconName);
    // a curated content fill can still override it. Unknown/absent → the model's
    // fallback glyph (coerceIcon), so an icon leaf always renders something.
    if (node.iconName) icon.name = node.iconName;
    else if (fill?.iconName) icon.name = fill.iconName;
    if (fill?.iconSrc) icon.src = fill.iconSrc;
    // Icons read best in the accent colour on a light page (as in premium refs);
    // an explicit colorRef wins, and contrast is repaired against what's behind.
    const desired = node.color ?? (fill?.iconColor && HEX_RE.test(fill.iconColor) ? fill.iconColor : paletteColor(palette, node.colorRef ?? 'accent', palette.accent));
    // Contrast-repaired against what sits behind it. A purple outline icon on a purple
    // field is not a colour scheme, it is an invisible icon.
    icon.color = readableColor(desired, behind, palette.accent, palette.text);
    return { ...base, ...sq, type: 'icon', icon };
  }

  // text roles
  const content = fill?.text ?? '';
  if (!content.trim()) return null; // skip empty text leaves
  const scale = ROLE_SCALE[role] ?? ROLE_SCALE.body!;
  const fontFamily = (node.fontRef ?? scale.fontRef) === 'display' ? fonts.display : fonts.body;
  const fontWeight = node.weightHint ?? scale.fontWeight;
  const align = node.align ?? scale.align;
  const lineHeight = node.lineHeight ?? scale.lineHeight;
  const tracking = node.tracking;
  const textTransform = node.caps ? 'uppercase' : undefined;
  const size = typeSizeFor(node, role, scale);
  const fontSize = fitFontSize({
    text: content,
    boxW: box.w,
    boxH: box.h,
    maxFontSize: size.max,
    minFontSize: size.min,
    lineHeight,
    fontFamily,
    fontWeight,
    // Tracking and capitals both change how wide the copy runs, so the fit has to see
    // them — otherwise a tracked all-caps label measures short and then overflows.
    ...(tracking !== undefined ? { letterSpacing: tracking } : {}),
    ...(textTransform ? { textTransform } : {}),
  });
  const desired = leafColor(node, palette, scale.colorRef, palette.text);
  const color = readableColor(desired, behind, palette.bg, palette.text);
  return {
    ...base,
    type: 'text',
    text: {
      content,
      role: scale.textRole,
      fontFamily,
      fontSize,
      maxFontSize: size.max,
      // Carried so the print floor survives every later write — see refitText.
      minFontSize: size.min,
      fontWeight,
      color,
      align,
      lineHeight,
      autoFit: 'shrink',
      ...(tracking !== undefined ? { letterSpacing: tracking } : {}),
      ...(textTransform ? { textTransform } : {}),
    },
  };
}

/**
 * Compose a solved layout + its resolved content into raw element objects. The
 * result's `elements` MUST be passed through normalizeElements before persisting
 * (same guardrail contract as composePage).
 */
export function composeFromSolved(
  solved: SolvedLayout,
  content: ResolvedContent,
  theme: { palette: GenPalette; fonts: GenFonts },
): ComposedFromSolved {
  // An exact background colour outranks the palette slot, same rule as a leaf's.
  const pageBg = solved.background.color && HEX_RE.test(solved.background.color)
    ? solved.background.color
    : paletteColor(theme.palette, solved.background.ref, theme.palette.bg);
  const scrims = new Set(solved.leaves.filter((l) => isScrimShape(l, solved.leaves)));
  const elements: unknown[] = [];
  for (const leaf of solved.leaves) {
    const ref = leaf.node.contentRef ?? '';
    const el = buildElement(leaf, content[ref], theme, bgBehind(leaf, solved.leaves, theme.palette, pageBg, scrims), scrims.has(leaf));
    if (el) elements.push(el);
  }
  // Contrast used the flat `pageBg` hex above; the visible page gets the gradient paint.
  // An EXACT background colour is taken literally — if the art-director named a ground,
  // washing a gradient over it would be overruling a decision it just made.
  const paint = solved.background.color && HEX_RE.test(solved.background.color)
    ? pageBg
    : backgroundPaint(theme.palette, solved.background.ref, pageBg);
  return { background: { type: 'color', value: paint }, elements };
}

export { TEXT_ROLES, ROLE_SCALE };
