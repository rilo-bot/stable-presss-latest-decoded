// ---------------------------------------------------------------------------
// Magazine DRAFTS — server-persisted so multiple staff can collaborate on one
// magazine. (Published, frozen, public copies live in routes/issues.ts.)
//
// Collaboration model (page-assigned, staff-only):
//   - owner       — the creator: runs the magazine. Edits ANY page, manages
//                   collaborators, changes settings, publishes, and deletes.
//   - collaborator — anyone the owner shares with: edits ONLY the pages assigned
//                   to them (pageIds, or 'all'). No management/publish rights.
//
// `role` ('editor'|'contributor') on a collaborator is derived from the staff
// role they already hold and is shown as an informational badge — it does NOT
// grant management. Management is OWNER-ONLY (so a collaborator can never widen
// their own page scope or remove peers); the only thing the sharer chooses is
// which pages each collaborator may edit.
//
// Conflict handling is last-write-wins per page, which is safe in practice
// because collaborators are assigned different pages. Content edits persist via
// the per-page PATCH below (debounced on the client); structural changes (title,
// cover, publish-selection) go through PATCH /:id and are owner-only.
//
// All routes require a STAFF account (the editor is staff-gated); per-magazine
// access is then checked against owner/collaborator membership.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../lib/db.js';
import { withIdentityDefaults, type IdentityUser } from '../lib/identity.js';
import { identityCan, identitiesWith } from '../lib/effectiveAccess.js';
import { canAccessNewsroom } from '../lib/rbac.js';
import { sanitizeContentMap, sanitizePages } from '../lib/sanitizeHtml.js';

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

// Two independent axes:
//   - WHICH PAGES a person may edit = the pages assigned to them (owner = all).
//   - Management (publish / settings / add+remove collaborators / delete) is
//     OWNER-ONLY. A non-owner collaborator therefore can never widen their own
//     page scope or strip peers — page assignment is a real boundary for everyone.
// The stored editor/contributor role is derived from staff role for display only.
const isOwner = (role: MagRole | null) => role === 'owner';

/**
 * The collaborator badge shown in the Share dialog. This is the per-magazine
 * sharing axis (MagRole), NOT a staff role — it grants nothing on its own.
 *
 * Derived from a permission rather than a role slug: it used to test for
 * ['administrator','publisher','editor'] against `user.roles[]`, which no
 * longer carries staff slugs at all, so every collaborator would have silently
 * been badged "contributor". `content.draft.edit_any` is the same semantic and
 * follows whatever a superadmin configures.
 */
async function magRoleForStaff(identity: IdentityUser): Promise<'editor' | 'contributor'> {
  return (await identityCan(identity, 'content.draft.edit_any')) ? 'editor' : 'contributor';
}

/** The set of page ids a user may edit: 'all' for the owner, else their assignment. */
function editablePageIds(doc: WithMongoId, userId: string): string[] | 'all' {
  if (doc.ownerId === userId) return 'all';
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
  if (!canAccessNewsroom(req.account)) {
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

// staff directory — candidates for the Share dialog (any staff caller).
// Declared before '/:id' so the literal path isn't captured as a magazine id.
router.get('/staff-directory', async (_req, res) => {
  const users = await db.collection('users').find();
  // Only the fields the Share picker needs — no staff-role enumeration.
  const candidates = users.map((u) => withIdentityDefaults({ id: u._id, ...u }));
  const staff = (await identitiesWith(candidates, 'newsroom.access'))
    .map((u) => ({ userId: u.id, displayName: u.displayName, email: u.email }))
    .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
  res.json(staff);
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
    pages: sanitizePages(body.pages),
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
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can change magazine settings.' });
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

// replace the whole page list (add / remove / reorder) — owner only.
// The client sends the full ordered pages array (with content); structural
// changes can't be made by collaborators, so this is gated to the owner.
router.put('/:id/pages', async (req, res) => {
  const uid = req.account!.id;
  const doc = await db.collection('magazines').findById(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can add, remove or reorder pages.' });
    return;
  }
  const pages = (req.body as { pages?: unknown })?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    res.status(400).json({ error: 'pages must be a non-empty array' });
    return;
  }
  const now = new Date().toISOString();
  await db.collection('magazines').updateOne(req.params.id, {
    pages: sanitizePages(pages),
    updatedAt: now,
    updatedBy: { userId: uid, displayName: req.account!.displayName },
  });
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
  // Trust boundary: never store rich text the client could have tampered with.
  const safeContent = sanitizeContentMap(content);
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  const idx = pages.findIndex((p: Record<string, unknown>) => String(p.id) === pageId);
  if (idx === -1) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  const now = new Date().toISOString();
  const nextPages = pages.map((p: Record<string, unknown>, i: number) =>
    i === idx ? { ...p, content: safeContent } : p,
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
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can manage collaborators.' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const rawPageIds = req.body?.pageIds;

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
  if (!(await identityCan(acct, 'newsroom.access'))) {
    res.status(400).json({ error: 'That person is not a staff member, so they cannot be added.' });
    return;
  }
  if (acct.id === doc.ownerId) {
    res.status(409).json({ error: 'That person is the owner of this magazine.' });
    return;
  }

  // Manage/publish capability follows their staff role; the editable page scope
  // is whatever the sharer assigned (all pages, or a specific set).
  const role = await magRoleForStaff(acct);
  const pageIds: string[] | 'all' =
    rawPageIds === 'all' || rawPageIds == null
      ? 'all'
      : Array.isArray(rawPageIds)
        ? rawPageIds.map(String)
        : 'all';

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
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can manage collaborators.' });
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
