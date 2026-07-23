// ---------------------------------------------------------------------------
// Magazine Builder v2 — image helpers for PDF extraction (sharp).
//
// Ported verbatim from the campaign-hq reference (apps/worker/src/lib/image.ts).
// Re-encodes MuPDF's raw PNG output before it hits S3, composites PDF soft
// masks back as alpha, crops graphic regions, and — critically —
// eraseTextRegions paints over the original rendered glyphs so the live,
// reconstructed text elements don't render doubled on top of the raster.
// (sharp ships prebuilt binaries for every common platform incl. Windows.)
// ---------------------------------------------------------------------------

import sharp, { type OverlayOptions } from 'sharp';

/** Re-encode a large photographic raster (page background / photo) to JPEG. */
export async function toStoredJpeg(png: Buffer, opts: { quality?: number; maxWidth?: number } = {}): Promise<Buffer> {
  let img = sharp(png);
  if (opts.maxWidth) img = img.resize({ width: opts.maxWidth, withoutEnlargement: true });
  return img.jpeg({ quality: opts.quality ?? 85 }).toBuffer();
}

/** Re-encode an extracted image for storage, preserving transparency. An image
 *  with an alpha channel MUST stay PNG — flattening it to JPEG paints every
 *  transparent pixel solid black (the black-box bug). Opaque images go to JPEG
 *  for size. */
export async function toStoredImage(
  png: Buffer,
  opts: { hasAlpha: boolean; quality?: number; maxWidth?: number },
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  let img = sharp(png);
  if (opts.maxWidth) img = img.resize({ width: opts.maxWidth, withoutEnlargement: true });
  if (opts.hasAlpha) {
    return { buffer: await img.png().toBuffer(), contentType: 'image/png', ext: 'png' };
  }
  return { buffer: await img.jpeg({ quality: opts.quality ?? 85 }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' };
}

/** Downsized copy for the vision model call — keeps prompts fast/cheap
 *  regardless of the page's real render resolution. */
export async function toVisionJpeg(png: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const resized = sharp(png).resize({ width: 1568, withoutEnlargement: true });
  const buffer = await resized.jpeg({ quality: 82 }).toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width ?? 1568, height: meta.height ?? 1568 };
}

/** Composite a PDF soft mask (SMask) back into its base image as the alpha
 *  channel. MuPDF decodes the base and its mask as two separate images —
 *  without this, a rounded/shadowed photo renders as a hard opaque rectangle
 *  (the clipping/feathering lives entirely in the mask). SMask luminosity: 0 =
 *  transparent, 255 = opaque — exactly an alpha channel, so it joins directly. */
export async function applyAlphaMask(basePng: Buffer, maskPng: Buffer): Promise<Buffer> {
  const meta = await sharp(basePng).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return basePng;
  // extractChannel(0) guarantees a single band regardless of how the mask PNG
  // was encoded (gray, gray+alpha, or RGB).
  const { data } = await sharp(maskPng)
    .resize(width, height, { fit: 'fill' })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp(basePng)
    .removeAlpha()
    .joinChannel(data, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** Crop a region straight out of the page's own background raster — used for
 *  icon/QR/logo graphics the vision model identifies (unlike a hairline rule,
 *  these have real pixel detail, so they need an actual raster crop rather than
 *  a reconstructed flat-color shape). */
export async function cropRegion(png: Buffer, region: { x: number; y: number; w: number; h: number }): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const left = Math.max(0, Math.min(width - 1, Math.floor(region.x)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(region.y)));
  const w = Math.max(1, Math.min(width - left, Math.ceil(region.w)));
  const h = Math.max(1, Math.min(height - top, Math.ceil(region.h)));
  return sharp(png).extract({ left, top, width: w, height: h }).png().toBuffer();
}

// `page.toPixmap()` (pdf.ts) rasterizes the WHOLE page — including the real text
// glyphs — into one flat image. We then ALSO reconstruct that same text as
// separate, live, editable elements drawn on top of that image. Left as-is, the
// original glyphs and the reconstructed text both render at once (doubled/
// garbled text). This paints over each detected text block's region in the
// background raster (sampling a nearby pixel so a colored band/tinted box
// doesn't turn into a visible mismatched patch) so only the live text shows.
// Extracted images aren't erased: their overlay element is a pixel-identical
// crop at the same box, fully covering the original.
const ERASE_PADDING = 3;

export async function eraseTextRegions(
  png: Buffer,
  regions: { x: number; y: number; w: number; h: number }[],
): Promise<Buffer> {
  if (regions.length === 0) return png;

  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height) return png;

  const sample = (px: number, py: number): { r: number; g: number; b: number } => {
    const x = Math.max(0, Math.min(width - 1, Math.round(px)));
    const y = Math.max(0, Math.min(height - 1, Math.round(py)));
    const i = (y * width + x) * channels;
    return { r: data[i] ?? 255, g: data[i + 1] ?? 255, b: data[i + 2] ?? 255 };
  };

  const overlays: OverlayOptions[] = [];
  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.x) - ERASE_PADDING);
    const top = Math.max(0, Math.floor(region.y) - ERASE_PADDING);
    const w = Math.min(width - left, Math.ceil(region.w) + ERASE_PADDING * 2);
    const h = Math.min(height - top, Math.ceil(region.h) + ERASE_PADDING * 2);
    if (w <= 0 || h <= 0) continue;

    // Sample just above the block (its most likely uniform-background neighbor);
    // fall back to just below if the block starts at the very top.
    const { r, g, b } = top > 0 ? sample(left + w / 2, top - 1) : sample(left + w / 2, top + h);
    overlays.push({ input: { create: { width: w, height: h, channels: 3, background: { r, g, b } } }, left, top });
  }
  if (overlays.length === 0) return png;

  return sharp(png).composite(overlays).png().toBuffer();
}
