// ---------------------------------------------------------------------------
// Magazine Builder v2 — the deterministic layout SOLVER.
//
// This is the geometry authority of the AI-authored builder
// (docs/V2-AI-TEMPLATE-BUILDER.md §1). It compiles an AI-authored relative
// frame-tree (layoutSpec.ts) + a page rectangle into absolute, integer element
// boxes by RECURSIVELY PARTITIONING the rectangle. The AI never emits a pixel;
// this pure function owns every pixel. Consequences, by construction:
//
//   • No ACCIDENTAL overlap — siblings are laid end-to-end along one axis; a child
//     rect is always a subset of its parent rect. The overlaps that exist are
//     authored and bounded (2026-11-12): stack layers share their rect (z-ordered);
//     a `place`d layer is anchored INSIDE its stack's rect; a child's `overlap` is a
//     negative gap capped at half of either neighbour and never allowed to cover the
//     previous track's words (layoutContainer re-lays the container until it does
//     not); a `bleed` leaf extends only into the page margin, which nothing else owns.
//   • No off-page — the page rect bounds the root; every descendant is a subset.
//   • A `grid` container sizes its children by `span` on one shared column module,
//     so tracks of the same grid land on the same column lines down the page.
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
  GRID_COLUMNS,
  resolveSpace,
  isRuleLeaf,
  ruleThickness,
  type LayoutSpec,
  type LayoutNode,
  type ContainerNode,
  type LayoutChild,
  type LeafNode,
  type ColorRef,
  type Placement,
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
  /**
   * The leaf's index among its stack's layers, when it IS a stack layer (absent in flow).
   * A shape at index 0 is the PANEL its stack's content sits on — opaque, even when the
   * stack itself is placed over a photograph; a shape at a later index over a photo is
   * that photo's SCRIM. Geometry alone cannot tell the two apart once panels can ride
   * over pictures, so the tree says it. (Absent on leaves built without a tree — a
   * reading reproduced exactly — which keep the geometric rule.)
   */
  stackIndex?: number;
  /** The leaf was extended through the page margin to the trim (`bleed`). */
  bleed?: boolean;
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

/**
 * Optional instrumentation: when a Map is supplied, the solver records the rect it gave
 * EVERY node (containers and stacks as well as leaves). The leaf list alone cannot say
 * how much of a container's track its children actually used, and that is exactly the
 * question the layout balancer (balanceLayout.ts) asks. Purely observational — passing
 * a trace never changes a single box.
 */
export type SolveTrace = Map<LayoutNode, Rect>;

/** No page is larger than this; a "square" past it means the cross length was unknown. */
const MAX_SQUARE_PX = 10_000;

/**
 * The NATURAL main-axis length of a whole subtree — what it needs, not what it is given.
 *
 * Content sizing used to stop at leaves: a `sizing:'content'` child that was a ROW or a
 * COL was silently treated as `fr`, so a two-column title band (headline beside its
 * standfirst) took a weight share of the page however little it held. On a real
 * generated page that was a 787px band holding ~200px of type — the "huge empty band"
 * under a feature title. This is the recursive measure that lets a container hug its
 * content exactly like a leaf does:
 *
 *   • a container along its OWN axis → pad + Σ children + gaps
 *   • a container ACROSS its axis    → pad + the largest child, each measured in the
 *                                      cross length the solver would give it
 *   • a stack                         → its largest CONTENT layer (a shape backing just
 *                                      follows the content it backs)
 *
 * Returns null when anything inside has no natural size — a photo, or a leaf the
 * measurer declines — because such a subtree is FLEXIBLE: it can use whatever it is
 * given, and must keep sharing by weight. A QR or icon is its square (see below). A
 * spacer inside a hugging container is 0 by definition (it is the leftover, and a
 * hugging container has none).
 */
export function naturalMain(node: LayoutNode, axis: MeasureAxis, crossLen: number, measure?: MeasureFn): number | null {
  if (!measure) return null;
  if (node.kind === 'leaf') {
    if (node.role === 'spacer') return 0;
    // A QR and a glyph render as the largest SQUARE that fits (composeFromSolved), so the
    // length they can use along either axis is the length across it. Only when that is a
    // real length — a subtree measured with an unknown cross length has no square.
    if (node.role === 'icon' || node.role === 'qr') return Number.isFinite(crossLen) && crossLen <= MAX_SQUARE_PX ? crossLen : null;
    const m = measure({ leaf: node, axis, crossLen });
    return m != null && Number.isFinite(m) && m >= 0 ? m : null;
  }
  if (node.kind === 'stack') {
    const pad = resolveSpace(node.pad);
    let best = 0;
    let any = false;
    for (const layer of node.layers) {
      if (layer.kind === 'leaf' && (layer.role === 'shape' || layer.role === 'spacer')) continue;
      if (layer.place) {
        // A placed layer needs its own share of the stack plus its inset; a placed PHOTO
        // has no natural size and simply takes the share it was given.
        const need = placedNeed(layer, layer.place, axis, crossLen, pad, measure);
        if (need == null) continue;
        best = Math.max(best, need);
        any = true;
        continue;
      }
      const inner = Math.max(0, crossLen - 2 * clampPad(pad, crossLen));
      const m = naturalMain(layer, axis, inner, measure);
      if (m == null) return null; // a photo layer: the stack is as big as it is given
      best = Math.max(best, m + 2 * pad);
      any = true;
    }
    return any ? best : null;
  }
  const pad = resolveSpace(node.pad);
  const crossPad = clampPad(pad, crossLen);
  const innerCross = Math.max(0, crossLen - 2 * crossPad);
  const n = node.children.length;
  const gap = n > 1 ? resolveSpace(node.gap) : 0;
  const ownAxis: MeasureAxis = node.kind === 'row' ? 'row' : 'col';
  const childNatural = (c: LayoutChild, childAxis: MeasureAxis, childCross: number): number | null => {
    // A RULE is its thickness along its container's axis and stretches across it.
    if (isRuleLeaf(c.node)) return childAxis === ownAxis ? ruleThickness(c.node) : 0;
    const m = naturalMain(c.node, childAxis, childCross, measure);
    if (m == null) return null;
    return c.sizing === 'content' && typeof c.minPx === 'number' && c.minPx > 0 ? Math.max(m, c.minPx) : m;
  };
  if (ownAxis === axis) {
    // A grid is sized by its columns, not by what it holds: along its own axis it is
    // flexible (it uses the length it is given).
    if (gridOf(node)) return null;
    let total = 2 * pad + gap * (n - 1);
    const nats: number[] = [];
    for (const c of node.children) {
      const m = childNatural(c, axis, innerCross);
      if (m == null) return null;
      nats.push(m);
      total += m;
    }
    // Overlaps are negative gaps — capped exactly as layoutContainer caps them.
    for (let i = 1; i < n; i++) total -= Math.min(resolveSpace(node.children[i]!.overlap), Math.floor(0.5 * Math.min(nats[i - 1]!, nats[i]!)));
    return Math.max(0, total);
  }
  // Measured ACROSS the container's axis: each child gets the main length the solver
  // would give it inside `innerCross`, and the tallest (or widest) one decides.
  const available = Math.max(0, innerCross - gap * (n - 1));
  // The cross length of a child here is the very thing being measured, so it is not
  // known yet; the row/col measures in resolveMainSizes only read it for TEXT wrapped
  // along a col, which never happens on this branch (a row's children are measured
  // along 'row' — single-line width — and vice versa).
  const { sizes } = resolveMainSizes(node, available, ownAxis, Number.MAX_SAFE_INTEGER, measure, gap);
  let best = 0;
  for (let i = 0; i < n; i++) {
    const c = node.children[i]!;
    // minPx is a length along THIS container's axis, so it says nothing across it; a
    // rule stretches across.
    if (isRuleLeaf(c.node)) continue;
    const m = naturalMain(c.node, axis, sizes[i]!, measure);
    if (m == null) return null;
    best = Math.max(best, m);
  }
  return 2 * pad + best;
}

/** The grid a container declares (2–12 columns), or 0 when it is a plain flex track. */
function gridOf(node: ContainerNode): number {
  const g = node.grid;
  return typeof g === 'number' && g >= 2 ? Math.min(GRID_COLUMNS, Math.round(g)) : 0;
}

/** Twelfths, clamped to a usable share. */
const twelfths = (v: number) => Math.min(GRID_COLUMNS, Math.max(1, v)) / GRID_COLUMNS;

/**
 * How long a stack must be along `axis` for this PLACED layer to fit: its natural size,
 * scaled up when it is set to a fixed share of the stack, plus its inset on both sides.
 * null when the layer has no natural size (a placed photo).
 */
function placedNeed(layer: LayoutNode, p: Placement, axis: MeasureAxis, crossLen: number, stackPad: number, measure: MeasureFn): number | null {
  const inset = resolveSpace(p.inset, stackPad);
  const innerCross = Math.max(0, crossLen - 2 * inset);
  const crossShare = axis === 'col' ? p.w : p.h;
  const mainShare = axis === 'col' ? p.h : p.w;
  const cross = typeof crossShare === 'number' ? innerCross * twelfths(crossShare) : innerCross;
  const m = naturalMain(layer, axis, cross, measure);
  if (m == null) return null;
  const need = typeof mainShare === 'number' ? m / twelfths(mainShare) : m;
  return need + 2 * inset;
}

/**
 * The rectangle a placed layer occupies inside its stack's `rect`.
 *
 * Bounded by construction: the result is always inside `rect` inset by the placement's
 * own inset (default: the stack's pad), so a placed layer can overlap its siblings in the
 * same stack — that is the point — but never anything outside the stack.
 */
function placeRect(layer: LayoutNode, p: Placement, rect: Rect, stackPad: number, measure?: MeasureFn): Rect {
  const area = insetRect(rect, resolveSpace(p.inset, stackPad));
  const w = typeof p.w === 'number' ? Math.round(area.w * twelfths(p.w)) : area.w;
  const xa = p.x && p.x !== 'stretch' ? p.x : w < area.w ? 'start' : 'stretch';
  const ya0 = p.y ?? (p.h !== undefined ? 'start' : 'stretch');
  let h: number;
  if (typeof p.h === 'number') h = Math.round(area.h * twelfths(p.h));
  else if (p.h === 'content' || ya0 !== 'stretch') {
    const nat = naturalMain(layer, 'col', w, measure);
    h = nat != null ? Math.min(area.h, Math.ceil(nat)) : Math.round(area.h / 2);
  } else h = area.h;
  const ya = ya0 === 'stretch' ? (h < area.h ? 'start' : 'stretch') : ya0;
  const x = xa === 'end' ? area.x + area.w - w : xa === 'center' ? area.x + Math.round((area.w - w) / 2) : area.x;
  const y = ya === 'end' ? area.y + area.h - h : ya === 'center' ? area.y + Math.round((area.h - h) / 2) : area.y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
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
  gap = 0,
): { sizes: number[]; leftover: number } {
  const kids = node.children;
  const n = kids.length;
  const sizes = new Array<number>(n).fill(0);
  const isFr = new Array<boolean>(n).fill(true);
  let sumFixed = 0;

  // ── A COLUMN GRID: every child is `span` columns of one shared module ──────────
  // Column width c = (L − (G−1)·gap) / G over the whole main length L, and a child of s
  // columns is s·c + (s−1)·gap, so its edges land on the same column lines as any other
  // grid track of the same length and gutter — which is what makes a 12-column page read
  // as one grid rather than as rows that each happened to be split. Children without a
  // span share the columns left over equally; spans that do not fill the grid leave the
  // remainder to `justify` (an offset column, a deliberate empty margin).
  const grid = gridOf(node);
  if (grid && n > 0) {
    const L = available + gap * (n - 1);
    const given = kids.reduce((s, c) => s + (typeof c.span === 'number' ? Math.min(grid, Math.max(1, Math.round(c.span))) : 0), 0);
    const unspanned = kids.filter((c) => typeof c.span !== 'number').length;
    const share = unspanned > 0 ? Math.max(1, (grid - given) / unspanned) : 0;
    const spans = kids.map((c) => (typeof c.span === 'number' ? Math.min(grid, Math.max(1, Math.round(c.span))) : share));
    const total = spans.reduce((s, v) => s + v, 0);
    const G = Math.max(grid, total);
    const colW = (L - (G - 1) * gap) / G;
    if (colW > 0) {
      let used = 0;
      for (let i = 0; i < n; i++) {
        sizes[i] = Math.max(0, spans[i]! * colW + (spans[i]! - 1) * gap);
        used += sizes[i]!;
      }
      return { sizes, leftover: Math.max(0, available - used) };
    }
    // Too narrow for a grid at all — fall through to plain weight sharing.
  }

  for (let i = 0; i < n; i++) {
    const c = kids[i]!;
    // A rule is exactly its thickness along this axis, whatever its sizing says.
    if (isRuleLeaf(c.node)) {
      const fixed = Math.min(ruleThickness(c.node), available);
      sizes[i] = fixed;
      isFr[i] = false;
      sumFixed += fixed;
      continue;
    }
    if (c.sizing === 'content') {
      // Measured copy height, raised to the child's band-height floor (minPx —
      // see LayoutChild): a reference's band keeps the height its designer gave
      // it even when our copy is shorter. minPx alone (no measure fn, or a role
      // the measurer declines) still fixes the track. The overfill rescale below
      // applies unchanged, so the tiling guarantee holds.
      //
      // A CONTAINER child is measured too (naturalMain) — it used to fall through to
      // `fr` here without a word, so "hug this title band" was silently "take a weight
      // share of the page". A subtree with no natural size (it holds a photo) still
      // falls back to fr, exactly as before.
      let want = -1;
      if (measure) {
        const m = c.node.kind === 'leaf' ? measure({ leaf: c.node, axis, crossLen }) : naturalMain(c.node, axis, crossLen, measure);
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

/** Roles an overlapping sibling may never cover: everything that carries words or a
 *  scannable/legible mark. Photos and panels are what an overlap is FOR. */
const OVERLAP_BLOCKERS = new Set<string>(['image', 'shape', 'spacer']);
/** Clear air kept between an overlapping track and the copy it rides up to. */
const OVERLAP_CLEARANCE = 12;

function layoutContainer(node: ContainerNode, rect: Rect, out: SolvedLeaf[], z: Z, measure?: MeasureFn, trace?: SolveTrace): void {
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
  const base = Math.max(0, mainLen - gap * (n - 1));
  const axis: MeasureAxis = isRow ? 'row' : 'col';

  // OVERLAPS are negative gaps: child i starts `overlap` before child i−1 ends, so the
  // tracks still sum exactly to the main length (the length an overlap gives back is
  // shared by the tracks like any other). Requested values are first capped at half of
  // either neighbour, then checked against the copy they would cover — see below.
  const overlaps = node.children.map((c, i) => (i === 0 || gridOf(node) ? 0 : resolveSpace(c.overlap)));
  const outStart = out.length;
  const zStart = z.n;

  for (let pass = 0; pass < 4; pass++) {
    if (pass === 3) overlaps.fill(0); // never loop: the last pass lays out with no overlap at all
    let { sizes, leftover } = resolveMainSizes(node, base + overlaps.reduce((s, v) => s + v, 0), axis, crossLen, measure, gap);
    let capped = false;
    for (let i = 1; i < n; i++) {
      const cap = Math.floor(0.5 * Math.min(sizes[i - 1]!, sizes[i]!));
      if (overlaps[i]! > cap) {
        overlaps[i] = Math.max(0, cap);
        capped = true;
      }
    }
    if (capped) ({ sizes, leftover } = resolveMainSizes(node, base + overlaps.reduce((s, v) => s + v, 0), axis, crossLen, measure, gap));

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
    out.length = outStart;
    z.n = zStart;
    let cursor = lead;
    let prevFrom = outStart;
    let retry = false;
    for (let i = 0; i < n; i++) {
      const startF = cursor - overlaps[i]!;
      const endF = startF + sizes[i]!;
      const s = mainStart + Math.round(startF);
      const e = mainStart + Math.round(endF);
      if (overlaps[i]! > 0) {
        // AN OVERLAP NEVER COVERS WORDS. The previous track's copy (and any QR or icon)
        // must end before this track begins; otherwise the overlap is reduced to what
        // fits and the container is laid out again. Photos and panels are fair game —
        // a card riding up over a picture is the device.
        let blockEnd = -Infinity;
        for (let k = prevFrom; k < out.length; k++) {
          const l = out[k]!;
          if (OVERLAP_BLOCKERS.has(l.node.role)) continue;
          blockEnd = Math.max(blockEnd, isRow ? l.box.x + l.box.w : l.box.y + l.box.h);
        }
        if (blockEnd + OVERLAP_CLEARANCE > s) {
          overlaps[i] = Math.max(0, Math.floor(overlaps[i]! - (blockEnd + OVERLAP_CLEARANCE - s)));
          retry = true;
          break;
        }
      }
      const childRect: Rect = isRow
        ? { x: s, y: crossStart, w: e - s, h: crossLen }
        : { x: crossStart, y: s, w: crossLen, h: e - s };
      prevFrom = out.length;
      layoutNode(node.children[i]!.node, childRect, out, z, measure, trace);
      cursor = endF + gap + extra;
    }
    if (!retry) return;
  }
}

interface LeafCtx {
  stackIndex?: number;
  /** A scrim in a stack whose photo bleeds must bleed with it. */
  inheritBleed?: boolean;
}

function layoutNode(node: LayoutNode, rect: Rect, out: SolvedLeaf[], z: Z, measure?: MeasureFn, trace?: SolveTrace, ctx: LeafCtx = {}): void {
  trace?.set(node, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  if (node.kind === 'leaf') {
    const leaf: SolvedLeaf = { node, box: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, z: z.n++ };
    if (ctx.stackIndex !== undefined) leaf.stackIndex = ctx.stackIndex;
    // Marked here, applied once the whole page is solved (solveLayout): only then is the
    // margin it may extend through known.
    if ((node.bleed && (node.role === 'image' || node.role === 'shape')) || ctx.inheritBleed) leaf.bleed = true;
    out.push(leaf);
    return;
  }
  if (node.kind === 'stack') {
    // Layers share the SAME rect — the one intentional overlap (z-ordered). Photos and
    // shapes fill it edge to edge; content layers sit inside the stack's pad; a placed
    // layer is anchored inside it.
    const pad = resolveSpace(node.pad);
    const inner = pad > 0 ? insetRect(rect, pad) : rect;
    const photoBleeds = node.layers.some((l) => l.kind === 'leaf' && l.role === 'image' && l.bleed && !l.place);
    node.layers.forEach((layer, i) => {
      const filling = layer.kind === 'leaf' && (layer.role === 'image' || layer.role === 'shape' || layer.role === 'spacer');
      const r = layer.place ? placeRect(layer, layer.place, rect, pad, measure) : filling ? rect : inner;
      const inheritBleed = photoBleeds && layer.kind === 'leaf' && layer.role === 'shape' && !layer.place && i > 0;
      layoutNode(layer, r, out, z, measure, trace, { stackIndex: i, inheritBleed });
    });
    return;
  }
  layoutContainer(node, rect, out, z, measure, trace);
}

/**
 * Run every bleeding leaf off the page edges it touches.
 *
 * "Touches" means its box sits on the content rectangle's edge (the page less its
 * margin): a photo across the top of a page with a 60px margin is extended up and out
 * to both sides, while the column of text under it stays inside the margin. This is the
 * only place a box ever leaves the content rectangle, and it only ever enters the
 * margin, which nothing else in the tree can occupy — so no new overlap is possible
 * except between two bleeds meeting in a corner of the margin, which a partition rules
 * out (two leaves cannot both own the same corner of the content rectangle).
 */
function applyBleed(leaves: SolvedLeaf[], content: Rect, page: { width: number; height: number }): void {
  const TOL = 1;
  for (const l of leaves) {
    if (!l.bleed) continue;
    const b = l.box;
    let x0 = b.x;
    let y0 = b.y;
    let x1 = b.x + b.w;
    let y1 = b.y + b.h;
    if (Math.abs(b.x - content.x) <= TOL) x0 = 0;
    if (Math.abs(b.y - content.y) <= TOL) y0 = 0;
    if (Math.abs(b.x + b.w - (content.x + content.w)) <= TOL) x1 = page.width;
    if (Math.abs(b.y + b.h - (content.y + content.h)) <= TOL) y1 = page.height;
    l.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    // A leaf that reaches no trim edge (it sits inside a padded container) is not a bleed,
    // whatever it asked for — composeFromSolved keys rotation and QA off this flag.
    if (!(x0 <= 0 || y0 <= 0 || x1 >= page.width || y1 >= page.height)) delete l.bleed;
  }
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
  opts: { measureLeaf?: MeasureFn; trace?: SolveTrace } = {},
): SolvedLayout {
  const margin = resolveSpace(spec.page?.margin, SPACE_PX.md);
  const content = insetRect({ x: 0, y: 0, w: page.width, h: page.height }, margin);
  const leaves: SolvedLeaf[] = [];
  layoutNode(spec.root, content, leaves, { n: 0 }, opts.measureLeaf, opts.trace);
  applyBleed(leaves, content, page);
  const kept = leaves.filter((l) => l.box.w >= MIN_SIZE && l.box.h >= MIN_SIZE);
  return {
    background: spec.page?.background ?? { ref: 'bg' as ColorRef },
    margin,
    page,
    leaves: kept,
  };
}
