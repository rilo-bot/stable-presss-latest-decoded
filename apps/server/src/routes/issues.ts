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
import { isStaff } from '../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };

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
  const includeUnpublished = isStaff(req.account) && req.query.includeUnpublished === '1';
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
  if (doc.unpublishedAt && !isStaff(req.account)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(doc));
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

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    magazineId: body.magazineId ?? null,
    title: body.title,
    edition: body.edition ?? '',
    coverImage: body.coverImage ?? '',
    coverImageUrl: body.coverImageUrl ?? '',
    pages: body.pages,
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
      update.pages = body.pages;
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

// delete — staff
router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('issues').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
