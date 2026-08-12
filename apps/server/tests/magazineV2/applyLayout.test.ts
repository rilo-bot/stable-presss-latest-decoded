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
import { cropSafeBoxes, findEmptySlots, fillSatisfies, type SlotFillHints } from '../../src/lib/magazineV2/fillSlots.ts';
import { normalizeLayoutReading, type ReadRegion } from '../../src/lib/magazineV2/layoutReading.ts';
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

// ── What counts as an empty slot ─────────────────────────────────────────────

test('findEmptySlots names exactly the slots pruneSpec would delete', () => {
  const empty = findEmptySlots(
    slots(['hero', 'image'], ['headline', 'headline'], ['body', 'body'], ['shape', 'shape'], ['qr', 'qr']),
    {
      headline: { text: 'Present' },
      body: { text: '   ' }, // whitespace is not content
      hero: { shapeFill: '#cccccc' }, // a tint block is not a photo
    },
  );
  assert.deepEqual(empty.map((s) => s.ref).sort(), ['body', 'hero', 'qr'], 'shapes are never "empty"; whitespace and tint blocks are');
});

test('fillSatisfies asks the same question per role as pruneSpec', () => {
  assert.ok(fillSatisfies('image', { image: { url: 'https://x/p.jpg', assetId: '', alt: '' } }));
  assert.ok(!fillSatisfies('image', { text: 'not a photo' }));
  assert.ok(fillSatisfies('body', { text: 'words' }));
  assert.ok(!fillSatisfies('body', { text: ' ' }));
  assert.ok(!fillSatisfies('qr', {}));
  assert.ok(fillSatisfies('qr', { qrUrl: 'https://example.com' }));
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

test('a page and a reading become a solved page', async () => {
  const out = await applyReadingToPage(
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

test('a page with nothing on it is refused with a reason, not filled with blanks', async () => {
  const out = await applyReadingToPage(
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

test('the reference decides the proportions: a taller photo band gives a taller photo', async () => {
  const page = {
    width: 1275, height: 1650,
    elements: [image('https://x/p.jpg', 1200, 900), text('body', 'Copy that fills the rest of the page nicely.')],
  };
  const shallow = await applyReadingToPage(reading([
    { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.3 } },
    { role: 'body', box: { x: 0, y: 0.32, w: 1, h: 0.68 } },
  ]), page, null);
  const deep = await applyReadingToPage(reading([
    { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.75 } },
    { role: 'body', box: { x: 0, y: 0.77, w: 1, h: 0.23 } },
  ]), page, null);
  assert.ok(shallow.page && deep.page);
  const h = (r: typeof shallow) => r.page!.elements.find((e) => e.type === 'image')!.h;
  assert.ok(h(deep) > h(shallow) * 1.8, `${h(deep)} should dwarf ${h(shallow)}`);
});

// ── Filling the slots the page cannot fill (the "generation brief" half) ─────
//
// The failure this guards against: a sparse page + a rich reference used to
// prune 7 of 8 boxes, grow the survivor to the whole page, and report a 3%
// "loose interpretation". With a filler, the reference's boxes are OFFERED
// content before pruning, so the composition survives.

const richReading = () => reading([
  { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.4 } },
  { role: 'kicker', box: { x: 0.06, y: 0.44, w: 0.4, h: 0.04 } },
  { role: 'headline', box: { x: 0.06, y: 0.5, w: 0.88, h: 0.12 } },
  { role: 'body', box: { x: 0.06, y: 0.66, w: 0.42, h: 0.28 } },
  { role: 'body', box: { x: 0.52, y: 0.66, w: 0.42, h: 0.28 } },
]);

test('empty slots are offered to the filler, and its content survives to the page', async () => {
  const asked: { ref: string; role: string }[] = [];
  const out = await applyReadingToPage(
    richReading(),
    // The page holds ONE caption — the screenshot scenario.
    { width: 1275, height: 1650, elements: [text('caption', 'Photography curated by the course team')] },
    null,
    {
      fill: async (empty) => {
        asked.push(...empty);
        return {
          hero: { image: { url: 'https://x/lib.jpg', assetId: 'a9', alt: '' } },
          kicker: { text: 'THE PROGRAMME' },
          headline: { text: 'Built for Every Runner' },
          body: { text: 'A first full paragraph of drafted copy for the left column.' },
          body2: { text: 'A second full paragraph of drafted copy for the right column.' },
        };
      },
    },
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  // Every empty box was offered, none was silently skipped. (`body` is absent
  // because the page's spare caption already joined the largest body slot —
  // the reflow's own content always comes first.)
  const refs = asked.map((s) => s.ref).sort();
  assert.deepEqual(refs, ['body2', 'headline', 'hero', 'kicker']);
  // The filled boxes reached the page: the image AND the drafted texts are there.
  assert.ok(out.page.elements.some((e) => e.type === 'image' && e.image?.url === 'https://x/lib.jpg'));
  const texts = out.page.elements.filter((e) => e.type === 'text').map((e) => e.text!.content);
  assert.ok(texts.some((t) => /Built for Every Runner/.test(t)));
  assert.ok(texts.some((t) => /right column/.test(t)));
  assert.ok(texts.some((t) => /Photography curated/.test(t)), "the page's own caption is still on the page");
  // What was filled is counted, so the user can be told. (The filler's `body`
  // answer is ignored — that slot was never empty.)
  assert.deepEqual(out.page.filled, { text: 3, images: 1 });
  // And because no box was pruned, the layout is no longer a "loose interpretation".
  assert.equal(out.page.fidelity.missing, 0, 'no reference box was dropped');
  assert.notEqual(out.page.fidelity.verdict, 'loose');
});

test('the filler is only asked about slots the page could not fill, and never overwrites the reflow', async () => {
  let askedRefs: string[] = [];
  const out = await applyReadingToPage(
    richReading(),
    {
      width: 1275, height: 1650,
      elements: [text('headline', 'My Own Headline'), image('https://x/mine.jpg', 1600, 1200)],
    },
    null,
    {
      fill: async (empty) => {
        askedRefs = empty.map((s) => s.ref);
        // A misbehaving filler that tries to overwrite the user's headline too.
        return {
          headline: { text: 'AI headline that must lose' },
          kicker: { text: 'SECTION' },
          body: { text: 'Drafted body one.' },
          body2: { text: 'Drafted body two.' },
        };
      },
    },
  );
  assert.ok(out.page);
  assert.ok(!askedRefs.includes('headline'), 'the filled headline slot is not offered');
  assert.ok(!askedRefs.includes('hero'), 'the filled hero slot is not offered');
  const texts = out.page.elements.filter((e) => e.type === 'text').map((e) => e.text!.content);
  assert.ok(texts.some((t) => /My Own Headline/.test(t)), "the user's headline survives");
  assert.ok(!texts.some((t) => /must lose/.test(t)), 'the filler cannot overwrite real content');
});

test('a filler that throws degrades to pruning, not to a failed apply', async () => {
  const out = await applyReadingToPage(
    richReading(),
    { width: 1275, height: 1650, elements: [text('headline', 'Title'), text('body', 'Some real copy.')] },
    null,
    { fill: async () => { throw new Error('model down'); } },
  );
  assert.equal(out.why, '', 'the apply still succeeds');
  assert.ok(out.page);
  assert.deepEqual(out.page.filled, { text: 0, images: 0 });
});

test('a blank page WITH a filler becomes a full page instead of a refusal', async () => {
  const out = await applyReadingToPage(
    richReading(),
    { width: 1275, height: 1650, elements: [] },
    null,
    {
      fill: async () => ({
        hero: { image: { url: 'https://x/s.jpg', assetId: 's1', alt: '' } },
        kicker: { text: 'FEATURE' },
        headline: { text: 'A Drafted Headline' },
        body: { text: 'Drafted paragraph one.' },
        body2: { text: 'Drafted paragraph two.' },
      }),
    },
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  assert.ok(out.page.elements.length >= 5);
});

// ── Replicate mode: "exact same as the image, content and all" ───────────────

test('the trust boundary keeps transcriptions, the mode and a valid sourceUrl — and drops a junk sourceUrl', () => {
  const r = normalizeLayoutReading({
    contentMode: 'replicate',
    sourceUrl: 'https://cdn.example.com/ref.jpg',
    regions: [
      { role: 'headline', box: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 }, text: 'EVERYTHING\nHORSE' },
      { role: 'image', box: { x: 0, y: 0.4, w: 1, h: 0.6 }, imageDesc: 'white horse portrait, pale background' },
    ],
  });
  assert.ok(r);
  assert.equal(r.contentMode, 'replicate');
  assert.equal(r.sourceUrl, 'https://cdn.example.com/ref.jpg');
  assert.equal(r.regions[0]!.text, 'EVERYTHING HORSE', 'line breaks collapse to spaces');
  assert.equal(r.regions[1]!.imageDesc, 'white horse portrait, pale background');

  const bad = normalizeLayoutReading({
    sourceUrl: 'javascript:alert(1)',
    regions: [
      { role: 'headline', box: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 } },
      { role: 'body', box: { x: 0.1, y: 0.4, w: 0.8, h: 0.5 } },
    ],
  });
  assert.ok(bad);
  assert.equal(bad.sourceUrl, undefined, 'a non-http(s) sourceUrl never survives');
  assert.equal(bad.contentMode, undefined, 'absent mode stays absent');
});

test('replicate mode uses the transcription and REPLACES the page content — no mixing', async () => {
  let hintsSeen: SlotFillHints | null = null;
  const out = await applyReadingToPage(
    normalizeLayoutReading({
      contentMode: 'replicate',
      sourceUrl: 'https://x/ref.jpg',
      regions: [
        { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.4 }, imageDesc: 'white horse portrait' },
        { role: 'headline', box: { x: 0.06, y: 0.5, w: 0.88, h: 0.12 }, text: 'EVERYTHING HORSE' },
        { role: 'body', box: { x: 0.06, y: 0.66, w: 0.88, h: 0.28 }, text: 'Laminitis expert advice and a feed guide.' },
      ],
    })!,
    // The page currently holds a WHOLE different article — none of it may leak in.
    {
      width: 1275, height: 1650,
      elements: [text('headline', 'Tiz the Law Goes to Stud'), text('body', 'None of the owners were in attendance for the Florida Derby.'), image('https://x/old.jpg', 1600, 1200)],
    },
    null,
    {
      fill: async (empty, hints) => {
        hintsSeen = hints;
        return { hero: { image: { url: 'https://x/crop.jpg', assetId: 'c1', alt: 'white horse portrait' } } };
      },
    },
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  const texts = out.page.elements.filter((e) => e.type === 'text').map((e) => e.text!.content);
  assert.ok(texts.some((t) => /EVERYTHING HORSE/.test(t)), "the reference's own words are on the page");
  assert.ok(!texts.some((t) => /Tiz the Law|Florida Derby/.test(t)), 'the old article never leaks into a replica');
  assert.ok(out.page.elements.some((e) => e.type === 'image' && e.image?.url === 'https://x/crop.jpg'));
  assert.ok(!out.page.elements.some((e) => e.type === 'image' && e.image?.url === 'https://x/old.jpg'), 'the old photo is replaced too');
  // The filler was told everything it needs to source from the reference itself.
  assert.ok(hintsSeen);
  assert.equal(hintsSeen!.replicate, true);
  assert.equal(hintsSeen!.sourceUrl, 'https://x/ref.jpg');
  assert.equal(hintsSeen!.imageDescs.hero, 'white horse portrait');
  assert.ok(hintsSeen!.cropBoxes.hero, 'a clean photo region is offered for cropping');
});

test('cropSafeBoxes refuses regions with text printed over them (cover heroes)', () => {
  const regions = [
    { role: 'image', box: { x: 0, y: 0, w: 1, h: 1 } },
    { role: 'headline', box: { x: 0.1, y: 0.2, w: 0.8, h: 0.15 }, z: 1 },
    { role: 'image', box: { x: 0.6, y: 0.7, w: 0.3, h: 0.25 } },
  ] as ReadRegion[];
  const boxes = cropSafeBoxes(
    [{ ref: 'hero', role: 'image' }, { ref: 'photo1', role: 'image' }],
    { hero: regions[0]!.box, photo1: regions[2]!.box },
    regions,
  );
  assert.equal(boxes.hero, undefined, 'the full-bleed hero has a headline baked over it — never cropped');
  assert.ok(boxes.photo1, 'the clean corner photo is safe to crop');
});

test('without a filler, replicate mode still builds the page from the transcription alone', async () => {
  const out = await applyReadingToPage(
    normalizeLayoutReading({
      contentMode: 'replicate',
      regions: [
        { role: 'headline', box: { x: 0.06, y: 0.1, w: 0.88, h: 0.15 }, text: 'Smash your GOALS' },
        { role: 'body', box: { x: 0.06, y: 0.3, w: 0.88, h: 0.6 }, text: 'Guess who is back for another tip workshop.' },
      ],
    })!,
    { width: 1275, height: 1650, elements: [text('body', 'Old words that must vanish.')] },
    null,
  );
  assert.equal(out.why, '');
  assert.ok(out.page);
  const texts = out.page.elements.filter((e) => e.type === 'text').map((e) => e.text!.content);
  assert.ok(texts.some((t) => /Smash your GOALS/.test(t)));
  assert.ok(!texts.some((t) => /must vanish/.test(t)));
});

test('fills that do not satisfy their role are ignored, not counted', async () => {
  const out = await applyReadingToPage(
    richReading(),
    { width: 1275, height: 1650, elements: [text('headline', 'Title'), text('body', 'Real copy.')] },
    null,
    {
      // An image slot answered with text, a text slot answered with whitespace:
      // neither is content for its role, so both prune exactly as before.
      fill: async () => ({
        hero: { text: 'not an image' },
        kicker: { text: '   ' },
        body2: { text: 'A real drafted paragraph.' },
      }),
    },
  );
  assert.ok(out.page);
  assert.deepEqual(out.page.filled, { text: 1, images: 0 });
  assert.ok(!out.page.elements.some((e) => e.type === 'text' && /not an image/.test(e.text!.content)));
});
