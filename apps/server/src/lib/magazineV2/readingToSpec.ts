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
  MAX_SPACE_PX, SPACE_PX, SPACE_TOKENS,
  type ContainerNode, type FlexAlign, type LayoutChild, type LayoutNode, type LayoutSpec, type LeafNode, type SpaceToken, type TextAlignToken,
} from './layoutSpec.js';

/**
 * THIS PATH PINS ITS OWN BUDGET, and must keep doing so.
 *
 * The guillotine's output is not just "a valid page" — it is the thing the IoU
 * fidelity check measures a reference against, and how deep it may cut decides which
 * partition it finds. Reading the DSL's global caps here meant that raising them for
 * the GENERATOR (so the art-director can compose modules) silently re-cut every
 * reference layout and moved every fidelity score with it. Those are two different
 * jobs: the generator wants room to design, this wants a stable, faithful transform.
 *
 * These numbers are the caps as they stood when the fidelity behaviour was measured
 * and accepted. They may only change alongside a re-measurement.
 */
const MAX_TREE_DEPTH = 4;
const MAX_CHILDREN = 8;
const MAX_STACK_LAYERS = 5;
import { PAGE_H, PAGE_W } from './config.js';
import type { LayoutReading, ReadBox, ReadRegion } from './layoutReading.js';
import { TEXT_ROLES, pxToPt } from './roleScale.js';
import type { SolvedLeaf } from './solveLayout.js';

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

/** Mirrors solveLayout's own MIN_SIZE: the smallest box worth emitting. */
const MIN_LEAF_PX = 2;

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

/**
 * A clear run at either end of a rectangle becomes a `spacer` sibling above this — the
 * same noise floor as a gap, because that is the same measurement.
 *
 * There USED to be a 25% threshold here, on the theory that a 10% run is an ordinary
 * margin rather than design and should be left to fr weights. That was true of the old
 * mechanism, which content-sized every child and would wreck an ordinary page. It is false
 * of a spacer, which is just one more weighted track: reproducing a 3% offset is as
 * harmless as reproducing a 60% one, and DROPPING it was measurably worse. On a real cover
 * fixture, ignoring a 3% lead shifted the whole cluster to the top edge and took the
 * kicker's IoU from 0.46 to 0.005 — thin bands land nowhere near their reference box when
 * everything above them is missing. So every run above the noise floor is reproduced.
 *
 * Why a spacer at all, rather than the three things tried before: `justify` is honoured
 * only when every track is content-sized (one side-by-side pair defeats it), content
 * sizing is a no-op on image/qr/icon leaves (a photo defeats it), and `pad` runs out at
 * MAX_SPACE_PX (400) while a half-empty page needs ~1,200. See the `spacer` role in
 * layoutSpec.ts.
 */
const MIN_RUN = MIN_GAP;

/**
 * How much clear space at one end means the emptiness is DESIGN rather than a margin.
 *
 * 10% clear top and bottom is a margin: the bands really do fill the rectangle and fr
 * weights are exactly right, because they preserve the proportions. 3% top and 55% bottom
 * is a cover, and the empty part has to be expressed. Measured per end, never summed —
 * summing 10%+10% to 20% is what made the first version of this rule fire on an ordinary
 * page.
 */
const EMPTY_END = 0.25;

/**
 * Anchor a set of bands inside the rectangle they occupy only part of.
 *
 * TWO MECHANISMS, chosen by what the children are, because measurement said so:
 *
 *  • Every child a TEXT LEAF, and the offset small enough for a `pad` → content-size them
 *    and `justify`. The solver measures each line's own copy, which lands close to the
 *    reference's band heights, and `pad` reproduces the offset exactly.
 *  • Anything else → `fr` weights plus `spacer` siblings. Content sizing is a no-op on
 *    image/qr/icon leaves and is ignored entirely for containers, so for those children the
 *    first mechanism silently degrades into the stretched page this whole exercise is about.
 *
 * Spacers are NOT used for the all-text case even though they are more general, and this is
 * the one counter-intuitive thing here: a container carries ONE `gap` and the solver puts it
 * between every pair of children, INCLUDING between a spacer and the cluster. On the cover
 * fixture that inserted an extra 60px above the masthead and dragged every band down —
 * 0.60 → 0.30, measurably worse. `pad` has no such problem because it is not a child.
 *
 * THE OFFSET IS RAW PIXELS, NOT A SPACE TOKEN, and that is the whole difference between
 * this working and not. `spaceTokenFor` can only return a token, and the scale stops at
 * `xl` = 96px — so a cover whose title block sits 263px off the foot was pinned at 96px
 * and every band missed its reference box completely: measured 0.0%, verdict "loose", all
 * three text IoU 0.00, on BOTH sheet sizes. `pad` has accepted a plain number since the
 * DSL unlock (`Space = SpaceToken | number`), which is what makes the honest value
 * expressible; the same fixture then scores 51%. Tokens are still right for `gap`, which
 * is a rhythm rather than a measurement.
 *
 * Past MAX_SPACE_PX a pad cannot say it either, and clamping would re-create the same bug
 * one order of magnitude up — so that case falls through to spacers, which have no ceiling.
 * The choice here is therefore offset SIZE as well as child kind.
 */
function anchored(
  kind: 'col' | 'row',
  gap: SpaceToken,
  kids: LayoutChild[],
  runs: { lead: number; trail: number; axisLen: number; axisPx: number },
): ContainerNode {
  const { lead, trail, axisLen, axisPx } = runs;
  const children = kids.map((k) => ({ ...k }));
  if (Math.max(lead, trail) / axisLen <= EMPTY_END) return { kind, gap, children };

  if (children.every((c) => c.node.kind === 'leaf' && TEXT_ROLES.has(c.node.role))) {
    const justify: FlexAlign = lead <= trail * 0.5 ? 'start' : trail <= lead * 0.5 ? 'end' : 'center';
    const margin = justify === 'end' ? trail : justify === 'start' ? lead : Math.min(lead, trail);
    const padPx = Math.round(Math.max(0, margin) * axisPx);
    if (padPx <= MAX_SPACE_PX) {
      for (const c of children) c.sizing = 'content';
      return { kind, gap, children, justify, pad: padPx };
    }
    // Too far off the edge for a pad to say — spacers below.
  }

  const withSpacers: LayoutChild[] = [];
  if (lead / axisLen > MIN_RUN) withSpacers.push(spacerChild(lead));
  withSpacers.push(...children);
  if (trail / axisLen > MIN_RUN) withSpacers.push(spacerChild(trail));
  return { kind, gap, children: withSpacers };
}

/**
 * How much of its rectangle a BACKING region must cover to be a stack layer.
 *
 * Every layer of a stack is handed the whole rectangle by the solver, so a photo that only
 * covered a third of the reference came out full-bleed — drawn over the hero and hiding it.
 * A backing region below this threshold is not backing at all; it is an inset picture, and
 * it goes through the partition with everything else so it keeps its size.
 */
const FILLS_RECT = 0.8;

/**
 * Text alignment implied by WHERE a region sat across the page.
 *
 * The cross axis cannot be expressed structurally — a band always spans its
 * container's full width (the solver hands every child the whole cross length) — so
 * for short text the alignment inside a full-width box is what reproduces "this line
 * sat on the right". Deliberately NOT applied to prose: a right-hand body column
 * should still be left-aligned, because that is a typographic decision rather than a
 * positional one, and right-aligned paragraphs look broken.
 */
const POSITIONAL_ALIGN_ROLES = new Set(['headline', 'kicker', 'subhead', 'byline', 'figure', 'label', 'caption', 'pullquote']);

function alignFor(region: ReadRegion): TextAlignToken | undefined {
  if (!POSITIONAL_ALIGN_ROLES.has(region.role)) return undefined;
  const mid = region.box.x + region.box.w / 2;
  if (mid < 0.42) return 'left';
  if (mid > 0.58) return 'right';
  return 'center';
}

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
function gapFor(runs: number[], axisPx: number): SpaceToken {
  const gaps = runs.filter((g) => g > MIN_GAP).sort((a, b) => a - b);
  if (gaps.length === 0) return 'none';
  return spaceTokenFor(gaps[Math.floor(gaps.length / 2)]!, axisPx);
}

/**
 * Do this container's interior runs have to become TRACKS, or are they rhythm?
 *
 * The question is asked ONCE PER CONTAINER, about the bands as a set — not per run —
 * and that is the whole trick. Two runs of identical size mean opposite things: 6%
 * between the headline and the columns of a feature is rhythm, and 11% above a cover
 * line is composition. Nothing about either run distinguishes them. What does is how
 * much of the rectangle the bands were ever going to fill.
 *
 * Below this, the bands are a CLUSTER floating in space and every run between them is
 * load-bearing: on a real cover the bands held 31% of the page height, so normalising
 * their fr weights over the whole sheet inflated each one ~3.2× and the page came back
 * stretched top to bottom (fidelity 10%, on a reading that was accurate). At or above
 * it the bands genuinely do fill the rectangle, fr weights already preserve the
 * proportions, and promoting gaps to weighted tracks would turn every ordinary layout
 * into a sandwich of empty children.
 *
 * Two size tests were tried first and both are wrong. Against what `gap` can express
 * (`xl` = 96px) it fires on the feature's 6%; against EMPTY_END it leaves the cover's
 * 11% run to a 96px token that is then repeated between every other pair. The
 * measurement is not of a run at all — it is of the set.
 */
const FILLS_AXIS = 0.7;

/** fr weight from an extent along the axis. Fractions are relative, so scaling by 100
 *  keeps a whole point of resolution per percent and stays inside MAX_WEIGHT. */
const weightOf = (extent: number) => Math.max(1, Math.min(100, Math.round(extent * 100)));
const weightFor = (band: Band) => weightOf(band.end - band.start);

/** Deliberate emptiness as a weighted track: it takes its share and draws nothing. */
function spacerChild(run: number): LayoutChild {
  return { weight: weightOf(run), sizing: 'fr', node: { kind: 'leaf', role: 'spacer' } };
}

/**
 * BAND HEIGHT — the reference's own extent for a track, in px (Fix after 1c).
 *
 * A content-sized text band takes exactly the height its copy measures (~40px at
 * the role default), while the reference's designer gave the band ~105px — air,
 * or larger type. That one gap was measured to be the mechanism behind EVERY
 * remaining "loose" fidelity verdict (contents 18%, teasers 18%, stat band 32%,
 * lower-third cover 37%): the heights were read correctly, carried into `origin`,
 * and then thrown away wherever sizing flipped to 'content'. This carries them
 * as the track's floor instead — the solver takes max(measured, minPx), so a
 * band keeps its designed height, and fitFontSize can settle type NEARER its
 * ceiling inside the taller box. Inert on 'fr' children (fr fills regardless),
 * so attaching it to a band that `anchored` later flips to content is exactly
 * the point: the height survives the flip.
 */
const bandMinPx = (extent: number, axisPx: number): number => Math.max(0, Math.round(extent * axisPx));

/**
 * Merge adjacent bands until there are at most `limit` of them.
 *
 * Merging the NARROWEST neighbouring pair each time keeps the big structural
 * divisions of the page intact and folds the fine detail together — the opposite
 * choice (truncating to the first eight) would throw away the bottom third of a
 * dense reference.
 *
 * `limit` is passed rather than assumed, because spacers occupy child slots too: capping
 * to MAX_CHILDREN first and then adding two spacers would push the container over the cap,
 * and normalizeLayoutSpec would silently slice the trailing spacer off — putting the
 * stretched page straight back.
 */
function capBands(bands: Band[], limit: number = MAX_CHILDREN): Band[] {
  const out = [...bands];
  while (out.length > limit) {
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

/**
 * ONE region in a rectangle it does not fill.
 *
 * A leaf handed a rectangle takes all of it, which is right for a band (its rect IS its
 * extent) and wrong for the commonest magazine idiom there is: a single line of type over
 * a full-bleed photograph. A stack layer gets the whole page, so the title of a cover
 * became a page-height text box and nothing recorded that it sat across the bottom third.
 * Wrapping it between spacers keeps its place.
 */
function placeOne(region: ReadRegion, rect: ReadBox, depth: number, ref: Alloc): LayoutNode {
  const leaf = leafFor(region, ref);
  if (!canContain(depth)) return leaf; // no room for a wrapper; a bare leaf is still valid
  const axisLen = Math.max(0.0001, rect.h);
  const lead = Math.max(0, region.box.y - rect.y);
  const trail = Math.max(0, rect.y + rect.h - (region.box.y + region.box.h));
  const wantLead = lead / axisLen > MIN_RUN;
  const wantTrail = trail / axisLen > MIN_RUN;
  if (!wantLead && !wantTrail) return leaf; // it effectively does fill the rect
  const children: LayoutChild[] = [];
  if (wantLead) children.push(spacerChild(lead));
  children.push({ weight: weightOf(region.box.h), sizing: 'fr', node: leaf });
  if (wantTrail) children.push(spacerChild(trail));
  return { kind: 'col', gap: 'none', children };
}

function leafFor(region: ReadRegion, ref: Alloc): LeafNode {
  const contentRef = ref(region);
  const leaf: LeafNode = { kind: 'leaf', role: region.role, contentRef };
  if (region.colorRef) leaf.colorRef = region.colorRef;
  // What the reading said, else what its position implies.
  const align = region.align && region.align !== 'justify' ? region.align : alignFor(region);
  if (align) leaf.align = align;
  // Emphasis is the reference's own hierarchy, mapped onto the weights the
  // art-director prompt uses (800–900 dominant, 400 quiet).
  if (region.emphasis === 'dominant') leaf.weightHint = 800;
  else if (region.emphasis === 'quiet') leaf.weightHint = 400;
  // display for the loud roles, body for prose — the same pairing rule the
  // art-director is told to follow.
  if (['headline', 'pullquote', 'figure', 'kicker'].includes(region.role)) leaf.fontRef = 'display';
  else if (['body', 'caption', 'byline', 'entry', 'label', 'subhead'].includes(region.role)) leaf.fontRef = 'body';
  if (region.role === 'image') leaf.fit = 'cover';

  // ── The reference's own TYPE, where it was legible ──
  //
  // Each of these only fires when the reading actually carries the field, so a
  // reference whose type could not be read still lands exactly where it did before
  // these existed: role defaults, and the page's own palette and faces. A caller that
  // does not want the reference's type at all strips it from the reading before
  // conversion (see stripType) rather than passing a flag down seven call sites.
  //
  // A MEASURED size beats the role's ceiling, and both are only ceilings: typeSizeFor
  // hands whichever wins to fitFontSize, which shrinks to the box and never goes below
  // the readability floor. So a misread size cannot produce type nobody can read, and
  // cannot overflow — it produces type that is merely wrong, and visibly so.
  //
  // sizeFrac is a fraction of the reference's height and is resolved against the
  // CANONICAL page, the same space this module already measures margins in. Points are
  // a physical size: a 30pt headline should print at 30pt whatever sheet it lands on,
  // and the box-fit shrink handles a page too small to hold it.
  if (region.sizeFrac !== undefined) leaf.fontPt = pxToPt(region.sizeFrac * PAGE_H);
  if (region.color) leaf.color = region.color;
  // A weight the model actually SAW outranks one inferred from relative emphasis.
  if (region.weight !== undefined) leaf.weightHint = region.weight;
  // `face` is deliberately NOT applied. fontRef chooses between the PAGE's two faces,
  // and knowing the reference's headline was a serif does not say which of ours is
  // one — that needs a font-metrics answer, not a layout one. It is read and shown to
  // the user; adopting it belongs with picking a pairing.
  return leaf;
}

/**
 * The same reading with every typographic reading removed.
 *
 * This is how "do not adopt the reference's type" is expressed: at the INPUT, once,
 * rather than as a flag threaded through leafFor's seven call sites and forgotten at
 * one of them. A stripped reading converts down exactly the path that existed before
 * type was read at all, so "off" is not a second code path that can drift — it is the
 * original one.
 */
export function stripType(reading: LayoutReading): LayoutReading {
  return {
    ...reading,
    regions: reading.regions.map(({ sizeFrac: _s, color: _c, weight: _w, face: _f, ...rest }) => rest),
  };
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
function stackFor(regions: ReadRegion[], rect: ReadBox, depth: number, ref: Alloc): LayoutNode | null {
  // Backing means "behind everything", and the solver enforces that by handing every layer
  // the whole rectangle. A picture that covered a third of the reference is therefore NOT
  // backing: made a layer, it came out full-bleed on top of the hero and hid it. Below
  // FILLS_RECT it is an inset picture and goes through the partition like any other region.
  // …but ONLY for photographs. A `shape` is decorative backing by definition — a scrim or a
  // panel — and a half-height wash under a cover's title is exactly the right thing to put
  // behind text, whatever its measured size. pruneSpec and composeFromSolved both draw the
  // same distinction, and reclassifying a scrim here broke it.
  const rectArea = Math.max(1e-6, rect.w * rect.h);
  const isBacking = (r: ReadRegion) =>
    BACKING_ROLES.has(r.role) && (r.role !== 'image' || (r.box.w * r.box.h) / rectArea >= FILLS_RECT);
  const backing = regions.filter(isBacking);
  const content = regions.filter((r) => !isBacking(r));
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
    return flatten(content, rect, depth, ref);
  }
  // A stack's layers sit at the same normalizer depth a container's children would,
  // so the same budget applies — and MAX_STACK_LAYERS caps how many can go under the
  // one content layer.
  if (!canContain(depth)) return leafFor(biggest(regions), ref);
  const layers: LayoutNode[] = backing.slice(0, MAX_STACK_LAYERS - 1).map((r) => leafFor(r, ref));
  // depth+1: the content layer sits one level inside the stack. It gets the SAME rect — a
  // stack's layers all occupy the whole rectangle — and `partition` is what turns that into
  // a position, whether the content is one line or a cluster. It used to short-circuit to a
  // bare leaf when there was exactly one content region, which is precisely the cover idiom
  // (one title over a photograph) and precisely where the position was being thrown away;
  // partition now routes a single region through placeOne instead, and handles the depth
  // cap itself.
  const contentLayer = partition(content, rect, depth + 1, ref);
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
function flatten(regions: ReadRegion[], rect: ReadBox, depth: number, ref: Alloc): LayoutNode | null {
  if (regions.length === 0) return null;
  if (regions.length === 1) return placeOne(regions[0]!, rect, depth, ref);
  if (!canContain(depth)) return leafFor(biggest(regions), ref);
  // Two slots held back for the spacers — see capBands on why this cannot be done after.
  const kept = [...regions].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).slice(0, MAX_CHILDREN - 2);
  // These regions OVERLAP, so their heights say nothing about how the space should divide:
  // each line takes the height its own copy needs. Where the CLUSTER sits is a different
  // question, and `anchored` answers it — with a `pad` while the offset fits inside
  // MAX_SPACE_PX, and with spacers beyond that.
  const top = Math.min(...kept.map((r) => r.box.y));
  const bottom = Math.max(...kept.map((r) => r.box.y + r.box.h));
  return anchored(
    'col',
    'sm',
    kept.map((r): LayoutChild => ({ sizing: 'content', minPx: bandMinPx(r.box.h, PAGE_H), node: leafFor(r, ref) })),
    {
      lead: Math.max(0, top - rect.y),
      trail: Math.max(0, rect.y + rect.h - bottom),
      axisLen: Math.max(0.0001, rect.h),
      axisPx: PAGE_H,
    },
  );
}

/** The slice of `rect` a band occupies, for recursing into it. A band spans the full
 *  cross axis, because that is what the solver gives every child. */
function bandRect(rect: ReadBox, band: Band, axis: 'y' | 'x'): ReadBox {
  return axis === 'y'
    ? { x: rect.x, y: band.start, w: rect.w, h: Math.max(0, band.end - band.start) }
    : { x: band.start, y: rect.y, w: Math.max(0, band.end - band.start), h: rect.h };
}

/**
 * One level of the partition. `rect` is the space this node has to fill, in reference
 * coordinates — without it a container cannot tell "these bands ARE the page" from
 * "these bands are a cluster in the corner of it", which is the difference between
 * reproducing a layout and stretching it over the sheet.
 *
 * Returns null only when there is nothing to place.
 */
function partition(regions: ReadRegion[], rect: ReadBox, depth: number, ref: Alloc): LayoutNode | null {
  if (regions.length === 0) return null;
  if (regions.length === 1) return placeOne(regions[0]!, rect, depth, ref);
  // Out of depth budget: no container of any kind may be created here.
  if (!canContain(depth)) return leafFor(biggest(regions), ref);

  const rows = bandsAlong(regions, 'y'); // horizontal cuts → a col of bands
  const cols = bandsAlong(regions, 'x'); // vertical cuts → a row of bands

  // Prefer the axis that finds MORE structure; on a tie, cut horizontally, because
  // that is how a page is read and how magazine layouts are built (bands first,
  // columns inside them).
  const useCol = rows.length >= cols.length;
  const raw = useCol ? rows : cols;

  if (raw.length < 2) {
    // No cut in either axis: these regions overlap. That is what a stack is for.
    return stackFor(regions, rect, depth, ref);
  }

  const axis = useCol ? 'y' : 'x';
  const axisStart = useCol ? rect.y : rect.x;
  const axisLen = Math.max(0.0001, useCol ? rect.h : rect.w);
  // Merging bands never moves the outer edges, so the clear runs can be measured before
  // capping — which they must be, because each spacer costs a child slot.
  const lead = Math.max(0, raw[0]!.start - axisStart);
  const trail = Math.max(0, axisStart + axisLen - raw[raw.length - 1]!.end);
  // Two slots held back whenever there is emptiness to express, because the spacer branch
  // of `anchored` may need them and capping afterwards would let normalizeLayoutSpec slice
  // a spacer off — putting the stretched page straight back.
  const axisPx = useCol ? PAGE_H : PAGE_W;
  // Slots are reserved for INTERIOR runs as well as the outer two, for the same
  // reason and with the same consequence if we don't: normalizeLayoutSpec silently
  // slices children past MAX_CHILDREN, and the one it slices is the last spacer.
  //
  // Measured across the BANDS' OWN SPAN — first band's start to last band's end — and
  // never across the whole rectangle. The emptiness at the two ENDS belongs to
  // `anchored`, which has a better mechanism for it (a `pad` over a content-sized
  // cluster, measured to beat spacers there). Counting that emptiness here as well
  // made every floating cluster look airy, so interior spacers were injected into
  // exactly the clusters `anchored` handles best and defeated its all-text branch.
  // This rule is about INTERIOR air only.
  //
  // Asked of `raw` rather than the capped bands, and before capping, because merging
  // two bands ABSORBS the run between them: deciding afterwards would see a tidier,
  // fuller-looking set than the reference actually had.
  const span = Math.max(1e-6, raw[raw.length - 1]!.end - raw[0]!.start);
  const covered = raw.reduce((sum, b) => sum + (b.end - b.start), 0) / span;
  // AND it defers to `anchored` where `anchored` has the better mechanism.
  //
  // A tight all-text cluster held off one end is padded and content-sized as a UNIT,
  // and the note on `anchored` records that measurement: spacers took that fixture
  // from 0.60 to 0.30, because the container's one `gap` is inserted next to a spacer
  // as well and drags every band down. Interior spacers put the children out of reach
  // of that branch — every child has to be a text leaf for it to fire — so a rule that
  // adds them here would silently switch those clusters to the worse mechanism. Both
  // conditions are read the way `anchored` reads them, off the uncapped bands, so the
  // reserve below matches what actually gets built.
  const bandIsTextLeaf = (b: Band) => b.regions.length === 1 && TEXT_ROLES.has(b.regions[0]!.role);
  const anchoredCluster = Math.max(lead, trail) / axisLen > EMPTY_END && raw.every(bandIsTextLeaf);
  const runsAreTracks = covered < FILLS_AXIS && !anchoredCluster;
  const trackRuns = (bs: Band[]) => {
    if (!runsAreTracks) return 0;
    let n = 0;
    for (let i = 1; i < bs.length; i++) if ((bs[i]!.start - bs[i - 1]!.end) / axisLen > MIN_RUN) n++;
    return n;
  };
  const reserve = (Math.max(lead, trail) / axisLen > EMPTY_END ? 2 : 0) + trackRuns(raw);
  const bands = capBands(raw, Math.max(2, MAX_CHILDREN - reserve));

  const kids: { child: LayoutChild; band: Band }[] = [];
  for (const band of bands) {
    const node = partition(band.regions, bandRect(rect, band, axis), depth + 1, ref);
    // minPx carries the band's own reference extent. Inert while the child is
    // 'fr' (the normal case — proportions rule); load-bearing the moment
    // `anchored` flips an all-text cluster to content sizing, which is where
    // band heights used to be thrown away.
    if (node) kids.push({ child: { weight: weightFor(band), sizing: 'fr', minPx: bandMinPx(band.end - band.start, useCol ? PAGE_H : PAGE_W), node }, band });
  }
  if (kids.length === 0) return null;
  // One surviving band and nothing to anchor it against: the container adds nothing.
  if (kids.length === 1 && reserve === 0) return kids[0]!.child.node;

  /**
   * THE AIR BETWEEN THE BANDS IS PART OF THE DESIGN, and it has to be a TRACK.
   *
   * `anchored` already learnt this for the runs at the two ENDS of a rectangle —
   * there is a long note there on why a spacer beats justify/content-sizing/pad.
   * The same lesson was never applied BETWEEN bands, and interior emptiness is
   * where a magazine cover keeps most of it.
   *
   * What happened instead: the interior runs were collapsed into the container's
   * single median `gap` token, which tops out at `xl` = 96px. On a real cover the
   * bands occupied 31% of the page height and the gaps 69% — an 11% run above the
   * cover line and a 53% void below it. The five bands' fr weights (3:11:1:14:2)
   * were then normalised over the WHOLE sheet, so every band inflated about 3.2×,
   * the 53% void became 96px, and the page came back stretched top to bottom.
   * Measured fidelity 10%, verdict "loose", on a reading that was itself accurate.
   *
   * Whether this happens at all is FILLS_AXIS's decision, taken once for the whole
   * container (see `runsAreTracks`); a container whose bands do fill their rectangle
   * keeps today's behaviour exactly, gap token and all. Where runs DO become tracks
   * they are excluded from the gap median as well — leaving them in would drag the
   * token up to `xl` and re-insert the void between every other pair on the page,
   * which is the same stretch by a different route.
   */
  const spaced: LayoutChild[] = [];
  const rhythm: number[] = [];
  for (let i = 0; i < kids.length; i++) {
    if (i > 0) {
      const run = kids[i]!.band.start - kids[i - 1]!.band.end;
      if (runsAreTracks && run / axisLen > MIN_RUN) spaced.push(spacerChild(run));
      else rhythm.push(run);
    }
    spaced.push(kids[i]!.child);
  }

  return anchored(useCol ? 'col' : 'row', gapFor(rhythm, axisPx), spaced, {
    lead, trail, axisLen, axisPx,
  });
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
  // The root fills the page's CONTENT AREA, not the sheet.
  //
  // The solver insets the whole tree by `page.margin`, and the reading's boxes are absolute
  // — they already include the reference's margin. Measuring the clear runs against the
  // sheet therefore counts that margin twice: on a cover reading `md` with its cluster
  // starting 3% down, a 3% lead spacer landed on top of a 2.2% page inset and pushed
  // everything below where the reference had it. Measured against the content area the lead
  // comes out at ~0.8% instead, which is the noise floor, and the margin is expressed once.
  const mx = (SPACE_PX[reading.margin] ?? 0) / PAGE_W;
  const my = (SPACE_PX[reading.margin] ?? 0) / PAGE_H;
  const rect: ReadBox = { x: mx, y: my, w: Math.max(0.01, 1 - 2 * mx), h: Math.max(0.01, 1 - 2 * my) };
  const root = partition(reading.regions, rect, 0, makeAlloc(origin));
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

// ── EXACT REPRODUCTION ───────────────────────────────────────────────────────

/**
 * Solve a reading straight to boxes, with NO frame tree in between.
 *
 * The guillotine above exists to ADAPT a layout: reflow it onto a different sheet with
 * a different amount of copy, and guarantee a tiling while doing it. Reproducing a
 * reference is a different job, and the tree is the wrong instrument for it — not
 * badly tuned, but structurally unable:
 *
 *   • a band spans its container's whole cross axis, so a cover line sitting in the
 *     reference's right half comes out full width with only `align` remembering where
 *     it was — the single biggest remaining loss in adapt mode;
 *   • MAX_TREE_DEPTH flattens a nested template (a boxed sub-line inside a headline
 *     block, an inset photo over a full-bleed one);
 *   • an unfillable slot is pruned and the page RE-PARTITIONS, so one missing
 *     photograph moves everything else — "2 boxes had nothing to put in them, so the
 *     rest grew to fill the page".
 *
 * None of that is needed here, because THE READING ALREADY IS THE LAYOUT. Its boxes are
 * fractions of the reference, and `normalizeLayoutReading` has already clipped them to
 * the page, dropped the slivers and capped the count — the same guarantees the solver
 * gives, established at the trust boundary instead. Multiplying by the page size is the
 * whole transform, so every box lands exactly where it was read.
 *
 * NO MARGIN INSET, deliberately. `readingToSpec` insets the root because a relative
 * tree knows nothing of the reference's own margin; these boxes are absolute and
 * already contain it, so insetting here would count it twice and shrink the page.
 *
 * WHAT THIS GIVES UP is real and is the point of keeping both: copy longer than the
 * reference's own no longer reflows — it shrinks to fit and is reported in `tight` —
 * and a reference whose proportions differ from the page is stretched rather than
 * re-composed (`aspectMismatch` is what warns about that). Exact mode only became
 * viable once slot budgets came from the reference's real character counts rather than
 * from box area; before that, every slot was handed article-length prose.
 */
export function readingToExact(
  reading: LayoutReading,
  dims: { width: number; height: number },
): { leaves: SolvedLeaf[]; origin: Origin } | null {
  const origin: Origin = {};
  const alloc = makeAlloc(origin);
  const W = dims.width > 0 ? dims.width : PAGE_W;
  const H = dims.height > 0 ? dims.height : PAGE_H;

  // Stacking order: an explicit `z` from the reading wins, and reading order breaks
  // ties. Both matter to composeFromSolved, which repairs a text leaf's contrast
  // against the topmost LOWER-z leaf beneath it — get this wrong and white cover type
  // is "repaired" against the page ground instead of the photograph under it.
  const ordered = reading.regions
    .map((region, at) => ({ region, at }))
    .sort((a, b) => (a.region.z ?? 0) - (b.region.z ?? 0) || a.at - b.at);

  const placed = ordered
    .map(({ region }) => ({
      region,
      box: {
        x: Math.round(region.box.x * W),
        y: Math.round(region.box.y * H),
        w: Math.round(region.box.w * W),
        h: Math.round(region.box.h * H),
      },
    }))
    // The same floor the solver applies to its own output: below this a box cannot
    // hold anything and would only ever be an artefact on the page.
    .filter((p) => p.box.w >= MIN_LEAF_PX && p.box.h >= MIN_LEAF_PX);

  /**
   * TEXT MAY NEVER PRINT OVER TEXT — the one thing faithfulness does not extend to.
   *
   * Text over a PHOTOGRAPH is the commonest idiom in magazine design and is reproduced
   * exactly; that is what the z-order is for. Text over TEXT is never a design, it is a
   * misread: a vision model gives a masthead a generous box, and on a real cover the
   * headline's came back 105–298px while the standfirst underneath it read 263–298, so
   * the two genuinely overlapped in the reading. The guillotine hid that by merging
   * them into one band. Reproducing boxes exactly stops hiding it, and layout QA — quite
   * rightly — refuses a page with words printed on words.
   *
   * So an upper text box is trimmed to where the next overlapping one begins. Bounded
   * and local: nothing moves, only the box that was too tall gets shorter, which is the
   * measurement that was wrong. layoutSpec.ts has a repair pass for the same shape on
   * the tree side ("NEVER two text layers on one rectangle") — same rule, same reason.
   */
  const texts = placed
    .filter((p) => TEXT_ROLES.has(p.region.role))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i]!;
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j]!;
      const sharesColumn = a.box.x < b.box.x + b.box.w && b.box.x < a.box.x + a.box.w;
      if (!sharesColumn) continue;
      if (a.box.y + a.box.h > b.box.y) a.box.h = b.box.y - a.box.y;
    }
  }

  const leaves: SolvedLeaf[] = [];
  for (const { region, box } of placed) {
    // Re-checked, because a trim can take a box below the floor: a line the reading
    // buried entirely under the next one leaves nothing to draw.
    if (box.w < MIN_LEAF_PX || box.h < MIN_LEAF_PX) continue;
    leaves.push({ node: leafFor(region, alloc), box, z: leaves.length });
  }
  if (leaves.length === 0) return null;

  // Slots that never became a leaf are dropped from `origin` for the same reason as
  // above: a fidelity score counting boxes we never claimed to build is not a measure.
  const kept = new Set(leaves.map((l) => l.node.contentRef ?? ''));
  for (const key of Object.keys(origin)) if (!kept.has(key)) delete origin[key];
  return { leaves, origin };
}

