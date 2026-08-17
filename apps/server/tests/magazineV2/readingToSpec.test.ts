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
import { normalizeLayoutSpec, MAX_TREE_DEPTH, MAX_LEAVES, MAX_CHILDREN, MAX_SPACE_PX } from '../../src/lib/magazineV2/layoutSpec.ts';
import { normalizeLayoutReading, type LayoutReading, type ReadRegion } from '../../src/lib/magazineV2/layoutReading.ts';
import { pruneLayoutSpec } from '../../src/lib/magazineV2/pruneSpec.ts';
import { solveLayout } from '../../src/lib/magazineV2/solveLayout.ts';
import { makeMeasureLeaf } from '../../src/lib/magazineV2/measureLeaf.ts';
import { PAGE_H, PAGE_W } from '../../src/lib/magazineV2/config.ts';
import type { ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.ts';
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

test('a cluster with an EMPTY half is content-sized and pushed to its end', () => {
  // The cover shape. fr weights always fill their container, so bands covering the top
  // quarter would be stretched down the whole page — the bug that put a magazine
  // masthead across the middle of the sheet. Content-sizing is what gives the solver
  // leftover to leave empty, and `justify` is what decides which end keeps it.
  const spec = toSpec(read([
    { role: 'kicker', box: box(0.1, 0.03, 0.8, 0.03) },
    { role: 'headline', box: box(0.08, 0.09, 0.84, 0.1) },
    { role: 'subhead', box: box(0.3, 0.21, 0.4, 0.03) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  if (spec.root.kind !== 'col') return;
  assert.deepEqual(spec.root.children.map((c) => c.sizing), ['content', 'content', 'content']);
  assert.equal(spec.root.justify, 'start', 'the cluster belongs at the top, where it was');
  assert.notEqual(spec.root.pad, undefined, 'and the margin above it is kept');
});

test('a cluster in the MIDDLE keeps its empty space at both ends', () => {
  // EITHER MECHANISM IS ALLOWED HERE, and the test says so deliberately. A centred
  // cluster's margin is min(lead, trail), which on a full page is ~700px — past what a
  // `pad` can express — so this shape now goes through spacers rather than
  // content-size + justify:'center'. The old assertion pinned the mechanism and broke
  // on a change that measured strictly BETTER (46.9% → 77.2% fidelity on this shape).
  // What must never change is the property in the test's own name.
  const regions = [
    { role: 'headline', box: box(0.1, 0.4, 0.8, 0.08) },
    { role: 'subhead', box: box(0.1, 0.5, 0.8, 0.05) },
  ];
  const spec = toSpec(read(regions));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  if (spec.root.kind !== 'col') return;
  const viaJustify = spec.root.justify === 'center';
  const viaSpacers = spec.root.children.filter((c) => c.node.kind === 'leaf' && c.node.role === 'spacer').length === 2;
  assert.ok(viaJustify || viaSpacers, 'the empty space is expressed one way or the other');

  const boxes = solvedBoxes(regions);
  const text = boxes.filter((b) => b.role !== 'spacer');
  assert.equal(text.length, 2, 'both lines reached the page');
  const top = Math.min(...text.map((t) => t.y));
  const bottom = Math.max(...text.map((t) => t.y + t.h));
  assert.ok(top >= 0.25, `the cluster starts at ${(top * 100).toFixed(0)}% — space above it was lost`);
  assert.ok(bottom <= 0.75, `the cluster ends at ${(bottom * 100).toFixed(0)}% — space below it was lost`);
});

test('ordinary MARGINS are not empty space — those bands still fill the page', () => {
  // 10% clear at the top and 10% at the bottom is a margin, not a design decision.
  // Summing the two ends (rather than taking the larger) is what made the first
  // version of this rule content-size a perfectly normal page.
  const spec = toSpec(read([
    { role: 'headline', box: box(0.1, 0.1, 0.8, 0.1) },
    { role: 'body', box: box(0.1, 0.25, 0.8, 0.65) },
  ]));
  assert.ok(spec);
  assert.equal(spec.root.kind, 'col');
  if (spec.root.kind !== 'col') return;
  assert.deepEqual(spec.root.children.map((c) => c.sizing), ['fr', 'fr']);
  assert.equal(spec.root.justify, undefined);
});

test('short text takes the alignment its POSITION implies', () => {
  // The cross axis cannot be expressed structurally — a band always spans the full
  // width — so a cover line that sat on the right becomes right-aligned text in a
  // full-width box, which looks the same.
  const spec = toSpec(read([
    { role: 'image', box: box(0, 0, 1, 0.6) },
    { role: 'headline', box: box(0.55, 0.65, 0.4, 0.1) },
    { role: 'caption', box: box(0.05, 0.8, 0.3, 0.05) },
  ]));
  assert.ok(spec);
  const byRole = new Map(leaves(spec.root).map((l) => [l.kind === 'leaf' ? l.role : '', l]));
  const head = byRole.get('headline');
  const cap = byRole.get('caption');
  assert.equal(head?.kind === 'leaf' ? head.align : undefined, 'right');
  assert.equal(cap?.kind === 'leaf' ? cap.align : undefined, 'left');
});

test('PROSE is never realigned by position — a right-hand column stays left-aligned', () => {
  const spec = toSpec(read([
    { role: 'body', box: box(0.05, 0.1, 0.4, 0.8) },
    { role: 'body', box: box(0.55, 0.1, 0.4, 0.8) },
  ]));
  assert.ok(spec);
  for (const l of leaves(spec.root)) {
    assert.equal(l.kind === 'leaf' ? l.align : undefined, undefined, 'right-aligned paragraphs look broken');
  }
});

test('every band is fr-weighted when they fill the space — content-sizing would discard the proportions', () => {
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
  // A scrim is decorative backing whatever its measured size, so it stays a layer — only
  // PHOTOGRAPHS are size-tested, because a layer is handed the whole rectangle and an inset
  // photo blown up to full bleed hides the hero underneath it.
  assert.equal(spec.root.layers[0]!.kind, 'leaf');
  assert.equal(spec.root.layers[1]!.kind, 'leaf');
  // The headline sat at y 0.7, and a stack layer gets the WHOLE rectangle — so the content
  // layer is a col that holds it down there with a spacer, rather than a bare leaf stretched
  // over the entire page.
  assert.equal(spec.root.layers[2]!.kind, 'col', 'the single line is positioned, not stretched');
  // A spacer either side: the line sat at y 0.70–0.85, so there is empty space above it AND
  // below it, and both are part of where it sits.
  assert.deepEqual(roles(spec.root), ['image', 'shape', 'spacer', 'headline', 'spacer']);
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

// ── The cover bug, as a FAMILY (docs/MAGAZINE-V2-BUILDER-PLAN.md §11.1) ───────
//
// A cluster of type in the top quarter of a full-bleed photo was stretched over the whole
// page three separate times, each fix escaping somewhere new. The DSL simply had no way to
// say "this space is empty on purpose": `justify` is honoured only when every track is
// content-sized, content sizing is a no-op on image/qr/icon leaves, and `pad` stops at 96px
// while a half-empty page needs ~1,200. These four tests are the four shapes that reached
// the escape, so the family is covered rather than the example.

/** Every leaf's fraction-of-page box after a real solve. */
const solvedBoxes = (regions: Parameters<typeof read>[0], margin = 'none') => {
  const spec = normalizeLayoutSpec(toSpec(read(regions, { margin: margin as never }))!)!;
  const content: ResolvedContent = {};
  for (const s of specContentRefs(spec)) {
    content[s.ref] = s.role === 'image'
      ? { image: { url: 'https://x/p.jpg', assetId: 'a', alt: '' } }
      : { text: 'A Line Of Type' };
  }
  const pruned = pruneLayoutSpec(spec, content, { keepWhitespace: true })!;
  const solved = solveLayout(pruned, { width: PAGE_W, height: PAGE_H }, {
    measureLeaf: makeMeasureLeaf(content, { display: 'Playfair Display, serif', body: 'Inter, Arial, sans-serif' }),
  });
  return solved.leaves
    .filter((l) => l.node.role !== 'spacer')
    .map((l) => ({ role: l.node.role, y: l.box.y / PAGE_H, h: l.box.h / PAGE_H }));
};

/** Nothing that is not the photo may reach below this — the cluster is in the top third. */
const assertClustered = (boxes: { role: string; y: number; h: number }[], where: string) => {
  for (const b of boxes) {
    if (b.role === 'image') continue;
    assert.ok(b.h <= 0.3, `${where}: a ${b.role} box is ${(b.h * 100).toFixed(0)}% of the page tall`);
    assert.ok(b.y + b.h <= 0.55, `${where}: a ${b.role} ends at ${((b.y + b.h) * 100).toFixed(0)}% — it left the cluster`);
  }
};

test('ENTRANCE 1 — one line of type over a full-bleed photo keeps its place', () => {
  // `stackFor` used to short-circuit to a bare leaf when there was exactly one content
  // region, and a stack layer is handed the whole rectangle: the title of a cover became a
  // page-height text box. This is the single commonest magazine idiom there is.
  const boxes = solvedBoxes([
    { role: 'image', box: box(0, 0, 1, 1) },
    { role: 'headline', box: box(0.08, 0.78, 0.6, 0.12) },
  ]);
  const headline = boxes.find((b) => b.role === 'headline')!;
  assert.ok(headline.h <= 0.3, `the headline is ${(headline.h * 100).toFixed(0)}% of the page tall`);
  assert.ok(headline.y > 0.5, `it sat at y 0.78 and came out at ${headline.y.toFixed(2)} — it must stay low`);
});

test('ENTRANCE 2 — a SIDE-BY-SIDE pair in the cluster (the reported bug)', () => {
  // An issue number and a price beside each other make that band a CONTAINER, and content
  // sizing is ignored for containers, so `justify` stopped working and the cluster stretched.
  // Measured before the fix: the masthead came out 1060px tall on a 1650px page.
  assertClustered(solvedBoxes([
    { role: 'image', box: box(0, 0, 1, 1) },
    { role: 'headline', box: box(0.08, 0.04, 0.84, 0.08) },
    { role: 'kicker', box: box(0.08, 0.15, 0.34, 0.04) },
    { role: 'label', box: box(0.58, 0.15, 0.34, 0.04) },
  ]), 'side-by-side pair');
});

test('ENTRANCE 3 — an IMAGE inside the cluster', () => {
  // `sizing:'content'` is a no-op on an image leaf (measureLeaf returns null for anything
  // that is not text), so one small photo among the type took an fr share and swallowed the
  // whole empty half.
  const boxes = solvedBoxes([
    { role: 'image', box: box(0, 0, 1, 1) },
    { role: 'headline', box: box(0.08, 0.04, 0.84, 0.08) },
    { role: 'image', box: box(0.35, 0.15, 0.3, 0.06) },
  ]);
  assertClustered(boxes, 'image in the cluster');
  // …and the INSET photo is the thing that swallowed it, so it has to be checked by name.
  // assertClustered skips images (the full-bleed hero is legitimately page-height), which
  // made the first version of this test pass with the bug re-planted.
  const inset = boxes.filter((b) => b.role === 'image').sort((a, b) => a.h - b.h)[0]!;
  assert.ok(inset.h <= 0.3, `the inset photo is ${(inset.h * 100).toFixed(0)}% of the page tall`);
  assert.ok(inset.y + inset.h <= 0.55, `it ends at ${((inset.y + inset.h) * 100).toFixed(0)}% — it left the cluster`);
});

// ── The offset a pad has to be able to say ───────────────────────────────────
//
// `anchored`'s all-text branch is the ONE code path that can express "this cluster sat
// here and not there". It used to say the offset with `spaceTokenFor`, which can only
// return a token, and the scale stops at xl = 96px — so every offset past 96px was
// silently pinned to 96px. On a lower-third cover (the second commonest cover idiom
// there is) that put the whole title block at the TOP of the page: measured 6.1%,
// verdict "loose", the kicker and headline both at IoU 0.00 on A4 and on Letter alike.
// It is a plain number now, which the DSL has accepted since `Space = SpaceToken | number`.

/** Every `pad` in a spec, so a test can assert the MECHANISM and not just the outcome. */
const padsIn = (node: LayoutNode, out: unknown[] = []): unknown[] => {
  if (node.kind === 'leaf') return out;
  if (node.kind === 'stack') { node.layers.forEach((l) => padsIn(l, out)); return out; }
  if (node.pad !== undefined) out.push(node.pad);
  node.children.forEach((c) => padsIn(c.node, out));
  return out;
};

test('a title block anchored to the FOOT of the reference stays at the foot', () => {
  const regions = [
    { role: 'image', box: box(0, 0, 1, 1) },            // full-bleed cover photo
    { role: 'kicker', box: box(0.1, 0.6, 0.8, 0.03) },
    { role: 'headline', box: box(0.08, 0.65, 0.84, 0.12) },
    { role: 'subhead', box: box(0.3, 0.8, 0.4, 0.05) },
  ];
  // The offset this fixture needs is 0.15 × PAGE_H ≈ 263px — comfortably past the 96px
  // the token scale tops out at, which is the whole point of the fixture.
  const wanted = Math.round(0.15 * PAGE_H);
  assert.ok(wanted > 96, `the fixture must need more than a token can say (wants ${wanted}px)`);

  const pads = padsIn(normalizeLayoutSpec(toSpec(read(regions, { margin: 'md' }))!)!.root);
  assert.ok(
    pads.some((p) => typeof p === 'number' && p > 96),
    `the offset must survive as a number, not a token — got ${JSON.stringify(pads)}`,
  );

  const boxes = solvedBoxes(regions, 'md');
  const text = boxes.filter((b) => b.role !== 'image');
  assert.equal(text.length, 3, 'all three lines reached the page');
  for (const t of text) {
    assert.ok(t.y >= 0.45, `${t.role} starts at ${(t.y * 100).toFixed(0)}% — the cluster belongs in the LOWER half`);
  }
  const lowest = Math.max(...text.map((t) => t.y + t.h));
  assert.ok(lowest >= 0.72, `the cluster ends at ${(lowest * 100).toFixed(0)}% — it should sit near the foot`);
  assert.ok(lowest <= 0.99, `the cluster ends at ${(lowest * 100).toFixed(0)}% — it must not be jammed off the sheet`);
});

test('an offset too big for a pad falls through to spacers instead of being clamped', () => {
  // Past MAX_SPACE_PX a pad cannot say the offset either, so `anchored` hands the case to
  // the spacer mechanism, which has no ceiling. Clamping instead would re-create the very
  // bug above, one order of magnitude up.
  //
  // THE FIXTURE HAS TO BE OFF-CENTRE. The obvious one — a cluster centred on the page —
  // is useless here and the first version of this test used it and PASSED with the bug
  // re-planted: a clamped `justify: 'center'` still lands a centred cluster in the middle,
  // so the fixture could not tell truncation from fidelity. This one is top-weighted:
  // lead 0.25 (438px, past the ceiling) against a trail twice its size, so `justify` is
  // 'start' and a clamp visibly yanks the cluster to the top of the sheet.
  const regions = [
    { role: 'image', box: box(0, 0, 1, 1) },
    { role: 'headline', box: box(0.1, 0.25, 0.8, 0.08) },
    { role: 'subhead', box: box(0.2, 0.35, 0.6, 0.04) },
  ];
  const wanted = Math.round(0.25 * PAGE_H);
  assert.ok(wanted > MAX_SPACE_PX, `the fixture must exceed the pad ceiling (wants ${wanted}px)`);

  const boxes = solvedBoxes(regions, 'md');
  const head = boxes.find((b) => b.role === 'headline');
  assert.ok(head, 'the headline reached the page');
  assert.ok(
    head.y >= 0.18,
    `the headline starts at ${(head.y * 100).toFixed(0)}% — the reference had it at 25%, and a truncated offset drags it to the top`,
  );
  assert.ok(head.y <= 0.4, `the headline starts at ${(head.y * 100).toFixed(0)}% — it should not drift down the page either`);
});

test('ENTRANCE 4 — an inset photo is not blown up to full bleed over the hero', () => {
  // Every layer of a stack gets the whole rectangle, so a photo covering a third of the
  // reference came out full-bleed ON TOP of the hero and hid it.
  const boxes = solvedBoxes([
    { role: 'image', box: box(0, 0, 1, 1) },
    { role: 'image', box: box(0.1, 0.55, 0.5, 0.3) },
    { role: 'headline', box: box(0.08, 0.1, 0.84, 0.1) },
  ]);
  const images = boxes.filter((b) => b.role === 'image');
  assert.equal(images.length, 2, 'both photos are on the page');
  assert.equal(images.filter((i) => i.h > 0.9).length, 1, 'exactly ONE photo is full-bleed');
});

// ── BAND HEIGHT (the fix after Fix 1c) ───────────────────────────────────────
//
// Fix 1c measured that EVERY remaining "loose" fidelity verdict was the same
// shape: many small text bands, content-sized to ~40px of copy where the
// reference gave them ~105px. The heights were read correctly and carried in
// `origin`, then thrown away wherever sizing flipped to 'content'. `minPx` now
// carries the reference's own extent as the track's floor.

test('an anchored text cluster keeps the reference band heights, not its copy height', () => {
  // Three entry bands in the top third — lead 10% (pad, ≤ MAX_SPACE_PX), big
  // empty bottom → `anchored` flips them all to content sizing. Each band is
  // 7% of the page ≈ 123px on A4; a single line of copy measures ~40px, which
  // is what these bands used to collapse to.
  const boxes = solvedBoxes([
    { role: 'entry', box: box(0.1, 0.10, 0.8, 0.07) },
    { role: 'entry', box: box(0.1, 0.20, 0.8, 0.07) },
    { role: 'entry', box: box(0.1, 0.30, 0.8, 0.07) },
  ]);
  const entries = boxes.filter((b) => b.role === 'entry');
  assert.equal(entries.length, 3);
  for (const e of entries) {
    // ≥ 5.5% of the page each (reference asked 7%; pad/rounding eat a little) —
    // the collapsed version measured ~2.3%.
    assert.ok(e.h >= 0.055, `entry band h=${(e.h * 100).toFixed(1)}% collapsed below its reference height`);
  }
});

test('band heights survive normalize + prune on the apply path', () => {
  // The same shape but asserted at the spec level: the converter emits minPx on
  // content children, the trust boundary keeps it, and pruning copies it through.
  const spec0 = toSpec(read([
    { role: 'headline', box: box(0.1, 0.08, 0.8, 0.12) },
    { role: 'subhead', box: box(0.1, 0.22, 0.8, 0.05) },
  ]));
  assert.ok(spec0);
  const spec = normalizeLayoutSpec(spec0)!;
  const content: ResolvedContent = { headline: { text: 'A Line' }, subhead: { text: 'Another' } };
  const pruned = pruneLayoutSpec(spec, content, { keepWhitespace: true })!;
  const mins: number[] = [];
  const walk = (n: LayoutNode): void => {
    if (n.kind === 'leaf') return;
    if (n.kind === 'stack') { n.layers.forEach(walk); return; }
    for (const c of n.children) {
      if (typeof c.minPx === 'number' && c.sizing === 'content') mins.push(c.minPx);
      walk(c.node);
    }
  };
  walk(pruned.root);
  assert.ok(mins.length >= 2, `expected minPx on the content children, found ${mins.length}`);
  assert.ok(mins.some((m) => m >= Math.round(0.12 * PAGE_H) - 2), 'the headline band carries its reference height');
});
