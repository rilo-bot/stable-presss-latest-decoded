# Template Builder v2 (Magazine Builder v2) — Deep Review

> Multi-agent code review of the v2 generation/template subsystem. Last updated: 2026-07-24.
> Method: 10 parallel finder agents (one per dimension) → each finding adversarially double-verified
> against the real code by two independent skeptics → synthesis. 69 agents, 29 raw findings,
> **28 survived verification** (22 confirmed, 6 plausible, 1 rejected). Every High + Medium below was
> additionally re-read by hand against the source before landing here.
> Companion: [MAGAZINE-BUILDER-V2.md](./MAGAZINE-BUILDER-V2.md), [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md).

## Verdict

The generation/template path is **architecturally sound and largely production-ready in its core
invariants** — geometry stays deterministic, AI output is funneled through the same
`validate → sanitize → refit` CRUD a human uses, and env-gating degrades cleanly. The defects that
survived verification are almost all at the **edges**: the write pipeline's happy path is
well-guarded, but a couple of *rails have gaps* (a URL-validator SSRF bypass, an AI-mutable `type`
field) and the *operational envelope* is weak (a single transient error or a slow/rate-limited
external call can hang or sink a whole job, orphan pages, or duplicate work under multi-worker
scaling). Nothing here corrupts the element model itself. **Ship-blocking items are few but concrete
— fix the five High findings before relying on this at scale.**

Scope reviewed: `apps/server/src/lib/magazineV2/*` (generate, templates, layout, layoutValidate,
model, writePipeline, agent, format, stock, imagegen, url, config, jobs, rateLimit, access),
`apps/server/src/routes/magazinesV2.ts`, `apps/server/src/lib/pdf.ts`, `apps/worker/src/{queue,jobs}`,
and `apps/web/src/editor-v2/{store,api,MagazineEditorV2,EditorCanvas}`.

## Strengths (preserve these)

- **Deterministic geometry, never AI.** Fixed templates own fractional boxes → canonical px via
  `composePage`; the LLM only picks a kind and fills named slots. `PAGE_W=1275 × PAGE_H=1650` is the
  single coordinate source, verified consistent across generation, model, and config.
- **Uniform write pipeline.** Every write path (human, AI-agent, generation compose, extraction) runs
  `validateElements → sanitizeElements → refitText` (`writePipeline.ts:24`). Invalid/unknown elements
  are dropped, never thrown; `MAX_ELEMENTS_PER_PAGE`/`MAX_TEXT_HTML`/`MIN_SIZE` enforced; colors
  hex-gated; numbers clamped and `Number.isFinite`-checked (no NaN geometry).
- **AI genuinely on rails.** Agent tools stage proposals and mutate only a per-request working copy;
  `set_element_image` rejects any URL not in the media library or already on the page; the LLM never
  writes the DB. Element/user/source text is explicitly framed as DATA, not instructions.
- **Concurrency primitives that actually work.** Element writes are an atomic compare-and-set on the
  page `rev` (`updateOneIf`) → stale writers get a 409 with the fresh page (closes M13). Structural
  ops serialize per issue via `withIssueLock` + two-phase index parking (closes H1). Pages/elements are
  addressed by stable id, so a reorder can't misdirect an in-flight edit.
- **Real graceful degradation** on the surfaces done right — `draftPage`, the image curators, and
  `formatPageText` all catch and fall back (SAFE_TEMPLATE / palette color block / `{edits:[]}`).
- **Generation is correctly wired to the worker** (`generateIssue`/`generatePages` handlers exist in
  `apps/worker/src/index.ts`) — the "in-process background task" comment in `generate.ts:6` is stale
  wording, not a broken feature.

---

## Findings

Severity uses the verified/corrected severity. Line numbers are anchors, not exact spans.

### HIGH — fix before scaling

**H1 — `safeUrl`/`safePublicImageUrl` accept backslash paths (`/\host`) that resolve off-origin → SSRF bypass**
`apps/server/src/lib/magazineV2/url.ts:17-18`, `:60`
`if (value.startsWith('//')) return ''` rejects protocol-relative URLs but misses `/\host`; the next
line returns it as a "same-origin path", and `safePublicImageUrl` short-circuits on `startsWith('/')`
**before** `isBlockedImageHost` runs. WHATWG normalizes `\`→`/` under special schemes, so
`/\169.254.169.254/latest/meta-data` resolves to `https://169.254.169.254/...`. Stored via
`coerceImage`, frozen into the publish snapshot, and rendered by the server-side Puppeteer PDF export
(`pdf.ts` drives Chromium to `goto` the live `/bulletins/:id` viewer, which fetches every element
`<img>` server-side) → SSRF to the exact cloud-metadata endpoint the allowlist was written to block.
`/\evil.com/x` is also an open off-origin image load in the public viewer.
**Complementary hole (same fix area):** element image URLs go through `safeUrl`, which has **no host
allowlist at all** — a direct `http://10.0.0.1/…` or `http://169.254.169.254/…` passes with no trick.
Only the *cover* ever attempts host-blocking (`safePublicImageUrl`), and that attempt is the one H1
bypasses. Net: element image URLs have effectively no SSRF protection.
Authenticated (staff-gated) but low-privilege — a shared "editor" collaborator can reach it.
**Fix:** normalize `\`→`/` before the prefix checks (reject `^[/\\]{2}` and `^/[\\]`); run element
image URLs through `safePublicImageUrl` (not bare `safeUrl`) in `coerceImage` or at snapshot build; in
`safePublicImageUrl`, resolve `new URL(value, origin)` and run `isBlockedImageHost` on the *resolved*
host instead of trusting a leading `/`.

**H2 — Pexels 429 handler recurses forever (no retry cap) → generation hangs, issue stuck `processing`**
`apps/server/src/lib/magazineV2/stock.ts:53-56`
The comment says "one retry on rate-limit; then give up," but the code recurses unconditionally on
every 429, each recursion getting a fresh `AbortSignal.timeout(12_000)` — nothing bounds the loop.
`fetchAndStoreStock`'s try/catch can't catch a non-throwing infinite await chain, so the color-block
fallback is never reached, `mapWithConcurrency` never resolves, and the issue stays `processing`
forever. In the single-worker deployment `processNextJob` never returns, so the whole queue stalls
until manual restart.
**Fix:** thread an attempt counter, recurse at most once, then return `null` (→ palette block). Honor
`Retry-After`.

**H3 — `toPlain` strips `<br>` without a newline → `estimateLines` under-counts → silent text overflow, SAFE fallback never fires**
`apps/server/src/lib/magazineV2/layout.ts:19-31`
`TAG_RE` removes every tag including `<br>` with no separator, so forced breaks add zero estimated
lines (and adjacent tokens glue together). `fitFontSize` then picks a too-large font AND the
`validatePageLayout` overflow guard (which uses the same estimator) under-counts — so the
SAFE_TEMPLATE safety net never trips. `set_element_text` explicitly advertises `<br>` as allowed, so
this is on the mainline AI/manual edit path; text renders far taller than its box and overlaps content
below, in generated and published output.
**Fix:** in `toPlain`, `html.replace(/<br\s*\/?>/gi, '\n')` before stripping remaining tags.

**H4 — Concurrent/duplicate publish creates an orphan live bulletin that unpublish/delete can never hide**
`apps/server/src/routes/magazinesV2.ts:639-716`
The publish route is **not** wrapped in `withIssueLock` and has no rev/idempotency guard. Two racing
publishes (double-click or client retry) both read `publishedIssueId` empty and both `insertOne` a
live `builder:'v2'` bulletin; the draft records only the last id. `unpublish` (`:735`) and `delete`
(`:590`) act only on that singular id, so the second snapshot stays publicly served
(`unpublishedAt:null`) with no UI/API path to remove it — the owner believes it's unpublished. The
schema even carries an unused plural `publishedIssueIds:[]`.
**Fix:** run publish inside `withIssueLock` and re-read `publishedIssueId` inside the lock before
choosing insert-vs-update; track all snapshot ids and reconcile them on unpublish/delete.

**H5 — No job lease/heartbeat: the idle orphan-sweep requeues a job another worker is actively running**
`apps/worker/src/queue.ts:95-136` (+ `db.ts` `claimOne`)
`claimOne` stamps `startedAt` once, with no owner/lease and no refresh. `recoverOrphanedJobs` runs on
every idle tick and requeues any `running` job older than `STALE_RUNNING_MS` (5 min) via CAS on
`{status:'running'}` — which *always* succeeds because the running worker never touches status. Under
the documented multi-worker model, a >5-min extraction (a 120-page PDF easily qualifies) is requeued
and re-claimed by a second worker: both run `processIssue`, which deletes+reinserts pages (losing the
first worker's in-flight writes), duplicates `COL.media` docs + S3 uploads, and doubles LLM spend. The
"two workers never grab the same job" invariant breaks for any job outliving 5 min. Single-worker
today is safe (the sweep only runs while this process is idle, i.e. not mid-job — the code comment says
so and is correct); this **blocks horizontal worker scaling**.
**Fix:** add `workerId` + a renewable `leaseUntil`; heartbeat it forward during the run; requeue only
when `leaseUntil` is past, via CAS on the observed lease.

### MEDIUM

**M1 — One transient page failure marks the entire issue `failed` and orphans in-flight pages**
`apps/server/src/lib/magazineV2/generate.ts:551-557`
The per-page `mapWithConcurrency` callback has no try/catch; `insertComposedPage` + the
`pagesProcessed` update are raw DB writes. A single transient Mongo blip on page N rejects
`Promise.all` → the outer catch flips the whole issue to `failed`, discarding already-composed pages,
while a sibling task keeps inserting into the now-`failed` issue (orphans + counter drift). Violates
the "per-page isolation" invariant. *(Downgraded from High: content is AI-regenerable and the
start-of-regenerate cleanup self-heals orphans on retry.)*
**Fix:** wrap compose+insert per page; on error persist a SAFE placeholder or skip+count, and only
fail the whole issue if planning fails or every page fails.

**M2 — `generateMorePages`: non-atomic insert+reindex leaves mis-indexed pages while status is restored to `ready`**
`apps/server/src/lib/magazineV2/generate.ts:631-646`
New pages are inserted at temp index `1_000_000+`, then a two-phase resequence of ~2N
non-transactional `updateOne`s. A transient throw mid-loop hits the catch, which restores status to
`ready`/`draft`/`published` with **no page cleanup** — leaving phantom pages at huge indexes. `pagesFor`
only sorts by index, so the rail is scrambled/gapped and `buildPublishSnapshot` freezes the wrong
order, all presented as a healthy issue. Self-heals only on the next successful structural op.
**Fix:** resequence in a transaction, or on catch delete the just-inserted ids and re-derive a
contiguous `0..n-1` index before restoring status.

**M3 — Element PATCH merges arbitrary top-level fields, so a patch can flip `type` and discard stored variant data**
`apps/server/src/lib/magazineV2/writePipeline.ts:33-36` (route `magazinesV2.ts:1135`)
`{ ...stored, ...partial }` lets a partial carrying `type` change the element kind; `validateElements`
then rebuilds only the new kind's sub-object and drops the old one. `PATCH { patch: { type: 'image' } }`
on a headline returns 200 with an empty image element and the text content silently lost. The same
class of merge can overwrite `id`/`source`.
**Fix:** after merge, pin immutable fields from the stored element (`type`, `id`, `source`), or
whitelist the patchable keys.

**M4 — QR fg/bg taken raw from the AI palette with no contrast guard**
`apps/server/src/lib/magazineV2/templates.ts:406`
Text is defended by `readableColor`; QR is hardcoded to `fg:palette.text / bg:palette.bg` with no
check, and `normalizePalette`/`coerceQr` only validate hex format. A valid-hex low-contrast palette
(e.g. `bg#333333`/`text#111111`) ships an unscannable QR on the **required** back-cover CTA slot.
**Fix:** route QR fg/bg through the contrast helper, or swap to `#000`/`#fff` when mutual contrast is
below a QR-safe threshold.

**M5 — Generation poll clobbers the store after navigating to a different magazine (stale-closure cross-issue write)**
`apps/web/src/editor-v2/store.ts:280-295`
The self-rescheduling `tick` closes over `issueId` and unconditionally `set({issue,pages})` with no
same-magazine guard and no `clearTimeout`. Start generation on A, open B before A settles → the store
ends with `issueId=B` but `issue/pages` from A (wrong rail, 404 tab clicks, wrong publish count;
`generating` stuck true on B). Client-state only; recoverable by reload.
**Fix:** store the timer id and `clearTimeout` on `load()`; guard every `set` in `tick` with
`if (get().issueId !== issueId) return;`.

**M6 — Generation poll: unbounded retry on error leaves `generating` stuck true**
`apps/web/src/editor-v2/store.ts:291-293`
The catch branch reschedules every 2 s with no elapsed ceiling and never clears `generating`. A
persistent 404/401/5xx from `getIssue` loops a background request forever and permanently disables
Publish/Pages (gated on `!generating`) for the session.
**Fix:** apply the same `Date.now()-start < 180_000` ceiling to the catch; on giving up
`set({generating:false})` + toast; cancel the timer.

**M7 — Generation lasting >180 s reports false success with a stale rail**
`apps/web/src/editor-v2/store.ts:284-289`
The poll quits at 180 s regardless of `status`; if still `processing` it falls to the else branch →
`generating:false` + green "Pages added" toast, but the last fetch predates the server's final page
insert (`generateMorePages` inserts only at the end). Finished pages never appear until manual reload;
may induce a duplicate re-generate. Multi-agent + image builds realistically exceed 180 s.
**Fix:** treat the run as finished only when `status` leaves `processing`; on the cap while still
processing, keep polling (with backoff) or show "still working — reload to check," not success.

**M8 — PDF export hardcodes A4 (794×1123), ignoring v2 page dims (1275×1650)**
`apps/server/src/lib/pdf.ts:183-184`
Puppeteer's sheet size is hardcoded to the v1/web `794×1123px`, not the published page's own dims —
violating the doc's "sheet size from page[0] dims" promise (§8). Every generated US-Letter page
(aspect 0.773) is forced into an A4-aspect sheet (0.707) → a blank band on every exported page.
*(Downgraded from High: quality degradation, no content loss.)*
**Fix:** derive Puppeteer `width`/`height` (and the print-page CSS) from the snapshot's `page[0]` dims.

### LOW

*Layout / quality*
- **SAFE_TEMPLATE `maxLines` cap never takes effect** — `layout.ts:183`: `ElementTextData` has no
  `maxLines`, so `refitText` re-fits without it right after compose; SAFE headline/kicker line caps are
  discarded. Add `maxLines` to the model and thread it through `refitText`.
- **`estimateLines` over-counts a word whose length is an exact multiple of `charsPerLine`** —
  `layout.ts:67,73`: `1 + floor(wlen/cpl)` is one line too many at exact multiples → a possible needless
  SAFE downgrade. Near-unreachable on the generation path. Use `ceil(wlen/cpl)`. *(plausible)*

*Validation / data*
- **Partial `focalPoint` PATCH drops the un-sent axis** — `model.ts:165`: one-level merge + "requires
  both x and y" resets framing to 0.5/0.5. Reachable only via raw API (the editor sends the full image
  object). Default each axis independently, or deep-merge `focalPoint`. *(plausible)*
- **Empty/non-matching publish selection deselects every page before the 400** — `magazinesV2.ts:657-668`:
  writes `selectedForPublish:false` for all pages, then rejects. Recoverable selection-state loss.
  Validate the selection yields ≥1 page before writing.

*AI provenance / behavior*
- **Agent stock-image tools persist MediaAssets + S3 objects at stage time** — `agent.ts:266,303`:
  contradicts "nothing is persisted until applied"; rejected proposals leave orphan library assets.
  Resolve at apply-time, or reap rejected assets.
- **AI-added elements persisted as `source:'manual'`** — `magazinesV2.ts:1101`: hardcoded `source:'manual'`
  overwrites the staged `'ai-agent'` tag, destroying provenance. Latent (no UI consumes it yet).
- **`runPageAgent` throws on model/timeout despite its "never throws" docstring** — `agent.ts:396`:
  `generateText` awaited with no try/catch, so the route 500s instead of the promised no-proposal reply.
  Wrap in try/catch returning `{reply, proposals:[]}`.
- **Stored image bytes not validated as a safe raster type** — `imagegen.ts:90`, `stock.ts:65`:
  content-type trusted from the model data-URL / response header, no magic-byte allowlist. XSS-via-SVG
  is not reachable (raster models, trusted Pexels CDN); the reachable failure is a truncated/HTML
  placeholder stored as a broken image. Defense-in-depth. *(plausible)*
- **No download-size cap on external image fetches** — `stock.ts:65`, `imagegen.ts:82`: `MAX_IMAGE_BYTES`
  is enforced on uploads but not on these fetches. Impact bounded (concurrency 2, trusted URLs). *(plausible)*

*Worker*
- **Extraction handlers swallow all errors, so `maxAttempts` retry never engages** — `processIssue.ts:135`:
  handlers catch, set `failed`, and return normally → the queue marks the job `done`; only a worker crash
  consumes the retry budget. Re-throw transient IO errors; keep the in-handler catch for bad inputs only.
- **Page-retry reads a stale `issue.status` snapshot** — `processIssue.ts:253`: a successful retry on a
  `ready` issue never clears the stale `processingError`/cover. Latent (no wired UI caller). *(plausible)*

*Spec / documentation drift (code works; the doc is wrong — reconcile one side)*
- **Chat agent uses staged proposals, but doc §7/§13#4 chose direct-apply** — `agent.ts`. The code
  deliberately evolved to staging; update the doc. (Also worth reconciling with the [[studio-focus-editing]]
  direct-edit pattern used elsewhere in the app.)
- **"Undo anything" not honored** — `store.ts`: element add/delete and page-structure ops aren't on the
  undo stack (intentional, matches the reference). Soften §10.3.
- **Write rate limit is 300/min, doc §5/§9 (H5 closure) says 60/min** — `magazinesV2.ts:69`. Deliberate
  burst allowance; update the doc or lower the limit.
- **M5 attachment caps are dead constants** — `config.ts:72-74`: `MAX_AI_ATTACHMENTS` /
  `MAX_AI_ATTACHMENT_CHARS` are never referenced; the "closes M5" claim overstates enforcement (agent
  routes are text-only, incidentally bounded by message/sourceText slices). Wire them in or correct the doc.

---

## Fix first (priority order)

1. **H1 — backslash URL SSRF bypass** (`url.ts`). Security; smallest, highest-leverage fix.
2. **H2 — Pexels 429 infinite recursion** (`stock.ts`). Unblocks stuck-`processing` issues and (single-worker) a stalled queue.
3. **H4 — duplicate-publish orphan bulletin** (`magazinesV2.ts` publish route). Permanent public exposure with no removal path.
4. **H3 — `<br>` line-counting** (`layout.ts`). One-line fix that re-arms the SAFE_TEMPLATE overflow net on the mainline path.
5. **H5 — worker lease/heartbeat** (`queue.ts`). Required before any multi-worker deploy.
6. Then **M3** (type-flip data loss — trivial field-pinning), **M1/M2** (per-page isolation + atomic reindex), and **M5–M7** as one store.ts cleanup (timer ref + cancel + issue-id guard + honest terminal state).
