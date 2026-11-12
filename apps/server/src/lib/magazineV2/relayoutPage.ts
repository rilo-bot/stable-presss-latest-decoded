// ---------------------------------------------------------------------------
// Magazine Builder v2 — RE-BALANCE AN EXISTING PAGE (the geometric half of Adjust).
//
// A page document stores only its absolute elements; the frame tree the art-director
// wrote is gone the moment the page is composed. So every page generated before the
// balancer existed (balanceLayout.ts) keeps its stretched title boxes, its dead bands and
// its sliver photos forever — no amount of text tightening can move a box.
//
// This module recovers a frame tree FROM THE ELEMENTS, runs the same balancer the
// generator now runs, and maps the solved boxes back onto the same element ids:
//
//   1. RECONSTRUCT — guillotine-cut the content into the rows / cols / stacks it was
//      solved from. A generated page came out of a frame tree, so it cuts cleanly:
//      clusters that do not overlap along y are a col, along x a row; a photo or panel
//      with the rest of the group on top of it is a stack. Margins, gutters and the
//      inset of type over a photo are pinned with FIXED spacer tracks (content-sized,
//      minPx), so the reconstructed tree solves back onto (almost) the original boxes.
//      Gaps come in levels (bars 20px apart in a column whose sections are 60px apart),
//      so runs joined by the tightest gap become containers of their own; type that
//      stood at the top or the foot of a taller cell hugs there again; three or more
//      groups spread evenly down a column are spread again (`justify:'between'`); and
//      type tracks that held their copy hug it (the art-director's `content` sizing,
//      which the elements do not record).
//   2. BALANCE — exactly the generator's pass: text tracks hug their copy at its design
//      size, the space goes to photographs or is anchored by intent, and a photo that
//      cannot be a photograph is re-flowed or dropped.
//   3. MAP BACK — element id → new box (a QR / glyph keeps its centred square). Nothing
//      about an element's style changes, except a scrim that blankets most of the sheet,
//      which is lightened to the ceiling the composer now applies, and a drop cap's
//      pieces, whose copy and pinned size are re-split for their new measure.
//
// THE LAYOUT DEVICES (2026-11-12) are read back from the elements, because that is all a
// page stores — the spec is gone, and the elements are also the only record of what the
// user has since changed (their copy, a box they nudged). A stored spec would go stale at
// the user's first nudge and would need every element mapped back to its leaf; the
// elements never go stale, and they cover every page ever generated. Each device keeps
// its intent:
//
//   • DROP CAP — its three pieces (dropCap.ts ids) are merged back into ONE paragraph
//     for the whole pass: measured as a drop-cap paragraph, balanced as one track, and
//     re-split after the solve with the same dropCap.ts calculation the composer uses
//     (both halves re-pinned to one size). A paragraph whose current copy no longer
//     carries a cap (too short, markup, a leading quote mark) is folded back into an
//     ordinary body box; a paragraph that outgrew its box may claim room from the
//     photographs before it is shrunk. A drop cap whose copy no longer matches its
//     split is itself a reason to Adjust.
//   • OVERLAP — two groups that share a band only where the earlier one is a photo or a
//     panel, with the later one drawn on top, are rebuilt as the `overlap` child the
//     solver understands: the panel keeps riding up over the photo by the same amount.
//   • PLACED LAYERS — content inside a photo / panel is a stack layer; when it sits at
//     the FOOT of its photo (a caption or a cover line placed y:end) it is anchored
//     there and grows upward, the way `place` does, instead of being pinned from the top.
//   • BLEED — a box at the trim is rebuilt with no inset on that side, so it stays at
//     the trim; the page's bottom margin is read from its side margins when the content
//     runs off the top.
//   • RULES — a hairline shape is its thickness along its column, never a free shape.
//   • ROTATION — kept; a tilted box that a re-balance brings within reach of the trim is
//     straightened, exactly as the composer would have set it.
//   • AUTO-BACKING — a band scrim or a panel the composer put behind type is the stack
//     back of that type, so it follows the type it backs.
//
// It refuses, rather than guesses, whenever the page does not look like a generated
// one: an element that did not come from the generator (an imported page, a hand-added
// box), an element the cuts cannot place, a broken drop cap, or a result that would
// change the page's topology (a new or a lost overlap, a bleed that leaves the trim) or
// introduce a defect the page did not have. A page that already measures clean
// (layoutValidate.pageQuality) and whose drop caps still match their copy is never
// touched. A refusal leaves the page exactly as it is, and says why (adjustPageLayout).
//
// Pure: elements in, proposed patches out. The CLIENT applies them through the ordinary
// rev-guarded element writes (undoable, one step), the same as every other AI edit.
// ---------------------------------------------------------------------------

import type { MagazineElement } from './model.js';
import { estimateTextHeight, fitFontSize, refitText } from './layout.js';
import { measureRunWidthPx } from './fontMetrics.js';
import { balanceLayout, type BalanceResult } from './balanceLayout.js';
import { FURNITURE_IDS } from './pageFurniture.js';
import { validatePageLayout, pageQuality, type PageQuality } from './layoutValidate.js';
import { capScrimOpacity, coverage, type Box } from './layoutQuality.js';
import { MAX_RULE_PX, MIN_PROSE_PT, type ContainerNode, type LayoutChild, type LayoutNode, type LayoutSpec, type LeafRole } from './layoutSpec.js';
import { naturalMain, solveLayout, type MeasureFn, type SolveTrace } from './solveLayout.js';
import type { ResolvedContent } from './composeFromSolved.js';
import { DROP_CAP_ID_PREFIX, fitDropCap, planDropCap, type DropCapInput, type DropCapPlan } from './dropCap.js';
import { WRAP_SAFETY } from './measureLeaf.js';
import { ptToPx } from './roleScale.js';

export interface ElementMove {
  elementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Only when a tilted box must be straightened (it now sits within reach of the trim). */
  rotation?: number;
}

/**
 * A text element whose COPY or TYPE changes, not just its box: a drop-cap piece re-split
 * for its new measure (both halves re-pinned to one size), or a drop-cap paragraph folded
 * back into an ordinary body box. Sizes are explicit, so the write does not refit them.
 */
export interface TextPatch {
  elementId: string;
  content?: string;
  fontSize?: number;
  maxFontSize?: number;
  minFontSize?: number;
  lineHeight?: number;
}

export interface RelayoutResult {
  moves: ElementMove[];
  /** Photos that cannot hold a sane shape anywhere on this page (never squeezed), and the
   *  spare pieces of a drop cap that was re-split shorter or folded into a body box. */
  removes: string[];
  /** Scrims lightened so the photo under them shows (see MAX_COVERING_SCRIM_OPACITY). */
  scrims: { elementId: string; opacity: number }[];
  /** Copy / type changes — drop-cap pieces only (see TextPatch). Apply BEFORE `moves`. */
  texts: TextPatch[];
  /** What changed, in words (for the logs). */
  actions: string[];
  /** What changed that the user should be told, in their words (a drop cap re-set or
   *  folded away). */
  notes: string[];
  /** The photos among `removes` (the rest are spare drop-cap pieces). */
  droppedPhotos: string[];
  /** The page as it would read afterwards (patches applied, text refitted, removals gone). */
  elements: MagazineElement[];
  before: PageQuality;
  after: PageQuality;
}

export interface RelayoutOutcome {
  result: RelayoutResult | null;
  /** Why nothing is proposed, in words for the user — '' when the page simply needs nothing. */
  reason: string;
}

/** The refusals, in the user's words. */
export const RELAYOUT_REFUSALS = {
  foreign: 'Some boxes on this page were placed by hand or came from an imported file, so Adjust left its layout exactly as it is.',
  dropCap: 'The drop cap on this page has been taken apart, so Adjust left its layout as it is.',
  unsafe: "Adjust couldn't re-balance this page's layout without changing its design, so the boxes were left where they are.",
} as const;

const TOL = 4;
/** The largest gap read as a container's rhythm; past it a gap is leftover (or air). */
const RHYTHM_MAX = 96;
/** A tilted box closer than this to the trim would show a wedge of bare page. */
const ROTATION_EDGE = 12;

const TEXT_ROLE_TO_LEAF: Record<string, LeafRole> = {
  headline: 'headline',
  subhead: 'subhead',
  byline: 'byline',
  body: 'body',
  caption: 'caption',
  pullquote: 'pullquote',
  other: 'label',
};

const right = (b: Box) => b.x + b.w;
const bottom = (b: Box) => b.y + b.h;

function bbox(els: Box[]): Box {
  const x = Math.min(...els.map((e) => e.x));
  const y = Math.min(...els.map((e) => e.y));
  return { x, y, w: Math.max(...els.map(right)) - x, h: Math.max(...els.map(bottom)) - y };
}

/** A fixed track — a margin, gutter or inset pinned at its measured length. */
const fixed = (px: number): LayoutChild => ({ weight: 0, sizing: 'content', minPx: Math.round(px), node: { kind: 'leaf', role: 'spacer' } });

/**
 * The composer's z ladder (composeFromSolved Z_STEP): every leaf it builds sits on a rung
 * of this step. Rules arrived with that ladder, so a hairline OFF it was never a rule the
 * composer laid — it is a free-standing decoration, which is not ours to move.
 */
const COMPOSER_Z_STEP = 4;

/** A RULE the composer laid: a shape no thicker than a rule may be, far longer than it is
 *  thick, on a rung of the composer's z ladder. Its orientation, or null. */
function ruleAxis(el: Box & { type?: string; zIndex?: number }): 'h' | 'v' | null {
  if (el.type !== 'shape' || (el.zIndex ?? 0) % COMPOSER_Z_STEP !== 0) return null;
  const thin = Math.min(el.w, el.h);
  if (thin > MAX_RULE_PX || Math.max(el.w, el.h) < 4 * thin) return null;
  return el.h <= el.w ? 'h' : 'v';
}

/** Clusters that do not overlap along an axis, in order. */
function clusters(els: MagazineElement[], axis: 'x' | 'y'): MagazineElement[][] {
  const start = (e: Box) => (axis === 'y' ? e.y : e.x);
  const end = (e: Box) => (axis === 'y' ? bottom(e) : right(e));
  const sorted = [...els].sort((a, b) => start(a) - start(b));
  const out: MagazineElement[][] = [];
  let cur: MagazineElement[] = [];
  let reach = -Infinity;
  let thinnest = Infinity;
  for (const e of sorted) {
    // Rounding slack, but never more than half of the thinner box: a 3px rule and the
    // paragraph that starts on the same line are side by side, not one above the other.
    const tol = Math.min(TOL, Math.floor(Math.min(thinnest, end(e) - start(e)) / 2));
    if (cur.length && start(e) >= reach - tol) {
      out.push(cur);
      cur = [];
      reach = -Infinity;
      thinnest = Infinity;
    }
    cur.push(e);
    reach = Math.max(reach, end(e));
    thinnest = Math.min(thinnest, end(e) - start(e));
  }
  if (cur.length) out.push(cur);
  return out;
}

function leafOf(el: MagazineElement): LayoutNode | null {
  if (el.type === 'text' && el.text) return { kind: 'leaf', role: TEXT_ROLE_TO_LEAF[el.text.role] ?? 'label', contentRef: el.id };
  if (el.type === 'image') return { kind: 'leaf', role: 'image', contentRef: el.id, fit: el.image?.fit === 'contain' ? 'contain' : 'cover' };
  if (el.type === 'qr') return { kind: 'leaf', role: 'qr', contentRef: el.id };
  if (el.type === 'icon') return { kind: 'leaf', role: 'icon', contentRef: el.id, ...(el.icon?.name ? { iconName: el.icon.name } : {}) };
  // A shape alone in flow is only ever a RULE (anything else was refused up front); it is
  // sized by the measurer (its thickness along its column), so it hugs like type does.
  if (el.type === 'shape') return { kind: 'leaf', role: 'shape', contentRef: el.id };
  return null;
}

/**
 * Wrap `node` (laid out in `inner`) so it solves inside `outer` at the same offsets:
 * fixed tracks for the left/right/top insets, and for the bottom only as much as the top
 * — the margin is symmetric; anything past that was leftover, and the balancer decides
 * what to do with leftover. (When `inner` sits flush on `outer`'s top — a bleed, or a
 * scrim snapped to its photo's edge — there is no top margin to mirror, and a bottom
 * inset up to the rhythm ceiling is kept as the margin it is.) `pinBottom` keeps the
 * whole bottom inset instead, for the page's own content rect, whose foot was already
 * decided (it clears the folio band).
 */
function inset(node: LayoutNode, inner: Box, outer: Box, opts: { pinBottom?: boolean; padFoot?: boolean } = {}): LayoutNode {
  const l = inner.x - outer.x;
  const r = right(outer) - right(inner);
  const t = inner.y - outer.y;
  const foot = bottom(outer) - bottom(inner);
  // `padFoot` (type inside its photo or panel): the inset under it is the stack's PAD,
  // which need not mirror the top — a band scrim snapped to its photo's foot sits 24px
  // above its type and 96px below it — so it is kept up to the rhythm ceiling.
  const b = opts.pinBottom ? foot : Math.min(foot, opts.padFoot ? Math.max(t, RHYTHM_MAX) : t > TOL ? t : RHYTHM_MAX);
  let out = node;
  if (l > TOL || r > TOL) {
    out = {
      kind: 'row',
      children: [...(l > TOL ? [fixed(l)] : []), { weight: 1, sizing: 'fr', node: out }, ...(r > TOL ? [fixed(r)] : [])],
    };
  }
  if (t > TOL || b > TOL) {
    out = {
      kind: 'col',
      children: [...(t > TOL ? [fixed(t)] : []), { weight: 1, sizing: 'fr', node: out }, ...(b > TOL ? [fixed(b)] : [])],
    };
  }
  return out;
}

/**
 * The content of a stack (type on a photo or a panel) put back in its stack. Usually that
 * is `inset`; but content that sits at the FOOT of its back with the space above it open
 * is a placed layer anchored at the end (a cover line, a caption in a photo's lower
 * corner): it hugs its copy and grows UPWARD from where it stands, as `place` does.
 */
function anchorIn(node: LayoutNode, inner: Box, outer: Box): LayoutNode {
  const t = inner.y - outer.y;
  const b = bottom(outer) - bottom(inner);
  // Open space above, not a pad: more than the largest pad there is, three times the foot,
  // and a real share of the back (a band scrim's 96px over its masthead is padding).
  const footAnchored = t > RHYTHM_MAX + TOL && t >= 3 * Math.max(b, TOL) && t - b >= 0.15 * outer.h;
  if (!footAnchored) return inset(node, inner, outer, { padFoot: true });
  const across = inset(node, inner, { x: outer.x, y: inner.y, w: outer.w, h: inner.h });
  return {
    kind: 'col',
    children: [
      { weight: Math.max(1, t), sizing: 'fr', node: { kind: 'leaf', role: 'spacer' } },
      { weight: Math.max(1, inner.h), sizing: 'content', node: across },
      ...(b > TOL ? [fixed(b)] : []),
    ],
  };
}

/**
 * TYPE in a cell taller than it (a column beside a taller photo, a caption at the foot of
 * a grid row) was HUGGING its copy, top- or foot-aligned — the art-director's `content`
 * sizing or `justify:'end'`, which the elements do not record but their position does. It
 * is put back that way rather than stretched over the whole cell, so it keeps hugging
 * (and grows from the edge it stands on) whatever the cell becomes. Anything else, and
 * type that fills its cell or floats in the middle of it, is `inset` as before.
 */
function seat(node: LayoutNode, inner: Box, outer: Box, textual: boolean): LayoutNode {
  if (!textual) return inset(node, inner, outer);
  const t = inner.y - outer.y;
  const foot = bottom(outer) - bottom(inner);
  const atTop = t <= TOL && foot > TOL;
  const atFoot = foot <= TOL && t > TOL;
  if (!atTop && !atFoot) return inset(node, inner, outer);
  const across = inset(node, inner, { x: outer.x, y: inner.y, w: outer.w, h: inner.h });
  return { kind: 'col', ...(atFoot ? { justify: 'end' as const } : {}), children: [{ weight: 1, sizing: 'content', node: across }] };
}

/** Type and the rules that decorate it — a group that has a natural height. */
const textual = (els: MagazineElement[]) => els.every((e) => (e.type === 'text' && !!e.text) || ruleAxis(e) !== null);

const intersects = (a: Box, b: Box) =>
  Math.min(right(a), right(b)) - Math.max(a.x, b.x) >= 2 && Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y) >= 2;

/**
 * An OVERLAP: the elements split, in reading order along `axis`, into an earlier group
 * and a later one that starts before the earlier one ends — legal only as the solver's
 * `overlap` device makes it: what the later group rides over is a photo or a panel
 * (never words), the later group is drawn on top wherever they meet, it runs past the
 * earlier one, and the overlap is no more than half of either track.
 */
function overlapSplit(els: MagazineElement[], axis: 'x' | 'y'): { a: MagazineElement[]; b: MagazineElement[]; ov: number } | null {
  const start = (e: Box) => (axis === 'y' ? e.y : e.x);
  const end = (e: Box) => (axis === 'y' ? bottom(e) : right(e));
  const sorted = [...els].sort((p, q) => start(p) - start(q) || p.zIndex - q.zIndex);
  let best: { a: MagazineElement[]; b: MagazineElement[]; ov: number } | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted.slice(0, i);
    const b = sorted.slice(i);
    const aStart = start(a[0]!);
    const aEnd = Math.max(...a.map(end));
    const bStart = start(b[0]!);
    const bEnd = Math.max(...b.map(end));
    if (bStart <= aStart + TOL || bEnd <= aEnd + TOL) continue;
    const ov = aEnd - bStart;
    if (ov <= TOL) continue; // a clean cut — not this function's business
    if (a.some((e) => end(e) > bStart + TOL && e.type !== 'image' && e.type !== 'shape')) continue;
    if (b.some((q) => a.some((p) => intersects(p, q) && q.zIndex <= p.zIndex))) continue;
    if (ov > 0.5 * Math.min(aEnd - aStart, bEnd - bStart) + TOL) continue;
    if (!best || ov < best.ov) best = { a, b, ov };
  }
  return best;
}

/** Gaps within this of the tightest one are the same rhythm (rounding, a rule's 3px). */
const RHYTHM_SLACK = 4;

/**
 * Groups laid end to end along an axis, rebuilt as a row/col. Gaps come in LEVELS — a
 * stack of numbered bars 20px apart inside a column whose sections are 60px apart, a rule
 * 14px above the entry it decorates in a list spaced at 20 — and flattening them into one
 * container would make the tightest gap the rhythm of all of them, turning every larger
 * gap into slack the balancer then squeezes out. So runs joined by the tightest gap are
 * rebuilt as a container of their own first, and the levels above it in turn.
 */
function sequence(groups: MagazineElement[][], isCol: boolean, cell: Box, ctx: BuildCtx): LayoutNode | null {
  const boxes = groups.map(bbox);
  const start = (b: Box) => (isCol ? b.y : b.x);
  const end = (b: Box) => (isCol ? bottom(b) : right(b));
  const gaps = boxes.slice(1).map((b, i) => Math.max(0, start(b) - end(boxes[i]!)));
  const tightest = Math.max(0, Math.min(...gaps));
  if (groups.length > 2) {
    const runs: MagazineElement[][][] = [[groups[0]!]];
    gaps.forEach((g, i) => {
      if (g <= tightest + RHYTHM_SLACK) runs[runs.length - 1]!.push(groups[i + 1]!);
      else runs.push([groups[i + 1]!]);
    });
    if (runs.length >= 2 && runs.some((run) => run.length > 1)) return sequence(runs.map((run) => run.flat()), isCol, cell, ctx);
  }
  // The container's rhythm is its tightest gap — but never more than the rhythm ceiling
  // down a column: a 900px gap between a cover's masthead and its cover lines is the
  // photo showing, not a gutter, and pinning it would leave nothing to give when the
  // masthead grows. What is past the rhythm is shared into the neighbouring weights.
  const gap = Math.min(tightest, isCol ? RHYTHM_MAX : Infinity);
  // The container itself spans only its groups (`inset` pins it inside `cell`), so that is
  // the cross extent its children's cells span — measuring their insets from `cell` would
  // count the container's own inset twice.
  const whole = bbox(groups.flat());
  const children: LayoutChild[] = [];
  for (let i = 0; i < groups.length; i++) {
    const b = boxes[i]!;
    const g = groups[i]!;
    // Each group's cell spans the container's cross axis; its own cross offsets are
    // pinned by `inset` inside build. Along the main axis, extra gap beyond the
    // container's rhythm is shared into the neighbouring weights — slack the balancer
    // will take back out if nothing uses it.
    const childCell: Box = isCol ? { x: whole.x, y: b.y, w: whole.w, h: b.h } : { x: b.x, y: whole.y, w: b.w, h: whole.h };
    const node = build(g, childCell, ctx);
    if (!node) return null;
    // Rules lying along this axis (one, or a row of them side by side) are exactly their
    // thickness — the measurer says so; a weight share would thicken them.
    if (g.every((e) => ruleAxis(e) === (isCol ? 'h' : 'v'))) {
      children.push({ weight: 1, sizing: 'content', node });
      continue;
    }
    const extra = ((gaps[i - 1] ?? gap) - gap) / 2 + ((gaps[i] ?? gap) - gap) / 2;
    children.push({ weight: Math.max(1, (isCol ? b.h : b.w) + extra), sizing: 'fr', node });
  }
  // Photos stacked in one column share its height EQUALLY — when one of them is the
  // defect being repaired. Their stored heights are then the very allocation at fault (a
  // 28px ribbon above a 236px photo), and keeping them as weights would hand the freed
  // space out in the same lopsided ratio. Sane photos keep the proportions they were
  // designed with (a mosaic's 2:1 rows).
  if (isCol) {
    const photo = groups.map((g) => g.some((e) => e.type === 'image'));
    const n = photo.filter(Boolean).length;
    const repairing = groups.some((g) => g.some((e) => ctx.slivers.has(e.id)));
    if (n > 1 && repairing) {
      const mean = children.reduce((s, c, i) => s + (photo[i] ? c.weight! : 0), 0) / n;
      children.forEach((c, i) => { if (photo[i]) c.weight = mean; });
    }
  }
  // Three or more groups spaced EVENLY and wider than any rhythm were spread down their
  // column (`justify:'between'` — a sign-off column beside a letter, a key down a guide):
  // they hug, and whatever height the column is given is shared between them again.
  if (isCol && groups.length >= 3 && tightest > RHYTHM_MAX && !groups.some((g) => g.some((e) => e.type === 'image'))) {
    const spread: ContainerNode = { kind: 'col', gap: SPREAD_BASE_GAP, justify: 'between', children: children.map((c) => ({ ...c, weight: 1, sizing: 'content' })) };
    return seat(spread, whole, cell, false);
  }
  const node: LayoutNode = { kind: isCol ? 'col' : 'row', gap: Math.round(gap), children };
  return seat(node, whole, cell, textual(groups.flat()));
}

/** The least a spread column keeps between its groups when it is short of room. */
const SPREAD_BASE_GAP = 36;

interface BuildCtx {
  /** Ids of the photos the page measures as slivers (the repair the cuts may lean into). */
  slivers: Set<string>;
}

/** Recover the frame tree for `els`, to be solved into `cell`. null = cannot. */
function build(els: MagazineElement[], cell: Box, ctx: BuildCtx): LayoutNode | null {
  if (els.length === 0) return null;
  if (els.length === 1) {
    const leaf = leafOf(els[0]!);
    return leaf ? seat(leaf, els[0]!, cell, textual(els)) : null;
  }
  for (const axis of ['y', 'x'] as const) {
    const groups = clusters(els, axis);
    if (groups.length < 2) continue;
    return sequence(groups, axis === 'y', cell, ctx);
  }
  // No clean cut: everything overlaps something. The overlap a frame tree makes most is a
  // STACK — a photo or panel with the rest of the group on top of it.
  const back = [...els]
    .sort((a, b) => a.zIndex - b.zIndex || b.w * b.h - a.w * a.h)
    .find((e) => (e.type === 'image' || e.type === 'shape') && els.every((o) => o === e || coverage(o, e) >= 0.85));
  if (back) {
    const washes = els.filter((e) => e !== back && e.type === 'shape' && e.zIndex >= back.zIndex && coverage(e, back) >= 0.85 && coverage(back, e) >= 0.85);
    const rest = els.filter((e) => e !== back && !washes.includes(e));
    const layers: LayoutNode[] = [
      back.type === 'image'
        ? (leafOf(back) as LayoutNode)
        : { kind: 'leaf', role: 'shape', contentRef: back.id },
      ...washes.map((w): LayoutNode => ({ kind: 'leaf', role: 'shape', contentRef: w.id })),
    ];
    if (rest.length > 0) {
      const inner = build(rest, bbox(rest), ctx);
      if (!inner) return null;
      layers.push(anchorIn(inner, bbox(rest), back));
    }
    return inset({ kind: 'stack', layers }, back, cell);
  }
  // …and the other is an OVERLAP between two tracks (a panel riding up over a photo).
  for (const axis of ['y', 'x'] as const) {
    const split = overlapSplit(els, axis);
    if (!split) continue;
    const isCol = axis === 'y';
    const whole = bbox(els);
    const parts = [split.a, split.b].map((g) => {
      const b = bbox(g);
      const c: Box = isCol ? { x: whole.x, y: b.y, w: whole.w, h: b.h } : { x: b.x, y: whole.y, w: b.w, h: whole.h };
      return { b, node: build(g, c, ctx) };
    });
    if (parts.some((p) => !p.node)) return null;
    const [pa, pb] = parts as [{ b: Box; node: LayoutNode }, { b: Box; node: LayoutNode }];
    const node: ContainerNode = {
      kind: isCol ? 'col' : 'row',
      gap: 0,
      children: [
        { weight: Math.max(1, isCol ? pa.b.h : pa.b.w), sizing: 'fr', node: pa.node },
        { weight: Math.max(1, isCol ? pb.b.h : pb.b.w), sizing: 'fr', node: pb.node, overlap: Math.round(split.ov) },
      ],
    };
    return inset(node, whole, cell);
  }
  return null;
}

// ── Drop caps ─────────────────────────────────────────────────────────────────

/** The few entities the sanitiser writes for plain copy, decoded — what actually prints. */
function decode(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
}
const norm = (s: string) => decode(s).replace(/\s+/g, ' ').trim();

/** A drop-cap paragraph read back from its pieces. */
interface DropCapPara {
  /** The id the paragraph goes by during the pass (the pieces' shared prefix). */
  key: string;
  cap: MagazineElement;
  lead: MagazineElement;
  rest?: MagazineElement;
  /** The copy as stored (markup and all) — what a fold writes back. */
  raw: string;
  /** The copy as it prints — what the drop-cap calculation measures. */
  text: string;
  /** The paragraph's rectangle. */
  box: Box;
  /** The one size both text pieces are set at; a re-split never sets it larger. */
  pinned: number;
  /** The print floor a re-split (or a fold) may shrink to. */
  floor: number;
  input: Omit<DropCapInput, 'text' | 'fontSize' | 'boxW'>;
}

const pieceRole = (id: string): 'cap' | 'lead' | 'rest' | null => {
  const m = /-(cap|lead|rest)$/.exec(id);
  return m ? (m[1] as 'cap' | 'lead' | 'rest') : null;
};

/**
 * The drop-cap paragraphs on a page, or 'broken' when a cap has lost its opening lines (or
 * the other way round) — a page in that state is not something to re-balance. A single
 * surviving text piece without a cap is a paragraph an earlier pass FOLDED into a body
 * box: it is ordinary text now.
 */
function readDropCaps(content: MagazineElement[]): DropCapPara[] | 'broken' {
  const groups = new Map<string, { cap?: MagazineElement; lead?: MagazineElement; rest?: MagazineElement; n: number }>();
  for (const el of content) {
    if (!el.id.startsWith(DROP_CAP_ID_PREFIX)) continue;
    const role = pieceRole(el.id);
    if (!role || el.type !== 'text' || !el.text) continue;
    const key = el.id.slice(0, -role.length - 1);
    const g = groups.get(key) ?? { n: 0 };
    g[role] = el;
    g.n++;
    groups.set(key, g);
  }
  const out: DropCapPara[] = [];
  for (const [key, g] of groups) {
    if (!g.cap && g.n === 1) continue; // folded earlier: ordinary text
    if (!g.cap || !g.lead) return 'broken';
    const { cap, lead, rest } = g;
    const t = lead.text!;
    const pinned = typeof t.maxFontSize === 'number' ? t.maxFontSize : t.fontSize;
    const input: DropCapPara['input'] = {
      lineHeight: t.lineHeight,
      bodyFamily: t.fontFamily,
      bodyWeight: t.fontWeight,
      capFamily: cap.text!.fontFamily,
      capWeight: cap.text!.fontWeight,
      safety: WRAP_SAFETY,
      ...(t.letterSpacing !== undefined ? { letterSpacing: t.letterSpacing } : {}),
      ...(t.textTransform && t.textTransform !== 'none' ? { textTransform: t.textTransform } : {}),
    };
    const box: Box = rest
      ? { x: Math.min(cap.x, rest.x), y: lead.y, w: right(rest) - Math.min(cap.x, rest.x), h: bottom(rest) - lead.y }
      : { x: cap.x, y: lead.y, w: right(lead) - cap.x, h: Math.max(lead.h, bottom(cap) - lead.y) };
    // Pieces dragged out of order no longer describe one paragraph.
    if (box.w < lead.w || box.h < lead.h || lead.x < cap.x) return 'broken';
    // How the pieces join: the opening lines run on into the rest with a space — unless the
    // first paragraph ENDED beside the cap, when the rest opens a paragraph of its own. The
    // join that reproduces the stored split is the one that was cut; a split the user has
    // since edited reads as running prose.
    const capC = cap.text!.content;
    const leadC = lead.text!.content;
    const restC = rest?.text?.content ?? '';
    let raw = rest ? `${capC}${leadC} ${restC}` : `${capC}${leadC}`;
    if (rest) {
      for (const j of [' ', '\n']) {
        const candidate = `${capC}${leadC}${j}${restC}`;
        const plan = planDropCap({ ...input, text: decode(candidate), fontSize: pinned, boxW: box.w });
        if (plan && norm(plan.first) === norm(leadC)) {
          raw = candidate;
          break;
        }
      }
    }
    out.push({ key, cap, lead, rest, raw, text: decode(raw), box, pinned, floor: Math.min(pinned, ptToPx(MIN_PROSE_PT)), input });
  }
  return out;
}

const planAt = (p: DropCapPara, boxW: number): DropCapPlan | null => planDropCap({ ...p.input, text: p.text, fontSize: p.pinned, boxW });

/** The paragraph's height at its pinned size in a `boxW` column — as a drop cap, or as
 *  the plain body box it would fold into. */
function paraHeight(p: DropCapPara, boxW: number): number {
  const plan = planAt(p, boxW);
  if (plan) return plan.totalH;
  return estimateTextHeight({
    text: p.raw, fontSize: p.pinned, boxWidthPx: boxW, lineHeight: p.input.lineHeight, fontFamily: p.input.bodyFamily, fontWeight: p.input.bodyWeight,
    ...(p.input.letterSpacing !== undefined ? { letterSpacing: p.input.letterSpacing } : {}),
    ...(p.input.textTransform ? { textTransform: p.input.textTransform } : {}),
  });
}

/**
 * Do the pieces still say what the copy says? A drop cap is computed once, at compose
 * time; edit its copy and the split goes stale — the opening lines no longer end where the
 * rest begins, the pinned rest overflows (it can never shrink), or the paragraph has
 * become too short to carry a cap at all.
 */
function dropCapStale(p: DropCapPara): boolean {
  const plan = planAt(p, p.box.w);
  if (!plan) return true;
  if (plan.totalH > p.box.h + 2) return true;
  if (!!plan.rest !== !!p.rest) return true;
  if (norm(plan.cap) !== norm(p.cap.text!.content) || norm(plan.first) !== norm(p.lead.text!.content)) return true;
  if (p.rest && norm(plan.rest) !== norm(p.rest.text!.content)) return true;
  const near = (a: number, b: number) => Math.abs(a - b) <= 3;
  if (!near(p.lead.x, p.box.x + plan.firstBox.x) || !near(p.lead.w, plan.firstBox.w) || !near(p.cap.w, plan.capBox.w) || !near(p.cap.y, p.box.y + plan.capBox.y)) return true;
  if (p.rest && !near(p.rest.y, p.box.y + plan.restY)) return true;
  return false;
}

/** The paragraph as ONE text element, for the whole of the pass. */
function paraElement(p: DropCapPara): MagazineElement {
  return {
    ...p.lead,
    id: p.key,
    rotation: 0,
    ...p.box,
    text: { ...p.lead.text!, content: p.raw, fontSize: p.pinned, maxFontSize: p.pinned, minFontSize: p.floor },
  };
}

interface Patches {
  moves: ElementMove[];
  texts: TextPatch[];
  removes: string[];
  actions: string[];
  notes: string[];
}

function moveIfChanged(out: Patches, el: MagazineElement, b: Box): void {
  if (Math.abs(b.x - el.x) > 0.5 || Math.abs(b.y - el.y) > 0.5 || Math.abs(b.w - el.w) > 0.5 || Math.abs(b.h - el.h) > 0.5) {
    out.moves.push({ elementId: el.id, x: b.x, y: b.y, w: b.w, h: b.h });
  }
}

function textIfChanged(out: Patches, el: MagazineElement, next: Omit<TextPatch, 'elementId'>): void {
  const t = el.text!;
  const patch: TextPatch = { elementId: el.id };
  if (next.content !== undefined && norm(next.content) !== norm(t.content)) patch.content = next.content;
  const differs = (a: number | undefined, b: number | undefined) => a !== undefined && (b === undefined || Math.abs(a - b) > 0.01);
  if (differs(next.fontSize, t.fontSize) || differs(next.maxFontSize, t.maxFontSize) || differs(next.minFontSize, t.minFontSize)) {
    patch.fontSize = next.fontSize;
    patch.maxFontSize = next.maxFontSize;
    patch.minFontSize = next.minFontSize;
  }
  if (differs(next.lineHeight, t.lineHeight)) patch.lineHeight = next.lineHeight;
  // A content change is written with its size, so the write never refits a pinned piece.
  if (patch.content !== undefined && patch.fontSize === undefined) {
    patch.fontSize = next.fontSize;
    patch.maxFontSize = next.maxFontSize;
    patch.minFontSize = next.minFontSize;
  }
  if (Object.keys(patch).length > 1) out.texts.push(patch);
}

/**
 * Re-split a drop-cap paragraph into its solved rectangle with the composer's own
 * calculation (fitDropCap: the largest size up to the pinned one at which the paragraph
 * fits), or fold it back into a plain body box when its copy can no longer carry a cap.
 */
function resplit(p: DropCapPara, B: Box, out: Patches): void {
  const plan = fitDropCap({ ...p.input, text: p.text, fontSize: p.pinned, boxW: B.w, boxH: B.h, maxFontSize: p.pinned, minFontSize: p.floor });
  // A plan that needs a rest piece the page no longer has cannot be built (Adjust only
  // ever moves, edits or removes what is there), so it folds instead.
  if (plan && (!plan.rest || p.rest)) {
    moveIfChanged(out, p.cap, { x: B.x + plan.capBox.x, y: Math.max(0, B.y + plan.capBox.y), w: plan.capBox.w, h: plan.capBox.h });
    textIfChanged(out, p.cap, { content: plan.cap, fontSize: plan.capFontSize, maxFontSize: plan.capFontSize, minFontSize: plan.capFontSize, lineHeight: plan.capLineHeight });
    moveIfChanged(out, p.lead, { x: B.x + plan.firstBox.x, y: B.y, w: plan.firstBox.w, h: plan.firstBox.h });
    textIfChanged(out, p.lead, { content: plan.first, fontSize: plan.fontSize, maxFontSize: plan.fontSize, minFontSize: plan.fontSize });
    if (p.rest) {
      if (plan.rest) {
        moveIfChanged(out, p.rest, { x: B.x, y: B.y + plan.restY, w: B.w, h: Math.max(1, B.h - plan.restY) });
        textIfChanged(out, p.rest, { content: plan.rest, fontSize: plan.fontSize, maxFontSize: plan.fontSize, minFontSize: plan.fontSize });
      } else {
        out.removes.push(p.rest.id);
      }
    }
    if (out.texts.some((t) => t.elementId === p.lead.id || t.elementId === p.rest?.id || t.elementId === p.cap.id)) {
      out.actions.push(`re-set the drop cap for its ${Math.round(B.w)}px measure at ${Math.round(plan.fontSize)}px`);
      out.notes.push('re-set the drop cap for the new copy');
    }
    return;
  }
  // FOLD: the opening-lines piece becomes the whole paragraph, set plainly in the
  // paragraph's box; the cap and the rest go.
  const t = p.lead.text!;
  const fontSize = fitFontSize({
    text: p.raw, boxW: B.w, boxH: B.h, maxFontSize: p.pinned, minFontSize: p.floor, lineHeight: t.lineHeight, fontFamily: t.fontFamily, fontWeight: t.fontWeight,
    ...(t.letterSpacing !== undefined ? { letterSpacing: t.letterSpacing } : {}),
    ...(t.textTransform ? { textTransform: t.textTransform } : {}),
  });
  // The box hugs the copy it now holds (top-aligned, as the paragraph was): a paragraph cut
  // to a sentence does not get to hold open the column it used to fill.
  const need = estimateTextHeight({
    text: p.raw, fontSize, boxWidthPx: B.w * WRAP_SAFETY, lineHeight: t.lineHeight, fontFamily: t.fontFamily, fontWeight: t.fontWeight,
    ...(t.letterSpacing !== undefined ? { letterSpacing: t.letterSpacing } : {}),
    ...(t.textTransform ? { textTransform: t.textTransform } : {}),
  });
  moveIfChanged(out, p.lead, { ...B, h: Math.max(1, Math.min(B.h, Math.ceil(need))) });
  out.texts.push({ elementId: p.lead.id, content: p.raw, fontSize, maxFontSize: p.pinned, minFontSize: p.floor });
  out.removes.push(p.cap.id, ...(p.rest ? [p.rest.id] : []));
  // Why, in words: copy that cannot carry a cap at all (too short, a quote mark first,
  // markup) — or a cap that no longer fits the room the paragraph has.
  const why = planAt(p, B.w) ? 'it no longer fits beside one' : 'its copy is too short to carry one now';
  out.actions.push(`set the opening paragraph without its drop cap — ${why}`);
  out.notes.push(`set the opening paragraph without its drop cap (${why})`);
}

// ── Measuring ─────────────────────────────────────────────────────────────────

/** The measurer for a page's own elements: each text at its DESIGN size and its own type;
 *  a drop-cap paragraph as the composer builds it; a rule as its thickness. */
function elementMeasure(byId: Map<string, MagazineElement>, paras: Map<string, DropCapPara>): MeasureFn {
  return ({ leaf, axis, crossLen }) => {
    const el = byId.get(leaf.contentRef ?? '');
    if (!el) return null;
    if (el.type === 'shape') {
      const o = ruleAxis(el);
      if (o === 'h' && axis === 'col') return el.h;
      if (o === 'v' && axis === 'row') return el.w;
      return null;
    }
    if (el.type !== 'text' || !el.text) return null;
    const t = el.text;
    if (!t.content.replace(/<[^>]+>/g, '').trim()) return null;
    const p = paras.get(el.id);
    if (p && axis === 'col') return paraHeight(p, crossLen);
    const fontSize = typeof t.maxFontSize === 'number' ? t.maxFontSize : t.fontSize;
    // Wrapped at WRAP_SAFETY of the width, as the generator measures (measureLeaf): a box
    // hugged to its copy renders with overflow hidden, so a browser that wraps one word
    // earlier than the metrics must not lose the last line.
    if (axis === 'col') {
      return estimateTextHeight({
        text: t.content, fontSize, boxWidthPx: crossLen * WRAP_SAFETY, lineHeight: t.lineHeight, fontFamily: t.fontFamily, fontWeight: t.fontWeight,
        letterSpacing: t.letterSpacing, textTransform: t.textTransform,
      });
    }
    const plain = t.content.replace(/<[^>]+>/g, '');
    return measureRunWidthPx(t.textTransform === 'uppercase' ? plain.toUpperCase() : plain, t.fontFamily, t.fontWeight, fontSize, t.letterSpacing ?? 0) / WRAP_SAFETY;
  };
}

function contentOf(els: MagazineElement[]): ResolvedContent {
  const c: ResolvedContent = {};
  for (const el of els) {
    if (el.type === 'text' && el.text) c[el.id] = { text: el.text.content };
    else if (el.type === 'image' && el.image?.url) c[el.id] = { image: { url: el.image.url, assetId: el.image.assetId, alt: el.image.alt } };
    else if (el.type === 'qr' && el.qr?.url) c[el.id] = { qrUrl: el.qr.url };
    else if (el.type === 'icon') c[el.id] = { iconName: el.icon?.name ?? 'Star' };
  }
  return c;
}

/** The balancer's own tolerance: a text track within this of its copy is not slack. */
const FIT_TOLERANCE_PX = 12;

/** Does this subtree hold a column anchored or spread inside its track (balanceLayout's
 *  `usesSpace`)? */
function usesSpace(node: LayoutNode): boolean {
  if (node.kind === 'leaf') return false;
  if (node.kind === 'col' && node.justify && node.justify !== 'start') return true;
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.some(usesSpace);
}

const isFixedSpacer = (c: LayoutChild) => c.node.kind === 'leaf' && c.node.role === 'spacer' && c.sizing === 'content';
function holdsFlexibleSpacer(node: LayoutNode): boolean {
  if (node.kind === 'leaf') return false;
  if (node.kind === 'stack') return node.layers.some(holdsFlexibleSpacer);
  return node.children.some((c) => (c.node.kind === 'leaf' && c.node.role === 'spacer' ? (c.sizing ?? 'fr') === 'fr' : holdsFlexibleSpacer(c.node)));
}

/**
 * Text tracks that HOLD their copy were hugging it when the page was composed — the
 * art-director's `content` sizing, which the elements do not record. They hug again, before
 * the balancer runs:
 *   • one that fits its copy (to within the balancer's tolerance), because left as a
 *     weight it would take a share of whatever the balancer frees elsewhere — a quote
 *     panel growing a band of bare paper under its quote;
 *   • one that is slack but holds a column this pass rebuilt as anchored or spread (see
 *     `seat`, `sequence`), which the balancer leaves alone on principle (it cannot tell a
 *     rebuilt anchor from an art-director's) — the anchored column still fills whatever
 *     height its row is given; it is the row that hugs.
 * A track whose copy was shrunk to fit measures larger than its box and stays flexible —
 * it needs the room. Declared air (a flexible spacer) is never squeezed.
 */
function hugFittedText(spec: LayoutSpec, page: { width: number; height: number }, measure: MeasureFn): void {
  const trace: SolveTrace = new Map();
  solveLayout(spec, page, { measureLeaf: measure, trace });
  const visit = (node: LayoutNode): void => {
    if (node.kind === 'leaf') return;
    if (node.kind === 'stack') {
      node.layers.forEach(visit);
      return;
    }
    node.children.forEach((c) => visit(c.node));
    if (node.kind !== 'col') return;
    // An inset wrapper's one real child IS its content area (balanceLayout's rule).
    if (node.children.some(isFixedSpacer) && node.children.filter((k) => !isFixedSpacer(k)).length === 1) return;
    for (const c of node.children) {
      if ((c.sizing ?? 'fr') !== 'fr') continue;
      if (c.node.kind === 'leaf' && (c.node.role === 'spacer' || c.node.role === 'image')) continue;
      if (holdsFlexibleSpacer(c.node)) continue;
      // An anchored / spread column's OWN track keeps its height: that is what it spreads in.
      if (c.node.kind === 'col' && c.node.justify && c.node.justify !== 'start') continue;
      const r = trace.get(c.node);
      if (!r) continue;
      const nat = naturalMain(c.node, 'col', r.w, measure);
      if (nat == null || r.h < nat - 2) continue;
      if (r.h <= nat + FIT_TOLERANCE_PX || usesSpace(c.node)) c.sizing = 'content';
    }
  };
  visit(spec.root);
}

/**
 * Let a paragraph that outgrew its box claim room: every track on the way up from its
 * leaf hugs its content, until one sits beside a flexible sibling (a photograph) that can
 * give the room. Returns false when nothing on the way up can give.
 */
function growToFit(root: LayoutNode, ref: string): boolean {
  const path: { parent: ContainerNode; index: number }[] = [];
  const find = (node: LayoutNode): boolean => {
    if (node.kind === 'leaf') return node.contentRef === ref;
    if (node.kind === 'stack') return node.layers.some(find);
    for (let i = 0; i < node.children.length; i++) {
      if (find(node.children[i]!.node)) {
        path.push({ parent: node, index: i });
        return true;
      }
    }
    return false;
  };
  if (!find(root)) return false;
  // `path` runs leaf-upward.
  let grew = false;
  for (const { parent, index } of path) {
    if (parent.kind !== 'col') continue;
    const child = parent.children[index]!;
    if ((child.sizing ?? 'fr') !== 'fr') continue;
    child.sizing = 'content';
    grew = true;
    const flexible = parent.children.some((c, i) => i !== index && (c.sizing ?? 'fr') === 'fr' && !(c.node.kind === 'leaf' && c.node.role === 'spacer'));
    if (flexible) return true;
  }
  return grew;
}

// ── Never trade one defect for another ───────────────────────────────────────

/** Which content boxes overlap which — the page's TOPOLOGY. A drop cap's pieces count as
 *  their paragraph. Overlaps are authored (a stack, an overlap, a placed caption), so a
 *  re-balance must keep every one of them and add none. */
function overlapPairs(els: MagazineElement[], keyOf: (id: string) => string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i]!;
      const b = els[j]!;
      const ka = keyOf(a.id);
      const kb = keyOf(b.id);
      if (ka === kb || !intersects(a, b)) continue;
      out.add(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
    }
  }
  return out;
}

const EDGES = ['left', 'top', 'right', 'bottom'] as const;
function trimEdges(el: Box, page: { width: number; height: number }): Set<(typeof EDGES)[number]> {
  const s = new Set<(typeof EDGES)[number]>();
  if (el.x <= 1) s.add('left');
  if (el.y <= 1) s.add('top');
  if (right(el) >= page.width - 1) s.add('right');
  if (bottom(el) >= page.height - 1) s.add('bottom');
  return s;
}

const defectCount = (q: PageQuality) => q.slivers.length + q.emptyBoxes.length + q.deadBands.length;

interface Candidate {
  result: RelayoutResult;
  dropped: number;
  overflow: number;
}

// ── The pass ─────────────────────────────────────────────────────────────────

/**
 * Propose a re-balanced layout for an existing page — or say, in the user's words, why it
 * was left as it is. `page` is the page's own width/height.
 */
export function adjustPageLayout(
  elements: MagazineElement[],
  page: { width: number; height: number },
  /** `always`: re-balance even a page that measures clean (diagnostics and tests — Adjust
   *  itself never does). */
  opts: { always?: boolean } = {},
): RelayoutOutcome {
  const none = (reason = ''): RelayoutOutcome => ({ result: null, reason });
  const furniture = elements.filter((e) => FURNITURE_IDS.includes(e.id));
  const content = elements.filter((e) => !FURNITURE_IDS.includes(e.id));
  if (content.length === 0) return none();
  // Only pages the generator composed. An imported page is a reproduction of somebody's
  // layout and a hand-built element is a decision; neither is ours to rearrange.
  if (content.some((e) => e.source !== 'ai-agent')) return none(RELAYOUT_REFUSALS.foreign);
  const dropCaps = readDropCaps(content);
  if (dropCaps === 'broken') return none(RELAYOUT_REFUSALS.dropCap);

  // Only when there is something to repair: a page with no sliver, no oversize box and
  // no dead band — and no drop cap whose split no longer fits its copy — is left exactly
  // as it is. Adjust must never reshuffle a page that is fine.
  const before = pageQuality(elements, page);
  const stale = dropCaps.filter(dropCapStale);
  if (defectCount(before) === 0 && stale.length === 0 && !opts.always) return none();

  // The working set: every drop cap as ONE paragraph element.
  const paras = new Map(dropCaps.map((p) => [p.key, p]));
  const pieceOf = new Map<string, string>();
  for (const p of dropCaps) for (const el of [p.cap, p.lead, p.rest]) if (el) pieceOf.set(el.id, p.key);
  const work = [...content.filter((e) => !pieceOf.has(e.id)), ...dropCaps.map(paraElement)];

  // Free-standing decorative shapes (a bar, a block) are not part of any frame tree we can
  // rebuild; a shape is only placed when it is a RULE, backs something (a card panel) or
  // washes a photo (a scrim). Anything else would be left behind while its neighbours move.
  const backsSomething = (s: MagazineElement) => work.some((o) => o !== s && o.type !== 'shape' && coverage(o, s) >= 0.85);
  const washesAPhoto = (s: MagazineElement) => work.some((o) => o !== s && o.type === 'image' && coverage(s, o) >= 0.85);
  if (work.some((s) => s.type === 'shape' && !ruleAxis(s) && !backsSomething(s) && !washesAPhoto(s))) return none(RELAYOUT_REFUSALS.unsafe);

  // The rectangle the content may use: its own left/right/top, and a bottom that is at
  // least as far from the foot as the top is from the head (the margin is symmetric)
  // without ever running into the folio band. When the content runs off the top (a
  // bleed), the head has no margin to mirror; the side margins say what the page's is.
  const box = bbox(work);
  const sides = work.flatMap((e) => [e.x, page.width - right(e)]).filter((m) => m > TOL);
  const head = box.y > TOL ? box.y : sides.length ? Math.min(...sides) : 0;
  const folioTop = Math.min(page.height, ...furniture.filter((f) => f.y > page.height / 2).map((f) => f.y - TOL - 1));
  const floor = Math.max(bottom(box), Math.min(page.height - head, folioTop));
  const cell: Box = { x: box.x, y: box.y, w: box.w, h: Math.max(1, floor - box.y) };
  const tree = build(work, cell, { slivers: new Set(before.slivers.map((x) => x.id)) });
  if (!tree) return none(RELAYOUT_REFUSALS.unsafe);
  // The cell already decided how far the content may run; its foot is pinned exactly (a
  // folio band below it is not leftover).
  const root = inset(tree, cell, { x: 0, y: 0, w: page.width, h: page.height }, { pinBottom: true });

  const byId = new Map(work.map((e) => [e.id, e]));
  const measure = elementMeasure(byId, paras);
  const balance = { page, measure, content: contentOf(work), prune: { keepWhitespace: true } };

  // A drop-cap paragraph that outgrew its box may take room from the photographs before it
  // is shrunk (its pieces are pinned; they cannot shrink-to-fit on their own). Tried as a
  // second candidate: it is only kept when it does strictly better.
  const plain: LayoutSpec = { page: { background: { ref: 'bg' }, margin: 0 }, root };
  hugFittedText(plain, page, measure);
  const specs: LayoutSpec[] = [plain];
  const crowded = dropCaps.filter((p) => paraHeight(p, p.box.w) > p.box.h + 2);
  if (crowded.length > 0) {
    const grown = structuredClone(plain);
    if (crowded.map((p) => growToFit(grown.root, p.key)).some(Boolean)) specs.push(grown);
  }

  const beforeHard = validatePageLayout(elements, page).issues;
  const hardOf = (issues: { kind: string }[]) => issues.filter((i) => i.kind !== 'overflow').length;
  const overflowOf = (issues: { kind: string }[]) => issues.filter((i) => i.kind === 'overflow').length;
  const keyOf = (id: string) => pieceOf.get(id) ?? id;
  const pairsBefore = overlapPairs(content, keyOf);

  const candidates: Candidate[] = [];
  for (const spec of specs) {
    const balanced = balanceLayout(spec, balance);
    const result = mapBack(balanced, { elements, content, work, byId, paras, page, before });
    if (!result) continue;
    const issues = validatePageLayout(result.elements, page).issues;
    // Never trade one defect for another: a re-layout that collides boxes the page did
    // not collide, pushes one off the sheet, overflows more copy, or measures worse, is
    // refused whole.
    if (hardOf(issues) > hardOf(beforeHard)) continue;
    if (overflowOf(issues) > overflowOf(beforeHard)) continue;
    if (defectCount(result.after) > defectCount(before)) continue;
    // …and never change the design: every overlap the page had is still there and there
    // is no new one; every box at the trim is still at the trim.
    const gone = new Set(result.removes.map(keyOf));
    const kept = content.filter((e) => !result.removes.includes(e.id));
    const pairsAfter = overlapPairs(result.elements.filter((e) => !FURNITURE_IDS.includes(e.id)), keyOf);
    const lost = [...pairsBefore].some((pr) => !pairsAfter.has(pr) && !pr.split('|').some((k) => gone.has(k) && !paras.has(k)));
    const added = [...pairsAfter].some((pr) => !pairsBefore.has(pr));
    if (lost || added) continue;
    const afterById = new Map(result.elements.map((e) => [e.id, e]));
    const bleedLost = kept.some((e) => {
      if (pieceOf.has(e.id)) return false;
      const now = afterById.get(e.id);
      if (!now) return false;
      const was = trimEdges(e, page);
      const is = trimEdges(now, page);
      return [...was].some((edge) => !is.has(edge));
    });
    if (bleedLost) continue;
    candidates.push({ result, dropped: balanced.droppedImages.length, overflow: overflowOf(issues) });
  }
  if (candidates.length === 0) return none(RELAYOUT_REFUSALS.unsafe);
  // The plain re-balance, unless letting a drop-cap paragraph claim room does better: it
  // costs no photograph, overflows nothing more, measures no worse — and keeps the type
  // larger (a paragraph shrunk below the body beside it is the thing to avoid) or fixes
  // what the plain pass could not.
  const typeOf = (c: Candidate) => dropCaps.reduce((s, p) => s + (c.result.elements.find((e) => e.id === p.lead.id)?.text?.fontSize ?? 0), 0);
  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (c.dropped > best.dropped || c.overflow > best.overflow || defectCount(c.result.after) > defectCount(best.result.after)) continue;
    if (c.overflow < best.overflow || defectCount(c.result.after) < defectCount(best.result.after) || typeOf(c) > typeOf(best) + 0.5) best = c;
  }
  const r = best.result;
  if (r.moves.length === 0 && r.removes.length === 0 && r.scrims.length === 0 && r.texts.length === 0) return none();
  return { result: r, reason: '' };
}

/**
 * Propose a re-balanced layout for an existing page, or null when the page cannot be
 * reconstructed safely (it is then left exactly as it is) or needs nothing. `page` is the
 * page's own width/height. adjustPageLayout says which, and why.
 */
export function relayoutPage(elements: MagazineElement[], page: { width: number; height: number }): RelayoutResult | null {
  return adjustPageLayout(elements, page).result;
}

interface MapCtx {
  elements: MagazineElement[];
  content: MagazineElement[];
  work: MagazineElement[];
  byId: Map<string, MagazineElement>;
  paras: Map<string, DropCapPara>;
  page: { width: number; height: number };
  before: PageQuality;
}

/** Solved boxes → patches on the real elements, and the page as it would then read. */
function mapBack(balanced: BalanceResult, ctx: MapCtx): RelayoutResult | null {
  const { byId, paras, page } = ctx;
  const out: Patches = { moves: [], texts: [], removes: [], actions: [...balanced.actions], notes: [] };
  const placed = new Set<string>();
  for (const leaf of balanced.solved.leaves) {
    const el = byId.get(leaf.node.contentRef ?? '');
    if (!el) continue;
    placed.add(el.id);
    let b = leaf.box;
    const p = paras.get(el.id);
    if (p) {
      resplit(p, b, out);
      continue;
    }
    if (el.type === 'qr' || el.type === 'icon') {
      const side = Math.max(1, Math.min(b.w, b.h));
      b = { x: b.x + Math.round((b.w - side) / 2), y: b.y + Math.round((b.h - side) / 2), w: side, h: side };
    }
    moveIfChanged(out, el, b);
    // A tilt near the trim would show a wedge of bare page (composeFromSolved's rule).
    if (el.rotation && (b.x < ROTATION_EDGE || b.y < ROTATION_EDGE || right(b) > page.width - ROTATION_EDGE || bottom(b) > page.height - ROTATION_EDGE)) {
      const m = out.moves.find((x) => x.elementId === el.id);
      if (m) m.rotation = 0;
      else out.moves.push({ elementId: el.id, x: el.x, y: el.y, w: el.w, h: el.h, rotation: 0 });
    }
  }
  for (const id of balanced.droppedImages) if (byId.has(id) && !out.removes.includes(id)) out.removes.push(id);
  // Anything neither placed nor deliberately dropped means the tree lost an element —
  // never guess about that page.
  if (ctx.work.some((e) => !placed.has(e.id) && !out.removes.includes(e.id))) return null;

  const scrims: RelayoutResult['scrims'] = [];
  for (const el of ctx.content) {
    if (el.type !== 'shape' || typeof el.shape?.opacity !== 'number') continue;
    const overPhoto = ctx.content.some((o) => o.type === 'image' && o.zIndex <= el.zIndex && coverage(o, el) > 0);
    if (!overPhoto) continue;
    const capped = capScrimOpacity(el.shape.opacity, el, page);
    if (capped < el.shape.opacity) scrims.push({ elementId: el.id, opacity: capped });
  }

  const moved = new Map(out.moves.map((m) => [m.elementId, m]));
  const retyped = new Map(out.texts.map((t) => [t.elementId, t]));
  const lightened = new Map(scrims.map((s) => [s.elementId, s.opacity]));
  const after = refitText(
    ctx.elements
      .filter((e) => !out.removes.includes(e.id))
      .map((e) => {
        const m = moved.get(e.id);
        const t = retyped.get(e.id);
        const op = lightened.get(e.id);
        let next = m ? { ...e, x: m.x, y: m.y, w: m.w, h: m.h, ...(m.rotation !== undefined ? { rotation: m.rotation } : {}) } : e;
        if (t && next.text) {
          const { elementId: _id, ...patch } = t;
          next = { ...next, text: { ...next.text, ...patch } };
        }
        if (op !== undefined && next.shape) next = { ...next, shape: { ...next.shape, opacity: op } };
        return next;
      }),
  );

  for (const s of scrims) out.actions.push(`lightened the wash over the photo to ${s.opacity} so the picture shows`);
  return {
    moves: out.moves,
    notes: [...new Set(out.notes)],
    droppedPhotos: out.removes.filter((id) => byId.get(id)?.type === 'image'),
    removes: out.removes,
    scrims,
    texts: out.texts,
    actions: out.actions,
    elements: after,
    before: ctx.before,
    after: pageQuality(after, page),
  };
}
