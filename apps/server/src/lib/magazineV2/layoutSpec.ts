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
  // text roles (align with model.ts TextRole) + generation-specific ones
  'headline', 'subhead', 'kicker', 'byline', 'body', 'caption', 'pullquote', 'figure', 'label', 'entry',
] as const;
export type LeafRole = (typeof LEAF_ROLES)[number];

// Compile-time nudge: keep the text-ish leaf roles a superset of TextRole.
type _AssertTextRolesCovered = TextRole extends LeafRole | 'other' ? true : never;

// ── Caps — bound the AI's degrees of freedom so a page can't get pathological ──
export const MAX_TREE_DEPTH = 4;
export const MAX_LEAVES = 14;
export const MAX_CHILDREN = 8;
export const MAX_STACK_LAYERS = 5;
export const MAX_WEIGHT = 100;
const MAX_CONTENT_REF = 64;

// ── The tree (TypeScript shape) ───────────────────────────────────────────────

export type Sizing = 'fr' | 'content';

export interface LeafNode {
  kind: 'leaf';
  role: LeafRole;
  /** Key into the ContentDoc for this leaf's copy / image brief / qr / icon. */
  contentRef?: string;
  colorRef?: ColorRef; // text/qr colour (text leaves)
  fontRef?: FontRef; // text leaves
  weightHint?: FontWeight; // text leaves — design's intended weight
  align?: TextAlignToken; // text leaves
  fit?: ImageFit; // image leaves
  /** Curated registry glyph name for an `icon` leaf (validated against ./icons). */
  iconName?: string;
  /** Advisory aspect ratio (w/h) for an image leaf. The solver may ignore it to
   *  keep the partition intact — images conform to their solved box via fit. */
  aspect?: number;
}

export interface ContainerNode {
  kind: 'row' | 'col';
  gap?: SpaceToken;
  pad?: SpaceToken;
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
  node: LayoutNode;
}

export interface PageSpec {
  background?: { ref: ColorRef };
  margin?: SpaceToken;
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
  return leaf;
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
      children.push({
        weight: clampWeight(co.weight),
        sizing: co.sizing === 'content' ? 'content' : 'fr',
        node,
      });
    }
    if (children.length === 0) return null;
    const out: ContainerNode = { kind: o.kind, children };
    const gap = oneOf(o.gap, SPACE_TOKENS, undefined);
    if (gap) out.gap = gap;
    const pad = oneOf(o.pad, SPACE_TOKENS, undefined);
    if (pad) out.pad = pad;
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
    return { kind: 'stack', layers };
  }

  return null; // unknown kind — drop
}

/**
 * Coerce arbitrary untrusted input (an LLM object) into a valid LayoutSpec, or
 * null if the tree is unusable (caller then falls back to a seed spec). Clamps
 * every token/weight, enforces all caps, drops invalid nodes — never throws.
 */
export function normalizeLayoutSpec(raw: unknown): LayoutSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const root = coerceNode(o.root, 1, { leaves: MAX_LEAVES });
  if (!root) return null;

  const spec: LayoutSpec = { root };
  const p = (o.page && typeof o.page === 'object' ? o.page : {}) as Record<string, unknown>;
  const bg = (p.background && typeof p.background === 'object' ? p.background : {}) as Record<string, unknown>;
  const bgRef = oneOf(bg.ref, COLOR_REFS, 'bg')!;
  const margin = oneOf(p.margin, SPACE_TOKENS, 'md')!;
  spec.page = { background: { ref: bgRef }, margin };
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
