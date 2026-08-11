// ---------------------------------------------------------------------------
// fitFontSize / estimateTextHeight / readableColor — the "text never overflows"
// and "text stays legible" halves of the design.
//
// fitFontSize must be CONSERVATIVE (it may under-estimate the available size, but
// must never claim text fits when it doesn't) because the generator bakes its
// answer into the stored element and layout QA trusts it.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitFontSize, estimateTextHeight, contrastRatio, readableColor, refitText } from '../../src/lib/magazineV2/layout.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';

const FONT = { fontFamily: 'Inter, Arial, sans-serif', fontWeight: 400 };

test('the fitted size never exceeds max nor falls below min', () => {
  const size = fitFontSize({
    text: 'A very long paragraph. '.repeat(60),
    boxW: 300, boxH: 120, maxFontSize: 96, minFontSize: 14, lineHeight: 1.5, ...FONT,
  });
  assert.ok(size >= 14 && size <= 96, `got ${size}`);
});

test('short copy in a big box keeps the design ceiling', () => {
  const size = fitFontSize({ text: 'Hi', boxW: 1000, boxH: 600, maxFontSize: 96, minFontSize: 40, lineHeight: 1.05, ...FONT });
  assert.equal(size, 96);
});

test('the fitted text actually fits the box it was fitted to', () => {
  const text = 'Thoroughbred sales hit a decade high across the Waikato as new owners entered the market.';
  const boxW = 420;
  const boxH = 180;
  const lineHeight = 1.5;
  const size = fitFontSize({ text, boxW, boxH, maxFontSize: 60, minFontSize: 12, lineHeight, ...FONT });
  const h = estimateTextHeight({ text, fontSize: size, boxWidthPx: boxW, lineHeight, ...FONT });
  assert.ok(h <= boxH, `fitted to ${size}px but estimates ${h}px in a ${boxH}px box`);
});

test('more copy in the same box never yields a LARGER size (monotonic)', () => {
  const box = { boxW: 400, boxH: 200, maxFontSize: 72, minFontSize: 10, lineHeight: 1.4, ...FONT };
  let prev = Infinity;
  for (const n of [1, 5, 20, 60, 200]) {
    const size = fitFontSize({ text: 'word '.repeat(n), ...box });
    assert.ok(size <= prev, `${n} words fitted larger (${size}) than fewer words (${prev})`);
    prev = size;
  }
});

test('a narrower box never yields a LARGER size', () => {
  const text = 'Sales hit a decade high across the region this season.';
  let prev = 0;
  for (const boxW of [120, 240, 480, 960]) {
    const size = fitFontSize({ text, boxW, boxH: 300, maxFontSize: 72, minFontSize: 10, lineHeight: 1.3, ...FONT });
    assert.ok(size >= prev, `widening to ${boxW} shrank the size (${size} < ${prev})`);
    prev = size;
  }
});

test('the longest WORD must fit the box width — no mid-word breaks', () => {
  // "THOROUGHBRED" splitting as THOROUG|HBRED always reads as broken, so the
  // fitter shrinks until the widest word fits.
  const boxW = 200;
  const size = fitFontSize({
    text: 'THOROUGHBRED', boxW, boxH: 400, maxFontSize: 96, minFontSize: 8, lineHeight: 1.05, ...FONT,
  });
  const oneLine = estimateTextHeight({ text: 'THOROUGHBRED', fontSize: size, boxWidthPx: boxW, lineHeight: 1.05, ...FONT });
  assert.ok(oneLine <= size * 1.05 * 1.01, `expected a single line at ${size}px, got ${oneLine}px of height`);
});

test('empty or tag-only text returns the ceiling rather than collapsing', () => {
  for (const text of ['', '   ', '<b></b>', '<br>']) {
    assert.equal(fitFontSize({ text, boxW: 300, boxH: 100, maxFontSize: 40, minFontSize: 12, lineHeight: 1.3, ...FONT }), 40);
  }
});

test('explicit newlines are honoured as line breaks', () => {
  const oneLine = estimateTextHeight({ text: 'a', fontSize: 20, boxWidthPx: 500, lineHeight: 1.5, ...FONT });
  const threeLines = estimateTextHeight({ text: 'a\nb\nc', fontSize: 20, boxWidthPx: 500, lineHeight: 1.5, ...FONT });
  assert.ok(threeLines >= oneLine * 3 - 0.01, `expected ~3× the height, got ${threeLines} vs ${oneLine}`);
});

test('uppercase transform measures wider than mixed case', () => {
  const args = { text: 'sales hit a decade high', fontSize: 40, boxWidthPx: 300, lineHeight: 1.2, ...FONT };
  const plain = estimateTextHeight(args);
  const upper = estimateTextHeight({ ...args, textTransform: 'uppercase' });
  assert.ok(upper >= plain, 'uppercasing widens real glyphs, so it must not measure narrower');
});

test('HTML tags do not count toward measured length', () => {
  const bare = estimateTextHeight({ text: 'hello world', fontSize: 30, boxWidthPx: 400, lineHeight: 1.3, ...FONT });
  const tagged = estimateTextHeight({ text: '<b>hello</b> <i>world</i>', fontSize: 30, boxWidthPx: 400, lineHeight: 1.3, ...FONT });
  assert.equal(tagged, bare);
});

test('contrastRatio matches the WCAG extremes', () => {
  assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio('#ffffff', '#ffffff') - 1) < 0.01);
  assert.equal(contrastRatio('#000000', '#ffffff'), contrastRatio('#ffffff', '#000000'), 'must be symmetric');
});

test('readableColor keeps a legible choice and replaces an illegible one', () => {
  // Legible already → kept.
  assert.equal(readableColor('#ffffff', '#0e0e0e', '#ffffff', '#111111'), '#ffffff');
  // Light grey on white fails 3.5:1 → swap to the dark candidate.
  assert.equal(readableColor('#eeeeee', '#ffffff', '#ffffff', '#111111'), '#111111');
  // Dark on a dark scrim → swap to the light candidate.
  assert.equal(readableColor('#111111', '#0e0e0e', '#ffffff', '#111111'), '#ffffff');
});

test('refitText only touches shrink-to-fit text that declares a ceiling', () => {
  const els = [
    // Generated: autoFit shrink + maxFontSize → refit.
    { id: 'a', type: 'text', x: 0, y: 0, w: 200, h: 40, rotation: 0, zIndex: 0, locked: false, source: 'ai-agent',
      text: { content: 'A long headline that cannot possibly fit at ninety-six pixels', role: 'headline', fontFamily: FONT.fontFamily, fontSize: 96, maxFontSize: 96, fontWeight: 800, color: '#111111', align: 'left', lineHeight: 1.05, autoFit: 'shrink' } },
    // Extracted: no maxFontSize → the extractor's measured size is authoritative.
    { id: 'b', type: 'text', x: 0, y: 0, w: 200, h: 40, rotation: 0, zIndex: 0, locked: false, source: 'extracted',
      text: { content: 'Measured from the source PDF', role: 'body', fontFamily: FONT.fontFamily, fontSize: 33, fontWeight: 400, color: '#111111', align: 'left', lineHeight: 1.2, autoFit: 'shrink' } },
    // Clip: opted out of shrinking.
    { id: 'c', type: 'text', x: 0, y: 0, w: 200, h: 40, rotation: 0, zIndex: 0, locked: false, source: 'manual',
      text: { content: 'Deliberately clipped, not shrunk', role: 'body', fontFamily: FONT.fontFamily, fontSize: 80, maxFontSize: 80, fontWeight: 400, color: '#111111', align: 'left', lineHeight: 1.3, autoFit: 'clip' } },
  ] as unknown as MagazineElement[];

  const out = refitText(els);
  assert.ok(out[0]!.text!.fontSize < 96, 'generated text should have been shrunk to fit');
  assert.equal(out[1]!.text!.fontSize, 33, 'extracted text must keep its measured size');
  assert.equal(out[2]!.text!.fontSize, 80, 'clip text must not be refitted');
});
