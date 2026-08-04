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

/** Mirrors ALLOWED_KINDS in apps/server/src/routes/uploads.ts — an unlisted kind
 *  is silently filed under `misc/` rather than rejected, so the two must agree. */
export type UploadKind = 'party' | 'horse' | 'media' | 'evidence' | 'avatar' | 'podcast' | 'blog' | 'misc';

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

const ACCEPTED_ICON_RASTER = /^image\/(jpeg|png|webp|gif|avif)$/i;

/**
 * Compress a raster image File to a PNG Blob via canvas. Unlike
 * compressImageToBlob (which outputs JPEG and flattens transparency), this keeps
 * the alpha channel — essential for icons that sit on coloured badges/pages.
 */
export function compressToPngBlob(
  file: File,
  { maxDim = 256 }: { maxDim?: number } = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_ICON_RASTER.test(file.type)) {
      reject(new Error('Please choose an SVG, PNG, WebP or JPG icon.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the icon file.'));
    reader.onload = (evt) => {
      const img = new Image();
      img.onerror = () => reject(new Error('That icon could not be decoded.'));
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
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the icon.'))),
          'image/png',
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

/**
 * Upload an ICON. SVGs upload as-is to preserve their vector + transparency
 * (rendered only via <img>, so embedded scripts never execute); raster icons are
 * re-encoded to PNG at a small size, keeping their alpha channel.
 */
export async function uploadIcon(file: File): Promise<UploadResult> {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    return uploadBlob(file, file.name || 'icon.svg', 'image/svg+xml', 'media');
  }
  const blob = await compressToPngBlob(file, { maxDim: 256 });
  const stem = (file.name || 'icon').replace(/\.[^.]+$/, '');
  return uploadBlob(blob, `${stem}.png`, 'image/png', 'media');
}

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0..100, rounded. */
  pct: number;
}

/**
 * Upload a LARGE file (e.g. podcast audio) directly to S3 via a short-lived
 * presigned PUT, reporting progress as it goes. The browser PUTs straight to
 * the bucket, so this is not bound by the API-proxied path's body cap and can
 * carry full-length episodes.
 *
 * The bucket must allow PUT from this site's origin (CORS). When S3 isn't
 * configured at all, the sign endpoint returns 501 and we fall back to the
 * proxied path (which itself falls back to an inline data URL), so local dev
 * keeps working with zero setup.
 */
export async function uploadLargeFile(
  file: File,
  kind: UploadKind,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const contentType = file.type || 'application/octet-stream';

  // 1) Ask our API for a presigned PUT URL.
  const signRes = await authFetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentType, kind, size: file.size }),
  });
  if (signRes.status === 501) {
    // S3 not configured — use the proxied path (data-URL fallback inside).
    return uploadRawFile(file, kind);
  }
  if (!signRes.ok) {
    const msg = await signRes.json().catch(() => ({} as { error?: string }));
    throw new Error(msg.error || `Could not start the upload (HTTP ${signRes.status}).`);
  }
  const signed = (await signRes.json()) as { uploadUrl: string; publicUrl: string; key: string };

  // 2) PUT the bytes straight to S3, streaming progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signed.uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({ loaded: e.loaded, total: e.total, pct: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}).`));
    xhr.onerror = () =>
      reject(new Error('Upload to storage failed — the bucket may not allow uploads from this site.'));
    xhr.send(file);
  });

  // 3) Have the server confirm what actually landed.
  //
  // Not a formality: a presigned PUT carries no size ceiling, so the limit quoted
  // at /sign is advisory and the bucket will accept whatever the browser sends.
  // The server re-reads the object's real type and size from S3 and deletes it if
  // it fails the caps — so the URL we return below is one the server has actually
  // vouched for, rather than one we assumed from a 200.
  const confirmRes = await authFetch('/api/uploads/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: signed.key }),
  });
  if (!confirmRes.ok) {
    const msg = await confirmRes.json().catch(() => ({} as { error?: string }));
    throw new Error(msg.error || `The upload could not be verified (HTTP ${confirmRes.status}).`);
  }
  const confirmed = (await confirmRes.json()) as { url: string; key: string };

  // Private bucket → server returns a relative '/api/...' URL; make it absolute.
  const url = confirmed.url.startsWith('/') ? apiUrl(confirmed.url) : confirmed.url;
  return { url, key: confirmed.key, fallback: false };
}
