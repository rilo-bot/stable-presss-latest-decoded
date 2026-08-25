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
import { isPlaceableMedia, UNPLACEABLE_KINDS, userPhotosFrom, rankMediaForPage } from '../../src/lib/magazineV2/media.ts';

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

test('an unknown kind FAILS SAFE — unplaceable until someone decides', () => {
  // The inverse of this was the bug: `reference` was added, the existing filters named
  // only `doc`, and four call sites treated the new kind as a photograph. Defaulting
  // unknown to placeable rebuilds that hole one kind later.
  //
  // The costs decide it. Wrongly unplaceable: a photo does not appear — visible,
  // harmless. Wrongly placeable: licensed third-party material on a public newsstand.
  assert.equal(isPlaceableMedia({ kind: 'something-new', url: 'https://x/p.jpg' }), false);
  assert.equal(isPlaceableMedia({ url: 'https://x/p.jpg' }), false, 'a row with no kind at all, too');
});

test('the exclusion list is derived from the table, so the two cannot disagree', () => {
  assert.deepEqual([...UNPLACEABLE_KINDS].sort(), ['doc', 'reference']);
});

test('every declared MediaKind has a deliberate answer', () => {
  // The compiler enforces this (PLACEABLE_BY_KIND is Record<MediaKind, boolean>, so a
  // new kind is a build error until it is decided). Asserted here as well so the
  // intent survives a refactor that loosens the type.
  const decided = ['upload', 'photo', 'graphic', 'reference', 'doc'];
  for (const kind of decided) {
    const answer = isPlaceableMedia({ kind, url: 'https://x/p.jpg' });
    assert.equal(typeof answer, 'boolean', `${kind} must have an answer`);
  }
  assert.equal(decided.filter((k) => !isPlaceableMedia({ kind: k, url: 'https://x/p.jpg' })).length, 2);
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

// ── Ranking the library for one page ─────────────────────────────────────────

const asset = (id: string, o: { kind?: string; pageIndex?: number | null; createdAt?: string } = {}) => ({
  _id: id,
  url: `https://x/${id}.jpg`,
  alt: '',
  kind: o.kind ?? 'photo',
  source: 'extracted',
  pageIndex: o.pageIndex ?? null,
  createdAt: o.createdAt ?? '2026-01-01T00:00:00.000Z',
});

test("a page's own extracted photos come first", () => {
  // The apply-layout top-up read the library in storage order, so rebuilding page 3
  // could take page 12's photograph while page 3's own waited further down the array.
  const ranked = rankMediaForPage(
    [asset('p12', { pageIndex: 12 }), asset('p3', { pageIndex: 3 }), asset('p0', { pageIndex: 0 })],
    3,
  );
  assert.equal(ranked[0]!._id, 'p3');
});

test('everything else falls back to NEWEST first — the only signal an upload has', () => {
  // Uploads carry pageIndex null (nothing asks which page the user meant), so they can
  // never win tier 1. Recency is what is left: a photo added minutes ago is likelier
  // to be meant for the page being worked on than one from the first import.
  const ranked = rankMediaForPage(
    [
      asset('old', { createdAt: '2026-01-01T00:00:00.000Z' }),
      asset('new', { createdAt: '2026-08-25T00:00:00.000Z' }),
      asset('mid', { createdAt: '2026-05-01T00:00:00.000Z' }),
    ],
    3,
  );
  assert.deepEqual(ranked.map((m) => m._id), ['new', 'mid', 'old']);
});

test('page affinity outranks recency', () => {
  const ranked = rankMediaForPage(
    [asset('newer-elsewhere', { createdAt: '2026-08-25T00:00:00.000Z' }), asset('this-page', { pageIndex: 3, createdAt: '2026-01-01T00:00:00.000Z' })],
    3,
  );
  assert.deepEqual(ranked.map((m) => m._id), ['this-page', 'newer-elsewhere']);
});

test('ranking drops what may not be placed, so the caller cannot reintroduce it', () => {
  const ranked = rankMediaForPage(
    [asset('ref', { kind: 'reference', pageIndex: 3 }), asset('pdf', { kind: 'doc' }), asset('ok', { pageIndex: 3 })],
    3,
  );
  assert.deepEqual(ranked.map((m) => m._id), ['ok'], 'a reference cannot win on page affinity either');
});

test('pageIndex 0 is a real page, not a missing one', () => {
  // The cover. A truthiness test here would send every cover photo to tier 2.
  const ranked = rankMediaForPage([asset('other', { pageIndex: 5 }), asset('cover', { pageIndex: 0 })], 0);
  assert.equal(ranked[0]!._id, 'cover');
});

test('the pool is still defined by provenance, not merely by placeability', () => {
  // An EXTRACTED photo is placeable, but it is not one of the user's own uploads and
  // must not be promoted ahead of AI/stock by this pool — it is already on its page.
  const extracted = { _id: 'x', url: 'https://x/x.jpg', alt: '', kind: 'photo', source: 'extracted' };
  assert.deepEqual(userPhotosFrom([extracted]), []);
});
