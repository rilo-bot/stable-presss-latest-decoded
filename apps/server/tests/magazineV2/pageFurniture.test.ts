// ---------------------------------------------------------------------------
// pageFurniture — the running head and the folio.
//
// Furniture is appended AFTER a page has already passed layout QA, so it gets no
// second chance to be checked: if it could overlap content, or land ink that can't
// be read on the ground it sits on, nothing downstream would catch it. Those two
// properties are therefore what these tests pin, together with the one that only
// bites later — a folio that still prints its old number after a reorder.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageFurniture, restampFolio, freeBands, FOLIO_ELEMENT_ID, BAND_MIN, type FurnitureContext, type FurnishablePage } from '../../src/lib/magazineV2/pageFurniture.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';
import { normalizeElements } from '../../src/lib/magazineV2/writePipeline.js';
import { contrastRatio } from '../../src/lib/magazineV2/layout.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';
import type { PageTemplateKind } from '../../src/lib/magazineV2/templates.js';

const palette = { primary: '#1f3d2b', secondary: '#5c6b60', accent: '#d4a843', bg: '#faf7f0', text: '#141414' };
const fonts = { display: 'Playfair Display', body: 'Inter' };

function ctx(over: Partial<FurnitureContext> = {}): FurnitureContext {
  return {
    kind: 'two-column-article' as PageTemplateKind,
    sectionTitle: 'The Inner Clock',
    magazineTitle: 'Good Morning Horse',
    pageNumber: 3,
    palette,
    fonts,
    ...over,
  };
}

/** A page whose content respects the default `md` (36px) page margin — what the
 *  solver produces for an ordinary AI-authored page. */
function page(boxes: { x: number; y: number; w: number; h: number }[], bg = { type: 'color' as const, value: palette.bg }): FurnishablePage {
  const elements = normalizeElements(
    boxes.map((b, i) => ({
      id: `content-${i}`,
      type: 'text',
      ...b,
      text: { content: 'Real copy here', role: 'body', fontFamily: fonts.body, fontSize: 18, fontWeight: 400, color: palette.text, align: 'left', lineHeight: 1.4, autoFit: 'clip' },
    })),
    { width: PAGE_W, height: PAGE_H },
  );
  return { background: bg, elements };
}

const M = 36;
const INSET_PAGE = [{ x: M, y: M, w: PAGE_W - 2 * M, h: PAGE_H - 2 * M }];

function overlaps(a: MagazineElement, b: MagazineElement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('furniture NEVER overlaps the page content it was appended to', () => {
  const p = page(INSET_PAGE);
  const furniture = pageFurniture(p, ctx());
  assert.ok(furniture.length >= 4, `expected a head and a folio, got ${furniture.length}`);
  for (const f of furniture) {
    for (const c of p.elements) {
      assert.ok(!overlaps(f, c), `${f.id} overlaps ${c.id}`);
    }
    assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= PAGE_W && f.y + f.h <= PAGE_H, `${f.id} escapes the page`);
  }
});

test('a band that content already occupies gets no furniture', () => {
  // A full-bleed hero: no clear space at either edge, so neither piece is emitted.
  const bleed = page([{ x: 0, y: 0, w: PAGE_W, h: PAGE_H }]);
  assert.deepEqual(pageFurniture(bleed, ctx()), []);

  // Content flush to the top only → the folio survives, the running head does not.
  const topFlush = page([{ x: M, y: 0, w: PAGE_W - 2 * M, h: PAGE_H - 2 * M }]);
  const ids = pageFurniture(topFlush, ctx()).map((e) => e.id);
  assert.ok(ids.includes(FOLIO_ELEMENT_ID), 'the bottom band was clear — expected a folio');
  assert.ok(!ids.some((id) => id.startsWith('furniture-head')), 'the top band was occupied');
});

test('a band one pixel under the minimum is refused rather than squeezed', () => {
  const tight = page([{ x: M, y: BAND_MIN - 1, w: PAGE_W - 2 * M, h: PAGE_H - 2 * (BAND_MIN - 1) }]);
  assert.ok(!pageFurniture(tight, ctx()).some((e) => e.id.startsWith('furniture-head')));

  const exact = page([{ x: M, y: BAND_MIN, w: PAGE_W - 2 * M, h: PAGE_H - 2 * BAND_MIN }]);
  assert.ok(pageFurniture(exact, ctx()).some((e) => e.id.startsWith('furniture-head')));
});

test('cover and back-cover carry no furniture', () => {
  for (const kind of ['cover', 'back-cover'] as PageTemplateKind[]) {
    assert.deepEqual(pageFurniture(page(INSET_PAGE), ctx({ kind })), [], `${kind} should stay bare`);
  }
});

test('a page whose ground is a photo gets none — the contrast is unknowable', () => {
  const p = page(INSET_PAGE, { type: 'image', value: 'https://cdn.example.com/scan.jpg' });
  assert.deepEqual(pageFurniture(p, ctx()), []);
});

test('every stop of a gradient ground is checked, not just one', () => {
  // composeFromSolved paints a bold background as a three-stop diagonal gradient
  // (shade(base,+0.12), base, shade(base,−0.22)), so "the background is X" has three
  // answers. This fixture is chosen so the MIDDLE stop flatters both inks — primary
  // reads 3.97:1 there and secondary 4.46:1 — while each falls to ~2.5:1 on the dark
  // stop, and a palette extreme would have managed 5.70:1 on the worst of the three.
  // Sampling one stop therefore keeps ink that measurably should have been replaced.
  const ground = { type: 'color' as const, value: 'linear-gradient(135deg, #b2c5b9 0%, #a8bdb0 45%, #839389 100%)' };
  const stops = ['#b2c5b9', '#a8bdb0', '#839389'];
  const pal = { ...palette, primary: '#2f5a41', secondary: '#4a4a4a' };
  const furniture = pageFurniture(page(INSET_PAGE, ground), ctx({ palette: pal }));
  assert.ok(furniture.length > 0);

  const worst = (c: string) => Math.min(...stops.map((g) => contrastRatio(c, g)));
  const bestAvailable = Math.max(worst(pal.bg), worst(pal.text));
  for (const f of furniture) {
    const colour = f.type === 'text' ? f.text!.color : f.shape!.fill;
    // Either it reads everywhere, or it is no worse than the best fallback there was.
    assert.ok(
      worst(colour) >= 3.5 || worst(colour) >= bestAvailable,
      `${f.id} paints ${colour}: worst stop ${worst(colour).toFixed(2)}:1, but ${bestAvailable.toFixed(2)}:1 was available`,
    );
  }
});

test('the section label falls back to the page kind, and never repeats the title', () => {
  const noSection = pageFurniture(page(INSET_PAGE), ctx({ sectionTitle: '', kind: 'stat-infographic' as PageTemplateKind }));
  const label = noSection.find((e) => e.id === 'furniture-head-label');
  assert.equal(label?.text?.content, 'By the numbers');

  const same = pageFurniture(page(INSET_PAGE), ctx({ sectionTitle: 'Good Morning Horse' }));
  assert.equal(same.find((e) => e.id === 'furniture-head-title'), undefined, 'the masthead was already the section label');
  const only = same.find((e) => e.id === 'furniture-head-label')!;
  assert.equal(only.text!.content, 'Good Morning Horse');
  assert.equal(only.text!.textTransform, 'uppercase', 'the label is set in caps by style, not by rewriting the words');
  assert.equal(only.w, PAGE_W - 2 * 36, 'with no masthead beside it the label takes the full measure');
});

test('the running head never repeats words the page already carries', () => {
  // A real page shipped reading "Reading the Walk" in the running head directly above
  // "READING THE WALK" as the kicker — the copywriter is told a kicker is a 2–4 word
  // section tag, so it lands on the section title almost every time.
  const withKicker = normalizeElements(
    [
      {
        id: 'kicker',
        type: 'text',
        x: M,
        y: 200,
        w: 600,
        h: 40,
        text: { content: 'READING THE WALK', role: 'subhead', fontFamily: fonts.body, fontSize: 24, fontWeight: 700, color: palette.accent, align: 'left', lineHeight: 1.2, autoFit: 'clip' },
      },
      { id: 'body', type: 'text', x: M, y: 260, w: PAGE_W - 2 * M, h: PAGE_H - 300, text: { content: 'Real copy.', role: 'body', fontFamily: fonts.body, fontSize: 18, fontWeight: 400, color: palette.text, align: 'left', lineHeight: 1.4, autoFit: 'clip' } },
    ],
    { width: PAGE_W, height: PAGE_H },
  );
  const furniture = pageFurniture({ background: { type: 'color', value: palette.bg }, elements: withKicker }, ctx({ sectionTitle: 'Reading the Walk' }));
  const label = furniture.find((e) => e.id === 'furniture-head-label');
  assert.ok(label, 'the page still gets a running head');
  assert.equal(label!.text!.content, 'Feature', 'it falls back to the kind rather than echoing the kicker');
  // THE FALLBACK COLLIDES TOO, and this is the page that shipped: on a stat page the
  // kicker is "BY THE NUMBERS" and KIND_LABEL['stat-infographic'] is "By the numbers", so
  // guarding only the section title moved the duplicate from one source to the other.
  const statPage = normalizeElements(
    [
      { id: 'k', type: 'text', x: M, y: 150, w: 600, h: 40, text: { content: 'BY THE NUMBERS', role: 'subhead', fontFamily: fonts.body, fontSize: 24, fontWeight: 700, color: palette.accent, align: 'left', lineHeight: 1.2, autoFit: 'clip' } },
      { id: 'h', type: 'text', x: M, y: 210, w: PAGE_W - 2 * M, h: PAGE_H - 300, text: { content: 'The Favorites, Split', role: 'headline', fontFamily: fonts.display, fontSize: 70, fontWeight: 800, color: palette.text, align: 'left', lineHeight: 1.05, autoFit: 'clip' } },
    ],
    { width: PAGE_W, height: PAGE_H },
  );
  const stat = pageFurniture(
    { background: { type: 'color', value: palette.bg }, elements: statPage },
    ctx({ kind: 'stat-infographic' as PageTemplateKind, sectionTitle: 'By the numbers' }),
  );
  assert.equal(stat.find((e) => e.id === 'furniture-head-label'), undefined, 'no label survives — both candidates are already on the page');
  assert.ok(stat.find((e) => e.id === 'furniture-head-title'), 'the masthead still runs, and takes the full measure');
  assert.equal(stat.find((e) => e.id === 'furniture-head-title')!.w, PAGE_W - 2 * M);

  // Same rule for the masthead: if the page itself sets the title, the head drops it.
  const withTitle = normalizeElements(
    [{ id: 't', type: 'text', x: M, y: 200, w: 900, h: 120, text: { content: 'Good Morning Horse', role: 'headline', fontFamily: fonts.display, fontSize: 80, fontWeight: 800, color: palette.text, align: 'left', lineHeight: 1.05, autoFit: 'clip' } }],
    { width: PAGE_W, height: PAGE_H },
  );
  const f2 = pageFurniture({ background: { type: 'color', value: palette.bg }, elements: withTitle }, ctx({ sectionTitle: 'The Inner Clock' }));
  assert.equal(f2.find((e) => e.id === 'furniture-head-title'), undefined);
  assert.equal(f2.find((e) => e.id === 'furniture-head-label')?.text?.content, 'The Inner Clock');
});

test('the folio hugs the outer edge: right on a recto, left on a verso', () => {
  const recto = pageFurniture(page(INSET_PAGE), ctx({ pageNumber: 3 })).find((e) => e.id === FOLIO_ELEMENT_ID);
  const verso = pageFurniture(page(INSET_PAGE), ctx({ pageNumber: 4 })).find((e) => e.id === FOLIO_ELEMENT_ID);
  assert.equal(recto?.text?.content, '3');
  assert.equal(recto?.text?.align, 'right');
  assert.equal(verso?.text?.align, 'left');
});

test('furniture keeps a fixed size — refitText must never shrink a running head', () => {
  // refitText only touches text that is autoFit:'shrink' AND declares a maxFontSize.
  // A running head that fell to its 55% floor would print at ~4pt.
  for (const f of pageFurniture(page(INSET_PAGE), ctx())) {
    if (f.type !== 'text') continue;
    assert.equal(f.text!.autoFit, 'clip');
    assert.equal(f.text!.maxFontSize, undefined);
    assert.ok(f.text!.fontSize >= 11, `${f.id} is ${f.text!.fontSize}px`);
  }
});

test('restampFolio renumbers a moved page and reports when there is nothing to do', () => {
  const els = [...page(INSET_PAGE).elements, ...pageFurniture(page(INSET_PAGE), ctx({ pageNumber: 7 }))];
  assert.equal(restampFolio(els, 7), null, 'already correct');

  const moved = restampFolio(els, 2);
  assert.ok(moved, 'page 7 became page 2 — the folio must follow');
  const folio = moved!.find((e) => e.id === FOLIO_ELEMENT_ID)!;
  assert.equal(folio.text!.content, '2');
  assert.equal(folio.text!.align, 'left', 'an even page is a verso');
  // Geometry is untouched, which is what makes the repair safe to run on a reorder.
  const before = els.find((e) => e.id === FOLIO_ELEMENT_ID)!;
  assert.deepEqual([folio.x, folio.y, folio.w, folio.h], [before.x, before.y, before.w, before.h]);
  // Nothing else on the page moved either.
  assert.equal(moved!.length, els.length);

  assert.equal(restampFolio(page(INSET_PAGE).elements, 2), null, 'a page with no folio is left alone');
});

test('freeBands reports zero, not a negative, for content that escapes the page', () => {
  const b = freeBands([{ id: 'x', type: 'shape', x: -10, y: -10, w: PAGE_W + 20, h: PAGE_H + 20, rotation: 0, zIndex: 0, locked: false, source: 'manual' } as MagazineElement]);
  assert.deepEqual(b, { top: 0, bottom: 0, left: 0, right: 0 });
});
