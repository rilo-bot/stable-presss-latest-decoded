# Magazine v2 — Scalability Fixes Checklist

Actionable, trackable companion to
[MAGAZINE-V2-SCALABILITY-REVIEW.md](./MAGAZINE-V2-SCALABILITY-REVIEW.md).
Ordered P0 → P3 (impact-first). Each item lists **where**, **why**, and rough
**effort** (S ≤½ day · M ≤2 days · L > 2 days). Nothing here is started yet.

**Bottom line the checklist serves:** v2 is correct and fine on **1 API + 1
worker**; the P0/P1 items harden that single-instance deployment, and the P2 items
are prerequisites for running more than one of anything.

---

## P0 — cheap, high-impact, no redesign

- [ ] **Add database indexes on startup** — *S* · risk #1
  There is no `createIndex` anywhere in the repo; every query is a collection scan.
  Add (include `deletedAt` in compound keys, since every query filters it):
  - `magazinePagesV2` → `{ magazineId: 1, index: 1 }`
  - `magazineJobs` → `{ status: 1, createdAt: 1 }` (the worker claim hot path)
  - `magazinesV2` → `{ ownerId: 1 }` and `{ updatedAt: -1 }`
  - `mediaAssetsV2` → `{ magazineId: 1 }`
  - `users` → `{ email: 1 }`
  Where: a one-time bootstrap in `apps/server/src/lib/db.ts` (or a startup hook).

- [ ] **Fix `GET /issues` (N+1 + over-fetch)** — *M* · risk #4
  `magazinesV2.ts:189-208` loads every issue then `pagesFor` (full page docs incl.
  `elements`) on each just to read `.length`, with no pagination or scoping.
  → Denormalize a `pageCount` field onto the issue doc (bump it in structural ops)
  **or** use an aggregation `$group/$count` per `magazineId`; add pagination +
  server-side sort. Requires extending the `find()` helper (`db.ts:75-81`) to
  accept `{ projection, limit, sort }`.

- [ ] **Memoize the editor renderer** — *M* · risk #4
  Dragging one box re-runs DOMPurify on every text element every frame (no
  `React.memo` anywhere). → `React.memo` on `IssuePageCanvas` + a memoized
  `TextElement`; cache `sanitizeRichText` keyed by content (`IssuePageCanvas.tsx:61`);
  pre-sort `page.elements` once on load instead of per render (`:101`).

- [ ] **Give the editor shell narrow selectors** — *S* · risk #4
  `MagazineEditorV2.tsx:50` does `const s = useEditorStore()` (whole store) so every
  drag frame re-renders the toolbar/tab strip ~60×/s. → Select only what's needed
  (`useEditorStore(s => s.issue)`, etc.); memoize the `topZ` reduce (`:111`).

- [ ] **Cap the Pexels 429 retry** — *S* · risk #5
  `stock.ts:52-56` recurses on every 429 with no depth cap (comment claims "one
  retry"). → Cap at 1–2 attempts, then return `null` (caller degrades to a block).

- [ ] **Parallelize image slots within a page** — *S* · pipeline
  `generate.ts:411-434` sources image slots serially (a 4-slot photo-grid page ≈ 4
  min). → `Promise.all` the per-slot curation, bounded by a small local limit.

- [ ] **Guard/cancel the generation poll + timeout the home polls** — *S* · risk #5
  `store.ts:280-295` `set({ issue, pages })` is unconditional — navigating to
  another magazine corrupts its state for up to 180 s. → Guard every `set` with
  `if (get().issueId !== issueId) return;` and stop the loop on `load()`. Add an
  elapsed-time cap to the never-ending home polls (`MagazineV2Home.tsx:104-158`).

---

## P1 — reliability

- [ ] **Make the job failure path real** — *M* · risk #2
  All handlers catch and mark the issue `failed` without rethrowing, so
  `JOB_MAX_ATTEMPTS = 3` never fires (`generate.ts:567-575`, `processIssue.ts:135`,
  `processPage.ts:246`). → Rethrow a *retryable* error class (transient S3/LLM/DB)
  so the queue retries with backoff; keep permanent errors terminal. Move the
  top-of-handler `findById` (`processIssue.ts:45`) inside the try, and have the
  queue's permanent-fail path set the issue `failed` if still `processing` (else the
  client polls forever).

- [ ] **Guard publish snapshot size** — *M* · risk #4
  `buildPublishSnapshot` embeds all pages by value into one `issues` doc — can
  exceed MongoDB's 16 MB limit with no guard (`magazinesV2.ts:610-719`). → Enforce a
  byte budget and reject clearly before the write, **or** store the snapshot as
  referenced per-page docs (wire up the already-declared-but-unused `COL.published`).

- [ ] **Make add-pages idempotent + clean media on retry** — *M* · risks #2, worker
  `generateMorePages` re-inserts from scratch on crash-requeue (duplicate pages,
  `generate.ts:624-638`); retries also leak `COL.media` docs + orphan S3 objects
  (random keys, `processPage.ts:183,243`). → Tag pages with the run/job id and clear
  a prior partial run before inserting; delete prior media (or use deterministic
  keys like the background path does) before re-extracting.

- [ ] **Prompt caching + model tiering** — *M* · pipeline cost
  The source document is re-sent uncached on every per-page call and one premium
  model is used for everything (`generate.ts:210,363`; `provider.ts:16`). → Enable
  provider prompt caching on the static system prompt + source block (biggest token
  win); use a cheaper model for per-page slot-filling and the format pass.

- [ ] **Debounce continuous-control commits** — *S* · frontend
  The native colour picker fires a PATCH + undo entry per drag event
  (`controls.tsx:163`, `Inspector.tsx:86`). → Commit on pointer-up/settle, coalescing
  into one PATCH + one undo entry.

---

## P2 — horizontal scale (do BEFORE running >1 of anything)

- [ ] **Worker heartbeat + owner token** — *L* · risk #3 *(the horizontal-scale blocker)*
  The stale-sweep judges staleness by `startedAt` with no heartbeat, so a 2nd worker
  double-runs any job over `STALE_RUNNING_MS` and corrupts pages/media
  (`queue.ts:95-136`). → Bump a `heartbeatAt` every ~15 s from the running handler;
  sweep on stale *heartbeat*, not `startedAt`. **Until then:** document single-worker
  and set `STALE_RUNNING_MS` above the worst-case 120-page runtime.

- [ ] **Externalize the API lock + rate limiter** — *M* · risk #3
  Structural-op serialization (in-process `Map`, `magazinesV2.ts:75-89`) and rate
  limiting (in-memory bucket, `rateLimit.ts:17`) break at >1 API instance. → Move to a
  Mongo advisory lock (via `updateOneIf`) or Redis before scaling the API out — or
  explicitly enforce/document single-instance.

- [ ] **Cut worker memory** — *L* · worker
  Whole source file buffered (≤150 MB), MuPDF WASM objects never `.destroy()`'d
  (pixmaps/images/structured-text/page/doc leak), full-res decode before downscale.
  → Call `.destroy()` on MuPDF objects; stream/temp-file large sources; cap decode
  resolution; consider `worker_threads` for rasterization.

- [ ] **Purge the jobs collection + add a cross-job rate limiter** — *M* · risks #1, #5
  `magazineJobs` is never purged (grows under the unindexed claim scan). → TTL/partial
  index to purge `done`/`failed` (or a dead-letter collection). Add a shared token
  bucket in front of OpenRouter / Pexels / image gen so more workers don't blow
  provider quotas.

---

## P3 — code quality

- [ ] **Add tests against the DB-free seams** — *M*
  `planAndComposeIssue`, `layoutValidate`, `normalizePages`, SAFE-fallback paths. The
  seams exist and are unused.
- [ ] **De-duplicate** — *S–M*
  `mapWithConcurrency` (twice: `pool.ts:7` + `generate.ts:82`), the clear-prior-pages
  loop (3×), finalize-status logic, zIndex/new-element helpers, the orientation-from-
  ratio helper.
- [ ] **Tighten inputs & types** — *M*
  Introduce zod request-body schemas; one shared owner-check middleware (preamble is
  copied ~12× in `magazinesV2.ts`); add `IssueDoc`/`PageDoc` types; wire the typed
  `JobPayloads` into worker dispatch; remove/wire the dead `COL.published`.
- [ ] **Split mega-units** — *M*
  `store.ts` (~560 lines), the `MagazineEditorV2` toolbar (~420), and the 1253-line
  `magazinesV2.ts` route file. Add structured, job-id-correlated logging in the worker.

---

## Progress

| Priority | Items | Done |
|---|---:|---:|
| P0 | 7 | 0 |
| P1 | 5 | 0 |
| P2 | 4 | 0 |
| P3 | 4 | 0 |

_Last updated: 2026-07-24 (checklist created; nothing started)._
