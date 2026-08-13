// ---------------------------------------------------------------------------
// pageDensity — the gate that used to let a wordless cover through.
//
// The old bar was 2 elements for interior pages, with cover / back-cover /
// pull-quote exempt entirely. A cover holding one photograph and no words passed
// it, and did ship. These tests pin the two things that changed (a real per-kind
// bar, and no exemptions) plus the one that could silently undo them: furniture
// must never be mistaken for substance.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { densityOf, densityHint, MIN_ELEMENTS } from '../../src/lib/magazineV2/pageDensity.js';
import { pageFurniture, type FurnitureContext } from '../../src/lib/magazineV2/pageFurniture.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';
import { normalizeElements } from '../../src/lib/magazineV2/writePipeline.js';
import { PAGE_TEMPLATE_KINDS, type PageTemplateKind } from '../../src/lib/magazineV2/templates.js';

const palette = { primary: '#1f3d2b', secondary: '#5c6b60', accent: '#d4a843', bg: '#faf7f0', text: '#141414' };
const fonts = { display: 'Playfair Display', body: 'Inter' };

let seq = 0;
const words = (content: string) => ({
  id: `t${seq++}`,
  type: 'text',
  x: 40,
  y: 40,
  w: 400,
  h: 60,
  text: { content, role: 'body', fontFamily: fonts.body, fontSize: 18, fontWeight: 400, color: palette.text, align: 'left', lineHeight: 1.4, autoFit: 'clip' },
});
const photo = () => ({
  id: `i${seq++}`,
  type: 'image',
  x: 40,
  y: 40,
  w: 400,
  h: 300,
  image: { assetId: 'a1', url: 'https://cdn.example.com/p.jpg', alt: '', fit: 'cover' },
});
const block = () => ({ id: `s${seq++}`, type: 'shape', x: 40, y: 40, w: 400, h: 300, shape: { fill: '#cccccc' } });

const els = (raw: unknown[]) => normalizeElements(raw, { width: PAGE_W, height: PAGE_H });

test('a cover with one photograph and no words is too sparse — the bug that shipped', () => {
  const d = densityOf(els([photo()]), 'cover');
  assert.equal(d.meaningful, 1);
  assert.ok(d.tooSparse, 'the cover exemption is what let this page out of the door');
});

test('every page kind has a bar, and none is exempt', () => {
  for (const kind of PAGE_TEMPLATE_KINDS) {
    assert.ok(MIN_ELEMENTS[kind] >= 3, `${kind} would accept an almost empty page`);
    assert.ok(densityOf([], kind).tooSparse, `${kind} accepts a page with nothing on it`);
  }
});

test('the bar bites where the old one did not: six real elements on an article page', () => {
  // Exactly the density of the pages the client called lame. Under the old bar of 2
  // this was a comfortable pass on every kind.
  const six = els([words('Kicker'), words('A headline'), words('A deck'), words('Body copy'), words('More body'), photo()]);
  assert.equal(densityOf(six, 'two-column-article').tooSparse, false);
  assert.ok(densityOf(six, 'contents').tooSparse === false);
  assert.ok(densityOf(els(six.slice(0, 3)), 'two-column-article').tooSparse, 'three elements is still not an article');
});

test('empty copy, a tint block and a photo that never loaded are not content', () => {
  const hollow = els([words('   '), block(), { ...photo(), image: { assetId: '', url: '', alt: '', fit: 'cover' } }]);
  assert.equal(densityOf(hollow, 'pull-quote').meaningful, 0);
});

test('FURNITURE IS NOT SUBSTANCE — a running head must not tip a thin page over the bar', () => {
  const thin = els([photo(), words('Headline')]);
  const ctx: FurnitureContext = {
    kind: 'two-column-article' as PageTemplateKind,
    sectionTitle: 'Section',
    magazineTitle: 'Good Morning Horse',
    pageNumber: 2,
    palette,
    fonts,
  };
  // A page laid out inside the default margin, so the furniture is really emitted.
  const inset = els([{ ...photo(), x: 36, y: 36, w: PAGE_W - 72, h: PAGE_H - 72 }]);
  const furniture = pageFurniture({ background: { type: 'color', value: palette.bg }, elements: inset }, ctx);
  assert.ok(furniture.length >= 4, 'this fixture must actually produce furniture to be a test of anything');

  const before = densityOf(thin, 'two-column-article');
  const after = densityOf([...thin, ...furniture], 'two-column-article');
  assert.equal(after.meaningful, before.meaningful, 'furniture was counted as content');
  assert.ok(after.tooSparse, 'chrome cannot rescue a thin page');
});

test('the hint names the numbers and tells the model NOT to simplify', () => {
  const d = densityOf(els([photo()]), 'contents');
  const hint = densityHint(d, 'contents');
  assert.match(hint, /only 1 real content element,/);
  assert.match(hint, new RegExp(`at least ${MIN_ELEMENTS.contents}`));
  assert.match(hint, /do NOT simplify/);
});
