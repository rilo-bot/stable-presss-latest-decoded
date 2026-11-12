// ---------------------------------------------------------------------------
// copyHygiene + draftRules — the issue's plumbing never prints, and no section loses
// its body.
//
// The strings below are copied from a real generated issue: cover lines that read
// "PAGE 2 — CUP WEEK: …", a profile grid where every item began "04 —", and a meta line
// "3 — THREE COURSES, ONE SEASON: …" under that very headline. And a venue spread that
// printed "Trentham" with a date line and NO body under it.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanPageCopy, stripMetaLabels, pageCopyEdits } from '../../src/lib/magazineV2/copyHygiene.js';
import { draftGaps, cleanDraftCopy } from '../../src/lib/magazineV2/draftRules.js';
import type { PageTemplate, PageTemplateSlot } from '../../src/lib/magazineV2/templates.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';

const items = (...texts: string[]) => texts.map((text, i) => ({ id: `t${i}`, text }));
const out = (m: Map<string, string>, id: string) => m.get(id);

test('page references never print on a cover', () => {
  const m = cleanPageCopy(
    items(
      'PAGE 2 — CUP WEEK: Tradition, theatre and top-flight racing converge at Riccarton.',
      'PAGE 3 — RISING STABLES: The emerging trainers reshaping preparation and performance.',
      'PAGE 4 — KARAKA CALLING: Inside the yearling ring where pedigrees meet possibility.',
      'PAGE 6 — THE NEXT FURLONG: Welfare, technology and a new generation move racing forward.',
    ),
    { pageKind: 'cover', totalPages: 6 },
  );
  assert.equal(out(m, 't0'), 'CUP WEEK: Tradition, theatre and top-flight racing converge at Riccarton.');
  assert.equal(out(m, 't3'), 'THE NEXT FURLONG: Welfare, technology and a new generation move racing forward.');
  assert.equal(m.size, 4);
});

test('a number repeated down a list is a leaked page number, not a list', () => {
  const m = cleanPageCopy(
    items('04 — PROVINCIAL PROGRESS: Resourceful trainers.', '04 — SPEED WITH SCOPE: Versatile sprinters.', '04 — RIDING THROUGH: Apprentices.', '04 — STAYING COURSE: Distance horses.'),
    { pageKind: 'photo-grid', totalPages: 6 },
  );
  assert.equal(out(m, 't0'), 'PROVINCIAL PROGRESS: Resourceful trainers.');
  assert.equal(out(m, 't3'), 'STAYING COURSE: Distance horses.');
});

test('a real 1…n sequence keeps its numbers — in any scan order', () => {
  const real = items('01 — BRED FOR DISTANCE: x', '02 — RITUALS OF THE RAIL: y', '03 — TRACKS: z', '04 — HORSE FIRST: w', '05 — A WIDER GATE: v');
  assert.equal(cleanPageCopy(real, { pageKind: 'back-cover' }).size, 0);
  // A two-column list scans 1,3,2,4 row by row — still a list.
  assert.equal(cleanPageCopy(items('1 — A', '3 — C', '2 — B', '4 — D')).size, 0);
  // Page refs on an interior page (2,3,4,6) are not a list: gone.
  const refs = cleanPageCopy(items('2 — A', '3 — B', '4 — C', '6 — D'));
  assert.equal(refs.size, 4);
  // A lone number is not a list either.
  assert.equal(out(cleanPageCopy(items('3 — THE CARNIVALS: rhythm.')), 't0'), 'THE CARNIVALS: rhythm.');
});

test('on a CONTENTS page the numbers are the content — kept when they are real pages of this issue', () => {
  const ok = cleanPageCopy(items('PAGE 3 — A Season in Motion: the calendar', 'PAGE 4 — Stars in the Making: who to watch'), { pageKind: 'contents', totalPages: 6 });
  assert.equal(out(ok, 't0'), '3 — A Season in Motion: the calendar', '"PAGE 3 —" becomes the number itself');
  assert.equal(out(ok, 't1'), '4 — Stars in the Making: who to watch');
  const bad = cleanPageCopy(items('3 — A: x', '9 — B: y'), { pageKind: 'contents', totalPages: 6 });
  assert.equal(out(bad, 't1'), 'B: y', 'there is no page 9 — every number goes');
  assert.equal(out(bad, 't0'), 'A: x');
});

test('a line that re-states the page headline loses the echo', () => {
  const m = cleanPageCopy(
    [
      { id: 'h', text: 'Three Courses, One Season', role: 'headline' },
      { id: 'meta', text: '3 — THREE COURSES, ONE SEASON: the carnivals that give the national calendar its rhythm.', role: 'body' },
      { id: 'k', text: 'A SEASON IN MOTION', role: 'subhead' },
    ],
    { headline: 'Three Courses, One Season', sectionTitle: 'A Season in Motion', totalPages: 6 },
  );
  assert.equal(out(m, 'meta'), 'The carnivals that give the national calendar its rhythm.');
  assert.equal(m.has('h'), false, 'the headline itself is never touched');
  assert.equal(m.has('k'), false, 'a kicker that IS the section title is a kicker, not an echo');
});

test('slot and section labels are stripped; real copy that merely starts with such a word is not', () => {
  assert.equal(stripMetaLabels('SECTION: The road ahead'), 'The road ahead');
  assert.equal(stripMetaLabels('Kicker — BY THE NUMBERS'), 'BY THE NUMBERS');
  assert.equal(stripMetaLabels('entry2 — Hello'), 'Hello');
  assert.equal(stripMetaLabels('<b>PAGE 2 —</b> CUP WEEK: x'), 'CUP WEEK: x', 'tags kept balanced, words removed');
  for (const keep of ['STATE OF PLAY: the industry', 'Page turner — a thriller', 'BODY LANGUAGE: reading a horse', '4.8% growth — y', '2026 — a year', 'Sectional times: fast']) {
    assert.equal(stripMetaLabels(keep), keep, keep);
  }
});

test('never blanks a box: a line that is ONLY a label is left as written', () => {
  assert.equal(cleanPageCopy(items('PAGE 4 —')).size, 0);
});

test('the Adjust/Fill pass cleans copy already on the page, and the model’s rewrites, but never furniture', () => {
  const t = (id: string, content: string, role = 'body'): MagazineElement =>
    ({ id, type: 'text', x: 0, y: 0, w: 400, h: 60, rotation: 0, zIndex: 1, locked: false, source: 'ai-agent', text: { content, role, fontFamily: 'Georgia', fontSize: 20, fontWeight: 400, color: '#111111', align: 'left', lineHeight: 1.3, autoFit: 'shrink' } }) as MagazineElement;
  const els = [t('a', 'PAGE 2 — CUP WEEK: x'), t('b', 'Fine copy.'), t('furniture-folio', '2', 'other')];
  const edits = pageCopyEdits(els, [{ elementId: 'b', content: 'PAGE 9 — Rewritten.' }], { pageKind: 'cover' });
  assert.deepEqual(edits, [
    { elementId: 'b', content: 'Rewritten.' },
    { elementId: 'a', content: 'CUP WEEK: x' },
  ]);
  assert.deepEqual(pageCopyEdits([t('a', 'Clean.')], []), [], 'a clean page proposes nothing');
});

// ── draftRules ──────────────────────────────────────────────────────────────

const slot = (id: string, textRole: string, leafRole?: string): PageTemplateSlot =>
  ({ id, role: 'text', textRole, ...(leafRole ? { leafRole } : {}), required: false, z: 0, box: { x: 0, y: 0, w: 0.4, h: 0.2 } }) as PageTemplateSlot;
const tpl = (slots: PageTemplateSlot[]): PageTemplate => ({ id: 't', kind: 'two-column-article', description: '', slots }) as PageTemplate;

test('EVERY body column the layout drew must be written — the Trentham defect', () => {
  const template = tpl([
    slot('headline', 'headline', 'headline'),
    slot('sub1', 'subhead', 'subhead'), slot('body', 'body', 'body'),
    slot('sub2', 'subhead', 'subhead'), slot('body2', 'body', 'body'),
    slot('sub3', 'subhead', 'subhead'), slot('body3', 'body', 'body'),
  ]);
  const prose = 'Ellerslie opens the northern summer with Boxing Day racing. '.repeat(4);
  const draft = { texts: { headline: 'Three Courses', sub1: 'Ellerslie', body: prose, sub2: 'Trentham', sub3: 'Riccarton', body3: prose }, images: {}, qr: {} };
  const gaps = draftGaps(draft, template);
  assert.equal(gaps.length, 1, 'enough body in TOTAL used to pass — the empty column did not');
  assert.match(gaps[0]!, /^body2 /);
  assert.deepEqual(draftGaps({ ...draft, texts: { ...draft.texts, body2: prose } }, template), []);
});

test('the fixed templates keep their total-only body contract', () => {
  const template = tpl([slot('headline', 'headline'), slot('body', 'body'), slot('body2', 'body')]);
  const draft = { texts: { headline: 'H', body: 'x'.repeat(260) }, images: {}, qr: {} };
  assert.deepEqual(draftGaps(draft, template), []);
});

test('the copywriter’s draft is cleaned before it is composed', () => {
  const template = tpl([slot('headline', 'headline', 'headline'), slot('entry1', 'body', 'entry'), slot('entry2', 'body', 'entry')]);
  const draft = { texts: { headline: 'Racing, Recast', entry1: 'PAGE 2 — CUP WEEK: x', entry2: 'PAGE 3 — STABLES: y' }, images: { photo: 'horse' }, qr: {} };
  const page = { kind: 'cover', intent: 'cover', sectionTitle: 'The NZ Racing Scene' } as const;
  const cleaned = cleanDraftCopy(draft, template, page as never, 6);
  assert.deepEqual(cleaned.texts, { headline: 'Racing, Recast', entry1: 'CUP WEEK: x', entry2: 'STABLES: y' });
  assert.deepEqual(cleaned.images, draft.images, 'photo briefs are not copy');
});
