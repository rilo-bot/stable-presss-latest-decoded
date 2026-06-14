/**
 * Client-side upload helper — presigned S3 PUT.
 *
 * Flow: ask our API to sign a short-lived PUT URL → upload the bytes DIRECTLY
 * to S3 → store the returned public URL on the record. Images are compressed to
 * a JPEG Blob first (keeps stored assets small and uniform).
 *
 * Graceful fallback: when the server reports S3 is NOT configured (HTTP 501),
 * we fall back to an inline base64 data URL — identical to the app's previous
 * behaviour — so local/WebContainer dev keeps working with zero setup. The
 * `fallback` flag on the result tells callers which path was taken.
 */
import { authFetch } from '@/lib/api';

export type UploadKind = 'party' | 'horse' | 'media' | 'evidence' | 'avatar' | 'podcast' | 'misc';

export interface UploadResult {
  /** Public https URL (S3) or, in fallback mode, an inline data URL. */
  url: string;
  /** S3 object key when stored remotely. */
  key?: string;
  /** True when the file was inlined as a data URL because S3 isn't configured. */
  fallback: boolean;
}

const ACCEPTED_IMAGE = /^image\/(jpeg|png|webp|gif|avif)$/i;

export interface ImageUploadOptions {
  kind: UploadKind;
  /** Longest-edge cap in px. */
  maxDim?: number;
  /** JPEG quality 0..1. */
  quality?: number;
}

/** Compress a user-selected image File to a JPEG Blob via canvas. */
export function compressImageToBlob(
  file: File,
  { maxDim = 1280, quality = 0.72 }: { maxDim?: number; quality?: number } = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_IMAGE.test(file.type)) {
      reject(new Error('Please choose an image (JPG, PNG, WebP, GIF).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = (evt) => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be decoded.'));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not available.')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
          'image/jpeg',
          quality,
        );
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

interface SignResponse {
  configured: boolean;
  uploadUrl?: string;
  publicUrl?: string;
  key?: string;
}

async function sign(body: {
  fileName: string; contentType: string; size: number; kind: UploadKind;
}): Promise<SignResponse> {
  const res = await authFetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 501) return { configured: false };
  if (!res.ok) {
    const msg = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(msg.error || `Could not start upload (HTTP ${res.status}).`);
  }
  return { configured: true, ...(await res.json()) };
}

/** Upload an arbitrary Blob of a known content type. */
async function uploadBlob(
  blob: Blob,
  fileName: string,
  contentType: string,
  kind: UploadKind,
): Promise<UploadResult> {
  const signed = await sign({ fileName, contentType, size: blob.size, kind });
  if (!signed.configured) {
    // S3 not set up on this server — inline as a data URL (legacy behaviour).
    return { url: await blobToDataUrl(blob), fallback: true };
  }
  const put = await fetch(signed.uploadUrl!, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
  return { url: signed.publicUrl!, key: signed.key, fallback: false };
}

/** Compress an image File and upload it. Returns the stored URL. */
export async function uploadImage(file: File, opts: ImageUploadOptions): Promise<UploadResult> {
  const blob = await compressImageToBlob(file, { maxDim: opts.maxDim, quality: opts.quality });
  const stem = (file.name || 'image').replace(/\.[^.]+$/, '');
  return uploadBlob(blob, `${stem}.jpg`, 'image/jpeg', opts.kind);
}

/** Upload a file as-is (documents, audio, video, etc.). Returns the stored URL. */
export async function uploadRawFile(file: File, kind: UploadKind): Promise<UploadResult> {
  return uploadBlob(file, file.name, file.type || 'application/octet-stream', kind);
}
