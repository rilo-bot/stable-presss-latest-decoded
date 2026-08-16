// What "add a page" knows about the magazine it is adding to.
//
// The add-pages planner is one model call that picks each new page's kind, intent and
// section title. It used to be handed only the issue's title, subtitle and topic — so it
// was asked to "expand on the issue's existing themes" without being shown a single one,
// and its instruction not to repeat a page kind twice in a row could only ever apply
// inside the new batch. Adding one page to a twelve-page issue was a page designed with
// no knowledge of the other twelve.
//
// A page document stores elements, an index and a rev; it has never stored a kind or a
// section. So what the planner is shown has to be read off the page itself — which is
// what these tests pin, because the day someone changes the furniture id or the headline
// role, this quietly goes back to guessing.

import test from 'node:test';
import assert from 'node:assert/strict';
// From pageDigest, NOT from generate.ts — generate.ts opens the database at module
// scope, so importing anything from it here fails without a live MONGODB_URI. That is
// exactly why this function lives in its own module.
import { pagesAlreadyIn, resolvePageOrdinal } from '../../src/lib/magazineV2/pageDigest.ts';
import type { MagazineElement } from '../../src/lib/magazineV2/model.ts';
import { FURNITURE_IDS } from '../../src/lib/magazineV2/pageFurniture.ts';

let seq = 0;
const el = (o: Partial<MagazineElement>): MagazineElement => ({
  id: `e${++seq}`, type: 'text', x: 0, y: 0, w: 400, h: 100,
  rotation: 0, zIndex: 1, locked: false, source: 'ai', ...o,
} as MagazineElement);

const say = (role: string, content: string, id?: string) => el({
  ...(id ? { id } : {}),
  type: 'text',
  text: { content, role, fontFamily: 'Inter', fontSize: 24, fontWeight: 400, color: '#111', align: 'left', lineHeight: 1.4, autoFit: 'shrink' },
} as Partial<MagazineElement>);

test('the running-head id pageDigest looks for is the one pageFurniture emits', () => {
  // pageDigest cannot import pageFurniture (it would pull the whole compose stack in for
  // one string), so the two agree by convention — and a convention with no test is a
  // rename away from this silently going back to guessing.
  assert.ok(
    FURNITURE_IDS.includes('furniture-head-label'),
    'pageDigest reads the section title from `furniture-head-label`',
  );
});

test('a page is described by its section and its headline', () => {
  const lines = pagesAlreadyIn([
    {
      elements: [
        say('headline', 'The long ride home'),
        say('body', 'The season opened in a drizzle.'),
        say('other', 'Stable Life', 'furniture-head-label'),
      ],
    },
  ]);
  assert.deepEqual(lines, ['Stable Life — The long ride home']);
});

test('a page with no running head is still described by its headline', () => {
  // Covers carry no furniture, and a running head is suppressed when it would echo the
  // kicker — neither is a reason to tell the planner nothing about the page.
  const lines = pagesAlreadyIn([{ elements: [say('headline', 'THE HORSE'), say('body', 'Inside this issue.')] }]);
  assert.deepEqual(lines, ['THE HORSE']);
});

test('inline HTML in a headline does not reach the prompt', () => {
  const lines = pagesAlreadyIn([{ elements: [say('headline', 'The <em>long</em> ride  home')] }]);
  assert.deepEqual(lines, ['The long ride home']);
});

test('a page with nothing to say is left out rather than listed blank', () => {
  const lines = pagesAlreadyIn([
    { elements: [el({ type: 'image', image: { assetId: 'a', url: 'https://x/p.jpg', alt: '', fit: 'cover' } } as Partial<MagazineElement>)] },
    { elements: [] },
    {},
  ]);
  assert.deepEqual(lines, [], 'an empty line in the prompt is worse than a shorter list');
});

test('every page in the issue is described, in order', () => {
  const page = (section: string, head: string) => ({
    elements: [say('headline', head), say('other', section, 'furniture-head-label')],
  });
  const lines = pagesAlreadyIn([
    page('Stable Life', 'The long ride home'),
    page('By the numbers', 'A season in figures'),
    page('Gallery', 'Spring carnival'),
  ]);
  assert.deepEqual(lines, [
    'Stable Life — The long ride home',
    'By the numbers — A season in figures',
    'Gallery — Spring carnival',
  ]);
});

test('a very long headline is clipped, so twelve pages cannot crowd out the instructions', () => {
  const lines = pagesAlreadyIn([{ elements: [say('headline', 'x'.repeat(400))] }]);
  assert.ok(lines[0]!.length <= 90, `${lines[0]!.length} characters reached the prompt`);
});

// ── "do page 2 like this" ────────────────────────────────────────────────────
//
// The chat tool `use_image_as_layout` had NO page argument, and the client read the
// target off its own state (`const pageId = s.page.id`) — so asking the assistant to
// rebuild page 2 rebuilt whichever page you were looking at. The confirm names the page,
// so a mistake was caught rather than prevented.
//
// The model now supplies an ORDINAL and the server resolves it. It never supplies an id
// and never supplies geometry, so the invariant this whole feature rests on is intact.

const PAGES = [
  { _id: 'pA', index: 0 },
  { _id: 'pB', index: 1 },
  { _id: 'pC', index: 2 },
];

test('a page number becomes the id of that page', () => {
  const r = resolvePageOrdinal(PAGES, 2, 0);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.pageId, 'pB', 'page 2 is the second page in ORDER, not the second row returned');
});

test('an ID comes back, never an index', () => {
  // The reason: order can change between the assistant answering and the user pressing
  // Apply. An index resolved then would point somewhere else now.
  const r = resolvePageOrdinal(PAGES, 3, 0);
  assert.equal(r.ok && r.pageId, 'pC');
  const reordered = [
    { _id: 'pC', index: 0 },
    { _id: 'pA', index: 1 },
    { _id: 'pB', index: 2 },
  ];
  // Same id, different position — a caller holding 'pC' still rebuilds the page the
  // user pointed at, wherever it has moved to.
  assert.equal(resolvePageOrdinal(reordered, 1, 9).ok && resolvePageOrdinal(reordered, 1, 9).pageId, 'pC');
});

test('rows in any order resolve by index, not by arrival', () => {
  const shuffled = [
    { _id: 'pC', index: 2 },
    { _id: 'pA', index: 0 },
    { _id: 'pB', index: 1 },
  ];
  assert.equal(resolvePageOrdinal(shuffled, 1, 9).ok && resolvePageOrdinal(shuffled, 1, 9).pageId, 'pA');
});

test('naming the page you are already on means "this page", not a different one', () => {
  // Resolves to undefined so the proposal stays the ordinary kind and the confirm keeps
  // saying exactly what it always said.
  const r = resolvePageOrdinal(PAGES, 1, 0);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.pageId, undefined);
});

test('a page number that does not exist is refused NOW, with the real count', () => {
  const r = resolvePageOrdinal(PAGES, 7, 0);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : '', /3 pages/);
  assert.match(r.ok === false ? r.error : '', /no page 7/);
  // …and it is refused while the assistant can still say so, rather than failing after
  // the user has approved a rebuild.
});

test('a one-page magazine says "page", not "pages"', () => {
  const r = resolvePageOrdinal([{ _id: 'only', index: 0 }], 2, 0);
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : '', /has 1 page,/);
});
