/**
 * Client-side upload helper — server-proxied S3 upload.
 *
 * Flow: POST the file to our own API (same-origin in dev via the Vite proxy;
 * the VITE_API_URL backend in prod) → the server streams it to S3 → we store
 * the URL the server returns. Images are compressed to a JPEG Blob first.
 *
 * The server returns a RELATIVE file URL ('/api/uploads/file/<key>'); we run it
 * through apiUrl() so it becomes absolute against the API origin in production
 * (a stored <img src> can't go through apiUrl() at render time, unlike fetch).
 * In dev apiUrl() is a no-op and the relative path resolves via the proxy.
 *
 * Graceful fallback: when the server reports S3 is NOT configured (HTTP 501),
 * we fall back to an inline base64 data URL — identical to the app's previous
 * behaviour — so local/WebContainer dev keeps working with zero setup. The
 * `fallback` flag on the result tells callers which path was taken.
 */
import { apiUrl, authFetch } from '@/lib/api';

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

/**
 * Upload an arbitrary Blob of a known content type.
 *
 * Proxied upload: the bytes go to our OWN API (same-origin via the dev proxy /
 * the deployed backend), which streams them to S3. The browser never PUTs to
 * the S3 host directly, so there is no bucket-CORS preflight to satisfy.
 */
async function uploadBlob(
  blob: Blob,
  fileName: string,
  contentType: string,
  kind: UploadKind,
): Promise<UploadResult> {
  const qs = new URLSearchParams({ kind, filename: fileName }).toString();
  const res = await authFetch(`/api/uploads/direct?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (res.status === 501) {
    // S3 not set up on this server — inline as a data URL (legacy behaviour).
    return { url: await blobToDataUrl(blob), fallback: true };
  }
  if (!res.ok) {
    const msg = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(msg.error || `Upload failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { url: string; key?: string };
  // Server returns a relative '/api/...' URL; make it absolute against the API
  // origin (no-op in dev, prefixes VITE_API_URL in prod) so it loads in <img>.
  const url = data.url.startsWith('/') ? apiUrl(data.url) : data.url;
  return { url, key: data.key, fallback: false };
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
