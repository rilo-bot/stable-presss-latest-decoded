// ---------------------------------------------------------------------------
// Magazine Builder v2 — single-page extraction (rasterize → erase glyphs →
// reconstruct editable elements → persist). Adapted from campaign-hq
// (apps/worker/src/jobs/processPage.ts) to stable-press: raw Mongo driver +
// COL.* collections + our normalizeElements write pipeline + mediaAssetsV2, no
// tenantId, pages addressed by stable _id.
//
// Geometry/typography are ALWAYS from MuPDF (pixel-exact). The vision tagger
// only labels roles + flags icon/QR/logo graphics; it never repositions.
// Never throws for a per-page problem — records status:"failed"+error on the
// page and returns null so the rest of the issue keeps processing.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { db } from '../../../server/src/lib/db.js';
import { storage } from '../../../server/src/lib/storage.js';
import { COL } from '../../../server/src/lib/magazineV2/collections.js';
import { normalizeElements } from '../../../server/src/lib/magazineV2/writePipeline.js';
import type { TextRole } from '../../../server/src/lib/magazineV2/model.js';
import { rasterizePage, type PageRaster, type openPdf } from '../lib/pdf.js';
import { toStoredJpeg, toStoredImage, toVisionJpeg, eraseTextRegions, cropRegion, applyAlphaMask } from '../lib/image.js';
import { classifyPage, type GraphicKind, type ClassifiedGraphic } from '../lib/ai.js';

const GRAPHIC_LABEL: Record<GraphicKind, string> = { icon: 'Icon', qr: 'QR code', logo: 'Logo' };
const MIN_GRAPHIC_PX = 8; // below this, a "graphic" crop is unusable noise

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlapArea(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

export interface ProcessedPageResult {
  pxWidth: number;
  pxHeight: number;
  backgroundUrl: string;
}

/** Rasterize, extract, (optionally) classify, and persist ONE page. Never
 *  throws — records failure on the page doc and returns null. */
export async function processSinglePage(
  doc: ReturnType<typeof openPdf>,
  index: number,
  ctx: { issueId: string; pageId: string },
): Promise<ProcessedPageResult | null> {
  const now = () => new Date().toISOString();
  try {
    const raster = rasterizePage(doc, index);
    // The reconstructed text elements below are drawn live on top of this
    // background — erase MuPDF's own rendered glyphs first, or the original and
    // reconstructed text both show at once (doubled/garbled).
    const cleanBackgroundPng = await eraseTextRegions(raster.backgroundPng, raster.textBlocks);
    const backgroundUrl = await uploadBackground(cleanBackgroundPng, ctx.issueId, index);
    const rawElements = await buildRawElements(raster, ctx.issueId, index);
    // The single write pipeline: validate → sanitize → refit (refit is a no-op
    // for extracted text, which carries no maxFontSize, so measured sizes stay).
    const elements = normalizeElements(rawElements, { width: raster.pxWidth, height: raster.pxHeight });

    await db.collection(COL.pages).updateOne(ctx.pageId, {
      width: raster.pxWidth,
      height: raster.pxHeight,
      background: { type: 'image', value: backgroundUrl },
      elements,
      status: 'extracted',
      error: '',
      updatedAt: now(),
    });
    return { pxWidth: raster.pxWidth, pxHeight: raster.pxHeight, backgroundUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Page processing failed';
    console.error(`[worker] page ${index} of issue ${ctx.issueId} failed:`, message);
    await db.collection(COL.pages).updateOne(ctx.pageId, { status: 'failed', error: message, updatedAt: now() });
    return null;
  }
}

async function uploadBackground(png: Buffer, issueId: string, index: number): Promise<string> {
  const jpeg = await toStoredJpeg(png, { quality: 82 });
  const key = `magazinesV2/${issueId}/pages/${index}/background.jpg`;
  await storage.uploadObject({ key, contentType: 'image/jpeg', body: jpeg });
  return storage.publicUrl(key);
}

async function insertMedia(opts: {
  issueId: string;
  index: number;
  key: string;
  url: string;
  contentType: string;
  size: number;
  alt: string;
  kind: 'photo' | 'graphic';
}): Promise<string> {
  const now = new Date().toISOString();
  return db.collection(COL.media).insertOne({
    magazineId: opts.issueId,
    pageIndex: opts.index,
    key: opts.key,
    url: opts.url,
    contentType: opts.contentType,
    size: opts.size,
    alt: opts.alt,
    kind: opts.kind,
    source: 'extracted',
    createdAt: now,
    updatedAt: now,
  });
}

async function buildRawElements(raster: PageRaster, issueId: string, index: number): Promise<unknown[]> {
  const elements: unknown[] = [];

  // Text: layout/typography ALWAYS from MuPDF (pixel-exact). The vision model,
  // when configured, only tags each block's role by index — never repositions,
  // resizes, merges, or rewrites. Without a key, every block lands role "other".
  let classifiedGraphics: ClassifiedGraphic[] = [];
  const roleByIndex = new Map<number, { role: TextRole; confidence: number }>();
  if (raster.textBlocks.length > 0) {
    const vision = await toVisionJpeg(raster.backgroundPng);
    const classified = await classifyPage({
      pageImageJpeg: vision.buffer,
      roughBlocks: raster.textBlocks,
      pxWidth: raster.pxWidth,
      pxHeight: raster.pxHeight,
    });
    if (classified) {
      classifiedGraphics = classified.graphics;
      for (const r of classified.roles) roleByIndex.set(r.index, { role: r.role, confidence: r.confidence });
    }
  }
  raster.textBlocks.forEach((b, i) => {
    const tagged = roleByIndex.get(i);
    elements.push({
      type: 'text',
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rotation: 0,
      zIndex: 1,
      locked: false,
      source: 'extracted',
      confidence: tagged?.confidence ?? 0.4,
      text: {
        content: b.text,
        role: tagged?.role ?? 'other',
        fontFamily: b.fontFamily,
        fontSize: b.fontSize,
        fontWeight: b.fontWeight,
        color: b.color,
        align: 'left',
        lineHeight: b.lineHeight,
        autoFit: 'shrink',
      },
    });
  });

  // Images: MuPDF already decoded these — re-encode, upload, record a real
  // MediaAsset (so they appear in the media library too), place at zIndex 0
  // (below text: a hero photo with an overlaid headline is the common case).
  const imageBoxes: Rect[] = [];
  let n = 0;
  for (const img of raster.imageBlocks) {
    n += 1;
    try {
      // Re-attach the PDF soft mask as real alpha first (rounded corners /
      // feathered shadows live in the mask, not the base image).
      const composed = img.maskPng ? await applyAlphaMask(img.png, img.maskPng) : img.png;
      // Alpha-bearing images stay PNG — flattening to JPEG turns transparent
      // pixels black (the black-box bug). Opaque ones go to JPEG.
      const stored = await toStoredImage(composed, { hasAlpha: img.hasAlpha, quality: 85, maxWidth: 2000 });
      const key = `magazinesV2/${issueId}/${crypto.randomUUID()}-p${index}-${n}.${stored.ext}`;
      await storage.uploadObject({ key, contentType: stored.contentType, body: stored.buffer });
      const url = storage.publicUrl(key);
      const assetId = await insertMedia({ issueId, index, key, url, contentType: stored.contentType, size: stored.buffer.length, alt: '', kind: 'photo' });
      elements.push({
        type: 'image',
        x: img.x,
        y: img.y,
        w: img.w,
        h: img.h,
        rotation: 0,
        zIndex: 0,
        locked: false,
        source: 'extracted',
        confidence: 0.8,
        image: { assetId: String(assetId), url, alt: '', fit: 'cover' },
      });
      imageBoxes.push({ x: img.x, y: img.y, w: img.w, h: img.h });
    } catch (err) {
      console.warn(`[worker] failed to store an extracted image on page ${index}:`, err instanceof Error ? err.message : err);
    }
  }

  // Graphics: icon/QR/logo boxes the vision model identified (semantic — geometry
  // alone can't tell a real icon from decorative vector texture). Each needs a
  // real raster crop, unlike a flat-color rule.
  const placedQrBoxes: Rect[] = [];
  let gi = 0;
  for (const g of classifiedGraphics) {
    const boxPx = { x: g.x * raster.pxWidth, y: g.y * raster.pxHeight, w: g.w * raster.pxWidth, h: g.h * raster.pxHeight };
    if (boxPx.w < MIN_GRAPHIC_PX || boxPx.h < MIN_GRAPHIC_PX) continue;
    // Skip a graphic that's already a real embedded image MuPDF pulled out above.
    const alreadyCaptured = imageBoxes.some((box) => overlapArea(boxPx, box) / (boxPx.w * boxPx.h) > 0.5);
    if (alreadyCaptured) continue;

    // A detected QR becomes a LIVE qr element with no destination yet (a printed
    // QR's target can't be recovered from geometry) — the admin sets the link in
    // the editor and a clean code renders client-side. No raster kept.
    if (g.kind === 'qr') {
      placedQrBoxes.push(boxPx);
      elements.push({
        type: 'qr',
        x: boxPx.x,
        y: boxPx.y,
        w: boxPx.w,
        h: boxPx.h,
        rotation: 0,
        zIndex: 1,
        locked: false,
        source: 'extracted',
        confidence: g.confidence,
        qr: { url: '', fg: '#111111', bg: '#ffffff' },
      });
      continue;
    }

    gi += 1;
    try {
      const cropped = await cropRegion(raster.backgroundPng, boxPx);
      const jpeg = await toStoredJpeg(cropped, { quality: 90 });
      const key = `magazinesV2/${issueId}/${crypto.randomUUID()}-p${index}-graphic${gi}.jpg`;
      await storage.uploadObject({ key, contentType: 'image/jpeg', body: jpeg });
      const url = storage.publicUrl(key);
      const label = GRAPHIC_LABEL[g.kind];
      const assetId = await insertMedia({ issueId, index, key, url, contentType: 'image/jpeg', size: jpeg.length, alt: label, kind: 'graphic' });
      elements.push({
        type: 'image',
        x: boxPx.x,
        y: boxPx.y,
        w: boxPx.w,
        h: boxPx.h,
        rotation: 0,
        zIndex: 1,
        locked: false,
        source: 'extracted',
        confidence: g.confidence,
        // "contain" — an icon/QR/logo must stay fully visible, never edge-cropped.
        image: { assetId: String(assetId), url, alt: label, fit: 'contain' },
      });
    } catch (err) {
      console.warn(`[worker] failed to store an extracted graphic on page ${index}:`, err instanceof Error ? err.message : err);
    }
  }

  // QR codes drawn as vector modules (detected in pdf.ts): one live qr element
  // per region, destination blank. Modules were kept out of lineBlocks already.
  for (const r of raster.qrRegions) {
    if (placedQrBoxes.some((b) => overlapArea(r, b) / (r.w * r.h) > 0.4)) continue;
    elements.push({
      type: 'qr',
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      rotation: 0,
      zIndex: 1,
      locked: false,
      source: 'extracted',
      confidence: 0.6,
      qr: { url: '', fg: '#111111', bg: '#ffffff' },
    });
  }

  // Rules/dividers: a hairline is visually a flat-color rectangle → reconstruct
  // as a "shape" directly from its measured box/color (no raster/upload).
  for (const line of raster.lineBlocks) {
    elements.push({
      type: 'shape',
      x: line.x,
      y: line.y,
      w: line.w,
      h: line.h,
      rotation: 0,
      zIndex: 1,
      locked: false,
      source: 'extracted',
      confidence: 0.7,
      shape: { fill: line.color },
    });
  }

  return elements;
}
