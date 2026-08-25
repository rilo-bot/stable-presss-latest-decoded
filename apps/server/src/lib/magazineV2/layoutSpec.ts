// ---------------------------------------------------------------------------
// Magazine Builder v2 — AI-authored layout DSL (the "frame-tree").
//
// This is what the AI art-director emits INSTEAD of coordinates: a RELATIVE
// composition tree of rows / columns / stacks / leaves, using only bounded
// design TOKENS (space/colour/font refs, fr weights, content flags). It carries
// NO pixels. A deterministic engine (solveLayout — next task) compiles a spec +
// a page rectangle into absolute element boxes by recursively partitioning that
// rectangle, so overlap / off-page are structurally impossible.
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
}

export interface ContainerNode {
  kind: 'row' | 'col';
  gap?: Space;
  pad?: Space;
  align?: FlexAlign; // cross-axis
  justify?: FlexAlign; // main-axis
  children: LayoutChild[];
}

/** A stack overlays its layers on the SAME rectangle (the one sanctioned overlap:
 *  z-layers, e.g. text over a full-bleed image + scrim). */
export interface StackNode {
  kind: 'stack';
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
  return leaf;
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
function repairStackLayers(layers: LayoutNode[], depth: number): LayoutNode {
  const content = layers.filter((l) => !isBackingLayer(l));
  if (content.length <= 1) return { kind: 'stack', layers };

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

  if (backing.length === 0) return asCol(content);
  // Layers sit at depth + 1; wrapping them in a col pushes them to depth + 2.
  if (depth + 2 > MAX_TREE_DEPTH) return { kind: 'stack', layers: [...backing, content[0]!] };
  return { kind: 'stack', layers: [...backing, asCol(content)] };
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
      // TOLERATE A FLATTENED CHILD. The grammar wants a WRAPPER — {weight, sizing,
      // node} — but "children" reads like a list of nodes, and models routinely
      // emit the node directly. That used to drop every child, which emptied the
      // container, which returned null for the whole root, which silently shipped a
      // FIXED SEED spec: the "every issue looks the same" bug. Accepting the
      // flattened form costs nothing (weight/sizing just take their defaults) and
      // saves the model's actual design.
      const rawNode = co.node !== undefined ? co.node : typeof co.kind === 'string' ? co : undefined;
      const node = coerceNode(rawNode, depth + 1, budget);
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
    return repairStackLayers(layers, depth);
  }

  return null; // unknown kind — drop
}

/**
 * Coerce arbitrary untrusted input (an LLM object) into a valid LayoutSpec, or
 * null if the tree is unusable (caller then falls back to a seed spec). Clamps
 * every token/weight, enforces all caps, drops invalid nodes — never throws.
 */
/**
 * Find the tree in whatever the model actually returned.
 *
 * The prompt asks for `{ page, root }`, but a rejected spec is a TOTAL loss — the
 * page silently falls back to a fixed seed — so it is worth accepting the obvious
 * near-misses rather than throwing away a good design over its envelope. Anything
 * genuinely unusable still returns undefined and still ends up at the seed.
 */
function pickRoot(o: Record<string, unknown>): unknown {
  if (o.root !== undefined) return o.root;
  // Common aliases for the same idea.
  if (o.layout !== undefined) return o.layout;
  if (o.tree !== undefined) return o.tree;
  // The model skipped the envelope and returned the root node itself.
  if (typeof o.kind === 'string') return o;
  return undefined;
}

export function normalizeLayoutSpec(raw: unknown): LayoutSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const root = coerceNode(pickRoot(o), 1, { leaves: MAX_LEAVES });
  if (!root) return null;

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
