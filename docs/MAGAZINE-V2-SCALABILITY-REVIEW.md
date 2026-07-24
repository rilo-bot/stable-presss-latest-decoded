# Magazine Builder v2 — Scalability & Codebase Review

**Date:** 2026-07-24
**Method:** Four parallel deep-reviews (AI generation pipeline, API + data model,
worker + job queue, web editor), each grading scalability and code quality with
file:line evidence. The load-bearing claims were then independently re-verified
against source (see "Verified" markers).
**Surface:** ~4,000 lines server (`lib/magazineV2/` + `routes/magazinesV2.ts`),
~3,400 lines web (`editor-v2/`), ~1,600 lines worker.

---

## Verdict

**Magazine v2 is well-engineered for correctness and for a single-instance
deployment, but it is not yet ready to scale horizontally.** The architecture has
the right bones — out-of-process jobs, a separate per-page collection, one
hardened write pipeline, optimistic per-element concurrency, honest degradation.
What's missing or broken are the actual *scaling mechanisms*: there are **no
database indexes at all**, the background-job **retry path is dead code**, and
both the API and the worker have **single-process correctness assumptions** that
break the moment you run a second instance. Most fixes are additive (indexes,
heartbeat, caching, pagination, memoization) rather than redesigns — the good
news.

### Scorecard

| Area | Scalability | Code quality | Weakest link |
|------|:-----------:|:------------:|--------------|
| AI generation pipeline | **C** | **B** | Serial images per page; no prompt caching; single premium model |
| API + data model | **C−** | **B−** | Zero indexes; N+1 library list; 16MB publish doc |
| Worker + job queue | **D+** | **B−** | No heartbeat → unsafe at N>1; dead retry path; MuPDF WASM leak |
| Web editor | **C** (perf) | **B−** | Per-drag-frame DOMPurify storm; whole-store subscription |
| **Overall** | **C−** | **B−** | Architected for exactly one API + one worker process |

---

## How far does it scale *today*?

- **Safe deployment is 1 API instance + 1 worker process.** For a small staff team
  building a moderate number of issues, it works and is correct.
- **First thing to degrade is the library list.** `GET /issues` loads *every*
  element of *every* issue on *every* staff user's library view just to show page
  counts (Verified — no pagination, no scoping). This slows down with **global**
  data volume, not per-issue.
- **Every read is a collection scan.** There is not a single `createIndex` in the
  repo (Verified). Page loads, status polls (~every 2 s per client), and the
  worker's job-claim all scan growing, never-purged collections.
- **Publish can hard-fail.** A heavy issue's publish snapshot embeds all pages by
  value into one document and can exceed MongoDB's 16 MB limit with no guard.
- **You cannot add a second worker** (stale-sweep double-runs long jobs → corrupts
  pages/media) **or a second API instance** (in-process locks + rate-limit break).
- **The editor janks** during drag/resize at ~20–40 elements per page (client CPU).

Net: comfortable for a single-instance, small-team, moderate-volume deployment;
degrades on library/polling as total data grows; no safe horizontal path yet.

---

## Strengths (consistent across all four reviews)

1. **Deterministic geometry + one hardened write pipeline.** The LLM never emits
   coordinates; every element write flows through `validate → sanitize → refit`
   with drop-don't-throw validation and page-clamped geometry (`writePipeline.ts`).
   Malformed model output can't produce a broken page.
2. **Honest graceful degradation everywhere.** Missing photo → colour block; failed
   draft → SAFE template; failed planning → issue marked failed. It degrades
   rather than fabricating or hard-crashing. (Consistent with the fake-data review:
   this pipeline does not invent facts.)
3. **Correct optimistic concurrency.** Per-element `rev` compare-and-set folded
   into the update filter (`db.updateOneIf`) genuinely closes the lost-update class
   — better than most codebases this size.
4. **Correct atomic job claim.** `claimOne` (`findOneAndUpdate` + `$inc attempts`)
   means two workers never claim the same queued job; FIFO-fair.
5. **Good data instincts.** Page elements live in a separate `magazinePagesV2`
   collection (single page independently re-processable, docs stay under 16 MB);
   CPU-heavy work is offloaded to the worker; the editor lazy-loads pages and
   mostly uses narrow store selectors.
6. **Unusually good "why" documentation and deliberate test seams** (`processNextJob`,
   pure `mapWithConcurrency`, DB-free `planAndComposeIssue`) — though the seams are
   largely unused (near-zero tests).

---

## Cross-cutting scalability risks (each flagged by ≥2 reviewers, all verified)

### 1. Zero database indexes — every query is a collection scan *(Verified: no `createIndex` anywhere in `apps/`)*
Flagged by both the API and worker reviews. `magazinePagesV2` (scanned on every
page load + every status poll), `magazineJobs` (scanned + sorted on every 2 s
worker poll), `users` (scanned by email), `mediaAssetsV2` — all rely only on the
default `_id` index. Compounded by soft-delete tombstones that are **never**
hard-deleted, so collections accumulate dead rows forever and every scan pays to
filter them. **Cheapest, highest-impact fix in the whole system.**

### 2. The background-job retry path is dead code *(Verified: `generate.ts:567-575` catches and marks `failed` without rethrowing)*
Flagged by the pipeline and worker reviews. All four job handlers catch their own
errors and resolve normally, so the worker marks the job `done` and the
`JOB_MAX_ATTEMPTS = 3` retry **never fires**. A transient S3/LLM blip permanently
fails an issue on first error. Worse, a job that *does* throw is requeued with no
backoff and burns all three attempts in a tight zero-delay loop.

### 3. Single-process correctness ceiling — no safe horizontal path
- **API:** structural-op serialization uses an in-process `Map` lock and rate
  limiting uses an in-memory bucket. A second API instance breaks page-reindex
  atomicity and multiplies every rate limit.
- **Worker:** the stale-`running` sweep judges staleness by `startedAt` with **no
  heartbeat**, so it cannot tell a dead worker's job from a live one's. A second
  worker will requeue and **double-run** any job that outlives `STALE_RUNNING_MS`
  (default 5 min — a 120-page issue exceeds it), deleting pages the first worker is
  mid-write on. The code's own comments flag exactly this.

The stated "just run more processes" scaling story does not hold today.

### 4. "Materialize everything" write/read amplification *(Verified: `GET /issues` N+1 at `magazinesV2.ts:191-192`; per-render sanitize at `IssuePageCanvas.tsx:61`)*
The same pattern recurs at every layer: the API rewrites a page's **entire**
elements array on every single-element edit (autosave hot path) and embeds **all**
pages into one publish doc; the editor re-`map`s the whole elements array and
re-runs **DOMPurify on every text element every render** (so dragging one box on a
30-element page runs ~30 HTML parses per animation frame — no `React.memo`
anywhere); the worker buffers the **whole** source file (up to 150 MB) in memory.

### 5. Unbounded loops, polls, and growth *(Verified: `stock.ts:52-56` recurses on every 429; `store.ts:283` polls with no document guard)*
- Pexels 429 handler recurses **unconditionally** (comment says "one retry"; code
  has no depth cap) → one image slot can hang a whole single-threaded job.
- The editor's "add pages" poll has **no `issueId` guard** — navigate to another
  magazine and it overwrites *that* magazine's state for up to 180 s
  (cross-document corruption).
- Home-page generation polls **never time out**.
- The `magazineJobs` collection is **never purged** — finished jobs live forever
  under the unindexed claim scan (#1).

---

## Per-area detail

### AI generation pipeline — Scalability C / Code B
Linear-per-page with a real concurrency knob (`mapWithConcurrency`, default 2) and
no cross-page context accumulation — the right shape. Weak points: **images within
a page are sourced serially** (a 4-slot photo-grid page ≈ 4 min wall-clock; should
be `Promise.all`'d); the **source document is re-sent uncached on every per-page
call** (~134k chars for a 20-page build) with **no prompt caching**; **one premium
model** (`claude-sonnet-4.6`) is used for every call including trivial slot-filling
(no tiering); add-pages does an **O(N) serial reindex** (2×N `updateOne`s); and
add-pages is **not idempotent** on crash-requeue (duplicates pages). Zero tests
despite a DB-free seam built for them.

### API + data model — Scalability C− / Code B−
Concurrency correctness is genuinely strong (per-element rev CAS, per-issue lock,
SSRF-aware cover allowlist, never-trust-client upload verification via
`headObject`). But: **zero indexes** (#1); **`GET /issues` N+1** loads all element
payloads to count pages, with no pagination or per-user scoping (the worst
endpoint); **publish embeds all pages → 16 MB hard-limit risk** with no size guard,
then re-loads that fat doc on every public newsstand view + PDF render;
**single-process** locks/rate-limits (#3); whole-array element rewrite on the
autosave hot path (spurious 409s for two people editing different elements on the
same page). Code: 1253-line route file, hand-rolled validation (no zod), auth
preamble duplicated ~12×, `any`-typed docs, one dead collection constant
(`COL.published`).

### Worker + job queue — Scalability D+ / Code B−
Harshest grade, because horizontal scale is the whole point and it's unsafe.
Atomic claim is correct and single-worker operation is sound, but: **no heartbeat →
sweep double-runs long jobs at N>1** (the blocker, #3); **no indexes + unbounded
jobs collection** (#1); **whole file in memory (≤150 MB) + MuPDF WASM objects never
`.destroy()`'d** (pixmaps/images/structured-text/page/doc leak in the WASM heap
over a long-lived worker) **+ full-res image decode before downscale** (OOM on
large uploads); **permanent-fail/throw path leaves the issue stuck in `processing`
forever** → client hangs (the `findById` at the top of `processIssue` runs outside
the try); **retries leak media docs + orphan S3 objects** (random keys, no cleanup).
Dead retry path (#2). Event-loop-blocking synchronous rasterization (no
`worker_threads`). Code: `mapWithConcurrency` duplicated, clear-pages loop copied
3×, finalize-status logic duplicated with drift, `any` payloads, console-only
observability.

### Web editor — Scalability/Perf C / Code B−
Good data-loading architecture (lazy per-page fetch, granular PATCH, mostly-narrow
selectors, no whole-document-in-memory, no base64 bloat). But three compounding
hot-path defects: **per-drag-frame DOMPurify storm + full elements re-sort + no
`React.memo`** (#4) — O(N elements) work per pointer-move frame; **the editor shell
subscribes to the entire store** (`const s = useEditorStore()` with no selector) so
a single-box drag re-renders the whole toolbar ~60×/s; and the **generation poll
corrupts state across documents** (#5). Plus: no debounce anywhere (the native
colour picker fires a PATCH + undo entry per drag event), home polls never time
out, IntersectionObserver rebuilds on every lazy fetch, `AssetsTab` refetches media
on every `rev` bump. Code: two 420–560-line mega-units, `handleWriteError(set:any,
get:any)`, dead `screenToPage`, duplicated zIndex/new-element helpers.

---

## Prioritized roadmap

### P0 — cheap, high-impact, no redesign
1. **Add indexes on startup** — `magazinePagesV2 {magazineId,index}`,
   `magazineJobs {status,createdAt}`, `magazinesV2 {ownerId}/{updatedAt}`,
   `mediaAssetsV2 {magazineId}`, `users {email}` (include `deletedAt` in compound
   keys). *(risk #1)*
2. **Fix `GET /issues`** — denormalize `pageCount` onto the issue doc (or aggregate
   `$count`); add pagination + server-side sort. Stop loading elements to count.
   *(risk #4)*
3. **Memoize the editor renderer** — `React.memo` on `IssuePageCanvas` + a memoized
   `TextElement`, cache `sanitizeRichText` by content, pre-sort elements once. Give
   the shell narrow selectors. Kills the per-frame DOMPurify storm. *(risk #4)*
4. **Cap the Pexels 429 retry** (1–2 attempts) and **parallelize image slots within
   a page** (`Promise.all`). *(risks #5, pipeline)*
5. **Guard/cancel the generation poll** on `issueId` + add timeout caps to home
   polls. *(risk #5)*

### P1 — reliability
6. **Make the failure path real** — have handlers rethrow a retryable error class
   (so `JOB_MAX_ATTEMPTS` engages) with backoff; reconcile the issue to `failed`
   when a job permanently fails; move top-of-handler `findById` inside the try.
   *(risk #2)*
7. **Guard publish size** before the write (reject > budget) or store the snapshot
   as referenced per-page docs instead of embedding all pages.
8. **Make add-pages idempotent** (tag pages with run/job id; clear prior partial
   run) and **clean up media on retry** (deterministic keys or delete-before-write).
9. **Prompt caching** on the static system prompt + source-document block — the
   single biggest LLM-cost win — and **model tiering** (cheap model for slot-filling).
10. **Debounce continuous-control commits** (colour picker → one PATCH + one undo).

### P2 — horizontal scale (do before running >1 of anything)
11. **Worker heartbeat + owner token**; sweep on stale *heartbeat*, not `startedAt`.
    Until then, document single-worker and set `STALE_RUNNING_MS` above worst-case
    job runtime. *(risk #3)*
12. **Externalize the API lock + rate limiter** (Mongo advisory lock or Redis)
    before running >1 API instance. *(risk #3)*
13. **Worker memory** — `.destroy()` MuPDF objects, stream large sources, cap decode
    resolution; consider `worker_threads` for rasterization.
14. **Cross-job rate limiter** in front of OpenRouter / Pexels / image gen.

### P3 — code quality
15. Add tests against the DB-free seams (`planAndComposeIssue`, `layoutValidate`,
    normalization). De-dup `mapWithConcurrency`, clear-pages, finalize-status,
    zIndex/new-element helpers. Introduce zod request schemas + shared owner
    middleware. Split `store.ts`, the toolbar, and the 1253-line route file.
    Wire `JobPayloads` into dispatch; add structured job-correlated logging.

---

## Verified against source
`createIndex` absent repo-wide · `stock.ts:52-56` unbounded 429 recursion ·
`magazinesV2.ts:96-99` `pagesFor` returns full docs · `magazinesV2.ts:191-192`
`GET /issues` N+1 · `generate.ts:567-575` catch without rethrow ·
`IssuePageCanvas.tsx:61` inline `sanitizeRichText` per render ·
`store.ts:283` unconditional `set` in poll · `MagazineEditorV2.tsx:50`
`useEditorStore()` with no selector.
