// ---------------------------------------------------------------------------
// Magazine Builder v2 — AI-authored layout DSL (the "frame-tree").
//
// This is what the AI art-director emits INSTEAD of coordinates: a RELATIVE
// composition tree of rows / columns / stacks / leaves, using only bounded
// design TOKENS (space/colour/font refs, fr weights, content flags). It carries
// NO pixels. A deterministic engine (solveLayout) compiles a spec + a page
// rectangle into absolute element boxes by recursively partitioning that
// rectangle, so off-page is structurally impossible and every overlap is an
// authored, bounded device (stack layers, `place`, `overlap`, `bleed` — see the
// design devices below).
//
// The load-bearing safety rule (docs/V2-AI-TEMPLATE-BUILDER.md §1): the model
// only ever produces one of these trees; it never authors x/y/w/h. This module
// is the trust boundary — `normalizeLayoutSpec` hand-coerces arbitrary untrusted
// input (an LLM object) into a valid, capped, clamped spec, DROPPING anything
// invalid rather than throwing (same discipline as model.ts validateElements).
//
// Pure + server-safe: types + one coercer, no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { TextRole } from './model.js';
import { isKnownIcon } from './icons.js';

// ── Design tokens — the bounded vocabulary the AI is allowed to speak ─────────

/** Spacing scale (gaps / padding / page margin). Resolved to px by the solver. */
export const SPACE_TOKENS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
export type SpaceToken = (typeof SPACE_TOKENS)[number];
/** px at the canonical PAGE_W×PAGE_H scale (see config.ts). */
export const SPACE_PX: Record<SpaceToken, number> = { none: 0, xs: 10, sm: 20, md: 36, lg: 60, xl: 96 };

/**
 * Spacing is a TOKEN OR A NUMBER OF PIXELS — the art-director's own call.
 *
 * The six tokens stopped at 96px, which is a ladder for a body-copy gutter and
 * useless for the deliberate 200px air a modern editorial page puts above a
 * headline. The tokens stay because they are convenient and consistent; a raw
 * number is now equally valid. Anything unusable resolves to the caller's fallback,
 * and the solver still clamps padding to half the rectangle and shrinks gaps that
 * would not fit — so a wild number can waste space but can never break the tiling.
 */
export type Space = SpaceToken | number;
/** A single gap/pad can never sensibly exceed this; the solver clamps again anyway. */
export const MAX_SPACE_PX = 400;

export function resolveSpace(v: Space | undefined, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(MAX_SPACE_PX, Math.max(0, Math.round(v)));
  if (typeof v === 'string' && v in SPACE_PX) return SPACE_PX[v as SpaceToken];
  return fallback;
}

/**
 * TYPE SIZE IS THE ART-DIRECTOR'S DECISION, IN POINTS.
 *
 * It used to come entirely from a 10-role table (roleScale.ts) and the model could
 * not name a size at all. Points, not pixels, because the page is 150 DPI so
 * `pt = px × 0.48`, and a designer thinks in points — a floor expressed in pt is a
 * statement about what can be READ off paper rather than an arbitrary pixel count.
 *
 * The clamp here is only the outer bound of sanity. The real floor is applied per
 * role at compose time (see PROSE_ROLES): prose that cannot be read is a defect, not
 * a decision, while a 6pt tracked label above a headline is a legitimate choice.
 */
export const MIN_TYPE_PT = 5;
export const MAX_TYPE_PT = 220;

/** Roles a reader has to READ, as opposed to glance at. These get the print floor. */
export const PROSE_ROLES = new Set<string>(['body', 'entry', 'caption', 'label', 'byline', 'subhead']);
/** Below this, prose is not readable in print at any size of page. */
export const MIN_PROSE_PT = 8;
/** Display/label type may be deliberately tiny, but never invisible. */
export const MIN_DISPLAY_PT = 6;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Which palette colour a leaf/background resolves to (mirrors templates.ts ColorRef). */
export const COLOR_REFS = ['bg', 'text', 'primary', 'secondary', 'accent'] as const;
export type ColorRef = (typeof COLOR_REFS)[number];

/** Which font of the plan's pairing a text leaf uses. */
export const FONT_REFS = ['display', 'body'] as const;
export type FontRef = (typeof FONT_REFS)[number];

/** Flex main-/cross-axis distribution for containers. */
export const FLEX_ALIGNS = ['start', 'center', 'end', 'between'] as const;
export type FlexAlign = (typeof FLEX_ALIGNS)[number];

/** Text horizontal alignment inside a leaf (maps to the element text align). */
export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlignToken = (typeof TEXT_ALIGNS)[number];

export const IMAGE_FITS = ['cover', 'contain'] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

export const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

/**
 * What a leaf renders. Superset of the text `TextRole`s plus the non-text kinds
 * (image / icon / shape / qr). The solver + composeFromSolved map a leaf role to
 * a concrete element type and its text role.
 */
export const LEAF_ROLES = [
  // non-text
  'image', 'icon', 'shape', 'qr',
  /**
   * DELIBERATE EMPTINESS — a leaf that takes its share of the track and renders nothing.
   *
   * The DSL had no way to say "this space is empty on purpose", and every attempt to work
   * around that absence failed in a different place. `fr` weights always fill their
   * container. `justify` is honoured only when EVERY child is content-sized, so one
   * side-by-side pair inside a cluster defeated it. Content sizing is a no-op on
   * image/qr/icon leaves, so a photo in the cluster defeated it too. And `pad` cannot
   * express it at all, because the space tokens stop at 96px and a half-empty page needs
   * about 1,200. That is why a magazine cover's masthead kept coming back as a band
   * through the middle of the page — three fixes, three different escapes.
   *
   * As a weighted sibling it needs none of those conditions: the emptiness is just
   * another track, so it works whatever the other children are. It also gives the
   * generator the primitive it needs for a whitespace budget, instead of being told
   * "never leave a large empty region" and inflating boxes to obey.
   *
   * Only meaningful as a container child. As a stack layer it would cover the whole
   * rectangle and render nothing, so pruneSpec drops it there.
   */
  'spacer',
  // text roles (align with model.ts TextRole) + generation-specific ones
  'headline', 'subhead', 'kicker', 'byline', 'body', 'caption', 'pullquote', 'figure', 'label', 'entry',
] as const;
export type LeafRole = (typeof LEAF_ROLES)[number];

// Compile-time nudge: keep the text-ish leaf roles a superset of TextRole.
type _AssertTextRolesCovered = TextRole extends LeafRole | 'other' ? true : never;

// ── Caps — the outer bound of a page's structure, not a design opinion ────────
//
// These were tight enough to make reference density arithmetically impossible: at 14
// leaves, a row of five icon+label+text cards is 15 leaves on its own, and at depth 4
// a card with two leaves inside a row inside a col does not fit at all
// (root 1 → col 2 → row 3 → card 4 → leaves 5). Both are raised so the art-director
// can compose at the level a designer thinks at — modules, not loose boxes.
//
// They remain caps because they bound COST and pathology, not taste: every leaf is a
// solved rectangle and a piece of copy to write.
export const MAX_TREE_DEPTH = 6;
export const MAX_LEAVES = 28;
export const MAX_CHILDREN = 12;
export const MAX_STACK_LAYERS = 6;
export const MAX_WEIGHT = 100;
const MAX_CONTENT_REF = 64;

// ── Design devices (2026-11-12) ───────────────────────────────────────────────
//
// The frame-tree used to be able to say only "partition this rectangle", so every
// generated page read as a tidy grid of boxes. A magazine page is designed with a
// handful of devices that a pure partition cannot express: a 12-column grid with
// asymmetric spans, photographs that run off the trim, panels that ride up over a
// photo, a caption tucked into a picture's corner, a drop cap, a ruled pull quote.
//
// Each device below is still RELATIVE (no pixels), still bounded, and still rendered
// with the existing element model: the solver turns it into boxes, the composer into
// ordinary text/image/shape elements. Overlap stays deliberate and contained — a
// placed layer never leaves its stack, an overlap never covers the text it rides
// over (the solver checks), and a bleed only ever extends into the page margin.

/** The page grid. `span`s are columns of a `grid` container; `place.w/h` are twelfths. */
export const GRID_COLUMNS = 12;
/** A placed layer's anchor inside its stack, per axis. */
export const PLACE_ANCHORS = ['start', 'center', 'end', 'stretch'] as const;
export type PlaceAnchor = (typeof PLACE_ANCHORS)[number];
/** Where a text leaf's rule sits (desugared into a rule shape + the leaf). */
export const RULE_SIDES = ['above', 'below', 'both', 'left'] as const;
export type RuleSide = (typeof RULE_SIDES)[number];
/** Collage tilt, in degrees. "Slight" is the whole point: past this it reads as an error. */
export const MAX_ROTATION_DEG = 5;
/** A rule is a line, not a panel: past this thickness use a shape panel instead. */
export const MAX_RULE_PX = 24;
/** The rule a `rule:` sugar draws: about 1.4pt, the classic editorial hairline-plus. */
export const RULE_PX = 3;
/** Ornament text authored on the leaf itself ("“", "01", "§") — never copy. */
export const MAX_GLYPH_CHARS = 3;
/** Roles a `rotate` is honoured on: pictures, blocks and short display marks. */
const ROTATABLE = new Set<string>(['image', 'shape', 'figure', 'label', 'kicker', 'caption']);
/** Roles that may carry a literal `glyph`. */
const GLYPH_ROLES = new Set<string>(['figure', 'label', 'kicker']);
/** Text roles (a rule may decorate any of them). */
const TEXTISH = new Set<string>(['headline', 'subhead', 'kicker', 'byline', 'body', 'caption', 'pullquote', 'figure', 'label', 'entry']);

/**
 * Anchor a STACK LAYER inside the stack's rectangle instead of filling it — a caption
 * tucked into a photo's corner, a panel over its lower third, a numeral on a band.
 * `w`/`h` are twelfths of the stack (after `inset`); `h:'content'` hugs the layer's copy.
 * Ignored anywhere but on a stack layer.
 */
export interface Placement {
  x?: PlaceAnchor;
  y?: PlaceAnchor;
  w?: number;
  h?: number | 'content';
  inset?: Space;
}

// ── The tree (TypeScript shape) ───────────────────────────────────────────────

export type Sizing = 'fr' | 'content';

export interface LeafNode {
  kind: 'leaf';
  role: LeafRole;
  /** Key into the ContentDoc for this leaf's copy / image brief / qr / icon. */
  contentRef?: string;
  colorRef?: ColorRef; // text/qr colour by palette slot (text leaves)
  /** An EXACT colour, #rrggbb — outranks colorRef. The palette is a convenience, not
   *  a cage: a page may want a tone that isn't one of the five slots. Still checked
   *  for legibility against whatever sits behind it. */
  color?: string;
  fontRef?: FontRef; // text leaves
  weightHint?: FontWeight; // text leaves — design's intended weight
  align?: TextAlignToken; // text leaves
  /** Type size in POINTS, authored by the art-director. Clamped to
   *  [MIN_TYPE_PT, MAX_TYPE_PT] here and floored per role at compose time. Absent →
   *  the role's default from roleScale.ts. */
  fontPt?: number;
  /** Leading as a multiple of the type size (0.8–2.5). Absent → the role default. */
  lineHeight?: number;
  /** Letter-spacing in px at page scale (−4…40). The tracked all-caps label is one of
   *  the few devices that reads as designed rather than typed, and it was unreachable. */
  tracking?: number;
  /** Set the copy in capitals as a STYLE, leaving the words themselves untouched. */
  caps?: boolean;
  fit?: ImageFit; // image leaves
  /** Curated registry glyph name for an `icon` leaf (validated against ./icons). */
  iconName?: string;
  /** Advisory aspect ratio (w/h) for an image leaf. The solver may ignore it to
   *  keep the partition intact — images conform to their solved box via fit. */
  aspect?: number;
  /** Fill for a `shape` leaf, and the wash of a scrim, as #rrggbb. */
  fill?: string;
  /** Opacity for a `shape` leaf (0.05–1). A scrim's darkness is a design decision. */
  opacity?: number;
  /** image/shape only: run off every page edge this leaf touches (through the margin). */
  bleed?: boolean;
  /** Collage tilt in degrees (±MAX_ROTATION_DEG) — image/shape/figure/label/kicker/caption. */
  rotate?: number;
  /** body only: open the copy with a drop cap (a separate large initial + the copy split
   *  around it — composeFromSolved). */
  dropCap?: boolean;
  /** Text leaves: a rule above/below/both/left. SUGAR — normalizeLayoutSpec expands it
   *  into a wrapper container holding a rule shape and the leaf (expandDevices). */
  rule?: RuleSide;
  /** shape only: a RULE — this many px along its container's main axis, full length
   *  across it. Survives pruning in flow (a bare shape otherwise never does). */
  thickness?: number;
  /** figure/label/kicker only: ornament text set on the leaf itself (≤3 chars: "“", "01").
   *  Needs no copy, so no contentRef. */
  glyph?: string;
  /** As a stack layer: anchor inside the stack instead of filling it. */
  place?: Placement;
}

export interface ContainerNode {
  kind: 'row' | 'col';
  gap?: Space;
  pad?: Space;
  align?: FlexAlign; // cross-axis
  justify?: FlexAlign; // main-axis
  /** A column grid (2–12): children are sized by `span` columns, `gap` is the gutter. */
  grid?: number;
  /** As a stack layer: anchor inside the stack instead of filling it. */
  place?: Placement;
  children: LayoutChild[];
}

/** A stack overlays its layers on the SAME rectangle (the one sanctioned overlap:
 *  z-layers, e.g. text over a full-bleed image + scrim). Image/shape layers fill the
 *  whole rectangle; content layers sit inside `pad`; a `place`d layer is anchored. */
export interface StackNode {
  kind: 'stack';
  pad?: Space;
  /** As a stack layer of an outer stack: anchor inside it instead of filling it. */
  place?: Placement;
  layers: LayoutNode[];
}

export type LayoutNode = LeafNode | ContainerNode | StackNode;

export interface LayoutChild {
  /** fr weight for `sizing:'fr'` children (>=0). Ignored when `sizing:'content'`. */
  weight?: number;
  /** 'content' → the solver sizes this track to its measured content; 'fr' → by weight. */
  sizing?: Sizing;
  /**
   * Minimum MAIN-axis length in px for a `sizing:'content'` leaf track — the
   * BAND-HEIGHT primitive. Content sizing takes exactly the copy's measured
   * height, which is right for the generator but wrong for a layout copied from
   * a reference: the reference's designer gave a band its height ON PURPOSE
   * (air, or type larger than our default), and measuring only our copy shrank
   * every text band to ~40px where the reference had ~105px — the mechanism
   * behind every measured "loose" fidelity verdict (Fix 1c, 2026-08-16).
   * The track becomes max(measured, minPx); a taller band also lets
   * fitFontSize settle NEARER the role ceiling, so type grows to suit it.
   * Ignored for `sizing:'fr'` children (fr fills anyway). Not offered to the
   * art-director prompt — the generator's bands are its own design.
   */
  minPx?: number;
  /** In a `grid` container: how many columns this child spans (1–grid). */
  span?: number;
  /**
   * Pull this child back over the PREVIOUS sibling by this much (a negative gap) and
   * draw it on top: a panel riding up over a photo, a photo cutting into a colour band.
   * The solver never lets it cover the previous sibling's text, and caps it at half of
   * either track. Ignored on the first child and in a grid.
   */
  overlap?: Space;
  node: LayoutNode;
}

export interface PageSpec {
  /** The page ground: a palette slot, or an exact colour that outranks it. */
  background?: { ref: ColorRef; color?: string };
  margin?: Space;
}

export interface LayoutSpec {
  page?: PageSpec;
  root: LayoutNode;
}

// ── ContentDoc — leaf-keyed copy / briefs (decoupled from structure) ──────────

export interface ContentEntry {
  text?: string;
  imageBrief?: string;
  qrUrl?: string;
  iconName?: string;
}
export type ContentDoc = Record<string, ContentEntry>;

// ── Coercion helpers (drop-invalid, never throw) ──────────────────────────────

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T | undefined): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function optStr(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}
function clampWeight(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.min(MAX_WEIGHT, Math.max(0, n));
}
/** A spacing value: a token, or a raw pixel count. Anything else → undefined. */
function coerceSpace(v: unknown): Space | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.min(MAX_SPACE_PX, Math.round(v));
  return oneOf(v, SPACE_TOKENS, undefined);
}
function coerceHex(v: unknown): string | undefined {
  return typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : undefined;
}
function clampNum(v: unknown, lo: number, hi: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(hi, Math.max(lo, v));
}

function coerceLeaf(o: Record<string, unknown>): LeafNode {
  const role = oneOf(o.role, LEAF_ROLES, 'body')!;
  const leaf: LeafNode = { kind: 'leaf', role };
  const contentRef = optStr(o.contentRef, MAX_CONTENT_REF);
  if (contentRef) leaf.contentRef = contentRef;
  const colorRef = oneOf(o.colorRef, COLOR_REFS, undefined);
  if (colorRef) leaf.colorRef = colorRef;
  const fontRef = oneOf(o.fontRef, FONT_REFS, undefined);
  if (fontRef) leaf.fontRef = fontRef;
  if (FONT_WEIGHTS.includes(o.weightHint as FontWeight)) leaf.weightHint = o.weightHint as FontWeight;
  const align = oneOf(o.align, TEXT_ALIGNS, undefined);
  if (align) leaf.align = align;
  const fit = oneOf(o.fit, IMAGE_FITS, undefined);
  if (fit) leaf.fit = fit;
  if (isKnownIcon(o.iconName)) leaf.iconName = o.iconName as string;
  if (typeof o.aspect === 'number' && Number.isFinite(o.aspect) && o.aspect > 0) {
    leaf.aspect = Math.min(10, Math.max(0.1, o.aspect));
  }
  // The art-director's own type + colour decisions. Each is optional; absent means
  // "use the role default", so a spec written before these existed is unchanged.
  const color = coerceHex(o.color);
  if (color) leaf.color = color;
  const fontPt = clampNum(o.fontPt, MIN_TYPE_PT, MAX_TYPE_PT);
  if (fontPt !== undefined) leaf.fontPt = fontPt;
  const lineHeight = clampNum(o.lineHeight, 0.8, 2.5);
  if (lineHeight !== undefined) leaf.lineHeight = lineHeight;
  const tracking = clampNum(o.tracking, -4, 40);
  if (tracking !== undefined) leaf.tracking = tracking;
  if (o.caps === true) leaf.caps = true;
  const fill = coerceHex(o.fill);
  if (fill) leaf.fill = fill;
  const opacity = clampNum(o.opacity, 0.05, 1);
  if (opacity !== undefined) leaf.opacity = opacity;
  // ── Design devices — each honoured only on the roles it makes sense for ──
  if (o.bleed === true && (role === 'image' || role === 'shape')) leaf.bleed = true;
  const rotate = clampNum(o.rotate, -MAX_ROTATION_DEG, MAX_ROTATION_DEG);
  if (rotate !== undefined && Math.abs(rotate) >= 0.5 && ROTATABLE.has(role)) leaf.rotate = Math.round(rotate * 10) / 10;
  if (o.dropCap === true && role === 'body') leaf.dropCap = true;
  const rule = oneOf(o.rule, RULE_SIDES, undefined);
  if (rule && TEXTISH.has(role)) leaf.rule = rule;
  const thickness = clampNum(o.thickness, 1, MAX_RULE_PX);
  if (thickness !== undefined && role === 'shape') leaf.thickness = Math.round(thickness);
  if (typeof o.glyph === 'string' && GLYPH_ROLES.has(role)) {
    const g = Array.from(o.glyph.trim()).slice(0, MAX_GLYPH_CHARS).join('');
    // A glyph is ornament, never copy: anything longer than a mark is dropped outright
    // rather than truncated into a fragment of a sentence.
    if (g && Array.from(o.glyph.trim()).length <= MAX_GLYPH_CHARS && !/[<>]/.test(g)) leaf.glyph = g;
  }
  const place = coercePlace(o.place);
  if (place) leaf.place = place;
  return leaf;
}

/** A placement from untrusted input, or undefined when it says nothing usable. */
function coercePlace(v: unknown): Placement | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const p: Placement = {};
  const x = oneOf(o.x, PLACE_ANCHORS, undefined);
  if (x) p.x = x;
  const y = oneOf(o.y, PLACE_ANCHORS, undefined);
  if (y) p.y = y;
  const w = clampNum(o.w, 1, GRID_COLUMNS);
  if (w !== undefined) p.w = Math.round(w * 2) / 2;
  if (o.h === 'content') p.h = 'content';
  else {
    const h = clampNum(o.h, 1, GRID_COLUMNS);
    if (h !== undefined) p.h = Math.round(h * 2) / 2;
  }
  const inset = coerceSpace(o.inset);
  if (inset !== undefined) p.inset = inset;
  return Object.keys(p).length > 0 ? p : undefined;
}

/** A stack layer that is legitimately BEHIND content: a full-bleed photo, a scrim,
 *  or a card/panel field. Everything else is a content layer. Mirrors the
 *  image/shape backing distinction drawn by pruneSpec + composeFromSolved. */
function isBackingLayer(node: LayoutNode): boolean {
  // `spacer` is here because it is NOT a content layer: counting it as one would send a
  // stack of [spacer, headline] through the two-content-layers repair below for no reason.
  // pruneSpec drops a spacer layer outright — it is a container child or nothing.
  return node.kind === 'leaf' && (node.role === 'image' || node.role === 'shape' || node.role === 'spacer');
}

/**
 * Repair a stack that overlays TWO OR MORE content layers on the same rectangle.
 *
 * A stack is the one sanctioned overlap, but only ever as backing + ONE content
 * layer (photo → scrim → the text). Two content layers share an identical box, so
 * they print on top of each other — unreadable, and layout QA (correctly) rejects
 * the page as a text-on-text collision, which sent every such page to the fixed
 * template. The intent behind the shape is always sequential content (e.g. a
 * two-tone masthead: "The World of" / "RACING"), so the fix is to flow the content
 * layers down a `col` instead of overlaying them:
 *   • no backing        → the stack BECOMES that col (no depth change)
 *   • backing present   → stack of [ …backing, col(content) ] (one level deeper)
 * Children are content-sized so each line takes only the height its copy needs.
 * `depth` is the stack's own depth; when a wrapper col would breach MAX_TREE_DEPTH
 * we keep the first content layer and drop the rest — an invisible overlapped
 * layer is worth less than a valid page.
 */
function repairStackLayers(layers: LayoutNode[], depth: number, extra: Pick<StackNode, 'pad' | 'place'> = {}): LayoutNode {
  // A PLACED layer has a rectangle of its own inside the stack, so several of them (a
  // headline anchored top-left, a caption bottom-right) are a composition, not a
  // collision. Only the layers that FILL the stack compete for the same box.
  const isFree = (l: LayoutNode) => !isBackingLayer(l) && !l.place;
  const content = layers.filter(isFree);
  if (content.length <= 1) return { kind: 'stack', ...extra, layers };

  if (layers.some((l) => !isFree(l) && !isBackingLayer(l))) {
    // Placed layers present: flow the free content into one col where the first free
    // layer stood, keeping every placed/backing layer in its own z position.
    if (depth + 2 > MAX_TREE_DEPTH) return { kind: 'stack', ...extra, layers: layers.filter((l) => !isFree(l) || l === content[0]) };
    const flowed: ContainerNode = {
      kind: 'col', gap: 'sm', justify: 'center',
      children: content.map((node) => ({ weight: 1, sizing: 'content' as const, node })),
    };
    const out: LayoutNode[] = [];
    for (const l of layers) {
      if (!isFree(l)) out.push(l);
      else if (l === content[0]) out.push(flowed);
    }
    return { kind: 'stack', ...extra, layers: out };
  }

  const backing = layers.filter(isBackingLayer);
  // `justify: 'center'` is load-bearing, not cosmetic: a start-packed container
  // whose children are ALL content-sized trips pruneSpec's FR-GUARANTEE, which
  // promotes the last child to `fr` and balloons that line to the whole leftover
  // strip. Centring anchors the whitespace instead, so the flowed lines stay tight
  // together (a two-tone masthead reads as one unit) and sit centred in the rect
  // the stack used to fill.
  const asCol = (nodes: LayoutNode[]): ContainerNode => ({
    kind: 'col',
    gap: 'sm',
    justify: 'center',
    children: nodes.map((node) => ({ weight: 1, sizing: 'content' as const, node })),
  });

  if (backing.length === 0) return { ...asCol(content), ...extra };
  // Layers sit at depth + 1; wrapping them in a col pushes them to depth + 2.
  if (depth + 2 > MAX_TREE_DEPTH) return { kind: 'stack', ...extra, layers: [...backing, content[0]!] };
  return { kind: 'stack', ...extra, layers: [...backing, asCol(content)] };
}

interface Budget {
  leaves: number;
}

/**
 * Recursively coerce one untrusted node. Enforces depth, per-container child /
 * stack-layer caps, and a GLOBAL leaf budget (threaded through `budget`). Returns
 * null for anything unusable (too deep, empty container, out of leaf budget,
 * unknown kind) — the caller drops it.
 */
function coerceNode(raw: unknown, depth: number, budget: Budget): LayoutNode | null {
  if (depth > MAX_TREE_DEPTH) return null;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.kind === 'leaf') {
    if (budget.leaves <= 0) return null;
    budget.leaves -= 1;
    return coerceLeaf(o);
  }

  if (o.kind === 'row' || o.kind === 'col') {
    const rawChildren = Array.isArray(o.children) ? o.children.slice(0, MAX_CHILDREN) : [];
    const children: LayoutChild[] = [];
    for (const rc of rawChildren) {
      const co = (rc && typeof rc === 'object' ? rc : {}) as Record<string, unknown>;
      const node = coerceNode(co.node, depth + 1, budget);
      if (!node) continue;
      const child: LayoutChild = {
        weight: clampWeight(co.weight),
        sizing: co.sizing === 'content' ? 'content' : 'fr',
        node,
      };
      // Band height: positive finite px only, clamped to a sheet-scale ceiling so
      // untrusted input cannot demand a kilometre-tall track. Kept on 'fr'
      // children too (the solver ignores it there): the reference converter
      // attaches it to fr bands so the height survives `anchored` flipping them
      // to content sizing, and the round-trip invariant — the guillotine's
      // output crosses this boundary UNCHANGED — must keep holding.
      const minPx = Number(co.minPx);
      if (Number.isFinite(minPx) && minPx > 0) {
        child.minPx = Math.min(Math.round(minPx), 2400);
      }
      const span = clampNum(co.span, 1, GRID_COLUMNS);
      if (span !== undefined) child.span = Math.round(span);
      const overlap = coerceSpace(co.overlap);
      if (overlap !== undefined && overlap !== 'none' && overlap !== 0) child.overlap = overlap;
      children.push(child);
    }
    if (children.length === 0) return null;
    const out: ContainerNode = { kind: o.kind, children };
    const gap = coerceSpace(o.gap);
    if (gap !== undefined) out.gap = gap;
    const pad = coerceSpace(o.pad);
    if (pad !== undefined) out.pad = pad;
    const align = oneOf(o.align, FLEX_ALIGNS, undefined);
    if (align) out.align = align;
    const justify = oneOf(o.justify, FLEX_ALIGNS, undefined);
    if (justify) out.justify = justify;
    const grid = clampNum(o.grid, 2, GRID_COLUMNS);
    if (grid !== undefined) out.grid = Math.round(grid);
    const place = coercePlace(o.place);
    if (place) out.place = place;
    return out;
  }

  if (o.kind === 'stack') {
    const rawLayers = Array.isArray(o.layers) ? o.layers.slice(0, MAX_STACK_LAYERS) : [];
    const layers: LayoutNode[] = [];
    for (const rl of rawLayers) {
      const node = coerceNode(rl, depth + 1, budget);
      if (node) layers.push(node);
    }
    if (layers.length === 0) return null;
    const extra: Pick<StackNode, 'pad' | 'place'> = {};
    const pad = coerceSpace(o.pad);
    if (pad !== undefined) extra.pad = pad;
    const place = coercePlace(o.place);
    if (place) extra.place = place;
    return repairStackLayers(layers, depth, extra);
  }

  return null; // unknown kind — drop
}

// ── Device expansion (sugar → core primitives) ─────────────────────────────────

/** Is this a RULE — a shape leaf with a fixed thickness? */
export function isRuleLeaf(node: LayoutNode): boolean {
  return node.kind === 'leaf' && node.role === 'shape' && typeof node.thickness === 'number' && node.thickness > 0;
}

/** A rule's thickness, or 0 for anything that is not a rule. */
export function ruleThickness(node: LayoutNode): number {
  return node.kind === 'leaf' && node.role === 'shape' && typeof node.thickness === 'number' && node.thickness > 0 ? node.thickness : 0;
}

/**
 * A text leaf's `rule` becomes a real rule shape beside it, inside a wrapper that
 * takes the leaf's place (and its `place`, if it was a stack layer). Expanded into the
 * tree rather than drawn at compose time so the solver, the balancer, the fit report
 * and pruning all see one honest structure: the rule's thickness and gap are measured
 * like any other track, and an empty leaf takes its rules with it when it is pruned.
 */
function expandRule(leaf: LeafNode): LayoutNode {
  const { rule: side, place, ...text } = leaf;
  if (!side) return leaf;
  const ruleLeaf = (): LeafNode => ({ kind: 'leaf', role: 'shape', thickness: RULE_PX, colorRef: 'accent' });
  const hugRule = (): LayoutChild => ({ weight: 1, sizing: 'content', node: ruleLeaf() });
  const body: LayoutChild = { weight: 1, sizing: 'fr', node: text };
  const wrap: ContainerNode =
    side === 'left'
      ? { kind: 'row', gap: 18, children: [hugRule(), body] }
      : {
          kind: 'col',
          gap: 14,
          children: side === 'above' ? [hugRule(), body] : side === 'below' ? [body, hugRule()] : [hugRule(), body, hugRule()],
        };
  if (place) wrap.place = place;
  return wrap;
}

/** Expand every device that is sugar for core primitives (today: text `rule`s). Pure;
 *  returns the same object when nothing needed expanding. */
export function expandDevices(node: LayoutNode): LayoutNode {
  if (node.kind === 'leaf') return node.rule ? expandRule(node) : node;
  if (node.kind === 'stack') {
    const layers = node.layers.map(expandDevices);
    return layers.every((l, i) => l === node.layers[i]) ? node : { ...node, layers };
  }
  const children = node.children.map((c) => {
    const n = expandDevices(c.node);
    return n === c.node ? c : { ...c, node: n };
  });
  return children.every((c, i) => c === node.children[i]) ? node : { ...node, children };
}

/** A typed spec (a seed, a test fixture) with its sugar expanded — what normalize does
 *  for model output, for specs that never cross the trust boundary. */
export function expandSpecDevices(spec: LayoutSpec): LayoutSpec {
  const root = expandDevices(spec.root);
  return root === spec.root ? spec : { ...spec, root };
}

/**
 * Coerce arbitrary untrusted input (an LLM object) into a valid LayoutSpec, or
 * null if the tree is unusable (caller then falls back to a seed spec). Clamps
 * every token/weight, enforces all caps, drops invalid nodes — never throws.
 */
export function normalizeLayoutSpec(raw: unknown): LayoutSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const coerced = coerceNode(o.root, 1, { leaves: MAX_LEAVES });
  if (!coerced) return null;
  // Sugar is expanded AFTER the caps: a rule is decoration, not a leaf the copywriter
  // fills, so it does not spend the art-director's leaf budget.
  const root = expandDevices(coerced);

  const spec: LayoutSpec = { root };
  const p = (o.page && typeof o.page === 'object' ? o.page : {}) as Record<string, unknown>;
  const bg = (p.background && typeof p.background === 'object' ? p.background : {}) as Record<string, unknown>;
  const bgRef = oneOf(bg.ref, COLOR_REFS, 'bg')!;
  const bgColor = coerceHex(bg.color);
  const margin = coerceSpace(p.margin) ?? 'md';
  spec.page = { background: { ref: bgRef, ...(bgColor ? { color: bgColor } : {}) }, margin };
  return spec;
}

// ── Introspection helpers (used by the solver + tests) ────────────────────────

export function countLeaves(node: LayoutNode): number {
  if (node.kind === 'leaf') return 1;
  if (node.kind === 'stack') return node.layers.reduce((n, l) => n + countLeaves(l), 0);
  return node.children.reduce((n, c) => n + countLeaves(c.node), 0);
}

export function treeDepth(node: LayoutNode): number {
  if (node.kind === 'leaf') return 1;
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return 1 + kids.reduce((m, k) => Math.max(m, treeDepth(k)), 0);
}
