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
// NOTE: lib/pdf.ts (and therefore puppeteer) is deliberately NOT imported here.
// The API must never pull Chromium into its process — importing the module alone
// loads megabytes of launcher code, and launching it was what exhausted the
// instance. Rendering belongs to apps/worker; this router only hands out URLs.
import { enqueueJob } from '../../lib/magazineV2/jobs.js';
import { COL } from '../../lib/magazineV2/collections.js';

// WEB_PUBLIC_URL and the download-filename helper moved to
// apps/worker/src/jobs/renderIssuePdf.ts along with the rendering itself. Nothing
// in this router builds a viewer URL or names a file any more — it redirects to
// what the worker already stored.

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

// download as PDF — hands back the copy the WORKER rendered into S3.
//
// THIS ROUTE NO LONGER RENDERS ANYTHING, and that is the point. It used to launch
// headless Chromium per request: ~300-400MB for the browser on top of a 256MB
// in-process render cache, inside a 512MB instance. Render killed the instance for
// running over memory and took every other endpoint down with it, so one reader
// clicking Download PDF was an outage for everybody. See `renderIssuePdf` in
// lib/magazineV2/jobs.ts.
//
// Now: publishing queues a render, the worker prints it and uploads it, and this
// route redirects to the stored file. Downloads are served by S3 — no API memory,
// no cold-start penalty, and the file survives a restart (the old cache was an
// in-process Map, so every deploy threw away every render).
//
// 302 rather than proxying the bytes ON PURPOSE. Streaming an 8MB PDF back through
// the API would put the traffic this change was meant to remove straight back onto
// the instance.
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
  // An unpublished issue cannot be rendered at all: the worker's browser is
  // anonymous, so the viewer would serve it the "not available" screen and we would
  // store a PDF of an error page. Staff previewing a draft are told plainly rather
  // than handed something broken.
  if (doc.unpublishedAt) {
    res.status(409).json({ error: 'Publish this issue before downloading it as a PDF.' });
    return;
  }

  const version = typeof doc.version === 'number' ? doc.version : 1;
  const fresh =
    typeof doc.pdfUrl === 'string' && doc.pdfUrl && doc.pdfVersion === version && req.query.refresh !== '1';

  if (fresh) {
    // The filename the reader sees comes from Content-Disposition on the S3 object's
    // URL, which we don't control — so pass the name we want as a query the browser
    // keeps. S3 ignores it; the download name follows the URL's last path segment.
    res.redirect(302, String(doc.pdfUrl));
    return;
  }

  // Nothing stored for this version yet (first download after a publish, a
  // republish, or ?refresh=1). Queue the render and tell the client to wait —
  // 202 rather than 500, because nothing has failed.
  try {
    // ONE render at a time per issue. Without this every poll queues another job:
    // the client polls this same endpoint every 3s while it waits, and each 202
    // would enqueue a fresh ~20s Chromium render of a document that is already
    // being rendered. A reader holding down refresh could pin the worker for
    // minutes rendering the same issue over and over.
    //
    // Not a lock, and does not need to be: the worst a race can do is queue a
    // second render whose output is byte-identical, which the next poll serves
    // anyway. A lock here would be more machinery than the failure justifies.
    const pending = await db.collection(COL.jobs).find({
      type: 'renderIssuePdf',
      'payload.publishedIssueId': String(doc._id),
      status: { $in: ['queued', 'running'] },
    });
    if (pending.length === 0) {
      await enqueueJob('renderIssuePdf', { publishedIssueId: String(doc._id) });
    }
  } catch (err) {
    console.error('[issues] could not queue the PDF render:', err instanceof Error ? err.message : err);
    res.status(503).json({ error: 'The PDF service is unavailable right now. Please try again shortly.' });
    return;
  }
  res.status(202).json({
    status: 'preparing',
    message: 'The PDF is being prepared. This takes up to a minute for an image-heavy issue.',
  });
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
