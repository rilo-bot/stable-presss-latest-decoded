# Magazine Builder v2 — Design & Build Plan

> A fresh, AI-first magazine builder to replace the fixed 2-template system.
> Architecture is adapted from the **Campaign HQ** magazine builder (a proven reference app at
> `../campaign-hq`; its full spec is the build bible — see §14), fitted to stable-press's stack
> and folding in the fixes from [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md).
> Companion: [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md).
> Status: **architecture approved, not yet built.** Last updated: 2026-07-23.

## 1. Goals

Replace the current builder (48 hardcoded React templates, region-fill only) with a
**layout-as-data** builder. Five capabilities:

1. **Import → magazine.** Upload a PDF (DOCX later); a worker digitizes it into an editable,
   **pixel-faithful** magazine; refine in the AI Studio.
2. **Build from scratch.** Describe the magazine (+ reference images/docs); the worker generates
   a whole issue from a curated template library.
3. **Voice agent.** Drive the studio hands-free.
4. **Knowledge base.** Uploaded docs are ingested; the agent pulls from them to fill content.
5. **Reliability.** No layout bugs, no data-loss on concurrent edit/publish, AI kept on rails.

## 2. Approved architecture decisions (2026-07-23)

| Decision | Choice | Why |
|---|---|---|
| Layout model | **Free-form absolute pixels** (`x,y,w,h` in each page's own `width/height`) | The single source of pixel fidelity across editor / viewer / PDF. Grid+flow would destroy an uploaded PDF's layout. |
| Import fidelity | **Deterministic MuPDF extraction** — AI tags *roles* only, never geometry | Pixel-faithful **and** editable **and** reliable. Unreliability only ever comes from an LLM inventing coordinates — which we forbid everywhere. |
| Extraction/generation | **Separate worker process + Mongo poll queue** | Heavy MuPDF/gen jobs are retryable and don't block the API. |
| Publish model | **Keep stable-press's frozen `PublishedIssue` snapshot** (immutable, versioned) | A published bulletin must never change under readers. (Do **not** adopt Campaign HQ's live-filter model.) |
| Engine | **Custom React block renderer** on the current stack | Full control, self-contained (CSP/S3/puppeteer), no heavy editor dependency. |
| Rollout | **Build v2 alongside, migrate** | v1 issues keep rendering via a compat renderer; retire v1 templates once v2 is proven. |
| DOCX | **PDF-first; defer DOCX** (LibreOffice `soffice` dependency) | Ship the proven PDF path first; avoid the ops burden up front. |
| AI edit UX | **Direct-apply + single undo stack** (per-element validation is the safety net) | Consistent with the existing article/profile studios and [[studio-focus-editing]]. A staged "review" mode can be added later for large multi-page AI ops. |

**The load-bearing invariant:** *geometry is deterministic, never AI.* MuPDF gives exact
coordinates on import; fixed templates own coordinates on generation; the AI only tags roles,
fills named slots, or edits existing elements at their known boxes.

## 3. Data model (v2)

Two collections (a multi-page issue's element data can be large; a page must be
re-processable alone). Adapts to stable-press's `lib/db.ts` (`_id`→`id` projection, soft delete).

### 3.1 `magazinesV2` — issue meta
```ts
interface MagazineV2 {
  id: string; title: string; slug: string;      // slug immutable after create
  status: 'uploading'|'processing'|'ready'|'failed'|'draft'|'published';
  origin: 'upload'|'scratch';
  sourceFile?: { key; url; originalName; mimeType; size; pageCount };
  genTheme?: { title; subtitle; prompt; palette; fonts } | null;  // for "add pages matching theme"
  pagesProcessed: number; pagesTotal: number; processingError?: string; stage?: string;
  coverImage: string;                            // derived from page-0
  // stable-press identity (NOT tenant): reuse v1
  ownerId: string; ownerName?: string; collaborators: MagazineCollaborator[];
  publishedIssueIds: string[]; createdAt: string; updatedAt: string;
  schemaVersion: 2;
}
```

### 3.2 `magazinePagesV2` — the elements
```ts
interface MagazinePageV2 {
  id: string; magazineId: string; index: number;   // contiguous 0..n-1, unique {magazineId,index}
  width: number; height: number;                    // CANONICAL px — the coordinate space
  background: { type: 'image'|'color'; value: string };
  elements: MagazineElement[];
  status: 'pending'|'extracted'|'failed'|'reviewed';
  selectedForPublish: boolean;                      // stable-press: drives frozen-issue selection
  rev: number;                                      // optimistic-concurrency token
}
```

### 3.3 The element model (the heart) — server-safe, validated on every write
```ts
type ElementType = 'text'|'image'|'shape'|'qr';
type TextRole = 'headline'|'subhead'|'byline'|'body'|'caption'|'pullquote'|'other';
type ElementSource = 'extracted'|'manual'|'ai-agent';

interface MagazineElement {
  id: string; type: ElementType;
  x: number; y: number; w: number; h: number;    // px in the page's own width/height
  rotation: number; zIndex: number; locked: boolean;
  source: ElementSource; confidence?: number;    // 0..1
  text?:  { content: string /*sanitized inline HTML*/; role: TextRole; fontFamily: string;
            fontSize: number; maxFontSize?: number; fontWeight: 400|500|600|700|800; color: string;
            align: 'left'|'center'|'right'; lineHeight: number; autoFit: 'shrink'|'clip'; vAlign?: 'top'|'center'|'bottom' };
  image?: { assetId: string; url: string; alt: string; fit: 'cover'|'contain'; focalPoint?: {x;y} };
  shape?: { fill: string };
  qr?:    { url: string; fg: string; bg: string };
}
```
**Validation discipline (port exactly — this is what earns "no bugs"):**
`validateElements(raw,{width,height})`, `validateElementPatch(raw,page)` — clamp every geometric
value to the page; unknown `type` → element **dropped, never thrown**; `MAX_ELEMENTS_PER_PAGE=400`,
`MAX_TEXT_HTML=8000`, `MIN_SIZE=2`; colors must match `#rrggbb` else default; URLs through
`safeUrl` (http(s)/mailto/tel). Every write path runs **validate → `sanitizeHtml` → refitText**
(recompute `fontSize` via `fitFontSize` only for `autoFit:'shrink'` text with a `maxFontSize`).
A PATCH must be a *fully-formed element*, so the endpoint **deep-merges the partial onto the
stored element (text/image/qr one level) before validating.**

### 3.4 Media library — `mediaAssetsV2`
Every uploaded/extracted/stock/AI image is a `MediaAsset` (`key,url,contentType,size,alt,
magazineId?,pageIndex?,kind:'upload'|'photo'|'graphic',attribution?`). Image elements reference
these by `assetId`/`url` — **the AI may only use library or on-page images, never invent URLs.**
(Extends v1's `ImageRef` dedup into a browsable, provenance-guarded library.)

### 3.5 Generation templates (from-scratch only)
Templates exist **only** for AI generation — never persisted, never for uploaded issues. They
compile to raw absolute-positioned elements. The AI "art director" picks a template id + maps
copy into named slots (fractional boxes → canonical px via `composePage`), then the result runs
through `validateElements` + layout QA (`validatePageLayout`); a failed layout falls back to a
`SAFE_TEMPLATE`. Canonical page: `PAGE_W=1275, PAGE_H=1650` (US Letter @150dpi) so uploaded and
generated issues share one coordinate space.

### 3.6 Frozen publish (stable-press model, kept)
Publishing still freezes an immutable, versioned `PublishedIssue` snapshotting the selected
pages' elements (images by resolved URL). The public viewer + PDF read the **snapshot**, never
the live draft — so a published bulletin never changes under readers. (This is the one place we
deliberately diverge from Campaign HQ.)

## 4. Reuse map

**Reuse as-is / adapt:** S3 upload + presigned PUT; `sanitizeHtml`/editor `sanitize.ts`; fonts
registry; **puppeteer PDF export** (add the readiness handshake — §8); the collaborator model +
RBAC gates; `documentIngest.ts` (vision OCR) for the knowledge base; the AI SDK plumbing +
client-executed-tools trust boundary; the uncontrolled-`contentEditable` `EditableText`; the
studio-focus purple ring for selection ([[studio-focus-editing]]); OpenRouter provider.

**Replace:** the 48 template components; the `pageType`+region model → element model;
region tools → element tools; `MagazineCanvas`/`Region` → the absolute-px block renderer.

**New:** `apps/worker` (queue + MuPDF + generation); MuPDF (WASM), sharp; two new collections +
media library; per-element CRUD API.

**Keep read-only:** v1 template registry so existing v1 issues still render (compat), until
migration retires them.

## 5. API (per-element CRUD — fixes the v1 clobbering findings)

Mounted under `/api/magazines` (v2 routes). RBAC: staff + magazine owner/collaborator (NOT
tenant); reuse `issuesGate`/owner checks. Rate limits: writes 60/min, agent 20/min (**closes
finding H5**). Highlights:

- Issue lifecycle: `POST /issues` (presigned S3 PUT for the source), `/confirm-upload` (enqueue
  extraction), `/issues/blank`, `/issues/:id/generate`, `/reset`, `/pages/generate`.
- Page structure: add / duplicate / delete (never all) / `reorder` — **two-phase resequencing**
  (park at `INDEX_OFFSET+i`, then land) since `{magazineId,index}` is unique; blocked while
  `status==='processing'`.
- **Element hot path:** `PATCH /issues/:id/pages/:index/elements/:elementId` — merge partial onto
  stored element → `validateElementPatch` → sanitize → refit → bump page `rev` → save. Also
  `POST`/`DELETE` element. **The client never sends the whole pages array** → the v1
  owner-reorder-clobbers-collaborator bug (H1) and per-page last-write-wins (M13) are gone;
  stale writes 409 on `rev`.
- AI: `POST …/pages/:index/format` (Fill/Adjust), `…/pages/:index/agent` (chat), `/intake`.
- Publish: `POST /issues/:id/publish` freezes a `PublishedIssue` (§3.6) from the **stored** pages
  server-side (not a client snapshot → no stale publish).

## 6. Worker (`apps/worker`) — new service

Standalone Node process: `dbConnect()` → poll loop. **Hand-rolled Mongo poll queue** (`Job`
collection, atomic `findOneAndUpdate({status:'queued'}→'running')`, retry `maxAttempts=3`), one
job at a time per process, per-page parallelism via `mapWithConcurrency` (extract=3, gen=2),
`MAX_PAGES_PER_ISSUE=120`.

**Extraction (`processIssue`/`processPage`):** download source → MuPDF `openPdf` → upsert
`pending` placeholder pages → per page (never throws): rasterize (`RENDER_DPI=150`) →
**erase original glyphs** from the background (so reconstructed text doesn't double) → upload
clean background → structured-text walk builds text/image/vector/QR elements with **MuPDF
geometry + the AI's role tag only** → validate/sanitize → persist `extracted`. Gotchas to port:
**alpha→PNG, opaque→JPEG** (avoid black-box); composite SMasks; skip slivers/full-page
composites/effect layers; dedup MuPDF's multi-block pictures.

**Generation (`generateIssue`/`generatePages`):** Agent plans the issue (title/palette/fonts/
page list) → per page: pick template → draft copy → asset curator (AI image via OpenRouter, else
Pexels stock, else palette color block — all stored as real `MediaAsset`s) → `composePage` →
validate → layout QA → persist. Everything **env-gated with graceful degradation** (no key →
clean 501/503 / color blocks).

## 7. AI surfaces

All AI routes through OpenRouter (server-side key). **Structured output = forced single tool
call, null on failure, clamp every field, treat element content as DATA not instructions.**

- **Chat agent** (`/agent`): tool set (`list_media`, `set_element_text/style/image`,
  `move_element`, `add_element`, `set_qr_link`, `delete_element`, `add_stock_image`,
  `change_text_to_image`, `add_content_pages`, `add/remove/reorder_page`). Tools go through the
  same element/page CRUD a human uses — **the LLM never writes the DB**. Image-URL provenance
  guarded to library/page only. **Direct-apply + single undo stack** (our chosen UX).
- **Fill / Adjust** (`/format`): single-shot text pass — *adjust* condenses crowded text, *fill*
  writes copy into empty boxes; text only, never geometry; server double-filters ids to real text
  elements; auto-applied + undoable.
- **Intake** (`/intake`): pre-generation planning chat ("default to building, not asking") →
  hands a build brief to `/generate`.
- **Voice** (feature #3): wire existing server-side STT/TTS to the chat agent (after rate limits).
- **Knowledge base** (feature #4): ingested docs (via `documentIngest`) + media library become
  the agent's `list_media` + a `queryKnowledge(topic)` tool that fills content.

## 8. Rendering & PDF (pixel-fidelity chain)

One geometry, three consumers, so they can't drift:
- **Editor canvas:** page at true px, one `transform:scale()` from top-left; drag math is
  **screen-delta ÷ scale**; resize handles **counter-scale** (`/scale`) to stay constant on screen.
- **Public viewer:** read-only renderer scales with **CSS container queries** — element boxes as
  `%` of page dims, `fontSize` in `cqw`; **aspect box via `padding-bottom:(h/w)*100%`, NOT
  `aspect-ratio`** (which collapses to 0 under a `container-type` parent). Text via sanitized
  `dangerouslySetInnerHTML`.
- **PDF:** puppeteer **prints the live public viewer** (never a server re-layout) with a
  **readiness handshake** — `networkidle0` + await every `<img>` load/error + `document.fonts.ready`
  — sheet size from page[0] dims, `printBackground`, `break-after:always` per page. **Fixes
  finding L4** (blank-artwork PDFs). stable-press already prints the live route; just add the
  handshake + serve published images publicly.

## 9. Reliability strategy (how the v1 review findings get closed)

| v1 finding | Closed by |
|---|---|
| H1 owner-reorder clobbers collaborators; stale publish | Per-element CRUD (never whole-doc PUT) + publish from stored pages (§5) |
| M13 per-page last-write-wins | Page `rev` optimistic concurrency → 409 on stale |
| H5 no rate limiting on AI/agent | Write 60/min + agent 20/min limits (§5) |
| L4 PDF ships blank artwork | Readiness handshake + publicly-fetchable published images (§8) |
| L1 dual undo stacks | Single undo authority shared by human + AI edits |
| Layout drift / AI hallucination | Deterministic geometry (MuPDF/templates); AI never positions; validate→sanitize→refit; invalid elements dropped; forced-tool structured output |
| M5 client-only attachment caps | Server-side size/count caps on upload + agent routes |

Plus: per-page isolation (one bad page never sinks a job), env-gated graceful degradation, and a
test harness (golden-file extraction mapping, renderer snapshots, per-page-kind PDF smoke).

## 10. UI / UX & user journeys

Design principle: **one canvas, one assistant, three ways in.** AI-first; clicking a block only
*points* the assistant at it; manual controls hidden until selection. No modes, no save button
(autosave). (Matches Campaign HQ's proven editor UX — the app you liked.)

### 10.1 Three entry paths (the library → new-magazine)
`📄 Import a document` (PDF now, DOCX later) · `✨ Create with AI` (describe + reference uploads →
intake chat → generate) · `＋ Blank`. Below: the **library** — draft + published covers.
All three land in the *same* full-screen editor.

### 10.2 The editor — full-screen, 3 resizable panes
```
┌───────────────────────────────────────────────────────────────────┐
│ ◀  title · busy    Undo Redo · Zoom −%+ · +Add · AI · [ Publish ]    │
├──────────────┬──────────────────────────────┬──────────────────────┤
│  ASSISTANT   │        PAGE CANVAS            │   INSPECTOR / ASSETS  │
│  (chat +🎤+📎)│  vertical scroll of pages,   │  per-kind controls,   │
│  proposals/  │  absolute-positioned elements,│  media library tab,   │
│  Fill·Adjust │  click→ring, drag/resize      │  Position & size, X   │
└──────────────┴──────────────────────────────┴──────────────────────┘
```
- **Center — canvas:** pages as a vertical scroll stack (lazy-loaded), elements drag/resize with
  counter-scaled handles; click → purple focus ring → the assistant's focus.
- **Left — Assistant:** always-present chat + 🎤 voice + 📎 attach (attachments double as the
  knowledge base). Per-page **Fill/Adjust** buttons.
- **Right — Inspector:** appears per selection; per-kind controls (text typography, image
  replace/fit, shape fill, QR url, position/size) + an **Assets** tab (the media library). Never
  calls the API directly — edits flow through the one element write path.
- Panes are resizable (persisted widths); the center canvas never collapses.

### 10.3 Journeys
**Import** → drop PDF → progress ("page 4 of 12") → editor opens `ready` → refine → publish.
**Describe** → intake chat (≤1–2 questions) → generation overlay → editor → refine.
**Blank** → empty page → build conversationally / by hand.
**Edit (daily driver)** → open → click element → "make this bolder" or inspector → Undo anything.
**Publish** → pick pages → freeze a public issue at `/bulletins/:id` + PDF.

### 10.4 Why it stays simple *and* scales
New capabilities are new assistant *tools*, not new screens — UI complexity stays flat as the
product grows. Progressive disclosure keeps the default view clean; the 3-entry pattern absorbs
future paths; one editor for all paths = one thing to learn.

## 11. Phased roadmap (each phase shippable behind the v2 flag)

Adapted from Campaign HQ's build order (§10 of its spec):

- **Phase 0 — Element model + persistence.** Element union + `validateElements`/
  `validateElementPatch`/`sanitizeElements`/`refitText`/`fitFontSize`/`safeUrl`; the two
  collections + media library; feature flag; server-side upload caps.
- **Phase 1 — Per-element CRUD API.** Issue/page/element CRUD, RBAC, rate limits, two-phase
  resequencing, `rev` concurrency, frozen-publish adapt.
- **Phase 2 — Shared read-only renderer.** Absolute-px → `%`/`cqw`/`padding-bottom` scaling; QR.
- **Phase 3 — Editor UI.** Shell + scaled canvas + drag/resize (÷scale, counter-scaled handles) +
  `EditableText` + inspector + resizable panes + single-stack undo/redo.
- **Phase 4 — Worker + PDF extraction (feature #1).** Mongo poll queue + MuPDF pipeline
  (rasterize + erase-glyphs + element build + role tagging). PDF import lands here.
- **Phase 5 — Generation (feature #2).** Template library + `composePage` + layout QA + image
  gen/stock, all as real MediaAssets; intake chat.
- **Phase 6 — AI editing surfaces.** Chat agent (direct-apply + undo) + Fill/Adjust; assistant
  panel.
- **Phase 7 — Voice (#3) + Knowledge base (#4).** STT/TTS wired to the agent; `queryKnowledge`.
- **Phase 8 — Publish/viewer/PDF hardening + migration.** Readiness handshake; frozen-issue v2
  snapshot; keep v1 compat renderer; retire v1 templates; test harness + perf pass.

## 12. Open questions to settle before Phase 4+

- Page size/format targets (US-Letter 1275×1650 like the reference, A4, or both?).
- Knowledge-base scope (per-magazine vs shared org-wide).
- Whether build-from-scratch may **generate** images (AI image gen) or only place uploaded/stock.
- Worker hosting on Render (a second service) — confirm the deploy/cost path.

## 13. Divergences from the Campaign HQ reference (deliberate)

1. **Frozen `PublishedIssue` snapshot** (not live-filter) — published bulletins are immutable.
2. **RBAC + owner/collaborator** (not multi-tenant) — drop `tenantId`; reuse stable-press gates.
3. **PDF-first**, DOCX deferred (no LibreOffice dependency yet).
4. **Direct-apply + undo** for the chat agent (not staged proposals) — consistency with existing
   studios; per-element validation is the safety net. Revisit if large multi-page AI ops need a
   review step.
5. Reuse stable-press's existing `sanitizeHtml`, fonts, S3, puppeteer, and OpenRouter provider
   rather than introducing parallel ones.

## 14. Reference

Full implementation-grade spec + working source: `../campaign-hq` (docs + `apps/{client,server,
worker,web}`, `packages/{blocks,db}`). Its spec's §11 (gotchas/invariants), §12 (file manifest),
and §13 (feature checklist) are the authoritative detail for each phase above. When a phase is
ambiguous, the reference source is the tie-breaker — preserve its load-bearing logic (free-form
px model, MuPDF extraction, poll queue, per-element validation, print-the-viewer PDF chain).
