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
//
// THE RATE LIMIT (2026-11-12). Pexels' free tier is 200 requests an hour, and the
// magazine builder composes ~6 pages at once with several photo slots each. So:
//   • searches are CACHED per (query, orientation) for an hour, in-process, and
//     identical searches already in flight share one request;
//   • storing a chosen photo downloads the full-size URL the search ALREADY returned
//     — no second API lookup per stored photo;
//   • a 429 (or a 2xx saying no requests remain) puts Pexels in a COOLDOWN until the
//     reset time the X-Ratelimit-* / Retry-After headers give, else a back-off. While
//     cooling down nothing is sent: searches answer from the cache or return [], so
//     callers fall through to their next rung (the magazine generates the frame)
//     instead of failing or hammering the API. Logged once per cooldown.
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
  /**
   * The full-size download URL, from the same search/lookup response. Lets
   * `storeStockPhoto` download the chosen photo without asking the API again.
   * Only ever filled server-side from a provider response (and only a provider
   * CDN URL is trusted when storing — see `trustedFullUrl`).
   */
  fullUrl?: string;
  /** The photo's own page on the provider — its source link, kept for credit. */
  pageUrl?: string;
  attribution: StockAttribution;
  width?: number;
  height?: number;
}

interface PexelsPhoto {
  id?: number;
  /** The photo's page on pexels.com. */
  url?: string;
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
  const full = photo.src?.large2x || photo.src?.large || photo.src?.original;
  return {
    id: String(id),
    alt: (photo.alt || fallbackAlt).slice(0, 300),
    thumbUrl: thumb,
    ...(full ? { fullUrl: full } : {}),
    ...(photo.url ? { pageUrl: photo.url } : {}),
    attribution: { author: photo.photographer ?? '', url: photo.photographer_url ?? '' },
    ...(photo.width ? { width: photo.width } : {}),
    ...(photo.height ? { height: photo.height } : {}),
  };
}

// ── rate limit: cooldown ─────────────────────────────────────────────────────

/** Back-off when a 429 carries no reset time: 5 min, doubling per consecutive 429. */
const COOLDOWN_DEFAULT_MS = 5 * 60_000;
/** Never sit out longer than this before probing again (one request per hour at
 *  most while the quota stays exhausted — e.g. the monthly limit). */
const COOLDOWN_MAX_MS = 60 * 60_000;
const COOLDOWN_MIN_MS = 5_000;

let cooldownUntil = 0;
let consecutive429 = 0;

/** Epoch ms when Pexels may be asked again; 0 when it is not cooling down. */
export function stockCooldownUntil(): number {
  return cooldownUntil > Date.now() ? cooldownUntil : 0;
}

/**
 * When the provider says its window resets, as epoch ms, from the response headers:
 * `X-Ratelimit-Reset` (Pexels: a UNIX timestamp; a small number is read as seconds
 * from now) or `Retry-After` (seconds, or an HTTP date). null when neither is usable.
 */
function resetAtFrom(res: Response, now: number): number | null {
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    if (reset > 1e12) return reset; // already epoch ms
    if (reset > 1e9) return reset * 1000; // epoch seconds (what Pexels sends)
    return now + reset * 1000; // seconds from now
  }
  const retry = res.headers.get('retry-after');
  if (retry) {
    const secs = Number(retry);
    if (Number.isFinite(secs) && secs >= 0) return now + secs * 1000;
    const at = Date.parse(retry);
    if (Number.isFinite(at)) return at;
  }
  return null;
}

function startCooldown(until: number, why: string): void {
  const now = Date.now();
  const capped = Math.min(now + COOLDOWN_MAX_MS, Math.max(now + COOLDOWN_MIN_MS, until));
  const fresh = cooldownUntil <= now; // log once per cooldown, not once per caller
  if (capped > cooldownUntil) cooldownUntil = capped;
  if (fresh) {
    const mins = Math.max(1, Math.round((cooldownUntil - now) / 60_000));
    console.warn(
      `[stock] Pexels ${why} — pausing stock requests for ~${mins} min (until ${new Date(cooldownUntil).toISOString()}); ` +
        'searches answer from cache or come back empty, so callers fall through (magazine slots are generated instead).',
    );
  }
}

/** Read the rate-limit headers on every response; arm a cooldown when needed. */
function noteRateLimit(res: Response): void {
  const now = Date.now();
  if (res.status === 429) {
    // Requests already in flight when the first 429 armed the cooldown are the same
    // burst, not a new refusal — they must not escalate the back-off.
    if (cooldownUntil <= now) consecutive429 += 1;
    const backoff = now + COOLDOWN_DEFAULT_MS * 2 ** Math.min(4, consecutive429 - 1);
    startCooldown(resetAtFrom(res, now) ?? backoff, 'rate limit hit (429)');
    return;
  }
  if (!res.ok) return;
  consecutive429 = 0;
  // A success that says nothing remains: stop BEFORE the next request is refused.
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (remaining !== null && remaining.trim() !== '' && Number(remaining) <= 0) {
    const at = resetAtFrom(res, now);
    if (at && at > now) startCooldown(at, 'request quota used up (X-Ratelimit-Remaining: 0)');
  }
}

/**
 * GET against the Pexels API. null on a missing key, a cooldown, a 429 (which
 * starts one) or any other non-2xx. No retry on 429: the limit is per hour, so an
 * immediate retry can only spend another request on the same refusal.
 */
async function pexels(path: string): Promise<unknown | null> {
  if (!PEXELS_API_KEY) return null;
  if (cooldownUntil > Date.now()) return null;
  const res = await fetch(`https://api.pexels.com/v1/${path}`, {
    headers: { Authorization: PEXELS_API_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  noteRateLimit(res);
  if (!res.ok) return null;
  return res.json();
}

// ── search cache ─────────────────────────────────────────────────────────────

/** Results per search request. Always the module's maximum: the quota counts
 *  REQUESTS, not results, so one request serves every caller's `count`. */
const SEARCH_PER_PAGE = 12;
const SEARCH_TTL_MS = 60 * 60_000;
const SEARCH_CACHE_MAX = 500;

const searchCache = new Map<string, { at: number; photos: StockCandidate[] }>();
const searchesInFlight = new Map<string, Promise<StockCandidate[] | null>>();

/** Drop the search cache, in-flight table and any cooldown (tests; an operator reset). */
export function resetStockSearchState(): void {
  searchCache.clear();
  searchesInFlight.clear();
  cooldownUntil = 0;
  consecutive429 = 0;
}

/** One real search request. null when nothing was learned (error, cooldown, 429) —
 *  never cached; [] (no matches) IS an answer, and is. */
async function runSearch(q: string, orientation: StockOrientation | undefined): Promise<StockCandidate[] | null> {
  try {
    const params = new URLSearchParams({ query: q, per_page: String(SEARCH_PER_PAGE) });
    if (orientation) params.set('orientation', orientation);
    const data = (await pexels(`search?${params.toString()}`)) as { photos?: PexelsPhoto[] } | null;
    if (!data) return null;
    return (data.photos ?? []).map((p) => toCandidate(p, q)).filter((c): c is StockCandidate => !!c);
  } catch (err) {
    console.warn('[stock] search failed:', err instanceof Error ? err.message : err);
    return null;
  }
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
 *
 * Cached per (query, orientation) for an hour; identical searches in flight share
 * one request; during a rate-limit cooldown a cached answer is still served and an
 * uncached search returns [] without a request (see the header).
 */
export async function searchStockPhotos(
  query: string,
  opts: { orientation?: StockOrientation; count?: number } = {},
): Promise<StockCandidate[]> {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!PEXELS_API_KEY || !q) return [];
  const count = Math.min(SEARCH_PER_PAGE, Math.max(1, opts.count ?? 6));
  const key = `${q.toLowerCase()}|${opts.orientation ?? ''}`;

  const hit = searchCache.get(key);
  if (hit) {
    searchCache.delete(key);
    if (Date.now() - hit.at < SEARCH_TTL_MS) {
      searchCache.set(key, hit); // most recently used last
      return hit.photos.slice(0, count);
    }
  }

  let pending = searchesInFlight.get(key);
  if (!pending) {
    pending = runSearch(q, opts.orientation).then((photos) => {
      if (photos) {
        searchCache.set(key, { at: Date.now(), photos });
        while (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value as string);
      }
      return photos;
    });
    const settled = pending.finally(() => searchesInFlight.delete(key));
    searchesInFlight.set(key, settled);
    pending = settled;
  }
  const photos = await pending;
  return photos ? photos.slice(0, count) : [];
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
  /** Which provider the photo came from, and its id there — recorded on the
   *  caller's row so "is this photo already used?" can be answered exactly later. */
  provider: 'pexels';
  providerId: string;
  /** The photo's page on the provider (source link), when known. */
  sourceUrl?: string;
  width?: number;
  height?: number;
}

/** The provider CDN a full-size URL must be on to be downloaded as-is. */
const TRUSTED_IMAGE_HOSTS = new Set(['images.pexels.com']);

/** The candidate's own full-size URL, if it is an https URL on the provider's CDN. */
function trustedFullUrl(candidate: StockCandidate): string | null {
  if (!candidate.fullUrl) return null;
  try {
    const u = new URL(candidate.fullUrl);
    return u.protocol === 'https:' && TRUSTED_IMAGE_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Download a candidate's full-size bytes and put them in OUR bucket.
 *
 * `keyPrefix` is the caller's own namespace (e.g. `public/blogs/<id>`), so this
 * module needs to know nothing about who is asking. Returns null rather than
 * throwing, for the same reason the magazine path did: a missing photo must never
 * be the thing that fails an author's save.
 *
 * NO SECOND API LOOKUP: a candidate from `searchStockPhotos`/`getStockPhoto` already
 * carries its full-size URL, so the bytes are downloaded from the provider's CDN
 * directly (CDN downloads do not count against the API quota). Only a candidate
 * without a trusted `fullUrl` is re-resolved by its id, as before.
 */
export async function storeStockPhoto(
  candidate: StockCandidate,
  keyPrefix: string,
): Promise<StoredPhoto | null> {
  if (!isStockConfigured()) return null;
  try {
    let src = trustedFullUrl(candidate);
    let sourceUrl = candidate.pageUrl;
    if (!src) {
      if (!/^\d{1,12}$/.test(candidate.id)) return null;
      const data = (await pexels(`photos/${candidate.id}`)) as PexelsPhoto | null;
      src = data?.src?.large2x || data?.src?.large || data?.src?.original || null;
      sourceUrl = sourceUrl || data?.url;
    }
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
      provider: 'pexels',
      providerId: candidate.id,
      ...(sourceUrl ? { sourceUrl } : {}),
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
