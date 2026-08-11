// ---------------------------------------------------------------------------
// solveLayout — the pixel authority.
//
// These are the guarantees the whole AI-layout design rests on. They were stated
// only in comments before this file existed: "no overlap", "no off-page", "exact
// integer tiling", "never negative". If one of them breaks, generated pages get
// the seams / gaps / clipped boxes that the fixed-template fallback exists to
// avoid — and nothing would have told us.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveLayout, type Rect, type SolvedLeaf } from '../../src/lib/magazineV2/solveLayout.js';
import { MIN_SIZE } from '../../src/lib/magazineV2/model.js';
import type { LayoutNode, LayoutSpec } from '../../src/lib/magazineV2/layoutSpec.js';

const PAGE = { width: 1275, height: 1650 };

const leaf = (role: string, contentRef = role): LayoutNode =>
  ({ kind: 'leaf', role, contentRef }) as LayoutNode;

const spec = (root: LayoutNode, margin?: string): LayoutSpec =>
  ({ page: { background: { ref: 'bg' }, margin }, root }) as unknown as LayoutSpec;

/** Do two boxes share more than a shared edge? */
function overlaps(a: Rect, b: Rect): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0;
}

function assertIntegerBoxes(leaves: SolvedLeaf[]) {
  for (const l of leaves) {
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      assert.ok(Number.isInteger(l.box[k]), `${l.node.role}.${k} = ${l.box[k]} is not an integer`);
    }
  }
}

function assertInsidePage(leaves: SolvedLeaf[], page = PAGE) {
  for (const { node, box } of leaves) {
    assert.ok(box.x >= 0 && box.y >= 0, `${node.role} has a negative origin (${box.x},${box.y})`);
    assert.ok(box.w >= 0 && box.h >= 0, `${node.role} has a negative extent (${box.w}x${box.h})`);
    assert.ok(box.x + box.w <= page.width, `${node.role} runs off the right edge (${box.x}+${box.w})`);
    assert.ok(box.y + box.h <= page.height, `${node.role} runs off the bottom edge (${box.y}+${box.h})`);
  }
}

test('a col tiles its main axis EXACTLY — no gaps, no overlaps, last child on the edge', () => {
  const root = {
    kind: 'col',
    children: [
      { weight: 1, sizing: 'fr', node: leaf('headline') },
      { weight: 3, sizing: 'fr', node: leaf('body') },
      { weight: 2, sizing: 'fr', node: leaf('caption') },
    ],
  } as unknown as LayoutNode;

  // margin 'none' so the content rect is the whole page and the arithmetic is exact.
  const solved = solveLayout(spec(root, 'none'), PAGE);
  assert.equal(solved.leaves.length, 3);
  assertIntegerBoxes(solved.leaves);
  assertInsidePage(solved.leaves);

  const boxes = solved.leaves.map((l) => l.box).sort((a, b) => a.y - b.y);
  assert.equal(boxes[0]!.y, 0, 'first child must start at the content origin');
  for (let i = 1; i < boxes.length; i++) {
    assert.equal(boxes[i]!.y, boxes[i - 1]!.y + boxes[i - 1]!.h, `gap/overlap between child ${i - 1} and ${i}`);
  }
  const last = boxes[boxes.length - 1]!;
  assert.equal(last.y + last.h, PAGE.height, 'last child must land exactly on the parent edge');
});

test('weights with an indivisible total still tile exactly (the rounding case)', () => {
  // 3 tracks over 1650px does not divide evenly — this is where naive per-child
  // rounding leaves 1px seams or overshoots the parent.
  for (const n of [3, 7, 11, 13]) {
    const root = {
      kind: 'col',
      children: Array.from({ length: n }, () => ({ weight: 1, sizing: 'fr', node: leaf('body') })),
    } as unknown as LayoutNode;
    const solved = solveLayout(spec(root, 'none'), PAGE);
    assert.equal(solved.leaves.length, n, `${n} tracks should all survive`);
    assertIntegerBoxes(solved.leaves);
    assertInsidePage(solved.leaves);
    const boxes = solved.leaves.map((l) => l.box).sort((a, b) => a.y - b.y);
    for (let i = 1; i < boxes.length; i++) {
      assert.equal(boxes[i]!.y, boxes[i - 1]!.y + boxes[i - 1]!.h, `${n} tracks: seam at ${i}`);
    }
    const last = boxes[boxes.length - 1]!;
    assert.equal(last.y + last.h, PAGE.height, `${n} tracks: last child missed the edge`);
  }
});

test('nested rows inside cols stay non-overlapping and inside the page', () => {
  const root = {
    kind: 'col',
    gap: 'md',
    pad: 'lg',
    children: [
      { weight: 2, sizing: 'fr', node: leaf('headline') },
      {
        weight: 5,
        sizing: 'fr',
        node: {
          kind: 'row',
          gap: 'sm',
          children: [
            { weight: 1, sizing: 'fr', node: leaf('body', 'body') },
            { weight: 1, sizing: 'fr', node: leaf('body', 'body2') },
          ],
        },
      },
      { weight: 1, sizing: 'fr', node: leaf('byline') },
    ],
  } as unknown as LayoutNode;

  const solved = solveLayout(spec(root), PAGE);
  assert.equal(solved.leaves.length, 4);
  assertIntegerBoxes(solved.leaves);
  assertInsidePage(solved.leaves);

  for (let i = 0; i < solved.leaves.length; i++) {
    for (let j = i + 1; j < solved.leaves.length; j++) {
      assert.ok(
        !overlaps(solved.leaves[i]!.box, solved.leaves[j]!.box),
        `${solved.leaves[i]!.node.role} overlaps ${solved.leaves[j]!.node.role}`,
      );
    }
  }
});

test('stack layers share ONE rect and are z-ordered bottom-up', () => {
  const root = {
    kind: 'stack',
    layers: [leaf('image', 'hero'), leaf('shape', 'scrim'), leaf('headline')],
  } as unknown as LayoutNode;

  const solved = solveLayout(spec(root, 'none'), PAGE);
  assert.equal(solved.leaves.length, 3);
  const [first, ...rest] = solved.leaves;
  for (const l of rest) {
    assert.deepEqual(l.box, first!.box, 'every stack layer must occupy the identical rect');
  }
  // DFS pre-order → declaration order → later layers paint on top.
  assert.deepEqual(
    solved.leaves.map((l) => l.z),
    [0, 1, 2],
  );
});

test('padding and gaps that cannot fit never produce a negative length', () => {
  // 8 children with xl gaps (96px each = 672px) inside an xl-padded col on a tiny
  // page: gaps alone exceed the main length, so they must shrink, not go negative.
  const root = {
    kind: 'col',
    gap: 'xl',
    pad: 'xl',
    children: Array.from({ length: 8 }, () => ({ weight: 1, sizing: 'fr', node: leaf('body') })),
  } as unknown as LayoutNode;

  const tiny = { width: 60, height: 40 };
  const solved = solveLayout(spec(root, 'xl'), tiny);
  assertIntegerBoxes(solved.leaves);
  assertInsidePage(solved.leaves, tiny);
});

test('leaves solved below MIN_SIZE are dropped, not grown', () => {
  // 40 tracks over a 40px-tall page: each lands at ~1px, under MIN_SIZE (2).
  // Growing them downstream would break the no-overlap guarantee, so they go.
  const root = {
    kind: 'col',
    children: Array.from({ length: 40 }, () => ({ weight: 1, sizing: 'fr', node: leaf('body') })),
  } as unknown as LayoutNode;

  const solved = solveLayout(spec(root, 'none'), { width: 1275, height: 40 });
  for (const l of solved.leaves) {
    assert.ok(l.box.w >= MIN_SIZE && l.box.h >= MIN_SIZE, 'a sub-MIN_SIZE leaf survived the filter');
  }
  assert.ok(solved.leaves.length < 40, 'expected some leaves to be dropped');
});

test('the page margin insets the content rect on all four sides', () => {
  const solved = solveLayout(spec(leaf('headline'), 'xl'), PAGE);
  const box = solved.leaves[0]!.box;
  assert.equal(solved.margin, 96);
  assert.deepEqual(box, { x: 96, y: 96, w: PAGE.width - 192, h: PAGE.height - 192 });
});

test('solving is deterministic — the same spec yields byte-identical boxes', () => {
  const root = {
    kind: 'row',
    gap: 'sm',
    children: [
      { weight: 2, sizing: 'fr', node: leaf('image', 'hero') },
      { weight: 3, sizing: 'fr', node: leaf('body') },
    ],
  } as unknown as LayoutNode;
  const a = solveLayout(spec(root), PAGE);
  const b = solveLayout(spec(root), PAGE);
  assert.deepEqual(a.leaves.map((l) => l.box), b.leaves.map((l) => l.box));
});
