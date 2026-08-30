# Magazine Builder — Existing System Feature Inventory

**Status:** reference document. Describes the system **as it is today** (reviewed 2026-08-30), so the
new builder can be specced against a complete picture rather than a remembered one.

Everything below is the "v2" builder (`magazineV2` on the server, `editor-v2` on the web). The older
v1 template builder — 48 locked page layouts with a `regionId → RegionContent` map — has been
removed from the codebase; only its published-snapshot collection name (`issues`) survives.

---

## 1. Where the code lives

| Area | Path |
| --- | --- |
| REST API (single router, ~3,000 lines) | [apps/server/src/routes/magazinesV2/index.ts](apps/server/src/routes/magazinesV2/index.ts) |
| Domain libraries (46 modules) | [apps/server/src/lib/magazineV2/](apps/server/src/lib/magazineV2/) |
| Server tests (19 suites) | [apps/server/tests/magazineV2/](apps/server/tests/magazineV2/) |
| Background worker (own Node process) | [apps/worker/src/](apps/worker/src/) |
| Studio UI (24 modules) | [apps/web/src/editor-v2/](apps/web/src/editor-v2/) |
| Public reader | [apps/web/src/pages/BulletinViewer.tsx](apps/web/src/pages/BulletinViewer.tsx), [apps/web/src/pages/Bulletins.tsx](apps/web/src/pages/Bulletins.tsx) |
| Published-snapshot types | [apps/web/src/types/magazine.ts](apps/web/src/types/magazine.ts) |
| PDF export (Puppeteer) | [apps/server/src/lib/pdf.ts](apps/server/src/lib/pdf.ts) |

Web routes: `/production-system/magazine-v2` (library) and `/production-system/magazine-v2/:id`
(studio) — registered in [apps/web/src/App.tsx:357](apps/web/src/App.tsx#L357).
API mount: `/api/magazinesV2` — [apps/server/src/routes/index.ts:92](apps/server/src/routes/index.ts#L92).

---

## 2. Core architectural decisions (the ones a rebuild must consciously keep or reject)

1. **Layout is data, not code.** A page is a flat list of absolutely-positioned elements in the
   page's *own* canonical pixel space. There are no named regions and no template component at
   render time. ([lib/magazineV2/model.ts](apps/server/src/lib/magazineV2/model.ts))
2. **One renderer, three consumers.** `IssuePageCanvas` renders the editor base layer, the public
   bulletin, and the Puppeteer PDF. Pixel drift between "what I built" and "what printed" is
   structurally impossible. Scaling is pure CSS: container queries + `%` positions + `cqw` font
   sizes, no JS resize math.
3. **The client never sends a whole page.** Every mutation is a targeted issue/page/element op
   applied server-side against stored data.
4. **Element writes are compare-and-set on `page.rev`.** `rev` is *mandatory* on every element
   write; a stale writer gets `409` **with the server's current page attached** so the store can
   reconcile. No silent last-write-wins.
5. **Structural ops are serialised per issue** with an in-process lock (`withIssueLock`), because
   their multi-write reindex must not interleave. Publish shares this lock.
6. **One write pipeline.** Every element write — manual, AI agent, extraction, generation —
   goes through `validate → sanitise → refit` ([writePipeline.ts](apps/server/src/lib/magazineV2/writePipeline.ts)).
   Guardrails cannot be bypassed by adding a caller.
7. **Invalid input is dropped, never thrown.** One bad element from a flaky extraction must not fail
   a page.
8. **Heavy work runs out-of-process.** PDF rasterisation (MuPDF/WASM) and multi-agent generation run
   in `apps/worker`; the API only enqueues and the client polls.
9. **Everything is behind `MAGAZINE_V2=true`.** With the flag off, every route 404s.

---

## 3. Data model

### 3.1 Collections ([collections.ts](apps/server/src/lib/magazineV2/collections.ts))

| Key | Collection | Purpose |
| --- | --- | --- |
| `magazines` | `magazinesV2` | Editable magazine draft (meta only) |
| `pages` | `magazinePagesV2` | Per-page element payloads |
| `media` | `mediaAssetsV2` | Per-magazine media library (images, docs, references) |
| `jobs` | `magazineJobs` | Worker job queue |
| `chat` | `magazineChatV2` | Assistant chat messages |
| `threads` | `magazineThreadsV2` | Chat threads (one doc per conversation) |
| `reviews` | `magazineReviewsV2` | Append-only submissions/approval audit trail |
| `published` | `issues` | **Frozen** published snapshots (shared name with retired v1) |

**Id convention:** `_id` is an ObjectId; the `magazineId` field on pages/media/chat is its **string**
form. `db.collection()` normalises `_id` to a string on read, but a raw-driver query must use
`String(id)` or it silently matches nothing.

Soft deletes throughout (`deletedAt`); `db.collection().find()` filters them, `aggregate()` does not.

### 3.2 `magazinesV2` (the draft)

```
_id, title, slug (immutable, unique via base/base-N probe), schemaVersion: 2
status: 'draft' | 'uploading' | 'processing' | 'ready' | 'published' | 'failed'
origin: 'scratch' | 'upload'
coverImage                                  // explicit URL, or '' to auto-derive at publish
pagesProcessed, pagesTotal, stage, processingError   // build progress signals
ownerId, ownerName
collaborators: V2Collaborator[]             // { userId, email, displayName, pageIds: string[] | 'all' }
publishedIssueId, publishedAt, publishedIssueIds[]   // last is legacy
sourceFile: { key, url, originalName, mimeType, size, pageCount }   // import only
reusedFromId                                // provenance when created via "reuse layout"
genTheme: { title, subtitle, palette, fonts, prompt }               // AI generation only
genPlanPages: GenPlanPage[]                 // persisted plan → a retry resumes instead of restarting
generatedAt, createdAt, updatedAt, deletedAt
```

### 3.3 `magazinePagesV2` (the page)

```
_id, magazineId, index                      // 0-based, contiguous, rewritten two-phase on reorder
width, height                               // the page's OWN canonical pixel box
background: { type: 'color' | 'image', value }
elements: MagazineElement[]                 // max 400
rev                                         // optimistic-concurrency token, +1 per element write
status: 'pending' | 'extracted' | 'reviewed' | 'failed'   // EXTRACTION state (not human review)
error                                       // extraction failure message
selectedForPublish                          // drives scope:'selected' publishing
review: 'in_progress' | 'submitted' | 'approved'          // HUMAN review axis (optional field)
reviewRound, approvedAtRev
submitNote, reviewNote                      // deliberately two fields, never merged
submittedBy, submittedAt
createdAt, updatedAt, deletedAt
```

Three separate state axes deliberately kept apart: **magazine lifecycle** (`magazinesV2.status`),
**extraction state** (`page.status`), **human review** (`page.review`).

### 3.4 `MagazineElement` ([model.ts](apps/server/src/lib/magazineV2/model.ts))

```ts
{ id, type: 'text'|'image'|'shape'|'qr'|'icon',
  x, y, w, h, rotation, zIndex, locked,
  source: 'extracted'|'manual'|'ai-agent', confidence?,
  text?|image?|shape?|qr?|icon? }
```

| Kind | Payload |
| --- | --- |
| `text` | `content` (sanitised inline HTML), `role` (headline/subhead/byline/body/caption/pullquote/other), `fontFamily`, `fontSize`, `maxFontSize` (design ceiling), `minFontSize` (legibility floor — carried on the element so it survives every later write), `fontWeight` 400–900, `color`, `align`, `lineHeight`, `autoFit: 'shrink'|'clip'`, `vAlign`, `letterSpacing`, `textTransform` |
| `image` | `assetId`, `url`, `alt`, `fit: 'cover'|'contain'`, `focalPoint {x,y}` 0–1 |
| `shape` | `fill` hex, `opacity` (<1 = scrim over a photo) |
| `qr` | `url`, `fg`, `bg` |
| `icon` | `name` (curated registry glyph) **or** `src` (uploaded SVG/PNG, overrides name), `color` tint |

**Validation invariants** (`validateElements`): unknown element kinds are dropped; every numeric is
clamped; the *whole box* is kept inside the page (the origin is pulled back rather than the box
shrunk, so a text box never re-wraps as a side effect); `minFontSize` can never exceed its ceiling;
image and icon URLs go through a **public-host allowlist** (`safePublicImageUrl` — blocks loopback,
RFC-1918, link-local, cloud metadata) because Puppeteer fetches them server-side; QR URLs use the
broader `safeUrl` (http/https/mailto/tel/relative) because they are encoded, not fetched.

### 3.5 Other documents

- **`mediaAssetsV2`**: `{ magazineId, pageIndex, key, url, contentType, size, alt, originalName,
  digest, sourceText, kind, source, createdAt, updatedAt }`.
  `kind`: `photo` | `graphic` (extracted) · `upload` · `doc` · `reference`.
  `source`: `extracted` | `upload` | `stock` | `ai-image`.
  `reference` assets are **excluded from the image picker by contract** — they are someone else's
  licensed page, uploaded only so the AI can read its structure.
- **`magazineJobs`**: `{ type, payload, status: queued|running|done|failed, attempts, maxAttempts: 3,
  lastError, createdAt/updatedAt/startedAt/finishedAt, expiresAt (TTL) }`.
- **`magazineThreadsV2`**: `{ magazineId, userId, userName, title, startedOnPageId,
  startedOnPageIndex, lastMessageAt, messageCount }`.
- **`magazineChatV2`**: `{ threadId, userId, magazineId, pageId, pageIndex, role, content,
  attachments[] }`. Rows with no `threadId` are the pre-threads flat log, surfaced read-only to the
  owner as one synthesised "Earlier conversation" thread — no migration writes anything.
- **`magazineReviewsV2`**: `{ magazineId, pageId, pageNumber (at the time), action, from, to, rev,
  actorId, actorName, note, at }`. Own collection so page docs don't grow, and so a row outlives the
  page it describes.
- **`issues` (published)**: `{ builder: 'v2', magazineIdV2, title, edition, coverImage,
  coverImageUrl, pages: [{id, index, width, height, background, elements, rev}], pageCount, scope,
  version, publishedAt, unpublishedAt, createdByUserId }`. Fully self-contained by value.

### 3.6 Indexes ([ensureIndexes.ts](apps/server/src/lib/ensureIndexes.ts))

`pages{magazineId,deletedAt,index}` · `media{magazineId,deletedAt}` ·
`chat{magazineId,deletedAt,createdAt:-1}` · `threads{magazineId,userId,deletedAt,lastMessageAt:-1}`
and `{magazineId,deletedAt,lastMessageAt:-1}` · `reviews{magazineId,deletedAt,at:-1}` ·
`magazines{deletedAt,updatedAt:-1}`.

### 3.7 Canonical geometry ([config.ts](apps/server/src/lib/magazineV2/config.ts))

**A4 portrait @ 150 DPI = 1240 × 1754 px.** `pt = px × 0.48`. Single source of truth, imported by the
solver, the templates (whose boxes are *fractions* so they rescale for free), the PDF export, the
viewer fallback and the worker. Existing pages are **not migrated** — each page carries its own
width/height and everything measures from the page, so older Letter-sized issues still print as
Letter.

---

## 4. Access control & permissions

### 4.1 Gate chain on every request
`MAGAZINE_V2` flag → `attachAccount` → `isAdmin` (staff only) → RBAC verb → write rate limit.

RBAC verb is derived from HTTP method: `GET`→`view`, `DELETE`→`delete`, `POST /issues`→`create`,
everything else→`edit`. `magazine.publish` is checked **explicitly** on the publish/unpublish
handlers (the method→verb map can never produce it).

Catalogue: `magazine.{view,create,edit,delete,publish}`, scoped, section "Content".

### 4.2 Per-magazine model ([access.ts](apps/server/src/lib/magazineV2/access.ts))

- **Two roles only**: `owner` and `collaborator`. A previous third role (`editor`) gated nothing and
  was removed; membership in the array *is* the whole fact.
- **Share-only visibility.** A magazine is listed and readable only for its owner and the staff it
  has been explicitly shared with. `roleOnMagazine() === null` → total 404, never "exists but not
  yours".
- **A share decides one thing:** which page ids the collaborator may edit (`'all'` or a list).
- **View scope == edit scope**, except a collaborator can always *read* a page they have submitted.
- **Owner-only:** settings/rename/cover, delete, publish/unpublish, page structure (add/duplicate/
  delete/reorder), publish selection, collaborator management, reset, confirm-upload, page retry.

### 4.3 The single edit decision point
`pageEditBlock(issue, uid, pageId, page)` returns `null` | `'not-assigned'` (403) |
`'page-submitted'` (409) | `'page-approved'` (409). **Every** write path reaches it through
`loadEditablePage` — element CRUD, the AI agent, apply-layout, and Fill/Adjust — so a rule added
there cannot be bypassed, including by the AI. The owner is never blocked.

`locked` on an element is honoured by the CRUD (patch/delete refused), and unlocking is always
allowed so nothing can be stranded.

---

## 5. REST API surface (`/api/magazinesV2`)

### Issue lifecycle
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/issues` | Library list; page counts via one `$group` aggregation (was an N+1 that loaded every element array) |
| POST | `/issues/blank` | Blank scratch issue + one blank page |
| POST | `/issues/:id/reuse` | Clone the **layout only** into a new magazine you own — copy stripped of copy/photos/QR targets via `templatizeElement`; shapes and icons survive intact |
| POST | `/issues/generate` | Build with AI — creates a `processing` issue + the **birth thread**, enqueues `generateIssue`. Rate limit 10/min |
| POST | `/issues/upload` | Create an `uploading` issue + presigned S3 PUT for the source file |
| POST | `/issues/:id/confirm-upload` | `headObject` verification (never trusts client size/type) → enqueue `processIssue` |
| GET | `/issues/:id` | Meta + page summaries; **self-heals a stuck `processing` issue on read** |
| PATCH | `/issues/:id` | Rename, and/or set cover by URL, by `coverPageId`, or `''` to auto-derive |
| DELETE | `/issues/:id` | Soft-delete issue + pages + the live snapshot. `409 reason:'is-live'` unless `?confirm=1` |
| POST | `/issues/:id/reset` | Wipe back to one blank page, status `draft` |
| POST | `/issues/:id/publish` | Freeze snapshot (see §8) |
| POST | `/issues/:id/unpublish` | Hide the bulletin, keep the snapshot, draft → `ready` |

### Pages
`POST /issues/:id/pages` (insert blank at index) · `POST …/pages/:pageId/duplicate` (deep copy, fresh
element ids **except** page furniture) · `DELETE …/pages/:pageId` (never the last; `409
reason:'page-submitted'` unless `?confirm=1`, then emails the submitter) · `PATCH …/pages/reorder`
(from/to) · `POST …/pages/generate` (AI add-pages, 1–12, refuses `atIndex 0`) ·
`GET …/pages/:pageId` (full payload) · `PATCH …/pages/:pageId/select` ·
`POST …/pages/:pageId/retry` (re-extract one page).

### Elements
`POST | PATCH | DELETE /issues/:id/pages/:pageId/elements[/:elementId]` — all three require `rev`,
all three CAS, all three return `409` with the current page on conflict. Max 400 elements/page.

### Media & uploads
`GET /issues/:id/media` (images only; excludes `doc` and `reference`) ·
`POST …/media/upload-url` + `POST …/media` (presign → headObject verify → MediaAsset) ·
`GET …/uploads`, `POST …/uploads/upload-url`, `POST …/uploads`, `GET …/uploads/:uploadId`
(documents: PDF/DOCX/txt/csv/md/json, carrying extracted `digest` + `sourceText`).

### AI
`POST …/pages/:pageId/agent` (chat agent, 20/min) · `POST …/pages/:pageId/format` (Fill/Adjust text
pass) · `POST …/layout-reference` (read a layout out of an image, 10/min, **assetId only, never a
URL**) · `POST …/pages/:pageId/apply-layout` (build the page into that layout).

### Chat threads
`GET …/threads` · `PATCH …/threads/:threadId` (rename, creator only) · `DELETE …/threads/:threadId`
(creator only; soft-deletes messages via one `updateMany`) · `GET …/threads/:threadId/messages`
(paginated backwards by ISO cursor). **There is no `POST /threads`** — a thread is created by its
first turn.

### Review
`POST …/pages/submit` · `POST …/pages/approve` · `POST …/pages/request-changes` · `GET …/reviews`
(audit trail, scoped to pages the caller may see).

### Collaborators
`POST …/collaborators` (by email; must be a resolved admin; emails a deep link **on first share
only**) · `DELETE …/collaborators/:userId`.

### Rate limits
`mag2-write` 300/min (router-wide) · `mag2-generate` 10/min · `mag2-agent` 20/min ·
`mag2-layout-read` 10/min.

---

## 6. Import pipeline (upload → digitised, editable pages)

Accepted: **PDF, DOCX, JPEG, PNG**, ≤150 MB, ≤120 pages.

1. **Browser → S3 directly** via presigned PUT (bytes never pass through the API), key
   `public/magazinesV2/<id>/source.<ext>` — extension follows the mime so the worker can tell the
   kinds apart from the key alone.
2. `confirm-upload` verifies with `headObject`, flips to `processing`, enqueues `processIssue`.
3. **Worker** ([apps/worker/src/jobs/](apps/worker/src/jobs/)):
   - DOCX → PDF first via headless LibreOffice (`soffice`), so Word flows through the identical
     extractor. JPEG/PNG import as a single pixel-faithful page with no MuPDF pass.
   - Page placeholders inserted up front (`status:'pending'`), then `index → _id` mapped.
   - Per page: **MuPDF (WASM)** rasterises at 150 DPI and reads the text layer + embedded images with
     real bounding boxes. **All geometry and typography come from MuPDF — never from AI.**
   - `sharp` re-encodes rasters, composites PDF soft masks back as alpha, crops graphic regions, and
     **erases the original glyphs** from the background raster so reconstructed text doesn't render
     doubled.
   - A **vision tagger** ([worker/src/lib/ai.ts](apps/worker/src/lib/ai.ts)) labels each numbered
     block's role and flags icon/QR/logo graphics. It never repositions anything. With no API key it
     degrades to role `other` — the magazine is still viewable and editable.
   - Extracted photos/graphics land in the media library as `kind:'photo'|'graphic'`,
     `source:'extracted'`.
   - A per-page failure records `status:'failed'` + `error` and the rest of the issue continues.
4. Client polls `GET /issues/:id`; per-page **retry** re-enqueues `processPage`.

---

## 7. AI generation pipeline

### 7.1 Multi-agent flow ([generate.ts](apps/server/src/lib/magazineV2/generate.ts), 1,743 lines)

1. **Agent 1 — Editorial Director (`planIssue`)**: from the brief (± source document) produces
   `{ readback, title, subtitle, palette{primary,secondary,accent,bg,text}, fonts{display,body},
   pages[{kind, intent, sectionTitle, look}] }`. The `readback` is the AI's read of the request and
   is posted into the birth thread so the user sees they were understood.
   - The page list is **trusted** — no forced cover-first/back-cover-last, no canned filler. A plan
     short of an explicit target is topped up by *re-asking the planner*, never by a filler table.
   - Subject is **derived** from the brief; no preset topic or industry is hardcoded.
2. **Agents 2+3 — Copywriter + Art Director (`draftPage`)**: fill the page's named slots with copy,
   photo briefs and QR destinations. `polishCoverDraft` deterministically guarantees the cover reads.
3. **Deterministic compose + layout QA** (`buildPage`): compose → validate → QA → `SAFE_TEMPLATE`
   fallback. The LLM **never emits coordinates** on this path.
4. **Asset curator**: places the user's own uploaded photos **first** (shared claim pool, loaded once
   per run, per-page allocator), topping up with stock (Pexels) or AI image generation only when they
   run out. Image slots degrade to tinted palette blocks if neither is configured.
5. **Page furniture** (`pageFurniture`): running head + folio are added as real elements with fixed
   ids (`FURNITURE_IDS`), which is what lets `renumberFolios` re-stamp page numbers after any
   structural change.

Concurrency `MAGAZINE_V2_GEN_CONCURRENCY` (default 2). Fonts are picked from a curated stack list so
a generated page never renders in a broken family.

**Retry = resume, not restart.** The plan is persisted as `genPlanPages`; a retried job keeps
already-composed pages and composes only the missing indexes. The handler rethrows on failure so the
queue's retry policy applies, and only marks the issue `failed` once attempts are exhausted.

### 7.2 AI-authored layout path (`MAGAZINE_V2_AI_LAYOUT`)

An alternative where the art director emits a **LayoutSpec frame tree** instead of picking a
template. This is a substantial sub-system:

- **[layoutSpec.ts](apps/server/src/lib/magazineV2/layoutSpec.ts)** — a bounded design DSL: space
  tokens (`none…xl`, or raw px up to 400), type size in **points** (5–220, with per-role floors:
  prose ≥8pt, display ≥6pt), colour refs (`bg/text/primary/secondary/accent`), font refs
  (`display/body`), 20+ leaf roles, and hard caps (depth 6, 28 leaves, 12 children, 6 stack layers).
  Nodes are `leaf` | `container` (row/col with `fr`/`content` sizing) | `stack` (the one sanctioned
  overlap: backing + exactly one content layer).
- **[solveLayout.ts](apps/server/src/lib/magazineV2/solveLayout.ts)** — compiles a spec into absolute
  integer leaf boxes. Pure.
- **[measureLeaf.ts](apps/server/src/lib/magazineV2/measureLeaf.ts)** + **[fontMetrics.ts](apps/server/src/lib/magazineV2/fontMetrics.ts)** (with an 8,256-line metrics table) — real
  per-font advance widths, so content sizing is measured, not guessed.
- **[fitReport.ts](apps/server/src/lib/magazineV2/fitReport.ts)** — measures what happened to every
  leaf (overflow, slack, empty budget, characters-per-line, stretched devices, oversized QR) and
  emits `fitHint()` as a **retry instruction to the model**. `charBudget()` tells the copywriter how
  many characters actually fit at a given setting instead of a static per-role table.
- **[pageDensity.ts](apps/server/src/lib/magazineV2/pageDensity.ts)**, **[pruneSpec.ts](apps/server/src/lib/magazineV2/pruneSpec.ts)**, **[layoutValidate.ts](apps/server/src/lib/magazineV2/layoutValidate.ts)**,
  **[layoutArchetypes.ts](apps/server/src/lib/magazineV2/layoutArchetypes.ts)** (a library the model
  is steered by), **[seedSpecs.ts](apps/server/src/lib/magazineV2/seedSpecs.ts)** (8 hand-written
  exemplar specs), **[composeFromSolved.ts](apps/server/src/lib/magazineV2/composeFromSolved.ts)**.
- Self-heal: a failed layout can be retried with a *new* layout without paying for another copywriter
  pass (copy is re-flowed onto the new slots by role).

### 7.3 Curated template library ([templates.ts](apps/server/src/lib/magazineV2/templates.ts))

8 kinds — `cover`, `contents`, `feature-full-bleed`, `two-column-article`, `photo-grid`,
`pull-quote`, `stat-infographic`, `back-cover` — each with named slots carrying fractional boxes,
z-order, layer (`background`/`overlay`/`content`), style refs and `required` flags. Plus
`SAFE_TEMPLATE` as the always-works fallback.

### 7.4 Source-document grounding ([retrieval.ts](apps/server/src/lib/magazineV2/retrieval.ts))

`chunkSource` + `retrieveSource` rank chunks by keyword relevance against the page intent and return
the best fit within a char budget, with an `isTruncated` signal. Source text is capped at 60,000
chars on generate, 80,000 on a stored upload.

---

## 8. Publishing

- Publishing writes a **frozen snapshot by value** into the shared `issues` collection tagged
  `builder:'v2'`. Readers need no access to the draft.
- **One snapshot per magazine, refreshed in place.** The immutable-editions model was built and then
  dropped (2026-08-11). The public URL never changes, so reader reactions and comments stay attached.
  `version` still increments because the PDF cache key is `${id}:${version}:${updatedAt}`.
- **Scope**: `full`, or `selected` honouring each page's `selectedForPublish` (a `selectedPageIds[]`
  body sets the flags first).
- **Approval gate** ([publishGate.ts](apps/server/src/lib/magazineV2/publishGate.ts)): every page
  going out must be approved-and-fresh *unless* it is out of review scope. Two distinct error
  sentences (waiting vs. approved-then-edited), each naming the page numbers, because the fix
  differs. Pure module so it is testable.
- **Cover**: explicit `coverImage`, else auto-derived from page 0's background image or its first
  image element.
- **Publish is inside `withIssueLock`** and re-reads the magazine inside it, so it cannot freeze a
  snapshot mid-reorder and two publishes cannot interleave.
- **`needsRepublish` is derived, never stored** — comparing `publishedAt` against the magazine's and
  every page's `updatedAt` (ISO strings compare lexicographically). A stored flag would need flipping
  by six write paths; a derived one cannot drift. `pageEditedSincePublish` gives the same answer per
  page so the rail can mark what a republish would change.
- A published magazine is **freely editable** — divergence is surfaced, not prevented.
- **Unpublish** sets `unpublishedAt` and returns the draft to `ready`, keeping the snapshot so
  re-publishing is one click.

### PDF export
Headless Chromium renders the **live public viewer route** (`/bulletins/:id`) and waits for
`data-bulletin-ready="true"` before printing, so there is no server-side re-implementation of the
layout. One shared browser instance (reset on crash/disconnect), and an LRU byte-bounded cache
(256 MB) keyed on `id:version:updatedAt`.

---

## 9. Submissions & approval workflow

*Plan of record: `docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md`.*

- **A submission is an event over a set of pages; the state lives on each page.** Every endpoint takes
  `pageIds[]`, and the batch is validated **in full** before anything is written — these routes email
  someone naming specific pages, so a half-applied batch would lie.
- **States**: `in_progress` → `submitted` → `approved`. The UI derives a fourth column,
  `needs_changes` = `in_progress` with a round behind it; storage stays at three values.
- **The solo-owner rule**: review binds only on pages someone other than the owner is assigned to
  (`isInReviewScope`). Most magazines have no collaborators and publish with no ceremony.
- **The owner never submits** — they are the approver.
- **Stale approvals**: `approvedAtRev` is pinned at approval; any later element write bumps `rev` and
  `isApprovalStale` makes the approval untrustworthy, blocking publish until re-approved.
- **`request-changes` doubles as reopen** — from `approved` as well as `submitted` — because the edit
  refusal message tells the user to ask the owner to reopen.
- **CAS on transitions**: submit CASes on review state (not `rev` — an autosave in flight is the
  submitter's own work); approve pins `rev`.
- **The Mongo filter for `in_progress` is `{review: {$nin:['submitted','approved']}}`** — a plain
  equality would never match legacy pages with no field at all.
- **Notes stay separate**: `submitNote` (the collaborator's) and `reviewNote` (the owner's) are never
  merged into one field.
- **Emails** grouped by recipient — approving 8 pages split between two people sends two emails, each
  naming only that person's pages. Always best-effort: the transition is committed first, delivery
  failure is reported and never fatal.
- **Audit trail** is append-only and written *before* a destructive delete, so the record outlives
  the page. `GET /reviews` is paginated and scoped to visible pages.

---

## 10. AI page assistant

- **Proposal-based, never a direct write.** The model calls tools that **stage** proposals; the route
  returns `{ reply, proposals, threadId }`; the client applies each one through the rev-guarded
  element CRUD. Same guardrails, and the changes land on the undo stack.
- **Tools**: `get_page`, `list_media`, `set_element_text`, `set_element_style`, `move_element`,
  `set_element_image`, `set_qr_link`, `add_element`, `delete_element`, `add_media_image`,
  `add_stock_image`, `change_text_to_image`, `use_image_as_layout`, plus **owner-only** structural
  tools `add_page`, `add_content_pages`, `remove_page`, `reorder_pages`.
  - Structural tools are **omitted** (not refused) for non-owners — the model cannot offer what it
    cannot see, so a contributor never gets a proposal that would 403 on apply.
  - A layout rebuild is **exclusive**: element edits staged in the same turn would target ids that
    won't exist, so the tools refuse the combination up front.
  - Placement tools re-validate every URL against the media library — an invented URL can never reach
    a page.
- **History comes from the thread, not from the client.** The client posts one new message + a
  `threadId`; the server reads that thread's own history (last 30 turns). Turns from another page are
  tagged `[page N]` so pronouns resolve. This closed a leak where another person's turns about
  another page entered the prompt.
- **Magazine-wide context**: the assistant gets the issue identity plus one digest line per page —
  **scoped to pages the caller may see**, so a page-scoped collaborator's assistant is exactly as
  blind as their screen.
- **Thread access**: read = creator **or** magazine owner; write = **creator only** (the assistant is
  a 1:1 conversation; a second voice would surface in the creator's next prompt). Naming a thread you
  may not write to is refused, not silently redirected. Everything else 404s.
- **The birth thread**: an AI-generated magazine's very first prompt *is* message one of its
  conversation; the planner's read-back and the completion note land there as assistant turns.
- **Attachments**: up to 5, ~12 MB data-URL each; images are persisted to the media library first so
  the agent can place them by URL.
- Chat persistence is best-effort — a persistence hiccup never fails a reply the user already saw.

---

## 11. "Use this layout" — layout from a reference image

*Plan of record: `docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md`.*

Three explicit phases:

**P1 — Read** (`POST /layout-reference`). Takes an **assetId in our own DB**, never a URL, so nobody
can spend the model budget on an arbitrary internet image or make our server the fetcher. Returns a
`LayoutReading` — regions with boxes, roles, emphasis (`dominant|normal|quiet`), background
(`light|dark|photo`), a palette, column count. Reads **only**; builds and writes nothing, so the user
sees what was understood before committing. Fraction-vs-percentage is decided **once for the whole
reading** from sides (w/h), never per value. Boxes are clipped rather than rejected.
`aspectMismatch` warns (tolerance 0.25) before anything is built.

**P2 — Apply** (`POST /pages/:pageId/apply-layout`). **Recreate, not rearrange**: the page is cleaned
first and rebuilt to match the reference, every text slot written fresh. The page's own photos remain
the image pool (topped up from the library, never from `reference` uploads — the reference's pictures
are not ours to take). `draftReferenceFill` writes copy for slots the page cannot fill from itself.
Chrome (running head, folio) rides along by id so `renumberFolios` can still find it.
`readingToSpec` performs a **guillotine partition** of the reading into a LayoutSpec: bands along one
axis, median gap tokens, spacers for deliberate emptiness, stacks for genuine overlap, and a col
fallback at the depth budget.

**P3 — Report honestly.** `measureFidelity` returns a **measured** IoU score weighted by read area,
with verdicts `matched` (≥0.72) / `adapted` (≥0.45) / `loose`. Structurally-guaranteed placements
(full-bleed backing ≥0.85) are excluded from the score because they carry no information, and the
largest text region can veto a "matched" verdict. Copy that had to be cut is reported in **characters**
(`tight` / `tightSummary`) rather than as an error with an internal element id in it. Rev-guarded,
because this replaces the page's elements and the undo stack does not cover it.

---

## 12. Fill / Adjust (`POST /pages/:pageId/format`)

A single-shot, text-only pass. The **server** computes the candidate boxes — `fill` = empty *or*
crowded, `adjust` = crowded only, where "crowded" means autoFit shrank below 85% of the designed
size — and asks the model to rewrite only those, with a per-role character guide. It returns
`{ edits }` and **never writes the DB**; the client applies each edit through the element CRUD so
every change is undoable. Geometry, images and QR are untouched.

---

## 13. Background worker & job queue

- Standalone Node process; loads the API's `.env` explicitly (worker cwd differs).
- **Hand-rolled Mongo poll queue** (no Redis/BullMQ): atomic `claimOne` via `findOneAndUpdate` so two
  workers never grab the same job; **one job at a time per process** because rasterisation is
  CPU-bound — scale out with more processes. Requeue up to `maxAttempts: 3`, then `failed`. TTL
  reaping via `expiresAt`.
- Job types: `processIssue`, `processPage`, `generateIssue`, `generatePages`.
- **API-side watchdog** (`healStuckIssue`, called from `GET /issues/:id`): a dead worker would
  otherwise leave an issue `processing` forever. Two terminal cases — no queued/running job exists at
  all (past a 20 s enqueue grace), or a job has outlived any possible real run (default 45 min) — mark
  the issue `failed` with a human sentence. The dead job is retired by CAS first, so a revived worker
  is left alone.

---

## 14. Studio UI

**Shell** ([MagazineEditorV2.tsx](apps/web/src/editor-v2/MagazineEditorV2.tsx)): docked AI assistant
left, scrolling canvas centre, inspector right, top toolbar; Stable brand palette (forest surfaces,
gold accents, parchment text).

| Component | What it does |
| --- | --- |
| [MagazineV2Home](apps/web/src/editor-v2/MagazineV2Home.tsx) | Library. Leads with a single centred AI composer (describe + attach); generate drops **straight into the studio** so pages stream in live, rather than a blocking loader. Import and Blank are quiet secondary starts |
| [EditorCanvas](apps/web/src/editor-v2/EditorCanvas.tsx) | Interaction layer over the real `IssuePageCanvas`. Single-click inline text editing (no double-click), deliberate-drag threshold to move, 8 resize handles. Live drag is local-only; pointerup commits **once** = one undo entry |
| [IssuePageCanvas](apps/web/src/editor-v2/IssuePageCanvas.tsx) | The shared read-only renderer (editor base, public viewer, PDF) |
| [Inspector](apps/web/src/editor-v2/Inspector.tsx) | Per-element panel — typography, colour, alignment, z-order, image fit/focal point, QR, icon picker, media library, upload. Every change is an undoable commit; no direct API calls |
| [PageRail](apps/web/src/editor-v2/PageRail.tsx) | Real page thumbnails (same renderer), drag-to-reorder + `Alt+↑/↓`, lazy thumbnails via one IntersectionObserver per tile. Replaced a strip of `1 (12) 2 (9)` numbers |
| [AiPanel](apps/web/src/editor-v2/AiPanel.tsx) | Assistant with thread list, attachments, **voice** (STT/TTS), and an amber "Review & apply" proposal tray |
| [ThreadList](apps/web/src/editor-v2/ThreadList.tsx) | Conversations sidebar (rename/delete/new) |
| [ReviewBoard](apps/web/src/editor-v2/ReviewBoard.tsx) | Four-column submissions board |
| [ShareDialog](apps/web/src/editor-v2/ShareDialog.tsx) | Collaborators + per-page assignment, from the staff directory |
| [PublishDialog](apps/web/src/editor-v2/PublishDialog.tsx) | Scope + page selection |
| [CoverPicker](apps/web/src/editor-v2/CoverPicker.tsx) | Cover from a page or an upload |
| [LayoutReference](apps/web/src/editor-v2/LayoutReference.tsx) | Reference upload → reading preview → apply, with the fidelity verdict |
| [BuildProgress](apps/web/src/editor-v2/BuildProgress.tsx) | Build banner, shimmer, rotating flavour lines |
| [AttachmentPreviewPane](apps/web/src/editor-v2/AttachmentPreviewPane.tsx) | Renders the real attached image/PDF |

**Store** ([store.ts](apps/web/src/editor-v2/store.ts), Zustand, 1,297 lines): optimistic +
rev-guarded element writes; a 409 reconciles to the server's page and tells the user. **Undo/redo
covers element edits only** — element add/delete and page structure are deliberately not on the
stack. Also holds threads/chat paging, proposals, thumbnails, generation watching (`watchGeneration`
polls ~1.5 s), and the review actions.

**Build-status copy** ([buildStatus.ts](apps/web/src/editor-v2/buildStatus.ts)): one rule — *never
claim progress the server did not report*. Four real signals (status, stage, pagesProcessed/Total,
and the pages themselves). Rotating lines are flavour and name no page number or percentage. Two
windows have no trustworthy count (planning, and the gap before an add-pages run resets counters), so
they get an indeterminate shimmer instead of a creeping bar.

**Client-side review mirror** ([review.ts](apps/web/src/editor-v2/review.ts)): re-implements review
scope and the publish gate as cheap local predicates, each naming its server twin, to avoid a round
trip per page. **These two are a known drift risk by design.**

**API client** ([api.ts](apps/web/src/editor-v2/api.ts)): reads retry, writes never do (not
idempotent); 409 bodies are surfaced as `ApiError` with the server's page attached.

**Model mirror** ([model.ts](apps/web/src/editor-v2/model.ts)): a hand-maintained type copy of the
server model. **A shared package was explicitly deferred** — today, changing the server model means
changing this file too.

---

## 15. Public reader

`/bulletins` (newsstand) and `/bulletins/:id` (reader), rendering the frozen snapshot with
`IssuePageCanvas`. Carries reactions ([ReactionBar](apps/web/src/components/ReactionBar.tsx)) and
comments ([CommentsSection](apps/web/src/components/comments/CommentsSection.tsx)) — both attached to
the stable published id, which is why republish overwrites in place. PDF download via the cached
Puppeteer route. Fallback page box is the A4 constant, but **every page is measured from its own
box**, so older Letter issues render correctly.

---

## 16. Configuration

| Env var | Meaning |
| --- | --- |
| `MAGAZINE_V2` | Master flag. `'true'` or every route 404s |
| `MAGAZINE_V2_AI_LAYOUT` | Enable the AI-authored LayoutSpec path |
| `MAGAZINE_V2_AI_LAYOUT_ATTEMPTS`, `MAGAZINE_V2_DRAFT_ATTEMPTS` | Retry budgets |
| `MAGAZINE_V2_GEN_CONCURRENCY` (2), `MAGAZINE_V2_PAGE_CONCURRENCY` | Parallelism |
| `MAGAZINE_V2_STUCK_ISSUE_MS` (45 min), `MAGAZINE_V2_STALE_JOB_MS`, `MAGAZINE_V2_JOB_TTL_MS`, `MAGAZINE_V2_POLL_INTERVAL_MS` | Queue + watchdog timing |
| `MAGAZINE_V2_MAX_RASTER_EDGE_PX`, `MAGAZINE_V2_MAX_IMAGE_DECODE_MP` | Extraction safety caps |
| `OPENROUTER_API_KEY` / `OPENAI_API_KEY`, `AGENT_MODEL`, `MAGAZINE_V2_IMAGE_MODEL` | AI providers |
| `STOCK_PROVIDER`, `PEXELS_API_KEY` | Stock photography |
| `VOICE_STT_MODEL`, `VOICE_STT_LANGUAGE`, `VOICE_TTS_MODEL`, `VOICE_TTS_VOICE` | Assistant voice |
| `SOFFICE_BIN`, `SOFFICE_TIMEOUT_MS` | LibreOffice for DOCX→PDF |
| S3 / storage config | Presigned uploads; `public/` prefix |

**Graceful degradation is a stated property**: no AI key → import still works with role `other`, and
AI routes return `503` with a human sentence; no stock/imagegen → image slots become tinted palette
blocks; no storage → upload routes return `501`/`503`.

### Hard limits
Source file 150 MB · image 15 MB · doc 150 MB · **120 pages/issue** · **400 elements/page** ·
generation 3–16 pages (planner capped at 24) · add-pages 1–12 · text HTML 8,000 chars · QR URL 2,000 ·
alt 300 · review note 2,000 · review batch = the page cap · AI attachments 5 × ~12 MB ·
source text 60,000 chars (generate) / 80,000 (stored upload) · chat history 30 turns.

---

## 17. Testing

19 server suites in [apps/server/tests/magazineV2/](apps/server/tests/magazineV2/): `access`,
`addPages`, `applyLayout`, `buildStatus`, `fitReport`, `layout`, `layoutFidelity`, `layoutFreedom`,
`layoutReading`, `layoutSpec`, `model`, `pageDensity`, `pageFurniture`, `pruneSpec`, `publishGate`,
`readingToSpec`, `solveLayout`, `submissions`, `threads`.

Note the shape: **the consequential rules were deliberately extracted into pure modules
(`publishGate`, `review`, `access`, `threads`, `buildStatus`) precisely so they could be tested** —
the route file cannot be imported by a test because it builds a Router and pulls in the DB.

---

## 18. Known gaps and carried debt

Recorded here because a rebuild should decide about each one explicitly.

1. **The route file is a 3,022-line monolith** with no test coverage of its own; correctness rests on
   the extracted pure modules.
2. **The web model is a hand-copied mirror** of the server model, with a comment admitting a shared
   package was deferred. It already drifts: `ElementTextAlign` omits `justify` and `fontWeight` omits
   `900` on the web side.
3. **Two client-side re-implementations of server rules** — review scope and the publish gate — with
   an explicit "must not drift" warning.
4. **`withIssueLock` is in-process only.** Structural serialisation breaks across multiple API
   instances.
5. **Collaborator routes do not take the issue lock**, so the delete-page path has to re-read the
   magazine immediately before writing `collaborators` to narrow the race.
6. **Undo does not cover** element add/delete, page structure, or `apply-layout` (which replaces every
   element on the page).
7. **The imported source file is world-readable** — it lives under the `public/` prefix like every
   other upload, a deliberate but noted change from API-only access.
8. **No collaborative presence or live multi-user editing** — concurrency is handled by rev conflict
   + a 409, not by merge.
9. **The published snapshot has no history.** Republish overwrites in place; the previous edition is
   not recoverable through the product (only `version` increments).
10. **Legacy chat rows cannot be attributed** — shown to the owner as one read-only "Earlier
    conversation" rather than migrated.
11. **`element.locked` has no UI affordance** — the flag is enforced by the API but only reachable
    over the wire.
12. Two vestigial fields: `magazinesV2.publishedIssueIds[]` (the dropped editions model) and
    `collaborators[].role` (the removed third role, read by nothing).

---

## 19. Prior design documents

Existing plans and reviews in [docs/](docs/) that this system was built from — worth reading before
respecing, since several record decisions that were made, reversed, and why:

`MAGAZINE-BUILDER-V2.md` · `MAGAZINE-BUILDER-V2-TECHNICAL.md` · `MAGAZINE-V1-VS-V2.md` ·
`MAGAZINE-V2-BUILDER-PLAN.md` · `MAGAZINE-V2-BUILDER-STRONG.md` · `MAGAZINE-V2-REBUILD-PLAN.md` ·
`MAGAZINE-V2-QUALITY-PLAN.md` · `MAGAZINE-V2-SMART-AI-PLAN.md` · `MAGAZINE-V2-SUBMISSIONS-PLAN.md` ·
`MAGAZINE-V2-THREADS-PLAN.md` · `MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md` (+ its review) ·
`MAGAZINE-V2-SCALABILITY-REVIEW.md` · `MAGAZINE-V2-DEEP-REVIEW.md` ·
`MAGAZINE-V2-FULL-REVIEW-2026-08-17.md` · `MAGAZINE-V2-REVIEW-2026-08-11.md` ·
`MAGAZINE-V2-REFERENCE-AUDIT-2026-08-15.md` · `MAGAZINE-V2-FIXES-CHECKLIST.md` ·
`CAMPAIGN-HQ-MAGAZINE-BUILDER.md` (the reference implementation much of this was ported from) ·
`V2-AI-TEMPLATE-BUILDER.md` · `V2-PARITY-PLAN.md` · `TEMPLATE-BUILDER-V2-REVIEW.md`.
