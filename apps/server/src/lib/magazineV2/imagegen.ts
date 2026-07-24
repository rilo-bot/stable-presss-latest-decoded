// ---------------------------------------------------------------------------
// Magazine Builder v2 — AI image generation for AI generation.
//
// The generation art-director writes an image BRIEF per photo slot (draftPage);
// this turns that brief into a real, stored photo — the generative sibling of
// stock.ts. Instead of searching Pexels, it asks an image-capable model on
// OpenRouter to render an original editorial photograph, then persists the
// bytes through the very same S3 `storage` + MediaAsset(kind:'photo') path
// stock.ts uses, so the curator can call either module interchangeably (same
// { url, assetId, alt } return shape).
//
// Env-gated with the SAME dual gate as stock.ts: no OPENROUTER_API_KEY (or no
// S3) ⇒ isImageGenConfigured() is false and the generator degrades image slots
// to flat palette blocks instead of failing. Every generated photo becomes a
// real MediaAsset (S3 + DB) so it obeys the "no invented/hotlinked image URL"
// invariant and can be reused/edited later.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { COL } from './collections.js';
import { type StockOrientation } from './stock.js';

const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY ?? '').trim();

// Image-capable OpenRouter model slug. Swap via MAGAZINE_V2_IMAGE_MODEL — use
// the exact slug from openrouter.ai/models (must support image OUTPUT).
const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';
const IMAGE_MODEL = (process.env.MAGAZINE_V2_IMAGE_MODEL ?? '').trim() || DEFAULT_IMAGE_MODEL;

/** True when we can both generate (OpenRouter key) AND persist (S3) a photo. */
export function isImageGenConfigured(): boolean {
  return !!OPENROUTER_API_KEY && storage.isConfigured();
}

/** Editorial-photo framing so the model renders magazine-grade photography. */
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
    // Hard constraint appended verbatim per spec — keeps text/marks out of frame.
    'No text, letters, words, watermarks, or logos in the image. Photorealistic editorial photography.',
  ].join(' ');
}

interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
  alt: string;
}

/**
 * Call OpenRouter's chat/completions with modalities:["image","text"] and pull
 * the first generated image out of choices[0].message.images[0]. The image is
 * returned as a data: URL (data:image/<type>;base64,<payload>), which we decode
 * to raw bytes. Returns null on any non-OK response or missing image.
 */
async function generateImage(brief: string, orientation: StockOrientation): Promise<GeneratedImage | null> {
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
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) return null;
  // Expect a data URL: data:image/<subtype>;base64,<payload>
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] || 'image/png';
  const payload = match[2] ?? '';
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) return null;
  return { bytes, contentType, alt: brief.trim().slice(0, 300) };
}

/**
 * Generate + store an AI photo as a MediaAsset. Returns the element-ready image
 * reference, or null on no key/S3, no image, or any error (NEVER throws — a
 * missing photo must not fail the page; the caller degrades to a colour block).
 *
 * Same signature/return shape as fetchAndStoreStock so the curator can use
 * either interchangeably.
 */
export async function generateAndStoreImage(
  opts: { prompt: string; orientation: StockOrientation },
  ctx: { magazineId: string; pageIndex: number },
): Promise<{ url: string; assetId: string; alt: string } | null> {
  if (!isImageGenConfigured()) return null;
  try {
    const generated = await generateImage(opts.prompt, opts.orientation);
    if (!generated) return null;
    const ext = generated.contentType.includes('png') ? 'png' : 'jpg';
    const key = `magazinesV2/${ctx.magazineId}/${crypto.randomUUID()}-gen-p${ctx.pageIndex}.${ext}`;
    await storage.uploadObject({ key, contentType: generated.contentType, body: generated.bytes });
    const url = storage.publicUrl(key);
    const now = new Date().toISOString();
    const assetId = await db.collection(COL.media).insertOne({
      magazineId: ctx.magazineId,
      pageIndex: ctx.pageIndex,
      key,
      url,
      contentType: generated.contentType,
      size: generated.bytes.length,
      alt: generated.alt,
      kind: 'photo',
      source: 'ai-image',
      attribution: { author: 'AI', url: '' },
      createdAt: now,
      updatedAt: now,
    });
    return { url, assetId: String(assetId), alt: generated.alt };
  } catch (err) {
    console.warn('[magazineV2] image generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
