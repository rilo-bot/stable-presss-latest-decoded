// ---------------------------------------------------------------------------
// Storage relay — the fallback for a browser → S3 upload that can't get through.
//
// Uploads normally PUT straight to S3 with a presigned URL. That needs the
// bucket's CORS rules to list the address the site was opened on; when they
// don't (a Render URL, a preview host, a new domain) the PUT dies as a network
// error with no status. Instead of failing — or worse, letting a feature quietly
// degrade (the magazine studio staged a look-alike of a photo it couldn't
// store) — we send the same bytes to our API with the presigned URL, and the
// server stores them on the same key (POST /api/uploads/relay, which verifies
// the URL's signature). The caller can't tell the difference.
//
// Only a NETWORK failure (no HTTP status) triggers the relay; an HTTP error from
// S3 (403, 400 …) is a real answer and is reported as such.
// ---------------------------------------------------------------------------

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

/** Thrown by a direct upload that never got an HTTP answer (CORS / network). */
export class StorageUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnreachableError';
  }
}

/**
 * Upload `file` through our API instead of straight to S3. Resolves when the
 * object is stored under the presigned URL's key; rejects with a readable error.
 */
export function relayUpload(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(`/api/uploads/relay?target=${encodeURIComponent(uploadUrl)}`), true);
    xhr.setRequestHeader('Content-Type', contentType);
    const token = useAuthStore.getState().token;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      let msg = '';
      try {
        msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? '';
      } catch {
        /* not JSON */
      }
      reject(
        new Error(
          msg ||
            (xhr.status === 413
              ? 'The file is too large to upload through the server (max 60 MB).'
              : `Upload failed (HTTP ${xhr.status}).`),
        ),
      );
    };
    xhr.onerror = () => reject(new Error('Upload failed — could not reach the server. Check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(file);
  });
}
