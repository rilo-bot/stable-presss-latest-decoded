// One question, one answer: may this media row be placed on a page?
//
// The stakes are not layout. A `reference` row is somebody else's licensed magazine
// page, uploaded so the AI could read its structure — and the pool it leaked into is
// the one generation places FIRST, so it was composed into the client's magazine as a
// hero photograph, publishable to the public newsstand and exportable to PDF.
//
// The rule was restated by hand at three call sites and was wrong at one of them, so
// these tests are about the PREDICATE and about the site that got it wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceableMedia, UNPLACEABLE_KINDS, userPhotosFrom } from '../../src/lib/magazineV2/media.ts';

/** A media row exactly as POST /issues/:id/media writes one. Note `source` is
 *  'upload' for BOTH an ordinary photo and a layout reference — the two differ only
 *  by `kind`, which is the whole reason a provenance check let the reference past. */
const row = (kind: string, id = 'm1') => ({
  _id: id,
  url: `https://x/${id}.jpg`,
  alt: '',
  kind,
  source: 'upload',
});

// ── The predicate ────────────────────────────────────────────────────────────

test('a layout reference may never be placed, however it got here', () => {
  assert.equal(isPlaceableMedia({ kind: 'reference', url: 'https://x/their-page.jpg' }), false);
});

test('an uploaded document may never be placed either', () => {
  assert.equal(isPlaceableMedia({ kind: 'doc', url: 'https://x/results.pdf' }), false);
});

test("the kinds that ARE pictures stay placeable", () => {
  for (const kind of ['upload', 'photo', 'graphic']) {
    assert.equal(isPlaceableMedia({ kind, url: 'https://x/p.jpg' }), true, `${kind} should be placeable`);
  }
});

test('a row with no usable url is not placeable — it would render as a hole', () => {
  assert.equal(isPlaceableMedia({ kind: 'photo' }), false);
  assert.equal(isPlaceableMedia({ kind: 'photo', url: '' }), false);
});

test('an unknown kind is placeable — only the named exclusions are excluded', () => {
  // Deliberate: a new picture kind added later should work without touching this
  // file, whereas a new UNPLACEABLE kind is a decision someone has to write down.
  assert.equal(isPlaceableMedia({ kind: 'something-new', url: 'https://x/p.jpg' }), true);
  assert.deepEqual([...UNPLACEABLE_KINDS].sort(), ['doc', 'reference']);
});

// ── The site that got it wrong ───────────────────────────────────────────────

test('the user photo pool excludes a layout reference', () => {
  // THE REGRESSION. loadUserPhotoPool filtered `source === 'upload' && kind !== 'doc'`,
  // and a reference is source 'upload' AND kind 'reference', so it went into the pool
  // that generation places first. Trigger: use a reference on a page, then ask for
  // more pages — generateMorePages loads this pool.
  const photos = userPhotosFrom([row('upload', 'mine'), row('reference', 'theirs')]);
  assert.deepEqual(photos.map((p) => p.assetId), ['mine'], "the client's own photo, and only that");
});

test('the user photo pool still excludes documents, and still keeps real uploads', () => {
  const photos = userPhotosFrom([row('doc', 'pdf'), row('upload', 'a'), row('photo', 'b')]);
  // 'photo' with source 'upload' is a real user upload (stock/extracted rows carry a
  // different source), so it belongs in the pool.
  assert.deepEqual(photos.map((p) => p.assetId).sort(), ['a', 'b']);
});

test('the pool is still defined by provenance, not merely by placeability', () => {
  // An EXTRACTED photo is placeable, but it is not one of the user's own uploads and
  // must not be promoted ahead of AI/stock by this pool — it is already on its page.
  const extracted = { _id: 'x', url: 'https://x/x.jpg', alt: '', kind: 'photo', source: 'extracted' };
  assert.deepEqual(userPhotosFrom([extracted]), []);
});
