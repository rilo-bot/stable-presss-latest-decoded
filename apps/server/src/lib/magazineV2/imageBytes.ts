// ---------------------------------------------------------------------------
// The PURE half of imagegen.ts: turning an image model's reply into bytes we are
// willing to store, and deciding which shape of image to ask for.
//
// Separate from imagegen.ts for one practical reason — that module imports db.js
// and storage.js, which throw at import time without MONGODB_URI, so nothing in
// it can be unit-tested. Everything here is a pure function over a string or two
// numbers: no db, no storage, no network. See tests/magazineV2/imagegen.test.ts.
// ---------------------------------------------------------------------------

import { MAX_IMAGE_BYTES } from './config.js';
import { type StockOrientation } from './stock.js';

/**
 * Decode `data:<type>[;param]*[;base64],<payload>` into bytes we are willing to
 * store, or null.
 *
 * Three checks, each one a defect the earlier version of this module shipped
 * with (flagged in docs/MAGAZINE-V2-DEEP-REVIEW.md and
 * docs/TEMPLATE-BUILDER-V2-REVIEW.md) and none of them hypothetical:
 *
 *  1. IS IT ACTUALLY BASE64? The old regex made `;base64` optional and then
 *     base64-decoded unconditionally, so a percent-encoded data URL — legal, and
 *     what you get from some providers — was silently decoded as base64 into
 *     garbage and stored as a broken image. It also could not parse a URL with a
 *     parameter (`;charset=…`) before `;base64`, rejecting a valid image.
 *  2. IS IT A RASTER IMAGE WE ACCEPT? The declared type is the model's word for
 *     it; the magic bytes are the file's. A truncated response or an HTML error
 *     page would otherwise be stored as `image/png` and render as a broken box
 *     in the magazine and in the exported PDF. Deciding the extension from the
 *     SNIFFED type rather than the declared one also keeps key and content in
 *     agreement. SVG is deliberately not on the list: it is a script host.
 *  3. IS IT WITHIN THE UPLOAD CAP? A generated image had no size limit at all,
 *     while a user uploading the same picture by hand is held to MAX_IMAGE_BYTES.
 */
export function decodeDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } | null {
  const match = /^data:([^,]*),(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const meta = match[1] ?? '';
  const payload = match[2] ?? '';
  const params = meta.split(';').map((p) => p.trim().toLowerCase());
  const isBase64 = params.includes('base64');
  const bytes = isBase64 ? Buffer.from(payload, 'base64') : percentDecode(payload);
  if (!bytes || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const sniffed = sniffImageType(bytes);
  if (!sniffed) return null;
  return { bytes, contentType: sniffed };
}

/**
 * Percent-decode a data URL payload to RAW BYTES, or null if it is malformed.
 *
 * Not `decodeURIComponent`: that decodes to a STRING and insists the escapes are
 * valid UTF-8, so `%89` — the first byte of every PNG — throws a URIError. Image
 * bytes are not text, and the only correct reading of `%xx` here is "this one
 * byte". Anything above U+00FF, or a `%` not followed by two hex digits, means
 * this is not a binary payload and we would rather store nothing.
 */
function percentDecode(payload: string): Buffer | null {
  const out: number[] = [];
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload[i]!;
    if (ch === '%') {
      const hex = payload.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      const code = ch.charCodeAt(0);
      if (code > 0xff) return null;
      out.push(code);
    }
  }
  return Buffer.from(out);
}

/** The image type the BYTES say they are, limited to the four the rest of the
 *  builder accepts (ALLOWED_IMAGE_MIME). Null for anything else. */
export function sniffImageType(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (b.length >= 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  return null;
}

/** Box ratio → the orientation to ask for. The SAME rule the stock path uses to
 *  pick a Pexels orientation, so a slot gets the same shape whichever rung of
 *  the ladder ends up filling it. */
export function orientationForBox(w: number, h: number): StockOrientation {
  const ratio = w / Math.max(1, h);
  return ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square';
}
