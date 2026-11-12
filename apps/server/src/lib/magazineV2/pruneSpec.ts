// ---------------------------------------------------------------------------
// Magazine Builder v2 — prune a LayoutSpec against resolved content, then the
// caller RE-SOLVES the pruned tree.
//
// Why: the solver faithfully partitions the page across EVERY leaf the spec
// declares. If a leaf resolves to no real content — copy the copywriter left
// empty, or a photo that failed to load — its box is still allocated and renders
// as dead space (a blank region, or a flat palette-tint block where a photo was
// meant to be). The fix is NOT to hand-edit solved boxes (that would leave the
// same gaps and break the solver's tiling guarantee); it is to drop the empty
// leaves from the TREE and re-solve, so the solver re-partitions the whole page
// across only the leaves that carry real content. The solver stays the sole
// pixel authority; this is a pure, never-throw tree transform mirroring the
// drop-invalid discipline of normalizeLayoutSpec (layoutSpec.ts).
//
// Shapes need care: a shape is NOT always decorative. A SCRIM (a shape layer
// ABOVE an image in a stack) earns its keep only while that image survives; a
// PANEL (a shape at the BOTTOM of a stack, e.g. a stat bar or the back-cover
// field) earns its keep only while a layer ABOVE it still has content. A shape
// sitting in normal flow (a row/col child) overlaps nothing — it is a standalone
// colour block, i.e. dead space — and is always dropped. This is exactly the
// distinction composeFromSolved's scrim/panel logic draws, kept in sync here.
//
// Pure + server-safe: no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { isRuleLeaf, type LayoutSpec, type LayoutNode, type LeafNode, type ContainerNode, type StackNode, type LayoutChild } from './layoutSpec.js';
import type { ResolvedContent } from './composeFromSolved.js';

/** What the caller wants kept that would otherwise be pruned. Threaded as an object
 *  rather than positional booleans — two adjacent `boolean` parameters in a recursive
 *  walk is a swap waiting to happen. */
interface PruneOpts {
  keepWhitespace: boolean;
  keepImagePlaceholders: boolean;
}

/** Does a non-shape leaf carry real, renderable content? (Shapes are decided by
 *  their stack context, never in isolation — see pruneStack.) */
function leafHasContent(leaf: LeafNode, content: ResolvedContent, opts: PruneOpts): boolean {
  const c = content[leaf.contentRef ?? ''];
  switch (leaf.role) {
    case 'image':
      // A photo that failed to load (shapeFill only) does NOT count — for the
      // GENERATOR, whose job is to fill a page it invented, and which would rather
      // re-partition than hold open a box for a picture it never got.
      //
      // `keepImagePlaceholders` inverts that for the layout-from-reference path,
      // where the box is the point: the user asked for THIS composition, and a
      // magazine with fewer photos than its reference is ordinary. composeFromSolved
      // already paints such a leaf as a tinted block.
      if (opts.keepImagePlaceholders && !!c?.shapeFill) return true;
      return !!c?.image?.url;
    case 'qr':
      return !!c?.qrUrl;
    case 'icon':
      return !!(leaf.iconName || c?.iconName); // glyph is authored on the leaf
    case 'shape':
      return false; // never a standalone survivor
    case 'spacer':
      return false; // emptiness is not content — see carriesContent
    default:
      // An ornament glyph ("“", "01") is authored on the leaf and needs no copy.
      if (leaf.glyph && leaf.glyph.trim()) return true;
      return !!(c?.text && c.text.trim()); // text roles
  }
}

/**
 * Is there anything to LOOK AT in here?
 *
 * A spacer survives pruning by design, so "this container still has children" stopped
 * being the same question as "this container still has content". A col of nothing but
 * spacers is dead space that would hold open a share of the page and render nothing —
 * exactly the defect pruneSpec exists to remove — so it has to be dropped.
 */
function carriesContent(node: LayoutNode): boolean {
  // A rule decorates content; on its own (or beside nothing but spacers) it is a line
  // across an empty region, which is exactly the dead space this pass removes.
  if (node.kind === 'leaf') return node.role !== 'spacer' && !isRuleLeaf(node);
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.some(carriesContent);
}

/** Prefer to stretch a prose-ish child (body/quote/etc.) when filling a track. */
function containsProse(node: LayoutNode): boolean {
  if (node.kind === 'leaf') return ['body', 'pullquote', 'entry', 'caption', 'subhead'].includes(node.role);
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.some(containsProse);
}

// ── Orphaned section heads ──────────────────────────────────────────────────
//
// A repeated section — "date / VENUE / body", three times down a page — whose BODY came
// back empty used to lose only the body: its date line and venue heading stayed, sat on
// top of nothing, and read as a story the page forgot to print (a real issue shipped
// "Trentham" exactly so). The copywriter is now required to fill every body column
// (generate.ts draftGaps); this is the deterministic half: when a body is pruned and the
// SAME heading pattern elsewhere in the container still has its body, the stranded
// heading goes too. A heading with no sibling section to compare against — a page's own
// masthead over an empty body — is never touched: that is the page, not an orphan.

const HEAD_ROLES = new Set<string>(['kicker', 'subhead', 'headline', 'label', 'caption', 'figure', 'byline']);

function realLeaves(node: LayoutNode): LeafNode[] {
  if (node.kind === 'leaf') return node.role === 'spacer' ? [] : [node];
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.flatMap(realLeaves);
}
const holdsBody = (node: LayoutNode) => realLeaves(node).some((l) => l.role === 'body');
const isHeadLeaf = (node: LayoutNode): node is LeafNode => node.kind === 'leaf' && HEAD_ROLES.has(node.role);
const headSignature = (node: LayoutNode) => realLeaves(node).filter((l) => l.role !== 'body').map((l) => l.role).join(',');

/** Indices into `kids` of section heads stranded by a pruned body (see above). */
function orphanedHeads(original: LayoutChild[], kept: (LayoutChild | null)[], kids: LayoutChild[]): Set<number> {
  const out = new Set<number>();
  const kidIndex = new Map<LayoutChild, number>();
  kids.forEach((k, i) => kidIndex.set(k, i));

  // Flat sections: a run of head leaves, closed by a body leaf (kept or pruned).
  const sections: { heads: number[]; bodyKept: boolean }[] = [];
  let run: number[] = [];
  let afterPhoto = false;
  original.forEach((child, i) => {
    const k = kept[i];
    const isBody = child.node.kind === 'leaf' && child.node.role === 'body';
    if (isBody) {
      sections.push({ heads: run, bodyKept: !!k });
      run = [];
    } else if (k && isHeadLeaf(k.node) && !(afterPhoto && k.node.role === 'caption')) {
      run.push(kidIndex.get(k)!);
    } else if (k) {
      run = []; // a photo, its own caption, or a container breaks the run
    }
    if (k) afterPhoto = k.node.kind === 'leaf' && k.node.role === 'image';
  });
  const sig = (heads: number[]) => heads.map((i) => (kids[i]!.node as LeafNode).role).join(',');
  const complete = new Set(sections.filter((s) => s.bodyKept && s.heads.length > 0).map((s) => sig(s.heads)));
  for (const s of sections) {
    if (!s.bodyKept && s.heads.length > 0 && complete.has(sig(s.heads))) s.heads.forEach((i) => out.add(i));
  }

  // Nested sections: a child container that HAD a body and is now nothing but heads,
  // beside a sibling of the same shape that kept its body.
  original.forEach((child, i) => {
    const k = kept[i];
    if (!k || child.node.kind === 'leaf' || !holdsBody(child.node) || holdsBody(k.node)) return;
    const leaves = realLeaves(k.node);
    if (leaves.length === 0 || !leaves.every((l) => HEAD_ROLES.has(l.role))) return;
    const mine = headSignature(k.node);
    const twin = kids.some((o) => o !== k && holdsBody(o.node) && headSignature(o.node) === mine);
    if (twin) out.add(kidIndex.get(k)!);
  });
  return out;
}

function pruneContainer(node: ContainerNode, content: ResolvedContent, opts: PruneOpts): ContainerNode | null {
  const kept: (LayoutChild | null)[] = [];
  for (const child of node.children) {
    const pn = pruneNode(child.node, content, opts, true);
    kept.push(pn ? { ...child, node: pn } : null);
  }
  let kids = kept.filter((k): k is LayoutChild => k !== null);
  const orphans = orphanedHeads(node.children, kept, kids);
  if (orphans.size > 0) kids = kids.filter((_, i) => !orphans.has(i));
  if (kids.length === 0) return null;
  // Spacers alone are not a container: they would hold open a share of the page and draw
  // nothing, which is the very thing this pass exists to delete.
  if (!kids.some((k) => carriesContent(k.node))) return null;

  // FR-GUARANTEE: the solver only spreads leftover length onto `fr` tracks. If a
  // start-packed container has ONLY content-sized children after pruning, the
  // remainder trails as an uncovered strip. Promote one child to `fr` so the
  // track fills. `end`/`center`/`between` intentionally anchor whitespace — leave
  // those alone. (Undefined sizing already means `fr`, so this only triggers when
  // every survivor is explicitly `content`.)
  //
  // …UNLESS the caller says the whitespace is the point. The generator must fill the
  // page (its art-director is told never to leave a large empty region), but a layout
  // copied from a REFERENCE is the opposite case: a magazine cover's empty lower half
  // is the design. Promoting a track there stretched the tagline of a cover over 66%
  // of the sheet — the whole reason this flag exists. See
  // docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md.
  const justifyStart = !node.justify || node.justify === 'start';
  const anyFr = kids.some((c) => (c.sizing ?? 'fr') === 'fr');
  if (justifyStart && !anyFr && !opts.keepWhitespace) {
    // Never a rule or a spacer: a rule is its thickness whatever its sizing says, so
    // promoting one would leave the strip trailing exactly as before.
    const promotable = (k: LayoutChild) => !isRuleLeaf(k.node) && !(k.node.kind === 'leaf' && k.node.role === 'spacer');
    let idx = -1;
    for (let i = kids.length - 1; i >= 0; i--) {
      if (promotable(kids[i]!) && containsProse(kids[i]!.node)) { idx = i; break; }
    }
    if (idx < 0) for (let i = kids.length - 1; i >= 0; i--) if (promotable(kids[i]!)) { idx = i; break; }
    if (idx < 0) idx = kids.length - 1;
    kids[idx] = { ...kids[idx]!, sizing: 'fr', weight: kids[idx]!.weight ?? 1 };
  }
  return { ...node, children: kids };
}

function pruneStack(node: StackNode, content: ResolvedContent, opts: PruneOpts): StackNode | null {
  const n = node.layers.length;
  const resolved: (LayoutNode | null)[] = new Array(n).fill(null);
  const survivingImage: boolean[] = new Array(n).fill(false);

  // Pass 1 — resolve every NON-shape layer; note which positions hold a real image.
  node.layers.forEach((layer, i) => {
    if (layer.kind === 'leaf' && layer.role === 'shape') return; // decided in pass 2
    const pn = pruneNode(layer, content, opts, false);
    resolved[i] = pn;
    if (pn && layer.kind === 'leaf' && layer.role === 'image') survivingImage[i] = true;
  });

  // Pass 2 — decide shape layers from their position in the stack.
  node.layers.forEach((layer, i) => {
    if (!(layer.kind === 'leaf' && layer.role === 'shape')) return;
    const contentAbove = resolved.some((p, j) => p !== null && j > i);
    if (i === 0) {
      // PANEL (drawn first, behind): keep only if a layer above still has content.
      if (contentAbove) resolved[i] = layer;
    } else if (survivingImage.some((v, j) => v && j < i)) {
      // SCRIM (drawn over): keep only if a surviving IMAGE sits below it.
      resolved[i] = layer;
    } else if (layer.place && contentAbove) {
      // A PLACED block (a colour tab behind a headline, a band across a panel) is a
      // panel of its own rectangle: it lives while something is drawn on top of it.
      resolved[i] = layer;
    }
  });

  const layers = resolved.filter((p): p is LayoutNode => p !== null);
  if (layers.length === 0) return null;
  // Nothing but backing left (a panel whose words all came back empty) is not a stack.
  if (!layers.some(carriesContent)) return null;
  return { ...node, layers };
}

/** `inFlow` = this node is a row/col CHILD rather than a stack layer or the root. Only a
 *  container child can be a spacer: as a stack layer it would cover the whole rectangle
 *  and draw nothing, and as the root it would be a page with nothing on it. */
function pruneNode(node: LayoutNode, content: ResolvedContent, opts: PruneOpts, inFlow: boolean): LayoutNode | null {
  if (node.kind === 'leaf') {
    if (node.role === 'spacer') return inFlow ? node : null;
    // A RULE in flow is a device (a line between sections, beside a pull quote); its
    // container decides whether it survives (carriesContent ignores rules).
    if (node.role === 'shape') return inFlow && isRuleLeaf(node) ? node : null; // a bare block in flow is dead space
    return leafHasContent(node, content, opts) ? node : null;
  }
  if (node.kind === 'stack') return pruneStack(node, content, opts);
  return pruneContainer(node, content, opts);
}

/**
 * Drop every leaf that resolved to no real content (and any container/stack left
 * empty as a result), returning a spec whose leaves all carry content — or null
 * if nothing real remains (the caller then falls back to the fixed-template
 * path). The result is still a valid LayoutSpec: containers keep ≥1 child, stacks
 * keep ≥1 layer, and every start-packed container keeps ≥1 fr track, so the
 * unchanged solver tiles it exactly with no gaps and no orphan tint.
 *
 * `keepWhitespace` turns that last guarantee OFF, and only the layout-from-reference
 * path sets it: there, a container packed at the start with content-sized children is
 * expressing the reference's own empty space, and filling it is the bug rather than
 * the fix (see the note on the FR-GUARANTEE above).
 */
export function pruneLayoutSpec(
  spec: LayoutSpec,
  content: ResolvedContent,
  opts?: { keepWhitespace?: boolean; keepImagePlaceholders?: boolean },
): LayoutSpec | null {
  const root = pruneNode(spec.root, content, { keepWhitespace: opts?.keepWhitespace === true, keepImagePlaceholders: opts?.keepImagePlaceholders === true }, false);
  if (!root) return null;
  return { page: spec.page, root };
}
