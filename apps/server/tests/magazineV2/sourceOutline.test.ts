// ---------------------------------------------------------------------------
// The document map handed to the issue planner.
//
// The planner picks an issue's running order from 14,000 characters. For a
// 500-page report that is three per cent of the document, so it was choosing the
// shape of a magazine from a sample of its source and could not know what it had
// not seen. A map — one short line per page — fits the whole document into a few
// thousand characters instead.
//
// Two ways a map makes things WORSE rather than better, and both are tested here:
//
//   1. If it truncates instead of thinning, it reproduces the bug it exists to fix
//      one level up — a complete-looking map of the document's opening pages.
//   2. If it reports page furniture, 400 pages all read "ANNUAL REVIEW | 12" and
//      the planner has paid tokens for nothing.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildOutline, headlineOf, thinOutline, formatOutline, type OutlineEntry } from '../../src/lib/magazineV2/sourceOutline.js';

const pages = (n: number, head = (i: number) => `Section ${i}`): OutlineEntry[] =>
  Array.from({ length: n }, (_, i) => ({ pageNo: i + 1, head: head(i + 1) }));

// ── picking a line worth mapping ────────────────────────────────────────────

test('a heading is preferred over the page furniture above it', () => {
  // The first line of a typeset page is very often a folio or a running header.
  // A map of those is a map of nothing.
  assert.equal(headlineOf('12\nChairman’s Statement\nIt has been a strong year…'), 'Chairman’s Statement');
  assert.equal(headlineOf('ANNUAL REVIEW 2025  |  12\nBloodstock Sales'), 'Bloodstock Sales');
  assert.equal(headlineOf('Page 4 of 88\nThe Breeding Season'), 'The Breeding Season');
  assert.equal(headlineOf('———\nResults'), 'Results');
});

test('a page of solid prose is mapped by its opening words', () => {
  // No heading exists, so saying so with the first real line beats saying nothing:
  // the planner still learns what the page is about.
  const prose =
    'The season opened in unusually wet conditions, which affected going at every ' +
    'major meeting and depressed clearance rates through the spring.';
  const got = headlineOf(prose);
  assert.ok(got.length <= 91, 'trimmed to heading length');
  assert.ok(got.startsWith('The season opened'));
  assert.ok(got.endsWith('…'), 'and says it was cut');
  assert.doesNotMatch(got, / …$/, 'cut on a word boundary, not mid-space');
});

test('a page with nothing on it maps to nothing', () => {
  assert.equal(headlineOf(''), '');
  assert.equal(headlineOf('\n\n   \n'), '');
  // Only furniture: no real line at all, so the furniture is all there is.
  assert.equal(headlineOf('42'), '42');
});

// ── thinning, not truncating ────────────────────────────────────────────────

test('a map too long for its budget is thinned EVENLY, not cut short', () => {
  // THE test. Cutting would hand the planner a confident map of pages 1–70 of a
  // 500-page document — the same "I have seen the document" mistake the map was
  // built to prevent, just moved up a layer.
  const kept = thinOutline(pages(500), 1_000);
  assert.ok(kept.length < 500, 'it did have to drop pages');
  assert.equal(kept[0]!.pageNo, 1, 'the first page is kept');
  assert.equal(kept[kept.length - 1]!.pageNo, 500, 'and so is the last');
  // Spread: the middle of the kept list is near the middle of the document.
  const middle = kept[Math.floor(kept.length / 2)]!.pageNo;
  assert.ok(middle > 200 && middle < 300, `middle entry was page ${middle}`);
  // The gaps are even — except the LAST one, which is stretched because the final
  // entry is snapped to the document’s last page on purpose. Asserting evenness
  // across every gap would be asserting that page 500 is not guaranteed.
  const gaps = kept.slice(1).map((e, i) => e.pageNo - kept[i]!.pageNo);
  const even = gaps.slice(0, -1);
  assert.ok(Math.max(...even) - Math.min(...even) <= 1, `gaps ranged ${Math.min(...even)}–${Math.max(...even)}`);
  assert.ok(gaps[gaps.length - 1]! >= 1, 'and the final jump lands on the last page');
});

test('a map that fits is left alone', () => {
  const all = thinOutline(pages(30), 10_000);
  assert.equal(all.length, 30);
  assert.deepEqual(all.map((e) => e.pageNo).slice(0, 3), [1, 2, 3]);
});

test('pages with no heading are dropped before thinning, not counted as content', () => {
  // Otherwise a document of mostly blank pages spends its whole budget on gaps.
  const mixed: OutlineEntry[] = [
    { pageNo: 1, head: 'Cover' },
    { pageNo: 2, head: '' },
    { pageNo: 3, head: '' },
    { pageNo: 4, head: 'Contents' },
  ];
  assert.deepEqual(thinOutline(mixed, 10_000).map((e) => e.pageNo), [1, 4]);
});

// ── what the model actually receives ───────────────────────────────────────

test('the map says how much of the document it covers', () => {
  // A map the model believes is complete is worse than no map, so it states its own
  // coverage and warns that the numbers jump.
  const text = formatOutline(pages(500), { budgetChars: 800, pagesTotal: 500 });
  assert.match(text, /MAP OF THE DOCUMENT/);
  assert.match(text, /of 500 pages/);
  assert.match(text, /sampled evenly/, 'and admits the gaps');
  assert.match(text, /only an excerpt/, 'and that the text below is not the document');
  assert.match(text, /^1: Section 1$/m);
  assert.match(text, /^500: Section 500$/m);
  assert.ok(text.length <= 1_100, `map was ${text.length} chars against an 800 budget`);
});

test('a complete map does not claim to be sampled', () => {
  const text = formatOutline(pages(12), { budgetChars: 10_000, pagesTotal: 12 });
  assert.match(text, /12 of 12 pages/);
  assert.doesNotMatch(text, /sampled evenly/);
});

test('there is no map of one page', () => {
  // A heading printed immediately above its own text is noise, not structure.
  assert.equal(formatOutline([{ pageNo: 1, head: 'Only page' }], { budgetChars: 3_000 }), '');
  assert.equal(formatOutline([], { budgetChars: 3_000 }), '');
  assert.equal(formatOutline([{ pageNo: 1, head: '' }], { budgetChars: 3_000 }), '');
});

test('a budget of nothing yields no map rather than a broken one', () => {
  assert.equal(formatOutline(pages(100), { budgetChars: 0 }), '');
  assert.equal(thinOutline(pages(100), -50).length <= 2, true);
});

// ── running headers, which only the whole document reveals ──────────────────

test('a running header is recognised by repetition and dropped', () => {
  // The main way a document map turns out worthless: 400 pages all reading
  // "ANNUAL REVIEW 2025 | 12". One page cannot tell — in isolation that line looks
  // like a perfectly good heading. What gives it away is pages 13 to 400.
  const pagesIn = Array.from({ length: 12 }, (_, i) => ({
    pageNo: i + 1,
    text: `ANNUAL REVIEW 2025  |  ${i + 1}\nSection ${i + 1} heading\nBody copy follows here.`,
  }));
  const entries = buildOutline(pagesIn);
  assert.deepEqual(
    entries.map((e) => e.head),
    pagesIn.map((_, i) => `Section ${i + 1} heading`),
    'every page maps to its own heading, not the shared header',
  );
});

test('a heading that legitimately recurs a few times is kept', () => {
  // Conservative on purpose. A section that runs across three pages of twelve is
  // content; dropping it would lose the only heading those pages have.
  const pagesIn = [
    ...Array.from({ length: 3 }, (_, i) => ({ pageNo: i + 1, text: 'Bloodstock Sales\nprose' })),
    ...Array.from({ length: 9 }, (_, i) => ({ pageNo: i + 4, text: `Chapter ${i + 4}\nprose` })),
  ];
  const heads = buildOutline(pagesIn).map((e) => e.head);
  assert.equal(heads[0], 'Bloodstock Sales', 'three of twelve is not a running header');
});

test('a document that is nothing but running headers maps to nothing', () => {
  // Better an absent map than a map of one repeated line presented as structure.
  const pagesIn = Array.from({ length: 10 }, (_, i) => ({ pageNo: i + 1, text: `THE QUARTERLY  |  ${i + 1}` }));
  const entries = buildOutline(pagesIn);
  assert.deepEqual(entries.map((e) => e.head), Array(10).fill(''));
  assert.equal(formatOutline(entries, { budgetChars: 3_000 }), '');
});
