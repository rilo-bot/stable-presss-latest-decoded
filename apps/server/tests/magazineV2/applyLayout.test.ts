// Reflow + theme derivation for "take this layout" (P2 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// The stakes here are somebody's writing. A layout change that quietly drops a
// paragraph, or puts the byline where the headline should be, is worse than one that
// refuses — so these tests are about where content LANDS and what happens to what
// doesn't fit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { reflowContent, themeForPage, applyReadingToPage } from '../../src/lib/magazineV2/applyLayout.ts';
import { normalizeLayoutReading } from '../../src/lib/magazineV2/layoutReading.ts';
import type { MagazineElement } from '../../src/lib/magazineV2/model.ts';

let seq = 0;
const el = (o: Partial<MagazineElement>): MagazineElement => ({
  id: `e${++seq}`, type: 'text', x: 0, y: 0, w: 400, h: 100,
  rotation: 0, zIndex: 1, locked: false, source: 'manual', ...o,
} as MagazineElement);

const text = (role: string, content: string, extra: Partial<MagazineElement> = {}) => el({
  type: 'text',
  text: { content, role, fontFamily: 'Inter, Arial, sans-serif', fontSize: 24, fontWeight: 400, color: '#1a1a1a', align: 'left', lineHeight: 1.4, autoFit: 'shrink' },
  ...extra,
} as Partial<MagazineElement>);

const image = (url: string, w = 800, h = 600) => el({
  type: 'image', w, h, image: { assetId: 'a1', url, alt: '', fit: 'cover' },
} as Partial<MagazineElement>);

const slots = (...pairs: [string, string][]) => pairs.map(([ref, role]) => ({ ref, role }));

// ── Where content lands ──────────────────────────────────────────────────────

test('each role goes to its own slot', () => {
  const { content } = reflowContent(
    slots(['headline', 'headline'], ['body', 'body'], ['hero', 'image']),
    [text('body', 'Some prose.'), text('headline', 'The Big Story'), image('https://x/p.jpg')],
  );
  assert.equal(content.headline?.text, 'The Big Story');
  assert.equal(content.body?.text, 'Some prose.');
  assert.equal(content.hero?.image?.url, 'https://x/p.jpg');
});

test('the biggest photo becomes the hero', () => {
  const { content } = reflowContent(
    slots(['hero', 'image'], ['photo1', 'image']),
    [image('https://x/small.jpg', 200, 150), image('https://x/big.jpg', 1600, 1200)],
  );
  assert.equal(content.hero?.image?.url, 'https://x/big.jpg', 'the hero box gets the hero photo');
  assert.equal(content.photo1?.image?.url, 'https://x/small.jpg');
});

test('a kicker slot accepts a subhead, a figure accepts a headline', () => {
  // The element model's text roles are coarser than the DSL's leaf roles, so the
  // mapping has to be explicit or half the slots would silently come out empty.
  const { content } = reflowContent(
    slots(['kicker', 'kicker'], ['figure', 'figure']),
    [text('subhead', 'RACING'), text('headline', '150')],
  );
  assert.equal(content.kicker?.text, 'RACING');
  assert.equal(content.figure?.text, '150');
});

test('the longest prose wins the first body slot', () => {
  const { content } = reflowContent(
    slots(['body', 'body'], ['body2', 'body']),
    [text('body', 'Short.'), text('body', 'A considerably longer paragraph than the other one.')],
  );
  assert.match(content.body!.text!, /considerably longer/);
  assert.equal(content.body2?.text, 'Short.');
});

test('unroled copy fills slots that have no role match, longest first', () => {
  const { content } = reflowContent(
    slots(['headline', 'headline'], ['body', 'body']),
    [text('other', 'tiny'), text('other', 'a much longer piece of unroled copy')],
  );
  // Neither is a headline, so the slot takes the best available rather than sitting
  // empty and letting pruneSpec delete a box the reference actually had.
  assert.match(content.headline!.text!, /much longer/);
  assert.equal(content.body?.text, 'tiny');
});

// ── What happens to what doesn't fit ─────────────────────────────────────────

test('spare prose joins the body slot rather than vanishing', () => {
  const { content, leftOver } = reflowContent(
    slots(['headline', 'headline'], ['body', 'body']),
    [text('headline', 'Title'), text('body', 'First paragraph.'), text('body', 'Second paragraph.'), text('body', 'Third paragraph.')],
  );
  assert.equal(leftOver.text, 0, 'nothing was lost');
  assert.match(content.body!.text!, /First paragraph/);
  assert.match(content.body!.text!, /Second paragraph/);
  assert.match(content.body!.text!, /Third paragraph/);
});

test('surplus PHOTOS are reported, because they cannot be merged', () => {
  // Four photos into a one-photo layout: three have nowhere to go, and the user has
  // to be told rather than left to notice.
  const { leftOver } = reflowContent(
    slots(['hero', 'image']),
    [image('https://x/1.jpg', 900, 900), image('https://x/2.jpg'), image('https://x/3.jpg'), image('https://x/4.jpg')],
  );
  assert.equal(leftOver.images, 3);
});

test('spare prose with NO body slot anywhere is reported, not silently dropped', () => {
  const { leftOver } = reflowContent(
    slots(['headline', 'headline'], ['hero', 'image']),
    [text('headline', 'Title'), text('body', 'A paragraph with nowhere to go.')],
  );
  assert.equal(leftOver.text, 1);
});

test('empty text elements are not content', () => {
  const { content, leftOver } = reflowContent(
    slots(['headline', 'headline'], ['body', 'body']),
    [text('headline', '   '), text('body', '<p></p>'), text('body', 'Real copy.')],
  );
  assert.equal(content.headline, undefined, 'whitespace is not a headline');
  assert.equal(content.body?.text, 'Real copy.');
  assert.equal(leftOver.text, 0);
});

test('shape slots are left unfilled — they are scrims, not content', () => {
  const { content } = reflowContent(
    slots(['hero', 'image'], ['shape', 'shape'], ['headline', 'headline']),
    [image('https://x/p.jpg'), text('headline', 'Over the photo')],
  );
  assert.equal(content.shape, undefined);
  assert.equal(content.headline?.text, 'Over the photo');
});

// ── Theme ────────────────────────────────────────────────────────────────────

test('genTheme wins when the magazine has one', () => {
  const theme = themeForPage(
    { palette: { bg: '#ffffff', text: '#111111', primary: '#883333', secondary: '#666666', accent: '#d4a843' }, fonts: { display: 'Oswald', body: 'Inter' } },
    { elements: [text('body', 'x')] },
  );
  assert.equal(theme.palette.accent, '#d4a843');
  assert.equal(theme.fonts.display, 'Oswald');
});

test('with no genTheme the theme is DERIVED FROM THE PAGE, not invented', () => {
  // Applying a layout must change a page's structure, not repaint it in colours it
  // never had — which is what a synthesised theme would do to a PDF import.
  const theme = themeForPage(null, {
    background: { type: 'color', value: '#f4f1e8' },
    elements: [
      text('headline', 'Big', { text: { content: 'Big', role: 'headline', fontFamily: 'Playfair Display, serif', fontSize: 80, fontWeight: 800, color: '#2b2b2b', align: 'left', lineHeight: 1.1, autoFit: 'shrink' } } as Partial<MagazineElement>),
      text('body', 'one', { text: { content: 'one', role: 'body', fontFamily: 'Inter, Arial, sans-serif', fontSize: 20, fontWeight: 400, color: '#2b2b2b', align: 'left', lineHeight: 1.4, autoFit: 'shrink' } } as Partial<MagazineElement>),
      text('body', 'two', { text: { content: 'two', role: 'body', fontFamily: 'Inter, Arial, sans-serif', fontSize: 20, fontWeight: 400, color: '#2b2b2b', align: 'left', lineHeight: 1.4, autoFit: 'shrink' } } as Partial<MagazineElement>),
      text('kicker', 'k', { text: { content: 'k', role: 'subhead', fontFamily: 'Inter, Arial, sans-serif', fontSize: 14, fontWeight: 700, color: '#b8860b', align: 'left', lineHeight: 1.2, autoFit: 'shrink' } } as Partial<MagazineElement>),
    ],
  });
  assert.equal(theme.palette.bg, '#f4f1e8', "the page's own ground");
  assert.equal(theme.palette.text, '#2b2b2b', 'the colour most of the words are in');
  assert.equal(theme.palette.accent, '#b8860b', "the page's second colour is its emphasis");
  assert.match(theme.fonts.display, /Playfair/, 'the largest text sets the display face');
  assert.match(theme.fonts.body, /Inter/, 'the commonest family sets the body face');
});

test('a monochrome page stays monochrome', () => {
  const theme = themeForPage(null, { elements: [text('body', 'a'), text('body', 'b')] });
  assert.equal(theme.palette.accent, theme.palette.text, 'no second colour is invented');
});

test('an empty page falls back to defaults instead of throwing', () => {
  const theme = themeForPage(null, { elements: [] });
  assert.ok(/^#[0-9a-f]{6}$/i.test(theme.palette.text));
  assert.ok(theme.fonts.display.length > 0);
});

// ── End to end, with no database ─────────────────────────────────────────────

const reading = (regions: Record<string, unknown>[]) => {
  const r = normalizeLayoutReading({ regions });
  assert.ok(r);
  return r;
};

test('a page and a reading become a solved page', () => {
  const out = applyReadingToPage(
    reading([
      { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.55 } },
      { role: 'headline', box: { x: 0.06, y: 0.6, w: 0.88, h: 0.12 } },
      { role: 'body', box: { x: 0.06, y: 0.75, w: 0.88, h: 0.2 } },
    ]),
    {
      width: 1275, height: 1650,
      elements: [image('https://x/p.jpg', 1200, 900), text('headline', 'The Big Story'), text('body', 'A paragraph of real copy that belongs on this page.')],
    },
    null,
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  assert.ok(out.page.elements.length >= 3);
  // The solver is the sole pixel authority: everything it produced must be on the page.
  for (const e of out.page.elements) {
    assert.ok(e.x >= 0 && e.y >= 0, `${e.type} starts on the page`);
    assert.ok(e.x + e.w <= 1275 + 1 && e.y + e.h <= 1650 + 1, `${e.type} ends on the page`);
  }
  const kinds = out.page.elements.map((e) => e.type);
  assert.ok(kinds.includes('image'));
  assert.ok(kinds.includes('text'));
});

test('a page with nothing on it is refused with a reason, not filled with blanks', () => {
  const out = applyReadingToPage(
    reading([
      { role: 'headline', box: { x: 0, y: 0, w: 1, h: 0.3 } },
      { role: 'body', box: { x: 0, y: 0.4, w: 1, h: 0.5 } },
    ]),
    { width: 1275, height: 1650, elements: [] },
    null,
  );
  assert.equal(out.page, null);
  assert.match(out.why, /no content/i);
});

test('the reference decides the proportions: a taller photo band gives a taller photo', () => {
  const page = {
    width: 1275, height: 1650,
    elements: [image('https://x/p.jpg', 1200, 900), text('body', 'Copy that fills the rest of the page nicely.')],
  };
  const shallow = applyReadingToPage(reading([
    { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.3 } },
    { role: 'body', box: { x: 0, y: 0.32, w: 1, h: 0.68 } },
  ]), page, null);
  const deep = applyReadingToPage(reading([
    { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.75 } },
    { role: 'body', box: { x: 0, y: 0.77, w: 1, h: 0.23 } },
  ]), page, null);
  assert.ok(shallow.page && deep.page);
  const h = (r: typeof shallow) => r.page!.elements.find((e) => e.type === 'image')!.h;
  assert.ok(h(deep) > h(shallow) * 1.8, `${h(deep)} should dwarf ${h(shallow)}`);
});
