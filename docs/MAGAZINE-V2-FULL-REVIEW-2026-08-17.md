# Magazine Builder v2 — Full-Feature Review (2026-08-17)

Six parallel deep-dives over the whole feature: generation pipeline, layout engine, quality gates,
reference-image path, studio client, and plan-vs-reality reconciliation. Branch `day-work`, clean tree,
295/295 tests green, all 7 `check:*` guards present. Client complaint driving the review: **"it's not
working how we want."**

## The verdict in one paragraph

The architecture is sound and the code tracks the locked plan section by section — the vague commit
names ("fully freedome") hide plan-faithful work, not drift. The reason output still disappoints is
concentrated in five gaps: (1) **nothing ever looks at a page** — every check is arithmetic, no render,
no vision pass, and a legal-but-ugly page always ships (best-of-3-with-flaws wins); (2) the **whitespace
complaint has an exact open mechanism** — fr tracks always fill, the pruner force-promotes fr, and the
fit report's per-box 6% slack threshold lets many small bands each slip under it while `emptyShare` is
computed and consumed by nobody; the known band-height fix is built nowhere; (3) **type hierarchy
silently flattens** — silent shrink to 70% is never a flaw, overflow is never a flaw, and an oversized
headline has NO check at all (fontPt clamps at 220pt; per-role ceilings unbuilt); (4) **everything after
generation is unchecked** — manual edits, chat-agent edits, and the template fallback (the destination
for every AI failure) see at most the 3 catastrophe checks, and publish is gated by human approval only;
(5) the **studio client sabotages the experience independently of page quality** — the progress counter
is unreachable, scroll silently wipes staged AI proposals and retargets the assistant, and failed edits
stay painted on the canvas while publish freezes the stored (different) page.

---

## 1. How generation actually works today (verified trace)

Default path is AI layout (`MAGAZINE_V2_AI_LAYOUT` is opt-OUT, generate.ts:953-959).

1. **Editorial Director** `planIssue` (generate.ts:243-315) — structured plan: title, palette, fonts,
   ordered page kinds. Source via `retrieveSource` (14k-char representative sample).
2. Pages composed concurrently 2 at a time (generate.ts:64, 1474), each `composeOnePageAI` (:1281),
   **≤3 attempts** (:966):
   - **Art Director** `artDirectPage` (:1098-1277) — free-form JSON at temp 0.95, 150s timeout,
     emits a relative frame-tree (fr weights / `sizing:'content'`), never pixels. Parse/timeout
     failure → canned `seedSpecFor(kind)` (:1270-1276) which **breaks the retry loop** (:1350, :1388).
   - Pre-solve WITHOUT measurement (`buildPseudoTemplate`, :983-1028) → slots.
   - **Copywriter** `draftPage` (:443-572) with measured char budgets (`charBudget`,
     fitReport.ts:312-326); on layout retries copy is re-flowed by role, not rewritten (:586-628).
   - Deterministic tail `composeSpecToPage` (:1050-1085): curateFills → `pruneLayoutSpec` →
     **re-solve with `makeMeasureLeaf`** (the 8,256-line metrics finally used — but only for leaves
     the model tagged `sizing:'content'`, solveLayout.ts:111) → `composeFromSolved` →
     `fitReport` (:1077, always) → `validatePageLayout` (:1078).
   - Accept/retry (:1342-1392): `seriousFlaws === 0` → accept; flaws → retry with `fitHint`
     measurements injected into the next art-director prompt (:1339-1356 — **the feedback loop the
     plan asked for EXISTS**, but attempt 1 is always blind and after 3 attempts the best flawed
     page ships anyway).
3. No legal page → fixed-template path (:1400) → possibly `SAFE_TEMPLATE` (:888-890).
   Furniture appended after all QA (:934-943), unvalidated by design.

## 2. Why pages look the way they do — ranked root causes

### A. Whitespace / "more space than elements" (the client's core complaint)

- **fr always fills**: all leftover length goes to fr tracks unconditionally (solveLayout.ts:141-148),
  and `pruneSpec.ts:95-103` force-promotes the last prose child of a start-packed container to fr on
  the generator path (`keepWhitespace` only set by the reference path). One caption can inherit the
  whole leftover strip.
- **The aggregate-slack blind zone**: `SLACK_SERIOUS_SHARE = 0.06` is per-box (fitReport.ts:54).
  Eight bands each wasting 5% = ~40% blank-inside-boxes = **0 flaws** → accepted attempt 1
  (generate.ts:1348-1350). This is exactly the 2026-08-16 Fix-1c finding ("every loose verdict is
  many small text bands") — the band-height fix is **built nowhere** (no minimum track height, no
  small-band merging, generation or reference path).
- **`emptyShare` is write-only**: total spacer area computed (fitReport.ts:271-272), consumed by
  nothing in the tree. No page-level whitespace gate exists.
- **Cross-axis waste invisible twice**: solver gives every child the full crossLen — container
  `align` is accepted by the schema and coerced but never read (layoutSpec.ts:390,
  solveLayout.ts:191-193); the report measures slack as height-only at full width
  (fitReport.ts:210-221), and CPL only for body/entry/pullquote (:36, 225-245). A one-line label
  spanning 1168px scores 0% slack.
- **Retry hint mutes the signal**: `fitHint` caps at 6 findings and ranks slack 6th of 7
  (fitReport.ts:282-296) — on a busy report the whitespace findings are the first cut.
- **`justify` is dead when any child is fr** (solveLayout.ts:94,150,174-180) and `align` is inert —
  the model "fixes" a slack finding with `justify:'center'`, the solver ignores it, a retry is burned
  on a no-op.

### B. Type hierarchy silently flattens

- `overflow` is never a serious flaw and `SHRUNK_AT = 0.7` (fitReport.ts:344-350, :60): every leaf
  can render up to 30% below its designed size with zero feedback — a 48pt headline at 34pt page-wide.
- **Oversized headline has NO check**: fontPt clamps at 5–220pt (layoutSpec.ts:63-64); `shrunk` fires
  on the opposite defect. The plan's per-role maximums are unbuilt.
- Measurement is model-opt-in: `measureLeaf` fires only for `sizing:'content'` leaves
  (solveLayout.ts:111); untagged leaves are guessed fr fractions.
- Overfull content-sized columns are scaled proportionally (solveLayout.ts:125-129) → every band on
  the page cramped at once.
- `fontPt` below the floor: box measured at the asked size, type raised to the floor afterwards
  (measureLeaf.ts:44 vs composeFromSolved.ts:80-82) → guaranteed overflow/clipping.
- Write-path floor regression: `refitText` falls back to 55%-of-ceiling for elements without
  `minFontSize` (layout.ts:227) — a hand-made 24px body can refit to 6.3pt on save.

### C. Nothing evaluates "good", and nothing re-evaluates ever

- Hard gates are still the 3 catastrophe checks (layoutValidate.ts:50-106); same-type overlap only,
  ≥50%-of-page images exempt as "background", cross-type overlap exempt by rule.
- Density gate counts elements, never area (pageDensity.ts:68-72).
- **A legal page is never rejected for flaws** — flaws only buy retries; best-of-N ships.
- The fixed-template fallback (the destination for every AI failure) gets NO fit report and NO
  density gate (generate.ts:883, :1335) — the worst pages get the least scrutiny.
- **Post-generation writes are never re-checked**: manual element writes, the chat agent, and format
  route go through writePipeline only (validate→sanitize→refit). White-on-white via edit, drag-induced
  overlaps: permanent. Publish gate is human-freshness only (publishGate.ts:40-70).
- Contrast repair guesses every photo is dark (`bgBehind` → `#1a1a1a`, composeFromSolved.ts:145);
  contrast floor 3.5:1 for ALL text incl. 9.5pt body (layout.ts:197).
- Zero cross-page awareness — pages composed concurrently, "no two pages share a skeleton" is
  unverifiable prompt hope (generate.ts:1130-1131).
- The §10.4 rendered-pixel harness — the plan's own "disqualifying gap" — remains unbuilt and blocks
  Phase 2 (the critic). Beauty is evaluated nowhere; this is unchanged from the plan's diagnosis.

### D. Why 295 tests stay green through all of this

Nothing imports generate.ts; all test inputs are synthetic SolvedLayouts pinning the checks' own
thresholds; nothing renders; the check vocabulary is closed (a failure outside the 8 finding kinds +
3 catastrophes has no function to test). Guards check code patterns, not output.

## 3. Reference-image path (post R-fixes state)

Verdicts on the audit findings: IoU full-bleed floor **FIXED** (`isGuaranteed`, vetoes,
layoutFidelity.ts:126-144, 197-201; `check:fidelity` exists). 96px offset ceiling **FIXED
mechanically** (pad as raw px, readingToSpec.ts:149-175) but the lower-third cover still verdicts
"loose" (42.3% < ADAPTED_AT 0.45) because of band height. Position idioms 3 of 4 closed; residuals:
offsets ≤25% of axis still redistributed as fr stretch (:157), `placeOne` anchors vertically only
(:345-347), images lose horizontal position. `themeForPage` blanking **FIXED**, but dark-ink-over-
retained-dark-photo is still producible (applyLayout.ts:144 treats image grounds as #ffffff while
:423-425 can keep the photo). Named-page-from-chat **BUILT** (agent.ts:370-428, server-resolved
ordinal). Still open: R-Fix 4 (spacer leaves spend the 28-leaf budget depth-first → silent bottom-band
deletion blamed on the user's content), R-Fix 5 (MAX_REGIONS still = MAX_LEAVES), the content-
destruction trio in `reflowContent` (spare prose to FIRST body slot not largest :332, unused
background counted as user loss :341, background scan unshifted above user photos :246), no preview/
dry-run, no batch, no PDF reference, rearrange-only. New nits from the fixes: `tightSlots` drops
unmatched overflows silently (applyLayout.ts:457-475); `flatten` always reserves 2 slots even with no
spacer (readingToSpec.ts:451).

**Correction to prior notes: `applyLayout.ts` no longer contains a raw NUL byte** (it's the ` `
escape at :241, greppable). The literal NUL now lives in docs/MAGAZINE-V2-REFERENCE-AUDIT-2026-08-15.md
(~offset 25147), which ripgrep flags binary.

## 4. Studio client (never opened in a browser — and it shows)

`check:hooks` passes (353 files clean). Ranked:

1. **Progress UI defeated by its own flag**: `watchGeneration` sets `generating:true` for initial
   builds (store.ts:975) and the editor passes it as `isAdding` (MagazineEditorV2.tsx:510, :575),
   which forces the indeterminate "Adding your new pages" state (buildStatus.ts:84-88). The honest
   "3 of 10" counter — the point of the waiting-states work — is unreachable on the primary path.
2. **Scroll-settle picker wipes staged AI proposals** (EditorCanvas.tsx:482-504 → `openPage` resets
   proposals, store.ts:365-366) and **retargets the assistant** at whatever page is nearest viewport
   centre (store.ts:1082-1089). First-class "it's not doing what I ask" generators.
3. **Optimistic edits never reverted on non-409 failures** (store.ts:409, :1244): 403/400/429/network
   → phantom edit stays painted; publish freezes the stored, different page. 429 is reachable by
   holding an arrow key (one commit per keydown ≈ 33/s vs 300 writes/min).
4. **Delete/Backspace is unrecoverable** — element deletion is outside the undo stack (store.ts:8,
   EditorCanvas.tsx:247).
5. **Both polls end dishonestly**: `generatePages` toasts "Pages added" on its 180s timeout while
   still processing (store.ts:566-572); `watchGeneration` stops at 300s with the banner up and
   nothing polling (:984-991).
6. **Overset text silently clipped with no editor indicator** (`overflow:hidden`,
   IssuePageCanvas.tsx:28) — in editor AND publish; empty slots get dashed hints, cut copy gets nothing.
7. `watchGeneration` tick writes state unguarded after await → cross-magazine overwrite (store.ts:980).
8. Chat-driven layout rebuild of a non-open page updates the rail thumb but not the canvas preview
   (separate caches, store.ts:781 vs EditorCanvas.tsx:442-455).
9. QR links live inside canvas previews (EditorCanvas.tsx:554-559 lacks the pointer-events guard
   PageRail.tsx:176 has). 10. Rotated elements: render vs hit-test disagree (IssuePageCanvas.tsx:26 vs
   EditorCanvas.tsx:335-421). 11. `locked` has no UI. 12. `pctRect` NaN on 0-dim pending pages
   (geometry.ts:13-19). 13. Extracted-text edit overlay wraps differently than render
   (pre-wrap vs pre). 14. Inspector textarea exposes raw HTML (markup soup, Inspector.tsx:267).
   15. Failed chat turns not persisted server-side → transcript shown ≠ stored. 16. `startBlank`
   double-click → two magazines (MagazineV2Home.tsx:124-132). 17. Rename on unchanged blur bumps
   `updatedAt` → false `needs_republish`. 18. View-only UI is dead code that would 404.

Rendering fidelity is structurally strong: ONE renderer (IssuePageCanvas) serves editor, reader, and
Puppeteer PDF.

## 5. Plan vs reality

**ALIGNED.** e04d5c0 ("AI magazine - with the fully freedome") IS Phase 0 + spacer + 1.5a + 1 and
created the plan doc; §2b records the client's explicit reversal to "AI decides everything" — the
freedom granted is design freedom (pt/hex/tracking/spacing/depth), never pixel freedom; `solveLayout`
remains the sole coordinate authority everywhere checked. e04cdf5 = the §4c-ii tightenings.
924e1da = R-fixes + audit doc + §8.4 (plan's §8 table is stale — 8.4 IS built). Unbuilt: Phase 1.5b
composite modules, §10.4 render harness (blocks Phase 2), Phases 2–5, R-fixes 4/5, band height.

## 6. Recommended fix order (highest quality-per-effort first)

1. **Band height** — one mechanism, both paths: minimum track heights / merge many-small-bands in the
   solver, and feed `origin` reference heights into content-sized bands on the reference path. This is
   the single fix behind every measured "loose" page.
2. **Aggregate whitespace gate** — sum slack across boxes + consume `emptyShare`; make page-level
   waste a serious flaw; stop ranking slack last in `fitHint`.
3. **Count what's silent** — `overflow` and deep-`shrunk` as flaws (or at least surfaced); per-role
   type maximums (the oversized-headline gap); make `sizing:'content'` the default for text leaves
   instead of model-opt-in.
4. **Studio quick wins** (each small): fix the `isAdding` flag; don't wipe proposals on scroll-settle
   (or pin the agent's target page visibly); revert optimistic state on non-409; overset-text
   indicator; make delete undoable; honest poll timeouts.
5. **§10.4 render harness** — the strategic unlock. Until something renders a page and looks at it,
   "beauty evaluated nowhere" stays true no matter how many arithmetic checks are added, and Phase 2
   (the critic) stays blocked.
6. **Reference-path honesty batch** — R-fixes 4/5, `{preview:true}` on apply (function is pure),
   contrast vs retained background photos, the content-destruction trio.

---

# PART 2 — Second pass (same day): the stall, the AI's access, redundancy & scale

Three more verification agents, run after the user reported: "builds 5-6 of 10 pages then shows
loading until refresh", "the AI is not smart and has minimal access, not the full magazine", and
"so many redundant fixes — we want scalable".

## 7. The 10-page stall — root cause CONFIRMED with arithmetic

**#1 The client poll gives up at 300s while a 10-page build takes 5.5–13 minutes.** Per page:
art director ≤150s × up to 3 attempts + copywriter ≤120s + image curation; 2 concurrent lanes
(generate.ts:64, :1474) → 10 pages = 5 serial per lane ≈ 330–780s total. `watchGeneration` polls
1.5s but only while `< 300_000` (store.ts:984); at the cap each lane has done ~1.8–4.5 pages →
**4–9 visible, typically 5–6**. At expiry (store.ts:986-991): poll stops, `generating:false`,
`justGenerated:true`, NO toast — but the banner derives from `status==='processing'` so it stays
up forever with nothing polling. Server keeps inserting pages (each inserted + `pagesProcessed`
bumped as it composes, generate.ts:1476-1479, and the poll DOES stream them while it runs).
Refresh works because `load()` re-arms the watch (store.ts:337). **Refresh = resume; no refresh =
frozen at 5-6.**

**#2 Add-pages is worse**: 180s cap then toasts a fabricated **"Pages added"** (store.ts:566-572);
real failures also toast success because the server restores status to `'ready'` with only
`processingError` set (generate.ts:1587-1590), which the client's `=== 'failed'` test misses. And
`generateMorePages` inserts ALL pages at the end (generate.ts:1564-1578), never bumps
`pagesProcessed` — nothing streams.

**#3 Job retry wipes pages**: any error rethrows → requeue (max 3, queue.ts:93-100) and each retry
**deletes every page already inserted** (generate.ts:1448-1450) before starting over.

**#4 Dead worker = stuck forever**: orphan recovery runs only inside a living worker
(queue.ts:131-172); the API has no watchdog. And `STALE_RUNNING_MS` = 5 min (queue.ts:33) is BELOW
the real job runtime — safe only because a single busy worker never sweeps; a second worker would
requeue a live job mid-run and #3 would wipe pages concurrently.

Other silent-failure sites: art-director timeout → seed spec, warn only (generate.ts:1273-1276);
AI-path error → template, warn only (:1389-1392); copywriter `catch {}` (:561-563); `planPages`
fallback silent (:399-401); imagegen null → tinted block (imagegen.ts:81-136); `watchGeneration`
error branch re-arms with no deadline (store.ts:992-994).

**Minimal fixes**: poll until status changes (no wall-clock cap, back off after 5 min); toast only
on real status change; treat restored-status+`processingError` as failure; insert add-pages
incrementally; API-side stuck-issue watchdog; resume-not-wipe on retry (skip already-inserted
indexes); raise `MAGAZINE_V2_STALE_JOB_MS` above real runtime before ever running a second worker.

## 8. The chat assistant — "minimal access" is literally its design

The system prompt declares it "the design assistant for ONE page" (agent.ts:100-185). Per turn it
receives: the open page's elements as one-liners (60-char text previews; images as `img set/empty`
— no URL, no content), `"This is page N of T"` and NOTHING else about other pages (the
`pagesAlreadyIn` digest exists in pageDigest.ts but only the generator uses it, generate.ts:1552),
no issue title/theme/palette/fonts/plan (it's told to INFER the subject from the page), the source
doc only if attached this turn, and 30 thread rows × 4,000 chars of TEXT ONLY — staged proposals
are never persisted, so **unapplied work evaporates between turns** (the "asked twice, did the same
thing" dumbness). **No vision in chat**: attachments arrive as URL text; the only pixels any model
sees is the one vision call inside `use_image_as_layout`. No measurements ever return to it —
fitReport/fidelity go to user toasts only (store.ts:801-807).

Tools (agent.ts:232-581, all proposal-staging, element tools current-page only; page-structure
tools owner-only): text/style/move/image/qr/add/delete element, stock+media images,
`use_image_as_layout` (named page OK), add/remove/reorder pages, `add_content_pages` (1-6 new).
**Impossible today**: read or edit another page's elements; "make page 3 like page 1" (reference
must be an uploaded image); regenerate/redesign an existing page; any issue-wide op (theme, "all
headlines"); duplicate a page. Model: OpenRouter `anthropic/claude-sonnet-4.6` default
(`AGENT_MODEL` override), 16-step cap, 90s abort, 20 req/min.

**Shortest path to "commands the whole magazine"**: (1) feed issue title + theme +
`pagesAlreadyIn` digest into SYSTEM() — ~20 lines, helper exists and is tested; (2) a `get_page`
read tool via `resolvePageOrdinal` — unlocks cross-page asks; (3) `page` argument on element edits
(the proposal shape already carries pageId); (4) echo fitReport/density into tool results + write
an `[applied …]` row into the thread; (5) persist staged-proposal summaries; (6) an issue-wide
restyle proposal kind (the only genuinely new apply path).

## 9. Redundancy + scalability (verified against the 2026-07-24 review)

**Provably dead (~270 lines, zero callers each)**: `layoutSpecSchema.ts` entire file (94, superseded
by `normalizeLayoutSpec`); `FontFamilyMenu` (controls.tsx:187, 62); EditorCanvas's duplicate page
cache (EditorCanvas.tsx:442-475 — deleting it also removes a live staleness bug + O(pages²)
observer rebuilds); client `getReviews`/`retryPage`/`screenToPage`/`TOTAL_LINES`;
`planAndComposeIssue`, `polishCoverDraft`, `getPageTemplate`+`BY_ID`, `SEED_EXEMPLARS`,
`MAX_AI_ATTACHMENT*`, `isDark`, invites' v1 branch (points at a route that doesn't exist). Plus
~95 dead `export` keywords.

**Diverged duplicates (bugs, not just waste)**: ① a second luminance/contrastRatio in
applyLayout.ts:96-105 that FAILS OPEN on malformed hex (layout.ts's guards it) — the reference
path's invisible-text guard depends on it; ② TWO char-budget tables — format.ts:20 (agent-edit
path, unmeasured) disagrees with generate.ts:408 by 2× on body copy; ③ client `editor-v2/model.ts`
drifted from the server model — missing `letterSpacing`/`textTransform`/`minFontSize`, so
IssuePageCanvas (editor + public + PDF) silently drops typography the server persists;
④ `canEdit()` is magazine-scoped while permissions are page-scoped — three UI surfaces approximate
the server rule differently and a non-assigned collaborator can edit until the server 409s.

**Templates/seedSpecs verdict**: NOT deletable — they are the AI path's live crash barrier (3
seams: bad spec → seed; all attempts fail → template; QA fail → SAFE_TEMPLATE). Consolidation is
to extract the 3 shared types into a `theme.ts` and label the 680 lines as fallback-only.
`layoutArchetypes` is used (prompt text). `MAGAZINE_V2_AI_LAYOUT=0` is set by nobody — a
two-builders-forever tax.

**Scalability re-verdicts**: indexes **FIXED** (47 specs, ensureIndexes.ts — but `GET /issues`
still full-scans then filters by role in JS, index.ts:324-339); dead retry path **FIXED** (2
residuals: add-pages swallows → zero retries; requeue has no backoff); single-process ceiling
**STILL TRUE** (hand-rolled Mongo poll queue, in-process locks, in-memory rate limiter, no
heartbeat — safe deployment is exactly 1 API + 1 worker); materialize-everything **PARTIAL**
(summaries fixed, but `pagesFor` is an unprojected full-doc find — the db.ts `find()` wrapper has
NO projection support — so every 1.5s poll pulls up to 120×400 elements to compute a count;
publish embeds all pages with no 16MB guard; autosave rewrites the whole element array per flush);
unbounded loops **FIXED** (1 residual above).

**Top 5 consolidations**: one page-read path (projection in db.ts find + summary `pagesFor` +
delete cache B); one text-budget authority; one color/contrast module; page-scoped `canEdit()`;
re-sync client model with server (or generate it).
