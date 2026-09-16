// ---------------------------------------------------------------------------
// decodeDataUrl — the boundary between "the image model replied" and "we stored
// a picture".
//
// Everything the generation path writes to S3 comes through this function, and
// it is the only place that can tell a real raster image from a truncated
// response, an HTML error page, or a payload that is not base64 at all. The
// previous version of this module made `;base64` optional in its regex and then
// base64-decoded unconditionally, which stored garbage under a valid-looking
// content type; the cases below are that bug and its neighbours.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

// imageBytes.ts, not imagegen.ts: the latter imports db/storage and cannot be
// loaded without a live MONGODB_URI. That split is why these are testable at all.
import { decodeDataUrl, orientationForBox } from '../../src/lib/magazineV2/imageBytes.js';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBytes = Buffer.from([...PNG_HEADER, 0x00, 0x01, 0x02]);
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gifBytes = Buffer.from('GIF89a' + 'xx', 'ascii');
const webpBytes = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

test('decodes the ordinary base64 data URL the image model returns', () => {
  const out = decodeDataUrl(`data:image/png;base64,${pngBytes.toString('base64')}`);
  assert.ok(out);
  assert.equal(out.contentType, 'image/png');
  assert.deepEqual([...out.bytes], [...pngBytes]);
});

test('parses a URL with a parameter before ;base64 — the old regex rejected it', () => {
  const out = decodeDataUrl(`data:image/jpeg;charset=utf-8;base64,${jpegBytes.toString('base64')}`);
  assert.ok(out);
  assert.equal(out.contentType, 'image/jpeg');
});

test('a NON-base64 data URL is percent-decoded, not base64-decoded', () => {
  // THE BUG THIS FILE EXISTS FOR: without a `;base64` marker these bytes are
  // percent-escaped, and base64-decoding them yields plausible-looking garbage
  // that then gets stored as a broken image nobody can see is broken until the
  // page renders.
  const escaped = [...pngBytes].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');
  const out = decodeDataUrl(`data:image/png,${escaped}`);
  assert.ok(out);
  assert.deepEqual([...out.bytes], [...pngBytes]);
});

test('the SNIFFED type wins over the declared one', () => {
  // The declared type is the model's word for it; the magic bytes are the file's.
  // Storing JPEG bytes as `image/png` means a key ending .png serving a JPEG.
  const out = decodeDataUrl(`data:image/png;base64,${jpegBytes.toString('base64')}`);
  assert.ok(out);
  assert.equal(out.contentType, 'image/jpeg');
});

test('accepts each raster type the rest of the builder accepts', () => {
  for (const [bytes, type] of [
    [pngBytes, 'image/png'],
    [jpegBytes, 'image/jpeg'],
    [gifBytes, 'image/gif'],
    [webpBytes, 'image/webp'],
  ] as const) {
    assert.equal(decodeDataUrl(`data:${type};base64,${bytes.toString('base64')}`)?.contentType, type);
  }
});

test('refuses anything that is not one of those four', () => {
  // An HTML error page or a JSON fault, handed back where an image was promised,
  // is the realistic version of this — it must not become a MediaAsset.
  const html = Buffer.from('<!doctype html><title>502</title>', 'utf8');
  assert.equal(decodeDataUrl(`data:image/png;base64,${html.toString('base64')}`), null);
  // SVG is an image, and deliberately not on the list: it is a script host.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
  assert.equal(decodeDataUrl(`data:image/svg+xml;base64,${svg.toString('base64')}`), null);
});

test('refuses an empty payload and a malformed escape', () => {
  assert.equal(decodeDataUrl('data:image/png;base64,'), null);
  assert.equal(decodeDataUrl('data:image/png,%zz'), null);
  assert.equal(decodeDataUrl('https://example.com/cat.png'), null);
  assert.equal(decodeDataUrl('not a url at all'), null);
});

test('refuses a payload over the upload cap', () => {
  // A hand-uploaded image is held to MAX_IMAGE_BYTES (15 MB); a generated one
  // used to have no limit whatsoever.
  const huge = Buffer.concat([Buffer.from(PNG_HEADER), Buffer.alloc(16 * 1024 * 1024)]);
  assert.equal(decodeDataUrl(`data:image/png;base64,${huge.toString('base64')}`), null);
});

test('orientationForBox maps a box to what to ask the model for', () => {
  assert.equal(orientationForBox(800, 400), 'landscape');
  assert.equal(orientationForBox(400, 800), 'portrait');
  assert.equal(orientationForBox(500, 500), 'square');
  // A box only slightly off square stays square rather than flipping on a pixel.
  assert.equal(orientationForBox(520, 500), 'square');
  // Degenerate height must not divide by zero into NaN.
  assert.equal(orientationForBox(500, 0), 'landscape');
});
