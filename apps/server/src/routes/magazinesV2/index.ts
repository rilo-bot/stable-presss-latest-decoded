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
import { Router, type RequestHandler, type Request, type Response } from 'express';
import { db, rawCollection } from '../../lib/db.js';
import { attachAccount } from '../../lib/auth.js';
import { can, isAdmin } from '../../lib/rbac.js';
import { MAGAZINE_V2_ENABLED, PAGE_W, PAGE_H, MAX_PAGES_PER_ISSUE, MAX_SOURCE_BYTES, ALLOWED_SOURCE_MIME, sourceExtForMime, MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME, imageExtFor } from '../../lib/magazineV2/config.js';
import { COL } from '../../lib/magazineV2/collections.js';
import { rateLimit } from '../../lib/rateLimit.js';
import { safePublicImageUrl } from '../../lib/magazineV2/url.js';
import { roleOnMagazine, isOwner, canViewPage, pageEditBlock, editablePageIds, collaboratorsOf, assigneesOfPage, type V2Collaborator, type MagRole } from '../../lib/magazineV2/access.js';
import { reviewOf, reviewRoundOf, isApprovalStale, needsRepublish, pageEditedSincePublish, reviewIs, reviewTransitionError, type PageReview, type ReviewAction } from '../../lib/magazineV2/review.js';
import { publishApprovalBlock } from '../../lib/magazineV2/publishGate.js';
import { canReadThread, canWriteThread, threadSummary, legacyThreadSummary, titleFromMessage, cleanTitle, LEGACY_THREAD_ID } from '../../lib/magazineV2/threads.js';
import { notifyShared } from '../../lib/notifyShare.js';
import { notifySubmitted, notifyReviewed, notifyPageRemoved } from '../../lib/notifyReview.js';
import { pageNumbersLabel } from '../../lib/pageLabels.js';
import { magazinePath } from '../../lib/invites.js';
import { withIdentityDefaults } from '../../lib/identity.js';
import { resolveAccount } from '../../lib/effectiveAccess.js';
import { normalizeElements, normalizeElementPatch } from '../../lib/magazineV2/writePipeline.js';
import { MAX_ELEMENTS_PER_PAGE, type MagazineElement } from '../../lib/magazineV2/model.js';
import { isAgentConfigured } from '../../lib/agent/provider.js';
import { storage } from '../../lib/storage.js';
import { enqueueJob } from '../../lib/magazineV2/jobs.js';
import { renumberFolios } from '../../lib/magazineV2/renumberFolios.js';
import { FURNITURE_IDS, type RefurnishContext } from '../../lib/magazineV2/pageFurniture.js';
import type { GenFonts, GenPalette } from '../../lib/magazineV2/templates.js';
import { runPageAgent } from '../../lib/magazineV2/agent.js';
import { formatPageText, charGuideFor } from '../../lib/magazineV2/format.js';
import { readLayoutImage } from '../../lib/magazineV2/readLayout.js';
import { aspectMismatch, normalizeLayoutReading } from '../../lib/magazineV2/layoutReading.js';
import { applyReadingToPage, tightSummary } from '../../lib/magazineV2/applyLayout.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = { _id: string; [k: string]: any };
type StructResult = { status: number; error?: string; pages?: any[] };
/** Publish either fails with a reason or reports the snapshot it wrote. */
type PublishResult =
  | { status: number; error: string; reason?: string; pageNumbers?: number[] }
  | { status: 200; publishedIssueId: string; version: number };

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
/**
 * Staff, AND the Magazine Builder verb for what they are doing.
 *
 * `isAdmin` alone was the whole gate until now — magazines had no permission in
 * the catalogue at all, so every staff member could build, edit, delete and share
 * an edition regardless of role. (Open High in
 * docs/RBAC-STAFF-CAMPAIGN-ENGINE-REVIEW.md.)
 *
 * Method → verb, which is the honest mapping for a router whose writes are all
 * edits of an issue: only POST /issues actually CREATES one, and the per-issue
 * ownership check (`roleOnMagazine`) still runs underneath — this decides whether
 * the role may touch magazines at all, not which magazines.
 */
router.use((req, res, next) => {
  if (!isAdmin(req.account)) {
    res.status(403).json({ error: 'Staff access required.' });
    return;
  }
  const isCreate = req.method === 'POST' && /^\/issues\/?$/.test(req.url.split('?')[0]!);
  const verb = req.method === 'GET' ? 'view' : req.method === 'DELETE' ? 'delete' : isCreate ? 'create' : 'edit';
  if (!can(req.account, 'magazine', verb)) {
    res.status(403).json({ error: `You do not have permission to ${verb} magazines.` });
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
  return (await db.collection(COL.magazines).findById(id)) as Doc | null;
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
 *
 * Every structural op (insert blank, duplicate, delete, reorder) lands here, which
 * is why the folio repair lives here too: a generated page's printed page number
 * is an element, so moving the page would otherwise leave it printing its old
 * number. See lib/magazineV2/renumberFolios.ts.
 */
async function writeOrder(orderedIds: string[]): Promise<void> {
  const OFFSET = 1_000_000;
  for (let i = 0; i < orderedIds.length; i++) {
    await db.collection(COL.pages).updateOne(orderedIds[i]!, { index: OFFSET + i });
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await db.collection(COL.pages).updateOne(orderedIds[i]!, { index: i });
  }
  await renumberFolios(orderedIds);
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
  const rows = (await db.collection(COL.magazines).find({ slug: { $regex: `^${escaped}(-[0-9]+)?$` } })) as Doc[];
  const taken = new Set(rows.map((d) => String(d.slug)));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 9999; n++) {
    const s = `${base}-${n}`;
    if (!taken.has(s)) return s;
  }
  return `${base}-${Date.now()}`;
}

/**
 * `pages` is optional and only feeds `needsRepublish`, which cannot be answered
 * without them — a page's own `updatedAt` is what moves on an element write. Callers
 * that already have the pages pass them; the rest report `false`, and the client
 * layers its own "I have edited since I loaded this" on top so the studio reacts
 * immediately rather than waiting for a refetch.
 */
function withViewer(doc: Doc, uid: string, pages?: Doc[]) {
  return {
    ...project(doc),
    myRole: roleOnMagazine(doc, uid),
    myEditablePageIds: editablePageIds(doc, uid),
    needsRepublish: pages ? needsRepublish(doc, pages) : false,
  };
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

/**
 * Remove a deleted page's id from every collaborator's `pageIds`, returning the new
 * collaborator array — or null when nothing referenced it (so we skip the write).
 * A collaborator scoped to `'all'` is untouched: 'all' is not a list of ids.
 */
function pruneDeletedPageId(issue: Doc, pageId: string): V2Collaborator[] | null {
  const current = collaboratorsOf(issue);
  let touched = false;
  const next = current.map((c) => {
    if (c.pageIds === 'all' || !Array.isArray(c.pageIds)) return c;
    if (!c.pageIds.some((id) => String(id) === String(pageId))) return c;
    touched = true;
    return { ...c, pageIds: c.pageIds.filter((id) => String(id) !== String(pageId)) };
  });
  return touched ? next : null;
}

// NOTE: there used to be a `refuseIfDraftClosed` here, guarding six content doors so
// a published magazine could not change without an explicit revision. The immutable
// v1/v2 edition model it served was DROPPED (2026-08-11): a published magazine is
// freely editable, and the resulting divergence from the live edition is reported as
// `needs_republish` rather than prevented. The guard is gone rather than stubbed —
// a function that always returns false is a trap for whoever reads it next.

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

/**
 * `issue` is optional and only affects `editedSincePublish` — pass it wherever the
 * caller already has the magazine, so the page rail can mark what a republish would
 * change. Omitting it reports false rather than guessing.
 */
function pageSummary(p: Doc, issue?: Doc) {
  return {
    id: p._id,
    index: p.index,
    width: p.width,
    height: p.height,
    status: p.status,
    rev: p.rev ?? 0,
    selectedForPublish: p.selectedForPublish !== false,
    elementCount: Array.isArray(p.elements) ? p.elements.length : 0,
    /** Touched since the live edition was frozen, so a republish would change it. */
    editedSincePublish: issue ? pageEditedSincePublish(issue, p) : false,
    // The review axis, always resolved through the accessors so a page that
    // predates the submissions flow reports 'in_progress' rather than undefined.
    review: reviewOf(p),
    reviewRound: reviewRoundOf(p),
    approvalStale: isApprovalStale(p),
    // The two notes stay SEPARATE all the way to the client: `submitNote` is the
    // collaborator's, `reviewNote` is the owner's. One field would have the resubmit's
    // "done" overwrite the owner's "fix the headline", and the board would then
    // attribute the wrong words to the wrong person.
    submitNote: typeof p.submitNote === 'string' ? p.submitNote : '',
    reviewNote: typeof p.reviewNote === 'string' ? p.reviewNote : '',
    // Ids, not names — the client already has collaborators[] to resolve them, and a
    // per-page user lookup would be N+1 on a route that returns every page.
    submittedBy: typeof p.submittedBy === 'string' ? p.submittedBy : null,
    submittedAt: typeof p.submittedAt === 'string' ? p.submittedAt : null,
  };
}

// ── Issue lifecycle ─────────────────────────────────────────────────────────

// list — SHARE-ONLY: a magazine is listed only for its owner and the staff it's
// shared with (roleOnMagazine != null). Editing is further gated per-page by the
// collaborator's assignment; `myRole` + `ownerName` tell the client its rights.
router.get('/issues', async (req, res) => {
  const uid = req.account!.id;
  const all = (await db.collection(COL.magazines).find()) as Doc[];
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
  const id = await db.collection(COL.magazines).insertOne({
    title,
    slug: await uniqueSlug(title),
    status: 'draft',
    origin: 'scratch',
    coverImage: '',
    pagesProcessed: 0,
    pagesTotal: 1,
    ownerId: uid,
    ownerName: req.account!.name,
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
  res.status(201).json({ issue: withViewer(created, uid), pages: (await pagesFor(id)).map((p) => pageSummary(p, created)) });
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
  const id = await db.collection(COL.magazines).insertOne({
    title,
    slug: await uniqueSlug(title),
    status: 'draft',
    origin: 'scratch',
    coverImage: '', // the source cover is a photo — content, so not carried over
    pagesProcessed: srcPages.length,
    pagesTotal: srcPages.length,
    ownerId: uid,
    ownerName: req.account!.name,
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
  res.status(201).json({ issue: withViewer(created, uid), pages: (await pagesFor(id)).map((p) => pageSummary(p, created)) });
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
  const id = await db.collection(COL.magazines).insertOne({
    title: 'Generating…',
    slug: await uniqueSlug('issue'),
    status: 'processing',
    origin: 'scratch',
    coverImage: '',
    pagesProcessed: 0,
    pagesTotal: pageCount ?? 8,
    stage: 'Designing the issue',
    ownerId: uid,
    ownerName: req.account!.name,
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
  const id = await db.collection(COL.magazines).insertOne({
    title: baseTitle,
    slug: await uniqueSlug(baseTitle),
    status: 'uploading',
    origin: 'upload',
    coverImage: '',
    pagesProcessed: 0,
    pagesTotal: 0,
    ownerId: uid,
    ownerName: req.account!.name,
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
  await db.collection(COL.magazines).updateOne(id, {
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
  // Confirming an upload enqueues a FULL re-extraction, which rewrites every page —
  // the most sweeping content change in the system. It must not run behind a live
  // edition, and it must not run twice concurrently.
  if (isBusy(doc)) {
    res.status(409).json({ error: 'The magazine is already processing. Try again shortly.' });
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
  await db.collection(COL.magazines).updateOne(doc._id, {
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
  //
  // kind:'reference' is excluded too, and that exclusion is a PROMISE: a layout
  // reference is somebody else's licensed page, uploaded so we could read its
  // structure. Offering it in the photo picker would invite the one thing
  // docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md says we never do — put their picture
  // in the client's magazine.
  const assets = ((await db.collection(COL.media).find({ magazineId: doc._id })) as Doc[]).filter(
    (a) => a.kind !== 'doc' && a.kind !== 'reference',
  );
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
  // 'reference' = a layout the AI reads but nobody may place (see GET /media). The
  // allow-list is explicit: any other value is a caller inventing a kind, and 'doc'
  // in particular would hide an image inside the documents library.
  const kind = req.body?.kind === 'reference' ? 'reference' : 'upload';
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
    kind,
    source: 'upload',
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json({ asset: { id: String(assetId), url, alt, kind, pageIndex: null, contentType: head.contentType, size: head.contentLength } });
});

// ── Reference layouts: "take this layout" ────────────────────────────────────
// Read a layout out of an image already in the magazine's media library. P1 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md: this ONLY reads — it builds nothing
// and writes nothing, so the user can see what we understood before committing.
//
// It takes an assetId, NEVER a URL. A caller-supplied URL would let anyone spend
// our model budget on any image on the internet and make our server the thing that
// fetched it; the media lookup below is the id-in-our-DB proof.
router.post('/issues/:id/layout-reference', rateLimit('mag2-layout-read', 10, 60_000), async (req, res) => {
  const uid = req.account!.id;
  const doc = await loadIssue(String(req.params.id));
  // A non-member gets 404 (never "exists but not yours"), and myRole null — another
  // admin's magazine, view-only — lands here too: reading a layout is the first step
  // of editing one, so it needs an editing role, not just sight of the magazine.
  if (!doc || !roleOnMagazine(doc, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId.trim() : '';
  if (!assetId) {
    res.status(400).json({ error: 'assetId is required.' });
    return;
  }
  const asset = (await db.collection(COL.media).findById(assetId)) as Doc | null;
  if (!asset || asset.magazineId !== doc._id || asset.kind === 'doc' || !asset.url) {
    res.status(404).json({ error: 'That image is not in this magazine.' });
    return;
  }
  const hint = typeof req.body?.hint === 'string' ? req.body.hint.slice(0, 400) : '';
  const { reading, error } = await readLayoutImage(String(asset.url), hint);
  if (!reading) {
    // 422, not 500: the request was fine and the server is fine — the image could
    // not be read. The sentence is the user's to act on.
    res.status(422).json({ error: error || 'Could not read a layout from that image.' });
    return;
  }
  // Optional: judge the reference against the page it is destined for, so the
  // client can warn BEFORE anything is built rather than explain afterwards.
  let warning = '';
  const pageId = typeof req.body?.pageId === 'string' ? req.body.pageId.trim() : '';
  if (pageId) {
    const page = await pageById(pageId);
    if (page && page.magazineId === doc._id) {
      // pageDims, not raw width/height: a not-yet-extracted page carries 0×0, and
      // judging the reference against nothing would report a bogus mismatch.
      const dims = pageDims(page);
      warning = aspectMismatch(reading, dims.width, dims.height);
    }
  }
  res.json({ reading, warning, asset: { id: String(asset._id), url: String(asset.url) } });
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
  // ALL pages feed needsRepublish (any edited page means the live edition is behind),
  // while only the VISIBLE ones are returned — a page-scoped collaborator still needs
  // to know the magazine is out of sync, without learning which other pages exist.
  const allPages = await pagesFor(doc._id);
  res.json({
    issue: withViewer(doc, uid, allPages),
    pages: visiblePages(doc, uid, allPages).map((p) => pageSummary(p, doc)),
  });
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
  await db.collection(COL.magazines).updateOne(doc._id, update);
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
  // Deleting a magazine that is LIVE also takes it off the public newsstand, which is
  // not obvious from a button in the studio — so say so and require confirmation. This
  // is milder than the edition-history version of this guard (there is only ever one
  // snapshot now), but the surprise is the same: readers lose it.
  const publishedId = typeof doc.publishedIssueId === 'string' ? doc.publishedIssueId : '';
  const live = publishedId ? ((await db.collection(COL.published).findById(publishedId)) as Doc | null) : null;
  const isLive = !!live && !live.unpublishedAt;
  if (isLive && String(req.query.confirm ?? '') !== '1') {
    res.status(409).json({
      error: 'This magazine is live on Bulletins. Deleting the draft removes it from the newsstand too.',
      reason: 'is-live',
    });
    return;
  }
  await withIssueLock(doc._id, async () => {
    for (const p of await pagesFor(doc._id)) await db.collection(COL.pages).deleteOne(p._id);
    // Remove the published Bulletin snapshot too, so deleting a draft can't leave an
    // orphan edition on the newsstand. deleteOne is a soft delete, so this is
    // recoverable in the database if it turns out to be a mistake.
    if (live) await db.collection(COL.published).deleteOne(String(live._id));
    await db.collection(COL.magazines).deleteOne(doc._id);
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

/**
 * Freeze the issue's pages into the public snapshot shape. `scope:'full'`
 * publishes every page; `'selected'` honours each page's selectedForPublish.
 *
 * Returns the source docs alongside the snapshot: the approval gate has to read each
 * page's review state, and re-loading them would risk gating a different set of pages
 * than the one actually frozen. `all` is the FULL ordered list, which is the only
 * honest source of page NUMBERS (a selected-scope snapshot renumbers from 0).
 */
async function buildPublishSnapshot(
  magazineId: string,
  scope: 'full' | 'selected',
): Promise<{ snapshot: Doc[]; included: Doc[]; all: Doc[] }> {
  const all = await pagesFor(magazineId);
  const included = scope === 'full' ? all : all.filter((p) => p.selectedForPublish !== false);
  const snapshot = included.map((p, i) => ({
    id: p._id,
    index: i,
    width: Number(p.width) || PAGE_W,
    height: Number(p.height) || PAGE_H,
    background: p.background ?? { type: 'color', value: '#ffffff' },
    // Elements are already validated + sanitised on every write; the reader also
    // re-sanitises text on render (defense-in-depth, matching the v1 flow).
    elements: Array.isArray(p.elements) ? p.elements : [],
    // The draft `rev` this page was frozen at — provenance for the snapshot itself,
    // recording exactly which version of the page readers were given. Nothing reads it
    // today ("edited since publish" is answered from timestamps, which needs no
    // snapshot load), but it costs one integer and it is a fact about this record.
    rev: Number(p.rev) || 0,
  })) as unknown as Doc[];
  return { snapshot, included, all };
}

// The publish approval gate lives in lib/magazineV2/publishGate.ts — pure, and
// therefore testable, which the route file is not.

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

/**
 * publish (or republish) — the owner, AND only with `magazine.publish`.
 *
 * THE SECOND CHECK IS NEW, AND IT IS THE ONE THE PERMISSION IS NAMED AFTER. The
 * router-level gate maps HTTP method → verb, and that mapping can only ever produce
 * view/create/edit/delete — so `POST /publish` was arriving as an *edit*, and
 * `magazine.publish` was enforced NOWHERE. Its single appearance in server code
 * picked an icon in the share dialog. A role with Magazine Edit and the Publish box
 * deliberately UNTICKED could put an edition on the public newsstand; the console
 * said otherwise. (Podcast already does this properly — see the `podcast.publish`
 * transition gate in routes/podcastEpisodes.)
 *
 * `can()` is used, not `canOn()`: ownership is already established above, and this
 * asks the unscoped question "may this role publish magazines at all".
 */
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
  if (!can(req.account, 'magazine', 'publish')) {
    res.status(403).json({ error: 'You do not have permission to publish magazines. Ask an administrator to take this one live.' });
    return;
  }
  // SERIALISED per issue, and re-checked inside the lock.
  //
  // Publishing writes the snapshot, the selection flags and the magazine's own state,
  // and it shares this lock with the structural ops — so a publish can no longer freeze
  // a snapshot halfway through someone's page reorder, and two concurrent publishes
  // can't interleave their writes into a half-old, half-new edition.
  const out = await withIssueLock<PublishResult>(doc._id, async () => {
    // Re-read inside the lock: `doc` was loaded before it, so anything decided from
    // magazine state has to come from a document that cannot change underneath it.
    const current = await loadIssue(doc._id);
    if (!current) return { status: 404, error: 'Not found' };
    if (isBusy(current)) return { status: 409, error: 'The magazine is still processing. Try again shortly.' };
    // Optional page selection (v1-parity): mark exactly these pages selectedForPublish
    // (others deselected) before freezing the snapshot. When provided, the snapshot is
    // scoped to the selection; otherwise fall back to the explicit `scope` (default 'full').
    const hasSelection = Array.isArray(req.body?.selectedPageIds);
    if (hasSelection) {
      const sel = new Set((req.body.selectedPageIds as unknown[]).filter((x): x is string => typeof x === 'string'));
      for (const p of await pagesFor(current._id)) {
        await db.collection(COL.pages).updateOne(p._id, { selectedForPublish: sel.has(p._id) });
      }
    }
    const scope: 'full' | 'selected' = hasSelection || req.body?.scope === 'selected' ? 'selected' : 'full';
    const { snapshot, included, all } = await buildPublishSnapshot(current._id, scope);
    if (snapshot.length === 0) return { status: 400, error: 'Select at least one page to publish.' };
    const numbers = new Map(all.map((p, i) => [String(p._id), i + 1]));
    const blocked = publishApprovalBlock(current, included, (id) => numbers.get(String(id)) ?? 0);
    if (blocked) return { status: 409, ...blocked };
    const cover = (typeof current.coverImage === 'string' && current.coverImage) || coverUrlFromPages(snapshot);
    const now = new Date().toISOString();
    const existingId = typeof current.publishedIssueId === 'string' ? current.publishedIssueId : '';
    const existing = existingId ? ((await db.collection(COL.published).findById(existingId)) as Doc | null) : null;

    // ONE SNAPSHOT PER MAGAZINE, refreshed in place.
    //
    // The immutable-editions model (insert a document per edition, stamp the previous
    // one `supersededAt`, keep a v1/v2 history) was built and then dropped: editing a
    // published magazine no longer forks a version. So publishing is back to
    // overwriting the same document — which also means the public URL never changes,
    // and reader reactions and comments stay attached to it.
    //
    // `version` still increments, because the PDF cache key is
    // `${id}:${version}:${updatedAt}` — without the bump a republished edition could
    // serve the previous render.
    const version = (typeof existing?.version === 'number' ? existing.version : 0) + 1;

    let publishedIssueId: string;
    if (existing) {
      await db.collection(COL.published).updateOne(existingId, {
        title: current.title,
        coverImage: cover,
        coverImageUrl: cover,
        pages: snapshot,
        pageCount: snapshot.length,
        scope,
        version,
        publishedAt: now,
        unpublishedAt: null,
        updatedAt: now,
      });
      publishedIssueId = existingId;
    } else {
      publishedIssueId = await db.collection(COL.published).insertOne({
        builder: 'v2', // discriminator — BulletinViewer renders these with the v2 canvas
        magazineIdV2: current._id, // link back to the draft (for republish/cleanup)
        magazineId: null, // v1 field kept null so canManageIssue falls back to createdByUserId
        title: current.title,
        edition: '',
        coverImage: cover,
        coverImageUrl: cover,
        pages: snapshot,
        pageCount: snapshot.length,
        scope,
        version,
        publishedAt: now,
        unpublishedAt: null,
        createdByUserId: uid,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.collection(COL.magazines).updateOne(current._id, {
      status: 'published',
      publishedIssueId,
      publishedAt: now,
      // Same instant as `publishedAt` on purpose: `needsRepublish` compares the two, so
      // a freshly published magazine must read as in sync. Any later edit moves this (or
      // a page's own updatedAt) past it, and the studio says "needs republish".
      updatedAt: now,
    });
    return { status: 200, publishedIssueId, version };
  });

  if ('error' in out) {
    res.status(out.status).json({
      error: out.error,
      ...(out.reason ? { reason: out.reason } : {}),
      ...(out.pageNumbers ? { pageNumbers: out.pageNumbers } : {}),
    });
    return;
  }
  const fresh = await loadIssue(doc._id);
  res.json({
    issue: withViewer(fresh ?? doc, uid),
    publishedIssueId: out.publishedIssueId,
    version: out.version,
  });
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
  // Same verb as publish: taking an edition off the newsstand is a distribution
  // decision, and someone who cannot put it up should not be able to pull it down.
  if (!can(req.account, 'magazine', 'publish')) {
    res.status(403).json({ error: 'You do not have permission to publish or unpublish magazines.' });
    return;
  }
  const now = new Date().toISOString();
  const publishedIssueId = typeof doc.publishedIssueId === 'string' ? doc.publishedIssueId : '';
  if (publishedIssueId) {
    await db.collection(COL.published).updateOne(publishedIssueId, { unpublishedAt: now, updatedAt: now });
  }
  await db.collection(COL.magazines).updateOne(doc._id, { status: 'ready', updatedAt: now });
  const fresh = await loadIssue(doc._id);
  res.json({ issue: withViewer(fresh ?? doc, uid) });
});

// NOTE: `POST /issues/:id/revision` lived here. It was the key to the published-is-
// read-only lock, opening a v2 draft while v1 stayed live. Both the lock and the
// version were dropped (2026-08-11) — a published magazine is simply editable, and the
// studio shows `needs_republish` until the owner republishes. Nothing needs unlocking,
// so there is nothing for this endpoint to do.

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
  res.json({ pages: (await pagesFor(doc._id)).map((p) => pageSummary(p, doc)) });
});

// ── Collaborators (Share) — owner only ──────────────────────────────────────
// A share decides ONE thing: which pages they may edit ('all' or specific page
// ids). That choice is also what puts a page in REVIEW scope, so it is the input
// to the approval flow, not a convenience. There is no per-magazine role.

// NOTE: `magRoleForStaff` is gone. It read `magazine.publish` to stamp a
// collaborator as 'editor' or 'contributor' — a badge its own comment admitted
// "grants nothing on its own", and which the share dialog nonetheless rendered as
// a shield and the word "Editor". The permission now gates the publish routes for
// real (see POST /publish), and a non-owner with access is simply a collaborator.

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
  // RESOLVED, not read off the user document. `users.isAdmin` is a denormalised
  // copy of "has an `admins` row" and can be stale, so a collaborator check that
  // trusted it would add someone the newsroom itself refuses to let in.
  const acct = await resolveAccount(withIdentityDefaults({ id: existing._id, ...existing }));
  if (!isAdmin(acct)) {
    res.status(400).json({ error: 'That person is not an admin, so they cannot be added.' });
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
    displayName: acct.name,
    pageIds,
  };
  const others = collaboratorsOf(doc).filter((c) => c.userId !== acct.id);
  const alreadyShared = collaboratorsOf(doc).some((c) => c.userId === acct.id);
  await db.collection(COL.magazines).updateOne(doc._id, { collaborators: [...others, next], updatedAt: new Date().toISOString() });

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
      sharedBy: req.account!.name || req.account!.email,
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
  await db.collection(COL.magazines).updateOne(doc._id, { collaborators: next, updatedAt: new Date().toISOString() });
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
    await db.collection(COL.magazines).updateOne(doc._id, {
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
  res.json({ issue: withViewer(fresh ?? doc, uid), pages: (await pagesFor(doc._id)).map((p) => pageSummary(p, doc)) });
});

// ── Submissions & approval (the per-page review axis) ───────────────────────
//
// A SUBMISSION IS AN EVENT OVER A SET OF PAGES; the state lives on each page.
// That is what resolves "per page or per contributor" — a contributor hits Submit
// once for all three of their pages, and it becomes one event, three transitions
// and one email naming pages 4, 5 and 6.
//
// Every endpoint here therefore takes `pageIds[]`, never a single page, and the
// batch is validated in FULL before anything is written: these routes email
// someone naming specific pages, so a half-applied batch would send a message
// about pages that never moved.
//
// See docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md §5.

/** A whole issue at once must fit — "approve everything" is the common case — so
 *  this tracks the page cap rather than guessing a round number under it. */
const MAX_REVIEW_BATCH = MAX_PAGES_PER_ISSUE;
const MAX_REVIEW_NOTE = 2000;

/** Who did it, for the audit trail. Name falls back to email so a row is never anonymous. */
function actorOf(req: any): { id: string; name: string } {
  return { id: req.account!.id, name: req.account!.name || req.account!.email || 'Someone' };
}

interface ReviewCtx {
  issue: Doc;
  role: MagRole;
  /** The requested pages, in page order. */
  batch: Doc[];
  note: string;
  /** 1-based page number, resolved from the full ordered page list. */
  numberOf: (pageId: string) => number;
}

/**
 * The shared front half of submit / approve / request-changes: membership, the note,
 * and the pageIds[] batch resolved to real page docs.
 *
 * Review decisions stay available on a PUBLISHED magazine, because editing does too:
 * a collaborator can revise their page after the edition went out, submit it again,
 * and the owner approves and republishes. Nothing about publishing closes the flow.
 */
async function loadReviewCtx(
  req: any,
  res: any,
  opts: { ownerOnly?: boolean; noteRequired?: boolean } = {},
): Promise<ReviewCtx | null> {
  const uid = req.account!.id;
  const issue = await loadIssue(req.params.id);
  const role = issue ? roleOnMagazine(issue, uid) : null;
  if (!issue || !role) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  if (opts.ownerOnly && !isOwner(role)) {
    res.status(403).json({ error: 'Only the owner can approve pages or send them back.' });
    return null;
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, MAX_REVIEW_NOTE) : '';
  if (opts.noteRequired && !note) {
    res.status(400).json({ error: 'Say what needs changing — a note is required when you send pages back.' });
    return null;
  }

  const raw = req.body?.pageIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    res.status(400).json({ error: 'pageIds[] is required.' });
    return null;
  }
  if (raw.length > MAX_REVIEW_BATCH) {
    res.status(400).json({ error: `At most ${MAX_REVIEW_BATCH} pages at a time.` });
    return null;
  }
  const all = await pagesFor(issue._id);
  const numbers = new Map(all.map((p, i) => [String(p._id), i + 1]));
  const want = new Set(raw.map(String));
  const batch = all.filter((p) => want.has(String(p._id)));
  // Length mismatch means an id belongs to another magazine or no longer exists.
  // Refuse the whole batch rather than silently acting on the subset that resolved.
  if (batch.length !== want.size) {
    res.status(404).json({ error: 'One or more of those pages is not in this magazine.' });
    return null;
  }
  return { issue, role, batch, note, numberOf: (id) => numbers.get(String(id)) ?? 0 };
}

/**
 * Append to the audit trail. Best-effort by design: the transition it describes is
 * already committed, so losing a row must not fail the request that earned it —
 * the same reasoning as the chat persist in the agent route.
 */
async function recordReviews(
  issue: Doc,
  actor: { id: string; name: string },
  action: ReviewAction | 'page-removed',
  entries: { page: Doc; from: PageReview; to: PageReview | null; pageNumber: number }[],
  note: string,
): Promise<void> {
  if (entries.length === 0) return;
  const at = new Date().toISOString();
  try {
    for (const e of entries) {
      await db.collection(COL.reviews).insertOne({
        magazineId: String(issue._id),
        pageId: String(e.page._id),
        // The page NUMBER at the time — pages get reordered, so the id alone can't
        // reconstruct what the actor was looking at.
        pageNumber: e.pageNumber,
        action,
        from: e.from,
        to: e.to,
        rev: Number(e.page.rev) || 0,
        actorId: actor.id,
        actorName: actor.name,
        note,
        at,
      });
    }
  } catch (err) {
    console.warn('[magazineV2] review audit write failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Group the affected pages by the collaborator they concern.
 *
 * Approving eight pages split between two people must send TWO emails, each
 * naming that person's own pages — not eight emails, and not one email listing
 * pages the recipient has nothing to do with.
 */
function recipientsFor(issue: Doc, pages: Doc[], numberOf: (id: string) => number) {
  const byUser = new Map<string, { collaborator: V2Collaborator; pageNumbers: number[] }>();
  for (const p of pages) {
    for (const c of assigneesOfPage(issue, p._id)) {
      const entry = byUser.get(c.userId) ?? { collaborator: c, pageNumbers: [] };
      entry.pageNumbers.push(numberOf(p._id));
      byUser.set(c.userId, entry);
    }
  }
  return [...byUser.values()];
}

/** submit — a collaborator sends their assigned pages to the owner. */
router.post('/issues/:id/pages/submit', async (req, res) => {
  const ctx = await loadReviewCtx(req, res);
  if (!ctx) return;
  const uid = req.account!.id;
  // THE OWNER NEVER SUBMITS. They are the approver, so self-submission is pure
  // ceremony — and it would lock them out of their own pages for no benefit.
  if (isOwner(ctx.role)) {
    res.status(400).json({
      error: "You own this magazine, so your pages don't need submitting — publish when the issue is ready.",
      reason: 'owner-does-not-submit',
    });
    return;
  }
  for (const p of ctx.batch) {
    if (!canViewPage(ctx.issue, uid, p._id)) {
      res.status(403).json({ error: 'You can only submit the pages shared with you.' });
      return;
    }
    const why = reviewTransitionError('submit', p);
    if (why) {
      res.status(409).json({ error: `Page ${ctx.numberOf(p._id)} is ${why}.`, reason: 'review-state' });
      return;
    }
  }

  const now = new Date().toISOString();
  const moved: Doc[] = [];
  for (const p of ctx.batch) {
    // CAS on the review state so two tabs can't both submit and double-notify the
    // owner. Deliberately NOT on `rev`: an autosave landing between the check and
    // here is the submitter's own work, and the owner reviews whatever the page
    // holds when they open it. Approve is the transition that must pin `rev`.
    const ok = await db.collection(COL.pages).updateOneIf(p._id, reviewIs('in_progress'), {
      review: 'submitted',
      submittedBy: uid,
      submittedAt: now,
      // The submitter's own words, kept SEPARATE from `reviewNote`. Sharing one
      // field would overwrite the owner's "fix the headline" with the resubmit's
      // "done", and the UI would then attribute the wrong words to the owner.
      submitNote: ctx.note,
      updatedAt: now,
    });
    if (ok) moved.push(p);
  }
  if (moved.length === 0) {
    res.status(409).json({ error: 'Those pages were already submitted a moment ago.', reason: 'review-state' });
    return;
  }
  const pageNumbers = moved.map((p) => ctx.numberOf(p._id));
  await recordReviews(
    ctx.issue,
    actorOf(req),
    'submit',
    moved.map((p) => ({ page: p, from: 'in_progress' as PageReview, to: 'submitted' as PageReview, pageNumber: ctx.numberOf(p._id) })),
    ctx.note,
  );

  // Notify the owner. Best-effort: the submission is already recorded, so a mail
  // failure is REPORTED, never fatal — same contract as the share email.
  let emailed = false;
  let emailError: string | undefined;
  const owner = (await db.collection('users').findById(String(ctx.issue.ownerId))) as Doc | null;
  if (owner?.email) {
    const r = await notifySubmitted({
      to: String(owner.email),
      title: String(ctx.issue.title ?? 'Untitled magazine'),
      path: magazinePath(String(ctx.issue._id), 'v2'),
      pageNumbers,
      submittedBy: actorOf(req).name,
      note: ctx.note || undefined,
    });
    emailed = r.delivered;
    emailError = r.error;
  } else {
    emailError = "The owner's account has no email address, so we couldn't notify them.";
  }

  res.json({
    // visiblePages, not the raw list: this is the ONE review route a page-scoped
    // collaborator calls, and every other read they get is filtered the same way.
    // Handing back summaries of pages nobody shared with them would leak the shape
    // of the whole issue through the reply to their own submission.
    pages: visiblePages(ctx.issue, uid, await pagesFor(ctx.issue._id)).map((p) => pageSummary(p, ctx.issue)),
    submitted: moved.length,
    skipped: ctx.batch.length - moved.length,
    label: pageNumbersLabel(pageNumbers),
    emailed,
    emailError,
  });
});

/** approve — owner only. Records the rev it was approved AT (§4). */
router.post('/issues/:id/pages/approve', async (req, res) => {
  const ctx = await loadReviewCtx(req, res, { ownerOnly: true });
  if (!ctx) return;
  for (const p of ctx.batch) {
    const why = reviewTransitionError('approve', p);
    if (why) {
      res.status(409).json({ error: `Page ${ctx.numberOf(p._id)} is ${why}.`, reason: 'review-state' });
      return;
    }
  }

  const now = new Date().toISOString();
  const uid = req.account!.id;
  const moved: Doc[] = [];
  const conflicted: number[] = [];
  for (const p of ctx.batch) {
    const rev = Number(p.rev) || 0;
    // Pin `rev` AS WELL AS the review state. `approvedAtRev` is the entire basis of
    // isApprovalStale: record a rev the page has already moved past and the approval
    // reads as fresh while the content has changed underneath it — a page published
    // as "approved" that nobody approved in its current form.
    const ok = await db.collection(COL.pages).updateOneIf(p._id, { ...reviewIs(reviewOf(p)), rev }, {
      review: 'approved',
      approvedAtRev: rev,
      reviewedBy: uid,
      reviewedAt: now,
      // Approving with no note deliberately CLEARS the last feedback: the "fix the
      // headline" note is resolved once the page is approved, and leaving it on the
      // page would make the board show outstanding feedback on approved work. The
      // words themselves are never lost — the audit trail keeps every note.
      reviewNote: ctx.note,
      updatedAt: now,
    });
    if (ok) moved.push(p);
    else conflicted.push(ctx.numberOf(p._id));
  }
  if (moved.length === 0) {
    res.status(409).json({
      error: `${conflicted.length === 1 ? `Page ${conflicted[0]}` : 'Those pages'} changed while you were approving — reload and try again.`,
      reason: 'review-state',
    });
    return;
  }

  const actor = actorOf(req);
  await recordReviews(
    ctx.issue,
    actor,
    'approve',
    moved.map((p) => ({ page: p, from: reviewOf(p), to: 'approved' as PageReview, pageNumber: ctx.numberOf(p._id) })),
    ctx.note,
  );

  const { emailed, emailErrors } = await mailReviewed(ctx, moved, actor, 'approved');
  res.json({
    pages: (await pagesFor(ctx.issue._id)).map((p) => pageSummary(p, ctx.issue)),
    approved: moved.length,
    skipped: conflicted.length,
    label: pageNumbersLabel(moved.map((p) => ctx.numberOf(p._id))),
    emailed,
    emailErrors,
  });
});

/**
 * request-changes — owner only, and it DOUBLES AS REOPEN.
 *
 * Editing a submitted or approved page is refused with "ask the owner to reopen
 * it", so this is the door that message points at: it accepts `approved` as well
 * as `submitted`. `note` is required — sending work back without saying why is the
 * single most common way a review flow gets resented.
 */
router.post('/issues/:id/pages/request-changes', async (req, res) => {
  const ctx = await loadReviewCtx(req, res, { ownerOnly: true, noteRequired: true });
  if (!ctx) return;
  for (const p of ctx.batch) {
    const why = reviewTransitionError('request-changes', p);
    if (why) {
      res.status(409).json({ error: `Page ${ctx.numberOf(p._id)} is ${why}.`, reason: 'review-state' });
      return;
    }
  }

  const now = new Date().toISOString();
  const uid = req.account!.id;
  const moved: Doc[] = [];
  const conflicted: number[] = [];
  for (const p of ctx.batch) {
    const ok = await db.collection(COL.pages).updateOneIf(p._id, reviewIs(reviewOf(p)), {
      review: 'in_progress',
      // The round counter is what the board derives its "Needs changes" column
      // from — `revisions` is not a state, it is in_progress with a round > 0.
      reviewRound: reviewRoundOf(p) + 1,
      reviewNote: ctx.note,
      reviewedBy: uid,
      reviewedAt: now,
      // Clear the approval rev on the way out. Nothing reads it while review is
      // 'in_progress', but leaving a stale value behind invites a future path to
      // approve without setting it and inherit an approval that was never given.
      approvedAtRev: null,
      updatedAt: now,
    });
    if (ok) moved.push(p);
    else conflicted.push(ctx.numberOf(p._id));
  }
  if (moved.length === 0) {
    res.status(409).json({
      error: `${conflicted.length === 1 ? `Page ${conflicted[0]}` : 'Those pages'} changed while you were reviewing — reload and try again.`,
      reason: 'review-state',
    });
    return;
  }

  const actor = actorOf(req);
  await recordReviews(
    ctx.issue,
    actor,
    'request-changes',
    moved.map((p) => ({ page: p, from: reviewOf(p), to: 'in_progress' as PageReview, pageNumber: ctx.numberOf(p._id) })),
    ctx.note,
  );

  const { emailed, emailErrors } = await mailReviewed(ctx, moved, actor, 'changes-requested');
  res.json({
    pages: (await pagesFor(ctx.issue._id)).map((p) => pageSummary(p, ctx.issue)),
    returned: moved.length,
    skipped: conflicted.length,
    label: pageNumbersLabel(moved.map((p) => ctx.numberOf(p._id))),
    emailed,
    emailErrors,
  });
});

/** One email per affected collaborator, naming only their own pages. */
async function mailReviewed(
  ctx: ReviewCtx,
  moved: Doc[],
  actor: { id: string; name: string },
  decision: 'approved' | 'changes-requested',
): Promise<{ emailed: number; emailErrors: string[] }> {
  const title = String(ctx.issue.title ?? 'Untitled magazine');
  const path = magazinePath(String(ctx.issue._id), 'v2');
  let emailed = 0;
  const emailErrors: string[] = [];
  for (const { collaborator, pageNumbers } of recipientsFor(ctx.issue, moved, ctx.numberOf)) {
    if (!collaborator.email) continue;
    const r = await notifyReviewed({
      to: collaborator.email,
      title,
      path,
      pageNumbers,
      reviewedBy: actor.name,
      decision,
      note: ctx.note || undefined,
    });
    if (r.delivered) emailed++;
    else if (r.error) emailErrors.push(`${collaborator.email}: ${r.error}`);
  }
  return { emailed, emailErrors };
}

/**
 * The audit trail, newest first — paginated with a `before` cursor like /chat.
 *
 * TIGHTER than the plan's "any member": a page-scoped collaborator sees only rows
 * for pages shared with them. Everywhere else in this router an unshared page is a
 * 404, so leaking "page 7 was approved" through the trail would be the one
 * inconsistency in an otherwise strict share-only model.
 */
router.get('/issues/:id/reviews', async (req, res) => {
  const uid = req.account!.id;
  const issue = await loadIssue(req.params.id);
  if (!issue || !roleOnMagazine(issue, uid)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const match: Record<string, unknown> = { magazineId: String(issue._id), deletedAt: null };
  const visible = editablePageIds(issue, uid);
  if (visible !== 'all') match.pageId = { $in: visible.map(String) };
  if (typeof req.query.before === 'string' && req.query.before) match.at = { $lt: req.query.before };
  const rows = (await db.collection(COL.reviews).aggregate([
    { $match: match },
    { $sort: { at: -1 } },
    { $limit: limit + 1 },
  ])) as Doc[];
  const hasMore = rows.length > limit;
  const batch = rows.slice(0, limit);
  res.json({
    reviews: batch.map((r) => ({
      id: String(r._id),
      pageId: String(r.pageId ?? ''),
      pageNumber: typeof r.pageNumber === 'number' ? r.pageNumber : null,
      action: String(r.action ?? ''),
      from: r.from ?? null,
      to: r.to ?? null,
      actorName: String(r.actorName ?? ''),
      note: String(r.note ?? ''),
      at: String(r.at ?? ''),
    })),
    hasMore,
    oldestAt: batch.length > 0 ? String(batch[batch.length - 1]!.at ?? '') : null,
  });
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
    await db.collection(COL.magazines).updateOne(doc._id, { updatedAt: new Date().toISOString() });
    return { status: 201, pages: (await pagesFor(doc._id)).map((p) => pageSummary(p, doc)) };
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
    // Strip element ids so normalizeElements assigns fresh ones (also re-validates)
    // — EXCEPT page furniture, whose ids are the handle writeOrder re-numbers the
    // folio by. Ids only have to be unique within a page, so keeping them on a copy
    // is safe; regenerating them would freeze the duplicate's page number forever.
    const freshEls = normalizeElements(
      (Array.isArray(src.elements) ? src.elements : []).map((e: MagazineElement) =>
        FURNITURE_IDS.includes(e.id) ? { ...e } : { ...e, id: undefined },
      ),
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
    await db.collection(COL.magazines).updateOne(doc._id, { updatedAt: now });
    return { status: 201, pages: (await pagesFor(doc._id)).map((p) => pageSummary(p, doc)) };
  });
  if (out.error) {
    res.status(out.status).json({ error: out.error });
    return;
  }
  res.status(out.status).json({ pages: out.pages });
});

// delete a page (never the last one)
/**
 * Deleting a page a collaborator has SUBMITTED — decided: allow, but warn and notify.
 *
 * A first attempt is refused with a 409 naming who submitted it, so the owner is
 * told what they are about to discard; `?confirm=1` goes through. Only `submitted`
 * warns: an `approved` page was signed off by the owner themselves, so deleting it
 * needs no second opinion from them.
 */
type DeletePageResult = StructResult & {
  reason?: string;
  pageNumber?: number;
  submittedBy?: { name: string; email: string }[];
  /** Set when a submitted page WAS deleted — who to tell, once out of the lock. */
  notify?: { pageNumber: number; recipients: V2Collaborator[] };
};

router.delete('/issues/:id/pages/:pageId', async (req, res) => {
  const doc = await requireOwnedIssue(req, res);
  if (!doc) return;
  const confirmed = String(req.query.confirm ?? '') === '1';
  const actor = actorOf(req);
  const out = await withIssueLock<DeletePageResult>(doc._id, async () => {
    const pages = await pagesFor(doc._id);
    if (pages.length <= 1) return { status: 409, error: 'A magazine must have at least one page.' };
    const victimIndex = pages.findIndex((p) => p._id === req.params.pageId);
    if (victimIndex === -1) return { status: 404, error: 'Page not found' };
    const victim = pages[victimIndex]!;
    const pageNumber = victimIndex + 1;

    // Re-read inside the lock before consulting `collaborators` (see the prune below).
    const current = (await loadIssue(doc._id)) ?? doc;
    const wasSubmitted = reviewOf(victim) === 'submitted';
    // Narrow to the person who ACTUALLY submitted it, not everyone the page is shared
    // with. An 'all'-scoped collaborator is an assignee of every page, and telling them
    // "a page you had submitted was removed" about someone else's submission would
    // simply be false. If that person has since been un-shared they are nobody to
    // notify — they can no longer see the magazine at all.
    const submitterId = typeof victim.submittedBy === 'string' ? victim.submittedBy : '';
    const assignees = wasSubmitted ? assigneesOfPage(current, victim._id) : [];
    const interested = submitterId ? assignees.filter((c) => c.userId === submitterId) : assignees;
    if (wasSubmitted && !confirmed) {
      const who = interested.map((c) => c.displayName || c.email).filter(Boolean).join(', ');
      return {
        status: 409,
        error: `Page ${pageNumber} has been submitted for review${who ? ` by ${who}` : ''}. Deleting it discards that work.`,
        reason: 'page-submitted',
        pageNumber,
        submittedBy: interested.map((c) => ({ name: c.displayName, email: c.email })),
      };
    }
    // Audit BEFORE the delete, so the record of who submitted what outlives the
    // page it describes — afterwards there is nothing left to read a rev off.
    if (wasSubmitted) {
      await recordReviews(current, actor, 'page-removed', [{ page: victim, from: 'submitted', to: null, pageNumber }], '');
    }

    await db.collection(COL.pages).deleteOne(victim._id);
    await writeOrder(pages.filter((p) => p._id !== victim._id).map((p) => p._id));
    // Prune the deleted page from every collaborator's assignment. Without this the
    // id lingers in collaborators[].pageIds forever: harmless for access (a stale id
    // never matches a page) but it makes the share dialog and the review board report
    // "3 pages assigned" when one of them no longer exists.
    //
    // RE-READ the magazine AGAIN, immediately before the write. `doc` was loaded by
    // requireOwnedIssue BEFORE the lock, so pruning from it would write back a whole
    // `collaborators` array assembled from stale data — silently dropping a
    // collaborator added between the load and here (two owner tabs, or a share landing
    // mid-delete). Collaborator routes don't take this lock, so the read is repeated
    // here rather than reusing `current` from the top of the block: same care, and the
    // narrowest window we can get.
    const latest = (await loadIssue(doc._id)) ?? current;
    const pruned = pruneDeletedPageId(latest, victim._id);
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (pruned) update.collaborators = pruned;
    await db.collection(COL.magazines).updateOne(doc._id, update);
    return {
      status: 200,
      pages: (await pagesFor(doc._id)).map((p) => pageSummary(p, doc)),
      ...(wasSubmitted && interested.length > 0 ? { notify: { pageNumber, recipients: interested } } : {}),
    };
  });
  if (out.error) {
    res.status(out.status).json({
      error: out.error,
      ...(out.reason ? { reason: out.reason, pageNumber: out.pageNumber, submittedBy: out.submittedBy } : {}),
    });
    return;
  }
  // Tell whoever submitted it — outside the lock, so a slow mail provider can't
  // hold up the next structural op on this issue. The delete is already committed,
  // so a failure is reported and never fatal.
  let emailed = 0;
  const emailErrors: string[] = [];
  if (out.notify) {
    const title = String(doc.title ?? 'Untitled magazine');
    const path = magazinePath(String(doc._id), 'v2');
    for (const c of out.notify.recipients) {
      if (!c.email) continue;
      const r = await notifyPageRemoved({
        to: c.email,
        title,
        path,
        pageNumbers: [out.notify.pageNumber],
        removedBy: actor.name,
      });
      if (r.delivered) emailed++;
      else if (r.error) emailErrors.push(`${c.email}: ${r.error}`);
    }
  }
  res.json({ pages: out.pages, emailed, emailErrors });
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
    await db.collection(COL.magazines).updateOne(doc._id, { updatedAt: new Date().toISOString() });
    return { status: 200, pages: (await pagesFor(doc._id)).map((p) => pageSummary(p, doc)) };
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
  // A GENERATED PAGE IS ALWAYS AN INTERIOR PAGE — planPages emits INTERIOR_KINDS only,
  // never a cover. Inserting one at position 0 therefore put a two-column article in
  // front of the magazine AND repointed the issue's cover image at it, silently
  // replacing a cover the user had already approved. The chat assistant can propose an
  // atIndex, so this was reachable by asking for "a page at the front".
  //
  // Refused rather than quietly clamped to 1: the caller asked for something this
  // endpoint cannot do, and a silent shift is how you end up with the page in a place
  // nobody chose. An issue with no pages yet is the one case where 0 is simply the end.
  if (atIndex === 0 && pages.length > 0) {
    res.status(400).json({
      error: 'New AI pages are interior pages, so they cannot go in front of the cover. Insert after page 1, or edit the cover directly.',
    });
    return;
  }
  const prevStatus = String(doc.status);
  await db.collection(COL.magazines).updateOne(doc._id, { status: 'processing', stage: 'Designing pages', updatedAt: new Date().toISOString() });
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
  // ONE gate for every write path — element add/patch/delete, the AI agent, and
  // Fill/Adjust. 403 means "not yours"; 409 means "yours, but not right now", which
  // is a state conflict the client resolves by acting, not by re-authenticating.
  const block = pageEditBlock(issue, uid, page._id, page);
  if (block === 'not-assigned') {
    res.status(403).json({ error: 'You can only edit the pages shared with you.' });
    return null;
  }
  if (block === 'page-submitted' || block === 'page-approved') {
    res.status(409).json({
      error:
        block === 'page-submitted'
          ? 'This page is submitted for review — ask the owner to reopen it.'
          : 'This page is approved — ask the owner to reopen it before editing.',
      reason: block,
    });
    return null;
  }
  return { issue, page };
}

/**
 * A locked element refuses edits and deletion. `locked` was declared on the model
 * (both server and web) but honoured NOWHERE — the CRUD, the agent's tools and the
 * canvas all ignored it, so the flag was inert while validateElements faithfully
 * stored it. An ignored guard is worse than an absent one.
 *
 * UNLOCKING is always allowed: a patch that sets `locked: false` passes through, so
 * an element can never be stranded (there is no lock affordance in the inspector
 * yet, so today this is only reachable via the API).
 */
function isLockedAgainst(stored: MagazineElement, partial?: Record<string, unknown>): boolean {
  if (stored.locked !== true) return false;
  return !(partial && partial.locked === false);
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
  // canVIEWPage, not canEditPage: a collaborator must still be able to read a page
  // they have submitted — to check what they sent, or to read the feedback on it.
  // Gating reads on the edit rule would 404 their own submitted work.
  if (!page || page.magazineId !== issue._id || !canViewPage(issue, uid, page._id)) {
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
  if (isLockedAgainst(els[idx]!, partial)) {
    res.status(403).json({ error: 'That element is locked. Unlock it first.' });
    return;
  }
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
  const victim = els.find((e) => e.id === req.params.elementId);
  if (!victim) {
    res.status(404).json({ error: 'Element not found' });
    return;
  }
  if (isLockedAgainst(victim)) {
    res.status(403).json({ error: 'That element is locked. Unlock it first.' });
    return;
  }
  const next = els.filter((e) => e.id !== req.params.elementId);
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
    res.status(400).json({ error: 'A message is required' });
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
  // ── The thread this turn belongs to ──
  //
  // HISTORY COMES FROM THE THREAD, NOT FROM THE CLIENT. The client used to post its
  // whole in-memory transcript and the server sent that to the model, which is how
  // turns about page 7 — written by somebody else — ended up in the prompt when you
  // asked about page 2 (review finding M3). Now the client sends one new message and
  // a threadId, and the server reads that thread's own history back.
  //
  // A missing or unusable threadId CREATES a thread rather than failing: a stale tab
  // must degrade into a fresh chat, never into an error.
  const wanted = typeof req.body?.threadId === 'string' ? req.body.threadId.trim() : '';
  const uid = req.account!.id;
  let thread: Doc | null = null;
  if (wanted && wanted !== LEGACY_THREAD_ID) {
    const found = await db.collection(COL.threads).findById(wanted);
    const here = found && String(found.magazineId) === String(page.magazineId);
    // NAMING A THREAD YOU MAY NOT WRITE TO IS REFUSED, NOT REDIRECTED. Degrading to
    // a fresh thread is right for a threadId that no longer exists (a stale tab);
    // it is wrong here, because the turn would be persisted somewhere other than
    // where the caller asked to put it and the reply would look like it landed.
    //
    // Writing needs the CREATOR. The magazine owner can read a contributor's thread
    // but must not speak into it — the assistant is a 1:1 conversation, and a second
    // voice would surface in the creator's next prompt as if they had said it.
    if (here && !canWriteThread(found, uid)) {
      res.status(403).json({
        error: 'This chat belongs to someone else. Start your own chat, or send the page back for changes.',
        reason: 'thread-not-yours',
      });
      return;
    }
    if (here) thread = found;
  } else if (wanted === LEGACY_THREAD_ID) {
    // The legacy log has no author, so there is nobody to continue as. A new thread
    // is the honest landing place, and the client's composer is disabled there anyway.
    thread = null;
  }
  const newUserText = (() => {
    const last = [...messages].reverse().find((m: { role?: string; content?: unknown }) => m?.role === 'user');
    return last && typeof last.content === 'string' ? last.content : '';
  })();
  if (!thread) {
    const now = new Date().toISOString();
    const id = await db.collection(COL.threads).insertOne({
      magazineId: page.magazineId,
      userId: uid,
      userName: req.account!.name || req.account!.email || 'Someone',
      title: titleFromMessage(newUserText),
      startedOnPageId: page._id,
      startedOnPageIndex: Number(page.index) || 0,
      lastMessageAt: now,
      messageCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    thread = (await db.collection(COL.threads).findById(id)) ?? { _id: id, userId: uid, messageCount: 0 };
  }
  const threadId = String(thread._id);

  // This thread's own history, oldest→newest, capped the same way the agent caps it.
  // Turns from a DIFFERENT page are labelled, because a thread follows a train of
  // thought across pages ("keep the voice we used on page 2") and without the label
  // the model cannot tell what "it" referred to two turns ago.
  const priorRows = (await db.collection(COL.chat).aggregate([
    { $match: { threadId, deletedAt: null } },
    { $sort: { createdAt: -1 } },
    { $limit: 30 },
  ])) as Doc[];
  const thisPageIndex = Number(page.index) || 0;
  const history = priorRows.reverse().map((m): { role: 'user' | 'assistant'; content: string } => {
    const idx = typeof m.pageIndex === 'number' ? m.pageIndex : thisPageIndex;
    const role = m.role === 'assistant' ? ('assistant' as const) : ('user' as const);
    const tag = role === 'user' && idx !== thisPageIndex ? `[page ${idx + 1}] ` : '';
    return { role, content: `${tag}${String(m.content ?? '')}` };
  });

  try {
    const turn = await runPageAgent({
      messages: [...history, { role: 'user', content: newUserText }],
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
      // Only the owner may add/remove/reorder pages, so only the owner is offered
      // the tools that stage those changes. Without this the model happily proposes
      // "add a page" to a contributor, the apply hits an owner-only endpoint, and the
      // client's keep-going `catch` swallows the 403 — "Applied the assistant's
      // changes", nothing changed.
      canEditStructure: isOwner(roleOnMagazine(ctx.issue, req.account!.id)),
    });
    // Persist both turns INTO THIS THREAD (page-tagged) so the conversation
    // survives reloads. Best-effort: a persistence hiccup must not fail a reply the
    // user already received.
    let wrote = 0;
    try {
      const t0 = Date.now();
      if (newUserText.trim()) {
        await db.collection(COL.chat).insertOne({
          threadId,
          userId: uid,
          magazineId: page.magazineId,
          pageId: page._id,
          pageIndex: thisPageIndex,
          role: 'user',
          content: newUserText.slice(0, 8000),
          ...(attachedImages.length > 0
            ? { attachments: attachedImages.map((a: { url: string; name: string }) => ({ name: a.name, isImage: true, url: a.url })) }
            : {}),
          deletedAt: null,
          createdAt: new Date(t0).toISOString(),
        });
        wrote++;
      }
      await db.collection(COL.chat).insertOne({
        threadId,
        userId: uid,
        magazineId: page.magazineId,
        pageId: page._id,
        pageIndex: thisPageIndex,
        role: 'assistant',
        content: String(turn.reply ?? '').slice(0, 20000),
        deletedAt: null,
        createdAt: new Date(t0 + 1).toISOString(), // +1ms so it sorts AFTER the user turn
      });
      wrote++;
      // Keep the list's sort key and count current. Title too, but ONLY while the
      // thread is still unnamed: re-deriving it from every message would rename a
      // chat under the user each turn, and a title they typed must never be lost.
      const prior = typeof thread.messageCount === 'number' ? thread.messageCount : 0;
      const update: Record<string, unknown> = {
        lastMessageAt: new Date(t0 + 1).toISOString(),
        messageCount: prior + wrote,
        updatedAt: new Date(t0 + 1).toISOString(),
      };
      if (prior === 0 && (!thread.title || thread.title === 'New chat') && newUserText.trim()) {
        update.title = titleFromMessage(newUserText);
      }
      await db.collection(COL.threads).updateOne(threadId, update);
    } catch (persistErr) {
      console.warn('[magazineV2] chat persist failed (reply still delivered):', persistErr instanceof Error ? persistErr.message : persistErr);
    }
    // `threadId` goes back so a client that started without one adopts the thread
    // the server just created, instead of making a new one on every turn.
    res.json({ ...turn, threadId });
  } catch (err) {
    console.error('[magazineV2] agent error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'The assistant hit a snag. Please try again.' });
  }
});

// ── Chat threads ────────────────────────────────────────────────────────────
//
// One conversation per thread, owned by whoever started it. Read = the creator or
// the magazine owner; write = the creator only. See lib/magazineV2/threads.ts —
// the two access functions live there so these routes cannot disagree with the
// agent route about who may do what.
//
// `GET /issues/:id/chat` USED TO LIVE HERE and is gone. It returned every message
// in the magazine to anyone with access — including messages about pages a
// page-scoped collaborator cannot open. Keeping it as a deprecated alias would
// have kept that hole open indefinitely; the client ships in the same deploy.

/** One message on the wire. */
const chatMessage = (m: Doc) => ({
  id: String(m._id),
  role: m.role === 'assistant' ? 'assistant' : 'user',
  content: String(m.content ?? ''),
  pageIndex: typeof m.pageIndex === 'number' ? m.pageIndex : null,
  attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
  createdAt: String(m.createdAt ?? ''),
});

/** Membership + owner flag, or null once a 404 has been sent. */
async function loadChatCtx(req: Request, res: Response): Promise<{ issue: Doc; uid: string; owner: boolean } | null> {
  const uid = req.account!.id;
  const issue = await loadIssue(String(req.params.id));
  const role = issue ? roleOnMagazine(issue, uid) : null;
  if (!issue || !role) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return { issue, uid, owner: isOwner(role) };
}

/**
 * Load a thread the caller may READ, or 404.
 *
 * `write: true` narrows it to the creator. The refusal is a 404 in both cases:
 * a 403 on someone else's thread would confirm it exists, and the id is guessable.
 */
async function loadThread(
  req: Request,
  res: Response,
  opts: { write?: boolean } = {},
): Promise<{ issue: Doc; uid: string; owner: boolean; thread: Doc } | null> {
  const ctx = await loadChatCtx(req, res);
  if (!ctx) return null;
  const thread = await db.collection(COL.threads).findById(String(req.params.threadId));
  const belongs = thread && String(thread.magazineId) === String(ctx.issue._id);
  const allowed = belongs && (opts.write ? canWriteThread(thread, ctx.uid) : canReadThread(thread, ctx.uid, ctx.owner));
  if (!allowed) {
    res.status(404).json({ error: 'Chat not found' });
    return null;
  }
  return { ...ctx, thread: thread! };
}

// The thread list. A collaborator gets their own; the owner gets everyone's, each
// row carrying who started it so the panel can group them.
router.get('/issues/:id/threads', async (req, res) => {
  const ctx = await loadChatCtx(req, res);
  if (!ctx) return;
  const match: Record<string, unknown> = { magazineId: ctx.issue._id, deletedAt: null };
  if (!ctx.owner) match.userId = ctx.uid;
  const rows = (await db.collection(COL.threads).aggregate([
    { $match: match },
    { $sort: { lastMessageAt: -1 } },
    { $limit: 200 },
  ])) as Doc[];
  const threads = rows.map((t) => threadSummary(t, ctx.uid));

  // Messages written before threads existed have no userId, so they can be shown
  // but never attributed. One synthesised read-only row, owner-only, assembled at
  // read time — no migration writes anything. Counted in the same round trip.
  if (ctx.owner) {
    const legacy = (await db.collection(COL.chat).aggregate([
      { $match: { magazineId: ctx.issue._id, threadId: null, deletedAt: null } },
      { $group: { _id: null, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ])) as Doc[];
    const row = legacy[0];
    if (row && Number(row.count) > 0) threads.push(legacyThreadSummary(Number(row.count), String(row.last ?? '')));
  }
  res.json({ threads });
});

// NOTE: there is no POST /threads. A chat is created by its FIRST TURN (see the
// agent route above), because an empty conversation nobody has spoken in is not
// worth a document — and an endpoint the client never calls is the same species of
// dead surface as a permission that gates nothing.
// Rename. Creator only — the owner can read a thread but not retitle it.
router.patch('/issues/:id/threads/:threadId', async (req, res) => {
  const ctx = await loadThread(req, res, { write: true });
  if (!ctx) return;
  const title = cleanTitle(req.body?.title);
  if (!title) {
    res.status(400).json({ error: 'A title is required.' });
    return;
  }
  await db.collection(COL.threads).updateOne(ctx.thread._id, { title, updatedAt: new Date().toISOString() });
  const fresh = await db.collection(COL.threads).findById(ctx.thread._id);
  res.json({ thread: threadSummary(fresh ?? ctx.thread, ctx.uid) });
});

// Delete a chat and everything in it. Creator only.
router.delete('/issues/:id/threads/:threadId', async (req, res) => {
  const ctx = await loadThread(req, res, { write: true });
  if (!ctx) return;
  const now = new Date().toISOString();
  await db.collection(COL.threads).deleteOne(ctx.thread._id);
  // Soft-delete the messages too, in ONE write. The db wrapper has no updateMany,
  // and a per-message loop would be N round trips on a long conversation — so this
  // is the raw driver, matching the `deletedAt` convention `find()` filters on.
  const raw = await rawCollection(COL.chat);
  await raw.updateMany({ threadId: String(ctx.thread._id), deletedAt: null }, { $set: { deletedAt: now } });
  res.json({ ok: true });
});

// One thread's transcript, oldest→newest. `before` (an ISO cursor) fetches the
// batch OLDER than it, so the panel pages history upward.
router.get('/issues/:id/threads/:threadId/messages', async (req, res) => {
  const threadId = String(req.params.threadId);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const match: Record<string, unknown> = { deletedAt: null };

  if (threadId === LEGACY_THREAD_ID) {
    // The pre-threads flat log. Owner only, because nothing in it can be
    // attributed — showing it to a collaborator would be handing them everyone's
    // old conversation, which is the leak this whole change exists to close.
    const ctx = await loadChatCtx(req, res);
    if (!ctx) return;
    if (!ctx.owner) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }
    match.magazineId = ctx.issue._id;
    match.threadId = null;
  } else {
    const ctx = await loadThread(req, res);
    if (!ctx) return;
    match.threadId = String(ctx.thread._id);
  }

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
    messages: batch.map(chatMessage),
    hasMore,
    oldestCreatedAt: batch[0]?.createdAt ?? null,
  });
});

// Per-page Fill / Adjust — a single-shot text pass. The server computes which
// text boxes qualify (empty and/or "crowded" = autoFit shrank below 85% of the
// designed size), asks the model to rewrite ONLY those, and returns { edits }.
// It never writes the DB; the client applies each edit through the element CRUD
// (undoable). Text only — geometry/images/QR untouched.
/**
 * Put this page into a layout read from a reference image (P2 of
 * docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
 *
 * Takes the READING the client already has (from POST /layout-reference) so a second
 * pass over the same picture costs nothing — and re-normalises it here, because
 * anything arriving from a client is untrusted no matter where it came from
 * originally. Pass `assetId` instead to read the image again.
 *
 * This REPLACES the page's elements, which the studio's undo stack does not cover, so
 * it is rev-guarded like every other page write: a stale rev means someone (or the
 * assistant) changed the page since it was loaded, and the reflow would be working
 * from content that has moved on.
 */
/**
 * What `applyReadingToPage` needs to put a rearranged page's running head and folio
 * back. Everything here is already on the two documents — a page stores its `index`,
 * and the issue stores the theme — which is why the reference path can restore chrome
 * without knowing the page's template kind (a page document has never recorded one).
 *
 * `refurnish` reads the section label off the page's own previous running head, so this
 * deliberately carries no `sectionTitle`.
 */
function furnitureContextFor(issue: Doc, page: Doc): RefurnishContext | undefined {
  const gt = (issue as unknown as { genTheme?: { title?: string; palette?: GenPalette; fonts?: GenFonts } }).genTheme;
  if (!gt?.palette || !gt?.fonts) return undefined; // no theme → no chrome to re-derive
  const index = Number(page.index);
  if (!Number.isInteger(index) || index < 0) return undefined;
  return {
    magazineTitle: String(gt.title || issue.title || ''),
    pageNumber: index + 1,
    palette: gt.palette,
    fonts: gt.fonts,
  };
}

router.post('/issues/:id/pages/:pageId/apply-layout', rateLimit('mag2-agent', 20, 60_000), async (req, res) => {
  const ctx = await loadEditablePage(req, res);
  if (!ctx) return;
  const { issue, page } = ctx;
  const rev = requireRev(req, res);
  if (rev === null) return;
  if ((page.rev ?? 0) !== rev) {
    res.status(409).json({ error: 'This page changed since you loaded it.', page: project(page) });
    return;
  }

  // Either the reading the client is holding, or one read fresh from an asset.
  let reading = normalizeLayoutReading(req.body?.reading);
  if (!reading) {
    const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId.trim() : '';
    if (!assetId) {
      res.status(400).json({ error: 'A layout `reading` or an `assetId` is required.' });
      return;
    }
    const asset = (await db.collection(COL.media).findById(assetId)) as Doc | null;
    if (!asset || asset.magazineId !== issue._id || asset.kind === 'doc' || !asset.url) {
      res.status(404).json({ error: 'That image is not in this magazine.' });
      return;
    }
    const out = await readLayoutImage(String(asset.url));
    if (!out.reading) {
      res.status(422).json({ error: out.error || 'Could not read a layout from that image.' });
      return;
    }
    reading = out.reading;
  }

  const genTheme = ((issue as unknown as { genTheme?: { title?: string; palette?: Record<string, string>; fonts?: Record<string, string> } }).genTheme) ?? null;
  const applied = applyReadingToPage(reading, {
    width: Number(page.width) || undefined,
    height: Number(page.height) || undefined,
    background: page.background as { type?: string; value?: string } | undefined,
    elements: Array.isArray(page.elements) ? (page.elements as MagazineElement[]) : [],
  }, genTheme, furnitureContextFor(issue, page));
  if (!applied.page) {
    // 422: the request and the server are both fine — this layout and this page
    // cannot be put together, and the sentence says which.
    res.status(422).json({ error: applied.why });
    return;
  }

  const now = new Date().toISOString();
  const ok = await db.collection(COL.pages).updateOneIf(page._id, { rev }, {
    elements: applied.page.elements,
    background: applied.page.background,
    rev: rev + 1,
    updatedAt: now,
  });
  if (!ok) {
    const fresh = await pageById(page._id);
    res.status(409).json({ error: 'This page changed since you loaded it.', page: fresh ? project(fresh) : null });
    return;
  }
  await db.collection(COL.magazines).updateOne(issue._id, { updatedAt: now });
  const fresh = await pageById(page._id);
  res.json({
    page: fresh ? project(fresh) : null,
    leftOver: applied.page.leftOver,
    // MEASURED, not claimed (P3). The client shows this sentence instead of asserting
    // that the layout matched.
    fidelity: {
      score: applied.page.fidelity.score,
      verdict: applied.page.fidelity.verdict,
      summary: applied.page.fidelity.summary,
      missing: applied.page.fidelity.missing,
    },
    // Copy that had to be cut to stay readable. This used to be a 422 with an internal
    // element id in it; the page is built now and the shortfall is stated in characters.
    tight: applied.page.tight,
    tightSummary: tightSummary(applied.page.tight),
    warning: aspectMismatch(reading, pageDims(page).width, pageDims(page).height),
  });
});

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
