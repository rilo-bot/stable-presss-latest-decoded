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
import type { ColorRef, LeafRole } from './layoutSpec.js';
import type { SolvedLayout, SolvedLeaf, Rect } from './solveLayout.js';
import { ROLE_SCALE, TEXT_ROLES } from './roleScale.js';

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
    // A scrim over a photo → translucent dark wash (legible text, picture visible).
    if (isScrim) return { ...base, type: 'shape', shape: { fill: SCRIM_FILL, opacity: SCRIM_OPACITY } };
    const f = fill?.shapeFill && HEX_RE.test(fill.shapeFill) ? fill.shapeFill : paletteColor(palette, node.colorRef, palette.primary);
    return { ...base, type: 'shape', shape: { fill: f } };
  }

  if (role === 'qr') {
    const url = fill?.qrUrl ?? '';
    if (!url) return null;
    return { ...base, type: 'qr', qr: { url, fg: palette.text, bg: palette.bg } };
  }

  if (role === 'icon') {
    const icon: Record<string, unknown> = {};
    // The glyph name is authored by the art-director ON THE LEAF (node.iconName);
    // a curated content fill can still override it. Unknown/absent → the model's
    // fallback glyph (coerceIcon), so an icon leaf always renders something.
    if (node.iconName) icon.name = node.iconName;
    else if (fill?.iconName) icon.name = fill.iconName;
    if (fill?.iconSrc) icon.src = fill.iconSrc;
    // Icons read best in the accent colour on a light page (as in premium refs);
    // an explicit colorRef wins, and contrast is repaired against what's behind.
    const desired = fill?.iconColor && HEX_RE.test(fill.iconColor) ? fill.iconColor : paletteColor(palette, node.colorRef ?? 'accent', palette.accent);
    icon.color = readableColor(desired, behind, palette.accent, palette.text);
    return { ...base, type: 'icon', icon };
  }

  // text roles
  const content = fill?.text ?? '';
  if (!content.trim()) return null; // skip empty text leaves
  const scale = ROLE_SCALE[role] ?? ROLE_SCALE.body!;
  const fontFamily = (node.fontRef ?? scale.fontRef) === 'display' ? fonts.display : fonts.body;
  const fontWeight = node.weightHint ?? scale.fontWeight;
  const align = node.align ?? scale.align;
  const fontSize = fitFontSize({
    text: content,
    boxW: box.w,
    boxH: box.h,
    maxFontSize: scale.maxFontSize,
    minFontSize: scale.minFontSize,
    lineHeight: scale.lineHeight,
    fontFamily,
    fontWeight,
  });
  const desired = paletteColor(palette, node.colorRef ?? scale.colorRef, palette.text);
  const color = readableColor(desired, behind, palette.bg, palette.text);
  return {
    ...base,
    type: 'text',
    text: {
      content,
      role: scale.textRole,
      fontFamily,
      fontSize,
      maxFontSize: scale.maxFontSize,
      fontWeight,
      color,
      align,
      lineHeight: scale.lineHeight,
      autoFit: 'shrink',
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
  const pageBg = paletteColor(theme.palette, solved.background.ref, theme.palette.bg);
  const scrims = new Set(solved.leaves.filter((l) => isScrimShape(l, solved.leaves)));
  const elements: unknown[] = [];
  for (const leaf of solved.leaves) {
    const ref = leaf.node.contentRef ?? '';
    const el = buildElement(leaf, content[ref], theme, bgBehind(leaf, solved.leaves, theme.palette, pageBg, scrims), scrims.has(leaf));
    if (el) elements.push(el);
  }
  // Contrast used the flat `pageBg` hex above; the visible page gets the gradient paint.
  return { background: { type: 'color', value: backgroundPaint(theme.palette, solved.background.ref, pageBg) }, elements };
}

export { TEXT_ROLES, ROLE_SCALE };
