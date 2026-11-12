// ---------------------------------------------------------------------------
// Asset URL fallback — serve one of OUR S3 objects through the API when the
// bucket won't serve it to the browser directly.
//
// The server writes direct S3 URLs when S3_PUBLIC_BASE_URL is set. Those only
// load if the bucket policy grants anonymous s3:GetObject on public/*; when it
// doesn't (reported: every AI-generated magazine image showed as a broken box
// with its alt text — S3 answered 403 AccessDenied although the objects exist),
// the same object is still reachable through GET /api/uploads/file/<key>, which
// streams it with the server's own credentials (and keeps private kinds such as
// evidence behind its auth check). <ResilientImg> swaps to that on error, so
// existing magazines heal without rewriting a single stored URL.
// ---------------------------------------------------------------------------

import { apiUrl } from '@/lib/api';

/**
 * For a URL that points at an object in an S3 bucket (virtual-hosted
 * "https://<bucket>.s3.<region>.amazonaws.com/<key>" or path-style
 * "https://s3.<region>.amazonaws.com/<bucket>/<key>") under the public/ prefix,
 * the equivalent API proxy URL. Null for anything else (data:, blob:, third-party
 * URLs, already-proxied URLs).
 */
export function proxiedAssetUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !/\.amazonaws\.com$/i.test(u.hostname)) return null;
  let path = u.pathname.replace(/^\/+/, '');
  // Path-style: the first segment is the bucket.
  if (/^s3[.-]/i.test(u.hostname)) {
    const i = path.indexOf('/');
    if (i < 0) return null;
    path = path.slice(i + 1);
  }
  let key: string;
  try {
    key = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!key.startsWith('public/')) return null;
  return apiUrl(`/api/uploads/file/${key.split('/').map(encodeURIComponent).join('/')}`);
}

/**
 * App-wide safety net: any <img> whose direct S3 URL fails to load is retried
 * once through the API proxy. Image `error` events don't bubble, but they ARE
 * delivered to window listeners in the capture phase, so one listener covers
 * every image in the app (horse photos, covers, blog images, bulletins) without
 * touching each component. React won't put the old src back: it only writes an
 * attribute when the PROP changes. Installed once from main.tsx.
 */
export function installAssetFallback(): void {
  window.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.assetFallback) return;
      const proxied = proxiedAssetUrl(img.currentSrc || img.src);
      if (!proxied) return;
      img.dataset.assetFallback = '1';
      if (img.srcset) img.removeAttribute('srcset');
      img.src = proxied;
    },
    true,
  );
}
