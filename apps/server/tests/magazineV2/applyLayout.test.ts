// Reflow + theme derivation for "take this layout" (P2 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// The stakes here are somebody's writing. A layout change that quietly drops a
// paragraph, or puts the byline where the headline should be, is worse than one that
// refuses — so these tests are about where content LANDS and what happens to what
// doesn't fit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { reflowContent, themeForPage, applyReadingToPage, contrastRatio, tightSummary } from '../../src/lib/magazineV2/applyLayout.ts';
import { normalizeLayoutReading } from '../../src/lib/magazineV2/layoutReading.ts';
import type { MagazineElement } from '../../src/lib/magazineV2/model.ts';
import { PAGE_H, PAGE_W } from '../../src/lib/magazineV2/config.ts';
import { pageFurniture, restampFolio, FURNITURE_IDS, FOLIO_ELEMENT_ID } from '../../src/lib/magazineV2/pageFurniture.ts';

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

test("a PDF page's photo lives in the BACKGROUND, and it fills the hero slot", () => {
  // Reported from a real run: applying a layout "removed the existing images and ruined
  // the page". processPage stores an imported page's photography as
  // `background: {type:'image'}` with ZERO image elements, so reading only `elements`
  // left the hero empty — pruned, re-partitioned, and the background then overwritten
  // with a flat colour. The page's only picture, deleted by a layout change.
  const { content, usedBackground } = reflowContent(
    slots(['hero', 'image'], ['headline', 'headline']),
    [text('headline', 'A Scanned Spread')],
    'https://x/page-3-background.jpg',
  );
  assert.equal(content.hero?.image?.url, 'https://x/page-3-background.jpg');
  assert.equal(usedBackground, true);
});

test('the background image is the FIRST candidate — it is the biggest picture there is', () => {
  const { content } = reflowContent(
    slots(['hero', 'image'], ['photo1', 'image']),
    [image('https://x/inset.jpg', 300, 200)],
    'https://x/full-page.jpg',
  );
  assert.equal(content.hero?.image?.url, 'https://x/full-page.jpg');
  assert.equal(content.photo1?.image?.url, 'https://x/inset.jpg');
});

test('a background photo the layout has no room for is KEPT, not painted over', () => {
  // A text-only reference on an imported page: nothing consumes the background, so it
  // must survive. composeFromSolved always returns a colour, and writing it would
  // destroy the photograph.
  const out = applyReadingToPage(
    reading([
      { role: 'headline', box: { x: 0.1, y: 0.1, w: 0.8, h: 0.15 } },
      { role: 'body', box: { x: 0.1, y: 0.3, w: 0.8, h: 0.6 } },
    ]),
    {
      width: PAGE_W, height: PAGE_H,
      background: { type: 'image', value: 'https://x/scan.jpg' },
      elements: [text('headline', 'Kept'), text('body', 'The prose of the page.')],
    },
    null,
  );
  assert.ok(out.page);
  assert.equal(out.page.background.type, 'image');
  assert.equal(out.page.background.value, 'https://x/scan.jpg');
});

test('but once the photo becomes a full-bleed element, the colour background is right', () => {
  const out = applyReadingToPage(
    reading([
      { role: 'image', box: { x: 0, y: 0, w: 1, h: 1 } },
      { role: 'headline', box: { x: 0.1, y: 0.7, w: 0.8, h: 0.12 } },
    ], { margin: 'none' }),
    {
      width: PAGE_W, height: PAGE_H,
      background: { type: 'image', value: 'https://x/scan.jpg' },
      elements: [text('headline', 'Over the photo')],
    },
    null,
  );
  assert.ok(out.page);
  assert.equal(out.page.background.type, 'color', 'the element covers the page, so the paint underneath is moot');
  const photo = out.page.elements.find((e) => e.type === 'image');
  assert.equal(photo?.image?.url, 'https://x/scan.jpg', 'and the photo is still on the page');
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

test('a slot with no role match takes SPARE copy rather than being left empty', () => {
  // An empty slot is not a small loss: pruneSpec deletes it and the page RE-PARTITIONS,
  // throwing away the arrangement we were asked to reproduce. A cover reference wanting
  // a standfirst, on a page that has captions and no standfirst, must still get one.
  const { content } = reflowContent(
    slots(['headline', 'headline'], ['subhead', 'subhead']),
    [text('headline', 'The Title'), text('caption', 'A spare line of copy.')],
  );
  assert.equal(content.headline?.text, 'The Title');
  assert.equal(content.subhead?.text, 'A spare line of copy.');
});

test('but a slot NEVER steals copy that a later slot matches exactly', () => {
  // The flaw the two-pass split fixes: filling opportunistically in one pass let the
  // headline slot grab the body paragraph that `body`, two slots later, matched.
  const { content } = reflowContent(
    slots(['headline', 'headline'], ['body', 'body']),
    [text('body', 'The one real paragraph on this page.')],
  );
  assert.equal(content.body?.text, 'The one real paragraph on this page.');
  assert.equal(content.headline, undefined, 'the headline goes without rather than robbing the body');
});

test('a terse slot takes the SHORTEST spare copy, not the longest', () => {
  // A 300-word paragraph in a caption box is worse than an empty caption box.
  const { content } = reflowContent(
    slots(['caption', 'caption'], ['headline', 'headline']),
    [text('body', 'Short.'), text('body', 'A considerably longer paragraph that would swamp a caption box entirely.')],
  );
  assert.equal(content.caption?.text, 'Short.');
  assert.match(content.headline!.text!, /considerably longer/);
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

const reading = (regions: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
  const r = normalizeLayoutReading({ regions, ...extra });
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
      width: PAGE_W, height: PAGE_H,
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
    assert.ok(e.x + e.w <= PAGE_W + 1 && e.y + e.h <= PAGE_H + 1, `${e.type} ends on the page`);
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
    { width: PAGE_W, height: PAGE_H, elements: [] },
    null,
  );
  assert.equal(out.page, null);
  assert.match(out.why, /no content/i);
});

test('A COVER, end to end: the empty half stays empty after pruning', () => {
  // The second half of the cover bug, reported from a real run as "loose (5%)".
  //
  // pruneSpec has an FR-GUARANTEE: a start-packed container left with only
  // content-sized children gets one promoted to `fr` so no strip trails uncovered.
  // Right for the generator, which must fill the page — catastrophic here. With one
  // cover slot unfillable, the promotion stretched the tagline over TWO THIRDS of the
  // sheet. applyReadingToPage now passes keepWhitespace, because a reference's empty
  // space IS its design.
  const H = PAGE_H;
  const out = applyReadingToPage(
    reading([
      { role: 'image', box: { x: 0, y: 0, w: 1, h: 1 } },
      { role: 'kicker', box: { x: 0.1, y: 0.03, w: 0.8, h: 0.025 } },
      { role: 'headline', box: { x: 0.08, y: 0.09, w: 0.84, h: 0.09 } },
      { role: 'subhead', box: { x: 0.28, y: 0.2, w: 0.44, h: 0.022 } },
      { role: 'headline', box: { x: 0.55, y: 0.3, w: 0.4, h: 0.14 } }, // unfillable: one headline on the page
    // 'none' is what a cover reading actually reports (the photo runs off every edge).
    // A page margin insets the whole tree, bleed included, so it matters here.
    ], { margin: 'none' }),
    {
      width: PAGE_W, height: H,
      elements: [
        image('https://x/cover.jpg', PAGE_W, PAGE_H),
        text('subhead', 'PRE-DAWN STABLES'),
        text('headline', 'The Hour Before Thunder'),
        text('caption', 'A groom’s steady hand, a coat catching first light.'),
      ],
    },
    null,
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  const texts = out.page.elements.filter((e) => e.type === 'text');
  assert.ok(texts.length >= 3);
  // Every line of the cover's text cluster belongs in the top third. Before the fix one
  // of them was 66% of the page tall and another sat at the very bottom.
  for (const t of texts) {
    assert.ok(t.h <= H * 0.25, `a ${t.text?.role} box is ${Math.round(t.h)}px tall — nothing in a cover cluster is a quarter of the page`);
    assert.ok(t.y + t.h <= H * 0.5, `a ${t.text?.role} ended at ${Math.round(t.y + t.h)} — the cluster belongs in the upper half`);
  }
  // And the photo still bleeds to every edge.
  const photo = out.page.elements.find((e) => e.type === 'image')!;
  assert.equal(photo.w, PAGE_W);
  assert.equal(photo.h, H);
  assert.equal(out.page.fidelity.verdict, 'adapted', 'one box could not be filled, so not a close match');
  // 0.5, not the 0.75 this once asserted. That threshold was an artefact of the very bug
  // Phase 0 removed: the full-bleed photo scored IoU 1.0 against area 1.0 BY CONSTRUCTION
  // and dragged the mean to 0.96 on its own. Measured honestly, with the guaranteed photo
  // excluded, this page is kicker 0.67, headline 0.66, subhead 0.00 → 0.60. A real
  // adaptation, and a number that can now move DOWN when the cluster drifts.
  assert.ok(out.page.fidelity.score > 0.5, `score ${out.page.fidelity.score.toFixed(2)} — it was 0.05 before the cover fix`);
  assert.ok(out.page.fidelity.score < 0.9, 'and no longer flattered by the guaranteed full-bleed photo');
});

test('the reference decides the proportions: a taller photo band gives a taller photo', () => {
  const page = {
    width: PAGE_W, height: PAGE_H,
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

// ── Legibility of a DERIVED palette (Phase 0 of docs/MAGAZINE-V2-BUILDER-PLAN.md) ──
//
// White type over a dark photograph is the commonest cover idiom there is, and on an
// imported page the photo lives in `background`. The ink derived to #ffffff — correctly,
// the words really are white — and the ground fell through to #ffffff too, because
// `background.type === 'color'` is false for an image. Consume the photo into a box that
// is not full-bleed and the rest of the sheet was painted white with white words on it:
// the page came out BLANK, and the fidelity score called it a match.

/** A text element with an explicit ink colour. */
const inked = (role: string, content: string, color: string, fontSize = 24) => el({
  type: 'text',
  text: { content, role, fontFamily: 'Inter, Arial, sans-serif', fontSize, fontWeight: 400, color, align: 'left', lineHeight: 1.4, autoFit: 'shrink' },
} as Partial<MagazineElement>);

test('white type over a background PHOTO never derives white-on-white', () => {
  const theme = themeForPage(null, {
    background: { type: 'image', value: 'https://x/dark-cover.jpg' },
    elements: [inked('headline', 'THE HORSE', '#ffffff'), inked('body', 'Inside the carnival.', '#ffffff')],
  });
  assert.notEqual(theme.palette.bg, theme.palette.text, 'the page would be blank');
  assert.ok(contrastRatio(theme.palette.text, theme.palette.bg) > 4.5, 'and readable, not merely different');
});

test('the GROUND moves, not the ink — white type stays white', () => {
  // Repainting the words dark would be legible and would throw the design away: the type
  // is white because it sat on a photograph, so the ground goes dark instead.
  const theme = themeForPage(null, {
    background: { type: 'image', value: 'https://x/dark-cover.jpg' },
    elements: [inked('headline', 'THE HORSE', '#ffffff')],
  });
  assert.equal(theme.palette.text, '#ffffff', "the page's own ink is kept");
  assert.ok(contrastRatio(theme.palette.bg, '#ffffff') > 4.5, 'the ground went dark');
});

test('an ink that reads on NEITHER ground is the one case where the ink moves', () => {
  // A mid grey on a mid grey cannot be saved by moving the ground, and being visible
  // outranks provenance.
  const theme = themeForPage({ palette: { bg: '#7f7f7f' } }, {
    elements: [inked('body', 'grey on grey', '#828282')],
  });
  assert.ok(contrastRatio(theme.palette.text, theme.palette.bg) > 1.6, 'something had to move');
});

test('accents that vanish into the ground fall back to the ink', () => {
  // Captions resolve through `secondary` and kickers through `accent` (roleScale), so the
  // FAMILY is "any ink that resolves against the ground" — not just `text`. Guarding only
  // bg-vs-text would have left an invisible caption on the same page.
  const theme = themeForPage(
    { palette: { bg: '#ffffff', text: '#111111', primary: '#fdfdfd', secondary: '#ffffff', accent: '#fefefe' } },
    { elements: [inked('body', 'x', '#111111')] },
  );
  for (const role of ['primary', 'secondary', 'accent'] as const) {
    assert.ok(
      contrastRatio(theme.palette[role], theme.palette.bg) > 1.6,
      `${role} ${theme.palette[role]} is invisible on ${theme.palette.bg}`,
    );
  }
});

test('a legitimate low-contrast BRAND accent is left alone', () => {
  // The guard is for disappearance, not for WCAG AA. This product's gold sits at ~2.1:1 on
  // white by design; repainting it here would recolour every magazine and belongs to
  // docs/THEME-REVIEW.md, not to a layout apply.
  const theme = themeForPage(
    { palette: { bg: '#ffffff', text: '#111111', primary: '#883333', secondary: '#666666', accent: '#d4a843' } },
    { elements: [inked('body', 'x', '#111111')] },
  );
  assert.equal(theme.palette.accent, '#d4a843', 'gold on white is a choice, not a bug');
  assert.ok(contrastRatio('#d4a843', '#ffffff') < 3, 'and it really is below AA — deliberately untouched');
});

test('END TO END: applying a layout to a white-type cover leaves nothing invisible', () => {
  // The reported failure, as a test. The reference's photo box is NOT full-bleed, so the
  // background photo is consumed into it and the rest of the sheet is painted.
  const out = applyReadingToPage(
    normalizeLayoutReading({
      aspect: PAGE_W / PAGE_H, background: 'light', margin: 'md', confidence: 0.9,
      regions: [
        { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.45 } },
        { role: 'headline', box: { x: 0.08, y: 0.5, w: 0.84, h: 0.1 } },
        { role: 'body', box: { x: 0.08, y: 0.63, w: 0.84, h: 0.3 } },
      ],
    })!,
    {
      width: PAGE_W, height: PAGE_H,
      background: { type: 'image', value: 'https://x/dark-cover-photo.jpg' },
      elements: [
        inked('headline', 'THE HORSE', '#ffffff'),
        inked('body', 'Inside: the spring carnival, hoof care, and a ride through the high country.', '#ffffff'),
      ],
    },
    null,
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  const bg = out.page.background;
  const texts = out.page.elements.filter((e) => e.type === 'text');
  assert.ok(texts.length >= 2, 'the words are still there');
  for (const t of texts) {
    if (bg.type !== 'color') continue;
    assert.ok(
      contrastRatio(t.text!.color, bg.value) > 1.6,
      `"${(t.text?.content ?? '').slice(0, 20)}" is ${t.text?.color} on a ${bg.value} page — invisible`,
    );
  }
});

// ── Page chrome survives a rebuild ───────────────────────────────────────────
//
// "Take this layout" replaces every element on the page, and the running head, the
// masthead and the folio are elements. They carry `role: 'other'`, which reflowContent
// read as "spare editorial prose" — so the page number was appended to the article and
// the masthead was promoted to a standfirst, while the fidelity report said 81%
// "matched". The folio's loss was the worse half: restampFolio finds it BY ID, so a page
// that dropped it fell out of renumberFolios for good and could never be renumbered by a
// later reorder.
//
// These build their fixture from the REAL pageFurniture, so the test cannot drift away
// from the module it is guarding.

const THEME = {
  palette: { primary: '#2f5a41', secondary: '#7a8b80', bg: '#f6f4ee', text: '#1a1a1a', accent: '#c8a45c' },
  fonts: { display: 'Playfair Display, serif', body: 'Inter, Arial, sans-serif' },
};

const furnishedPage = (pageNumber = 7) => {
  // Real geometry, deliberately. pageFurniture measures the page's FREE BANDS, so a
  // fixture whose elements all sit at 0,0 (the default in this file's helpers) has no
  // top band and never gets a running head — the first version of these tests did that
  // and asserted against chrome the fixture had never produced.
  const at = (e: MagazineElement, x: number, y: number, w: number, h: number): MagazineElement =>
    ({ ...e, x, y, w, h });
  const editorial = [
    at(image('https://x/hero.jpg', 1100, 700), 90, 170, 1060, 560),
    at(text('headline', 'The long ride home'), 90, 760, 1060, 120),
    at(text('byline', 'By Anna Reid'), 90, 900, 500, 40),
    at(text('body', 'The season opened in a drizzle that nobody minded.'), 90, 960, 1060, 560),
  ];
  const chrome = pageFurniture(
    { background: { type: 'color', value: THEME.palette.bg }, elements: editorial },
    { kind: 'two-column-article', sectionTitle: 'Stable Life', magazineTitle: 'The Stable Press', pageNumber, ...THEME },
  );
  assert.ok(chrome.length > 0, 'the fixture must actually be furnished, or this tests nothing');
  assert.ok(chrome.some((e) => e.id === FOLIO_ELEMENT_ID), 'and it must carry a folio');
  assert.ok(chrome.some((e) => e.id === 'furniture-head-label'), 'and a running head');
  return { elements: [...editorial, ...chrome], chrome };
};

const ORDINARY_REFERENCE = [
  { role: 'image', box: { x: 0, y: 0.06, w: 1, h: 0.34 } },
  { role: 'headline', box: { x: 0.06, y: 0.44, w: 0.88, h: 0.1 } },
  { role: 'caption', box: { x: 0.06, y: 0.56, w: 0.88, h: 0.03 } },
  { role: 'body', box: { x: 0.06, y: 0.62, w: 0.88, h: 0.28 } },
];

test('a rebuild does not pour the running head and folio into the article', () => {
  const { elements } = furnishedPage(7);
  const out = applyReadingToPage(
    reading(ORDINARY_REFERENCE),
    { width: PAGE_W, height: PAGE_H, background: { type: 'color', value: THEME.palette.bg }, elements },
    THEME,
    { magazineTitle: 'The Stable Press', pageNumber: 7, ...THEME },
  );
  assert.equal(out.why, '');
  assert.ok(out.page);

  // Chrome is chrome: it may appear as furniture, never as copy in an editorial slot.
  const editorialText = out.page.elements
    .filter((e) => e.type === 'text' && !FURNITURE_IDS.includes(e.id))
    .map((e) => e.text?.content ?? '');
  for (const t of editorialText) {
    assert.ok(!/\bThe Stable Press\b/.test(t), `the masthead was used as copy: "${t.slice(0, 60)}"`);
    assert.ok(!/\bStable Life\b/.test(t), `the running head was used as copy: "${t.slice(0, 60)}"`);
    assert.ok(!/\n\s*7\s*$/.test(t), `the folio was appended to the copy: "${t.slice(-40)}"`);
  }
  // …and the writing itself is untouched.
  assert.ok(
    editorialText.some((t) => t.includes('nobody minded')),
    "the user's own paragraph is still on the page",
  );
});

test("a rebuilt page keeps a folio, so a later reorder can still renumber it", () => {
  const { elements } = furnishedPage(7);
  const out = applyReadingToPage(
    reading(ORDINARY_REFERENCE),
    { width: PAGE_W, height: PAGE_H, background: { type: 'color', value: THEME.palette.bg }, elements },
    THEME,
    { magazineTitle: 'The Stable Press', pageNumber: 7, ...THEME },
  );
  assert.ok(out.page);
  const folio = out.page.elements.find((e) => e.id === FOLIO_ELEMENT_ID);
  assert.ok(folio, 'the folio is back on the page');
  assert.equal(folio.text?.content, '7', 'and still says which page this is');
  // The real consequence: renumberFolios works through restampFolio, which finds the
  // folio by id. No folio, no renumbering — permanently.
  assert.ok(restampFolio(out.page.elements, 9), 'a later reorder can still renumber this page');
});

test('a rebuilt page keeps the section it was already in, and invents nothing', () => {
  const { elements } = furnishedPage(4);
  const out = applyReadingToPage(
    reading(ORDINARY_REFERENCE),
    { width: PAGE_W, height: PAGE_H, background: { type: 'color', value: THEME.palette.bg }, elements },
    THEME,
    { magazineTitle: 'The Stable Press', pageNumber: 4, ...THEME },
  );
  assert.ok(out.page);
  const label = out.page.elements.find((e) => e.id === 'furniture-head-label');
  // The page said "Stable Life" before the rebuild; a page document stores no kind and
  // no section, so this can only be right if the wording came from the page itself.
  assert.ok(label, 'the running head is back');
  assert.equal(label.text?.content, 'Stable Life');
});

test('a page that never had chrome does not acquire any from a rebuild', () => {
  // A cover carries no running head and no folio by design. Rebuilding it must not
  // introduce one, and refurnish decides that from the page rather than from a kind
  // it has no way to know.
  const out = applyReadingToPage(
    reading(ORDINARY_REFERENCE),
    {
      width: PAGE_W, height: PAGE_H,
      background: { type: 'color', value: THEME.palette.bg },
      elements: [image('https://x/cover.jpg', 1100, 700), text('headline', 'THE HORSE'), text('body', 'Inside this issue.')],
    },
    THEME,
    { magazineTitle: 'The Stable Press', pageNumber: 1, ...THEME },
  );
  assert.ok(out.page);
  const chrome = out.page.elements.filter((e) => FURNITURE_IDS.includes(e.id));
  assert.equal(chrome.length, 0, 'an unfurnished page stays unfurnished');
});

// ── Copy that does not fit is REPORTED, not refused ──────────────────────────
//
// Raising the prose floor to 8pt was right — the pages that "used to build" set body
// copy at 6.7pt at 150 DPI. What was wrong is what happened next: a page whose copy no
// longer fitted at a readable size became a 422 reading "fails layout QA — overflow:
// text d9fe643f-…", an element id that exists nowhere in the user's magazine, shown
// after a confirm that had already warned the change could not be undone. Overlap and
// out-of-bounds still refuse; those are correctness, and the solver guarantees them.

/** A picture-led reference: a big photo and a thin band of prose under it. This is the
 *  shape that trips the floor — a two-column reference has room for 8,000 characters. */
const PICTURE_LED = [
  { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.55 } },
  { role: 'headline', box: { x: 0.06, y: 0.58, w: 0.88, h: 0.1 } },
  { role: 'body', box: { x: 0.06, y: 0.7, w: 0.88, h: 0.18 } },
];

test('too much copy for the layout builds the page and says how much is over', () => {
  const tooMuch = 'The season opened in a drizzle that nobody minded, and the horses went out anyway. '.repeat(40);
  const out = applyReadingToPage(
    reading(PICTURE_LED),
    {
      width: PAGE_W, height: PAGE_H,
      elements: [image('https://x/hero.jpg', 1200, 900), text('headline', 'The long ride home'), text('body', tooMuch)],
    },
    null,
  );
  // The page is built. That is the whole point.
  assert.equal(out.why, '', 'the layout must not be refused over copy length');
  assert.ok(out.page, 'a page came back');
  assert.ok(out.page.elements.some((e) => e.type === 'text' && (e.text?.content ?? '').includes('nobody minded')),
    "the user's words are on the page");

  // …and the shortfall is stated in characters, naming the role, with no element id.
  assert.ok(out.page.tight.length > 0, 'the overflow was reported');
  const body = out.page.tight.find((t) => t.role === 'body');
  assert.ok(body, 'the body is the slot that overflowed');
  assert.ok(body.has > body.holds, `has ${body.has} vs holds ${body.holds} — that is not an overflow`);
  const sentence = tightSummary(out.page.tight);
  assert.match(sentence, /body/);
  assert.match(sentence, /\d+ characters/);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(sentence), `an element id leaked into the message: "${sentence}"`);
});

test('copy that fits reports nothing at all', () => {
  const out = applyReadingToPage(
    reading(PICTURE_LED),
    {
      width: PAGE_W, height: PAGE_H,
      elements: [image('https://x/hero.jpg', 1200, 900), text('headline', 'The long ride home'), text('body', 'A short paragraph that fits comfortably.')],
    },
    null,
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  assert.deepEqual(out.page.tight, [], 'a page that fits has nothing to report');
  assert.equal(tightSummary(out.page.tight), '');
});
