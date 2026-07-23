// ---------------------------------------------------------------------------
// Magazine Builder v2 — REST API (drafts).
//
// Two collections: issue meta (magazinesV2) + per-page elements (magazinePagesV2).
// The client NEVER sends a whole pages array — every mutation is a targeted
// issue/page/element op applied server-side against stored data:
//   - Element writes (add/patch/delete) are an ATOMIC compare-and-set on the
//     page's `rev` (db.updateOneIf), so concurrent edits can't lose updates —
//     a stale writer gets a 409 with the current page to reconcile. `rev` is
//     MANDATORY on every element write (no silent last-write-wins).
//   - Structural ops (add/duplicate/delete/reorder page) are serialised per
//     issue with an in-process lock, so their multi-write reindex can't interleave.
// Together these fix the v1 clobbering class (REVIEW-FINDINGS H1/M13). Elements
// and pages are addressed by STABLE ids (not array position), so a reorder can't
// misdirect an in-flight edit. Staff-gated; per-magazine owner/collaborator
// scoped; non-GET writes rate-limited (H5). All behind the MAGAZINE_V2 flag.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { db } from '../lib/db.js';
import { attachAccount } from '../lib/auth.js';
import { isStaff } from '../lib/rbac.js';
import { MAGAZINE_V2_ENABLED, PAGE_W, PAGE_H, MAX_PAGES_PER_ISSUE } from '../lib/magazineV2/config.js';
import { COL } from '../lib/magazineV2/collections.js';
import { rateLimit } from '../lib/magazineV2/rateLimit.js';
import { roleOnMagazine, isOwner, canEditPage, editablePageIds } from '../lib/magazineV2/access.js';
import { normalizeElements, normalizeElementPatch } from '../lib/magazineV2/writePipeline.js';
import { MAX_ELEMENTS_PER_PAGE, type MagazineElement } from '../lib/magazineV2/model.js';
import { isAgentConfigured } from '../lib/agent/provider.js';
import { generateMagazineIssue, generateMorePages } from '../lib/magazineV2/generate.js';
import { runPageAgent } from '../lib/magazineV2/agent.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = { _id: string; [k: string]: any };
type StructResult = { status: number; error?: string; pages?: any[] };

function project(doc: Doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

const router = Router();

// ── Gates: feature flag → signed-in staff → write rate limit ──────────────────
router.use((_req, res, next) => {
  if (!MAGAZINE_V2_ENABLED) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});
router.use(attachAccount);
router.use((req, res, next) => {
  if (!isStaff(req.account)) {
    res.status(403).json({ error: 'Staff access required.' });
    return;
  }
  next();
});
// Generous runaway-backstop for cheap, authenticated element/page writes — high
// enough not to bite an intensive editing session (drag/type bursts), low enough
// to stop a looping client. Expensive AI/upload endpoints get their own STRICTER
// limits when those phases land (import/generation/agent).
router.use(rateLimit('mag2-write', 300, 60_000));

// ── Per-issue serialization for structural ops ───────────────────────────────
// Structural reindexing is several writes; serialising per issue (single API
// process) prevents two concurrent owner ops from interleaving into duplicate /
// gapped page indexes.
const issueChains = new Map<string, Promise<void>>();
async function withIssueLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = issueChains.get(id) ?? Promise.resolve();
  let resolveNext!: () => void;
  const next = new Promise<void>((r) => (resolveNext = r));
  const chained = prev.then(() => next);
  issueChains.set(id, chained);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    resolveNext();
    if (issueChains.get(id) === chained) issueChains.delete(id);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function loadIssue(id: string): Promise<Doc | null> {
  return (await db.collection(COL.issues).findById(id)) as Doc | null;
}

async function pagesFor(magazineId: string): Promise<Doc[]> {
  const pages = (await db.collection(COL.pages).find({ magazineId })) as Doc[];
  return pages.sort((a, b) => (a.index as number) - (b.index as number));
}

async function pageById(pageId: string): Promise<Doc | null> {
  return (await db.collection(COL.pages).findById(pageId)) as Doc | null;
}

function pageDims(p: Doc): { width: number; height: number } {
  return { width: Number(p.width) || PAGE_W, height: Number(p.height) || PAGE_H };
}

/**
 * Write a new page order two-phase (park all at a high offset, then land each at
 * its final 0..n-1 index) so it's safe even if a unique {magazineId,index} index
 * is added later. Callers run this inside withIssueLock so it can't interleave.
 */
async function writeOrder(orderedIds: string[]): Promise<void> {
  const OFFSET = 1_000_000;
  for (let i = 0; i < orderedIds.length; i++) {
    await db.collection(COL.pages).updateOne(orderedIds[i]!, { index: OFFSET + i });
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await db.collection(COL.pages).updateOne(orderedIds[i]!, { index: i });
  }
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'issue'
  );
}
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  const existing = (await db.collection(COL.issues).find()) as Doc[];
  const taken = new Set(existing.map((d) => String(d.slug)));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 9999; n++) {
    const s = `${base}-${n}`;
    if (!taken.has(s)) return s;
  }
  return `${base}-${Date.now()}`;
}

function withViewer(doc: Doc, uid: string) {
  return { ...project(doc), myRole: roleOnMagazine(doc, uid), myEditablePageIds: editablePageIds(doc, uid) };
}

/** Guard structural ops while a worker is digitising/generating the issue. */
function isBusy(issue: Doc): boolean {
  return issue.status === 'processing' || issue.status === 'uploading';
}

async function blankPage(magazineId: string): Promise<string> {
  const now = new Date().toISOString();
  return db.collection(COL.pages).insertOne({
    magazineId,
    index: 0,
    width: PAGE_W,
    height: PAGE_H,
    background: { type: 'color', value: '#ffffff' },
    elements: [],
    status: 'reviewed',
    selectedForPublish: true,
    rev: 0,
    createdAt: now,
    updatedAt: now,
  });
}

function pageSummary(p: Doc) {
  return {
    id: p._id,
    index: p.index,
    width: p.width,
    height: p.height,
    status: p.status,
    rev: p.rev ?? 0,
    selectedForPublish: p.selectedForPublish !== false,
    elementCount: Array.isArray(p.elements) ? p.elements.length : 0,
  };
}

// ── Issue lifecycle ─────────────────────────────────────────────────────────

// list — issues the caller owns or collaborates on
router.get('/issues', async (req, res) => {
  const uid = req.account!.id;
  const all = (await db.collection(COL.issues).find()) as Doc[];
  const mine = all.filter((d) => roleOnMagazine(d, uid));
  const counts = await Promise.all(mine.map((d) => pagesFor(d._id).then((p) => p.length)));
  const rows = mine
    .map((d, i) => ({
      id: d._id,
      title: d.title,
      slug: d.slug,
      status: d.status,
      origin: d.origin,
      coverImage: d.coverImage ?? '',
      pageCount: counts[i],
      myRole: roleOnMagazine(d, uid),
      updatedAt: d.updatedAt,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json(rows);
});

// create a blank scratch issue with one blank page
router.post('/issues/blank', async (req, res) => {
  const uid = req.account!.id;
  const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : 'Untitled issue';
  const now = new Date().toISOString();
  const id = await db.collection(COL.issues).insertOne({
    title,
    slug: await uniqueSlug(title),
    status: 'draft',
    origin: 'scratch',
    coverImage: '',
    pagesProcessed: 0,
    pagesTotal: 1,
    ownerId: uid,
    ownerName: req.account!.displayName,
    collaborators: [],
    publishedIssueIds: [],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
  });
  await blankPage(id);
  const created = await loadIssue(id);
  if (!created) {
    res.status(500).json({ error: 'Failed to create issue' });
    return;
  }
  res.status(201).json({ issue: withViewer(created, uid), pages: (await pagesFor(id)).map(pageSummary) });
});

// Build with AI — create a 'processing' issue and generate pages in the
// background (LLM art-director → curated templates). Client polls GET /issues/:id
// until status flips to 'ready'/'failed'. Tighter rate limit (AI is expensive).
router.post('/issues/generate', rateLimit('mag2-generate', 10, 60_000), async (req, res) => {
  const uid = req.account!.id;
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'AI is not configured on this server.' });
    return;
  }
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  // Optional source document text (already ingested client-side) to build FROM.
  const sourceText = typeof req.body?.sourceText === 'string' ? req.body.sourceText.slice(0, 60_000) : '';
  if (!prompt && !sourceText.trim()) {
    res.status(400).json({ error: 'Describe the magazine you want, or attach a document to build from.' });
    return;
  }
  const pc = Number(req.body?.pageCount);
  const pageCount = Number.isInteger(pc) && pc >= 3 && pc <= 16 ? pc : undefined;
  const now = new Date().toISOString();
  const id = await db.collection(COL.issues).insertOne({
    title: 'Generating…',
    slug: await uniqueSlug('issue'),
    status: 'processing',
    origin: 'scratch',
    coverImage: '',
    pagesProcessed: 0,
    pagesTotal: pageCount ?? 8,
    stage: 'Designing the issue',
    ownerId: uid,
    ownerName: req.account!.displayName,
    collaborators: [],
    publishedIssueIds: [],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
  });
  // Fire-and-forget: generation runs in the background, updating the issue.
  void generateMagazineIssue(id, prompt, pageCount, sourceText);
  const created = await loadIssue(id);
  res.status(202).json({ issue: created ? withViewer(created, uid) : { id } });
});

// get issue meta + page summaries (NOT full element payloads)
router.get('/issues/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ issue: withViewer(doc, uid), pages: (await pagesFor(doc._id)).map(pageSummary) });
});

// rename — owner only (slug is immutable)
router.patch('/issues/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can change settings.' });
    return;
  }
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  await db.collection(COL.issues).updateOne(doc._id, { title, updatedAt: new Date().toISOString() });
  const fresh = await loadIssue(doc._id);
  if (!fresh) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(withViewer(fresh, uid));
});

// delete — owner only (soft-delete issue + its pages)
router.delete('/issues/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can delete this magazine.' });
    return;
  }
  await withIssueLock(doc._id, async () => {
    for (const p of await pagesFor(doc._id)) await db.collection(COL.pages).deleteOne(p._id);
    await db.collection(COL.issues).deleteOne(doc._id);
  });
  res.json({ success: true });
});

// ── Page structure (owner only, serialised per issue) ───────────────────────

async function requireOwnedIssue(req: any, res: any): Promise<Doc | null> {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can change page structure.' });
    return null;
  }
  if (isBusy(doc)) {
    res.status(409).json({ error: 'The magazine is still processing. Try again shortly.' });
    return null;
  }
  return doc;
}

// insert a blank page (at `index`, or appended)
router.post('/issues/:id/pages', async (req, res) => {
  const doc = await requireOwnedIssue(req, res);
  if (!doc) return;
  const out = await withIssueLock<StructResult>(doc._id, async () => {
    const current = await pagesFor(doc._id);
    if (current.length >= MAX_PAGES_PER_ISSUE) return { status: 409, error: `A magazine can have at most ${MAX_PAGES_PER_ISSUE} pages.` };
    const newId = await blankPage(doc._id);
    const at = Number(req.body?.index);
    const ids = current.map((p) => p._id);
    const pos = Number.isInteger(at) && at >= 0 && at <= ids.length ? at : ids.length;
    ids.splice(pos, 0, newId);
    await writeOrder(ids);
    await db.collection(COL.issues).updateOne(doc._id, { updatedAt: new Date().toISOString() });
    return { status: 201, pages: (await pagesFor(doc._id)).map(pageSummary) };
  });
  if (out.error) {
    res.status(out.status).json({ error: out.error });
    return;
  }
  res.status(out.status).json({ pages: out.pages });
});

// duplicate a page (deep copy, fresh element ids), inserted right after it
router.post('/issues/:id/pages/:pageId/duplicate', async (req, res) => {
  const doc = await requireOwnedIssue(req, res);
  if (!doc) return;
  const out = await withIssueLock<StructResult>(doc._id, async () => {
    const pages = await pagesFor(doc._id);
    const srcIdx = pages.findIndex((p) => p._id === req.params.pageId);
    if (srcIdx === -1) return { status: 404, error: 'Page not found' };
    if (pages.length >= MAX_PAGES_PER_ISSUE) return { status: 409, error: `A magazine can have at most ${MAX_PAGES_PER_ISSUE} pages.` };
    const src = pages[srcIdx]!;
    const now = new Date().toISOString();
    // Strip element ids so normalizeElements assigns fresh ones (also re-validates).
    const freshEls = normalizeElements(
      (Array.isArray(src.elements) ? src.elements : []).map((e: MagazineElement) => ({ ...e, id: undefined })),
      pageDims(src),
    );
    const newId = await db.collection(COL.pages).insertOne({
      magazineId: doc._id,
      index: src.index,
      width: src.width,
      height: src.height,
      background: src.background,
      elements: freshEls,
      status: 'reviewed',
      selectedForPublish: src.selectedForPublish !== false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    });
    const ids = pages.map((p) => p._id);
    ids.splice(srcIdx + 1, 0, newId);
    await writeOrder(ids);
    await db.collection(COL.issues).updateOne(doc._id, { updatedAt: now });
    return { status: 201, pages: (await pagesFor(doc._id)).map(pageSummary) };
  });
  if (out.error) {
    res.status(out.status).json({ error: out.error });
    return;
  }
  res.status(out.status).json({ pages: out.pages });
});

// delete a page (never the last one)
router.delete('/issues/:id/pages/:pageId', async (req, res) => {
  const doc = await requireOwnedIssue(req, res);
  if (!doc) return;
  const out = await withIssueLock<StructResult>(doc._id, async () => {
    const pages = await pagesFor(doc._id);
    if (pages.length <= 1) return { status: 409, error: 'A magazine must have at least one page.' };
    const victim = pages.find((p) => p._id === req.params.pageId);
    if (!victim) return { status: 404, error: 'Page not found' };
    await db.collection(COL.pages).deleteOne(victim._id);
    await writeOrder(pages.filter((p) => p._id !== victim._id).map((p) => p._id));
    await db.collection(COL.issues).updateOne(doc._id, { updatedAt: new Date().toISOString() });
    return { status: 200, pages: (await pagesFor(doc._id)).map(pageSummary) };
  });
  if (out.error) {
    res.status(out.status).json({ error: out.error });
    return;
  }
  res.json({ pages: out.pages });
});

// reorder — move page from → to (array positions)
router.patch('/issues/:id/pages/reorder', async (req, res) => {
  const doc = await requireOwnedIssue(req, res);
  if (!doc) return;
  const out = await withIssueLock<StructResult>(doc._id, async () => {
    const pages = await pagesFor(doc._id);
    const from = Number(req.body?.from);
    const to = Number(req.body?.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
      return { status: 400, error: 'from/to out of range' };
    }
    const ids = pages.map((p) => p._id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    await writeOrder(ids);
    await db.collection(COL.issues).updateOne(doc._id, { updatedAt: new Date().toISOString() });
    return { status: 200, pages: (await pagesFor(doc._id)).map(pageSummary) };
  });
  if (out.error) {
    res.status(out.status).json({ error: out.error });
    return;
  }
  res.json({ pages: out.pages });
});

// generate & insert on-theme AI pages at `atIndex` (owner only). Flips the issue
// to 'processing' and designs/composes in the background (matching campaign-hq's
// "add pages matching theme"); the client polls GET /issues/:id. Structural ops
// are blocked while processing, so the background reindex can't interleave.
router.post('/issues/:id/pages/generate', rateLimit('mag2-generate', 10, 60_000), async (req, res) => {
  const doc = await requireOwnedIssue(req, res);
  if (!doc) return;
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'AI is not configured on this server.' });
    return;
  }
  const count = Number(req.body?.count);
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    res.status(400).json({ error: 'count must be an integer 1–12.' });
    return;
  }
  const pages = await pagesFor(doc._id);
  if (pages.length + count > MAX_PAGES_PER_ISSUE) {
    res.status(409).json({ error: `A magazine can have at most ${MAX_PAGES_PER_ISSUE} pages.` });
    return;
  }
  const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim().slice(0, 400) : undefined;
  const at = Number(req.body?.atIndex);
  const atIndex = Number.isInteger(at) && at >= 0 && at <= pages.length ? at : pages.length;
  const prevStatus = String(doc.status);
  await db.collection(COL.issues).updateOne(doc._id, { status: 'processing', stage: 'Designing pages', updatedAt: new Date().toISOString() });
  void generateMorePages(doc._id, { count, topic, atIndex, prevStatus });
  const fresh = await loadIssue(doc._id);
  res.status(202).json({ issue: fresh ? withViewer(fresh, req.account!.id) : { id: doc._id } });
});

// ── Page content + elements (owner or assigned collaborator) ────────────────
// Addressed by STABLE page id so a concurrent reorder can't misdirect an edit.

async function loadEditablePage(req: any, res: any): Promise<{ issue: Doc; page: Doc } | null> {
  const uid = req.account!.id;
  const issue = await loadIssue(req.params.id);
  if (!issue || !roleOnMagazine(issue, uid)) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const page = await pageById(req.params.pageId);
  if (!page || page.magazineId !== issue._id) {
    res.status(404).json({ error: 'Page not found' });
    return null;
  }
  if (!canEditPage(issue, uid, page._id)) {
    res.status(403).json({ error: 'You can only edit the pages shared with you.' });
    return null;
  }
  return { issue, page };
}

/** Parse & require an integer `rev` from the body (concurrency token). */
function requireRev(req: any, res: any): number | null {
  const rev = Number(req.body?.rev);
  if (!Number.isInteger(rev)) {
    res.status(400).json({ error: 'A numeric page `rev` is required for element writes.' });
    return null;
  }
  return rev;
}

// get one page's full element payload (owner or collaborator, read)
router.get('/issues/:id/pages/:pageId', async (req, res) => {
  const uid = req.account!.id;
  const issue = await loadIssue(req.params.id);
  if (!issue || !roleOnMagazine(issue, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const page = await pageById(req.params.pageId);
  if (!page || page.magazineId !== issue._id) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  res.json({ page: project(page) });
});

// add one element (atomic CAS on page rev)
router.post('/issues/:id/pages/:pageId/elements', async (req, res) => {
  const ctx = await loadEditablePage(req, res);
  if (!ctx) return;
  const rev = requireRev(req, res);
  if (rev === null) return;
  const { page } = ctx;
  if ((page.rev ?? 0) !== rev) {
    res.status(409).json({ error: 'This page changed since you loaded it.', page: project(page) });
    return;
  }
  const els: MagazineElement[] = Array.isArray(page.elements) ? page.elements : [];
  if (els.length >= MAX_ELEMENTS_PER_PAGE) {
    res.status(409).json({ error: `A page can have at most ${MAX_ELEMENTS_PER_PAGE} elements.` });
    return;
  }
  const [created] = normalizeElements([{ ...req.body?.element, id: undefined, source: 'manual' }], pageDims(page));
  if (!created) {
    res.status(400).json({ error: 'Invalid element' });
    return;
  }
  const now = new Date().toISOString();
  const ok = await db
    .collection(COL.pages)
    .updateOneIf(page._id, { rev }, { elements: [...els, created], rev: rev + 1, updatedAt: now });
  if (!ok) {
    const fresh = await pageById(page._id);
    res.status(409).json({ error: 'This page changed since you loaded it.', page: fresh ? project(fresh) : null });
    return;
  }
  res.status(201).json({ element: created, rev: rev + 1 });
});

// patch one element — the hot path (atomic CAS on page rev)
router.patch('/issues/:id/pages/:pageId/elements/:elementId', async (req, res) => {
  const ctx = await loadEditablePage(req, res);
  if (!ctx) return;
  const rev = requireRev(req, res);
  if (rev === null) return;
  const { page } = ctx;
  if ((page.rev ?? 0) !== rev) {
    res.status(409).json({ error: 'This page changed since you loaded it.', page: project(page) });
    return;
  }
  const els: MagazineElement[] = Array.isArray(page.elements) ? page.elements : [];
  const idx = els.findIndex((e) => e.id === req.params.elementId);
  if (idx === -1) {
    res.status(404).json({ error: 'Element not found' });
    return;
  }
  const partial = (req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : {}) as Record<string, unknown>;
  const updated = normalizeElementPatch(els[idx]!, partial, pageDims(page));
  if (!updated) {
    res.status(400).json({ error: 'Invalid element patch' });
    return;
  }
  const next = els.slice();
  next[idx] = updated;
  const now = new Date().toISOString();
  const ok = await db.collection(COL.pages).updateOneIf(page._id, { rev }, { elements: next, rev: rev + 1, updatedAt: now });
  if (!ok) {
    const fresh = await pageById(page._id);
    res.status(409).json({ error: 'This page changed since you loaded it.', page: fresh ? project(fresh) : null });
    return;
  }
  res.json({ element: updated, rev: rev + 1 });
});

// delete one element (atomic CAS on page rev)
router.delete('/issues/:id/pages/:pageId/elements/:elementId', async (req, res) => {
  const ctx = await loadEditablePage(req, res);
  if (!ctx) return;
  const rev = requireRev(req, res);
  if (rev === null) return;
  const { page } = ctx;
  if ((page.rev ?? 0) !== rev) {
    res.status(409).json({ error: 'This page changed since you loaded it.', page: project(page) });
    return;
  }
  const els: MagazineElement[] = Array.isArray(page.elements) ? page.elements : [];
  const next = els.filter((e) => e.id !== req.params.elementId);
  if (next.length === els.length) {
    res.status(404).json({ error: 'Element not found' });
    return;
  }
  const now = new Date().toISOString();
  const ok = await db.collection(COL.pages).updateOneIf(page._id, { rev }, { elements: next, rev: rev + 1, updatedAt: now });
  if (!ok) {
    const fresh = await pageById(page._id);
    res.status(409).json({ error: 'This page changed since you loaded it.', page: fresh ? project(fresh) : null });
    return;
  }
  res.json({ ok: true, rev: rev + 1 });
});

// AI editing agent for one page — the model calls tools that STAGE proposals
// (never writes); returns { reply, proposals }. The client applies each proposal
// through the element CRUD above (rev-guarded), so the same guardrails apply.
router.post('/issues/:id/pages/:pageId/agent', rateLimit('mag2-agent', 20, 60_000), async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'AI is not configured on this server.' });
    return;
  }
  const ctx = await loadEditablePage(req, res);
  if (!ctx) return;
  const { page } = ctx;
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (messages.length === 0) {
    res.status(400).json({ error: 'messages[] is required' });
    return;
  }
  const selectedElementId = typeof req.body?.selectedElementId === 'string' ? req.body.selectedElementId : undefined;
  const sourceText = typeof req.body?.sourceText === 'string' ? req.body.sourceText.slice(0, 60_000) : undefined;
  try {
    const turn = await runPageAgent({
      messages,
      page: {
        width: Number(page.width) || PAGE_W,
        height: Number(page.height) || PAGE_H,
        elements: Array.isArray(page.elements) ? page.elements : [],
        index: Number(page.index) || 0,
      },
      magazineId: page.magazineId,
      selectedElementId,
      sourceText,
    });
    res.json(turn);
  } catch (err) {
    console.error('[magazineV2] agent error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'The assistant hit a snag. Please try again.' });
  }
});

export default router;
