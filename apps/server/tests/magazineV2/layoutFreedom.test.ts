// ---------------------------------------------------------------------------
// The art-director's new decisions: type size in POINTS, exact colours, free spacing,
// caps and tracking — and the small number of things that are still not its call.
//
// Two properties are worth more than all the rest here:
//
//  1. NOTHING MOVES FOR A SPEC THAT DOESN'T OPT IN. Every one of these is optional, and
//     the seeds, the fixed templates and the layout-from-reference path author none of
//     them — so a leaf that says nothing about type must render exactly as it did.
//  2. THE FLOOR IS NOT A DECISION. Prose the reader cannot read is a defect however
//     confidently it was chosen; at 150 DPI a 4pt body is 8px on the page.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLayoutSpec, MAX_LEAVES, MAX_CHILDREN, MAX_TREE_DEPTH, MIN_PROSE_PT, resolveSpace, countLeaves } from '../../src/lib/magazineV2/layoutSpec.js';
import { solveLayout } from '../../src/lib/magazineV2/solveLayout.js';
import { composeFromSolved } from '../../src/lib/magazineV2/composeFromSolved.js';
import { ptToPx, ROLE_SCALE } from '../../src/lib/magazineV2/roleScale.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';
import type { LayoutSpec } from '../../src/lib/magazineV2/layoutSpec.js';

const theme = {
  palette: { primary: '#1f3d2b', secondary: '#5c6b60', accent: '#d4a843', bg: '#faf7f0', text: '#141414' },
  fonts: { display: 'Playfair Display', body: 'Inter' },
};
const DIMS = { width: PAGE_W, height: PAGE_H };

/** Compose a one-leaf page and hand back that leaf's element. */
function only(leaf: Record<string, unknown>, text = 'Copy', pad = 0): any {
  const spec = normalizeLayoutSpec({
    page: { margin: pad },
    root: { kind: 'col', children: [{ weight: 1, node: { kind: 'leaf', contentRef: 'k', ...leaf } }] },
  })!;
  const solved = solveLayout(spec, DIMS);
  const out = composeFromSolved(solved, { k: { text, qrUrl: 'https://x/y' } }, theme);
  return (out.elements as any[])[0];
}

test('the art-director names the type size, in points', () => {
  const el = only({ role: 'headline', fontPt: 30 }, 'Short');
  assert.equal(el.type, 'text');
  // fitFontSize may only ever SHRINK from the asked size, never exceed it.
  assert.ok(el.text.fontSize <= ptToPx(30) + 0.5, `${el.text.fontSize}px > 30pt`);
  assert.ok(el.text.fontSize > ptToPx(30) * 0.9, `30pt was not honoured (${el.text.fontSize}px)`);
});

test('a leaf that names nothing renders exactly as before', () => {
  const el = only({ role: 'body' }, 'Copy that fits.');
  const scale = ROLE_SCALE.body!;
  assert.equal(el.text.maxFontSize, scale.maxFontSize);
  assert.equal(el.text.lineHeight, scale.lineHeight);
  assert.equal(el.text.letterSpacing, undefined);
  assert.equal(el.text.textTransform, undefined);
});

test('PROSE HAS A FLOOR — an unreadable body size is raised, and it is not a matter of taste', () => {
  const el = only({ role: 'body', fontPt: 4 }, 'Copy');
  assert.ok(el.text.fontSize >= ptToPx(MIN_PROSE_PT) - 0.5, `${el.text.fontSize}px is under ${MIN_PROSE_PT}pt`);
});

test('a deliberately tiny LABEL is allowed — display type is not prose', () => {
  const el = only({ role: 'kicker', fontPt: 6.5 }, 'ON THE RAIL');
  assert.ok(el.text.fontSize < ptToPx(MIN_PROSE_PT), `a 6.5pt kicker was raised to ${el.text.fontSize}px`);
});

test('exact colours, capitals and tracking all reach the element', () => {
  const el = only({ role: 'kicker', color: '#b3123c', caps: true, tracking: 3, lineHeight: 1.1 }, 'On the rail');
  assert.equal(el.text.color, '#b3123c');
  assert.equal(el.text.textTransform, 'uppercase');
  assert.equal(el.text.letterSpacing, 3);
  assert.equal(el.text.lineHeight, 1.1);
  assert.equal(el.text.content, 'On the rail', 'caps is a STYLE — the words are not rewritten');
});

test('an exact colour that would be invisible on its ground is still repaired', () => {
  // Near-white ink on the near-white page ground: a decision that cannot be honoured.
  const el = only({ role: 'body', color: '#fbfaf6' }, 'Copy');
  assert.notEqual(el.text.color, '#fbfaf6');
});

test('A QR IS SQUARE — a wide band becomes a centred square, not a stretched box', () => {
  const spec = normalizeLayoutSpec({
    page: { margin: 'none' },
    root: { kind: 'col', children: [{ weight: 1, node: { kind: 'leaf', role: 'qr', contentRef: 'k' } }] },
  })!;
  const solved = solveLayout(spec, { width: 1200, height: 160 });
  const el = (composeFromSolved(solved, { k: { qrUrl: 'https://x/y' } }, theme).elements as any[])[0];
  assert.equal(el.w, 160);
  assert.equal(el.h, 160);
  assert.equal(el.x, Math.round((1200 - 160) / 2), 'centred in the band it was given');
});

test('spacing is a token OR a number of pixels', () => {
  assert.equal(resolveSpace('lg'), 60);
  assert.equal(resolveSpace(220), 220);
  assert.equal(resolveSpace(-5), 0);
  assert.equal(resolveSpace(99999), 400);
  assert.equal(resolveSpace(undefined, 36), 36);
  assert.equal(resolveSpace('nonsense' as never, 12), 12);

  // …and the solver honours a raw number, which the six tokens could not express.
  const spec = normalizeLayoutSpec({
    root: { kind: 'col', pad: 200, children: [{ weight: 1, node: { kind: 'leaf', role: 'body', contentRef: 'k' } }] },
  })!;
  const solved = solveLayout(spec, DIMS);
  const box = solved.leaves[0]!.box;
  assert.equal(box.x, 36 + 200, 'the page margin, then the 200px pad');
});

test('the page ground may be an exact colour, and is then left alone', () => {
  const spec = normalizeLayoutSpec({
    page: { background: { ref: 'primary', color: '#101820' } },
    root: { kind: 'col', children: [{ weight: 1, node: { kind: 'leaf', role: 'body', contentRef: 'k' } }] },
  })!;
  const out = composeFromSolved(solveLayout(spec, DIMS), { k: { text: 'Copy' } }, theme);
  // A named ground is taken literally — washing a gradient over it would overrule the
  // decision that was just made. A palette REF still gets the gradient treatment.
  assert.equal(out.background.value, '#101820');
});

test('the caps admit a real module row that used to be impossible', () => {
  // Five icon+label+caption cards = 15 leaves at depth 5 (root→col→row→card→leaf).
  // Both numbers were over the old limits, so this shape could not be built at all.
  const card = (i: number) => ({
    weight: 1,
    node: {
      kind: 'col',
      gap: 8,
      children: [
        { sizing: 'content', node: { kind: 'leaf', role: 'icon', iconName: 'Trophy' } },
        { sizing: 'content', node: { kind: 'leaf', role: 'label', contentRef: `label${i}` } },
        { sizing: 'content', node: { kind: 'leaf', role: 'caption', contentRef: `cap${i}` } },
      ],
    },
  });
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'col',
      children: [
        { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline' } },
        { weight: 2, node: { kind: 'row', gap: 20, children: [1, 2, 3, 4, 5].map(card) } },
      ],
    },
  }) as LayoutSpec | null;
  assert.ok(spec, 'the tree survived normalisation');
  assert.equal(countLeaves(spec!.root), 16, 'a headline plus five three-part cards');
  assert.ok(MAX_LEAVES >= 16 && MAX_CHILDREN >= 5 && MAX_TREE_DEPTH >= 5);
  // …and every one of them still solves to a real box.
  const solved = solveLayout(spec!, DIMS);
  assert.equal(solved.leaves.length, 16);
  for (const l of solved.leaves) {
    assert.ok(l.box.w >= 2 && l.box.h >= 2, 'no card was crushed');
    assert.ok(l.box.x >= 0 && l.box.y >= 0 && l.box.x + l.box.w <= PAGE_W && l.box.y + l.box.h <= PAGE_H);
  }
});

test('junk in the new fields is dropped, not trusted', () => {
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'col',
      gap: 'not-a-token',
      children: [
        { node: { kind: 'leaf', role: 'body', contentRef: 'k', color: 'red', fontPt: 'huge', lineHeight: 99, tracking: 500, caps: 'yes' } },
      ],
    },
  })!;
  const leaf = (spec.root as any).children[0].node;
  assert.equal(leaf.color, undefined, '"red" is not #rrggbb');
  assert.equal(leaf.fontPt, undefined, 'a string is not a size');
  assert.equal(leaf.lineHeight, 2.5, 'clamped, not dropped');
  assert.equal(leaf.tracking, 40, 'clamped');
  assert.equal(leaf.caps, undefined, 'only a real `true` sets capitals');
  assert.equal((spec.root as any).gap, undefined);
});
