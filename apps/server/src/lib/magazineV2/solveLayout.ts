// ---------------------------------------------------------------------------
// Magazine Builder v2 — the deterministic layout SOLVER.
//
// This is the geometry authority of the AI-authored builder
// (docs/V2-AI-TEMPLATE-BUILDER.md §1). It compiles an AI-authored relative
// frame-tree (layoutSpec.ts) + a page rectangle into absolute, integer element
// boxes by RECURSIVELY PARTITIONING the rectangle. The AI never emits a pixel;
// this pure function owns every pixel. Consequences, by construction:
//
//   • No overlap  — siblings are laid end-to-end along one axis; a child rect is
//     always a subset of its parent rect. (Stacks are the ONE intentional
//     overlap: layers share the parent rect as z-ordered layers.)
//   • No off-page — the page rect bounds the root; every descendant is a subset.
//   • Integer pixels that tile exactly — child boundaries are placed with
//     rounded CUMULATIVE offsets, so adjacent boxes share an exact edge (no 1px
//     gap/overlap) and the last box lands exactly on the parent's edge.
//
// It is a small flex-partition (row/col/stack) — deliberately NOT a general
// CSS-grid track solver (the most bug-prone algorithm in layout engines). Grid
// looks come from nesting. Pure + O(number of nodes): a single DFS, each
// container O(children). No DOM, no LLM, no I/O, no magic fudge factors —
// every number is either a design token (SPACE_PX), a weight ratio, or an
// exact partition boundary.
//
// `measureLeaf` is the injection point for content-aware sizing (next task):
// left undefined here, every track is sized by fr-weight; supplied later, a
// leaf child marked `sizing:'content'` is sized to its measured content first
// and the remainder distributed by weight — the tiling guarantee is unchanged
// because track sizes remain non-negative and sum to the available length.
// ---------------------------------------------------------------------------

import { PAGE_W, PAGE_H } from './config.js';
import { MIN_SIZE } from './model.js';
import {
  SPACE_PX,
  resolveSpace,
  type LayoutSpec,
  type LayoutNode,
  type ContainerNode,
  type LeafNode,
  type ColorRef,
} from './layoutSpec.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SolvedLeaf {
  node: LeafNode;
  box: Rect; // integer px in the page's own coordinate space
  z: number; // stacking order (DFS pre-order; later = on top)
}

export interface SolvedLayout {
  background: { ref: ColorRef; color?: string };
  margin: number; // resolved page margin in px
  page: { width: number; height: number };
  leaves: SolvedLeaf[];
}

export type MeasureAxis = 'row' | 'col';
export interface MeasureArgs {
  leaf: LeafNode;
  /** The container's main axis: 'row' → measuring width; 'col' → measuring height. */
  axis: MeasureAxis;
  /** The cross-axis length (px) the leaf will occupy — the width to wrap text in. */
  crossLen: number;
}
/** Returns a leaf's desired MAIN-axis size in px, or null to fall back to fr-weight. */
export type MeasureFn = (args: MeasureArgs) => number | null;

interface Z {
  n: number;
}

/** Total padding on an axis can never exceed the extent (keeps inner rect ≥ 0). */
function clampPad(pad: number, extent: number): number {
  return Math.max(0, Math.min(pad, Math.floor(extent / 2)));
}

function insetRect(r: Rect, pad: number): Rect {
  const px = clampPad(pad, r.w);
  const py = clampPad(pad, r.h);
  return { x: r.x + px, y: r.y + py, w: r.w - 2 * px, h: r.h - 2 * py };
}

/**
 * Compute each child's exact (float) MAIN size, summing to `available`.
 * Content-sized leaf children (when a measure fn is supplied) take a fixed size
 * first; the remainder is split among fr children by weight. Returns the sizes
 * plus any `leftover` (only > 0 when every track is fixed and they under-fill).
 */
function resolveMainSizes(
  node: ContainerNode,
  available: number,
  axis: MeasureAxis,
  crossLen: number,
  measure?: MeasureFn,
): { sizes: number[]; leftover: number } {
  const kids = node.children;
  const n = kids.length;
  const sizes = new Array<number>(n).fill(0);
  const isFr = new Array<boolean>(n).fill(true);
  let sumFixed = 0;

  for (let i = 0; i < n; i++) {
    const c = kids[i]!;
    if (c.sizing === 'content' && c.node.kind === 'leaf') {
      // Measured copy height, raised to the child's band-height floor (minPx —
      // see LayoutChild): a reference's band keeps the height its designer gave
      // it even when our copy is shorter. minPx alone (no measure fn, or a role
      // the measurer declines) still fixes the track. The overfill rescale below
      // applies unchanged, so the tiling guarantee holds.
      let want = -1;
      if (measure) {
        const m = measure({ leaf: c.node, axis, crossLen });
        if (m != null && Number.isFinite(m) && m >= 0) want = m;
      }
      if (typeof c.minPx === 'number' && c.minPx > 0) want = Math.max(want, c.minPx);
      if (want >= 0) {
        const fixed = Math.min(want, available);
        sizes[i] = fixed;
        isFr[i] = false;
        sumFixed += fixed;
      }
    }
  }

  // If fixed tracks overflow the available length, scale them proportionally to
  // fit (never negative). True content splitting/pagination arrives with the
  // content-sizing task; scaling keeps the invariant intact in the meantime.
  if (sumFixed > available && sumFixed > 0) {
    const s = available / sumFixed;
    for (let i = 0; i < n; i++) if (!isFr[i]) sizes[i] *= s;
    sumFixed = available;
  }

  let remaining = Math.max(0, available - sumFixed);

  const frIdx: number[] = [];
  let totalW = 0;
  for (let i = 0; i < n; i++) {
    if (isFr[i]) {
      frIdx.push(i);
      totalW += Math.max(0, kids[i]!.weight ?? 1);
    }
  }
  if (frIdx.length > 0) {
    if (totalW <= 0) {
      for (const i of frIdx) sizes[i] = remaining / frIdx.length;
    } else {
      for (const i of frIdx) sizes[i] = (remaining * Math.max(0, kids[i]!.weight ?? 1)) / totalW;
    }
    remaining = 0;
  }

  return { sizes, leftover: remaining };
}

function layoutContainer(node: ContainerNode, rect: Rect, out: SolvedLeaf[], z: Z, measure?: MeasureFn): void {
  const inner = insetRect(rect, resolveSpace(node.pad));
  const isRow = node.kind === 'row';
  const n = node.children.length;

  const mainLen = isRow ? inner.w : inner.h;
  const crossLen = isRow ? inner.h : inner.w;
  const mainStart = isRow ? inner.x : inner.y;
  const crossStart = isRow ? inner.y : inner.x;

  // Gaps must fit inside the main length; if they don't, shrink them
  // proportionally (integer) so `available` is never negative.
  let gap = resolveSpace(node.gap);
  if (n > 1 && gap * (n - 1) > mainLen) gap = Math.max(0, Math.floor(mainLen / (n - 1)));
  const available = Math.max(0, mainLen - gap * (n - 1));

  const { sizes, leftover } = resolveMainSizes(node, available, isRow ? 'row' : 'col', crossLen, measure);

  // Distribute any leftover (all-fixed, under-filled) along the main axis per justify.
  let lead = 0;
  let extra = 0;
  if (leftover > 0) {
    const j = node.justify ?? 'start';
    if (j === 'end') lead = leftover;
    else if (j === 'center') lead = leftover / 2;
    else if (j === 'between') extra = n > 1 ? leftover / (n - 1) : 0;
    // 'start' → children packed at the start, leftover trails (lead = extra = 0)
  }

  // Place children with rounded cumulative offsets: because gaps are integers,
  // Math.round(x + integer) === Math.round(x) + integer, so adjacent boxes share
  // an exact edge and stay strictly within [mainStart, mainStart + mainLen].
  let cursor = lead;
  for (let i = 0; i < n; i++) {
    const startF = cursor;
    const endF = cursor + sizes[i]!;
    const s = mainStart + Math.round(startF);
    const e = mainStart + Math.round(endF);
    const childRect: Rect = isRow
      ? { x: s, y: crossStart, w: e - s, h: crossLen }
      : { x: crossStart, y: s, w: crossLen, h: e - s };
    layoutNode(node.children[i]!.node, childRect, out, z, measure);
    cursor = endF + gap + extra;
  }
}

function layoutNode(node: LayoutNode, rect: Rect, out: SolvedLeaf[], z: Z, measure?: MeasureFn): void {
  if (node.kind === 'leaf') {
    out.push({ node, box: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, z: z.n++ });
    return;
  }
  if (node.kind === 'stack') {
    // Layers share the SAME rect — the one intentional overlap (z-ordered).
    for (const layer of node.layers) layoutNode(layer, rect, out, z, measure);
    return;
  }
  layoutContainer(node, rect, out, z, measure);
}

/**
 * Compile a LayoutSpec into absolute, integer leaf boxes for a page. Pure and
 * deterministic. Leaves whose solved box is below MIN_SIZE in either dimension
 * are dropped (they can't render, and letting the downstream MIN_SIZE clamp grow
 * them would break the no-overlap guarantee) — the same drop-invalid discipline
 * as validateElements.
 */
export function solveLayout(
  spec: LayoutSpec,
  page: { width: number; height: number } = { width: PAGE_W, height: PAGE_H },
  opts: { measureLeaf?: MeasureFn } = {},
): SolvedLayout {
  const margin = resolveSpace(spec.page?.margin, SPACE_PX.md);
  const content = insetRect({ x: 0, y: 0, w: page.width, h: page.height }, margin);
  const leaves: SolvedLeaf[] = [];
  layoutNode(spec.root, content, leaves, { n: 0 }, opts.measureLeaf);
  const kept = leaves.filter((l) => l.box.w >= MIN_SIZE && l.box.h >= MIN_SIZE);
  return {
    background: spec.page?.background ?? { ref: 'bg' as ColorRef },
    margin,
    page,
    leaves: kept,
  };
}
