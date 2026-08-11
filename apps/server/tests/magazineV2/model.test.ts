// ---------------------------------------------------------------------------
// validateElements — the trust boundary for every element write.
//
// Manual edits, agent proposals, extraction output and generation output all land
// here. It must clamp geometry to the page, drop what it can't use, and never
// throw (one bad element from a flaky extraction must not fail a whole page).
//
// The bounds case is a regression test: x/y and w/h used to be clamped against the
// page INDEPENDENTLY, so `{x: 1200, w: 1275}` on a 1275px page validated cleanly
// and stored an element running 1200px off the right edge.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateElements, MAX_ELEMENTS_PER_PAGE, MIN_SIZE } from '../../src/lib/magazineV2/model.js';

const PAGE = { width: 1275, height: 1650 };

test('the whole box stays inside the page, not just its origin', () => {
  const [el] = validateElements([{ type: 'text', x: 1200, y: 1600, w: 1275, h: 1650, text: { content: 'hi' } }], PAGE);
  assert.ok(el);
  assert.ok(el!.x + el!.w <= PAGE.width, `x+w = ${el!.x + el!.w} exceeds ${PAGE.width}`);
  assert.ok(el!.y + el!.h <= PAGE.height, `y+h = ${el!.y + el!.h} exceeds ${PAGE.height}`);
  assert.ok(el!.x >= 0 && el!.y >= 0);
});

test('a full-bleed element is untouched', () => {
  const [el] = validateElements([{ type: 'image', x: 0, y: 0, w: 1275, h: 1650, image: { url: 'https://cdn.example.com/a.jpg' } }], PAGE);
  assert.ok(el);
  assert.deepEqual({ x: el!.x, y: el!.y, w: el!.w, h: el!.h }, { x: 0, y: 0, w: 1275, h: 1650 });
});

test('an over-sized box is clamped to the page and then pulled inside it', () => {
  const [el] = validateElements([{ type: 'shape', x: 900, y: 900, w: 99999, h: 99999, shape: { fill: '#123456' } }], PAGE);
  assert.ok(el);
  assert.equal(el!.w, PAGE.width);
  assert.equal(el!.h, PAGE.height);
  assert.equal(el!.x, 0, 'a page-sized box can only sit at the origin');
  assert.equal(el!.y, 0);
});

test('negative and non-finite geometry falls back to safe values', () => {
  const [el] = validateElements([{ type: 'text', x: -500, y: Number.NaN, w: -10, h: Infinity, text: { content: 'x' } }], PAGE);
  assert.ok(el);
  assert.ok(el!.x >= 0 && el!.y >= 0);
  assert.ok(el!.w >= MIN_SIZE && el!.h >= MIN_SIZE);
  assert.ok(el!.x + el!.w <= PAGE.width && el!.y + el!.h <= PAGE.height);
});

test('an unknown element type is dropped without failing its neighbours', () => {
  const out = validateElements(
    [
      { type: 'text', x: 0, y: 0, w: 100, h: 50, text: { content: 'keep me' } },
      { type: 'video', x: 0, y: 0, w: 100, h: 50 },
      null,
      'nonsense',
      { type: 'shape', x: 10, y: 10, w: 100, h: 50, shape: { fill: '#000000' } },
    ],
    PAGE,
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.type), ['text', 'shape']);
});

test('non-array and junk input yields an empty list, never a throw', () => {
  for (const bad of [null, undefined, 42, 'x', {}]) {
    assert.doesNotThrow(() => validateElements(bad, PAGE));
    assert.deepEqual(validateElements(bad, PAGE), []);
  }
});

test('the per-page element cap binds', () => {
  const many = Array.from({ length: MAX_ELEMENTS_PER_PAGE + 50 }, () => ({
    type: 'shape', x: 0, y: 0, w: 10, h: 10, shape: { fill: '#000000' },
  }));
  assert.equal(validateElements(many, PAGE).length, MAX_ELEMENTS_PER_PAGE);
});

test('text fields are coerced onto the allowed scales', () => {
  const [el] = validateElements(
    [{ type: 'text', x: 0, y: 0, w: 400, h: 200, text: { content: 'c', role: 'invented', fontWeight: 613, color: 'red', align: 'sideways', lineHeight: 99 } }],
    PAGE,
  );
  assert.ok(el?.text);
  assert.equal(el!.text!.role, 'other');
  assert.equal(el!.text!.fontWeight, 400);
  assert.equal(el!.text!.color, '#111111');
  assert.equal(el!.text!.align, 'left');
  assert.ok(el!.text!.lineHeight <= 3);
});

test('an element image URL pointing at an internal host is stripped (SSRF)', () => {
  // These are fetched server-side by the Puppeteer PDF export.
  for (const url of [
    'http://127.0.0.1/x.jpg',
    'http://localhost/x.jpg',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/x.jpg',
    'http://192.168.1.1/x.jpg',
  ]) {
    const [el] = validateElements([{ type: 'image', x: 0, y: 0, w: 100, h: 100, image: { url } }], PAGE);
    assert.equal(el!.image!.url, '', `${url} should not survive validation`);
  }
});

test('a QR destination is restricted to safe schemes', () => {
  const [ok] = validateElements([{ type: 'qr', x: 0, y: 0, w: 100, h: 100, qr: { url: 'https://example.com/join' } }], PAGE);
  assert.equal(ok!.qr!.url, 'https://example.com/join');
  const [bad] = validateElements([{ type: 'qr', x: 0, y: 0, w: 100, h: 100, qr: { url: 'javascript:alert(1)' } }], PAGE);
  assert.equal(bad!.qr!.url, '');
});

test('ids are generated when absent and preserved when given', () => {
  const [gen] = validateElements([{ type: 'shape', x: 0, y: 0, w: 10, h: 10, shape: { fill: '#000000' } }], PAGE);
  assert.ok(gen!.id && gen!.id.length > 0);
  const [kept] = validateElements([{ id: 'el_abc', type: 'shape', x: 0, y: 0, w: 10, h: 10, shape: { fill: '#000000' } }], PAGE);
  assert.equal(kept!.id, 'el_abc');
});

test('an imported page with its OWN dimensions is bounded by those, not the canonical page', () => {
  const wide = { width: 2000, height: 800 };
  const [el] = validateElements([{ type: 'image', x: 1900, y: 700, w: 2000, h: 800, image: { url: 'https://cdn.example.com/a.jpg' } }], wide);
  assert.ok(el!.x + el!.w <= wide.width);
  assert.ok(el!.y + el!.h <= wide.height);
});
