// ---------------------------------------------------------------------------
// Magazine Builder v2 — stock photos for AI generation.
//
// The generation art-director writes an image BRIEF per photo slot (draftPage);
// this turns that brief into a real, stored MediaAsset.
//
// The SOURCING now lives in lib/stock.ts, shared with the Blog Studio. This file
// keeps what is genuinely magazine-specific: the S3 key namespace and the
// MediaAsset row. Everything above that — the Pexels key, the retry-once-on-429,
// downloading the bytes so nothing is hotlinked, and carrying the photographer's
// credit — is the shared module's job.
//
// Env-gated: no PEXELS_API_KEY (or no S3) ⇒ isStockConfigured() is false and the
// generator degrades image slots to flat palette blocks instead of failing.
// ---------------------------------------------------------------------------

import { db } from '../db.js';
import { findAndStoreStockPhoto, isStockConfigured, type StockOrientation } from '../stock.js';
import { COL } from './collections.js';

// Re-exported so the generator's existing imports from this module keep working —
// it asks `isStockConfigured()` before planning a photo slot at all.
export { isStockConfigured };
export type { StockOrientation };

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
    const stored = await findAndStoreStockPhoto(opts, `public/magazinesV2/${ctx.magazineId}`);
    if (!stored) return null;

    const now = new Date().toISOString();
    const assetId = await db.collection(COL.media).insertOne({
      magazineId: ctx.magazineId,
      pageIndex: ctx.pageIndex,
      key: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      size: stored.bytes,
      alt: stored.alt,
      kind: 'photo',
      source: 'stock',
      attribution: stored.attribution,
      createdAt: now,
      updatedAt: now,
    });
    return { url: stored.url, assetId: String(assetId), alt: stored.alt };
  } catch (err) {
    console.warn('[magazineV2] stock fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
