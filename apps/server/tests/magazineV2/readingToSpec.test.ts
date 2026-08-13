// The guillotine: LayoutReading → LayoutSpec (P2 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// This is the deterministic half of "take this layout", so it is testable in a way
// the vision call never will be: give it the boxes a reader WOULD produce for a
// known layout and assert the tree. The cases below are real magazine shapes — a
// full-bleed cover, a two-column feature, a stat band — plus the ones that must
// degrade rather than lie.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readingToSpec, specContentRefs } from '../../src/lib/magazineV2/readingToSpec.ts';
import { normalizeLayoutSpec, MAX_TREE_DEPTH, MAX_LEAVES, MAX_CHILDREN } from '../../src/lib/magazineV2/layoutSpec.ts';
import { normalizeLayoutReading, type LayoutReading, type ReadRegion } from '../../src/lib/magazineV2/layoutReading.ts';
import type { LayoutNode } from '../../src/lib/magazineV2/layoutSpec.ts';

/** The converter returns the spec AND where each slot came from (P3 needs that
 *  provenance to measure the result). These tests are about the TREE, so they
 *  unwrap it; the origin map has its own tests in layoutFidelity.test.ts. */
const toSpec = (r: LayoutReading) => readingToSpec(r)?.spec ?? null;

const read = (regions: Partial<ReadRegion>[], extra: Record<string, unknown> = {}): LayoutReading => {
  const r = normalizeLayoutReading({ regions, ...extra });
  assert.ok(r, 'the fixture itself must be a valid reading');
  return r;
};
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

const leaves = (node: LayoutNode, out: LayoutNode[] = []): LayoutNode[] => {
  if (node.kind === 'leaf') out.push(node);
  else if (node.kind === 'stack') node.layers.forEach((l) => leaves(l, out));
  else node.children.forEach((c) => leaves(c.node, out));
  return out;
};
const depthOf = (node: LayoutNode): number => {
  if (node.kind === 'leaf') return 1;
  const kids = node.kind === 'stack' ? node.layers : node.children.map((c) => c.node);
  return 1 + Math.max(...kids.map(depthOf));
};
const roles = (node: LayoutNode) => leaves(node).map((l) => (l.kind === 'leaf' ? l.role : ''));

// ── The shapes that must come out right ──────────────────────────────────────

test('bands stacked down the page become a col, in order', () => {
  const spec = toSpec(read([
    { role: 'kicker', box: box(0.1, 0.06, 0.8, 0.04) },
    { role: 'headline', box: box(0.1, 0.12, 0.8, 0.14) },
    { role: 'image', box: box(0.1, 0.3, 0.8, 0.4) },
    { role: 'body', box: box(0.1, 0.74, 0.8, 0.2) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  assert.deepEqual(roles(spec.root), ['kicker', 'headline', 'image', 'body']);
});

test('side-by-side regions become a row', () => {
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 0.48, 1) },
    { role: 'body', box: box(0.52, 0, 0.48, 1) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'row');
  assert.equal(spec.root.children.length, 2);
});

test('a two-column feature: a headline band over two body columns', () => {
  const spec = toSpec(read([
    { role: 'headline', box: box(0.08, 0.08, 0.84, 0.12) },
    { role: 'body', box: box(0.08, 0.26, 0.4, 0.6) },
    { role: 'body', box: box(0.52, 0.26, 0.4, 0.6) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  const [first, second] = spec.root.kind === 'col' ? spec.root.children : [];
  assert.equal(first!.node.kind, 'leaf');
  assert.equal(second!.node.kind, 'row', 'the two body columns are a row inside the band');
});

test('band weights carry the reference proportions, not a guess', () => {
  // 60/40 in the picture has to be 60/40 in the spec: fidelity is the feature.
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.6) },
    { role: 'body', box: box(0, 0.6, 1, 0.4) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  const ws = spec.root.kind === 'col' ? spec.root.children.map((c) => c.weight) : [];
  assert.deepEqual(ws, [60, 40]);
});

test('every band is fr-weighted — content-sizing would discard the proportions', () => {
  const spec = toSpec(read([
    { role: 'headline', box: box(0.1, 0.1, 0.8, 0.1) },
    { role: 'body', box: box(0.1, 0.3, 0.8, 0.6) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  const sizings = spec.root.kind === 'col' ? spec.root.children.map((c) => c.sizing) : [];
  assert.deepEqual(sizings, ['fr', 'fr']);
});

test('text over a full-bleed photo becomes a stack: photo under ONE content layer', () => {
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 1), z: 0 },
    { role: 'kicker', box: box(0.1, 0.6, 0.5, 0.05), z: 1 },
    { role: 'headline', box: box(0.1, 0.67, 0.7, 0.12), z: 1 },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'stack');
  if (spec.root.kind !== 'stack') return;
  assert.equal(spec.root.layers.length, 2, 'backing + exactly one content layer');
  assert.equal(spec.root.layers[0]!.kind, 'leaf');
  assert.equal(spec.root.layers[1]!.kind, 'col', 'the two text lines flow down a col, not on top of each other');
});

test('a scrim between photo and text stays a backing layer', () => {
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 1), z: 0 },
    { role: 'shape', box: box(0, 0.5, 1, 0.5), z: 1 },
    { role: 'headline', box: box(0.1, 0.7, 0.8, 0.15), z: 2 },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'stack');
  if (spec.root.kind !== 'stack') return;
  assert.equal(spec.root.layers.length, 3);
  assert.deepEqual(roles(spec.root), ['image', 'shape', 'headline']);
});

test('NEVER two text layers on one rectangle', () => {
  // The bug layoutSpec.ts has a repair pass for. Producing it here would be walking
  // into it from the other side, so overlapping text with no backing flows down a col.
  const spec = toSpec(read([
    { role: 'headline', box: box(0.1, 0.4, 0.8, 0.2) },
    { role: 'subhead', box: box(0.15, 0.45, 0.7, 0.18) },
  ]));
  assert.ok(spec);
  assert.notEqual(spec.root.kind, 'stack');
  assert.equal(spec.root.kind, 'col');
});

test('a stat trio reads as a row of three', () => {
  const spec = toSpec(read([
    { role: 'figure', box: box(0.05, 0.4, 0.28, 0.12) },
    { role: 'figure', box: box(0.36, 0.4, 0.28, 0.12) },
    { role: 'figure', box: box(0.67, 0.4, 0.28, 0.12) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'row');
  assert.equal(spec.root.kind === 'row' ? spec.root.children.length : 0, 3);
});

// ── Tolerances ───────────────────────────────────────────────────────────────

test('a hair of measured overlap is treated as adjacency, not a stack', () => {
  // Vision readings are estimates. Insisting on exact edges would collapse an
  // ordinary photo-above-caption into an overlay.
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.605) },
    { role: 'caption', box: box(0, 0.6, 1, 0.1) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col', 'still two bands');
});

test('the gap between bands becomes a space token, not lost whitespace', () => {
  const tight = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.5) },
    { role: 'body', box: box(0, 0.505, 1, 0.495) },
  ]));
  const airy = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.4) },
    { role: 'body', box: box(0, 0.55, 1, 0.45) },
  ]));
  assert.ok(tight && airy);
  assert.equal(tight.root.kind, 'col');
  assert.equal(airy.root.kind, 'col');
  const g1 = tight.root.kind === 'col' ? tight.root.gap : undefined;
  const g2 = airy.root.kind === 'col' ? airy.root.gap : undefined;
  assert.equal(g1, 'none', 'touching bands get no gap');
  assert.notEqual(g2, 'none', 'a real 15% gap is real whitespace');
});

test('the page margin and ground come from the reading', () => {
  const dark = toSpec(read([{ role: 'image', box: box(0, 0, 1, 0.5) }, { role: 'body', box: box(0, 0.5, 1, 0.5) }], { margin: 'xl', background: 'dark' }));
  assert.ok(dark);
  assert.equal(dark.page?.margin, 'xl');
  assert.equal(dark.page?.background?.ref, 'text');

  const photo = toSpec(read([{ role: 'image', box: box(0, 0, 1, 0.5) }, { role: 'body', box: box(0, 0.5, 1, 0.5) }], { background: 'photo' }));
  assert.ok(photo);
  assert.equal(photo.page?.background?.ref, 'bg', 'a photo ground is the image region, not a page colour');
});

// ── Caps: the spec must always be one the solver accepts ─────────────────────

test('more bands than MAX_CHILDREN merge instead of truncating', () => {
  const many = Array.from({ length: MAX_CHILDREN + 4 }, (_, i) => ({
    role: 'body',
    box: box(0.1, i * (1 / (MAX_CHILDREN + 4)), 0.8, 1 / (MAX_CHILDREN + 4) - 0.01),
  }));
  const spec = toSpec(read(many));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  const n = spec.root.kind === 'col' ? spec.root.children.length : 0;
  assert.ok(n <= MAX_CHILDREN, `${n} children`);
  // Nothing was thrown away — the extra bands were folded into their neighbours.
  assert.equal(leaves(spec.root).length, many.length);
});

test('the output always survives the trust boundary and its caps', () => {
  // A deliberately awkward reading: deep nesting, overlaps, a long tail.
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.45) },
    { role: 'kicker', box: box(0.05, 0.05, 0.4, 0.04) },
    { role: 'headline', box: box(0.05, 0.1, 0.6, 0.1) },
    { role: 'byline', box: box(0.05, 0.5, 0.3, 0.03) },
    { role: 'body', box: box(0.05, 0.55, 0.42, 0.3) },
    { role: 'body', box: box(0.52, 0.55, 0.42, 0.3) },
    { role: 'pullquote', box: box(0.05, 0.87, 0.6, 0.08) },
    { role: 'qr', box: box(0.7, 0.87, 0.1, 0.1) },
    { role: 'caption', box: box(0.82, 0.87, 0.14, 0.05) },
  ]));
  assert.ok(spec);
  assert.ok(depthOf(spec.root) <= MAX_TREE_DEPTH, `depth ${depthOf(spec.root)}`);
  assert.ok(leaves(spec.root).length <= MAX_LEAVES);
  // normalizeLayoutSpec is the boundary every spec crosses. It must not have to
  // change ours: if it does, the guillotine emitted something the DSL disallows.
  const normalized = normalizeLayoutSpec(spec);
  assert.ok(normalized, 'a valid spec');
  assert.deepEqual(normalized, spec, 'and one that needed no repair');
});

test('a reading deeper than the depth budget still survives the normalizer intact', () => {
  // THE BUG THIS EXISTS FOR. normalizeLayoutSpec numbers the ROOT as depth 1 and
  // drops anything past MAX_TREE_DEPTH, so a container emitted one level too deep
  // does not fail loudly — every leaf inside it is silently deleted. The first
  // version of this converter got that off by one, and no fixture above went deep
  // enough to notice.
  //
  // This geometry forces row → col → row → (one level too far): two side-by-side
  // columns, the left split into bands, the top-left band split side-by-side again,
  // and one of THOSE split once more.
  const spec = toSpec(read([
    { role: 'headline', box: box(0.02, 0.02, 0.2, 0.1) },   // ┐ top-left, split again
    { role: 'kicker', box: box(0.02, 0.14, 0.2, 0.06) },    // ┘
    { role: 'image', box: box(0.26, 0.02, 0.2, 0.18) },     // top-right of the left column
    { role: 'body', box: box(0.02, 0.24, 0.44, 0.74) },     // bottom band of the left column
    { role: 'body', box: box(0.52, 0.02, 0.46, 0.96) },     // the whole right column
  ]));
  assert.ok(spec);
  assert.ok(depthOf(spec.root) <= MAX_TREE_DEPTH, `depth ${depthOf(spec.root)} exceeds the cap`);

  const normalized = normalizeLayoutSpec(spec);
  assert.ok(normalized);
  // The real assertion: the normalizer changed NOTHING. If it had to repair or drop,
  // the converter emitted a tree the DSL does not allow.
  assert.deepEqual(normalized, spec);
  assert.equal(leaves(normalized.root).length, leaves(spec.root).length, 'no leaf was silently deleted');
});

test('a pinwheel cannot be a frame-tree, and degrades rather than lying', () => {
  // Four regions each straddling the next's band: no cut exists in either axis.
  const spec = toSpec(read([
    { role: 'body', box: box(0, 0, 0.6, 0.6) },
    { role: 'body', box: box(0.4, 0, 0.6, 0.4) },
    { role: 'body', box: box(0.4, 0.4, 0.6, 0.6) },
    { role: 'body', box: box(0, 0.4, 0.4, 0.6) },
  ]));
  // It must still be a VALID spec — never null-with-a-broken-tree, never an overlap
  // the solver would have to fix. Fidelity is what suffers here, and P3 reports it.
  assert.ok(spec);
  assert.ok(normalizeLayoutSpec(spec), 'still a spec the solver can tile');
});

// ── contentRefs: the reflow depends on these names ───────────────────────────

test('the first photo is the hero, and refs are unique', () => {
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.4) },
    { role: 'image', box: box(0, 0.42, 0.48, 0.2) },
    { role: 'image', box: box(0.52, 0.42, 0.48, 0.2) },
    { role: 'body', box: box(0, 0.64, 1, 0.16) },
    { role: 'body', box: box(0, 0.82, 1, 0.16) },
  ]));
  assert.ok(spec);
  const refs = specContentRefs(spec).map((r) => r.ref);
  assert.equal(new Set(refs).size, refs.length, 'no duplicate contentRefs');
  assert.ok(refs.includes('hero'), 'the first photo is the hero the curator looks for');
  assert.ok(refs.includes('photo1') && refs.includes('photo2'));
  assert.ok(refs.includes('body') && refs.includes('body2'));
});

test('specContentRefs reaches leaves inside stacks', () => {
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 1) },
    { role: 'headline', box: box(0.1, 0.7, 0.8, 0.1) },
  ]));
  assert.ok(spec);
  const refs = specContentRefs(spec);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.role).sort(), ['headline', 'image']);
});
