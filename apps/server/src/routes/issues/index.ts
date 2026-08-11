// ---------------------------------------------------------------------------
// Published magazine issues (the public "Bulletins").
//
// A published issue is a FROZEN, self-contained snapshot of a magazine draft:
// it stores its own pages, and every image is referenced by URL inside the page
// content (S3 public URLs in deployment, inline data URLs in local dev), so the
// public viewer can render it on any device without access to the editor's
// local draft store. Drafts themselves stay client-side (a per-editor working
// buffer); only the act of publishing crosses to the server.
//
// Gating (see index.ts): GET is public (account attached optionally so staff
// can also see unpublished issues for management); writes are staff-only.
//
// In deployment, page image src values are S3 URLs so issue docs stay small.
// In local dev (no S3) they are inline data URLs, so /api/issues is mounted
// with a higher per-route body limit than the global default — see index.ts.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../../lib/db.js';
import { isAdmin } from '../../lib/rbac.js';
import { renderBulletinPdf } from '../../lib/pdf.js';

// Origin of the public web app the PDF renderer navigates to. Dev: Vite on 5173.
// Deployment: set WEB_PUBLIC_URL to the deployed frontend origin.
const WEB_PUBLIC_URL = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');

/** Turn an issue title into a safe download file name. */
function pdfFileName(title: unknown): string {
  const base = String(title ?? '')
    .trim()
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'bulletin'}.pdf`;
}

import { project, type WithMongoId } from '../../lib/project.js';

/**
 * Lightweight list projection — `pages` never reaches here (see the list route),
 * so `pageCount` must already be on the document. Kept tolerant of a stray `pages`
 * for the detail route's benefit.
 */
function summarize(doc: WithMongoId) {
  const { _id, pages, ...rest } = doc;
  return {
    id: _id,
    ...rest,
    pageCount:
      typeof rest.pageCount === 'number'
        ? rest.pageCount
        : Array.isArray(pages)
          ? pages.length
          : 0,
  };
}

const router = Router();

// list — public sees published only; staff may include unpublished (?includeUnpublished=1)
router.get('/', async (req, res) => {
  const includeUnpublished = isAdmin(req.account) && req.query.includeUnpublished === '1';
  // An issue document embeds its ENTIRE page array (~41 KB each), and the list only
  // ever needed metadata — so this route used to read the whole collection into the
  // API process and then throw the pages away in summarize(). On a public,
  // unauthenticated route that is megabytes per hit for nothing.
  //
  // aggregate() rather than find({ projection: { pages: 0 } }) because `pageCount`
  // is NOT persisted on the document: projecting `pages` away would take the count
  // with it and the grid would read "0 pages" for every issue. $size derives it
  // inside MongoDB, so the count is exact for old and new documents alike and no
  // backfill is needed. The sort is pushed down too, so the publishedAt index
  // orders the results instead of the API process.
  //
  // NOTE: aggregate() does NOT inject the soft-delete filter that find() does —
  // the `deletedAt: null` $match below is load-bearing, not decoration.
  const visible = (await db.collection('issues').aggregate([
    { $match: { deletedAt: null, ...(includeUnpublished ? {} : { unpublishedAt: null }) } },
    { $addFields: { pageCount: { $size: { $ifNull: ['$pages', []] } } } },
    { $project: { pages: 0 } },
    { $sort: { publishedAt: -1 } },
  ])) as WithMongoId[];
  res.json(visible.map(summarize));
});

// get one — public; unpublished issues are hidden from non-staff (404)
router.get('/:id', async (req, res) => {
  const doc = await db.collection('issues').findById(req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (doc.unpublishedAt && !isAdmin(req.account)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(doc));
});

// download as PDF — renders the public viewer route in headless Chromium.
// Public for published issues; staff may also export an unpublished (preview)
// edition (their Bearer token is forwarded into the headless browser's API call).
router.get('/:id/pdf', async (req, res) => {
  const doc = await db.collection('issues').findById(req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const staff = isAdmin(req.account);
  if (doc.unpublishedAt && !staff) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const url = `${WEB_PUBLIC_URL}/bulletins/${req.params.id}`;
  // Forward the caller's token only when it's needed to render a non-public issue.
  const auth = req.headers.authorization;
  const token = doc.unpublishedAt && staff && auth?.startsWith('Bearer ')
    ? auth.slice('Bearer '.length)
    : undefined;
  // Content-addressed cache key: a frozen issue only changes when republished
  // (version/updatedAt bump). Unpublished previews are rendered with the caller's
  // token, so don't share their output across the public cache — bypass it.
  const cacheKey = doc.unpublishedAt ? '' : `${req.params.id}:${doc.version ?? 1}:${doc.updatedAt ?? ''}`;

  // ?refresh=1 forces a fresh render (e.g. after fixing artwork) and replaces
  // the cached copy.
  const forceRefresh = req.query.refresh === '1';

  // Sheet size = the issue's OWN first-page box. `page.pdf()` takes one size for
  // the whole document and an issue's pages are uniform in practice. This was
  // hard-coded in pdf.ts to the retired v1 builder's 794×1123 (A4 at 96dpi), so
  // every page of every issue this builder produces — 1275×1650 generated, or
  // whatever an upload rasterised to — was printed onto the wrong-shaped sheet.
  const firstPage = (Array.isArray(doc.pages) ? doc.pages[0] : null) as
    | { width?: unknown; height?: unknown }
    | null;
  const dim = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const sheet = dim(firstPage?.width) && dim(firstPage?.height)
    ? { width: dim(firstPage?.width), height: dim(firstPage?.height) }
    : undefined; // let pdf.ts apply its canonical default

  try {
    const pdf = await renderBulletinPdf(url, cacheKey, token, forceRefresh, sheet);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(doc.title)}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('[issues] PDF render failed:', err instanceof Error ? (err.stack ?? err.message) : err);
    res.status(500).json({ error: 'Could not generate the PDF.' });
  }
});

// ── No write endpoints ──────────────────────────────────────────────────────
//
// This router is READ-ONLY. POST /, PATCH /:id and DELETE /:id lived here and
// were the v1 template builder's publish path: the browser assembled a whole
// snapshot client-side and POSTed it, then re-POSTed pages to republish.
//
// The Magazine Builder writes this collection SERVER-SIDE instead —
// POST /api/magazinesV2/issues/:id/publish freezes the stored pages itself
// (buildPublishSnapshot), /unpublish stamps unpublishedAt, and deleting a draft
// cascades to its published snapshot. So a client never sends page content here,
// which is why `sanitizePages` and `canManageIssue` went with these handlers:
// nothing arrives from a client to sanitize, and nothing here mutates.

export default router;
