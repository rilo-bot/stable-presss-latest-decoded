/**
 * Canvas image compression — shared helper.
 *
 * Mirrors the proven pattern in PartyForm.tsx (read a File, draw to a downscaled
 * canvas, export JPEG data URL) but tuned for magazine print legibility rather
 * than tiny avatars. Keeps uploaded data URLs small enough to persist.
 */

export interface CompressOptions {
  /** Longest-edge cap in px. */
  maxDim?: number;
  /** JPEG quality 0..1. */
  quality?: number;
}

const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif)$/i;
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB source guard

/**
 * Compress a user-selected image File to a JPEG data URL.
 * Resolves with `data:image/jpeg;base64,...`.
 */
export function compressImageFile(
  file: File,
  { maxDim = 1280, quality = 0.7 }: CompressOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED.test(file.type)) {
      reject(new Error('Please choose an image (JPG, PNG, WebP, GIF).'));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error('Image is too large (max 12 MB). Try a smaller file or paste a URL.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = (evt) => {
      const src = evt.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be decoded.'));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not available.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
