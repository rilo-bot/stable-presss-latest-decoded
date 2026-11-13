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
//
// DESIGN DEVICES (2026-11-12) are built here from the same five element kinds:
//   • a drop cap is three text elements (dropCap.ts);
//   • a collage tilt is the element's `rotation` (never on a bleed or at the trim);
//   • with `autoBacking` (the generator), text that sits on a photograph with nothing
//     between them gets a wash — a band scrim across the photo when the text is on it,
//     or an opaque panel when the text straddles the photo's edge (an overlap) — so a
//     deliberate overlap can never print light type on a light page or vice versa.
// Elements are z-ordered on a ×Z_STEP ladder so those inserted shapes always have a
// rung between the photo and the type.
// ---------------------------------------------------------------------------

import { fitFontSize, readableColor, isDark, relativeLuminance } from './layout.js';
import type { GenPalette, GenFonts } from './templates.js';
import { MIN_DISPLAY_PT, MIN_PROSE_PT, PROSE_ROLES, isRuleLeaf, type ColorRef, type LeafNode, type LeafRole } from './layoutSpec.js';
import type { SolvedLayout, SolvedLeaf, Rect } from './solveLayout.js';
import { ROLE_SCALE, TEXT_ROLES, ptToPx } from './roleScale.js';
import { capScrimOpacity, coverage } from './layoutQuality.js';
import { randomUUID } from 'crypto';
import { fitDropCap, DROP_CAP_ID_PREFIX } from './dropCap.js';
import { leafText, WRAP_SAFETY } from './measureLeaf.js';

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

export interface ComposeOptions {
  /**
   * Give text that sits on a photograph with no scrim or panel between them a backing
   * of its own (see the header). The GENERATOR turns this on; the layout-from-reference
   * path leaves it off, because there the reference's own treatment is the design.
   */
  autoBacking?: boolean;
}

/** Elements are stacked on a ladder of this step so inserted shapes fit between rungs. */
const Z_STEP = 4;

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

/** `top` laid over `under` at `opacity` — what the eye sees through a translucent shape. */
function blend(top: string, under: string, opacity: number): string {
  if (!HEX_RE.test(top) || !HEX_RE.test(under)) return top;
  const a = parseInt(top.slice(1), 16);
  const b = parseInt(under.slice(1), 16);
  const mix = (sh: number) => Math.round(((a >> sh) & 0xff) * opacity + ((b >> sh) & 0xff) * (1 - opacity));
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`;
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

// A near-black wash for scrims — a shape laid over a photo so overlaid text
// stays legible. It renders semi-transparent (SCRIM_OPACITY), so the picture
// shows through instead of a solid block hiding it.
const SCRIM_FILL = '#0e0e0e';
export const SCRIM_OPACITY = 0.55;
/** What a photograph is assumed to be, for contrast, when nothing washes it. */
const PHOTO_ASSUMED = '#1a1a1a';

/**
 * A `shape` leaf is a SCRIM when it sits over (higher-z than, overlapping) an image —
 * its job is contrast for text, not a solid panel. Panels over the page background
 * (stat bars, back-cover panel) are NOT scrims and stay opaque, and neither is the
 * FIRST layer of a stack (its stack's own panel, even when that stack is placed over a
 * photograph) or a rule. Shared with the fit report so the two never disagree.
 */
export function isScrimLeaf(leaf: SolvedLeaf, all: SolvedLeaf[]): boolean {
  if (leaf.node.role !== 'shape') return false;
  if (isRuleLeaf(leaf.node)) return false;
  if (leaf.stackIndex === 0) {
    // A stack's own panel stays opaque — a card, a sidebar — UNLESS it would bury a
    // photograph. Covering most of a photo beneath it, an opaque panel hides the
    // picture entirely: a generated cover shipped as a flat green page with its hero
    // photo underneath (user report 2026-11-13). Then it is a scrim, so the photo shows.
    return all.some(
      (o) => o !== leaf && o.z < leaf.z && o.node.role === 'image' && overlapArea(leaf.box, o.box) > 0.5 * o.box.w * o.box.h,
    );
  }
  return all.some((o) => o !== leaf && o.z < leaf.z && o.node.role === 'image' && rectsOverlap(leaf.box, o.box));
}

/** Area of the intersection of two boxes (0 when they don't meet). */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The colour a panel / block shape paints (before any translucency). */
function shapeColor(node: LeafNode, fill: LeafFill | undefined, palette: GenPalette): string {
  return node.fill ?? (fill?.shapeFill && HEX_RE.test(fill.shapeFill) ? fill.shapeFill : paletteColor(palette, node.colorRef, palette.primary));
}

/** The colour a scrim paints. */
function scrimColor(node: LeafNode, palette: GenPalette): string {
  return node.fill ?? paletteColor(palette, node.colorRef, SCRIM_FILL);
}

interface Ground {
  pageBg: string;
  palette: GenPalette;
  content: ResolvedContent;
  scrims: Set<SolvedLeaf>;
  page: { width: number; height: number };
  all: SolvedLeaf[];
  memo: Map<SolvedLeaf, string>;
}

/** The point a box is judged by: its centre. */
const centreIn = (a: Rect, b: Rect) => {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
};

/**
 * The colour sitting behind a leaf, for contrast: the topmost LOWER-z leaf that holds
 * the leaf's centre (or, failing that, covers a quarter of it). A scrim reads as its
 * wash, a panel as its fill (blended with what is under it when translucent), a photo
 * as dark, a tinted stand-in for a missing photo as its tint. Falls back to the page.
 */
function bgBehind(leaf: SolvedLeaf, g: Ground): string {
  const hit = g.memo.get(leaf);
  if (hit) return hit;
  let best: SolvedLeaf | null = null;
  let loose: SolvedLeaf | null = null;
  for (const other of g.all) {
    if (other === leaf || other.z >= leaf.z) continue;
    const r = other.node.role;
    if (r !== 'shape' && r !== 'image') continue;
    if (!rectsOverlap(leaf.box, other.box)) continue;
    if (r === 'image') {
      const f = g.content[other.node.contentRef ?? ''];
      if (!f?.image?.url && !(f?.shapeFill && HEX_RE.test(f.shapeFill))) continue; // nothing drawn there
    }
    if (centreIn(leaf.box, other.box)) {
      if (!best || other.z > best.z) best = other;
    } else if (coverage(leaf.box, other.box) >= 0.25 && (!loose || other.z > loose.z)) loose = other;
  }
  const under = best ?? loose;
  let color = g.pageBg;
  if (under) {
    if (under.node.role === 'image') {
      const f = g.content[under.node.contentRef ?? ''];
      color = f?.image?.url ? PHOTO_ASSUMED : f!.shapeFill!;
    } else if (g.scrims.has(under)) {
      // A dark wash reads dark over any photo; a LIGHT wash only reads light when it is
      // strong enough to win over a dark one — below that, assume the middle.
      const c = scrimColor(under.node, g.palette);
      const op = capScrimOpacity(under.node.opacity ?? SCRIM_OPACITY, under.box, g.page);
      color = isDark(c) ? SCRIM_FILL : op >= 0.6 ? c : '#808080';
    } else {
      const c = shapeColor(under.node, g.content[under.node.contentRef ?? ''], g.palette);
      const op = under.node.opacity ?? 1;
      color = op < 1 ? blend(c, bgBehind(under, g), op) : c;
    }
  }
  g.memo.set(leaf, color);
  return color;
}

/** The tilt a leaf may actually print with: none on a bleed or anywhere near the trim,
 *  where a rotated corner would expose a wedge of bare page. */
function rotationFor(leaf: SolvedLeaf, page: { width: number; height: number }): number {
  const r = leaf.node.rotate;
  if (!r || leaf.bleed) return 0;
  const b = leaf.box;
  const EDGE = 12;
  if (b.x < EDGE || b.y < EDGE || b.x + b.w > page.width - EDGE || b.y + b.h > page.height - EDGE) return 0;
  return r;
}

interface Built {
  els: Record<string, unknown>[];
}

function buildElements(
  leaf: SolvedLeaf,
  fill: LeafFill | undefined,
  theme: { palette: GenPalette; fonts: GenFonts },
  behind: string,
  isScrim: boolean,
  page: { width: number; height: number },
  content: ResolvedContent,
): Built {
  const { node, box, z } = leaf;
  const base = { x: box.x, y: box.y, w: box.w, h: box.h, rotation: rotationFor(leaf, page), zIndex: z * Z_STEP, locked: false, source: 'ai-agent' as const };
  const { palette, fonts } = theme;
  const role = node.role as LeafRole;
  const none: Built = { els: [] };
  const one = (el: Record<string, unknown>): Built => ({ els: [el] });

  // Deliberate emptiness. The solver has already given it its share of the track, which
  // is the entire job — there is nothing to draw, and drawing anything (even a
  // transparent box) would put a click target over the page's whitespace.
  if (role === 'spacer') return none;

  if (role === 'image') {
    if (fill?.image?.url) {
      return one({ ...base, type: 'image', image: { assetId: fill.image.assetId, url: fill.image.url, alt: fill.image.alt, fit: node.fit ?? 'cover' } });
    }
    if (fill?.shapeFill && HEX_RE.test(fill.shapeFill)) {
      return one({ ...base, type: 'shape', shape: { fill: fill.shapeFill } }); // no photo → tinted block
    }
    return none; // empty image slot → page background shows through
  }

  if (role === 'shape') {
    // A scrim over a photo → a wash the text can be read through. How dark, and what
    // colour, is now the art-director's call; these constants are only the default.
    // One limit: a wash spread over most of the sheet may darken the photo, not erase
    // it. At 0.88 over a full page the picture vanished and the page printed as a black
    // field with a little type on it (layoutQuality.MAX_COVERING_SCRIM_OPACITY).
    if (isScrim) {
      return one({
        ...base,
        type: 'shape',
        shape: { fill: scrimColor(node, palette), opacity: capScrimOpacity(node.opacity ?? SCRIM_OPACITY, box, page) },
      });
    }
    return one({ ...base, type: 'shape', shape: { fill: shapeColor(node, fill, palette), ...(node.opacity !== undefined ? { opacity: node.opacity } : {}) } });
  }

  if (role === 'qr') {
    const url = fill?.qrUrl ?? '';
    if (!url) return none;
    // A QR CODE IS SQUARE — that is physics, not preference. Given a 1200×160 band it
    // used to become a 1200×160 element with a small glyph adrift in the middle: over a
    // thousand pixels of invisible, selectable dead space at the foot of the page.
    // The element is now the largest square that fits, centred in the box it was given.
    const side = Math.max(1, Math.min(box.w, box.h));
    const sq = { x: box.x + Math.round((box.w - side) / 2), y: box.y + Math.round((box.h - side) / 2), w: side, h: side };
    return one({ ...base, ...sq, rotation: 0, type: 'qr', qr: { url, fg: node.color ?? palette.text, bg: palette.bg } });
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
    return one({ ...base, ...sq, type: 'icon', icon });
  }

  // text roles
  const text = leafText(node, content);
  if (!text.trim()) return none; // skip empty text leaves
  const scale = ROLE_SCALE[role] ?? ROLE_SCALE.body!;
  const fontFamily = (node.fontRef ?? scale.fontRef) === 'display' ? fonts.display : fonts.body;
  const fontWeight = node.weightHint ?? scale.fontWeight;
  const align = node.align ?? scale.align;
  const lineHeight = node.lineHeight ?? scale.lineHeight;
  const tracking = node.tracking;
  const textTransform = node.caps ? 'uppercase' : undefined;
  const size = typeSizeFor(node, role, scale);
  const desired = leafColor(node, palette, scale.colorRef, palette.text);
  const color = readableColor(desired, behind, palette.bg, palette.text);
  const textEl = (b: { x: number; y: number; w: number; h: number }, copy: string, fontSize: number, pin: boolean, zIndex = base.zIndex) => ({
    ...base,
    ...b,
    zIndex,
    type: 'text',
    text: {
      content: copy,
      role: scale.textRole,
      fontFamily,
      fontSize,
      // A pinned piece (a drop-cap paragraph's halves) is set at ONE size that a later
      // refit cannot move: floor = ceiling.
      maxFontSize: pin ? fontSize : size.max,
      // Carried so the print floor survives every later write — see refitText.
      minFontSize: pin ? fontSize : size.min,
      fontWeight,
      color,
      align,
      lineHeight,
      autoFit: 'shrink',
      ...(tracking !== undefined ? { letterSpacing: tracking } : {}),
      ...(textTransform ? { textTransform } : {}),
    },
  });

  // ── Drop cap: three elements, both text halves pinned to one size ──
  if (node.dropCap && role === 'body') {
    const plan = fitDropCap({
      text, boxW: box.w, boxH: box.h, maxFontSize: size.max, minFontSize: size.min, lineHeight, fontSize: size.max,
      bodyFamily: fontFamily, bodyWeight: fontWeight, capFamily: fonts.display, safety: WRAP_SAFETY,
      ...(tracking !== undefined ? { letterSpacing: tracking } : {}),
      ...(textTransform ? { textTransform } : {}),
    });
    if (plan) {
      const capColor = readableColor(node.color ?? palette.accent, behind, palette.bg, palette.text);
      // Recognisable ids: the pieces only read correctly together (see DROP_CAP_ID_PREFIX).
      const id = `${DROP_CAP_ID_PREFIX}${randomUUID().slice(0, 18)}`;
      const els: Record<string, unknown>[] = [
        {
          ...base,
          id: `${id}-cap`,
          rotation: 0,
          x: box.x + plan.capBox.x,
          y: box.y + plan.capBox.y,
          w: plan.capBox.w,
          h: plan.capBox.h,
          zIndex: base.zIndex + 1,
          type: 'text',
          text: {
            content: plan.cap,
            role: 'other',
            fontFamily: fonts.display,
            fontSize: plan.capFontSize,
            maxFontSize: plan.capFontSize,
            minFontSize: plan.capFontSize,
            fontWeight: plan.capWeight,
            color: capColor,
            align: 'left',
            lineHeight: plan.capLineHeight,
            autoFit: 'shrink',
          },
        },
        { ...textEl({ x: box.x + plan.firstBox.x, y: box.y, w: plan.firstBox.w, h: plan.firstBox.h }, plan.first, plan.fontSize, true), id: `${id}-lead` },
      ];
      if (plan.rest) {
        els.push({ ...textEl({ x: box.x, y: box.y + plan.restY, w: box.w, h: Math.max(1, box.h - plan.restY) }, plan.rest, plan.fontSize, true), id: `${id}-rest` });
      }
      return { els: els.map((e) => ({ ...e, rotation: 0 })) };
    }
    // Copy that cannot carry a cap (too short, a quote mark first) is set plainly.
  }

  const fontSize = fitFontSize({
    text,
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
  return one(textEl({ x: box.x, y: box.y, w: box.w, h: box.h }, text, fontSize, false));
}

// ── Auto-backing: text on a photograph always has something to be read against ──

/** Text clusters closer than this vertically share one band scrim. */
const BAND_JOIN = 48;
/** Air a band scrim keeps around the type it backs. */
const BAND_PAD = 24;
/** A band this close to its photo's edge (share of the photo) runs to the edge. */
const BAND_SNAP = 0.12;
/** The most padding an auto panel takes around straddling type. */
const PANEL_PAD = 16;

interface Backing {
  /** Text leaves that get a band scrim, grouped by the photo under them. */
  bands: Map<SolvedLeaf, SolvedLeaf[]>;
  /** Text leaves that straddle a photo's edge and get an opaque panel. */
  panels: SolvedLeaf[];
}

function planBacking(solved: SolvedLayout, content: ResolvedContent): Backing {
  const bands = new Map<SolvedLeaf, SolvedLeaf[]>();
  const panels: SolvedLeaf[] = [];
  const isPhoto = (l: SolvedLeaf) => l.node.role === 'image' && !!content[l.node.contentRef ?? '']?.image?.url;
  for (const t of solved.leaves) {
    if (!TEXT_ROLES.has(t.node.role) || t.node.rotate) continue;
    if (!leafText(t.node, content).trim()) continue;
    const under = solved.leaves.filter((o) => o !== t && o.z < t.z && rectsOverlap(t.box, o.box));
    let photo: SolvedLeaf | null = null;
    for (const o of under) if (isPhoto(o) && coverage(t.box, o.box) > 0.05 && (!photo || o.z > photo.z)) photo = o;
    if (!photo) continue;
    const backed = under.some((s) => s.node.role === 'shape' && s.z > photo!.z && coverage(t.box, s.box) >= 0.85);
    if (backed) continue;
    if (coverage(t.box, photo.box) >= 0.9) {
      const list = bands.get(photo) ?? [];
      list.push(t);
      bands.set(photo, list);
    } else panels.push(t);
  }
  return { bands, panels };
}

/** One band scrim per vertical cluster of type on a photo: the photo's full width,
 *  from just above the cluster to just below it (snapped to the photo's edge if near). */
function bandScrims(photo: SolvedLeaf, texts: SolvedLeaf[], page: { width: number; height: number }): Rect[] {
  const sorted = [...texts].sort((a, b) => a.box.y - b.box.y);
  const clusters: { y0: number; y1: number }[] = [];
  for (const t of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && t.box.y - last.y1 <= BAND_JOIN) last.y1 = Math.max(last.y1, t.box.y + t.box.h);
    else clusters.push({ y0: t.box.y, y1: t.box.y + t.box.h });
  }
  const p = photo.box;
  const out: Rect[] = [];
  for (const c of clusters) {
    let y0 = Math.max(p.y, c.y0 - BAND_PAD);
    let y1 = Math.min(p.y + p.h, c.y1 + BAND_PAD);
    if (y0 - p.y <= p.h * BAND_SNAP) y0 = p.y;
    if (p.y + p.h - y1 <= p.h * BAND_SNAP) y1 = p.y + p.h;
    const r = { x: Math.max(0, p.x), y: y0, w: Math.min(page.width, p.x + p.w) - Math.max(0, p.x), h: y1 - y0 };
    if (r.w > 0 && r.h > 0) out.push(r);
  }
  return out;
}

/** The padding a panel may take on each side without reaching another element. */
function panelRect(t: SolvedLeaf, solved: SolvedLayout): Rect {
  const b = t.box;
  let left = PANEL_PAD;
  let right = PANEL_PAD;
  let top = PANEL_PAD;
  let bottom = PANEL_PAD;
  for (const o of solved.leaves) {
    if (o === t || o.node.role === 'image' || o.node.role === 'spacer' || o.node.role === 'shape') continue;
    const overlapsX = o.box.x < b.x + b.w && b.x < o.box.x + o.box.w;
    const overlapsY = o.box.y < b.y + b.h && b.y < o.box.y + o.box.h;
    if (overlapsX && o.box.y + o.box.h <= b.y) top = Math.min(top, Math.max(0, b.y - (o.box.y + o.box.h) - 4));
    if (overlapsX && o.box.y >= b.y + b.h) bottom = Math.min(bottom, Math.max(0, o.box.y - (b.y + b.h) - 4));
    if (overlapsY && o.box.x + o.box.w <= b.x) left = Math.min(left, Math.max(0, b.x - (o.box.x + o.box.w) - 4));
    if (overlapsY && o.box.x >= b.x + b.w) right = Math.min(right, Math.max(0, o.box.x - (b.x + b.w) - 4));
  }
  const x0 = Math.max(0, b.x - left);
  const y0 = Math.max(0, b.y - top);
  const x1 = Math.min(solved.page.width, b.x + b.w + right);
  const y1 = Math.min(solved.page.height, b.y + b.h + bottom);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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
  opts: ComposeOptions = {},
): ComposedFromSolved {
  // An exact background colour outranks the palette slot, same rule as a leaf's.
  const pageBg = solved.background.color && HEX_RE.test(solved.background.color)
    ? solved.background.color
    : paletteColor(theme.palette, solved.background.ref, theme.palette.bg);
  const scrims = new Set(solved.leaves.filter((l) => isScrimLeaf(l, solved.leaves)));
  const ground: Ground = { pageBg, palette: theme.palette, content, scrims, page: solved.page, all: solved.leaves, memo: new Map() };

  // Auto-backing: decided before any colour is chosen, because it changes what is behind.
  const extra: Record<string, unknown>[] = [];
  const override = new Map<SolvedLeaf, string>();
  if (opts.autoBacking) {
    const { bands, panels } = planBacking(solved, content);
    for (const [photo, texts] of bands) {
      for (const r of bandScrims(photo, texts, solved.page)) {
        extra.push({
          ...r, rotation: 0, zIndex: photo.z * Z_STEP + 1, locked: false, source: 'ai-agent', type: 'shape',
          shape: { fill: SCRIM_FILL, opacity: capScrimOpacity(SCRIM_OPACITY, r, solved.page) },
        });
      }
      for (const t of texts) override.set(t, SCRIM_FILL);
    }
    for (const t of panels) {
      // Straddling type: an opaque panel of the page's own ground under it, so the half
      // of each line over the photo reads exactly like the half over the paper.
      const fill = relativeLuminance(pageBg) > 0.18 ? pageBg : theme.palette.bg;
      extra.push({ ...panelRect(t, solved), rotation: 0, zIndex: t.z * Z_STEP - 2, locked: false, source: 'ai-agent', type: 'shape', shape: { fill } });
      override.set(t, fill);
    }
  }

  const elements: unknown[] = [...extra];
  for (const leaf of solved.leaves) {
    const ref = leaf.node.contentRef ?? '';
    const behind = override.get(leaf) ?? bgBehind(leaf, ground);
    elements.push(...buildElements(leaf, content[ref], theme, behind, scrims.has(leaf), solved.page, content).els);
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
