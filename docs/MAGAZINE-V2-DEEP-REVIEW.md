# Magazine Builder v2 — Deep Adversarial Audit

**Date:** 2026-07-28
**Branch:** `enhancement`
**Method:** 22-agent workflow — 10 area finders (read each slice fully) + 2 jugaad-census sweeps (regex + functional), then an **adversarial verifier per area** that tried to *refute* every bug/crash/scalability claim against the real code. ~1.4M tokens. 1 finding refuted and dropped.
**Scope:** `apps/server/src/lib/magazineV2`, `apps/server/src/lib/agent`, `apps/server/src/routes/magazinesV2.ts` + `agentEditor.ts`, `apps/web/src/editor-v2`, `apps/worker/src`.

> Verdict labels: **CONFIRMED** = verifier reproduced the failure path. **PLAUSIBLE** = mechanism real, trigger not fully reproduced from static reading.

---

## Executive summary — the counts you asked for

| Category | Count | Notes |
|---|---|---|
| **Regex sites total** | **46** | across 14 files |
| **— Regex jugaads** | **9** | 1 outright fragile + 8 risky-heuristic. 6 of the 9 are the *same* `/<[^>]+>/g` "parse HTML with regex" pattern reused. |
| **Functional jugaads / band-aids** | **~24 distinct** | census found 17; area finders added ~7 more |
| **Bugs** | **~15** | logic/races/stale-state |
| **Crash risks** | **5** | 3 worker OOM/stall, 1 API hang, 1 RangeError |
| **Unscalabilities** | **9** | 6× unbounded `find()`, single-process limiter, no worker heartbeat, ingest memory |
| **Security** | **3** | SSRF (IPv6), path-traversal, prompt-injection |
| **By severity** | 0 Critical · **7 High** · ~20 Medium · ~18 Low | |

**Bottom line:** the builder is functionally impressive but **not production-hardened**. There are **no data-corruption criticals**, but there is a consistent architectural habit — *catch every error and substitute a plausible-looking fake* — that turns real failures into silent, successful-looking output. That single pattern is why the recent prod incident (bad `AGENT_MODEL` slug → an all-placeholder magazine that still reported success) was possible, and it recurs ~10 times across the codebase.

---

## The 5 systemic patterns (the real story)

Individual findings matter less than these five habits. Fix the habits and most of the list collapses.

### 1. Swallow-and-fake — failures are hidden behind convincing fallbacks
The dominant anti-pattern. Errors are caught and replaced with something that *looks* designed, so nobody — user or operator — learns a step failed:

- **Worker marks failed generations as `done`** and the retry cap is dead code (`queue.ts:62` + `generate.ts`/`processIssue.ts` catch-set-`failed`-return). A transient 429 on one page permanently fails the whole issue; `maxAttempts=3` never fires. **[HIGH]**
- **`backfillDraft` fabricates copy** from the raw planner *intent* string when the copywriter call fails — the reader sees internal plumbing text like "An in-depth article on a live story in NZ thoroughbred…" and the run reports success. **[HIGH]**
- **`planPages` / plan fallback** swallow LLM errors and return **hardcoded NZ-racing pages** (`FALLBACK_ANGLES`, `FILLERS`) regardless of brief. A winery brief silently gets racecourse pages. **[MED]**
- **Image slots** degrade through user→AI→stock→**tint block** with every stage collapsing errors to `null`; a bad image-model slug or expired Pexels key yields an all-colour-block magazine marked "ready". **[MED]**
- **`buildPage`** discards the whole designed layout for `SAFE_TEMPLATE` on any QA failure, without logging why. **[MED]**
- **`formatPageText` (Fill/Adjust)** returns `{edits:[], note:''}` on failure → route 200s → user clicks Fill, gets nothing, sees no error. **[MED]**
- **`applyAllProposals`** wraps each write in `catch {}` then *always* toasts "Applied the assistant's changes." even if every write 409'd. **[MED]**

**Root fix:** distinguish "nothing to do" from "it failed". Rethrow (or return typed failures), attach a per-issue generation-warning when a configured provider fails all slots, and let the queue's retry path actually run.

### 2. Truncate-and-pretend — "build from your document" only reads the first few pages
Magic-number slices silently drop most of a long source while the UI claims the issue was built from it:

- Planner sees `source.slice(0, 14000)`; every page's copywriter sees `source.slice(0, 6000)`; the editor agent uses `slice(0, 8000)`; the system prompt is hard-cut at `16000`; ingest caps verbatim text at `80000`. The route *accepts* 60,000 chars then truncates to 14k. **A 60k-char report → ~77% invisible to the planner, back-half stories never written.** **[HIGH]**

**Root fix:** chunk/segment the source per planned page (or summarise the full text into a bounded outline) instead of a single head-slice; surface a coverage note.

### 3. Load-everything — unbounded queries, no indexes, not horizontally scalable
The raw-driver `find()` wrapper always `.toArray()`s with no limit/projection, and several hot paths materialise whole collections:

- `getHorseDossier` loads **~7 entire collections** per request to return 25 rows of each; guest-reachable, no rate limit. **[HIGH]**
- `GET /issues` loads the **entire issues collection** and sorts in JS (index unused). **[MED]**
- `uniqueSlug()` pulls **every issue doc** on every create/generate/upload just to read `.slug`. **[MED]**
- `GET media` / `GET uploads` load **all** media rows (incl. up to 80KB `sourceText` each) then filter `kind` in memory. **[MED]**
- Agent media tools load the **whole media library** for an O(1) URL existence check. **[MED]**
- The rate limiter is a **per-process `Map`** — with 2+ instances the real limit multiplies and resets every deploy. **[LOW→scaling blocker]**

**Root fix:** push filters/limits/projections into Mongo, add the missing indexes, and back the limiter with Redis/Mongo-TTL before scaling out.

### 4. Uncatchable crash surface — the worker and API can go down, not degrade
- **Worker OOM, no page-dimension cap:** a 4KB PDF declaring MediaBox `[0 0 14400 14400]` makes `toPixmap` allocate a ~30000×30000×3 ≈ **2.7 GB** pixmap → **WASM abort is not a catchable JS exception** → the whole worker process dies, killing every in-flight job. `try/catch` does **not** save it. **[HIGH crash]**
- **Embedded images decoded at full native resolution** (no downscale matrix) — a 9000×6000 JPEG → ~162MB transient per image, several concurrent → OOM. **[MED crash]**
- **MuPDF WASM objects never `.destroy()`d** (page/pixmap/stext/masks) — gradual leak that may OOM mid-issue. **[MED]**
- **LibreOffice DOCX→PDF has no timeout** — a hung `soffice` never resolves; the issue is stuck `processing` forever and the worker slot is consumed until restart. **[MED]**
- **Async Express handlers are unwrapped** — Express 4 ignores a returned rejected promise, so a transient Atlas blip makes the request **hang** (no 500 ever sent) instead of erroring cleanly. **[HIGH]**
- **`withTimeout` can't abort `pdf-parse`** — after the 30s timeout rejects, the CPU-bound parse keeps spinning on the single event loop (decompression-bomb PDF → stalls all requests on that instance). **[MED crash]**

**Root fix:** clamp raster scale to a max edge in px; downscale embedded-image decodes; `try/finally`-`destroy()` WASM objects; add a `soffice` kill-timeout; wrap handlers in an `asyncHandler`→`next(err)`; run `pdf-parse` in a killable worker thread.

### 5. Client races & unbounded polls — the editor loses edits and spins forever
- **CRUD reconcilers merge into whatever page is open *after* the await**, not the page the write targeted — add an element on page A, click page B before it returns, and the element lands on B, B's `rev` is overwritten, B's next write 409s. **[HIGH]**
- **Rapid same-element edits** race on a stale captured `rev` → the 2nd write 409s and is discarded with only a "please redo" toast. **[MED]**
- **`sendChat` page-hop** (just added): switch pages while the assistant is thinking and the reply lands in the new page's chat while `proposalsPageId` no longer matches → proposals render but Apply does nothing. **[MED]** *(see note below — this is in code from this session)*
- **`watchGeneration` / `generatePages` catch-branches re-arm the poll with no elapsed cap** and (watchGeneration) no post-await `issueId` re-check → on a persistent 5xx the spinner never clears and an old issue's data can clobber a newly-opened one. **[MED]**
- **No fetch timeout/abort anywhere** → a hung LLM POST leaves `chatBusy` stuck until reload. **[MED]**
- **Uncontrolled Inspector fields** (`defaultValue` keyed by element id): an AI/undo edit to the selected element doesn't re-seed the box, and a later focus+blur commits the *stale* value, silently reverting the AI edit. **[MED]**

**Root fix:** capture `pageId`/`issueId` at call start and guard every reconciler + poll write with an identity check; serialise per-page writes; add the elapsed cap to both catch branches; attach `AbortSignal.timeout`; make the edited fields controlled.

---

## Full findings — severity-ranked

### HIGH (7)

| # | Area | Finding | Location | Verdict |
|---|---|---|---|---|
| H1 | worker-pipeline | Handlers catch-and-return → failed generations marked job `done`; `maxAttempts` retry is dead code; one page's transient error fails the whole issue | `apps/worker/src/queue.ts:62` (+ `generate.ts`, `processIssue.ts`) | CONFIRMED |
| H2 | worker-media | No page-dimension cap → adversarial/large-format PDF OOM-crashes the worker (uncatchable WASM abort) | `apps/worker/src/lib/pdf.ts:376` | CONFIRMED |
| H3 | server-routes | Async route handlers unwrapped → a DB/storage rejection **hangs** the request instead of 500 | `apps/server/src/routes/magazinesV2.ts:189` | CONFIRMED |
| H4 | agent-tools | `getHorseDossier` loads ~7 full collections into memory per request; guest-reachable | `apps/server/src/lib/agent/tools.ts:209` | CONFIRMED |
| H5 | web-store | CRUD reconcilers merge into whatever page is open after the await, not the target page | `apps/web/src/editor-v2/store.ts:229` | CONFIRMED |
| H6 | gen-core | Every page's copywriter sees the same first-6000-char slice; source past 6k never drafted | `apps/server/src/lib/magazineV2/generate.ts:439` | CONFIRMED |
| H7 | gen-core | `backfillDraft` fabricates headline/body from the raw intent string on copywriter failure (reads as internal text) | `apps/server/src/lib/magazineV2/generate.ts:494` | CONFIRMED |

### MEDIUM (selected — 20)

| # | Area | Finding | Location | Verdict |
|---|---|---|---|---|
| M1 | gen-core | Planner reads only first 14k of a 60k source; rest dropped | `generate.ts:256` | CONFIRMED |
| M2 | gen-core | `FILLERS` pads short plans with hardcoded NZ-racing pages | `generate.ts:184` | CONFIRMED |
| M3 | gen-core | `generateMorePages` two-phase reindex non-atomic → interrupted reorder strands pages at index 2,000,000+ | `generate.ts:1151` | CONFIRMED |
| M4 | layout | Text-width model underestimates non-ASCII glyphs (em-dash, ellipsis, curly quotes, CJK) → overflow passes QA | `fontMetrics.ts:118` | CONFIRMED |
| M5 | templates | `isBlockedImageHost` misses IPv4-mapped IPv6 (`::ffff:…`) → **SSRF** to loopback/cloud-metadata | `magazineV2/url.ts:44` | CONFIRMED |
| M6 | templates | Agent media tools load the entire media library for a single-URL check | `magazineV2/agent.ts:176` | CONFIRMED |
| M7 | server-routes | `GET /issues` full-scans + JS-sorts the whole collection | `magazinesV2.ts:191` | CONFIRMED |
| M8 | server-routes | `uniqueSlug()` materialises the whole issues collection per create | `magazinesV2.ts:135` | CONFIRMED |
| M9 | server-routes | `GET media`/`uploads` load all docs incl. 80KB sourceText, filter in memory | `magazinesV2.ts:423` | CONFIRMED |
| M10 | server-routes | status→`processing` before `enqueueJob`, no compensation → failed enqueue strands issue busy | `magazinesV2.ts:1192` | PLAUSIBLE |
| M11 | agent-ingest | `AGENT_MODEL` unvalidated + doubles as OCR/vision model (the recent-incident class) | `agent/provider.ts:16` | CONFIRMED |
| M12 | agent-ingest | `withTimeout` can't abort `pdf-parse` → CPU-bound stall of the single process | `documentIngest.ts:114` | PLAUSIBLE |
| M13 | agent-ingest | `/ingest` buffers 50MB body + all page buffers, no per-instance concurrency cap → OOM under simultaneity | `documentIngest.ts:267` | PLAUSIBLE |
| M14 | agent-tools | All agent search/list tools full-load collections; guest-reachable; **no rate limit on `/api/agent`** + paid LLM call per turn | `tools.ts:172` | CONFIRMED |
| M15 | worker-pipeline | Orphan sweep has no heartbeat → with 2+ workers it requeues & double-runs a live job | `queue.ts:95` | CONFIRMED |
| M16 | worker-media | Embedded images decoded at full native resolution, no cap | `pdf.ts:531` | PLAUSIBLE |
| M17 | worker-media | MuPDF WASM objects never `.destroy()`d → leak | `pdf.ts:366` | PLAUSIBLE |
| M18 | worker-media | LibreOffice DOCX→PDF has no timeout → hung `soffice` hangs job forever | `docx.ts:42` | CONFIRMED |
| M19 | web-store | `watchGeneration` no post-await issueId re-check → old issue clobbers new; catch re-arms with no elapsed cap (infinite poll) | `store.ts:520`, `531` | CONFIRMED |
| M20 | web-store | `sendChat` page-hop: reply/proposals from the old page bleed into the new page, un-appliable | `store.ts:553` | CONFIRMED |

*(Plus: rev-race lost edit `store.ts:209`; `applyAllProposals` swallow+success `store.ts:621`; no fetch timeout `lib/api.ts:25`; Inspector stale fields `Inspector.tsx:110`; imagegen data-URL always base64-decodes → corrupt image `imagegen.ts:88`.)*

### LOW (selected — 18)

`align` advertised to the LLM but ignored by the solver (`solveLayout.ts:152`) · `repairStackLayers` can exceed `MAX_TREE_DEPTH` (`layoutSpec.ts:222`, benign) · image sourcing "configured-but-failing" indistinguishable from "not configured" (`generate.ts:604`) · `change_text_to_image` stages delete before image confirmed (`agent.ts:363`) · agent source truncated to 8000 with no notice (`agent.ts:136`) · upload endpoints double-count the rate limiter (`magazinesV2.ts:581`) · publish has no per-issue lock → concurrent publish orphans a snapshot (`magazinesV2.ts:833`) · 40-char scanned/text PDF threshold misroutes short text PDFs to OCR (`documentIngest.ts:397`) · image both-reads-failed → 422 (non-retryable) instead of 502 (`documentIngest.ts:430`) · `updateMyParty` interpolates LLM `partyId` into a path unencoded (path-traversal, RBAC-bounded) (`tools.ts:552`) · uploaded-doc digest + client pageContext concatenated raw into the system prompt (**prompt-injection**, staff-only) (`editorPrompt.ts:107`) · system prompt hard-truncated at 16000 drops a whole attachment (`editorPrompt.ts:127`) · `processPageJob` can flip an issue `ready` from a stale doc ignoring `pending` pages (`processIssue.ts:251`) · `Math.max(...gaps)` spread RangeError on a ~150k-glyph line (`pdf.ts:124`) · editor overlay ignores element rotation (`EditorCanvas.tsx:265`) · `parsePageCount` picks the largest match then rejects >16, dropping an explicit valid count (`MagazineV2Home.tsx:38`) · attachment-preview close by filename equality breaks on dup names (`AiPanel.tsx:199`) · `artDirectPage` seed fallback re-creates identical layouts on sustained failure (`generate.ts:944`).

---

## Regex census — 46 sites, **9 jugaad-grade**

37 of 46 are robust (hex-colour validators, entity decoders, whitespace splits, slugify, font-subset strip, https/mailto guards, IPv4 SSRF parse). The 9 non-robust:

| File:line | Pattern | Purpose | Verdict | Breaks on |
|---|---|---|---|---|
| `generate.ts:474` | `/[.!?—:]/` | split intent to get a fallback headline | **fragile-jugaad** (MED) | "Growth hit 3.5% overall" → "Growth hit 3"; "the U.S. market" → "the U" |
| `agent.ts:50` | `/<[^>]+>/g` | strip HTML for preview | risky (LOW) | `title="a>b"` closes the tag early |
| `agent.ts:66` | `/<[^>]+>/g` | empty-text test | risky (LOW) | `<img>`→'' (empty); `&nbsp;` survives |
| `format.ts:69` | `/<[^>]+>/g` | HTML→plain | risky (LOW) | `>` inside an attribute |
| `layout.ts:20` | `/<[^>]+>/g` | tag-strip for measurement | risky (LOW) | `>` inside an attribute |
| `magazinesV2.ts:1408` | `/<[^>]+>/g` | is-element-empty test | risky (LOW) | `&nbsp;`-only / `<img>`-only misclassified |
| `imagegen.ts:88` | `/^data:([^;,]+)?(?:;base64)?,(.*)$/s` | parse data-URL | risky (LOW) | `;charset` param between type and `;base64` |
| `documentIngest.ts:190` | `/timed?\s*out/i` | detect timeout by message | risky (LOW) | "Request aborted" / "deadline exceeded" → 500 not 504 |
| `MagazineV2Home.tsx:33` | `/\b(\d{1,2}|…)[-\s]*pages?\b/gi` | parse page count from brief | risky (LOW) | "120-page" / "1,000 pages" don't match |

**The recurring regex jugaad:** the same `/<[^>]+>/g` "strip HTML with a regex" appears **6 times** (agent.ts ×2, format.ts, layout.ts, magazinesV2.ts). It's used to decide whether a text region is empty and to measure text — an HTML parser (or storing plain text alongside the HTML) belongs there. Low individual severity, but it's the clearest "regex where structured parsing belongs" cluster.

---

## Functional-jugaad census (17 from the dedicated sweep)

1. `backfillDraft` fabricates copy from intent (HIGH) — `generate.ts:494`
2. Source truncation caps 6k/14k/8k/16k (HIGH) — `generate.ts:256`
3. `imagegen` data-URL always base64-decodes → corrupt image (MED, bug) — `imagegen.ts:88`
4. Free-form JSON via first-`{`/last-`}` slice for the art-director spec (MED) — `generate.ts:810`
5. `FILLERS` hardcoded racing pad (MED) — `generate.ts:184`
6. `planPages` swallows → `FALLBACK_ANGLES` racing pages (MED) — `generate.ts:352`
7. Image slots degrade to flat palette block (MED) — `generate.ts:591`
8. `buildPage` swaps to `SAFE_TEMPLATE` on any QA failure, no log (MED) — `generate.ts:648`
9. `formatPageText` Fill/Adjust swallows failure → empty edits (MED) — `format.ts:89`
10. `DOMAIN_CONTEXT` hardcodes NZ racing into every prompt (MED) — `generate.ts:80`
11. `artDirectPage` seed fallback → identical layouts (LOW) — `generate.ts:944`
12. Pexels 429 → single guessed retry + fixed 1500ms sleep (LOW) — `stock.ts:56`
13. Scanned-vs-text decision on magic 40-char threshold (LOW) — `documentIngest.ts:397`
14. `isTooSparse` magic "<2 meaningful elements" (LOW) — `generate.ts:520`
15. `pruneSpec` FR-GUARANTEE promotes a child to hide empty-leaf gaps (LOW) — `pruneSpec.ts:71`
16. `generateMorePages` `|| default` chains + on-the-fly theme re-synthesis (LOW) — `generate.ts:1113`
17. In-memory single-process rate limiter (LOW→scaling blocker) — `rateLimit.ts:17`

*Area finders added:* non-ASCII width underestimate (`fontMetrics.ts:118`), `align` dead knob (`solveLayout.ts:152`), image-sourcing observability gap (`generate.ts:604`), `AGENT_MODEL` unvalidated (`provider.ts:16`), 422-vs-502 image path (`documentIngest.ts:430`), prompt-injection digest (`editorPrompt.ts:107`), poll-no-cap + applyAllProposals-swallow (`store.ts`).

---

## Prioritised remediation roadmap

**P0 — stop silent failure & crashes (do before scaling or heavy use)**
1. H1 — make the queue's retry real: rethrow/typed-failure so `maxAttempts` runs; only retry transient errors; add backoff. Also don't fail the whole issue on one page's error.
2. H2 + M16 — clamp raster scale to a max edge (px) and downscale embedded-image decodes; this is the concrete worker-OOM crash.
3. H3 — wrap all async routes in `asyncHandler`→`next(err)` (or move to Express 5).
4. Swallow-and-fake surfacing — attach a per-issue generation-warning when a configured image/copy provider fails all slots; stop `formatPageText`/`applyAllProposals` reporting success on failure.

**P1 — correctness & data-loss**
5. H5 + rev-race — guard every store reconciler with a captured-`pageId` identity check; serialise per-page writes.
6. H6 + M1 (truncate-and-pretend) — per-page source windowing instead of head-slices; coverage note.
7. M3 — single `bulkWrite`/transaction for the page reindex.
8. M18 — `soffice` kill-timeout; M12 — killable `pdf-parse` worker thread.
9. M20 + M19 — page/issue identity guards + elapsed caps on the polls (the `sendChat` page-hop from this session is in scope).

**P2 — scalability & hardening**
10. Push filters/limits/projections into Mongo for `GET /issues`, `uniqueSlug`, media/uploads, `getHorseDossier`, agent tools; add missing indexes.
11. Redis/Mongo-TTL rate limiter; add a limiter to `/api/agent`; per-instance ingest concurrency cap.
12. Worker heartbeat so the orphan sweep can't double-run (M15); `processPageJob` re-read before flipping `ready` (LOW).
13. Security: fix `::ffff:` SSRF bypass (M5); `encodeURIComponent` + allowlist `partyId` (LOW); fence untrusted digests in a data block (LOW).
14. Make domain configurable (drop hardcoded racing in `DOMAIN_CONTEXT`/`FILLERS`/`FALLBACK_ANGLES`) — **this is exactly WS4** of the current enhancement effort.

---

## Note on code added this session

Two Medium findings touch the page-targeting feature added earlier today:
- **M20** — `sendChat`'s new page-hop can bleed a reply/proposals into the wrong page if the user switches pages mid-request. Real gap in the just-added code; the fix is a post-await `get().currentPageId !== captured` guard.
- The rev-race / reconciler-wrong-page (H5, M-rev) are **pre-existing** but the page-hop makes mid-request page switches more likely, so they're worth fixing together.

Overlap with the in-flight enhancement plan: **WS4** (drop hardcoded racing) directly addresses items #10 (DOMAIN_CONTEXT), FILLERS, FALLBACK_ANGLES. WS1's never-blank work is *related to* H7/backfill but the audit's point is that never-blank should not mean never-signal-failure.
