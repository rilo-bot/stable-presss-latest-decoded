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
import { db } from '../lib/db.js';
import { canAccessNewsroom, isPlatformAdmin } from '../lib/rbac.js';
import { sanitizePages } from '../lib/sanitizeHtml.js';
import { renderBulletinPdf } from '../lib/pdf.js';
import type { AccountUser } from '../lib/identity.js';

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

type WithMongoId = { _id: string; [key: string]: unknown };

/**
 * Who may manage (republish / unpublish / delete) an existing issue: an admin,
 * the staff member who published it, or the owner of the source magazine. This
 * mirrors the owner-only management on magazine drafts (routes/magazines.ts) so
 * one editor can't tamper with another's published edition.
 */
async function canManageIssue(issue: WithMongoId, account: AccountUser | undefined): Promise<boolean> {
  if (!account) return false;
  if (isPlatformAdmin(account)) return true;
  if (issue.createdByUserId && issue.createdByUserId === account.id) return true;
  if (issue.magazineId) {
    const mag = await db.collection('magazines').findById(String(issue.magazineId));
    if (mag && mag.ownerId === account.id) return true;
  }
  return false;
}

/** Full detail projection (_id → id). */
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

/** Lightweight list projection — omits the heavy `pages` payload (grid needs only metadata). */
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

const byPublishedAtDesc = (a: WithMongoId, b: WithMongoId) =>
  String(a.publishedAt) < String(b.publishedAt) ? 1 : -1;

const router = Router();

// list — public sees published only; staff may include unpublished (?includeUnpublished=1)
router.get('/', async (req, res) => {
  const all = await db.collection('issues').find();
  const includeUnpublished = canAccessNewsroom(req.account) && req.query.includeUnpublished === '1';
  const visible = all.filter((d) => includeUnpublished || !d.unpublishedAt);
  visible.sort(byPublishedAtDesc);
  res.json(visible.map(summarize));
});

// get one — public; unpublished issues are hidden from non-staff (404)
router.get('/:id', async (req, res) => {
  const doc = await db.collection('issues').findById(req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (doc.unpublishedAt && !canAccessNewsroom(req.account)) {
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
  const staff = canAccessNewsroom(req.account);
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

  try {
    const pdf = await renderBulletinPdf(url, cacheKey, token, forceRefresh);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName(doc.title)}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('[issues] PDF render failed:', err instanceof Error ? (err.stack ?? err.message) : err);
    res.status(500).json({ error: 'Could not generate the PDF.' });
  }
});

// create — publish a snapshot (staff)
router.post('/', async (req, res) => {
  const body = req.body as Partial<{
    magazineId: string;
    title: string;
    edition: string;
    coverImage: string;
    coverImageUrl: string;
    pages: unknown[];
    scope: 'full' | 'selected';
  }>;

  if (!body || !body.title || !Array.isArray(body.pages) || body.pages.length === 0) {
    res.status(400).json({ error: 'title and at least one page are required' });
    return;
  }

  // Only the owner of the source magazine (or an admin) may publish from it.
  if (body.magazineId) {
    const mag = await db.collection('magazines').findById(String(body.magazineId));
    if (!mag || (mag.ownerId !== req.account?.id && !isPlatformAdmin(req.account))) {
      res.status(403).json({ error: 'Only the magazine owner can publish this edition.' });
      return;
    }
  }

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    magazineId: body.magazineId ?? null,
    title: body.title,
    edition: body.edition ?? '',
    coverImage: body.coverImage ?? '',
    coverImageUrl: body.coverImageUrl ?? '',
    // Trust boundary: re-sanitize page rich text server-side before freezing it
    // into the public copy (mirrors the magazine draft route).
    pages: sanitizePages(body.pages),
    scope: body.scope === 'selected' ? 'selected' : 'full',
    pageCount: body.pages.length,
    version: 1,
    publishedAt: now,
    unpublishedAt: null,
    createdByUserId: req.account?.id ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const id = await db.collection('issues').insertOne(doc);
  const created = await db.collection('issues').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to publish' });
    return;
  }
  res.status(201).json(project(created));
});

// patch — unpublish, re-show, or republish with a fresh snapshot (staff)
router.patch('/:id', async (req, res) => {
  const found = await db.collection('issues').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!(await canManageIssue(found, req.account))) {
    res.status(403).json({ error: 'Only the magazine owner can manage this edition.' });
    return;
  }

  const body = req.body as Partial<{
    action: 'unpublish' | 'republish';
    title: string;
    edition: string;
    coverImage: string;
    coverImageUrl: string;
    pages: unknown[];
  }>;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now };

  if (body.action === 'unpublish') {
    update.unpublishedAt = now;
  } else if (body.action === 'republish') {
    update.unpublishedAt = null;
    update.version = (typeof found.version === 'number' ? found.version : 1) + 1;
    update.publishedAt = now;
    // Optional fresh snapshot — only replace content when the client sends new pages.
    if (Array.isArray(body.pages) && body.pages.length > 0) {
      update.pages = sanitizePages(body.pages);
      update.pageCount = body.pages.length;
      if (typeof body.title === 'string') update.title = body.title;
      if (typeof body.edition === 'string') update.edition = body.edition;
      if (typeof body.coverImage === 'string') update.coverImage = body.coverImage;
      if (typeof body.coverImageUrl === 'string') update.coverImageUrl = body.coverImageUrl;
    }
  } else {
    res.status(400).json({ error: "action must be 'unpublish' or 'republish'" });
    return;
  }

  await db.collection('issues').updateOne(req.params.id, update);
  const updated = await db.collection('issues').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

// delete — issue creator, source-magazine owner, or admin
router.delete('/:id', async (req, res) => {
  const found = await db.collection('issues').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!(await canManageIssue(found, req.account))) {
    res.status(403).json({ error: 'Only the magazine owner can delete this edition.' });
    return;
  }
  await db.collection('issues').deleteOne(req.params.id);
  res.json({ success: true });
});

export default router;
