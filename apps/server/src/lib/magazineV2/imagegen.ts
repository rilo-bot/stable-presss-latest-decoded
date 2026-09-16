// ---------------------------------------------------------------------------
// Magazine Builder v2 — AI image generation.
//
// The generative sibling of stock.ts. Where that module SEARCHES Pexels for a
// photograph that already exists, this one asks an image-capable model on
// OpenRouter to render an original editorial image, then persists the bytes
// through the very same S3 `storage` + MediaAsset(kind:'photo') path stock.ts
// uses — so a caller can use either interchangeably (identical
// `{ url, assetId, alt }` return shape, identical never-throws contract).
//
// WHERE IT SITS IN AUTOMATIC GENERATION: last, before the colour block. The
// order in curateFills is the user's own photos → Pexels → here → a tinted
// block. A real photograph wins wherever one exists; generation is what fills
// the gap that used to be a flat rectangle when a search came back empty. That
// also keeps the cost proportional — an image-model call happens only for the
// slots stock could not answer.
//
// This rung existed before and was removed on 2026-08-30 ("photographs are
// FOUND, never generated") because it sat AHEAD of Pexels and was gated on
// OPENROUTER_API_KEY, so every generated page went bespoke-image whether or not
// a real photo was available. Reinstated 2026-09-16 at the user's request, as a
// FALLBACK rather than a preference, plus the two manual doors it never had: a
// Design Helper tool and an editor button.
//
// Env-gated with the SAME dual gate as stock.ts: no OPENROUTER_API_KEY (or no
// S3) ⇒ isImageGenConfigured() is false and every caller degrades instead of
// failing. Every generated image becomes a real MediaAsset (S3 + DB), so it
// obeys the "no invented or hotlinked image URL" invariant and can be reused,
// re-placed and edited later like any other row in the library.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { COL } from './collections.js';
// The same extension map a hand-uploaded image is held to — a picture the model
// made is not exempt from the library's rules.
import { imageExtFor } from './config.js';
// The pure half of this module: decoding, sniffing and the box→shape rule. It
// lives apart so it can be unit-tested (this file imports db/storage, which
// throw at import time without MONGODB_URI).
import { decodeDataUrl, orientationForBox } from './imageBytes.js';
import { type StockOrientation } from './stock.js';

// Re-exported so callers reach for one module, not two, when they need a photo.
export { orientationForBox };

const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY ?? '').trim();

// Image-capable OpenRouter model slug. Swap via MAGAZINE_V2_IMAGE_MODEL — use
// the exact slug from openrouter.ai/models, and note it must support image
// OUTPUT (most chat models do not; a text-only model returns no image and this
// module degrades to null).
const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';
const IMAGE_MODEL = (process.env.MAGAZINE_V2_IMAGE_MODEL ?? '').trim() || DEFAULT_IMAGE_MODEL;

/** True when we can both generate (OpenRouter key) AND persist (S3) an image. */
export function isImageGenConfigured(): boolean {
  return !!OPENROUTER_API_KEY && storage.isConfigured();
}

/**
 * Editorial framing, so the model renders magazine-grade photography rather than
 * an illustration — and so the two hard page constraints are always attached:
 * no text in the frame (the layout owns every word on the page, and baked-in
 * lettering cannot be edited, translated or resized), and no identifiable real
 * people (the same rule the copywriter works under).
 */
function buildPrompt(brief: string, orientation: StockOrientation): string {
  const aspect =
    orientation === 'portrait'
      ? 'Vertical portrait orientation.'
      : orientation === 'landscape'
        ? 'Horizontal landscape orientation.'
        : 'Square (1:1) orientation.';
  return [
    `Editorial magazine photograph: ${brief.trim()}`,
    aspect,
    'No text, letters, words, watermarks, or logos in the image.',
    'No identifiable real individuals. Photorealistic editorial photography.',
  ].join(' ');
}

/**
 * The SHAPE of the frame, as a request parameter rather than a wish.
 *
 * Asking for orientation in the prompt does not work: measured against
 * gemini-2.5-flash-image, "Horizontal landscape orientation" and even "Aspect
 * ratio 3:2 — noticeably wider than tall" both come back 1024×1024. `image_config`
 * does work (3:2 → 1248×832, 2:3 → 832×1248), and the difference matters because
 * a square image dropped into a tall slot is cropped by `fit: 'cover'` — the
 * model composes for a frame we then throw half of away.
 *
 * The prompt line stays as well: it costs nothing, and it is what a model without
 * `image_config` support has to go on.
 */
function aspectRatioFor(orientation: StockOrientation): string {
  return orientation === 'portrait' ? '2:3' : orientation === 'landscape' ? '3:2' : '1:1';
}

interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
  alt: string;
}

/**
 * Call OpenRouter's chat/completions with modalities:["image","text"] and pull
 * the first generated image out of choices[0].message.images[0]. The image comes
 * back as a data: URL (data:image/<type>;base64,<payload>), which we decode to
 * raw bytes. Returns null on any non-OK response or missing image — the caller
 * always has somewhere to fall back to.
 */
async function generateImage(
  brief: string,
  orientation: StockOrientation,
  withAspect = true,
): Promise<GeneratedImage | null> {
  if (!OPENROUTER_API_KEY) return null;
  const prompt = buildPrompt(brief, orientation);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
      ...(withAspect ? { image_config: { aspect_ratio: aspectRatioFor(orientation) } } : {}),
    }),
    // Generous but bounded: image models are slow, and an unbounded wait here
    // would hold a generation worker (or an HTTP request) open indefinitely.
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    // `image_config` is not universal, and MAGAZINE_V2_IMAGE_MODEL means the slug
    // is the deployment's choice. Rather than make a working key stop working the
    // day someone swaps the model, drop the parameter and ask once more — a
    // square image is a far better outcome than no image.
    if (withAspect && res.status === 400) {
      console.warn(`[magazineV2] image model ${IMAGE_MODEL} rejected image_config; retrying without it`);
      return generateImage(brief, orientation, false);
    }
    console.warn(`[magazineV2] image model ${IMAGE_MODEL} returned ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) return null;
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  return { ...decoded, alt: brief.trim().slice(0, 300) };
}

/**
 * Generate + store an AI image as a MediaAsset. Returns the element-ready image
 * reference, or null on no key/S3, no image, or any error (NEVER throws — a
 * missing photo must not fail the page; unattended callers degrade to a colour
 * block, and the manual routes turn the null into a plain 502 message).
 *
 * `pageIndex` is null for a library add that isn't tied to a page (the editor's
 * Generate button), matching how an uploaded image is recorded.
 */
export async function generateAndStoreImage(
  opts: { prompt: string; orientation: StockOrientation },
  ctx: { magazineId: string; pageIndex?: number | null },
): Promise<{ url: string; assetId: string; alt: string } | null> {
  if (!isImageGenConfigured()) return null;
  try {
    const generated = await generateImage(opts.prompt, opts.orientation);
    if (!generated) return null;
    // From the SNIFFED type (see decodeDataUrl), so the key's extension and the
    // stored content-type can never disagree.
    const ext = imageExtFor(generated.contentType);
    const pageIndex = typeof ctx.pageIndex === 'number' ? ctx.pageIndex : null;
    const suffix = pageIndex === null ? '' : `-p${pageIndex}`;
    const key = `public/magazinesV2/${ctx.magazineId}/media/${crypto.randomUUID()}-gen${suffix}.${ext}`;
    await storage.uploadObject({ key, contentType: generated.contentType, body: generated.bytes });
    const url = storage.publicUrl(key);
    const now = new Date().toISOString();
    const assetId = await db.collection(COL.media).insertOne({
      magazineId: ctx.magazineId,
      pageIndex,
      key,
      url,
      contentType: generated.contentType,
      size: generated.bytes.length,
      alt: generated.alt,
      // 'photo' so it is placeable (see media.ts); 'ai-image' is what tells the
      // library, and anyone auditing it later, that nobody photographed this.
      kind: 'photo',
      source: 'ai-image',
      attribution: { author: `AI (${IMAGE_MODEL})`, url: '' },
      createdAt: now,
      updatedAt: now,
    });
    return { url, assetId: String(assetId), alt: generated.alt };
  } catch (err) {
    console.warn('[magazineV2] image generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
