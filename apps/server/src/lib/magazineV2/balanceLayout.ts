// ---------------------------------------------------------------------------
// Magazine Builder v2 — BALANCE a layout spec against its real content, then solve.
//
// The art-director shares the page out by WEIGHT, and it has to guess: it never sees
// the copy, so a feature title gets "weight 1" of a 1634px column and receives 787px to
// hold two lines of type. The solver is faithful to the guess, the box is drawn around
// ~200px of words, and the rest of it prints as bare paper — the "huge empty band"
// under a title, the cover line stretched to 523px, the masthead given 1173px on a page
// whose photo was hidden under a near-black scrim. Meanwhile the photographs got the
// crumbs: a 451×28 ribbon in a profile grid, a 74×1634 strip down a contents page.
//
// That is ONE root cause wearing three costumes: text tracks are sized by weight instead
// of by what they hold, and whatever space they waste is taken from — or never reaches —
// the pictures. This pass fixes it the only way that keeps the solver the sole pixel
// authority: by rewriting the TREE and re-solving, never by editing boxes.
//
//   1. TIGHTEN — an `fr` track whose subtree is only text (a headline, a title row of
//      headline + standfirst, a column of entries) and which was given more than its
//      content needs becomes `sizing:'content'`. It hugs its copy; the freed length flows,
//      by the solver's own weights, to the tracks that can USE space — photographs, and
//      text that was short of room. Spacers are the art-director's declared air and are
//      never touched. A text track that is short of room is left `fr`: tightening only
//      ever removes slack, it never takes room from anything.
//
//   2. DISTRIBUTE what is left where nothing can absorb it, by the layout's own intent:
//        • over a photograph (a stack with an image under it) the space is not empty —
//          the picture shows — so the masthead group stays at the top and the rest
//          (cover lines, a feature's footer) is anchored at the foot: classic cover;
//        • a run of parallel items (contents entries, numbered points) is spread down
//          its column — spacing rhythm;
//        • a display group with no prose in it (a pull-quote, a title block) is centred;
//        • anything else — an article column with a ragged bottom — is left top-aligned,
//          and if the page is genuinely short of content the fit report's dead-band
//          check says so and the art-director retries with more.
//      An explicit `justify` from the art-director is always honoured as-is.
//
//   3. GUARD THE PHOTOGRAPHS — any image that is still not a photograph (layoutQuality
//      rules: aspect 1:2–5:2, or wider for a bleed; ≥120px short side; ≥1% of the
//      sheet) is RE-FLOWED by fixing its track at the size that makes it sane, and kept
//      only if that does not crush the text beside it. Otherwise the slot is DROPPED and
//      the page re-partitioned around the content that remains. A squeezed photo is
//      worse than no photo. Backgrounds (a photo under text in a stack, or ≥45% of the
//      sheet) are exempt — their shape is the page's.
//
// Rounds repeat (bounded) because each step can expose work for the others: a dropped
// image frees space that another text track may now be slack in.
//
// Used by the generator (composeSpecToPage), before curation (so the photo is sourced
// in the orientation of the box it will really get, and a slot that will be dropped is
// never paid for) and after it. The layout-from-reference path does NOT use it: there,
// the reference's whitespace is the design.
//
// Pure + deterministic: tree transforms over measured metrics. No DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { solveLayout, naturalMain, type MeasureFn, type SolvedLayout, type SolveTrace, type SolvedLeaf } from './solveLayout.js';
import { pruneLayoutSpec } from './pruneSpec.js';
import { resolveSpace, isRuleLeaf, type ContainerNode, type LayoutChild, type LayoutNode, type LayoutSpec, type StackNode } from './layoutSpec.js';
import type { ResolvedContent } from './composeFromSolved.js';
import { imageShapeProblem, IMAGE_MIN_AREA_SHARE, IMAGE_MIN_SIDE, type ImageShapeProblem } from './layoutQuality.js';
import { TEXT_ROLES } from './roleScale.js';

/** Bounded: every round either changes the tree or ends the loop. */
const MAX_ROUNDS = 8;
/** Each tighten pass converts every currently-slack track; a few passes settle it. */
const MAX_TIGHTEN_PASSES = 8;
/** A track is slack only when its share beats its content by more than this. */
const SLACK_TOLERANCE_PX = 12;
/** Leftover smaller than this share of the page height is rhythm, not a decision. */
const LEFTOVER_MIN_SHARE = 0.03;
/** A text box below this share of its content's height has been crushed (≈ the
 *  type cut by a third or more) — the price a reshaped photo may not charge. */
const CRUSH_RATIO = 0.6;

/** Roles that open a group — a masthead, a section head — rather than run in it. */
const HEAD_ROLES = new Set<string>(['kicker', 'headline', 'figure', 'subhead', 'byline', 'label']);
/** Prose a reader reads through; a group holding any is an article, not a display. */
const PROSE_ROLES = new Set<string>(['body', 'entry', 'caption']);
/** Display type a group can be centred around. */
const DISPLAY_ROLES = new Set<string>(['headline', 'figure', 'pullquote']);

export interface BalanceOptions {
  page: { width: number; height: number };
  /** The measurer the final solve will use (makeMeasureLeaf for generated pages). */
  measure: MeasureFn;
  /** The content the leaves resolve to — needed only to drop an image slot cleanly. */
  content: ResolvedContent;
  /** Forwarded to pruneLayoutSpec when a dropped image empties part of the tree. */
  prune?: { keepWhitespace?: boolean; keepImagePlaceholders?: boolean };
}

export interface BalanceResult {
  spec: LayoutSpec;
  solved: SolvedLayout;
  /** `content` minus any image slot the guard dropped. */
  content: ResolvedContent;
  /** contentRefs of image slots that were dropped (never squeezed). */
  droppedImages: string[];
  /** What was changed, in words — for the logs, never for the model. */
  actions: string[];
}

const describe = (node: LayoutNode): string =>
  node.kind === 'leaf' ? `${node.role}${node.contentRef ? ` "${node.contentRef}"` : ''}` : `${node.kind}(${countAll(node)} leaves)`;

function countAll(node: LayoutNode): number {
  if (node.kind === 'leaf') return 1;
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.reduce((n, k) => n + countAll(k), 0);
}

function leavesOf(node: LayoutNode): LayoutNode[] {
  if (node.kind === 'leaf') return [node];
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.flatMap(leavesOf);
}

/**
 * A subtree holding a FLEXIBLE spacer is carrying the art-director's DECLARED air;
 * tightening it would delete a decision, so it stays flexible. A FIXED spacer (content-
 * sized, pinned by minPx) is a margin or an inset rather than air, and does not count.
 */
function holdsSpacer(node: LayoutNode): boolean {
  if (node.kind === 'leaf') return node.role === 'spacer';
  if (node.kind === 'stack') return node.layers.some(holdsSpacer);
  return node.children.some((c) =>
    c.node.kind === 'leaf' && c.node.role === 'spacer' ? (c.sizing ?? 'fr') === 'fr' : holdsSpacer(c.node),
  );
}

function eachNode(node: LayoutNode, fn: (n: LayoutNode) => void): void {
  fn(node);
  if (node.kind === 'stack') node.layers.forEach((l) => eachNode(l, fn));
  else if (node.kind !== 'leaf') node.children.forEach((c) => eachNode(c.node, fn));
}

interface ParentRef {
  parent: ContainerNode | StackNode;
  index: number;
}

function parentsOf(root: LayoutNode): Map<LayoutNode, ParentRef> {
  const out = new Map<LayoutNode, ParentRef>();
  eachNode(root, (n) => {
    if (n.kind === 'stack') n.layers.forEach((l, index) => out.set(l, { parent: n, index }));
    else if (n.kind !== 'leaf') n.children.forEach((c, index) => out.set(c.node, { parent: n, index }));
  });
  return out;
}

function solveWith(spec: LayoutSpec, opts: BalanceOptions, trace?: SolveTrace): SolvedLayout {
  return solveLayout(spec, opts.page, { measureLeaf: opts.measure, ...(trace ? { trace } : {}) });
}

// ── 1. Tighten ──────────────────────────────────────────────────────────────

/**
 * Does this subtree USE whatever height it is given, by design? A col the art-director
 * (or the distribute step below) anchored with `justify` center/end/between spreads or
 * places its children inside its whole track — hugging it would undo exactly that.
 */
function usesSpace(node: LayoutNode): boolean {
  if (node.kind === 'leaf') return false;
  if (node.kind === 'col' && node.justify && node.justify !== 'start') return true;
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.some(usesSpace);
}

const isFixedSpacer = (c: LayoutChild) => c.node.kind === 'leaf' && c.node.role === 'spacer' && c.sizing === 'content';

/**
 * A pure INSET: one real child between fixed margin tracks (relayoutPage builds these to
 * pin a page's margins and the inset of type over a photo). The child is the content
 * area itself, exactly like a padded stack layer — it fills its rect, it never hugs.
 */
function isInsetWrapper(c: ContainerNode): boolean {
  return c.children.some(isFixedSpacer) && c.children.filter((k) => !isFixedSpacer(k)).length === 1;
}

function tighten(spec: LayoutSpec, opts: BalanceOptions, actions: string[]): void {
  for (let pass = 0; pass < MAX_TIGHTEN_PASSES; pass++) {
    const trace: SolveTrace = new Map();
    solveWith(spec, opts, trace);
    let changed = false;
    eachNode(spec.root, (c) => {
      // Rows are left alone on purpose: their main axis is WIDTH, and the vertical slack
      // of a row's text is removed one level up, when the row itself is tightened in
      // the col that holds it.
      if (c.kind !== 'col') return;
      if (isInsetWrapper(c)) return;
      // A grid sizes its tracks by span, never by sizing — there is nothing to tighten.
      if (typeof c.grid === 'number' && c.grid >= 2) return;
      for (const child of c.children) {
        if ((child.sizing ?? 'fr') !== 'fr') continue;
        const node = child.node;
        if (node.kind === 'leaf' && node.role === 'spacer') continue;
        if (isRuleLeaf(node)) continue; // a rule is its thickness already
        if (holdsSpacer(node) || usesSpace(node)) continue;
        const rect = trace.get(node);
        if (!rect) continue;
        const nat = naturalMain(node, 'col', rect.w, opts.measure);
        if (nat == null) continue; // a photo (or anything flexible) inside — it can use the room
        if (rect.h <= nat + SLACK_TOLERANCE_PX) continue; // short of room, or near enough: leave it fr
        child.sizing = 'content';
        // A square device has no size the text measurer knows — pin the square instead.
        if (node.kind === 'leaf' && !TEXT_ROLES.has(node.role)) child.minPx = Math.ceil(nat);
        changed = true;
        actions.push(`tightened ${describe(node)}: ${rect.h}px track → its ${Math.round(nat)}px of content`);
      }
    });
    if (!changed) return;
  }
}

// ── 2. Distribute leftover by intent ────────────────────────────────────────

function signature(node: LayoutNode): string {
  if (node.kind === 'leaf') return node.role;
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return `${node.kind}(${kids.map(signature).join(',')})`;
}

const isHead = (node: LayoutNode): boolean => {
  const ls = leavesOf(node).filter((l) => l.kind === 'leaf' && l.role !== 'shape' && l.role !== 'spacer');
  return ls.length > 0 && ls.every((l) => l.kind === 'leaf' && HEAD_ROLES.has(l.role));
};

/** Index where a trailing run of ≥3 identically-shaped children starts, or -1. */
function listRunStart(children: LayoutChild[]): number {
  const n = children.length;
  if (n < 3) return -1;
  const sig = signature(children[n - 1]!.node);
  let start = n - 1;
  while (start > 0 && signature(children[start - 1]!.node) === sig) start--;
  return n - start >= 3 ? start : -1;
}

function settle(c: ContainerNode, overImage: boolean, trace: SolveTrace, opts: BalanceOptions, actions: string[]): void {
  if (c.kind !== 'col') return;
  if (c.justify && c.justify !== 'start') return; // the art-director anchored it — its call
  if (typeof c.grid === 'number' && c.grid >= 2) return; // spans fix the tracks
  // An fr track absorbs any leftover (a rule is fixed whatever its sizing says).
  if (c.children.some((k) => (k.sizing ?? 'fr') === 'fr' && !isRuleLeaf(k.node))) return;
  const rect = trace.get(c);
  if (!rect) return;
  const n = c.children.length;
  const pad = Math.min(resolveSpace(c.pad), Math.floor(rect.h / 2));
  const gap = n > 1 ? resolveSpace(c.gap) : 0;
  let used = gap * (n - 1);
  for (const k of c.children) used += trace.get(k.node)?.h ?? 0;
  // An overlap is a negative gap: the overlapping track's length is counted above, but
  // the part of it that rides over its neighbour uses no length of the column.
  c.children.forEach((k, i) => {
    if (i === 0 || !k.overlap) return;
    const prev = trace.get(c.children[i - 1]!.node);
    const cur = trace.get(k.node);
    if (prev && cur) used -= Math.max(0, prev.y + prev.h + gap - cur.y);
  });
  const leftover = rect.h - 2 * pad - used;
  if (leftover < opts.page.height * LEFTOVER_MIN_SHARE) return;

  if (overImage) {
    // Over a photograph the leftover is the picture showing. Keep the masthead group
    // up top and anchor the rest at the foot, so the photo reads between them.
    let split = 0;
    while (split < n && isHead(c.children[split]!.node)) split++;
    if (split === 0 || split === n) return; // one group only: top-aligned over the photo is fine
    const head: ContainerNode = { kind: 'col', gap: c.gap ?? 'none', children: c.children.slice(0, split) };
    const tail: ContainerNode = { kind: 'col', gap: c.gap ?? 'none', children: c.children.slice(split) };
    c.children = [
      { weight: 1, sizing: 'content', node: head },
      { weight: 1, sizing: 'content', node: tail },
    ];
    c.justify = 'between';
    actions.push(`anchored the masthead group at the top and the rest at the foot, over the photo (${Math.round(leftover)}px between)`);
    return;
  }

  const run = listRunStart(c.children);
  if (run === 0) {
    c.justify = 'between';
    actions.push(`spread a list of ${n} items down its column (${Math.round(leftover)}px of rhythm)`);
    return;
  }
  if (run > 0) {
    const list: ContainerNode = { kind: 'col', gap: c.gap ?? 'none', justify: 'between', children: c.children.slice(run) };
    c.children = [...c.children.slice(0, run), { weight: 1, sizing: 'fr', node: list }];
    actions.push(`spread a list of ${n - run} items under its heading (${Math.round(leftover)}px of rhythm)`);
    return;
  }
  const roles = leavesOf(c).map((l) => (l.kind === 'leaf' ? l.role : ''));
  if (!roles.some((r) => PROSE_ROLES.has(r)) && roles.some((r) => DISPLAY_ROLES.has(r))) {
    c.justify = 'center';
    actions.push(`centred a display group in its ${rect.h}px column`);
  }
  // Otherwise: an article column with a ragged foot. Honest; the fit report judges it.
}

function distribute(spec: LayoutSpec, opts: BalanceOptions, actions: string[]): void {
  const trace: SolveTrace = new Map();
  solveWith(spec, opts, trace);
  const walk = (node: LayoutNode, overImage: boolean): void => {
    if (node.kind === 'leaf') return;
    if (node.kind === 'stack') {
      let below = false;
      for (const layer of node.layers) {
        walk(layer, overImage || below);
        if (layer.kind === 'leaf' && layer.role === 'image') below = true;
      }
      return;
    }
    for (const k of node.children) walk(k.node, overImage);
    settle(node, overImage, trace, opts, actions);
  };
  walk(spec.root, false);
}

// ── 3. Guard the photographs ────────────────────────────────────────────────

/** A photo is a BACKING when, inside its stack, a content layer sits on top of it. */
function isBacking(node: LayoutNode, parents: Map<LayoutNode, ParentRef>): boolean {
  const ref = parents.get(node);
  if (!ref || ref.parent.kind !== 'stack') return false;
  return ref.parent.layers.slice(ref.index + 1).some((l) => !(l.kind === 'leaf' && (l.role === 'shape' || l.role === 'spacer')));
}

function drawsSomething(leaf: SolvedLeaf, content: ResolvedContent): boolean {
  const c = content[leaf.node.contentRef ?? ''];
  return !!(c?.image?.url || c?.shapeFill);
}

/** How many text boxes are crushed below CRUSH_RATIO of the copy they hold. */
function crushedCount(solved: SolvedLayout, measure: MeasureFn): number {
  let n = 0;
  for (const l of solved.leaves) {
    if (!TEXT_ROLES.has(l.node.role)) continue;
    const nat = measure({ leaf: l.node, axis: 'col', crossLen: l.box.w });
    if (nat != null && nat > 0 && l.box.h < nat * CRUSH_RATIO) n++;
  }
  return n;
}

/** The main-axis length that would make this photo sane, or null if no length can. */
function targetMain(problem: ImageShapeProblem, box: { w: number; h: number }, isRow: boolean, page: { width: number; height: number }): number | null {
  const cross = isRow ? box.h : box.w;
  if (cross < IMAGE_MIN_SIDE) return null; // the short side is the cross axis: no track length can fix it
  const minArea = page.width * page.height * IMAGE_MIN_AREA_SHARE;
  const { lo, hi } = problem;
  // Main length bounds that keep the aspect in [lo, hi]: in a row the main axis is the
  // width (w/h ≥ lo ⇔ w ≥ h·lo); in a col it is the height (w/h ≤ hi ⇔ h ≥ w/hi).
  const minMain = Math.max(IMAGE_MIN_SIDE, Math.ceil(minArea / cross), isRow ? Math.ceil(cross * lo) : Math.ceil(cross / hi));
  const maxMain = isRow ? Math.floor(cross * hi) : Math.floor(cross / lo);
  if (minMain > maxMain) return null;
  const main = isRow ? box.w : box.h;
  return Math.min(maxMain, Math.max(minMain, main));
}

/**
 * The main-axis length a container needs to hold every FIXED track at full size (pinned
 * tracks at their minPx, content tracks at their measured copy) while its flexible
 * tracks keep what they have now — i.e. how big it must become so that nothing in it is
 * scaled down. `crossLen` is the container's own cross length.
 */
function requiredMain(c: ContainerNode, crossLen: number, trace: SolveTrace, measure: MeasureFn): number {
  const axis = c.kind === 'row' ? 'row' : 'col';
  const pad = resolveSpace(c.pad);
  const inner = Math.max(0, crossLen - 2 * pad);
  let total = 2 * pad + (c.children.length > 1 ? resolveSpace(c.gap) * (c.children.length - 1) : 0);
  for (const k of c.children) {
    const r = trace.get(k.node);
    const current = r ? (axis === 'row' ? r.w : r.h) : 0;
    if (k.sizing === 'content') {
      const nat = naturalMain(k.node, axis, inner, measure) ?? 0;
      total += Math.max(nat, k.minPx ?? 0);
    } else {
      total += current;
    }
  }
  return total;
}

const isGrid = (c: ContainerNode | StackNode): boolean => c.kind !== 'stack' && typeof c.grid === 'number' && c.grid >= 2;

function dropImage(spec: LayoutSpec, content: ResolvedContent, ref: string, opts: BalanceOptions): LayoutSpec | null {
  const next: ResolvedContent = { ...content, [ref]: { ...content[ref], image: undefined, shapeFill: undefined } };
  return pruneLayoutSpec(spec, next, opts.prune);
}

function guard(
  spec: LayoutSpec,
  content: ResolvedContent,
  opts: BalanceOptions,
  actions: string[],
  dropped: string[],
): { spec: LayoutSpec; content: ResolvedContent; changed: boolean } {
  const solved = solveWith(spec, opts);
  const parents = parentsOf(spec.root);
  const before = crushedCount(solved, opts.measure);
  for (const leaf of solved.leaves) {
    if (leaf.node.role !== 'image' || !drawsSomething(leaf, content)) continue;
    if (isBacking(leaf.node, parents)) continue;
    const problem = imageShapeProblem(leaf.box, opts.page);
    if (!problem) continue;
    const ref = leaf.node.contentRef ?? '';

    // Climb out of any stack the photo tops: the stack's track is what sizes it.
    let unit: LayoutNode = leaf.node;
    let up = parents.get(unit);
    while (up && up.parent.kind === 'stack') {
      unit = up.parent;
      up = parents.get(unit);
    }
    const saved: { child: LayoutChild; sizing: LayoutChild['sizing']; minPx: number | undefined }[] = [];
    const pin = (child: LayoutChild, px: number) => {
      saved.push({ child, sizing: child.sizing, minPx: child.minPx });
      child.sizing = 'content';
      child.minPx = Math.ceil(px);
    };
    const unpinAll = () => {
      for (const s of saved.reverse()) {
        s.child.sizing = s.sizing;
        if (s.minPx === undefined) delete s.child.minPx;
        else s.child.minPx = s.minPx;
      }
      saved.length = 0;
    };
    if (up && up.parent.kind !== 'stack' && !isGrid(up.parent)) {
      const axis = up.parent.kind;
      const isRow = axis === 'row';
      const want = targetMain(problem, leaf.box, isRow, opts.page);
      if (want != null) {
        const mainOf = (b: { w: number; h: number }) => (isRow ? b.w : b.h);
        pin(up.parent.children[up.index]!, want);
        let trace: SolveTrace = new Map();
        let after = solveWith(spec, opts, trace);
        let moved = after.leaves.find((l) => l.node === leaf.node);
        // The photo's own container may itself be a fixed share of ITS parent (a card in
        // a column of cards): pinning the photo track then only squeezes the card's copy.
        // Carry the shortfall up the same axis to the first track that can grow — the
        // card — so it is its flexible siblings, not its own text, that give way.
        let below: LayoutNode = up.parent;
        let anc = parents.get(below);
        for (let hop = 0; moved && mainOf(moved.box) + 1 < want && anc && hop < 4; hop++) {
          if (anc.parent.kind === axis && below.kind === axis) {
            const r = trace.get(below);
            if (!r) break;
            pin(anc.parent.children[anc.index]!, requiredMain(below, isRow ? r.h : r.w, trace, opts.measure));
            trace = new Map();
            after = solveWith(spec, opts, trace);
            moved = after.leaves.find((l) => l.node === leaf.node);
          }
          below = anc.parent;
          anc = parents.get(below);
        }
        if (moved && !imageShapeProblem(moved.box, opts.page) && crushedCount(after, opts.measure) <= before) {
          actions.push(`re-flowed photo "${ref}" from ${leaf.box.w}×${leaf.box.h} to ${moved.box.w}×${moved.box.h} (${problem.kind})`);
          return { spec, content, changed: true };
        }
        unpinAll();
      }
    }

    // ACROSS: the photo's other side is the length of the track its container holds in
    // ITS parent — a photo too tall in a row is fixed by making the row shorter. This is
    // also the only lever a grid offers (its spans fix the main axis).
    if (up && up.parent.kind !== 'stack' && problem.kind !== 'tiny') {
      const P = up.parent;
      const pRef = parents.get(P);
      if (pRef && pRef.parent.kind !== 'stack' && pRef.parent.kind !== P.kind && !isGrid(pRef.parent)) {
        const isRow = P.kind === 'row'; // in a row the photo's cross side is its height
        const main = isRow ? leaf.box.w : leaf.box.h;
        const { lo, hi } = problem;
        // Aim a little inside the sane range, not on its edge.
        const cross = isRow
          ? problem.kind === 'too-tall' ? Math.floor(main / (lo * 1.15)) : Math.ceil(main / (hi * 0.85))
          : problem.kind === 'too-tall' ? Math.ceil(main * lo * 1.15) : Math.floor(main * hi * 0.85);
        if (cross >= IMAGE_MIN_SIDE) {
          pin(pRef.parent.children[pRef.index]!, cross + 2 * resolveSpace(P.pad));
          const after = solveWith(spec, opts);
          const moved = after.leaves.find((l) => l.node === leaf.node);
          if (moved && !imageShapeProblem(moved.box, opts.page) && crushedCount(after, opts.measure) <= before) {
            actions.push(`re-flowed photo "${ref}" across its row/col from ${leaf.box.w}×${leaf.box.h} to ${moved.box.w}×${moved.box.h} (${problem.kind})`);
            return { spec, content, changed: true };
          }
          unpinAll();
        }
      }
    }

    // No sane shape fits here without crushing the copy: drop the slot, re-partition.
    const next = ref ? dropImage(spec, content, ref, opts) : null;
    if (next) {
      actions.push(`dropped photo "${ref}" — its ${leaf.box.w}×${leaf.box.h} cell cannot hold a picture (${problem.detail})`);
      dropped.push(ref);
      return { spec: next, content: { ...content, [ref]: { ...content[ref], image: undefined, shapeFill: undefined } }, changed: true };
    }
  }
  return { spec, content, changed: false };
}

/**
 * Balance a (pruned) spec against its content and return the final solve. Never throws;
 * never returns a worse page than it was given — every rewrite is one of: a slack text
 * track hugging its copy, leftover anchored by intent, a photo re-flowed into a sane
 * shape without crushing text, or a photo that could not be sane dropped.
 */
export function balanceLayout(input: LayoutSpec, opts: BalanceOptions): BalanceResult {
  let spec: LayoutSpec = structuredClone(input);
  let content = opts.content;
  const actions: string[] = [];
  const droppedImages: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    tighten(spec, opts, actions);
    distribute(spec, opts, actions);
    const g = guard(spec, content, { ...opts, content }, actions, droppedImages);
    spec = g.spec;
    content = g.content;
    if (!g.changed) break;
  }
  return { spec, solved: solveWith(spec, opts), content, droppedImages, actions };
}
