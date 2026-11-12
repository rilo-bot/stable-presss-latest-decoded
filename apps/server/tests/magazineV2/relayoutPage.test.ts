// ---------------------------------------------------------------------------
// relayoutPage — the geometric half of Adjust, and the lines it must never cross.
//
// It rebuilds a frame tree from a composed page and re-balances it. That is only safe on
// a page the generator built, and only worth doing on a page that measures badly — an
// imported magazine is a reproduction, a hand-placed box is a decision, and a page that
// is already fine must come back exactly as it went in.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { relayoutPage } from '../../src/lib/magazineV2/relayoutPage.js';
import { pageQuality } from '../../src/lib/magazineV2/layoutValidate.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';

const PAGE = { width: PAGE_W, height: PAGE_H };
const base = { rotation: 0, locked: false, source: 'ai-agent' as const };
const text = (id: string, x: number, y: number, w: number, h: number, content: string, fontSize: number, z: number): MagazineElement =>
  ({ ...base, id, type: 'text', x, y, w, h, zIndex: z, text: { content, role: fontSize > 60 ? 'headline' : 'body', fontFamily: "Georgia, 'Times New Roman', serif", fontSize, maxFontSize: fontSize, fontWeight: 400, color: '#121820', align: 'left', lineHeight: 1.3, autoFit: 'shrink' } }) as MagazineElement;
const image = (id: string, x: number, y: number, w: number, h: number, z: number): MagazineElement =>
  ({ ...base, id, type: 'image', x, y, w, h, zIndex: z, image: { assetId: id, url: `https://cdn.example.com/${id}.jpg`, alt: '', fit: 'cover' } }) as MagazineElement;

/** A title in a box four times taller than its line, over a photo given the crumbs. */
const stretched = (): MagazineElement[] => [
  text('title', 60, 60, 1120, 800, 'A Headline', 80, 0),
  image('pic', 60, 900, 1120, 160, 1),
  text('body', 60, 1100, 1120, 594, 'Body copy that reads well. '.repeat(30), 20, 2),
];

test('a stretched title box hugs its line, and the photo — not bare paper — gets the room', () => {
  const r = relayoutPage(stretched(), PAGE);
  assert.ok(r, 'a generated page that measures badly is re-balanced');
  const title = r!.elements.find((e) => e.id === 'title')!;
  const pic = r!.elements.find((e) => e.id === 'pic')!;
  assert.ok(title.h < 140, `title hugs (${title.h})`);
  assert.ok(pic.h > 400, `the photo took the room (${pic.h})`);
  assert.equal(pic.x, 60, 'the margins are kept');
  assert.deepEqual(r!.after.deadBands, []);
  assert.deepEqual(r!.after.emptyBoxes, []);
});

test('an IMPORTED page is never rearranged — it is a reproduction, not our layout', () => {
  const imported = stretched().map((e) => ({ ...e, source: 'extracted' as const }));
  assert.equal(relayoutPage(imported, PAGE), null);
});

test('a page with one hand-placed box is left alone', () => {
  const els = stretched();
  els[2] = { ...els[2]!, source: 'manual' };
  assert.equal(relayoutPage(els, PAGE), null);
});

test('a page that already measures clean comes back untouched', () => {
  const fine = [
    text('title', 60, 60, 1120, 110, 'A Headline', 80, 0),
    image('pic', 60, 200, 1120, 700, 1),
    text('body', 60, 940, 1120, 754, 'Body copy that reads well. '.repeat(120), 20, 2),
  ];
  const q = pageQuality(fine, PAGE);
  assert.deepEqual([q.slivers.length, q.emptyBoxes.length, q.deadBands.length], [0, 0, 0], 'the premise: it measures clean');
  assert.equal(relayoutPage(fine, PAGE), null);
});

test('a layout it cannot rebuild (a free-standing decorative shape) is refused, not guessed', () => {
  const els = [...stretched(), { ...base, id: 'rule', type: 'shape', x: 60, y: 870, w: 1120, h: 4, zIndex: 3, shape: { fill: '#000000' } } as MagazineElement];
  assert.equal(relayoutPage(els, PAGE), null);
});
