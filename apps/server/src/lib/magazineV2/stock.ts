// ---------------------------------------------------------------------------
// Magazine Builder v2 — stock photos for AI generation.
//
// The generation art-director writes PHOTO SEARCH TERMS per photo slot (draftPage);
// this turns those terms into a real, stored MediaAsset.
//
// Two ways in:
//   • fetchAndStoreStock — search and store the FIRST hit, unattended (the editor
//     agent, and the generator's fallback when the Photo Director is unavailable).
//   • searchStockCandidates + storeStockCandidate — search several, let someone
//     (the Photo Director, photoDirector.ts) LOOK at the previews and pick, then
//     store only the chosen one. Nothing is stored for the candidates not chosen.
//
// The SOURCING lives in lib/stock.ts, shared with the Blog Studio. This file
// keeps what is genuinely magazine-specific: the S3 key namespace and the
// MediaAsset row. Everything above that — the Pexels key, the search cache and the
// rate-limit cooldown, downloading the bytes so nothing is hotlinked, and carrying
// the photographer's credit — is the shared module's job.
//
// Every stock row records WHICH photo it is (`stockProvider` + `stockId`, plus the
// photo's `sourceUrl` page): that is what lets a later run ("add pages") seed the
// issue's used-photo ledger exactly (photoDirector.seedStockLedger).
//
// Env-gated: no PEXELS_API_KEY (or no S3) ⇒ isStockConfigured() is false and the
// generator degrades image slots to flat palette blocks instead of failing.
// ---------------------------------------------------------------------------

import { db } from '../db.js';
import {
  findAndStoreStockPhoto,
  isStockConfigured,
  searchStockPhotos,
  storeStockPhoto,
  type StockCandidate,
  type StockOrientation,
  type StoredPhoto,
} from '../stock.js';
import { COL } from './collections.js';

// Re-exported so the generator's existing imports from this module keep working —
// it asks `isStockConfigured()` before planning a photo slot at all.
export { isStockConfigured };
export type { StockOrientation, StockCandidate };

/** What an image element needs from a stored photo. */
export interface StoredStockImage {
  url: string;
  assetId: string;
  alt: string;
}

/** Write the MediaAsset row for a photo already copied into our bucket. */
async function recordStockAsset(stored: StoredPhoto, ctx: { magazineId: string; pageIndex: number }): Promise<StoredStockImage> {
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
    stockProvider: stored.provider,
    stockId: stored.providerId,
    ...(stored.sourceUrl ? { sourceUrl: stored.sourceUrl } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return { url: stored.url, assetId: String(assetId), alt: stored.alt };
}

/**
 * Search + store a stock photo as a MediaAsset. Returns the element-ready image
 * reference, or null on no key/S3, no result, or any error (NEVER throws — a
 * missing photo must not fail the page; the caller degrades to a colour block).
 */
export async function fetchAndStoreStock(
  opts: { query: string; orientation?: StockOrientation },
  ctx: { magazineId: string; pageIndex: number },
): Promise<StoredStockImage | null> {
  if (!isStockConfigured()) return null;
  try {
    const stored = await findAndStoreStockPhoto(opts, `public/magazinesV2/${ctx.magazineId}`);
    if (!stored) return null;
    return await recordStockAsset(stored, ctx);
  } catch (err) {
    console.warn('[magazineV2] stock fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Several stock results for one brief, NOT stored: each carries a small preview
 * URL (provider-hosted, for looking at only), the full size and the photographer.
 * Never throws; [] on no key, an error, or no match.
 */
export async function searchStockCandidates(
  query: string,
  opts: { orientation?: StockOrientation; count?: number } = {},
): Promise<StockCandidate[]> {
  if (!isStockConfigured()) return [];
  return searchStockPhotos(query, { orientation: opts.orientation, count: opts.count ?? 6 });
}

/**
 * Store ONE chosen candidate (from a server-side search) as a MediaAsset — the
 * same S3 path and row fetchAndStoreStock writes. The full-size URL the search
 * already returned is downloaded directly — no second Pexels lookup; only a
 * candidate without one is re-resolved by its id (lib/stock.ts). Never throws.
 */
export async function storeStockCandidate(
  candidate: StockCandidate,
  ctx: { magazineId: string; pageIndex: number },
): Promise<StoredStockImage | null> {
  if (!isStockConfigured()) return null;
  try {
    const stored = await storeStockPhoto(candidate, `public/magazinesV2/${ctx.magazineId}`);
    if (!stored) return null;
    return await recordStockAsset(stored, ctx);
  } catch (err) {
    console.warn('[magazineV2] stock store failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
