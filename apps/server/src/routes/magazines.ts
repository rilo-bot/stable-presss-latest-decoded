// ---------------------------------------------------------------------------
// Magazine DRAFTS — server-persisted so multiple staff can collaborate on one
// magazine. (Published, frozen, public copies live in routes/issues.ts.)
//
// Collaboration model (page-assigned, staff-only):
//   - owner       — the creator: edit any page, manage collaborators, publish, delete.
//   - editor      — edit any page, manage collaborators, publish.
//   - contributor — edit ONLY the pages shared with them (pageIds, or 'all').
//
// Conflict handling is last-write-wins per page, which is safe in practice
// because collaborators are assigned different pages. Edits persist via the
// per-page PATCH below (debounced on the client); structural changes (title,
// cover, publish-selection) go through PATCH /:id and are owner/editor-only.
//
// All routes require a STAFF account (the editor is staff-gated); per-magazine
// access is then checked against owner/collaborator membership.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../lib/db.js';
import { withIdentityDefaults, STAFF_ROLES } from '../lib/identity.js';
import { isStaff } from '../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };

type MagRole = 'owner' | 'editor' | 'contributor';
interface Collaborator {
  userId: string;
  email: string;
  displayName: string;
  role: 'editor' | 'contributor';
  pageIds: string[] | 'all';
}

function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

/** List projection — drops the heavy `pages` payload, keeps a page count. */
function summarize(doc: WithMongoId) {
  const { _id, pages, ...rest } = doc;
  return { id: _id, ...rest, pageCount: Array.isArray(pages) ? pages.length : 0 };
}

function collaborators(doc: WithMongoId): Collaborator[] {
  return Array.isArray(doc.collaborators) ? (doc.collaborators as Collaborator[]) : [];
}

function roleOnMagazine(doc: WithMongoId, userId: string): MagRole | null {
  if (doc.ownerId === userId) return 'owner';
  const c = collaborators(doc).find((x) => x.userId === userId);
  return c ? c.role : null;
}

const canEditAll = (role: MagRole | null) => role === 'owner' || role === 'editor';
const canManage = (role: MagRole | null) => role === 'owner' || role === 'editor';

/** The set of page ids a user may edit: 'all' for owner/editor, else their assignment. */
function editablePageIds(doc: WithMongoId, userId: string): string[] | 'all' {
  const role = roleOnMagazine(doc, userId);
  if (canEditAll(role)) return 'all';
  const c = collaborators(doc).find((x) => x.userId === userId);
  return c ? c.pageIds : [];
}

function canEditPage(doc: WithMongoId, userId: string, pageId: string): boolean {
  const ids = editablePageIds(doc, userId);
  return ids === 'all' || ids.includes(pageId);
}

/** Attach the caller's role + editable scope so the client can gate its UI. */
function withViewer(doc: WithMongoId, userId: string) {
  return {
    ...project(doc),
    myRole: roleOnMagazine(doc, userId),
    myEditablePageIds: editablePageIds(doc, userId),
  };
}

const router = Router();

// ── All magazine routes require a signed-in STAFF account ─────────────────────
import { attachAccount } from '../lib/auth.js';
router.use(attachAccount);
router.use((req, res, next) => {
  if (!isStaff(req.account)) {
    res.status(403).json({ error: 'Staff access required.' });
    return;
  }
  next();
});

// list — magazines the caller owns or collaborates on
router.get('/', async (req, res) => {
  const uid = req.account!.id;
  const all = await db.collection('magazines').find();
  const mine = all.filter((d) => d.ownerId === uid || collaborators(d).some((c) => c.userId === uid));
  res.json(
    mine.map((d) => ({ ...summarize(d), myRole: roleOnMagazine(d, uid) })),
  );
});

// get one — owner or collaborator only
router.get('/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await db.collection('magazines').findById(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(withViewer(doc, uid));
});

// create — caller becomes owner
router.post('/', async (req, res) => {
  const uid = req.account!.id;
  const body = req.body as Partial<{
    title: string;
    edition: string;
    coverImage: string;
    pages: unknown[];
  }>;
  if (!body || !body.title || !Array.isArray(body.pages)) {
    res.status(400).json({ error: 'title and pages are required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    title: body.title,
    edition: body.edition ?? '',
    coverImage: body.coverImage ?? '',
    status: 'draft',
    pages: body.pages,
    ownerId: uid,
    ownerName: req.account!.displayName,
    collaborators: [],
    publishedIssueIds: [],
    createdAt: now,
    updatedAt: now,
    updatedBy: { userId: uid, displayName: req.account!.displayName },
  };
  const id = await db.collection('magazines').insertOne(doc);
  const created = await db.collection('magazines').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(withViewer(created, uid));
});

// update meta / publish-selection — owner or editor only
router.patch('/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await db.collection('magazines').findById(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!canManage(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner or an editor can change magazine settings.' });
    return;
  }

  const body = req.body as Partial<{
    title: string;
    edition: string;
    coverImage: string;
    /** Ids of pages to mark selectedForPublish=true (others set false). */
    selectedPageIds: string[];
  }>;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: { userId: uid, displayName: req.account!.displayName },
  };
  if (typeof body.title === 'string') update.title = body.title;
  if (typeof body.edition === 'string') update.edition = body.edition;
  if (typeof body.coverImage === 'string') update.coverImage = body.coverImage;
  if (Array.isArray(body.selectedPageIds)) {
    const sel = new Set(body.selectedPageIds);
    const pages = Array.isArray(doc.pages) ? doc.pages : [];
    update.pages = pages.map((p: Record<string, unknown>) => ({ ...p, selectedForPublish: sel.has(String(p.id)) }));
  }

  await db.collection('magazines').updateOne(req.params.id, update);
  const updated = await db.collection('magazines').findById(req.params.id);
  res.json(withViewer(updated!, uid));
});

// update ONE page's content — page-scoped (the debounced edit hot path)
router.patch('/:id/pages/:pageId', async (req, res) => {
  const uid = req.account!.id;
  const { id, pageId } = req.params;
  const doc = await db.collection('magazines').findById(id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!canEditPage(doc, uid, pageId)) {
    res.status(403).json({ error: 'You can only edit the pages shared with you.' });
    return;
  }
  const content = (req.body as { content?: Record<string, unknown> })?.content;
  if (!content || typeof content !== 'object') {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  const idx = pages.findIndex((p: Record<string, unknown>) => String(p.id) === pageId);
  if (idx === -1) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  const now = new Date().toISOString();
  const nextPages = pages.map((p: Record<string, unknown>, i: number) =>
    i === idx ? { ...p, content } : p,
  );
  await db.collection('magazines').updateOne(id, {
    pages: nextPages,
    updatedAt: now,
    updatedBy: { userId: uid, displayName: req.account!.displayName },
  });
  res.json({ ok: true, updatedAt: now });
});

// add / update a collaborator (by email) — owner or editor only; staff accounts only
router.post('/:id/collaborators', async (req, res) => {
  const uid = req.account!.id;
  const doc = await db.collection('magazines').findById(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!canManage(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner or an editor can manage collaborators.' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const role = req.body?.role === 'editor' ? 'editor' : 'contributor';
  const rawPageIds = req.body?.pageIds;
  const pageIds: string[] | 'all' = rawPageIds === 'all' || rawPageIds == null
    ? 'all'
    : Array.isArray(rawPageIds)
      ? rawPageIds.map(String)
      : 'all';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'A valid email is required.' });
    return;
  }
  const existing = (await db.collection('users').find({ email }))[0];
  if (!existing) {
    res.status(404).json({ error: 'No account with that email. Ask them to sign up first.' });
    return;
  }
  const acct = withIdentityDefaults({ id: existing._id, ...existing });
  if (!acct.roles.some((r) => (STAFF_ROLES as string[]).includes(r))) {
    res.status(400).json({ error: 'That person is not a staff member, so they cannot be added.' });
    return;
  }
  if (acct.id === doc.ownerId) {
    res.status(409).json({ error: 'That person is the owner of this magazine.' });
    return;
  }

  const next: Collaborator = {
    userId: acct.id,
    email: acct.email,
    displayName: acct.displayName,
    role,
    pageIds,
  };
  const others = collaborators(doc).filter((c) => c.userId !== acct.id);
  await db.collection('magazines').updateOne(req.params.id, {
    collaborators: [...others, next],
    updatedAt: new Date().toISOString(),
  });
  const updated = await db.collection('magazines').findById(req.params.id);
  res.status(201).json(withViewer(updated!, uid));
});

// remove a collaborator — owner or editor only
router.delete('/:id/collaborators/:userId', async (req, res) => {
  const uid = req.account!.id;
  const doc = await db.collection('magazines').findById(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!canManage(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner or an editor can manage collaborators.' });
    return;
  }
  await db.collection('magazines').updateOne(req.params.id, {
    collaborators: collaborators(doc).filter((c) => c.userId !== req.params.userId),
    updatedAt: new Date().toISOString(),
  });
  const updated = await db.collection('magazines').findById(req.params.id);
  res.json(withViewer(updated!, uid));
});

// delete — owner only
router.delete('/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await db.collection('magazines').findById(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (roleOnMagazine(doc, uid) !== 'owner') {
    res.status(403).json({ error: 'Only the owner can delete this magazine.' });
    return;
  }
  await db.collection('magazines').deleteOne(req.params.id);
  res.json({ success: true });
});

export default router;
