// ---------------------------------------------------------------------------
// Magazine Builder v2 — turn a LayoutReading into a LayoutSpec (P2 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// The reading says WHERE things were in the reference (normalised boxes). The spec
// says how the page is COMPOSED (a relative tree). This is the bridge, and it is
// deliberately deterministic — no second model call. The AI reads the picture; the
// geometry is arithmetic, so it can be tested and it cannot hallucinate.
//
// THE ALGORITHM: a guillotine partition. Repeatedly find a straight cut across the
// current rectangle that no region straddles; the bands either side become the
// children of a `col` (horizontal cuts) or a `row` (vertical cuts). Recurse. When no
// cut exists in either axis the regions genuinely overlap, which is the one thing a
// `stack` is for.
//
// This is why the frame-tree survives contact with a photograph of a magazine: every
// spec we emit is one the solver can tile, so overlap and off-page stay structurally
// impossible no matter what the vision model claimed to see.
//
// WHAT IS DELIBERATELY LOST: a guillotine cannot express a pinwheel (four regions
// each overlapping the next's band) or text wrapped around a shape. Such readings
// still produce a VALID spec — the overlap becomes a stack, or the deepest corner
// collapses to its largest region — so FIDELITY is what degrades, never correctness.
// Saying how far it degraded is P3's job (the IoU check); silently building something
// different is the one outcome this feature must never have.
//
// Pure + server-safe: no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import {
  MAX_CHILDREN, MAX_STACK_LAYERS, MAX_TREE_DEPTH, SPACE_PX, SPACE_TOKENS,
  type LayoutChild, type LayoutNode, type LayoutSpec, type LeafNode, type SpaceToken,
} from './layoutSpec.js';
import { PAGE_H, PAGE_W } from './config.js';
import type { LayoutReading, ReadBox, ReadRegion } from './layoutReading.js';

/** Roles that BACK other content: legal as the lower layers of a stack. Mirrors
 *  `isBackingLayer` in layoutSpec.ts and the scrim/panel rules in pruneSpec.ts. */
const BACKING_ROLES = new Set(['image', 'shape']);

/** Boxes closer than this (as a fraction of the page) are treated as touching, not
 *  as a gap. Vision readings are estimates: insisting on exact edges would find a
 *  0.003 overlap between a photo and the caption under it and collapse a perfectly
 *  ordinary layout into a stack. */
const TOUCH = 0.012;

/** Below this, a "gap" is just measurement noise rather than designed whitespace. */
const MIN_GAP = 0.008;

interface Band { start: number; end: number; regions: ReadRegion[] }

/**
 * May a CONTAINER live at this partition depth?
 *
 * The arithmetic has to match `normalizeLayoutSpec` exactly, and it is easy to get
 * wrong: the normalizer numbers the ROOT as depth 1 and drops any node past
 * MAX_TREE_DEPTH, so a container we create at partition-depth `d` sits at normalizer
 * depth `d + 1` and puts its children at `d + 2`. Emitting a container one level too
 * deep does not fail loudly — the normalizer silently deletes every leaf inside it,
 * which would quietly lose a corner of the page.
 */
const canContain = (depth: number) => depth + 2 <= MAX_TREE_DEPTH;

/** Biggest by area. Used where only ONE region can be placed and the rest must go. */
const biggest = (regions: ReadRegion[]): ReadRegion =>
  regions.reduce((a, b) => (b.box.w * b.box.h > a.box.w * a.box.h ? b : a));

const lo = (b: ReadBox, axis: 'y' | 'x') => (axis === 'y' ? b.y : b.x);
const hi = (b: ReadBox, axis: 'y' | 'x') => (axis === 'y' ? b.y + b.h : b.x + b.w);

/**
 * Split regions into the MAXIMAL set of bands along one axis.
 *
 * A sweep, not a search: sort by leading edge, and start a new band whenever the
 * next region begins after everything so far has ended. That yields every cut
 * available in this axis in one pass — and it is the same reason the result is
 * stable: no choice is being made, so there is nothing to get inconsistent.
 */
function bandsAlong(regions: ReadRegion[], axis: 'y' | 'x'): Band[] {
  const sorted = [...regions].sort((a, b) => lo(a.box, axis) - lo(b.box, axis));
  const bands: Band[] = [];
  let cur: Band | null = null;
  for (const r of sorted) {
    const start = lo(r.box, axis);
    const end = hi(r.box, axis);
    // TOUCH slack: a region starting a hair before the previous band ended is
    // adjacent, not overlapping.
    if (cur && start < cur.end - TOUCH) {
      cur.end = Math.max(cur.end, end);
      cur.regions.push(r);
    } else {
      cur = { start, end, regions: [r] };
      bands.push(cur);
    }
  }
  return bands;
}

/** The nearest space token to a gap measured as a fraction of the page. */
function spaceTokenFor(fraction: number, axisPx: number): SpaceToken {
  const px = Math.max(0, fraction) * axisPx;
  let best: SpaceToken = 'none';
  let bestDist = Infinity;
  for (const t of SPACE_TOKENS) {
    const d = Math.abs(SPACE_PX[t] - px);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}

/**
 * The gap token for a set of bands — the MEDIAN of the gaps between them.
 *
 * A container carries one `gap` for all its children, so a single figure has to
 * stand for all of them. The median rather than the mean because one unusually wide
 * separation (a band break that is really a section change) should not stretch every
 * other gap on the page.
 */
function gapFor(bands: Band[], axisPx: number): SpaceToken {
  const gaps: number[] = [];
  for (let i = 1; i < bands.length; i++) {
    const g = bands[i]!.start - bands[i - 1]!.end;
    if (g > MIN_GAP) gaps.push(g);
  }
  if (gaps.length === 0) return 'none';
  gaps.sort((a, b) => a - b);
  return spaceTokenFor(gaps[Math.floor(gaps.length / 2)]!, axisPx);
}

/** fr weight from a band's extent. Fractions are relative, so scaling by 100 keeps
 *  a whole point of resolution per percent and stays inside MAX_WEIGHT. */
const weightFor = (band: Band) => Math.max(1, Math.min(100, Math.round((band.end - band.start) * 100)));

/**
 * Merge adjacent bands until there are at most MAX_CHILDREN of them.
 *
 * Merging the NARROWEST neighbouring pair each time keeps the big structural
 * divisions of the page intact and folds the fine detail together — the opposite
 * choice (truncating to the first eight) would throw away the bottom third of a
 * dense reference.
 */
function capBands(bands: Band[]): Band[] {
  const out = [...bands];
  while (out.length > MAX_CHILDREN) {
    let at = 0;
    let smallest = Infinity;
    for (let i = 1; i < out.length; i++) {
      const span = out[i]!.end - out[i - 1]!.start;
      if (span < smallest) { smallest = span; at = i; }
    }
    const a = out[at - 1]!;
    const b = out[at]!;
    out.splice(at - 1, 2, { start: a.start, end: b.end, regions: [...a.regions, ...b.regions] });
  }
  return out;
}

/** Where each content slot came from in the reference — the mapping that makes the
 *  result MEASURABLE (P3). Without it, "does the built page look like the picture?"
 *  can only ever be answered by eye. */
export type Origin = Record<string, ReadBox>;

/** Names a slot AND records its source box. One function, so a leaf can never be
 *  created with a contentRef that nothing knows the provenance of.
 *
 *  Names follow what the generator's copy and photo steps already expect —
 *  "hero", "photo1", "body", "body2" — so the reflow and the curator both find them. */
type Alloc = (region: ReadRegion) => string;

function makeAlloc(origin: Origin): Alloc {
  const seen = new Map<string, number>();
  return (region) => {
    const base = region.role === 'image' ? 'photo' : region.role;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    // The first photo is the hero — the curator and the reflow both look for it.
    const ref = base === 'photo' ? (n === 1 ? 'hero' : `photo${n - 1}`) : n === 1 ? base : `${base}${n}`;
    origin[ref] = region.box;
    return ref;
  };
}

function leafFor(region: ReadRegion, ref: Alloc): LeafNode {
  const contentRef = ref(region);
  const leaf: LeafNode = { kind: 'leaf', role: region.role, contentRef };
  if (region.colorRef) leaf.colorRef = region.colorRef;
  if (region.align && region.align !== 'justify') leaf.align = region.align;
  // Emphasis is the reference's own hierarchy, mapped onto the weights the
  // art-director prompt uses (800–900 dominant, 400 quiet).
  if (region.emphasis === 'dominant') leaf.weightHint = 800;
  else if (region.emphasis === 'quiet') leaf.weightHint = 400;
  // display for the loud roles, body for prose — the same pairing rule the
  // art-director is told to follow.
  if (['headline', 'pullquote', 'figure', 'kicker'].includes(region.role)) leaf.fontRef = 'display';
  else if (['body', 'caption', 'byline', 'entry', 'label', 'subhead'].includes(region.role)) leaf.fontRef = 'body';
  if (region.role === 'image') leaf.fit = 'cover';
  return leaf;
}

/**
 * A stack for regions that genuinely overlap: backing layers, then ONE content
 * layer.
 *
 * The single content layer is the load-bearing part. Two text layers on one
 * rectangle print on top of each other — layoutSpec.ts has a repair pass for
 * exactly that shape, and producing it here would be walking into the bug from the
 * other side. So the content regions are partitioned among themselves and the
 * result goes in as one layer.
 */
function stackFor(regions: ReadRegion[], depth: number, ref: Alloc): LayoutNode | null {
  const backing = regions.filter((r) => BACKING_ROLES.has(r.role));
  const content = regions.filter((r) => !BACKING_ROLES.has(r.role));
  // Order the backing biggest-first (a full-bleed photo, then its scrim), honouring
  // an explicit z when the model gave one.
  backing.sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || b.box.w * b.box.h - a.box.w * a.box.h);

  if (content.length === 0) {
    // Only backing: a photo behind a photo is not a composition. Keep the largest —
    // a bare shape would be pruned anyway (pruneSpec: never a standalone survivor).
    const first = backing[0];
    return first ? leafFor(first, ref) : null;
  }
  if (backing.length === 0) {
    // Overlapping regions with nothing to back them — two text lines the model read
    // as sharing a rectangle. layoutSpec.ts's repair pass turns exactly this shape
    // into a col, and producing the stack here just to have it repaired later would
    // also recurse: partition() on the same set finds no cut and comes straight back.
    return flatten(content, depth, ref);
  }
  // A stack's layers sit at the same normalizer depth a container's children would,
  // so the same budget applies — and MAX_STACK_LAYERS caps how many can go under the
  // one content layer.
  if (!canContain(depth)) return leafFor(biggest(regions), ref);
  const layers: LayoutNode[] = backing.slice(0, MAX_STACK_LAYERS - 1).map((r) => leafFor(r, ref));
  const contentLayer = content.length === 1 || !canContain(depth + 1)
    // Only one node may go on top, so if the content itself would need a container
    // we cannot afford, the largest piece of it goes up and the rest is given up.
    ? leafFor(content.length === 1 ? content[0]! : biggest(content), ref)
    // depth+1: the content layer sits one level inside the stack.
    : partition(content, depth + 1, ref);
  if (!contentLayer) return null;
  layers.push(contentLayer);
  if (layers.length === 1) return layers[0]!;
  return { kind: 'stack', layers };
}

/**
 * Everything left, flowed down a col in reading order — the escape hatch when the
 * geometry cannot be cut any further.
 *
 * At the very bottom of the depth budget even a col is impossible, and then only one
 * region can be placed. That is a real loss, so it takes the LARGEST region rather
 * than the first: if a corner of the page has to be given up, give up the small
 * print, not the photograph.
 */
function flatten(regions: ReadRegion[], depth: number, ref: Alloc): LayoutNode | null {
  if (regions.length === 0) return null;
  if (regions.length === 1) return leafFor(regions[0]!, ref);
  if (!canContain(depth)) return leafFor(biggest(regions), ref);
  const kept = [...regions].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).slice(0, MAX_CHILDREN);
  return {
    kind: 'col',
    gap: 'sm',
    children: kept.map((r): LayoutChild => ({ weight: Math.max(1, Math.round(r.box.h * 100)), sizing: 'fr', node: leafFor(r, ref) })),
  };
}

/** One level of the partition. Returns null only when there is nothing to place. */
function partition(regions: ReadRegion[], depth: number, ref: Alloc): LayoutNode | null {
  if (regions.length === 0) return null;
  if (regions.length === 1) return leafFor(regions[0]!, ref);
  // Out of depth budget: no container of any kind may be created here.
  if (!canContain(depth)) return leafFor(biggest(regions), ref);

  const rows = bandsAlong(regions, 'y'); // horizontal cuts → a col of bands
  const cols = bandsAlong(regions, 'x'); // vertical cuts → a row of bands

  // Prefer the axis that finds MORE structure; on a tie, cut horizontally, because
  // that is how a page is read and how magazine layouts are built (bands first,
  // columns inside them).
  const useCol = rows.length >= cols.length;
  const bands = capBands(useCol ? rows : cols);

  if (bands.length < 2) {
    // No cut in either axis: these regions overlap. That is what a stack is for.
    return stackFor(regions, depth, ref);
  }

  const children: LayoutChild[] = [];
  for (const band of bands) {
    const node = partition(band.regions, depth + 1, ref);
    if (node) children.push({ weight: weightFor(band), sizing: 'fr', node });
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!.node;
  return {
    kind: useCol ? 'col' : 'row',
    gap: gapFor(bands, useCol ? PAGE_H : PAGE_W),
    children,
  };
}

/**
 * Convert a reading into a spec, or null when this composition cannot be a
 * frame-tree.
 *
 * Null is a real answer the caller must report — "I can't match this layout" beats
 * quietly building a different one, which is the failure mode the whole feature is
 * designed against.
 *
 * PROPORTIONS OVER MEASUREMENT, on purpose: every band gets an `fr` weight taken
 * from the reference rather than `sizing:'content'`. Content-sizing would let the
 * solver give a headline whatever height its text needs — safer for legibility, and
 * the exact opposite of the thing being asked for. The reference's proportions ARE
 * the spec; text that then does not fit its band is a fidelity problem to REPORT
 * (P3), not to silently paper over here.
 */
export function readingToSpec(reading: LayoutReading): { spec: LayoutSpec; origin: Origin } | null {
  const origin: Origin = {};
  const root = partition(reading.regions, 0, makeAlloc(origin));
  if (!root) return null;
  const spec: LayoutSpec = {
    page: {
      margin: reading.margin,
      // 'photo' resolves to 'bg', not to a colour of its own: a photo ground means a
      // full-bleed IMAGE region, which is already in the tree and will cover the
      // page background anyway. `text` is the palette's dark ink, which is what a
      // dark page is painted with.
      background: { ref: reading.background === 'dark' ? 'text' : 'bg' },
    },
    root,
  };
  // Only slots that survived into the tree: the depth cap and the backing-only case
  // both discard regions, and a fidelity score that counted boxes we never placed
  // would be measuring against a page we never claimed to build.
  const placed = new Set(specContentRefs(spec).map((s) => s.ref));
  for (const key of Object.keys(origin)) if (!placed.has(key)) delete origin[key];
  return { spec, origin };
}

/** Every contentRef the spec asks for, in tree order — what the reflow has to fill. */
export function specContentRefs(spec: LayoutSpec): { ref: string; role: string }[] {
  const out: { ref: string; role: string }[] = [];
  const walk = (node: LayoutNode): void => {
    if (node.kind === 'leaf') {
      if (node.contentRef) out.push({ ref: node.contentRef, role: node.role });
      return;
    }
    if (node.kind === 'stack') { node.layers.forEach(walk); return; }
    node.children.forEach((c) => walk(c.node));
  };
  walk(spec.root);
  return out;
}
