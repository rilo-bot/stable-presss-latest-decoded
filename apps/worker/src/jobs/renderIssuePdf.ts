// ---------------------------------------------------------------------------
// Render a published issue to a PDF and park it in S3.
//
// This is the whole of the "Download PDF" pipeline now. The API no longer renders
// anything — see the note on `renderIssuePdf` in lib/magazineV2/jobs.ts for why
// the browser had to leave the API process (it was OOM-killing the instance, and
// with it every other endpoint).
//
// The output is content-addressed by VERSION. Publishing overwrites the snapshot
// document in place and bumps `version`, so a republished edition writes a new key
// and the route's freshness check (stored version === current version) flips to
// stale on its own. No invalidation step to forget.
// ---------------------------------------------------------------------------

import { db } from '../../../server/src/lib/db.js';
import { COL } from '../../../server/src/lib/magazineV2/collections.js';
import { storage } from '../../../server/src/lib/storage.js';
import { renderBulletinPdf } from '../../../server/src/lib/pdf.js';

/** Origin of the public web app the renderer navigates to. Must be the FRONTEND
 *  origin — pointed at the API it renders the API's 404 page into a PDF, which is
 *  a failure that looks like a success all the way to the reader. */
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');

interface PublishedPage {
  width?: unknown;
  height?: unknown;
}

/** A finite, positive number or 0 — the shape `page.pdf()` can be told about. */
function dim(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Turn an issue title into the file name a reader ends up with.
 *
 * It lives in the S3 KEY rather than a Content-Disposition header because the
 * download is a redirect: the browser names the file after the URL's last path
 * segment, so a key of `.../v3.pdf` saves as "v3.pdf" however nicely the API asked.
 * Putting the title in the key is what keeps "WIRE-TO-WIRE-v3.pdf".
 */
function pdfFileName(title: unknown, version: number): string {
  const base = String(title ?? '')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'bulletin'}-v${version}.pdf`;
}

export async function renderIssuePdfJob(
  payload: { publishedIssueId: string },
  beat?: () => Promise<void>,
): Promise<void> {
  const id = String(payload.publishedIssueId || '');
  if (!id) throw new Error('renderIssuePdf: no publishedIssueId in payload.');

  const doc = await db.collection(COL.published).findById(id);
  if (!doc) {
    // Not an error worth retrying: the issue was deleted while this waited its
    // turn. Three attempts at a tombstone help nobody.
    console.warn(`[worker] renderIssuePdf: published issue ${id} is gone — nothing to render.`);
    return;
  }
  if (doc.unpublishedAt) {
    // Same reasoning. An unpublished issue is not public, and the anonymous
    // headless browser would be served the viewer's "not available" screen — a
    // PDF of an error page is worse than no PDF.
    console.warn(`[worker] renderIssuePdf: issue ${id} is unpublished — skipping.`);
    return;
  }

  const version = typeof doc.version === 'number' ? doc.version : 1;
  const pages = Array.isArray(doc.pages) ? (doc.pages as PublishedPage[]) : [];
  const first = pages[0] ?? null;
  // One size for the whole document, taken from the FIRST page — page.pdf() accepts
  // a single sheet size and an issue's pages are uniform in practice. Undefined
  // lets lib/pdf.ts apply its canonical default.
  const sheet =
    dim(first?.width) && dim(first?.height)
      ? { width: dim(first?.width), height: dim(first?.height) }
      : undefined;

  await beat?.();
  const url = `${WEB_PUBLIC_URL}/bulletins/${id}`;
  console.log(`[worker] renderIssuePdf ${id} v${version}: rendering ${url}`);

  // Cache key '' bypasses lib/pdf.ts's in-process cache deliberately. S3 IS the
  // cache now, and holding a second copy in the worker's heap would recreate the
  // memory problem this job exists to solve.
  const buf = await renderBulletinPdf(url, '', undefined, false, sheet);
  await beat?.();

  const name = pdfFileName(doc.title, version);
  const key = `${storage.PUBLIC_PREFIX}bulletins/${id}/${name}`;
  await storage.uploadObject({
    key,
    contentType: 'application/pdf',
    body: buf,
    // Saved, not opened in a tab — and under the issue's own title. The API can no
    // longer say either of those things, because the reader is redirected to S3.
    contentDisposition: `attachment; filename="${name}"`,
  });
  const publicUrl = storage.publicUrl(key);

  await db.collection(COL.published).updateOne(id, {
    pdfUrl: publicUrl,
    pdfVersion: version,
    pdfBytes: buf.length,
    pdfRenderedAt: new Date().toISOString(),
    pdfError: '',
  });
  console.log(`[worker] renderIssuePdf ${id} v${version}: stored ${(buf.length / 1024 / 1024).toFixed(1)}MB at ${key}`);
}
