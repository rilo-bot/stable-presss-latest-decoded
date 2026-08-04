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

import crypto from 'crypto';
import { Router, type RequestHandler } from 'express';
import { db } from '../lib/db.js';
import { attachAccount } from '../lib/auth.js';
import { canAccessNewsroom } from '../lib/rbac.js';
import { MAGAZINE_V2_ENABLED, PAGE_W, PAGE_H, MAX_PAGES_PER_ISSUE, MAX_SOURCE_BYTES, ALLOWED_SOURCE_MIME, sourceExtForMime, MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME, imageExtFor } from '../lib/magazineV2/config.js';
import { COL } from '../lib/magazineV2/collections.js';
import { rateLimit } from '../lib/rateLimit.js';
import { safePublicImageUrl } from '../lib/magazineV2/url.js';
import { roleOnMagazine, isOwner, canEditPage, editablePageIds, collaboratorsOf, type V2Collaborator } from '../lib/magazineV2/access.js';
import { notifyShared } from '../lib/notifyShare.js';
import { magazinePath } from '../lib/invites.js';
import { isStaffIdentity, withIdentityDefaults, type IdentityUser } from '../lib/identity.js';
import { identityCan } from '../lib/effectiveAccess.js';
import { normalizeElements, normalizeElementPatch } from '../lib/magazineV2/writePipeline.js';
import { MAX_ELEMENTS_PER_PAGE, type MagazineElement } from '../lib/magazineV2/model.js';
import { isAgentConfigured } from '../lib/agent/provider.js';
import { storage } from '../lib/storage.js';
import { enqueueJob } from '../lib/magazineV2/jobs.js';
import { runPageAgent } from '../lib/magazineV2/agent.js';
import { formatPageText, charGuideFor } from '../lib/magazineV2/format.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = { _id: string; [k: string]: any };
type StructResult = { status: number; error?: string; pages?: any[] };

function project(doc: Doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

const router = Router();

// ── Async error safety ────────────────────────────────────────────────────────
// Express 4 IGNORES a rejected promise returned by an async handler, so an
// `await db…` that throws never reaches the error middleware (index.ts) — the
// request just hangs until the client times out (audit H3). Patch this router's
// verb methods ONCE so every handler registered below has its rejections
// forwarded to next(err); the route definitions stay plain `async (req,res)=>{…}`.
// Wrapping sync middleware (e.g. rateLimit) is harmless: a non-promise return
// resolves with nothing to catch.
const forwardAsyncErrors =
  (h: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(h(req, res, next)).catch(next);
for (const verb of ['get', 'post', 'put', 'patch', 'delete'] as const) {
  const original = router[verb].bind(router) as (path: string, ...handlers: RequestHandler[]) => Router;
  (router as unknown as Record<string, unknown>)[verb] = (path: string, ...handlers: RequestHandler[]) =>
    original(path, ...handlers.map(forwardAsyncErrors));
}

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
  if (!canAccessNewsroom(req.account)) {
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
  // Only load slugs that could collide with `base` (exactly `base` or `base-N`)
  // instead of every issue in the library — a prefix-anchored regex a slug index
  // can serve, rather than a full-collection scan on every issue create.
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = (await db.collection(COL.issues).find({ slug: { $regex: `^${escaped}(-[0-9]+)?$` } })) as Doc[];
  const taken = new Set(rows.map((d) => String(d.slug)));
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

/** The pages a user may SEE, in this share-only model: the owner and 'all'-scoped
 *  collaborators see every page; a page-scoped collaborator sees ONLY their assigned
 *  pages. View scope == edit scope here, so this mirrors editablePageIds. */
function visiblePages(doc: Doc, uid: string, pages: Doc[]): Doc[] {
  const ids = editablePageIds(doc, uid);
  if (ids === 'all') return pages;
  const set = new Set(ids.map(String));
  return pages.filter((p) => set.has(String(p._id)));
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

// list — SHARE-ONLY: a magazine is listed only for its owner and the staff it's
// shared with (roleOnMagazine != null). Editing is further gated per-page by the
// collaborator's assignment; `myRole` + `ownerName` tell the client its rights.
router.get('/issues', async (req, res) => {
  const uid = req.account!.id;
  const all = (await db.collection(COL.issues).find()) as Doc[];
  // Page counts in ONE aggregation. Previously this was an N+1 that called
  // pagesFor() per issue — each loading every page's FULL elements array from
  // Mongo just to read .length (O(issues × pages × element-bytes) transferred to
  // build a list). aggregate() doesn't auto-filter soft-deletes, so match
  // deletedAt: null explicitly to mirror find()'s behaviour.
  const countRows = (await db.collection(COL.pages).aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$magazineId', count: { $sum: 1 } } },
  ])) as Doc[];
  const countByMag = new Map<string, number>(countRows.map((r) => [String(r._id), Number(r.count) || 0]));
  const rows = all
    // Access is by SHARING only: a magazine appears solely for its owner and the
    // staff it's been shared with. (Was a "shared admin library" where every staff
    // member saw every magazine — roleOnMagazine null now hides it entirely.)
    .filter((d) => roleOnMagazine(d, uid) !== null)
    .map((d) => ({
      id: d._id,
      title: d.title,
      slug: d.slug,
      status: d.status,
      origin: d.origin,
      coverImage: d.coverImage ?? '',
      pageCount: countByMag.get(d._id) ?? 0,
      myRole: roleOnMagazine(d, uid),
      ownerName: d.ownerName ?? '',
      publishedIssueId: d.publishedIssueId ?? null,
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

/**
 * Strip one element down to its DESIGN so it can seed a reusable template.
 *
 * Kept: geometry, z-order, rotation, and every styling choice (font, size, weight,
 * colour, alignment, fit, focal point) — that IS the template. Cleared: anything
 * authored — copy, photos, QR targets — so no content from the source issue leaks
 * into the new magazine.
 *
 * Decorative elements (shape, icon) survive INTACT: rules, panels, scrims and
 * glyphs carry no editorial content and are part of the design language. An empty
 * text/image/qr element still renders nothing on the public viewer, so a shell can
 * never publish placeholder junk; the EDITOR marks the empty slots so they can be
 * found and filled (see EditorCanvas).
 */
function templatizeElement(e: MagazineElement): MagazineElement {
  const out: MagazineElement = { ...e, id: undefined as unknown as string };
  if (out.text) out.text = { ...out.text, content: '' };
  if (out.image) out.image = { ...out.image, url: '', assetId: '', alt: '' };
  if (out.qr) out.qr = { ...out.qr, url: '' };
  return out;
}

/**
 * Reuse an existing magazine's LAYOUT as a brand-new magazine of your own.
 *
 * Share-only: you may reuse a magazine's layout ONLY if it's shared with you
 * (owner or collaborator). The copy is owned by the caller and the source is never
 * touched; content is stripped by templatizeElement, so this shares design only,
 * not editorial work — but the design/structure/page-count is still access-gated so
 * an unshared magazine can't be probed or cloned by id.
 */
router.post('/issues/:id/reuse', rateLimit('mag2-write', 300, 60_000), async (req, res) => {
  const uid = req.account!.id;
  const src = await loadIssue(String(req.params.id));
  if (!src || !roleOnMagazine(src, uid)) {
    res.status(404).json({ error: 'Magazine not found' });
    return;
  }
  if (isBusy(src)) {
    res.status(409).json({ error: 'That magazine is still being built — try again once it finishes.' });
    return;
  }
  const srcPages = await pagesFor(src._id);
  if (srcPages.length === 0) {
    res.status(409).json({ error: 'That magazine has no pages to reuse.' });
    return;
  }
  const requested = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const title = (requested || `${String(src.title ?? 'Untitled')} (template)`).slice(0, 200);
  const now = new Date().toISOString();
  const id = await db.collection(COL.issues).insertOne({
    title,
    slug: await uniqueSlug(title),
    status: 'draft',
    origin: 'scratch',
    coverImage: '', // the source cover is a photo — content, so not carried over
    pagesProcessed: srcPages.length,
    pagesTotal: srcPages.length,
    ownerId: uid,
    ownerName: req.account!.displayName,
    collaborators: [],
    publishedIssueIds: [],
    // Provenance: which layout this shell came from (handy for debugging, and it
    // keeps the relationship discoverable without coupling the two documents).
    reusedFromId: src._id,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
  });
  for (const p of srcPages) {
    const dims = pageDims(p);
    // normalizeElements assigns fresh ids and RE-VALIDATES every box, exactly as
    // the page-duplicate path does — a stripped element still goes through the
    // same write guardrails as any other.
    const elements = normalizeElements((Array.isArray(p.elements) ? p.elements : []).map(templatizeElement), dims);
    await db.collection(COL.pages).insertOne({
      magazineId: id,
      index: p.index,
      width: dims.width,
      height: dims.height,
      // A background PHOTO is content; keep only a colour field.
      background: p.background?.type === 'color' ? p.background : { type: 'color', value: '#ffffff' },
      elements,
      status: 'reviewed',
      selectedForPublish: p.selectedForPublish !== false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  const created = await loadIssue(id);
  if (!created) {
    res.status(500).json({ error: 'Failed to create the magazine' });
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
  // Hand off to the worker: generation (per-page LLM + image calls) is slow, so
  // it runs out-of-process. The client polls the issue status until it settles.
  await enqueueJob('generateIssue', { issueId: id, prompt, pageCount, sourceText });
  const created = await loadIssue(id);
  res.status(202).json({ issue: created ? withViewer(created, uid) : { id } });
});

// ── PDF import lifecycle (upload → confirm → background extraction) ──────────
// Upload bytes go browser→S3 directly via a presigned PUT (never through the
// API), matching campaign-hq. confirm-upload verifies the object landed
// (headObject — never trusts the client's size/type) and enqueues extraction on
// the worker; the client polls GET /issues/:id exactly like generation.

// create an 'uploading' issue + return a presigned S3 PUT for its source PDF
router.post('/issues/upload', async (req, res) => {
  const uid = req.account!.id;
  if (!storage.isConfigured()) {
    res.status(501).json({ error: 'File storage is not configured on this server.' });
    return;
  }
  const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
  const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType.trim() : '';
  const size = Number(req.body?.size);
  if (!ALLOWED_SOURCE_MIME.has(contentType)) {
    res.status(415).json({ error: 'Only PDF, Word (.docx), JPEG or PNG files can be imported.' });
    return;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SOURCE_BYTES) {
    res.status(413).json({ error: `The file must be under ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB.` });
    return;
  }
  const baseTitle = (filename ? filename.replace(/\.[^.]+$/, '') : '').trim().slice(0, 120) || 'Untitled issue';
  const now = new Date().toISOString();
  const id = await db.collection(COL.issues).insertOne({
    title: baseTitle,
    slug: await uniqueSlug(baseTitle),
    status: 'uploading',
    origin: 'upload',
    coverImage: '',
    pagesProcessed: 0,
    pagesTotal: 0,
    ownerId: uid,
    ownerName: req.account!.displayName,
    collaborators: [],
    publishedIssueIds: [],
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
  });
  // Key extension follows the mime so the worker can tell PDF/DOCX/image apart.
  // Persist the key up front so confirm-upload reads it back (never reconstructs
  // a hardcoded 'source.pdf', which broke DOCX/image imports).
  //
  // Under `public/` like every other upload in the product — one prefix, no
  // per-path exceptions. Note what that means here: the imported source file is
  // readable by anyone with its URL, where previously only this API could fetch it.
  const key = `${storage.PUBLIC_PREFIX}magazinesV2/${id}/source.${sourceExtForMime(contentType)}`;
  await db.collection(COL.issues).updateOne(id, {
    sourceFile: { key, url: '', originalName: filename.slice(0, 200), mimeType: contentType, size: 0, pageCount: 0 },
    updatedAt: now,
  });
  const uploadUrl = await storage.presignPutUrl({ key, contentType, expiresIn: 300 });
  const created = await loadIssue(id);
  res.status(201).json({ issue: created ? withViewer(created, uid) : { id }, uploadUrl, key });
});

// confirm the PUT landed → verify via headObject → enqueue extraction (owner)
router.post('/issues/:id/confirm-upload', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can do this.' });
    return;
  }
  // The key (with its correct extension) was persisted at /issues/upload — use
  // it rather than reconstructing 'source.pdf' (which mis-keyed DOCX/images).
  //
  // The fallback stays on the OLD un-prefixed key on purpose: it only ever fires
  // for issues created before the key was persisted, and those objects really are
  // at `magazinesV2/<id>/source.pdf`. Moving it to `public/` would point it at an
  // object that was never written there.
  const key = (doc.sourceFile as { key?: string } | undefined)?.key || `magazinesV2/${doc._id}/source.pdf`;
  let head: { contentLength: number; contentType: string };
  try {
    head = await storage.headObject(key); // never trust the client — read real size/type from S3
  } catch {
    res.status(400).json({ error: 'Upload not found — please try uploading again.' });
    return;
  }
  const originalName =
    typeof req.body?.originalName === 'string'
      ? req.body.originalName.slice(0, 200)
      : (doc.sourceFile as { originalName?: string } | undefined)?.originalName || '';
  const now = new Date().toISOString();
  await db.collection(COL.issues).updateOne(doc._id, {
    sourceFile: { key, url: storage.publicUrl(key), originalName, mimeType: head.contentType || (doc.sourceFile as { mimeType?: string } | undefined)?.mimeType || 'application/pdf', size: head.contentLength, pageCount: 0 },
    status: 'processing',
    stage: 'Preparing to digitize',
    updatedAt: now,
  });
  await enqueueJob('processIssue', { issueId: doc._id });
  const fresh = await loadIssue(doc._id);
  res.status(202).json({ issue: fresh ? withViewer(fresh, uid) : { id: doc._id } });
});

// re-extract a single page (owner) — sets it 'pending' and enqueues processPage
router.post('/issues/:id/pages/:pageId/retry', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can retry a page.' });
    return;
  }
  const src = doc.sourceFile as { key?: string } | undefined;
  if (!src?.key) {
    res.status(400).json({ error: 'This issue has no source file to re-extract from.' });
    return;
  }
  const page = await pageById(req.params.pageId);
  if (!page || page.magazineId !== doc._id) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  await db.collection(COL.pages).updateOne(page._id, { status: 'pending', error: '', updatedAt: new Date().toISOString() });
  await enqueueJob('processPage', { issueId: doc._id, pageId: page._id, index: Number(page.index) || 0 });
  res.status(202).json({ ok: true });
});

// list the issue's media library (extracted photos/graphics + stock/uploads)
router.get('/issues/:id/media', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  // Images only — uploaded DOCUMENTS (kind:'doc') live in the same collection but
  // surface through GET /uploads, not the image picker.
  const assets = ((await db.collection(COL.media).find({ magazineId: doc._id })) as Doc[]).filter((a) => a.kind !== 'doc');
  res.json({
    assets: assets.map((a) => ({ id: a._id, url: a.url, alt: a.alt, kind: a.kind, pageIndex: a.pageIndex, contentType: a.contentType, size: a.size })),
  });
});

// ── Document uploads (the magazine's browsable "Uploads" — PDFs/Word/text) ─────
// Stored in the same media collection as kind:'doc', carrying the extracted
// digest/text so a page can later be filled from an upload without re-reading it.
const ALLOWED_DOC_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
]);
const MAX_DOC_BYTES = MAX_SOURCE_BYTES; // reuse the 150 MB source-file cap
function docExtFor(mime: string): string {
  switch (mime) {
    case 'application/pdf': return 'pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
    case 'text/csv': return 'csv';
    case 'text/markdown': return 'md';
    case 'application/json': return 'json';
    default: return 'txt';
  }
}

// list the magazine's uploaded documents (kind:'doc'), newest first.
router.get('/issues/:id/uploads', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const docs = ((await db.collection(COL.media).find({ magazineId: doc._id })) as Doc[]).filter((a) => a.kind === 'doc');
  docs.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  res.json({
    uploads: docs.map((a) => ({
      id: a._id,
      url: a.url,
      originalName: a.originalName ?? a.alt ?? 'document',
      contentType: a.contentType,
      size: a.size,
      hasText: !!(a.sourceText && String(a.sourceText).trim()),
      createdAt: a.createdAt,
    })),
  });
});

// presign a direct-to-S3 PUT for a DOCUMENT the user is attaching (pdf/docx/text).
router.post('/issues/:id/uploads/upload-url', rateLimit('mag2-write', 300, 60_000), async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(String(req.params.id));
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!storage.isConfigured()) {
    res.status(503).json({ error: 'File storage is not configured on this server.' });
    return;
  }
  const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType.trim() : '';
  const size = Number(req.body?.size);
  if (!ALLOWED_DOC_MIME.has(contentType)) {
    res.status(415).json({ error: 'Only PDF, Word, or text documents can be uploaded here.' });
    return;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_DOC_BYTES) {
    res.status(413).json({ error: `The document must be under ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB.` });
    return;
  }
  const key = `public/magazinesV2/${doc._id}/media/${crypto.randomUUID()}.${docExtFor(contentType)}`;
  const uploadUrl = await storage.presignPutUrl({ key, contentType, expiresIn: 300 });
  res.json({ uploadUrl, key, contentType });
});

// confirm an uploaded document landed → verify from S3 → insert a kind:'doc'
// MediaAsset carrying its extracted digest/text (never trusts client size/type).
router.post('/issues/:id/uploads', rateLimit('mag2-write', 300, 60_000), async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(String(req.params.id));
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  if (!key.startsWith(`public/magazinesV2/${doc._id}/media/`)) {
    res.status(400).json({ error: 'Invalid upload key.' });
    return;
  }
  let head: { contentLength: number; contentType: string };
  try {
    head = await storage.headObject(key);
  } catch {
    res.status(400).json({ error: 'Upload not found — please try again.' });
    return;
  }
  if (!ALLOWED_DOC_MIME.has(head.contentType) || head.contentLength <= 0 || head.contentLength > MAX_DOC_BYTES) {
    res.status(413).json({ error: 'That upload is not an accepted document within the size limit.' });
    return;
  }
  const originalName = typeof req.body?.originalName === 'string' ? req.body.originalName.slice(0, 200) : 'document';
  const digest = typeof req.body?.digest === 'string' ? req.body.digest.slice(0, 4000) : '';
  const sourceText = typeof req.body?.sourceText === 'string' ? req.body.sourceText.slice(0, 80_000) : '';
  const url = storage.publicUrl(key);
  const now = new Date().toISOString();
  const assetId = await db.collection(COL.media).insertOne({
    magazineId: doc._id,
    pageIndex: null,
    key,
    url,
    contentType: head.contentType,
    size: head.contentLength,
    alt: originalName,
    originalName,
    digest,
    sourceText,
    kind: 'doc',
    source: 'upload',
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json({ upload: { id: String(assetId), url, originalName, contentType: head.contentType, size: head.contentLength, hasText: !!sourceText.trim(), createdAt: now } });
});

// fetch one uploaded document's stored text (for preview / fill-from-this).
router.get('/issues/:id/uploads/:uploadId', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  let asset: Doc | null = null;
  try {
    asset = (await db.collection(COL.media).findById(String(req.params.uploadId))) as Doc | null;
  } catch {
    asset = null;
  }
  if (!asset || String(asset.magazineId) !== String(doc._id) || asset.kind !== 'doc') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({
    id: asset._id,
    originalName: asset.originalName ?? asset.alt ?? 'document',
    url: asset.url,
    contentType: asset.contentType,
    sourceText: asset.sourceText ?? '',
    digest: asset.digest ?? '',
  });
});

// presign a direct-to-S3 PUT for an image the caller wants to add to the library
// (cover image, inspector upload). Any magazine member may add media.
router.post('/issues/:id/media/upload-url', rateLimit('mag2-write', 300, 60_000), async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(String(req.params.id));
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!storage.isConfigured()) {
    res.status(503).json({ error: 'File storage is not configured on this server.' });
    return;
  }
  const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType.trim() : '';
  const size = Number(req.body?.size);
  if (!ALLOWED_IMAGE_MIME.has(contentType)) {
    res.status(415).json({ error: 'Only PNG, JPEG, WebP, or GIF images can be uploaded.' });
    return;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: `The image must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.` });
    return;
  }
  // Under `public/` so the bucket's public-read rule serves it directly.
  const key = `public/magazinesV2/${doc._id}/media/${crypto.randomUUID()}.${imageExtFor(contentType)}`;
  const uploadUrl = await storage.presignPutUrl({ key, contentType, expiresIn: 300 });
  res.json({ uploadUrl, key, contentType });
});

// confirm an uploaded image landed → verify real size/type from S3 → insert a
// MediaAsset (never trusts the client's declared size/type).
router.post('/issues/:id/media', rateLimit('mag2-write', 300, 60_000), async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(String(req.params.id));
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  if (!key.startsWith(`public/magazinesV2/${doc._id}/media/`)) {
    res.status(400).json({ error: 'Invalid upload key.' });
    return;
  }
  let head: { contentLength: number; contentType: string };
  try {
    head = await storage.headObject(key);
  } catch {
    res.status(400).json({ error: 'Upload not found — please try again.' });
    return;
  }
  if (!ALLOWED_IMAGE_MIME.has(head.contentType) || head.contentLength <= 0 || head.contentLength > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: 'That upload is not an accepted image within the size limit.' });
    return;
  }
  const alt = typeof req.body?.alt === 'string' ? req.body.alt.slice(0, 300) : '';
  const url = storage.publicUrl(key);
  const now = new Date().toISOString();
  const assetId = await db.collection(COL.media).insertOne({
    magazineId: doc._id,
    pageIndex: null,
    key,
    url,
    contentType: head.contentType,
    size: head.contentLength,
    alt,
    kind: 'upload',
    source: 'upload',
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json({ asset: { id: String(assetId), url, alt, kind: 'upload', pageIndex: null, contentType: head.contentType, size: head.contentLength } });
});

// get issue meta + page summaries (NOT full element payloads). Owner/collaborator
// only (share-only access); a page-scoped collaborator sees only their pages.
router.get('/issues/:id', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ issue: withViewer(doc, uid), pages: visiblePages(doc, uid, await pagesFor(doc._id)).map(pageSummary) });
});

// settings — owner only (slug is immutable). Accepts `title` and/or a cover:
//   { title }                      → rename
//   { coverImage: '<url>' | '' }   → set an explicit cover URL, or '' to auto-derive
//   { coverPageId: '<pageId>' }    → use that page's image as the cover
// The cover is stored on the draft and frozen into the public snapshot at publish
// time; it's rendered server-side by the PDF export, so the URL is validated
// against a public-host allowlist (no loopback / private / metadata hosts).
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
  const body = req.body ?? {};
  const update: Record<string, unknown> = {};

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    update.title = title;
  }

  if ('coverPageId' in body) {
    const pageId = typeof body.coverPageId === 'string' ? body.coverPageId : '';
    const page = pageId ? await pageById(pageId) : null;
    if (!page || page.magazineId !== doc._id) {
      res.status(404).json({ error: 'Page not found in this magazine.' });
      return;
    }
    const cover = coverUrlOfPage(page);
    if (!cover) {
      res.status(400).json({ error: 'That page has no image to use as a cover.' });
      return;
    }
    update.coverImage = safePublicImageUrl(cover);
  } else if ('coverImage' in body) {
    const raw = typeof body.coverImage === 'string' ? body.coverImage.trim() : '';
    if (raw === '') {
      update.coverImage = ''; // clear → publish auto-derives from page 0
    } else {
      const safe = safePublicImageUrl(raw);
      if (!safe) {
        res.status(400).json({ error: 'That image URL is not allowed.' });
        return;
      }
      update.coverImage = safe;
    }
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'Nothing to update.' });
    return;
  }
  update.updatedAt = new Date().toISOString();
  await db.collection(COL.issues).updateOne(doc._id, update);
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
    // Remove the published Bulletin snapshot too, so deleting a draft can't leave
    // an orphan edition live on the newsstand.
    if (typeof doc.publishedIssueId === 'string' && doc.publishedIssueId) {
      await db.collection('issues').deleteOne(doc.publishedIssueId);
    }
    await db.collection(COL.issues).deleteOne(doc._id);
  });
  res.json({ success: true });
});

// ── Publish → Bulletins ─────────────────────────────────────────────────────
// A published v2 issue is a FROZEN snapshot written into the SHARED `issues`
// collection — the same one that powers the public Bulletins newsstand and the
// Puppeteer PDF route (apps/server/src/routes/issues.ts). We tag it
// `builder:'v2'` so the reader (BulletinViewer) renders it with the v2 free-form
// canvas; v1 issues (no `builder`) keep their template renderer. The snapshot
// stores each SELECTED page's full element payload by value, so a reader needs
// no access to the editor draft. Publishing again (republish) refreshes the same
// snapshot in place and bumps its version (so the PDF cache key changes).

/** Freeze the issue's pages into the public snapshot shape. `scope:'full'`
 *  publishes every page; `'selected'` honours each page's selectedForPublish. */
async function buildPublishSnapshot(magazineId: string, scope: 'full' | 'selected'): Promise<Doc[]> {
  const all = await pagesFor(magazineId);
  const pages = scope === 'full' ? all : all.filter((p) => p.selectedForPublish !== false);
  return pages.map((p, i) => ({
    id: p._id,
    index: i,
    width: Number(p.width) || PAGE_W,
    height: Number(p.height) || PAGE_H,
    background: p.background ?? { type: 'color', value: '#ffffff' },
    // Elements are already validated + sanitised on every write; the reader also
    // re-sanitises text on render (defense-in-depth, matching the v1 flow).
    elements: Array.isArray(p.elements) ? p.elements : [],
  })) as unknown as Doc[];
}

/** A page's own best cover URL: its background image, else its first image element. */
function coverUrlOfPage(page: any): string {
  if (!page) return '';
  if (page.background?.type === 'image' && page.background.value) return String(page.background.value);
  const img = (page.elements ?? []).find((e: any) => e.type === 'image' && e.image?.url);
  return img?.image?.url ? String(img.image.url) : '';
}

/** Best cover URL for the newsstand card: page-0 background image, else its hero. */
function coverUrlFromPages(pages: any[]): string {
  return coverUrlOfPage(pages[0]);
}

// publish (or republish) — owner only. Freezes selected pages into `issues`.
router.post('/issues/:id/publish', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can publish this magazine.' });
    return;
  }
  if (isBusy(doc)) {
    res.status(409).json({ error: 'The magazine is still processing. Try again shortly.' });
    return;
  }
  // Optional page selection (v1-parity): mark exactly these pages selectedForPublish
  // (others deselected) before freezing the snapshot. When provided, the snapshot is
  // scoped to the selection; otherwise fall back to the explicit `scope` (default 'full').
  const hasSelection = Array.isArray(req.body?.selectedPageIds);
  if (hasSelection) {
    const sel = new Set((req.body.selectedPageIds as unknown[]).filter((x): x is string => typeof x === 'string'));
    for (const p of await pagesFor(doc._id)) {
      await db.collection(COL.pages).updateOne(p._id, { selectedForPublish: sel.has(p._id) });
    }
  }
  const scope: 'full' | 'selected' = hasSelection || req.body?.scope === 'selected' ? 'selected' : 'full';
  const pages = await buildPublishSnapshot(doc._id, scope);
  if (pages.length === 0) {
    res.status(400).json({ error: 'Select at least one page to publish.' });
    return;
  }
  const cover = (typeof doc.coverImage === 'string' && doc.coverImage) || coverUrlFromPages(pages);
  const now = new Date().toISOString();
  const existingId = typeof doc.publishedIssueId === 'string' ? doc.publishedIssueId : '';
  const existing = existingId ? ((await db.collection('issues').findById(existingId)) as Doc | null) : null;

  let publishedIssueId: string;
  if (existing) {
    await db.collection('issues').updateOne(existingId, {
      title: doc.title,
      coverImage: cover,
      coverImageUrl: cover,
      pages,
      pageCount: pages.length,
      scope,
      version: (typeof existing.version === 'number' ? existing.version : 1) + 1,
      publishedAt: now,
      unpublishedAt: null,
      updatedAt: now,
    });
    publishedIssueId = existingId;
  } else {
    publishedIssueId = await db.collection('issues').insertOne({
      builder: 'v2', // discriminator — BulletinViewer renders these with the v2 canvas
      magazineIdV2: doc._id, // link back to the draft (for republish/cleanup)
      magazineId: null, // v1 field kept null so canManageIssue falls back to createdByUserId
      title: doc.title,
      edition: '',
      coverImage: cover,
      coverImageUrl: cover,
      pages,
      pageCount: pages.length,
      scope,
      version: 1,
      publishedAt: now,
      unpublishedAt: null,
      createdByUserId: uid,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.collection(COL.issues).updateOne(doc._id, {
    status: 'published',
    publishedIssueId,
    publishedAt: now,
    updatedAt: now,
  });
  const fresh = await loadIssue(doc._id);
  res.json({ issue: withViewer(fresh ?? doc, uid), publishedIssueId });
});

// unpublish — owner only. Hides the bulletin (keeps the snapshot so re-publish
// is a one-click re-show) and returns the draft to an editable 'ready' state.
router.post('/issues/:id/unpublish', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can unpublish this magazine.' });
    return;
  }
  const now = new Date().toISOString();
  const publishedIssueId = typeof doc.publishedIssueId === 'string' ? doc.publishedIssueId : '';
  if (publishedIssueId) {
    await db.collection('issues').updateOne(publishedIssueId, { unpublishedAt: now, updatedAt: now });
  }
  await db.collection(COL.issues).updateOne(doc._id, { status: 'ready', updatedAt: now });
  const fresh = await loadIssue(doc._id);
  res.json({ issue: withViewer(fresh ?? doc, uid) });
});

// toggle a page's selectedForPublish flag — owner only (drives "publish selected
// pages": the publish snapshot with scope 'selected' honours these flags).
router.patch('/issues/:id/pages/:pageId/select', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can choose which pages publish.' });
    return;
  }
  const page = await pageById(req.params.pageId);
  if (!page || page.magazineId !== doc._id) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  const selected = req.body?.selected !== false;
  await db.collection(COL.pages).updateOne(page._id, { selectedForPublish: selected, updatedAt: new Date().toISOString() });
  res.json({ pages: (await pagesFor(doc._id)).map(pageSummary) });
});

// ── Collaborators (Share) — owner only, mirrors the v1 magazines API ─────────
// Manage/edit capability is derived from the collaborator's STAFF role; the
// sharer only chooses WHICH pages they may edit ('all' or specific page ids).

// Per-magazine collaborator badge (MagRole), not a staff role — grants nothing
// on its own. Derived from a permission because `user.roles[]` no longer carries
// staff slugs; see the twin in routes/magazines.ts.
const magRoleForStaff = async (identity: IdentityUser): Promise<'editor' | 'contributor'> =>
  (await identityCan(identity, 'content.draft.edit_any')) ? 'editor' : 'contributor';

// add / update a collaborator (by email) — staff accounts only
router.post('/issues/:id/collaborators', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can manage collaborators.' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
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
  if (!isStaffIdentity(acct)) {
    res.status(400).json({ error: 'That person is not a staff member, so they cannot be added.' });
    return;
  }
  if (acct.id === doc.ownerId) {
    res.status(409).json({ error: 'That person is the owner of this magazine.' });
    return;
  }
  const rawPageIds = req.body?.pageIds;
  const pageIds: string[] | 'all' =
    rawPageIds === 'all' || rawPageIds == null ? 'all' : Array.isArray(rawPageIds) ? rawPageIds.map(String) : 'all';
  const next: V2Collaborator = {
    userId: acct.id,
    email: acct.email,
    displayName: acct.displayName,
    role: await magRoleForStaff(acct),
    pageIds,
  };
  const others = collaboratorsOf(doc).filter((c) => c.userId !== acct.id);
  const alreadyShared = collaboratorsOf(doc).some((c) => c.userId === acct.id);
  await db.collection(COL.issues).updateOne(doc._id, { collaborators: [...others, next], updatedAt: new Date().toISOString() });

  // Email a deep link to the magazine. Only on the FIRST share — re-saving
  // someone's page assignment shouldn't spam them. The share itself is already
  // committed, so a delivery failure is reported, never fatal.
  let emailed = false;
  let emailError: string | undefined;
  if (!alreadyShared) {
    // Resolve the assigned page IDS to the page NUMBERS the recipient will see, so
    // the email can name them instead of counting them. This route is the only
    // place that knows the order, hence resolving here rather than in notifyShare.
    const all = await pagesFor(String(doc._id));
    const numberOf = new Map(all.map((p, i) => [String(p._id), i + 1]));
    const pageNumbers: number[] | 'all' =
      pageIds === 'all'
        ? 'all'
        : pageIds.map((id) => numberOf.get(String(id))).filter((n): n is number => !!n);

    const r = await notifyShared({
      to: acct.email,
      sharedBy: req.account!.displayName || req.account!.email,
      title: String(doc.title ?? 'Untitled magazine'),
      path: magazinePath(String(doc._id), 'v2'),
      pages: pageNumbers,
      totalPages: all.length,
    });
    emailed = r.delivered;
    emailError = r.error;
  }

  const fresh = await loadIssue(doc._id);
  res.status(201).json({ issue: withViewer(fresh ?? doc, uid), emailed, emailError });
});

// remove a collaborator — owner only
router.delete('/issues/:id/collaborators/:userId', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can manage collaborators.' });
    return;
  }
  const next = collaboratorsOf(doc).filter((c) => c.userId !== req.params.userId);
  await db.collection(COL.issues).updateOne(doc._id, { collaborators: next, updatedAt: new Date().toISOString() });
  const fresh = await loadIssue(doc._id);
  res.json({ issue: withViewer(fresh ?? doc, uid) });
});

// reset — owner only. Wipes all pages back to a single blank page and returns
// the issue to an editable 'draft' state (a "start over"). Blocked while a
// worker/generation run is in flight so it can't race the page writer.
router.post('/issues/:id/reset', async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(req.params.id);
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (!isOwner(roleOnMagazine(doc, uid))) {
    res.status(403).json({ error: 'Only the owner can reset this magazine.' });
    return;
  }
  if (isBusy(doc)) {
    res.status(409).json({ error: 'The magazine is still processing. Try again shortly.' });
    return;
  }
  await withIssueLock(doc._id, async () => {
    for (const p of await pagesFor(doc._id)) await db.collection(COL.pages).deleteOne(p._id);
    await blankPage(doc._id);
    await db.collection(COL.issues).updateOne(doc._id, {
      status: 'draft',
      stage: '',
      processingError: '',
      pagesProcessed: 0,
      pagesTotal: 1,
      coverImage: '',
      updatedAt: new Date().toISOString(),
    });
  });
  const fresh = await loadIssue(doc._id);
  res.json({ issue: withViewer(fresh ?? doc, uid), pages: (await pagesFor(doc._id)).map(pageSummary) });
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
  await enqueueJob('generatePages', { issueId: doc._id, count, topic, atIndex, prevStatus });
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

// get one page's full element payload. Share-only: owner/collaborator, and a
// page-scoped collaborator only for pages shared with them. 404 (not 403) so an
// unshared page's existence isn't revealed.
router.get('/issues/:id/pages/:pageId', async (req, res) => {
  const uid = req.account!.id;
  const issue = await loadIssue(req.params.id);
  if (!issue || !roleOnMagazine(issue, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const page = await pageById(req.params.pageId);
  if (!page || page.magazineId !== issue._id || !canEditPage(issue, uid, page._id)) {
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
  // Images the user attached this turn (already persisted to the media library by
  // the client). Prompt context only — the placement tools re-validate every url
  // against the media library, so a bogus url here can never reach a page.
  const attachedImages = (Array.isArray(req.body?.attachedImages) ? req.body.attachedImages : [])
    .filter((a: unknown): a is { url: string; name?: string } => !!a && typeof (a as { url?: unknown }).url === 'string')
    .slice(0, 6)
    .map((a: { url: string; name?: string }) => ({
      url: a.url.slice(0, 2000),
      name: typeof a.name === 'string' ? a.name.slice(0, 200) : 'image',
    }));
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
      attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
      pageCount: (await pagesFor(page.magazineId)).length,
    });
    // Persist this turn to the magazine's chat thread (page-tagged) so the
    // conversation survives reloads. Best-effort: a persistence hiccup must not
    // fail a reply the user already received.
    try {
      const lastUser = [...messages].reverse().find((m: { role?: string; content?: unknown }) => m?.role === 'user');
      const t0 = Date.now();
      if (lastUser && typeof lastUser.content === 'string' && lastUser.content.trim()) {
        await db.collection(COL.chat).insertOne({
          magazineId: page.magazineId,
          pageId: page._id,
          pageIndex: Number(page.index) || 0,
          role: 'user',
          content: lastUser.content.slice(0, 8000),
          ...(attachedImages.length > 0
            ? { attachments: attachedImages.map((a: { url: string; name: string }) => ({ name: a.name, isImage: true, url: a.url })) }
            : {}),
          createdAt: new Date(t0).toISOString(),
        });
      }
      await db.collection(COL.chat).insertOne({
        magazineId: page.magazineId,
        pageId: page._id,
        pageIndex: Number(page.index) || 0,
        role: 'assistant',
        content: String(turn.reply ?? '').slice(0, 20000),
        createdAt: new Date(t0 + 1).toISOString(), // +1ms so it sorts AFTER the user turn
      });
    } catch (persistErr) {
      console.warn('[magazineV2] chat persist failed (reply still delivered):', persistErr instanceof Error ? persistErr.message : persistErr);
    }
    res.json(turn);
  } catch (err) {
    console.error('[magazineV2] agent error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'The assistant hit a snag. Please try again.' });
  }
});

// The persistent per-magazine chat thread (page-tagged), returned oldest→newest.
// `before` (an ISO cursor) fetches the batch OLDER than it, so the client lazily
// loads earlier history upward. GETs aren't rate-limited (see router.use above).
router.get('/issues/:id/chat', async (req, res) => {
  const uid = req.account!.id;
  const issue = await loadIssue(req.params.id);
  if (!issue || !roleOnMagazine(issue, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const match: Record<string, unknown> = { magazineId: issue._id, deletedAt: null };
  if (typeof req.query.before === 'string' && req.query.before) match.createdAt = { $lt: req.query.before };
  // Newest `limit` (+1 to detect more), then hand back oldest→newest for display.
  const rows = (await db.collection(COL.chat).aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $limit: limit + 1 },
  ])) as Doc[];
  const hasMore = rows.length > limit;
  const batch = rows.slice(0, limit).reverse();
  res.json({
    messages: batch.map((m) => ({
      id: String(m._id),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
      pageIndex: typeof m.pageIndex === 'number' ? m.pageIndex : null,
      attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
      createdAt: String(m.createdAt ?? ''),
    })),
    hasMore,
    oldestCreatedAt: batch[0]?.createdAt ?? null,
  });
});

// Per-page Fill / Adjust — a single-shot text pass. The server computes which
// text boxes qualify (empty and/or "crowded" = autoFit shrank below 85% of the
// designed size), asks the model to rewrite ONLY those, and returns { edits }.
// It never writes the DB; the client applies each edit through the element CRUD
// (undoable). Text only — geometry/images/QR untouched.
router.post('/issues/:id/pages/:pageId/format', rateLimit('mag2-agent', 20, 60_000), async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'AI is not configured on this server.' });
    return;
  }
  const ctx = await loadEditablePage(req, res);
  if (!ctx) return;
  const { issue, page } = ctx;
  const mode: 'fill' | 'adjust' = req.body?.mode === 'fill' ? 'fill' : 'adjust';
  const els: MagazineElement[] = Array.isArray(page.elements) ? page.elements : [];
  const isCrowded = (e: MagazineElement) =>
    e.type === 'text' && !!e.text && typeof e.text.maxFontSize === 'number' && e.text.fontSize <= e.text.maxFontSize * 0.85;
  const isEmpty = (e: MagazineElement) => e.type === 'text' && !!e.text && e.text.content.replace(/<[^>]+>/g, '').trim() === '';
  const candidates = els
    .filter((e) => e.type === 'text' && !!e.text && (mode === 'fill' ? isEmpty(e) || isCrowded(e) : isCrowded(e)))
    .map((e) => ({ id: e.id, role: e.text!.role, content: e.text!.content, maxChars: charGuideFor(e.text!.role) }));
  if (candidates.length === 0) {
    res.json({ edits: [], note: mode === 'fill' ? 'No empty or crowded text to fill.' : 'No crowded text to adjust.' });
    return;
  }
  try {
    const out = await formatPageText({ mode, title: String(issue.title ?? ''), candidates });
    res.json(out);
  } catch (err) {
    console.error('[magazineV2] format error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'The text pass hit a snag. Please try again.' });
  }
});

export default router;
