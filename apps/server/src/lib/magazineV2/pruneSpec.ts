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

import type { LayoutSpec, LayoutNode, LeafNode, ContainerNode, StackNode, LayoutChild } from './layoutSpec.js';
import type { ResolvedContent } from './composeFromSolved.js';

/** Does a non-shape leaf carry real, renderable content? (Shapes are decided by
 *  their stack context, never in isolation — see pruneStack.) */
function leafHasContent(leaf: LeafNode, content: ResolvedContent): boolean {
  const c = content[leaf.contentRef ?? ''];
  switch (leaf.role) {
    case 'image':
      return !!c?.image?.url; // a photo that failed to load (shapeFill only) does NOT count
    case 'qr':
      return !!c?.qrUrl;
    case 'icon':
      return !!(leaf.iconName || c?.iconName); // glyph is authored on the leaf
    case 'shape':
      return false; // never a standalone survivor
    case 'spacer':
      return false; // emptiness is not content — see carriesContent
    default:
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
  if (node.kind === 'leaf') return node.role !== 'spacer';
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.some(carriesContent);
}

/** Prefer to stretch a prose-ish child (body/quote/etc.) when filling a track. */
function containsProse(node: LayoutNode): boolean {
  if (node.kind === 'leaf') return ['body', 'pullquote', 'entry', 'caption', 'subhead'].includes(node.role);
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return kids.some(containsProse);
}

function pruneContainer(node: ContainerNode, content: ResolvedContent, keepWhitespace: boolean): ContainerNode | null {
  const kids: LayoutChild[] = [];
  for (const child of node.children) {
    const pn = pruneNode(child.node, content, keepWhitespace, true);
    if (pn) kids.push({ ...child, node: pn });
  }
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
  if (justifyStart && !anyFr && !keepWhitespace) {
    let idx = kids.length - 1;
    for (let i = kids.length - 1; i >= 0; i--) {
      if (containsProse(kids[i]!.node)) { idx = i; break; }
    }
    kids[idx] = { ...kids[idx]!, sizing: 'fr', weight: kids[idx]!.weight ?? 1 };
  }
  return { ...node, children: kids };
}

function pruneStack(node: StackNode, content: ResolvedContent, keepWhitespace: boolean): StackNode | null {
  const n = node.layers.length;
  const resolved: (LayoutNode | null)[] = new Array(n).fill(null);
  const survivingImage: boolean[] = new Array(n).fill(false);

  // Pass 1 — resolve every NON-shape layer; note which positions hold a real image.
  node.layers.forEach((layer, i) => {
    if (layer.kind === 'leaf' && layer.role === 'shape') return; // decided in pass 2
    const pn = pruneNode(layer, content, keepWhitespace, false);
    resolved[i] = pn;
    if (pn && layer.kind === 'leaf' && layer.role === 'image') survivingImage[i] = true;
  });

  // Pass 2 — decide shape layers from their position in the stack.
  node.layers.forEach((layer, i) => {
    if (!(layer.kind === 'leaf' && layer.role === 'shape')) return;
    if (i === 0) {
      // PANEL (drawn first, behind): keep only if a layer above still has content.
      if (resolved.some((p, j) => p !== null && j > i)) resolved[i] = layer;
    } else {
      // SCRIM (drawn over): keep only if a surviving IMAGE sits below it.
      if (survivingImage.some((v, j) => v && j < i)) resolved[i] = layer;
    }
  });

  const layers = resolved.filter((p): p is LayoutNode => p !== null);
  if (layers.length === 0) return null;
  return { kind: 'stack', layers };
}

/** `inFlow` = this node is a row/col CHILD rather than a stack layer or the root. Only a
 *  container child can be a spacer: as a stack layer it would cover the whole rectangle
 *  and draw nothing, and as the root it would be a page with nothing on it. */
function pruneNode(node: LayoutNode, content: ResolvedContent, keepWhitespace: boolean, inFlow: boolean): LayoutNode | null {
  if (node.kind === 'leaf') {
    if (node.role === 'spacer') return inFlow ? node : null;
    if (node.role === 'shape') return null; // a bare shape in flow is dead space
    return leafHasContent(node, content) ? node : null;
  }
  if (node.kind === 'stack') return pruneStack(node, content, keepWhitespace);
  return pruneContainer(node, content, keepWhitespace);
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
  opts?: { keepWhitespace?: boolean },
): LayoutSpec | null {
  const root = pruneNode(spec.root, content, opts?.keepWhitespace === true, false);
  if (!root) return null;
  return { page: spec.page, root };
}
