// Trust boundary for "take this layout" (docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// normalizeLayoutReading is the ONLY thing between a vision model's free-form JSON
// and a page the client will print, so these tests are mostly about the model being
// wrong in the ways models are actually wrong: percentages instead of fractions,
// boxes that bleed off the page, a hundred slivers, half a palette, no numbers at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLayoutReading, aspectMismatch, MAX_REGIONS, ASPECT_TOLERANCE,
} from '../../src/lib/magazineV2/layoutReading.ts';

const region = (o: Record<string, unknown>) => ({ role: 'body', box: { x: 0, y: 0, w: 1, h: 0.5 }, ...o });
const twoRegions = [
  { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.6 } },
  { role: 'headline', box: { x: 0.08, y: 0.65, w: 0.84, h: 0.12 } },
];

test('reads a plain two-region layout', () => {
  const r = normalizeLayoutReading({ aspect: 0.707, background: 'light', margin: 'lg', regions: twoRegions, confidence: 0.8 });
  assert.ok(r);
  assert.equal(r.regions.length, 2);
  assert.equal(r.regions[0]!.role, 'image');
  assert.equal(r.margin, 'lg');
  assert.equal(r.confidence, 0.8);
});

test('nothing usable → null, so the caller must tell the user', () => {
  assert.equal(normalizeLayoutReading(null), null);
  assert.equal(normalizeLayoutReading('a layout'), null);
  assert.equal(normalizeLayoutReading({}), null);
  assert.equal(normalizeLayoutReading({ regions: [] }), null);
});

test('a single region is NOT a layout', () => {
  // One box says nothing about composition, which is the entire point of reading it.
  assert.equal(normalizeLayoutReading({ regions: [twoRegions[0]] }), null);
});

test('percentages are rescued, not accepted as fractions', () => {
  // The likeliest model slip: 60 for 0.6. A side > 1 is unambiguous.
  const r = normalizeLayoutReading({
    regions: [
      { role: 'image', box: { x: 0, y: 0, w: 100, h: 60 } },
      { role: 'body', box: { x: 10, y: 65, w: 80, h: 30 } },
    ],
  });
  assert.ok(r);
  assert.deepEqual(r.regions[0]!.box, { x: 0, y: 0, w: 1, h: 0.6 });
  assert.equal(r.regions[1]!.box.x, 0.1);
});

test('a bleeding box is CLIPPED, not dropped', () => {
  // A model reading a full-bleed photo as x:-0.02,w:1.04 has read it correctly and
  // only expressed it in a space we don't have. Dropping it would throw away the
  // most important element on a cover.
  const r = normalizeLayoutReading({
    regions: [
      { role: 'image', box: { x: -0.02, y: -0.02, w: 1.04, h: 0.62 } },
      twoRegions[1],
    ],
  });
  assert.ok(r);
  const box = r.regions.find((x) => x.role === 'image')!.box;
  assert.equal(box.x, 0);
  assert.equal(box.y, 0);
  assert.ok(box.w <= 1 && box.h <= 1, 'clipped inside the page');
  assert.ok(box.w > 0.9, 'still full-width');
});

test('slivers and zero/negative boxes are dropped', () => {
  const r = normalizeLayoutReading({
    regions: [
      ...twoRegions,
      { role: 'shape', box: { x: 0, y: 0.5, w: 1, h: 0.002 } }, // a hairline rule
      { role: 'body', box: { x: 0, y: 0, w: 0, h: 0.5 } },
      { role: 'body', box: { x: 0.2, y: 0.2, w: -0.3, h: 0.2 } },
      { role: 'body', box: { x: 1.4, y: 0.2, w: 0.2, h: 0.2 } }, // entirely off-page
    ],
  });
  assert.ok(r);
  assert.equal(r.regions.length, 2);
});

test('one stray off-page value does not turn a fractional reading into percentages', () => {
  // The bug this exists for: rescuing percentages PER VALUE meant a stray `x: 1.4`
  // was read as 1.4% and survived as a real region. Scale is a property of the whole
  // reading — decided from the sides — so here it stays fractional, the full-bleed
  // image keeps its size, and the off-page region is correctly dropped.
  const r = normalizeLayoutReading({
    regions: [
      { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.6 } },
      { role: 'headline', box: { x: 0.1, y: 0.7, w: 0.8, h: 0.1 } },
      { role: 'body', box: { x: 1.4, y: 0.2, w: 0.2, h: 0.2 } },
    ],
  });
  assert.ok(r);
  assert.equal(r.regions.length, 2, 'the off-page region is gone');
  assert.equal(r.regions.find((x) => x.role === 'image')!.box.w, 1, 'the full-bleed image is untouched');
});

test('over the cap, the BIGGEST regions survive', () => {
  // Keeping the first N would drop the hero photo of any reading that listed it last.
  const many = Array.from({ length: MAX_REGIONS + 6 }, (_, i) => ({
    role: 'body',
    box: { x: 0, y: i * 0.01, w: 0.05, h: 0.05 },
  }));
  const hero = { role: 'image', box: { x: 0, y: 0, w: 1, h: 0.7 } };
  const r = normalizeLayoutReading({ regions: [...many, hero] });
  assert.ok(r);
  assert.equal(r.regions.length, MAX_REGIONS);
  assert.ok(r.regions.some((x) => x.role === 'image'), 'the hero survived');
});

test('regions come back in reading order, top-to-bottom', () => {
  const r = normalizeLayoutReading({
    regions: [
      { role: 'caption', box: { x: 0, y: 0.8, w: 0.4, h: 0.05 } },
      { role: 'headline', box: { x: 0, y: 0.1, w: 1, h: 0.1 } },
      { role: 'body', box: { x: 0.5, y: 0.4, w: 0.5, h: 0.2 } },
      { role: 'kicker', box: { x: 0, y: 0.4, w: 0.4, h: 0.04 } },
    ],
  });
  assert.ok(r);
  assert.deepEqual(r.regions.map((x) => x.role), ['headline', 'kicker', 'body', 'caption']);
});

test('unknown tokens fall back instead of failing the whole read', () => {
  const r = normalizeLayoutReading({
    background: 'chartreuse',
    margin: 'enormous',
    regions: [
      region({ role: 'diagram', emphasis: 'huge', colorRef: 'puce', align: 'middle' }),
      twoRegions[1],
    ],
  });
  assert.ok(r);
  assert.equal(r.background, 'light');
  assert.equal(r.margin, 'md');
  const bad = r.regions.find((x) => x.box.h === 0.5)!;
  assert.equal(bad.role, 'body', 'an unknown role becomes body');
  assert.equal(bad.emphasis, undefined);
  assert.equal(bad.colorRef, undefined);
  assert.equal(bad.align, undefined);
});

test('half a palette is no palette', () => {
  // Two of the reference's colours and one of the magazine's looks like neither.
  const half = normalizeLayoutReading({ regions: twoRegions, palette: { primary: '#123456', accent: 'red' } });
  assert.ok(half);
  assert.equal(half.palette, undefined);

  const whole = normalizeLayoutReading({
    regions: twoRegions,
    palette: { primary: '#123456', secondary: '#ABCDEF', accent: '#000000' },
  });
  assert.ok(whole);
  assert.deepEqual(whole.palette, { primary: '#123456', secondary: '#abcdef', accent: '#000000' });
});

test('a missing confidence is not a confident read', () => {
  const r = normalizeLayoutReading({ regions: twoRegions });
  assert.ok(r);
  assert.equal(r.confidence, 0.5);

  const over = normalizeLayoutReading({ regions: twoRegions, confidence: 7 });
  assert.ok(over);
  assert.ok(over.confidence <= 1);
});

test('columns are clamped and optional', () => {
  assert.equal(normalizeLayoutReading({ regions: twoRegions })!.columns, undefined);
  assert.equal(normalizeLayoutReading({ regions: twoRegions, columns: 99 })!.columns, 6);
  assert.equal(normalizeLayoutReading({ regions: twoRegions, columns: 3 })!.columns, 3);
});

test('a box given as bare x/y/width/height still reads', () => {
  // Models drop the `box` wrapper and spell out `width`/`height` often enough that
  // rejecting it would mean throwing away otherwise perfect readings.
  const r = normalizeLayoutReading({
    regions: [
      { role: 'image', x: 0, y: 0, width: 1, height: 0.6 },
      { role: 'headline', x: 0.1, y: 0.7, width: 0.8, height: 0.1 },
    ],
  });
  assert.ok(r);
  assert.equal(r.regions.length, 2);
  assert.equal(r.regions[0]!.box.h, 0.6);
});

// ── aspectMismatch ───────────────────────────────────────────────────────────

const A4_W = 1275;
const A4_H = 1800; // portrait, ~0.708

test('a matching shape produces no warning', () => {
  const r = normalizeLayoutReading({ aspect: 0.707, regions: twoRegions })!;
  assert.equal(aspectMismatch(r, A4_W, A4_H), '');
});

test('A4 vs Letter is inside tolerance', () => {
  const letter = normalizeLayoutReading({ aspect: 8.5 / 11, regions: twoRegions })!; // 0.773
  assert.equal(aspectMismatch(letter, A4_W, A4_H), '');
});

test('landscape reference on a portrait page says so plainly', () => {
  const wide = normalizeLayoutReading({ aspect: 1.6, regions: twoRegions })!;
  const msg = aspectMismatch(wide, A4_W, A4_H);
  assert.match(msg, /landscape/);
  assert.match(msg, /portrait/);
});

test('same orientation but a different shape warns about proportions', () => {
  const tall = normalizeLayoutReading({ aspect: 0.45, regions: twoRegions })!;
  const msg = aspectMismatch(tall, A4_W, A4_H);
  assert.notEqual(msg, '');
  assert.doesNotMatch(msg, /landscape/);
  assert.match(msg, /proportions/);
});

test('a page with no dimensions cannot be judged', () => {
  const r = normalizeLayoutReading({ aspect: 1.6, regions: twoRegions })!;
  assert.equal(aspectMismatch(r, 0, 0), '');
});

test('the tolerance is a real number, not a mood', () => {
  const pageAspect = A4_W / A4_H;
  const justInside = normalizeLayoutReading({ aspect: pageAspect * (1 + ASPECT_TOLERANCE * 0.9), regions: twoRegions })!;
  const justOutside = normalizeLayoutReading({ aspect: pageAspect * (1 + ASPECT_TOLERANCE * 1.1), regions: twoRegions })!;
  assert.equal(aspectMismatch(justInside, A4_W, A4_H), '');
  assert.notEqual(aspectMismatch(justOutside, A4_W, A4_H), '');
});
