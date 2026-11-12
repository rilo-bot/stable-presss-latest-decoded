// ---------------------------------------------------------------------------
// balanceLayout + container content sizing — text hugs its copy, photos get the room.
//
// The defect these guard against is ONE root cause: the art-director shares a page out
// by weight without ever seeing the copy, so a title row given "weight 1" of a 1634px
// column received 787px for ~200px of type, and the photographs got whatever was left —
// a 451×28 ribbon, a 74px strip. The solver was faithful to the guess. These tests pin
// the fix: tighten slack text tracks, route the freed length to imagery (or anchor it by
// the layout's intent), and never leave a photo that is not a photograph.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveLayout, naturalMain, type SolvedLayout, type Rect } from '../../src/lib/magazineV2/solveLayout.js';
import { balanceLayout } from '../../src/lib/magazineV2/balanceLayout.js';
import { makeMeasureLeaf } from '../../src/lib/magazineV2/measureLeaf.js';
import { imageShapeProblem, deadBands } from '../../src/lib/magazineV2/layoutQuality.js';
import type { LayoutNode, LayoutSpec, LayoutChild } from '../../src/lib/magazineV2/layoutSpec.js';
import type { ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';

const PAGE = { width: PAGE_W, height: PAGE_H };
const fonts = { display: 'Oswald, Arial, sans-serif', body: "Georgia, 'Times New Roman', serif" };

const leaf = (role: string, contentRef = role, extra: Record<string, unknown> = {}): LayoutNode =>
  ({ kind: 'leaf', role, contentRef, ...extra }) as LayoutNode;
const fr = (node: LayoutNode, weight = 1): LayoutChild => ({ weight, sizing: 'fr', node });
const hug = (node: LayoutNode): LayoutChild => ({ weight: 1, sizing: 'content', node });
const spec = (root: LayoutNode, margin: number | string = 'lg'): LayoutSpec =>
  ({ page: { background: { ref: 'bg' }, margin }, root }) as LayoutSpec;
const photo = (ref: string) => ({ image: { url: `https://cdn.example.com/${ref}.jpg`, assetId: ref, alt: '' } });

const box = (s: SolvedLayout, ref: string): Rect => {
  const l = s.leaves.find((x) => x.node.contentRef === ref);
  assert.ok(l, `no leaf "${ref}" in the solve`);
  return l!.box;
};

function assertTiles(s: SolvedLayout) {
  for (const l of s.leaves) {
    for (const k of ['x', 'y', 'w', 'h'] as const) assert.ok(Number.isInteger(l.box[k]), `${l.node.contentRef}.${k} not an integer`);
    assert.ok(l.box.x >= 0 && l.box.y >= 0 && l.box.x + l.box.w <= PAGE_W && l.box.y + l.box.h <= PAGE_H, `${l.node.contentRef} off the page`);
  }
  // Non-stack siblings never overlap: nothing here uses a stack.
  const ls = s.leaves.filter((l) => l.node.role !== 'spacer');
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i]!.box;
      const b = ls[j]!.box;
      const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(!(ow > 0 && oh > 0), `${ls[i]!.node.contentRef} overlaps ${ls[j]!.node.contentRef}`);
    }
  }
}

const TITLE: ResolvedContent = {
  headline: { text: 'Stars in the Making' },
  deck: { text: 'Meet the emerging horsemen, apprentices and thoroughbreds advancing through Aotearoa’s racing ranks.' },
};

// ── The solver: content sizing reaches containers ───────────────────────────

test('a content-sized ROW hugs its tallest child — it used to be silently treated as fr', () => {
  const content: ResolvedContent = { ...TITLE, hero: photo('hero') };
  const titleRow: LayoutNode = { kind: 'row', gap: 'xl', children: [fr(leaf('headline', 'headline', { fontPt: 44 }), 5), fr(leaf('subhead', 'deck', { fontPt: 13.5 }), 4)] };
  const s = spec({ kind: 'col', gap: 'lg', children: [hug(titleRow), fr(leaf('image', 'hero'))] });
  const measure = makeMeasureLeaf(content, fonts);
  const solved = solveLayout(s, PAGE, { measureLeaf: measure });
  const head = box(solved, 'headline');
  const natural = naturalMain(titleRow, 'col', PAGE_W - 120, measure)!;
  assert.ok(natural > 100 && natural < 300, `natural title-row height ${natural}`);
  assert.equal(head.h, Math.round(natural), 'the row is exactly as tall as its tallest copy');
  assert.equal(box(solved, 'deck').h, head.h, 'its children share the row height');
  assert.ok(box(solved, 'hero').h > 1300, 'the photo gets the rest');
  assertTiles(solved);
});

test('a subtree holding a photo has no natural size — it stays flexible', () => {
  const measure = makeMeasureLeaf({ ...TITLE, hero: photo('hero') }, fonts);
  const card: LayoutNode = { kind: 'col', children: [fr(leaf('image', 'hero')), hug(leaf('headline', 'headline'))] };
  assert.equal(naturalMain(card, 'col', 500, measure), null);
  assert.equal(naturalMain(leaf('image', 'hero'), 'col', 500, measure), null);
  // …and a square device's natural length is the length across it.
  assert.equal(naturalMain(leaf('icon', 'i', { iconName: 'Trophy' }), 'col', 235, measure), 235);
});

test('no measurer, no change: a content-sized container without one still solves as before (fr)', () => {
  const row: LayoutNode = { kind: 'row', children: [fr(leaf('headline')), fr(leaf('subhead'))] };
  const s = spec({ kind: 'col', children: [{ weight: 1, sizing: 'content', node: row }, fr(leaf('body'))] }, 0);
  const solved = solveLayout(s, PAGE);
  assert.equal(box(solved, 'headline').h, PAGE_H / 2);
});

// ── Tighten: slack text tracks hug, the space goes to the photographs ───────

/** The page-4 shape: a title row and a photo grid, each "weight 1" of the column. */
function profileGrid(): { s: LayoutSpec; content: ResolvedContent } {
  const content: ResolvedContent = { ...TITLE };
  const card = (i: number, w: number): LayoutChild => {
    content[`photo${i}`] = photo(`p${i}`);
    content[`label${i}`] = { text: `PROFILE ${i}: Resourceful trainers building competitive teams beyond the major centres.` };
    content[`cap${i}`] = { text: 'Patient placement, local knowledge and smaller strings turned into a potent force.' };
    return fr({ kind: 'col', gap: 'xs', children: [fr(leaf('image', `photo${i}`), 3), hug(leaf('label', `label${i}`, { fontPt: 15 })), hug(leaf('caption', `cap${i}`, { fontPt: 9.5 }))] }, w);
  };
  const s = spec({
    kind: 'col',
    gap: 'lg',
    children: [
      fr({ kind: 'row', gap: 140, children: [fr(leaf('headline', 'headline', { fontPt: 44 }), 5), fr(leaf('subhead', 'deck', { fontPt: 13.5 }), 4)] }),
      fr({ kind: 'row', gap: 140, children: [fr({ kind: 'col', gap: 'md', children: [card(1, 3), card(2, 2)] }, 529), fr({ kind: 'col', gap: 'md', children: [card(3, 1), card(4, 2)] }, 451)] }),
    ],
  });
  return { s, content };
}

test('THE PAGE-4 DEFECT, reproduced and fixed: a 787px title box and ribbon photos', () => {
  const { s, content } = profileGrid();
  const measure = makeMeasureLeaf(content, fonts);
  const before = solveLayout(s, PAGE, { measureLeaf: measure });
  assert.ok(box(before, 'headline').h >= 780, `the weight-share title box (${box(before, 'headline').h}px)`);
  const badBefore = before.leaves.filter((l) => l.node.role === 'image' && imageShapeProblem(l.box, PAGE));
  assert.ok(badBefore.length >= 1, 'at least one photo is a ribbon before balancing');

  const { solved, actions } = balanceLayout(s, { page: PAGE, measure, content });
  const head = box(solved, 'headline');
  assert.ok(head.h < 260, `title row hugs its two lines (${head.h}px)`);
  for (const l of solved.leaves.filter((x) => x.node.role === 'image')) {
    assert.equal(imageShapeProblem(l.box, PAGE), null, `${l.node.contentRef} ${l.box.w}×${l.box.h} must be a photograph`);
  }
  // The freed ~600px went to the photographs, not to bare paper.
  const photoArea = (s2: SolvedLayout) => s2.leaves.filter((l) => l.node.role === 'image').reduce((n, l) => n + l.box.w * l.box.h, 0);
  assert.ok(photoArea(solved) > photoArea(before) * 1.4, 'the photos got the room');
  assert.ok(actions.some((a) => a.startsWith('tightened')), actions.join('\n'));
  assertTiles(solved);
});

test('a text track that is SHORT of room is never tightened — only slack is removed', () => {
  const long = 'The paddock is where the real reading happens. '.repeat(40);
  const content: ResolvedContent = { body: { text: long }, hero: photo('hero') };
  const s = spec({ kind: 'col', children: [fr(leaf('body', 'body', { fontPt: 10 }), 1), fr(leaf('image', 'hero'), 4)] });
  const measure = makeMeasureLeaf(content, fonts);
  const before = box(solveLayout(s, PAGE, { measureLeaf: measure }), 'body');
  const after = box(balanceLayout(s, { page: PAGE, measure, content }).solved, 'body');
  assert.equal(after.h, before.h, 'an overfull body keeps its share; the composer shrinks its type as before');
});

test('deliberate air (a spacer) is never tightened away', () => {
  const content: ResolvedContent = { headline: { text: 'Before the Bell' } };
  const s = spec({ kind: 'col', children: [fr(leaf('spacer', 'air'), 2), fr(leaf('headline', 'headline', { fontPt: 40 }), 1)] });
  const measure = makeMeasureLeaf(content, fonts);
  const { solved } = balanceLayout(s, { page: PAGE, measure, content });
  const air = solved.leaves.find((l) => l.node.role === 'spacer')!;
  assert.ok(air.box.h > 900, 'the declared air keeps its share');
});

// ── Distribute: leftover by intent ──────────────────────────────────────────

test('over a photograph, the masthead stays up top and the cover lines anchor at the foot', () => {
  const content: ResolvedContent = {
    hero: photo('hero'),
    kicker: { text: 'AOTEAROA AT PACE' },
    headline: { text: 'RACING, RECAST' },
    entry1: { text: 'CUP WEEK: Tradition, theatre and top-flight racing converge at Riccarton.' },
    entry2: { text: 'RISING STABLES: The emerging trainers reshaping preparation and performance.' },
  };
  const s = spec(
    {
      kind: 'stack',
      layers: [
        leaf('image', 'hero'),
        leaf('shape', 'scrim'),
        { kind: 'col', pad: 'xl', gap: 'md', children: [hug(leaf('kicker')), fr(leaf('headline', 'headline', { fontPt: 64 }), 3), hug(leaf('entry', 'entry1')), fr(leaf('entry', 'entry2'), 2)] },
      ],
    },
    0,
  );
  const measure = makeMeasureLeaf(content, fonts);
  const before = solveLayout(s, PAGE, { measureLeaf: measure });
  assert.ok(box(before, 'headline').h > 600, 'the masthead was a weight share of the page');
  const { solved } = balanceLayout(s, { page: PAGE, measure, content });
  assert.ok(box(solved, 'headline').h < 200, `masthead hugs (${box(solved, 'headline').h})`);
  assert.equal(box(solved, 'kicker').y, 96, 'masthead group at the top, inside the pad');
  const last = box(solved, 'entry2');
  assert.equal(last.y + last.h, PAGE_H - 96, 'cover lines anchored at the foot');
  assert.ok(box(solved, 'entry1').y - (box(solved, 'headline').y + box(solved, 'headline').h) > 800, 'the photo reads between them');
});

test('a run of parallel items is spread down its column; a display group is centred', () => {
  const content: ResolvedContent = {};
  for (let i = 1; i <= 4; i++) content[`e${i}`] = { text: `Entry ${i}: a short line` };
  content.quote = { text: 'The horse always tells you.' };
  content.who = { text: '— A Waikato trainer' };
  content.pic = photo('pic');
  const list: LayoutNode = { kind: 'col', gap: 'sm', children: [1, 2, 3, 4].map((i) => fr(leaf('entry', `e${i}`))) };
  const quote: LayoutNode = { kind: 'col', gap: 'sm', children: [fr(leaf('pullquote', 'quote')), fr(leaf('byline', 'who'))] };
  const s = spec({ kind: 'row', gap: 'lg', children: [fr(list), fr(quote), fr(leaf('image', 'pic'))] });
  const measure = makeMeasureLeaf(content, fonts);
  const { solved, spec: out } = balanceLayout(s, { page: PAGE, measure, content });
  const row = out.root as { children: { node: { justify?: string } }[] };
  assert.equal(row.children[0]!.node.justify, 'between', 'the list is spread');
  assert.equal(row.children[1]!.node.justify, 'center', 'the pull-quote group is centred');
  assert.equal(box(solved, 'e1').y, 60);
  const e4 = box(solved, 'e4');
  assert.equal(e4.y + e4.h, PAGE_H - 60, 'the last entry lands on the foot of the column');
  const q = box(solved, 'quote');
  const w = box(solved, 'who');
  const mid = (q.y + w.y + w.h) / 2;
  assert.ok(Math.abs(mid - PAGE_H / 2) < 4, 'the display group sits in the middle');
});

test('an explicit justify from the art-director is honoured as-is', () => {
  const content: ResolvedContent = { headline: { text: 'Bottom Line' }, deck: { text: 'One standfirst.' } };
  const s = spec({ kind: 'col', justify: 'end', children: [fr(leaf('headline')), fr(leaf('subhead', 'deck'))] });
  const measure = makeMeasureLeaf(content, fonts);
  const { solved, spec: out } = balanceLayout(s, { page: PAGE, measure, content });
  assert.equal((out.root as { justify?: string }).justify, 'end');
  const d = box(solved, 'deck');
  assert.equal(d.y + d.h, PAGE_H - 60, 'anchored at the foot, as asked');
});

// ── Guard the photographs ───────────────────────────────────────────────────

test('a photo squeezed by its siblings is re-flowed into a sane shape when the text can spare it', () => {
  const content: ResolvedContent = { pic: photo('pic'), cap: { text: 'A caption.' }, body: { text: 'Copy. '.repeat(60) } };
  // A full-width photo given a sliver of a column by weight.
  const s = spec({ kind: 'col', children: [fr(leaf('image', 'pic'), 1), fr(leaf('caption', 'cap'), 2), fr(leaf('body', 'body', { fontPt: 10 }), 30)] });
  const measure = makeMeasureLeaf(content, fonts);
  const before = box(solveLayout(s, PAGE, { measureLeaf: measure }), 'pic');
  assert.ok(imageShapeProblem(before, PAGE), `the photo starts as a ribbon (${before.w}×${before.h})`);
  const { solved, droppedImages } = balanceLayout(s, { page: PAGE, measure, content });
  const after = box(solved, 'pic');
  assert.equal(imageShapeProblem(after, PAGE), null, `re-flowed to ${after.w}×${after.h}`);
  assert.deepEqual(droppedImages, []);
});

test('a cell that can never hold a picture loses the photo — it is never squeezed', () => {
  // The page-2 defect: a photo column 74px wide beside two full text columns.
  const content: ResolvedContent = {
    pic: photo('pic'),
    left: { text: 'New Zealand racing carries its history in the birdcage. '.repeat(14) },
    right: { text: 'Bloodlines. Raceday rituals. Stable shift. Country courses. '.repeat(10) },
  };
  const s = spec({ kind: 'row', gap: 'md', children: [fr(leaf('body', 'left', { fontPt: 10.5 }), 457), fr(leaf('body', 'right', { fontPt: 10.5 }), 441), fr(leaf('image', 'pic'), 74)] });
  const measure = makeMeasureLeaf(content, fonts);
  const before = box(solveLayout(s, PAGE, { measureLeaf: measure }), 'pic');
  assert.ok(before.w < 90, `starts as a ${before.w}px strip`);
  const { solved, droppedImages, actions } = balanceLayout(s, { page: PAGE, measure, content });
  assert.deepEqual(droppedImages, ['pic']);
  assert.ok(!solved.leaves.some((l) => l.node.role === 'image'), 'no photo left on the page');
  assert.ok(box(solved, 'right').x + box(solved, 'right').w === PAGE_W - 60, 'the text re-partitions the freed width');
  assert.ok(actions.some((a) => a.startsWith('dropped photo "pic"')), actions.join('\n'));
});

test('a background photo under a headline is never "guarded" — its shape is the stack', () => {
  const content: ResolvedContent = { hero: photo('hero'), headline: { text: 'A Banner' } };
  // A short stack band: the photo is a backing, so 1120×200 is fine.
  const s = spec({ kind: 'col', children: [{ weight: 1, sizing: 'content', minPx: 200, node: { kind: 'stack', layers: [leaf('image', 'hero'), leaf('headline')] } }, fr(leaf('spacer', 'air'))] });
  const measure = makeMeasureLeaf(content, fonts);
  const { droppedImages, solved } = balanceLayout(s, { page: PAGE, measure, content });
  assert.deepEqual(droppedImages, []);
  assert.equal(box(solved, 'hero').h, 200);
});

test('balancing is deterministic, never mutates its input, and keeps the tiling exact', () => {
  const { s, content } = profileGrid();
  const frozen = JSON.stringify(s);
  const measure = makeMeasureLeaf(content, fonts);
  const a = balanceLayout(s, { page: PAGE, measure, content });
  const b = balanceLayout(s, { page: PAGE, measure, content });
  assert.equal(JSON.stringify(a.solved), JSON.stringify(b.solved));
  assert.equal(JSON.stringify(s), frozen, 'the caller’s spec is untouched');
  assertTiles(a.solved);
  // And the page it produces has no dead band under the title.
  const ink = a.solved.leaves.map((l) => l.box);
  assert.deepEqual(deadBands(ink, PAGE_H), []);
});
