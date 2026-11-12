// ---------------------------------------------------------------------------
// editorInChief — the whole-issue read: duplicates, contents, cover lines, tone.
// What is tested is the part that must never break a page: which boxes may move,
// whether a replacement FITS the box it lands in, and that any failure returns the
// pages untouched. The model is a mock (ai/test); no network, no database.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';

import {
  collectBoxes,
  findNearDuplicates,
  replacementFits,
  applyEditorEdits,
  parseEdits,
  cleanReplacement,
  buildEditorPrompt,
  runEditorInChief,
  plainText,
  type EicPage,
} from '../../src/lib/magazineV2/editorInChief.js';
import { estimateTextHeight } from '../../src/lib/magazineV2/layout.js';
import { measureRunWidthPx } from '../../src/lib/magazineV2/fontMetrics.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';

const DISPLAY = 'Playfair Display, Georgia, serif';
const BODY = 'Inter, Arial, sans-serif';

/** A text element whose box HUGS its copy, the way the balancer leaves generated text. */
function text(
  id: string,
  content: string,
  o: { role?: MagazineElement['text'] extends infer T ? T extends { role: infer R } ? R : never : never; y?: number; w?: number; size?: number; font?: string; weight?: 400 | 700 | 800 } = {},
): MagazineElement {
  const size = o.size ?? 24;
  const font = o.font ?? BODY;
  const weight = o.weight ?? 400;
  const w = o.w ?? 600;
  const h = Math.ceil(estimateTextHeight({ text: content, fontSize: size, boxWidthPx: w * 0.97, lineHeight: 1.2, fontFamily: font, fontWeight: weight }));
  return {
    id, type: 'text', x: 80, y: o.y ?? 100, w, h, rotation: 0, zIndex: 1, locked: false, source: 'ai-agent',
    text: { content, role: o.role ?? 'body', fontFamily: font, fontSize: size, maxFontSize: size, minFontSize: Math.round(size * 0.55), fontWeight: weight, color: '#111111', align: 'left', lineHeight: 1.2, autoFit: 'shrink' },
  };
}
const body = (id: string, y = 600) => text(id, 'The yearling sale opened on a grey Tuesday morning. '.repeat(10).trim(), { y, size: 21 });

function issue(): EicPage[] {
  return [
    { pageNo: 1, kind: 'cover', pageType: 'cover', elements: [
      text('mast', 'Racing Lines', { role: 'headline', y: 40, size: 120, font: DISPLAY, weight: 800, w: 1100 }),
      text('cl1', 'The Long Game: inside a decade of patience', { role: 'subhead', y: 1200 }),
    ] },
    { pageNo: 2, kind: 'contents', pageType: 'contents', elements: [
      text('c-h', 'In this issue', { role: 'headline', y: 60, size: 60, font: DISPLAY, weight: 800 }),
      text('e1', '7 — Bloodlines: the families behind the sale', { y: 300 }),
      text('e2', '9 — Raceday Rituals: what happens before the gates open', { y: 360 }),
    ] },
    { pageNo: 3, kind: 'two-column-article', pageType: 'feature-article', sectionTitle: 'Sales', elements: [
      text('k3', 'FEATURE', { role: 'subhead', y: 60, size: 20 }),
      text('h3', 'The Long Game', { role: 'headline', y: 100, size: 60, font: DISPLAY, weight: 800 }),
      body('b3'),
    ] },
    { pageNo: 4, kind: 'two-column-article', pageType: 'interview-qa', sectionTitle: 'People', elements: [
      text('k4', 'FEATURE', { role: 'subhead', y: 60, size: 20 }),
      text('h4', 'The Long Game', { role: 'headline', y: 100, size: 60, font: DISPLAY, weight: 800 }),
      body('b4'),
    ] },
    { pageNo: 5, kind: 'back-cover', pageType: 'back-cover', elements: [text('s5', 'See you at the next meeting', { role: 'subhead' })] },
  ];
}
const ISSUE = { title: 'Racing Lines', subtitle: 'The sales issue' };

test('boxes: refs in reading order; the masthead, body copy and furniture never editable', () => {
  const pages = issue();
  pages[2]!.elements.push(text('furniture-folio', '3', { y: 1600 }));
  const boxes = collectBoxes(pages, ISSUE);
  const mast = boxes.find((b) => b.elementId === 'mast')!;
  assert.equal(mast.ref, 'p1.1');
  assert.equal(mast.lock, 'masthead');
  assert.equal(boxes.find((b) => b.elementId === 'b3')!.lock, 'body');
  assert.ok(!boxes.some((b) => b.elementId === 'furniture-folio'), 'furniture is not copy');
  assert.equal(boxes.find((b) => b.elementId === 'h3')!.ref, 'p3.2');
  // A two-tone masthead ("Racing" / "Lines") is still the masthead.
  const split = collectBoxes([{ pageNo: 1, kind: 'cover', elements: [text('m1', 'Racing', { role: 'headline' }), text('m2', 'Lines', { role: 'headline', y: 300 })] }], ISSUE);
  assert.ok(split.every((b) => b.lock === 'masthead'));
});

test('duplicates: the same headline and kicker on two pages are flagged; a cover line echoing a headline is not', () => {
  const boxes = collectBoxes(issue(), ISSUE);
  const dups = findNearDuplicates(boxes);
  assert.ok(dups.some((d) => d.a === 'p3.2' && d.b === 'p4.2' && d.why === 'same words'), JSON.stringify(dups));
  assert.ok(dups.some((d) => d.a === 'p3.1' && d.b === 'p4.1'), 'repeated kicker');
  assert.ok(!dups.some((d) => d.a.startsWith('p1.') || d.b.startsWith('p1.')), 'cover lines tease real headlines by design');
  const near = findNearDuplicates(collectBoxes([
    { pageNo: 1, elements: [text('a', 'The Art of Speed', { role: 'headline' })] },
    { pageNo: 2, elements: [text('b', 'The Art of Breeding', { role: 'headline' })] },
  ], { title: 'X' }));
  assert.equal(near[0]?.why, 'same opening');
});

test('fit: a replacement that needs the type to shrink past 10% is refused; one that fits is accepted', () => {
  // A headline box exactly as wide as its own line.
  const content = 'The Long Game';
  const w = Math.ceil(measureRunWidthPx(content, DISPLAY, 800, 60) / 0.97) + 2;
  const el = text('h', content, { role: 'headline', size: 60, font: DISPLAY, weight: 800, w });
  assert.equal(replacementFits(el, 'A Long Wait').ok, true);
  const tooWide = replacementFits(el, 'Patience Pays Off Again');
  assert.equal(tooWide.ok, false);
  // A clipped (non-shrinking) box must take the new line at its current size.
  const clip = { ...el, text: { ...el.text!, autoFit: 'clip' as const } };
  assert.equal(replacementFits(clip, 'Patience Pays Off Again').ok, false);
});

test('apply: only valid, editable, fitting edits land; hygiene and the write pipeline run over the page', () => {
  const pages = issue();
  const boxes = collectBoxes(pages, ISSUE);
  const res = applyEditorEdits(pages, boxes, [
    { ref: 'p4.2', text: 'Ask the Rider' },              // fixes the duplicate headline
    { ref: 'p1.1', text: 'Something Else' },             // masthead → refused
    { ref: 'p3.3', text: 'New body' },                   // body → refused
    { ref: 'p9.9', text: 'Nope' },                       // unknown
    { ref: 'p4.1', text: 'PAGE 4 — PEOPLE' },            // internal label stripped by hygiene
    { ref: 'p2.2', text: '3 — The Long Game: a decade of patience' },
    { ref: 'p2.3', text: '2 — In this issue: the contents' }, // cites the contents page itself → refused
    { ref: 'p2.3', text: '4 — Ask the Rider: the jockey on patience' },
    { ref: 'p3.2', text: 'A headline that is far, far too long for this box to ever hold' },
  ]);
  const why = (ref: string) => res.skipped.find((s) => s.ref === ref)?.why ?? '';
  assert.deepEqual(res.applied.map((a) => a.ref).sort(), ['p2.2', 'p2.3', 'p4.1', 'p4.2']);
  assert.match(why('p1.1'), /masthead/);
  assert.match(why('p3.3'), /body/);
  assert.match(why('p9.9'), /unknown/);
  assert.match(why('p2.3'), /not a story/);
  assert.match(why('p3.2'), /too long|needs|wider/);
  assert.deepEqual(res.changed, [1, 3]);
  const p4 = res.pages[3]!.elements;
  assert.equal(p4.find((e) => e.id === 'h4')!.text!.content, 'Ask the Rider');
  assert.equal(p4.find((e) => e.id === 'k4')!.text!.content, 'PEOPLE');
  assert.equal(res.pages[1]!.elements.find((e) => e.id === 'e1')!.text!.content, '3 — The Long Game: a decade of patience');
  assert.equal(res.pages[1]!.elements.find((e) => e.id === 'e2')!.text!.content, '4 — Ask the Rider: the jockey on patience');
  assert.equal(res.pages[0], pages[0], 'untouched pages are the same objects');
  assert.equal(pages[3]!.elements.find((e) => e.id === 'h4')!.text!.content, 'The Long Game', 'the input is never mutated');
});

test('a contents run with a page the editor did not fix loses its numbers rather than print a fake page', () => {
  const pages = issue();
  const res = applyEditorEdits(pages, collectBoxes(pages, ISSUE), [{ ref: 'p2.2', text: '3 — The Long Game: a decade of patience' }]);
  // e2 still cites page 9 of a five-page issue, so no number on the page can be trusted.
  assert.equal(res.pages[1]!.elements.find((e) => e.id === 'e1')!.text!.content, 'The Long Game: a decade of patience');
  assert.equal(res.pages[1]!.elements.find((e) => e.id === 'e2')!.text!.content, 'Raceday Rituals: what happens before the gates open');
});

test('replacements are cleaned: no tags, no wrapping quotes, no line breaks; HTML-escaped on the page', () => {
  assert.equal(cleanReplacement('"<b>Ask the Rider</b>"', 'The Long Game'), 'Ask the Rider');
  assert.equal(cleanReplacement('Two\\nLines', 'x'), 'Two Lines');
  assert.equal(cleanReplacement('“Quoted”', '“Already quoted”'), '“Quoted”');
  const pages = issue();
  const res = applyEditorEdits(pages, collectBoxes(pages, ISSUE), [{ ref: 'p4.2', text: 'Rides & Riders' }]);
  assert.equal(res.pages[3]!.elements.find((e) => e.id === 'h4')!.text!.content, 'Rides &amp; Riders');
  assert.equal(plainText('Rides &amp; Riders'), 'Rides & Riders');
});

test('parseEdits tolerates prose and fences, and rejects junk', () => {
  assert.deepEqual(parseEdits('Here you go:\n```json\n{"edits":[{"ref":"p3.2","text":"A"},{"ref":3}]}\n```'), [{ ref: 'p3.2', text: 'A' }]);
  assert.deepEqual(parseEdits('no json here'), []);
  assert.deepEqual(parseEdits('{"changes":[]}'), []);
});

test('the prompt is compact text: running order, flagged duplicates, box limits — no geometry', () => {
  const pages = issue();
  const boxes = collectBoxes(pages, ISSUE);
  const { prompt } = buildEditorPrompt(pages, boxes, ISSUE, findNearDuplicates(boxes), 'full');
  assert.match(prompt, /REAL RUNNING ORDER[\s\S]*3\. The Long Game[\s\S]*4\. The Long Game/);
  assert.match(prompt, /SUSPECTED DUPLICATES[\s\S]*p3\.2 "The Long Game" ≈ p4\.2/);
  assert.match(prompt, /p1\.1 \[masthead, never change\] "Racing Lines"/);
  assert.match(prompt, /p4\.2 \[headline ≤17\] "The Long Game"/);
  assert.ok(!/"x":|"w":|\b1100\b/.test(prompt), 'no coordinates in the prompt');
});

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const reply = (text: string) => new MockLanguageModelV4({
  doGenerate: { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } as never,
});

test('the pass: one model call, edits applied, generous output budget', async () => {
  const model = reply(JSON.stringify({ edits: [{ ref: 'p4.2', text: 'Ask the Rider' }, { ref: 'p4.1', text: 'PEOPLE' }] }));
  const res = await runEditorInChief({ model, pages: issue(), issue: ISSUE });
  assert.equal(res.called, true);
  assert.equal(model.doGenerateCalls.length, 1);
  assert.ok((model.doGenerateCalls[0]!.maxOutputTokens ?? 0) >= 16000);
  assert.deepEqual(res.changed, [3]);
  assert.equal(res.pages[3]!.elements.find((e) => e.id === 'k4')!.text!.content, 'PEOPLE');
});

test('the pass never breaks a page: a failed call or junk answer returns the pages untouched', async () => {
  const pages = issue();
  const boom = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('provider down'); } });
  const failed = await runEditorInChief({ model: boom, pages, issue: ISSUE });
  assert.equal(failed.pages, pages);
  assert.deepEqual(failed.changed, []);
  const junk = await runEditorInChief({ model: reply('I would change the headline on page 4.'), pages, issue: ISSUE });
  assert.equal(junk.pages, pages);
  assert.deepEqual(junk.changed, []);
});

test('add-pages light pass: no repeat → no model call; a repeat → only the new page may change', async () => {
  const existing: EicPage[] = issue().slice(0, 3).map((p) => ({ ...p, editable: false }));
  const fresh: EicPage = { pageNo: 4, kind: 'two-column-article', pageType: 'profile', elements: [text('hn', 'A New Story Entirely', { role: 'headline', size: 60, font: DISPLAY, weight: 800 }), body('bn')] };
  const silent = reply('{"edits":[]}');
  const none = await runEditorInChief({ model: silent, pages: [...existing, fresh], issue: ISSUE, mode: 'dedupe' });
  assert.equal(none.called, false);
  assert.equal(silent.doGenerateCalls.length, 0);

  const repeat: EicPage = { ...fresh, elements: [text('hn', 'The Long Game', { role: 'headline', size: 60, font: DISPLAY, weight: 800 }), body('bn')] };
  const model = reply(JSON.stringify({ edits: [{ ref: 'p3.2', text: 'Old Page Edit' }, { ref: 'p4.1', text: 'Bred to Wait' }] }));
  const res = await runEditorInChief({ model, pages: [...existing, repeat], issue: ISSUE, mode: 'dedupe' });
  assert.equal(model.doGenerateCalls.length, 1);
  assert.deepEqual(res.changed, [3]);
  assert.equal(res.pages[3]!.elements.find((e) => e.id === 'hn')!.text!.content, 'Bred to Wait');
  assert.equal(res.pages[2], existing[2], 'existing pages are read only');
});
