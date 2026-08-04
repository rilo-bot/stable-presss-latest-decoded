// ---------------------------------------------------------------------------
// Stock-photo sourcing — the shared primitive.
//
// Lifted out of lib/magazineV2/stock.ts, which had all of this but wired to one
// caller: it took `{ magazineId, pageIndex }`, inserted straight into the magazine
// media collection, and returned only the three fields a magazine element needs.
// The Blog Studio needs the same search-and-store with a different destination, so
// the sourcing half lives here and each caller owns where the record goes.
//
// Three things this module guarantees, and they are the reason it exists rather
// than each caller talking to Pexels itself:
//
//  1. THE KEY NEVER LEAVES THE SERVER. Every function here runs server-side.
//  2. NOTHING IS HOTLINKED. `storePhoto` downloads the bytes and puts them in our
//     own bucket, so a post's cover does not depend on a third party's CDN or its
//     hotlinking policy.
//  3. ATTRIBUTION TRAVELS. Pexels does not require a credit but asks for one, and
//     a photographer's name is worth keeping regardless.
//
// Env-gated: with no PEXELS_API_KEY (or no S3) `isStockConfigured()` is false and
// callers must SAY SO rather than silently substituting something else.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { storage } from './storage.js';

const PROVIDER = (process.env.STOCK_PROVIDER ?? 'pexels').trim().toLowerCase();
const PEXELS_API_KEY = (process.env.PEXELS_API_KEY ?? '').trim();

/** True when we can both source (Pexels key) AND persist (S3) a photo. */
export function isStockConfigured(): boolean {
  return PROVIDER === 'pexels' && !!PEXELS_API_KEY && storage.isConfigured();
}

export type StockOrientation = 'portrait' | 'landscape' | 'square';

export interface StockAttribution {
  author: string;
  url: string;
}

/** One search result, as a caller may show it to a human before committing to it. */
export interface StockCandidate {
  /** The provider's own id. The ONLY handle a caller should pass back — see below. */
  id: string;
  /** The provider's description of the photo. Doubles as alt text. */
  alt: string;
  /** A small preview, for a picker. Provider-hosted; never stored. */
  thumbUrl: string;
  attribution: StockAttribution;
  width?: number;
  height?: number;
}

interface PexelsPhoto {
  id?: number;
  alt?: string;
  width?: number;
  height?: number;
  photographer?: string;
  photographer_url?: string;
  src?: Record<string, string>;
}

function toCandidate(photo: PexelsPhoto, fallbackAlt: string): StockCandidate | null {
  const id = photo.id;
  const thumb = photo.src?.medium || photo.src?.small || photo.src?.large;
  if (typeof id !== 'number' || !thumb) return null;
  return {
    id: String(id),
    alt: (photo.alt || fallbackAlt).slice(0, 300),
    thumbUrl: thumb,
    attribution: { author: photo.photographer ?? '', url: photo.photographer_url ?? '' },
    ...(photo.width ? { width: photo.width } : {}),
    ...(photo.height ? { height: photo.height } : {}),
  };
}

/** GET against the Pexels API with the shared retry-once-on-429 rule. */
async function pexels(path: string, attempt = 0): Promise<unknown | null> {
  if (!PEXELS_API_KEY) return null;
  const res = await fetch(`https://api.pexels.com/v1/${path}`, {
    headers: { Authorization: PEXELS_API_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  // One retry on rate-limit, then give up. Bounded so sustained 429s — exactly
  // what happens at scale — cannot recurse forever and hang the caller.
  if (res.status === 429) {
    if (attempt >= 1) return null;
    await new Promise((r) => setTimeout(r, 1500));
    return pexels(path, attempt + 1);
  }
  if (!res.ok) return null;
  return res.json();
}

/**
 * Search for photos and return several candidates WITHOUT storing anything.
 *
 * This is the half the old module did not expose. It had one function that
 * searched and immediately stored the first hit, which is right for unattended
 * generation and wrong for anything a person is going to look at — you cannot
 * offer someone a choice you have already committed to.
 *
 * Never throws: returns [] on a missing key, a provider error or no matches. The
 * caller must distinguish "not configured" (ask `isStockConfigured()`) from
 * "nothing found", because they need different things said to the user.
 */
export async function searchStockPhotos(
  query: string,
  opts: { orientation?: StockOrientation; count?: number } = {},
): Promise<StockCandidate[]> {
  const q = query.trim().slice(0, 200);
  if (!PEXELS_API_KEY || !q) return [];
  const count = Math.min(12, Math.max(1, opts.count ?? 6));
  try {
    const params = new URLSearchParams({ query: q, per_page: String(count) });
    if (opts.orientation) params.set('orientation', opts.orientation);
    const data = (await pexels(`search?${params.toString()}`)) as { photos?: PexelsPhoto[] } | null;
    return (data?.photos ?? []).map((p) => toCandidate(p, q)).filter((c): c is StockCandidate => !!c);
  } catch (err) {
    console.warn('[stock] search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Resolve one photo by the provider's id.
 *
 * Callers pass an ID, never a URL. That is what makes "never invent an image URL"
 * enforceable rather than merely requested of a language model: an id either
 * resolves against the provider or it does not, and a fabricated one simply fails
 * here instead of becoming a stored asset pointing at who-knows-what.
 */
export async function getStockPhoto(id: string): Promise<StockCandidate | null> {
  const clean = id.trim();
  if (!PEXELS_API_KEY || !/^\d{1,12}$/.test(clean)) return null;
  try {
    const data = (await pexels(`photos/${clean}`)) as PexelsPhoto | null;
    return data ? toCandidate(data, 'photograph') : null;
  } catch (err) {
    console.warn('[stock] lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface StoredPhoto {
  url: string;
  key: string;
  contentType: string;
  bytes: number;
  alt: string;
  attribution: StockAttribution;
  width?: number;
  height?: number;
}

/**
 * Download a candidate's full-size bytes and put them in OUR bucket.
 *
 * `keyPrefix` is the caller's own namespace (e.g. `public/blogs/<id>`), so this
 * module needs to know nothing about who is asking. Returns null rather than
 * throwing, for the same reason the magazine path did: a missing photo must never
 * be the thing that fails an author's save.
 */
export async function storeStockPhoto(
  candidate: StockCandidate,
  keyPrefix: string,
): Promise<StoredPhoto | null> {
  if (!isStockConfigured()) return null;
  try {
    // Re-resolve to get the full-size source; the candidate only carries a thumb.
    const data = (await pexels(`photos/${candidate.id}`)) as PexelsPhoto | null;
    const src = data?.src?.large2x || data?.src?.large || data?.src?.original;
    if (!src) return null;

    const imgRes = await fetch(src, { signal: AbortSignal.timeout(20_000) });
    if (!imgRes.ok) return null;
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    // The only key here whose folder comes from the CALLER, so normalise rather
    // than trust: force it under `public/` (the project rule, and what
    // storage.uploadObject enforces) instead of letting a caller's typo become a
    // proxied-forever object.
    const folder = keyPrefix.replace(/^\/+|\/+$/g, '');
    const key = `${folder.startsWith('public/') ? folder : `public/${folder}`}/${crypto.randomUUID()}-stock.${ext}`;
    await storage.uploadObject({ key, contentType, body: bytes });

    return {
      url: storage.publicUrl(key),
      key,
      contentType,
      bytes: bytes.length,
      alt: candidate.alt,
      attribution: candidate.attribution,
      ...(candidate.width ? { width: candidate.width } : {}),
      ...(candidate.height ? { height: candidate.height } : {}),
    };
  } catch (err) {
    console.warn('[stock] store failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Search for the best match and store it in one call — the unattended path.
 *
 * This is what `magazineV2/fetchAndStoreStock` was, minus the destination. Use it
 * where no human is going to review the choice; use `searchStockPhotos` +
 * `storeStockPhoto` where one is.
 */
export async function findAndStoreStockPhoto(
  opts: { query: string; orientation?: StockOrientation },
  keyPrefix: string,
): Promise<StoredPhoto | null> {
  if (!isStockConfigured()) return null;
  const [best] = await searchStockPhotos(opts.query, { orientation: opts.orientation, count: 1 });
  return best ? storeStockPhoto(best, keyPrefix) : null;
}
