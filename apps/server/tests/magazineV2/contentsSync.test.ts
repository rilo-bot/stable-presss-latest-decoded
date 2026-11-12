// ---------------------------------------------------------------------------
// contentsSync — the contents page's page numbers follow the pages they name.
//
// Folios are re-stamped on every structural change; the contents page used to keep
// printing the old numbers ("04 — Bloodlines" after two pages went in ahead of it).
// What is pinned here is the promise the sync makes: ONLY the digits of an entry it can
// match to a page change — never a title, never an entry it cannot place, never a
// number into a box it would no longer fit — in each shape a contents entry is set.
// Pure: no database, no model.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { syncContentsPage, type ContentsSyncPage, type ContentsSyncResult } from '../../src/lib/magazineV2/contentsSync.js';
import { estimateTextHeight } from '../../src/lib/magazineV2/layout.js';
import { measureRunWidthPx } from '../../src/lib/magazineV2/fontMetrics.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';

const DISPLAY = 'Playfair Display, Georgia, serif';
const BODY = 'Inter, Arial, sans-serif';

let seq = 0;

interface TextOpts {
  id?: string;
  role?: 'headline' | 'subhead' | 'body' | 'caption' | 'other';
  x?: number;
  y?: number;
  w?: number;
  size?: number;
  font?: string;
  weight?: 400 | 700 | 800;
}

/** A text element whose box HUGS its copy, the way the balancer leaves generated text. */
function text(content: string, o: TextOpts = {}): MagazineElement {
  const size = o.size ?? 24;
  const font = o.font ?? BODY;
  const weight = o.weight ?? 400;
  const w = o.w ?? 900;
  const h = Math.ceil(estimateTextHeight({ text: content, fontSize: size, boxWidthPx: w * 0.97, lineHeight: 1.2, fontFamily: font, fontWeight: weight }));
  return {
    id: o.id ?? `t${++seq}`, type: 'text', x: o.x ?? 80, y: o.y ?? 100, w, h, rotation: 0, zIndex: 1, locked: false, source: 'ai-agent',
    text: { content, role: o.role ?? 'body', fontFamily: font, fontSize: size, maxFontSize: size, fontWeight: weight, color: '#111111', align: 'left', lineHeight: 1.2, autoFit: 'shrink' },
  };
}

const headline = (content: string, id?: string) =>
  text(content, { role: 'headline', y: 140, size: 72, font: DISPLAY, weight: 800, ...(id ? { id } : {}) });
const body = () => text('The yearling sale opened on a grey Tuesday morning and did not let up. '.repeat(8).trim(), { y: 700, size: 21 });

function story(title: string, extra: MagazineElement[] = []): ContentsSyncPage {
  return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), elements: [headline(title), body(), ...extra] };
}

function contents(entries: string[], head = 'In this issue'): ContentsSyncPage {
  return {
    id: 'contents',
    elements: [headline(head, 'c-head'), ...entries.map((e, i) => text(e, { id: `entry${i + 1}`, y: 420 + i * 130 }))],
  };
}

const cover = (): ContentsSyncPage => ({
  id: 'cover',
  elements: [
    text('Racing Lines', { role: 'headline', y: 40, size: 120, font: DISPLAY, weight: 800, w: 1100 }),
    text('Bloodlines', { role: 'subhead', y: 1500 }),
    text('Raceday Rituals', { role: 'subhead', y: 1560 }),
  ],
});
const backCover = (): ContentsSyncPage => ({ id: 'back', elements: [text('See you at the next meeting', { role: 'subhead' })] });

/** cover · contents · letter · Bloodlines(4) · gallery · Raceday(6) · numbers · Long Game(8) · back */
function issue(entries = [
  '4 — Bloodlines: the families behind the sale',
  '6 — Raceday Rituals: what happens before the gates open',
  '8 — The Long Game: a decade of patience',
]): ContentsSyncPage[] {
  return [
    cover(),
    contents(entries),
    story('From the Editor'),
    story('Bloodlines'),
    story('Sale Day in Pictures'),
    story('Raceday Rituals'),
    story('By the Numbers', [text('4.8%', { role: 'headline', y: 400, size: 140, font: DISPLAY, weight: 800, w: 500 })]),
    story('The Long Game'),
    backCover(),
  ];
}

function move<T>(list: T[], from: number, to: number): T[] {
  const out = list.slice();
  const [m] = out.splice(from, 1);
  out.splice(to, 0, m!);
  return out;
}

/** The element's content after the sync (its update if it got one, else as it was). */
function contentAfter(pages: ContentsSyncPage[], r: ContentsSyncResult, pageIdx: number, elementId: string): string {
  const els = r.updates.find((u) => u.pageIdx === pageIdx)?.elements ?? pages[pageIdx]!.elements;
  return els.find((e) => e.id === elementId)!.text!.content;
}

// ── The plain case ───────────────────────────────────────────────────────────

test('in order already: the contents page is recognised and nothing is written', () => {
  const r = syncContentsPage(issue());
  assert.deepEqual(r.contentsPages, [1]);
  assert.deepEqual(r.updates, []);
  assert.deepEqual(r.skipped, []);
});

test('add pages: two pages in ahead of Bloodlines move every entry after them — numbers only', () => {
  const pages = issue();
  pages.splice(3, 0, story('Karaka Diary'), story('The Vet Round'));
  const r = syncContentsPage(pages);
  assert.equal(r.updates.length, 1);
  const u = r.updates[0]!;
  assert.equal(u.pageIdx, 1);
  assert.equal(u.id, 'contents');
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '6 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '8 — Raceday Rituals: what happens before the gates open');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '10 — The Long Game: a decade of patience');
  assert.deepEqual(u.changedElementIds.sort(), ['entry1', 'entry2', 'entry3']);
  assert.deepEqual(u.changes.map((c) => [c.fromNo, c.toNo]), [[4, 6], [6, 8], [8, 10]]);
  // Nothing but the words moved: same boxes, same style, untouched elements are the same objects.
  const before = pages[1]!.elements;
  assert.equal(u.elements.length, before.length);
  u.elements.forEach((el, i) => {
    const old = before[i]!;
    if (!u.changedElementIds.includes(el.id)) return assert.equal(el, old);
    const { text: t, ...geo } = el;
    const { text: ot, ...oldGeo } = old;
    assert.deepEqual(geo, oldGeo);
    assert.deepEqual({ ...t, content: '' }, { ...ot, content: '' });
  });
  // The pages themselves were not mutated.
  assert.equal(pages[1]!.elements.find((e) => e.id === 'entry1')!.text!.content, '4 — Bloodlines: the families behind the sale');
});

test('reorder: each entry follows its own page', () => {
  // The Long Game (page 8) moved up to page 3; everything between shifts down one.
  const pages = move(issue(), 7, 2);
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '5 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '7 — Raceday Rituals: what happens before the gates open');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '3 — The Long Game: a decade of patience');
});

test('reorder: moving the contents page itself renumbers nothing it lists wrongly', () => {
  // Contents moved to the back: every story moves up one page.
  const pages = move(issue(), 1, 7);
  const r = syncContentsPage(pages);
  assert.deepEqual(r.contentsPages, [7]);
  assert.equal(contentAfter(pages, r, 7, 'entry1'), '3 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 7, 'entry2'), '5 — Raceday Rituals: what happens before the gates open');
  assert.equal(contentAfter(pages, r, 7, 'entry3'), '7 — The Long Game: a decade of patience');
});

test('delete: the entry for a page that is gone is left exactly as it was', () => {
  const pages = issue().filter((p) => p.id !== 'raceday-rituals');
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '4 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '6 — Raceday Rituals: what happens before the gates open');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '7 — The Long Game: a decade of patience');
  const why = r.skipped.find((s) => s.elementId === 'entry2');
  assert.ok(why, 'the orphaned entry is reported');
  assert.match(why!.why, /no page/);
});

test('a headline is not matched by running on into the entry\'s teaser', () => {
  // "Three Generations at Waikato" + ": stud …" must not read as "Three Generations at Waikato Stud".
  const pages = [cover(), contents(['4 — Three Generations at Waikato: stud life since 1952', '6 — The Long Game']),
    story('From the Editor'), story('Karaka Diary'), story('Three Generations at Waikato Stud'), story('The Long Game')];
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '5 — Three Generations at Waikato: stud life since 1952');
  // …it still matches that page (6 of 7 key words), just as a near match, not a certain one:
  // with the previous order saying page 4 was deleted, it is left alone.
  const r2 = syncContentsPage(pages, { removedPageNos: [4] });
  assert.equal(contentAfter(pages, r2, 1, 'entry1'), '4 — Three Generations at Waikato: stud life since 1952');
});

test('delete: a removed page\'s number is not handed to a merely similar headline', () => {
  const before = [cover(), contents(['4 — Three Generations at Waikato: the farm that stayed', '6 — The Long Game: a decade of patience']),
    story('From the Editor'), story('Three Generations at Waikato'), story('Three Generations at Waikato Stud'), story('The Long Game')];
  const after = before.filter((p) => p.id !== 'three-generations-at-waikato').map((p) => ({ ...p, prevPageNo: before.indexOf(p) + 1 }));
  const r = syncContentsPage(after, { removedPageNos: [4] });
  assert.equal(contentAfter(after, r, 1, 'entry1'), '4 — Three Generations at Waikato: the farm that stayed');
  assert.match(r.skipped.find((s) => s.elementId === 'entry1')!.why, /removed/);
  assert.equal(contentAfter(after, r, 1, 'entry2'), '5 — The Long Game: a decade of patience');
});

test('one shared word is not a match; neither is an entry that only starts like a headline', () => {
  const pages = issue([
    '4 — Bloodlines: the families behind the sale',
    '9 — Letters to the Editor: your say',
    '10 — Bloodlines of the North: where the families went',
  ]);
  pages.splice(3, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '5 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '9 — Letters to the Editor: your say');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '10 — Bloodlines of the North: where the families went');
});

test('a deleted story\'s entry is never renumbered to the cover that teases it', () => {
  // The cover's cover lines print "Raceday Rituals" too — page 1 is never a contents target.
  const pages = issue().filter((p) => p.id !== 'raceday-rituals');
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '6 — Raceday Rituals: what happens before the gates open');
});

// ── The shapes an entry is set in ────────────────────────────────────────────

test('number in the same box: markup, spacing and zero-padding are kept', () => {
  const pages = issue([
    '<b>04</b>&nbsp;&nbsp;Bloodlines: three families behind the sale',
    '<span>06</span> — Raceday Rituals',
    '08. The Long Game',
  ]);
  pages.splice(3, 0, story('Karaka Diary'), story('The Vet Round'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '<b>06</b>&nbsp;&nbsp;Bloodlines: three families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '<span>08</span> — Raceday Rituals');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '10. The Long Game');
});

test('zero-padding: "4" stays unpadded, "04" stays padded, and a padded page pads a number that shrinks', () => {
  const fillers = ['Karaka Diary', 'The Vet Round', 'Track Notes', 'Foal Watch', 'Stud Book', 'Saddle Up', 'Ringside'].map((t) => story(t));
  // cover · contents · letter · Bloodlines(4) · 7 fillers · Long Game(12)
  const pages = [cover(), contents(['04 — Bloodlines', '12 — The Long Game']), story('From the Editor'), story('Bloodlines'), ...fillers, story('The Long Game')];
  assert.deepEqual(syncContentsPage(pages).updates, []);
  const moved = move(pages, 11, 2); // Long Game → page 3; Bloodlines → page 5
  const r = syncContentsPage(moved);
  assert.equal(contentAfter(moved, r, 1, 'entry1'), '05 — Bloodlines');
  assert.equal(contentAfter(moved, r, 1, 'entry2'), '03 — The Long Game');

  const plain = issue(['4 — Bloodlines', '6 — Raceday Rituals']);
  const shifted = move(plain, 5, 2); // Raceday → page 3; Bloodlines → page 5
  const r2 = syncContentsPage(shifted);
  assert.equal(contentAfter(shifted, r2, 1, 'entry1'), '5 — Bloodlines');
  assert.equal(contentAfter(shifted, r2, 1, 'entry2'), '3 — Raceday Rituals');
});

test('separate number boxes: the figure beside (or above) its title moves; the title box does not', () => {
  const fig = (n: string, id: string, x: number, y: number) =>
    text(n, { id, x, y, w: 180, size: 60, role: 'headline', font: DISPLAY, weight: 800 });
  const contentsPage: ContentsSyncPage = {
    id: 'contents',
    elements: [
      headline('Contents', 'c-head'),
      // "04 | Bloodlines" on one row
      fig('04', 'num1', 80, 420),
      text('Bloodlines<br>Three families behind the sale', { id: 'title1', x: 280, y: 420, w: 300 }),
      // "06" set above "Raceday Rituals" in the second column
      fig('06', 'num2', 640, 420),
      text('Raceday Rituals', { id: 'title2', x: 640, y: 520, w: 500 }),
    ],
  };
  const pages = [cover(), contentsPage, story('From the Editor'), story('Bloodlines'), story('Sale Day in Pictures'), story('Raceday Rituals')];
  assert.deepEqual(syncContentsPage(pages).updates, []);
  pages.splice(3, 0, story('Karaka Diary'), story('The Vet Round'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'num1'), '06');
  assert.equal(contentAfter(pages, r, 1, 'num2'), '08');
  assert.equal(contentAfter(pages, r, 1, 'title1'), 'Bloodlines<br>Three families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'title2'), 'Raceday Rituals');
  assert.deepEqual(r.updates[0]!.changedElementIds.sort(), ['num1', 'num2']);
});

test('a figure and the entry text that both print the number move together', () => {
  const contentsPage: ContentsSyncPage = {
    id: 'contents',
    elements: [
      headline('In this issue', 'c-head'),
      text('04', { id: 'num1', x: 80, y: 420, w: 180, size: 60, role: 'headline', font: DISPLAY, weight: 800 }),
      text('04 — Bloodlines: three families behind the sale', { id: 'entry1', x: 280, y: 420, w: 860 }),
      text('06 — Raceday Rituals: before the gates open', { id: 'entry2', x: 280, y: 560, w: 860 }),
    ],
  };
  const pages = [cover(), contentsPage, story('From the Editor'), story('Bloodlines'), story('Sale Day in Pictures'), story('Raceday Rituals')];
  pages.splice(3, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'num1'), '05');
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '05 — Bloodlines: three families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '07 — Raceday Rituals: before the gates open');
});

test('several entries in one box, and a number set under its title', () => {
  const pages = issue();
  pages[1] = {
    id: 'contents',
    elements: [
      headline('In this issue', 'c-head'),
      text('4 — Bloodlines<br>6 — Raceday Rituals<br>8 — The Long Game', { id: 'list', y: 420 }),
      text('Sale Day in Pictures<br>5', { id: 'under', y: 900 }),
    ],
  };
  pages.splice(2, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'list'), '5 — Bloodlines<br>7 — Raceday Rituals<br>9 — The Long Game');
  assert.equal(contentAfter(pages, r, 1, 'under'), 'Sale Day in Pictures<br>6');
});

test('trailing page numbers set off by leaders or "p."', () => {
  const pages = issue(['Bloodlines …… 4', 'Raceday Rituals — p. 6']);
  pages.splice(3, 0, story('Karaka Diary'), story('The Vet Round'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), 'Bloodlines …… 6');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), 'Raceday Rituals — p. 8');
});

// ── What it must never touch ─────────────────────────────────────────────────

test('an entry that names no page in the issue is untouched', () => {
  const pages = issue([
    '4 — Bloodlines: the families behind the sale',
    '12 — Letters to the Editor: your say',
    '8 — The Long Game: a decade of patience',
  ]);
  pages.splice(3, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '5 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '12 — Letters to the Editor: your say');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '9 — The Long Game: a decade of patience');
  assert.ok(r.skipped.some((s) => s.elementId === 'entry2'));
});

test('entries without numbers are read past, never numbered', () => {
  const pages = issue(['4 — Bloodlines: the families behind the sale', 'Raceday Rituals: what happens before the gates open', '8 — The Long Game']);
  pages.splice(3, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '5 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), 'Raceday Rituals: what happens before the gates open');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '9 — The Long Game');
});

test('small wording differences still match: case, plurals, accents, a shortened headline', () => {
  const pages = [
    cover(),
    contents(['4 — BLOODLINE: the families behind the sale', '5 — Cafe society', '6 — The Long Game — patience pays']),
    story('From the Editor'),
    story('Bloodlines'),
    story('Café Society'),
    story('The Long Game: Ten Years of Patience'),
  ];
  assert.deepEqual(syncContentsPage(pages).updates, []);
  pages.splice(3, 0, story('Karaka Diary'), story('The Vet Round'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '6 — BLOODLINE: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '7 — Cafe society');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '8 — The Long Game — patience pays');
});

test('duplicate titles: with the previous order known, each entry keeps the page it pointed at', () => {
  const breeder = story('The Long Game');
  const trainer = { ...story('The Long Game'), id: 'long-game-2' };
  const before = [cover(), contents(["4 — The Long Game: the breeder's view", "8 — The Long Game: the trainer's view"]),
    story('From the Editor'), breeder, story('Sale Day in Pictures'), story('Raceday Rituals'), story('By the Numbers'), trainer];
  const after = move(before, 7, 2).map((p) => ({ ...p, prevPageNo: before.indexOf(p) + 1 }));
  const r = syncContentsPage(after);
  assert.equal(contentAfter(after, r, 1, 'entry1'), "5 — The Long Game: the breeder's view");
  assert.equal(contentAfter(after, r, 1, 'entry2'), "3 — The Long Game: the trainer's view");

  // Without the previous order there is no telling which is which: both are left alone.
  const blind = move(before, 7, 2);
  const r2 = syncContentsPage(blind);
  assert.equal(contentAfter(blind, r2, 1, 'entry1'), "4 — The Long Game: the breeder's view");
  assert.equal(contentAfter(blind, r2, 1, 'entry2'), "8 — The Long Game: the trainer's view");
  assert.deepEqual(r2.updates, []);
});

test('duplicate titles: a story over consecutive pages (a duplicated page) is listed where it starts', () => {
  const pages = issue();
  const copy = { ...story('Bloodlines'), id: 'bloodlines-copy' };
  pages.splice(4, 0, copy); // Bloodlines at 4 and 5
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '4 — Bloodlines: the families behind the sale');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '7 — Raceday Rituals: what happens before the gates open');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '9 — The Long Game: a decade of patience');
});

test('two entries naming one page: neither steals it when it is a dead heat', () => {
  const pages = issue(['4 — Bloodlines: the families', '5 — Bloodlines: the families', '8 — The Long Game']);
  pages.splice(2, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '4 — Bloodlines: the families');
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '5 — Bloodlines: the families');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '9 — The Long Game');
});

test('a numbered list that happens to name stories is not a contents page', () => {
  const list: ContentsSyncPage = {
    id: 'briefs',
    elements: [headline('News in Brief', 'b-head'), text('1 — Bloodlines: a new family line', { id: 'b1', y: 420 }), text('2 — Raceday Rituals: the dress code', { id: 'b2', y: 560 })],
  };
  const pages = [cover(), list, story('From the Editor'), story('Bloodlines'), story('Raceday Rituals')];
  const r = syncContentsPage(pages);
  assert.deepEqual(r.contentsPages, []);
  assert.deepEqual(r.updates, []);
});

test('a number that opens the title is not a page number', () => {
  const pages = [
    cover(),
    contents(['4 — Bloodlines: the families', '3 Generations at Waikato: the stud that stayed', '6 — The Long Game']),
    story('From the Editor'),
    story('Bloodlines'),
    story('3 Generations at Waikato'),
    story('The Long Game'),
  ];
  pages.splice(2, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '3 Generations at Waikato: the stud that stayed');
  assert.equal(contentAfter(pages, r, 1, 'entry1'), '5 — Bloodlines: the families');
  assert.equal(contentAfter(pages, r, 1, 'entry3'), '7 — The Long Game');
});

test('a longer number that would not fit its box is left alone', () => {
  const size = 120;
  const w = Math.ceil(measureRunWidthPx('9', DISPLAY, 800, size, 0) / 0.97) + 2; // hugs one digit
  const contentsPage: ContentsSyncPage = {
    id: 'contents',
    elements: [
      headline('In this issue', 'c-head'),
      text('9', { id: 'num1', x: 80, y: 420, w, size, role: 'headline', font: DISPLAY, weight: 800 }),
      text('The Long Game', { id: 'title1', x: 80 + w + 20, y: 420, w: 700 }),
      text('4 — Bloodlines', { id: 'entry2', y: 700 }),
    ],
  };
  const fillers = ['Karaka Diary', 'The Vet Round', 'Track Notes', 'Foal Watch'].map((t) => story(t));
  const pages = [cover(), contentsPage, story('From the Editor'), story('Bloodlines'), ...fillers, story('The Long Game')];
  assert.deepEqual(syncContentsPage(pages).updates, []);
  pages.splice(2, 0, story('Saddle Up')); // Long Game 9 → 10, Bloodlines 4 → 5
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'num1'), '9');
  assert.match(r.skipped.find((s) => s.elementId === 'num1')!.why, /would not fit/);
  assert.equal(contentAfter(pages, r, 1, 'entry2'), '5 — Bloodlines');
});

test('a known kind settles it: a one-entry contents page is synced, a non-contents page never is', () => {
  const one = (kind?: string): ContentsSyncPage[] => [
    { ...cover(), kind: 'cover' },
    { ...contents(['3 — The Long Game: a decade of patience'], 'Inside'), ...(kind ? { kind } : {}) },
    story('Karaka Diary'),
    story('The Long Game'),
  ];
  // One entry and no "Contents" on the page: not enough to call it a contents page…
  assert.deepEqual(syncContentsPage(one()).contentsPages, []);
  // …unless the caller knows it is one.
  const hinted = one('contents');
  const r = syncContentsPage(hinted);
  assert.deepEqual(r.contentsPages, [1]);
  assert.equal(contentAfter(hinted, r, 1, 'entry1'), '4 — The Long Game: a decade of patience');
  // A page known NOT to be a contents page is never read as one.
  const pages = issue();
  pages[1] = { ...pages[1]!, kind: 'two-column-article' };
  pages.splice(3, 0, story('Karaka Diary'));
  assert.deepEqual(syncContentsPage(pages).updates, []);
});

test('never throws on odd pages, and does nothing for a one-page issue', () => {
  const odd: ContentsSyncPage[] = [
    { elements: [] },
    { elements: [{ id: 'img', type: 'image', x: 0, y: 0, w: 10, h: 10, rotation: 0, zIndex: 0, locked: false, source: 'ai-agent', image: { assetId: '', url: '', alt: '', fit: 'cover' } }] },
    { elements: [{ ...text('x'), text: undefined }] },
    { elements: [text('')] },
  ];
  assert.deepEqual(syncContentsPage(odd), { contentsPages: [], updates: [], skipped: [] });
  assert.deepEqual(syncContentsPage([contents(['4 — Bloodlines'])]), { contentsPages: [], updates: [], skipped: [] });
});

test('page furniture on the contents page is never read as an entry', () => {
  const pages = issue();
  pages[1]!.elements.push(text('2', { id: 'furniture-folio', y: 1700, size: 16, role: 'other' }));
  pages.splice(3, 0, story('Karaka Diary'));
  const r = syncContentsPage(pages);
  assert.equal(contentAfter(pages, r, 1, 'furniture-folio'), '2');
  assert.ok(!r.updates[0]!.changedElementIds.includes('furniture-folio'));
});
