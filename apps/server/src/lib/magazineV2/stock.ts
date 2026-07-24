// ---------------------------------------------------------------------------
// Magazine Builder v2 — stock-photo sourcing for AI generation.
//
// The generation art-director writes an image BRIEF per photo slot (draftPage);
// this turns that brief into a real, stored photo. Ported from the campaign-hq
// reference (worker/src/lib/stock.ts) and adapted to stable-press: reuses our
// own S3 `storage` (proxied upload + publicUrl), the raw Mongo driver, and — with
// no `sharp` dependency here — stores Pexels' already-web-ready JPEG bytes
// directly rather than re-encoding.
//
// Env-gated: no PEXELS_API_KEY (or no S3) ⇒ isStockConfigured() is false and the
// generator degrades image slots to flat palette blocks instead of failing.
// Every fetched photo becomes a real MediaAsset (S3 + DB) so it obeys the "no
// invented/hotlinked image URL" invariant and can be reused/edited later.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { COL } from './collections.js';

const PROVIDER = (process.env.STOCK_PROVIDER ?? 'pexels').trim().toLowerCase();
const PEXELS_API_KEY = (process.env.PEXELS_API_KEY ?? '').trim();

/** True when we can both source (Pexels key) AND persist (S3) a photo. */
export function isStockConfigured(): boolean {
  return PROVIDER === 'pexels' && !!PEXELS_API_KEY && storage.isConfigured();
}

export type StockOrientation = 'portrait' | 'landscape' | 'square';

interface PexelsPhoto {
  alt?: string;
  photographer?: string;
  photographer_url?: string;
  src?: Record<string, string>;
}

async function searchPhoto(
  query: string,
  orientation?: StockOrientation,
): Promise<{ bytes: Buffer; contentType: string; alt: string; attribution: { author: string; url: string } } | null> {
  if (!PEXELS_API_KEY) return null;
  const q = query.trim().slice(0, 200);
  if (!q) return null;
  const params = new URLSearchParams({ query: q, per_page: '5' });
  if (orientation) params.set('orientation', orientation);
  const searchRes = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: { Authorization: PEXELS_API_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  // One retry on rate-limit; then give up (the caller degrades to a colour block).
  if (searchRes.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    return searchPhoto(query, orientation);
  }
  if (!searchRes.ok) return null;
  const data = (await searchRes.json()) as { photos?: PexelsPhoto[] };
  const photo = data.photos?.[0];
  const src = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
  if (!photo || !src) return null;
  const imgRes = await fetch(src, { signal: AbortSignal.timeout(20_000) });
  if (!imgRes.ok) return null;
  return {
    bytes: Buffer.from(await imgRes.arrayBuffer()),
    contentType: imgRes.headers.get('content-type') || 'image/jpeg',
    alt: (photo.alt ?? q).slice(0, 300),
    attribution: { author: photo.photographer ?? '', url: photo.photographer_url ?? '' },
  };
}

/**
 * Search + store a stock photo as a MediaAsset. Returns the element-ready image
 * reference, or null on no key/S3, no result, or any error (NEVER throws — a
 * missing photo must not fail the page; the caller degrades to a colour block).
 */
export async function fetchAndStoreStock(
  opts: { query: string; orientation?: StockOrientation },
  ctx: { magazineId: string; pageIndex: number },
): Promise<{ url: string; assetId: string; alt: string } | null> {
  if (!isStockConfigured()) return null;
  try {
    const found = await searchPhoto(opts.query, opts.orientation);
    if (!found) return null;
    const ext = found.contentType.includes('png') ? 'png' : 'jpg';
    const key = `magazinesV2/${ctx.magazineId}/${crypto.randomUUID()}-gen-p${ctx.pageIndex}.${ext}`;
    await storage.uploadObject({ key, contentType: found.contentType, body: found.bytes });
    const url = storage.publicUrl(key);
    const now = new Date().toISOString();
    const assetId = await db.collection(COL.media).insertOne({
      magazineId: ctx.magazineId,
      pageIndex: ctx.pageIndex,
      key,
      url,
      contentType: found.contentType,
      size: found.bytes.length,
      alt: found.alt,
      kind: 'photo',
      source: 'stock',
      attribution: found.attribution,
      createdAt: now,
      updatedAt: now,
    });
    return { url, assetId: String(assetId), alt: found.alt };
  } catch (err) {
    console.warn('[magazineV2] stock fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
