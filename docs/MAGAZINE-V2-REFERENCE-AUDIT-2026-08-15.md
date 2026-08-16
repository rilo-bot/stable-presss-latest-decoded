# Magazine v2 — "upload an image, build it like that": capability audit

**Date:** 2026-08-15 · **Branch:** `day-work` · **Code audited:** `e04cdf5` (the A4 + freedom commits, `e04d5c0` → `e04cdf5`)
**Method:** 18 agents, adversarial. 12 finders read the path from the HTTP entry point down; the top 6 findings were then handed to **two independent skeptics each, briefed to refute**. Every number below was produced by running the real modules through a throwaway probe (`npx tsx`), not by reading code. Run `wf_831fb3a9-58c` — 1.84M subagent tokens, 5,274s, 0 agent errors.
**Result:** 22 findings. **5 confirmed 2/2, 1 split 1–1 (disputed on severity, not mechanism), 0 refuted outright, 16 filed but never adversarially checked.**

Companions: [MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md](MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md) (the design), [MAGAZINE-V2-LAYOUT-FROM-REFERENCE-REVIEW.md](MAGAZINE-V2-LAYOUT-FROM-REFERENCE-REVIEW.md) (the 2026-08-13 review, pre-A4), [MAGAZINE-V2-BUILDER-PLAN.md](MAGAZINE-V2-BUILDER-PLAN.md) §4c.

---

## 1. Capability verdict — what the feature can actually do today

| The ask | Works? | The code that decides |
|---|---|---|
| **(a) One page — the one on screen** | **Yes, with 4 confirmed defects** | `POST /issues/:id/pages/:pageId/apply-layout` — `routes/magazinesV2/index.ts:2742`. One reading, one `:pageId`, rev-guarded, writes at `:2789`. |
| **(b) A *named* page ("build page 2 like this")** | **No from chat.** Yes from the panel — but only because the panel *is* the open page. | `agent.ts:351` is `inputSchema: z.object({ url: z.string() })`. **No page argument exists.** The staged proposal carries only the reading, and `store.ts:735` does `const pageId = s.page.id`, so it rebuilds whichever page happens to be open. The confirm at `store.ts:745` names the page, so a mistake is *caught*, not *prevented*. |
| **(c) A whole magazine / a multi-page (PDF) reference** | **No. Nothing exists.** | `grep readingToSpec generate.ts jobs.ts` → **zero matches**; generation has no reference hook at all. Exactly one apply route, one `:pageId`, no batch. A PDF is refused twice over: upload is `ALLOWED_IMAGE_MIME` only (`index.ts:852`, `config.ts:76`) and the read route rejects `asset.kind === 'doc'` (`index.ts:938`). |

### And underneath all three: it cannot *build*, only *rearrange*

`pruneLayoutSpec` deletes every contentless slot, so the reference can only re-flow a page that is **already full**.

- An **empty page** returns `"This page has no content to put into that layout yet — add a headline, some text or a photo first."` (`applyLayout.ts:350`).
- A page holding **just a headline** builds **1 element, 9% "loose", missing = 3**.

So the product sentence *"upload an image and it builds the magazine like that"* is today: **"generate the magazine first, then open one page, then re-flow that page."** That gap is design item **(D)** in §4, not a bug.

---

## 2. The confirmed defects, in fix order

Ordered by **measured user impact**, not by the finders' original severities — because what the skeptics killed was *framing*, not mechanism. Three findings had to be narrowed and one had to be widened; those corrections are recorded under each item, because they change what a fix has to cover.

### FIX 1 — A reference's offset is snapped to a 96px token, so lower-third covers land with **zero** overlap
`readingToSpec.ts:150`, `:222` · findings `anchored-pad-capped-at-96px` + `content-clusters-dont-scale-with-the-sheet` + `pad-token-ceiling-zeroes-bottom-anchored-covers` · **confirmed 2/2, high**

`anchored()`'s all-text branch expresses a text cluster's position as `pad: spaceTokenFor(margin, axisPx)` (`:150`), and `spaceTokenFor` (`:222`) can only return a `SpaceToken`, whose maximum is `SPACE_PX.xl = 96` (`layoutSpec.ts:29`). A cover wanting its title block 263px off the foot gets **96px**.

**Measured, end-to-end through `applyReadingToPage`:**

| Input | Result |
|---|---|
| Full-bleed photo + kicker 0.60–0.63 / headline 0.65–0.77 / subhead 0.80–0.85 | **0.0%, "loose", all three text IoU = 0.00** — not one band touches its reference box |
| The same tree with that one `pad` patched to `263` | **51.0% "adapted"** (kicker 0.38 / headline 0.62 / subhead 0.32) |
| The repo's own cover fixture, Letter 1275×1650 | 53.1% — *"Structure matched, proportions adapted (53%)"* |
| The same fixture, A4 1240×1754 | 45.7% — *"Structure adapted, not matched (46%)"* |
| A top-anchored 3-band cover, both sheets | **A4 43.5% "loose" vs Letter 46.8% "adapted"** — `store.ts:775` flips from `toast.success` to `toast.warning` on identical input |

**Skeptic correction (milder on cause, no milder on effect):** this is **not an A4 regression**. The same tree scores `0.0% loose` on Letter too; A4 only widened the discarded distance from 152px to 167px. Solved pixels are **identical on both sheets** (kicker y=60 h=31, headline y=151 h=101, subhead y=312 h=44) — what moved is the *reference* boxes, which are fractions of the page. So the sheet-blindness is a second-order symptom of the same absolute-pixel mechanism, and one skeptic argued it is Medium on its own. Fix 1 subsumes both.

**The fix:** emit `pad: Math.min(MAX_SPACE_PX, Math.round(fraction * axisPx))`. A raw number has been legal since the DSL unlock (`layoutSpec.ts:43`, `MAX_SPACE_PX = 400`) and survives `normalizeLayoutSpec` intact. Keep `spaceTokenFor` for `gap` only. Above 400px the existing spacer branch is still right, so the choice in `anchored()` becomes *offset size*, not just *child kind*. Delete the now-false comments at `readingToSpec.ts:103` and `:438`.

**FIX 1b — do it in the same change.** Every reference-path test pins the retired sheet: `solveLayout.test.ts:18`, `layoutFidelity.test.ts:189`, **twelve sites** in `applyLayout.test.ts`, and `layoutReading.test.ts:194` calls **1275×1800** "A4" — a sheet that has never existed in this repo. Import `PAGE_W`/`PAGE_H` from `config.ts`, as `readingToSpec.test.ts:411` already does. *This is how a verdict flipped from "adapted" to "loose" with 100/100 tests green.*

**FIX 1c — after 1, never before.** Re-measure `MATCHED_AT 0.72` / `ADAPTED_AT 0.45` (`layoutFidelity.ts:57-58`) on A4 fixtures. Every tuning note in that file's comments ("Scored 0.60 on the cover fixture") is a Letter measurement.

---

### FIX 2 — The page number is printed inside the article, and the folio is destroyed forever
`applyLayout.ts:209`, `:306` · findings `furniture-becomes-body-copy` + `furniture-eaten-and-destroyed` · **confirmed 2/2, high** · *regression from this session's furniture work*

`pageFurniture.ts:222` stamps chrome as `role: 'other'` with the comment *"chrome, not editorial copy — and so it never counts as content"*. That is true for `pageDensity` (which filters on `FURNITURE_IDS`) and **false for `reflowContent`**: `applyLayout.ts:209` does `if (role === 'other') { loose.push(el); continue; }`, and the spare-prose sweep at `:306-314` glues everything left in `loose` onto a body slot.

**Measured:** a furnished page + an ordinary 4-region reference returned body text ending **`"…nobody minded.\n7"`**, `furniture ids surviving: 0`, `leftOver {text:0, images:0}`, and **`fidelity 81% "matched"`**. The product reports success while printing the folio into the copy. A second probe produced `[caption] "Features"` and `[subhead] "Stable Press"` — the masthead as a standfirst.

**It is also permanent.** `restampFolio` (`pageFurniture.ts:361`) keys on `id === FOLIO_ELEMENT_ID`; once the folio element is gone, `renumberFolios` (`renumberFolios.ts:38`) `continue`s past that page forever. **Reordering pages can never renumber it again.**

**Skeptic correction — worse, not milder:** the failure is **not** conditional on the page having empty role pools. A probe that gave the page its own caption *and* subhead, so pass 1 could steal nothing, still glued all three chrome strings onto the end of the article: `"…nobody minded. \nStable Press\nFeatures\n7"`. Every furnished page is affected, not just sparse ones.

**The fix:** filter `FURNITURE_IDS` (already exported) out of the element list before building the `loose` pool, and re-append furniture after QA the way `generate.ts:910` does — `pageFurniture`'s own docblock says it is designed to append to an already-validated page. **A folio is not part of the layout being copied.**

---

### FIX 3 — On a picture-led reference the feature answers **422** instead of building a page
`applyLayout.ts:350` (via `composeFromSolved.ts:81`) · findings `print-floor-refuses-the-page` + `print-floor-refuses-whole-page` · **confirmed 2/2, high** · *regression from this session's type-floor work*

`composeFromSolved.ts:81` floors prose at 8pt on both paths (`const min = node.fontPt === undefined ? Math.max(scale.minFontSize, floor) : floor`, `ptToPx(8) = 16.667px`), and `readingToSpec` never sets `fontPt` — so this is exactly the branch that changed. `applyLayout.ts:350` has no fallback (`if (!report.ok) return { page: null, why: … }`) → `index.ts:2784` returns 422 → `store.ts:788` shows the raw sentence.

**Measured** on a photo-led reference (image 0.55h / headline 0.10h / body 0.18h, A4):

| Copy | Before (6.72pt floor) | Now (8pt floor) |
|---|---|---|
| 2,200 chars | builds | **builds at 8.00pt** |
| 2,400 chars | builds | **422** — `"…fails layout QA — overflow: text d9fe643f-…"` |
| 3,600 chars | builds @6.72pt | 422 |
| 4,500 chars | **422** | 422 |

The user is shown **an element UUID that exists nowhere in their magazine**, after clicking through a confirm that already warned the change cannot be undone. The page is untouched and retrying is deterministic.

**Skeptic correction (narrows the trigger):** this is a **threshold shift, not a new failure class** — the identical 422 with the identical phantom-UUID message already fired pre-change at roughly 40% more copy. And it is not "ordinary pages" generally: it needs a reference whose **prose band is thin**. Measured — a 2-column-article reference (body 0.74h) built **8,000 chars @8.16pt and never refused**; a photo + large-body reference (body 0.42h) built 4,500 and never refused; only picture-led references (body 0.10–0.23h) hit it.

**The floor itself is correct and must stay.** The pages that "used to build" set body copy at **6.7pt at 150 DPI** — that *was* the defect. The bug is the missing fallback: treat `overflow` as **reportable** here (build the page, report "the text had to be cut") while overlap and out-of-bounds stay fatal, and replace `i.detail` with a sentence naming the role and the shortfall — *"this layout's body band holds about 2,200 characters at a readable size; this page has 2,600."*

---

### FIX 4 — Reference rows are silently deleted, and the user is told to add content they already supplied
`readingToSpec.ts:48-50` · finding `spacer-leaves-blow-the-dsl-leaf-budget` · **confirmed 2/2, high**

`readingToSpec` pins depth (4), children (8) and stack layers (5) locally, **but no leaf budget** — it imports neither `MAX_LEAVES` nor `countLeaves`. Its spacer leaves then count against the DSL's `MAX_LEAVES = 28` when `applyLayout.ts:336` pushes the tree through `normalizeLayoutSpec`, which spends that budget **depth-first** (`layoutSpec.ts:366`, `if (budget.leaves <= 0) return null;`). **So the bottom of the page is what gets dropped.**

The trigger is the idiom `readingToSpec.ts:407` itself calls *"the commonest magazine idiom there is"*: a line of type over a full-bleed photo costs **3 leaves per 1 region**.

**Measured, with a bypass control that isolates the cause:**

| Reference | Budget bypassed | Budget applied |
|---|---|---|
| 8 bands of "full-bleed photo + caption" (16 regions, 32 leaves) | **87% "matched"**, 16 content refs | **37% "loose"**, missing = 2, 14 refs |
| 12 bands (24 regions) | **83% "matched"** | **20% "loose"**, missing = 4 |
| 25-region contents grid | — | **9 slots deleted** from the bottom two bands; two of the user's photos fell out to `leftOver`; page still passed QA, so nothing refused |

And the sentence the user gets is **false**: `layoutFidelity.ts:256` says *"N boxes from the reference had nothing to put in them, so the rest grew to fill the page"* — for slots the budget ate.

**Skeptic correction (reachability is ~2× worse than filed):** the trigger is **16 regions, not 28**. But spacers are *not* emitted per clear run — four constructed families (plain band grids, cell grids, 2-column cell grids, 7×4 grids) produced **zero** spacers, because `bandRect` hugs the split axis so `placeOne`/`anchored` see no slack. They appear reliably in the one idiom above, where cell heights are uneven within a band.

**The fix:** count committed leaves (content **and** spacer) as `partition` recurses, and stop creating spacers — then bands — as the budget nears `MAX_LEAVES`, so the loss is a **merged** band rather than a deleted one. Independently, compute `origin` from the **normalized** spec so the summary reports the drop instead of blaming the user's content.

---

### FIX 5 — DISPUTED (severity, not mechanism): the pinning is incomplete, the *input* budget still rides the DSL
`layoutReading.ts:73` · finding `max-regions-still-reaches-max-leaves` · **split 1–1**

`export const MAX_REGIONS = MAX_LEAVES` — 14 → 28 in the same commit that raised the DSL cap — and `readLayout.ts:77` interpolates that number straight into the vision prompt (`Keep the total under ${MAX_REGIONS} regions`). So the same reference image now yields a different reading, a different partition and a different score: **precisely what `readingToSpec.ts:36-47` pins its own caps to prevent.** Git-verified: `readingToSpec.ts` used to *import* those caps and was converted to local pinned 4/8/5 in `e04d5c0`, while `layoutReading.ts:73` was left riding the raise.

- **Skeptic A upheld it at high:** a dense reading that built at 14 returned a QA refusal at 28.
- **Skeptic B refuted it at low:** five dense fixtures where the **verdict word never changed** (all "loose" at 7–22%, or 77.8% vs 77.5% "matched"), and one where the higher cap built a strictly **better** page (14 elements vs 4).

Both are right: truncation keeps the biggest regions (`layoutReading.ts:211-212`) and the mean is area-weighted, so the cap only moves the tail.

**The fix (10 minutes — do it for the guarantee, not the score):** give `layoutReading` its own `MAX_REGIONS` constant with the same docblock, and stop importing `MAX_LEAVES` there. Its current comment — *"a reading that cannot fit in a spec is a reading we would have to throw away half of anyway"* — is simply **false** now that spacers exist (26 regions → 37 leaves). That is Fix 4.

---

## 3. Filed but **not** adversarially checked — verify before scheduling

Sixteen findings were measured once, by one agent, and never handed to a skeptic. **Treat them as leads.** Two allege irreversible content loss.

| Finding | Where | Claim |
|---|---|---|
| `reuse-deletes-surplus-photos` ⚠️ | `store.ts:746` | "Use this layout on this page too" silently deletes photos the reference has no box for — while the confirm says *"Your words and photos are kept"*, and the undo stack is cleared at `store.ts:762` |
| `unplaced-prose-destroyed` ⚠️ | `applyLayout.ts:306` | Prose the reflow cannot place is counted, then permanently destroyed, after that same dialog |
| `background-scan-outranks-real-photos` | `applyLayout.ts:222` | The page's background scan is unconditionally `unshift`ed ahead of the user's own photographs for the image slots; the real photos are then deleted |
| `unknowable-ground-assumed-white` | `applyLayout.ts:131` | `themeForPage` treats any non-hex ground as white, so a gradient page is repainted near-black (`#141414`) and a retained background photo gets dark ink on it |
| `fidelity-scores-a-box-that-does-not-render` | `applyLayout.ts:368` | QR/icon squaring moves the element *after* the box is scored, so the score describes something that is not on the page |
| `chat-reference-lands-in-photo-picker` | `AiPanel.tsx:263` | The `kind` argument is omitted, so a chat-attached reference is stored as a placeable photo — defeating "never put their picture in the client's magazine" |
| `depth-4-deletes-regions-the-dsl-would-now-hold` | `readingToSpec.ts:80` | The pinned depth of 4 deletes regions the raised DSL (6) has room for, and the loss is erased from `origin`, so fidelity can still report "matched" |
| `aspect-gate-band-moved-with-the-sheet` | `layoutReading.ts:249` | The 25% aspect tolerance is relative to the page, so A4 moved the accept/reject band: a 16:9 phone screenshot is now accepted, a near-square reference now rejected |
| `readingtospec-is-page-size-blind` | `readingToSpec.ts:51` | It pins its caps "so every IoU score is stable" but imports `PAGE_W`/`PAGE_H`, which moved — the same reading now emits a different gap token |
| `spare-merge-first-not-largest` | `applyLayout.ts:308` | Spare prose goes to the **first** body slot, not the largest, and is never spread across the empty ones |
| `leftover-images-false-alarm` | `applyLayout.ts:317` | `leftOver.images` counts the background photo as lost even when it is kept |
| `reading-lost-on-any-click` | `LayoutReference.tsx:106` | The vision reading is destroyed by clicking any element, and a stored reference can never be re-selected — every reuse costs another AI read against a 10/min limit |
| *(+ the 4 already promoted to §2)* | | |

---

## 4. Design for the missing capability

The expensive part is already reusable: a `LayoutReading` is **normalised fractions with no sheet in it** (`readLayout.ts`'s prompt never mentions page size), and `applyReadingToPage` is **pure** — `applyLayout.ts:326`, *"the caller persists the result."* One vision call can serve N pages with no new machinery.

**A. One reference → a *named* page. — BUILT 2026-08-16.**
`use_image_as_layout` takes `page` (1-based, optional); the ordinal is resolved **server-side** by
`resolvePageOrdinal` in `pageDigest.ts` and the resolved `pageId` rides the proposal, so `store.ts`
applies to `proposal.pageId ?? s.page.id`. **The model supplies an ordinal, never an id and never
geometry** — the invariant holds. Three rules the tests pin: an **id** comes back rather than an
index (order can change between the answer and Apply); naming the page you are already on resolves
to "this page" rather than a redundant target; and a number that does not exist is refused **while
the assistant can still say so**, not after the user approves a rebuild.

Two things fell out of it that were wrong before and would have got worse: the rebuild used to clear
the undo stack unconditionally, which would now discard the history of a page it never touched; and
the fidelity toast now names the page when it is not the one on screen, because *"Matched your
reference closely (73%)"* is a complete sentence about a page you can see and an ambiguous one about
a page you cannot.

The tool's description and the agent prompt also now say plainly that it **rearranges an existing
page and cannot create one** — the model was previously free to stage a rebuild in answer to "add a
new page in this design" and imply it had done so.

**B. One reference → many pages / a whole issue.**
Add `POST /issues/:id/apply-layout` taking `{ reading | assetId, targets: [{ pageId, rev }] }`. Loop the existing pure function and the existing `updateOneIf` per page, keeping the **per-page rev guard** — a batch write must not become a way to clobber a page someone else moved — and return `{ pageId, built, why, leftOver, fidelity }` per page. Rate-limit as one read + N writes, not N reads.

**Add a dry run** — `{ preview: true }` on the existing per-page route. It is **free**, because the function already computes `leftOver`, `fidelity` and the refusal `why` without touching the DB. It is what lets the confirm stop lying: *"page 4: 1 photo box, 4 photos — 3 will be removed; page 5: body copy 400 characters over."* For a whole-issue apply, a preview is **mandatory**, not nice-to-have.

**Add** `GET /issues/:id/layout-references` returning only `kind: 'reference'` assets (`{id, url}`). `index.ts:680` correctly hides them from `GET /media` — and thereby makes a stored reference un-re-selectable. Keep `assetId` the only handle; **never return a URL as an identifier**. Optionally cache the reading on the media asset as an **additive optional field** (absent = read again): no backfill, no migration.

**C. A multi-page PDF reference.** The rasteriser already exists — PDF import turns each page into an image stored as `background: { type: 'image' }`. On upload of a `kind: 'doc'` **reference**, rasterise to N page images stored as `kind: 'reference'` with `pageIndex` set, then read each. A multi-page reference then reduces exactly to (B): a list of readings applied to a list of pages, pairwise. `index.ts:938`'s `asset.kind === 'doc'` refusal stays for the doc itself and moves to the rasterised children.

**D. Scaffold — so a reference can BUILD, not only rearrange.** *This is the actual product gap.*
Add `{ scaffold: true }` to `applyReadingToPage`: for an unfilled **text** slot compose an **empty** text element at the solved box, with the role, ceiling and `minFontSize` already computed by `composeFromSolved`; for an unfilled **image** slot, an empty picture frame. Then hand the page to the Fill pass that already exists — `POST /issues/:id/pages/:pageId/format` with `mode: 'fill'` (`index.ts:2817`) finds empty text boxes and asks the model to write only those.

That yields "add a page and make it look like this" with every invariant intact: **the solver placed every box, the model only wrote words into boxes it did not place, and not one word or pixel came from the reference image.** Never fill a scaffold with lorem, or with copy lifted from the reference.

**Build order:** Fix 1 → Fix 2 → Fix 3 → **(A)** → Fix 4 → dry run → **(B)** → **(D)** → **(C)**.
Fixes 1–3 come first because *applying a broken transform to 24 pages instead of 1 is the worst possible sequencing.*

---

## 5. What I would deliberately NOT do

- **Not lower the 8pt prose floor** to make Fix 3 disappear. The pages that "used to build" set body copy at 6.7pt at 150 DPI — that *was* the defect. Fix the missing fallback and the UUID message; leave the floor.
- **Not re-tune `MATCHED_AT`/`ADAPTED_AT` before Fix 1.** The thresholds are currently absorbing a placement error measured at up to **269px**; tuning on top of that bakes the bug into the calibration.
- **Not raise `readingToSpec`'s local depth/children caps to the DSL's 6/12.** The pinning is the one thing here that demonstrably works — the partition was verified identical under both cap sets. Raising it re-cuts every score for no user-visible gain.
- **Not apply the reference's palette in this pass.** The panel honestly says *"not used — this page keeps its own colours"*. Painting a page in borrowed colours while its geometry lands a sixth of a sheet off makes it look worse, and it collides with `themeForPage`'s promise that applying a layout changes **structure, not paint**.
- **Not let the AI author x/y even to raise the IoU.** The reason a layout read off a photograph cannot produce an overlap or an off-page box is that `solveLayout` is the only thing that assigns pixels. Every fix above stays on the reading → spec → solver path.
- **Not gate the write on the fidelity verdict.** A "loose" page is a *report*, not an error. Fix 3 is the proof that refusing to lay the page out is the one outcome a user cannot act on.
- **Not fix the stale tests by editing `1275`/`1650` to `1240`/`1754`.** Import the constants, or the next sheet change is silent again.
- **Not migrate any stored field** to record "a reference was applied here". If undo matters, have the route return the pre-apply `elements` and let `store.applyLayout` push one undo entry, instead of clearing the stack at `store.ts:762`.

---

## 6. Two things the audit found about the *instruments*

**6.1 The guards cover the generator path, not the reference path.**
Two of the five confirmed defects (Fix 2, Fix 3) are **regressions introduced by this session's own work**, and **both passed 274 tests and all five `check:*` guards**. Nothing in CI exercises `applyReadingToPage` end-to-end. That is the finding behind the findings: an 18-agent audit found what the test suite structurally could not.

**6.2 `applyLayout.ts` is invisible to search.**
The file contains a **literal NUL byte** at offset 10969 — `const BACKGROUND = '\0background';` was written with a raw `0x00` instead of the escape. ripgrep therefore classifies the file as **binary and silently skips it**, so `Grep`/`rg` return "no matches" for a file at the centre of this feature. Introduced in `e04d5c0` (absent at `18f7c50`). Typecheck and build are unaffected — JS string literals may contain NUL — so nothing else flags it.
**One-character fix:** write the sentinel as `' background'` so the source is text again.

---

## 7. Status — R-fixes 1, 1b, 1c, 2, 3 applied 2026-08-16

**289 tests (was 274), five guards, both typechecks, both builds — green.** Every fix below was
verified under the re-plant rule: the bug restored, the new test observed RED, the fix restored.

| | What changed | Measured |
|---|---|---|
| **Fix 1** | `anchored()`'s all-text branch emits `pad` as **raw pixels**; past `MAX_SPACE_PX` it falls through to spacers rather than clamping | lower-third cover **6.1% → 42.3%**; an off-centre cluster past the ceiling **46.9% → 77.2%**; two-column article unchanged at 49.5% |
| **Fix 1b** | `applyLayout` / `layoutFidelity` / `layoutReading` / `solveLayout` tests import `PAGE_W`/`PAGE_H`; the fabricated "A4" 1275×1800 is gone | all reference tests now run on the real sheet, still green |
| **Fix 1c** | **Deliberately no threshold change** — see below | 11 shapes measured |
| **Fix 2** | `FURNITURE_IDS` excluded from the reflow pools; new `refurnish()` re-derives chrome after QA, taking its wording from the page's own previous running head | folio and running head survive a rebuild; `restampFolio` still works on the result |
| **Fix 3** | QA split — overlap and out-of-bounds still refuse, **overflow builds the page and reports the shortfall** in characters per role (`tight`, `tightSummary`) | 2,400 chars on a picture-led reference: was a 422 quoting an element UUID, now a page plus "the body holds about N characters… this page has M" |

Two things found while fixing, also done: the **raw NUL byte** in `applyLayout.ts` is escaped (the
file is text and greppable again), and `pagesAlreadyIn` was extracted to a new **`pageDigest.ts`**
because `generate.ts` opens the database at module scope and cannot be imported by a test.

### Fix 1c — measured, and deliberately left alone

The thresholds were re-measured across eleven real magazine shapes on A4 after Fix 1:

| Shape | Score | Verdict | | Shape | Score | Verdict |
|---|---|---|---|---|---|---|
| cover: one line, centred | 84.8% | matched | | cover: type at top | 67.8% | adapted |
| feature: full-bleed + caption | 82.3% | matched | | photo grid 2×2 | 62.9% | adapted |
| feature: photo top, 2 columns | 77.3% | matched | | cover: lower third | 37.4% | loose |
| article: sidebar right | 75.7% | matched | | stat band: 3 figures | 32.0% | loose |
| pull quote | 73.3% | matched | | contents: 6 entries | 18.2% | loose |
| | | | | cover: masthead + 3 teasers | 17.6% | loose |

`MATCHED_AT 0.72` and `ADAPTED_AT 0.45` stay. Every "loose" case is the same shape — **many small
text bands** — and the cause is real rather than calibration: content-sized text produces ~40px
entries where the reference had 105px ones, and the error compounds down the page. Lowering the bar
would relabel a genuinely loose result as "adapted", which is the exact flattery the score exists to
prevent.

**That is the next real fix, and it is a new one: band HEIGHT.** `anchored` now places a cluster
correctly and the bands inside it are still the wrong size. A reference band's height is a
measurement we already have in `origin` and currently throw away.

### Also done, from the add-a-page review (§ not in the original audit)

- **The add-pages planner was blind to the magazine.** `planPages` received only title, subtitle,
  topic and count — asked to "expand on the issue's existing themes" without being shown one, and
  its "do not repeat a kind twice in a row" applied only within the new batch. It is now given one
  line per existing page (section — headline), read off the elements, since a page document has
  never stored a kind or a section.
- **An interior page inserted at index 0 silently became the cover**, and repointed `coverImage` at
  itself. `planPages` emits `INTERIOR_KINDS` only, so that position is refused with a sentence
  rather than quietly clamped.

### Also done 2026-08-16 — design item (A), the named page

See §4A. `use_image_as_layout` accepts a page ordinal; `resolvePageOrdinal` resolves it server-side.
295 tests.

### Two more, found while testing rather than by the audit

- **A failed chat image upload reported only its consequence.** `AiPanel.tsx`'s `catch {}` threw the
  reason away, so a size refusal, a missing storage config and a browser upload blocked by the
  bucket's CORS rules all produced one sentence — and the last of those never reaches the server log
  either, because the PUT goes straight to S3. The cause is passed through now, and `putToS3`
  catches the rejection a CORS block actually produces (it never returns a response, so the
  existing `!res.ok` branch could not see it).
- **`art-director` timeout raised 90s → 150s.** On a real three-page run it timed out on
  `feature-full-bleed`, fell back to the fixed seed spec and shipped a **five-element page** — the
  "sparse page" complaint, caused by a network deadline rather than a design decision. The budget
  covers all four attempts *and* the backoff between them, which is why it ran out. Safe against the
  queue's stale-job sweep only because there is one worker; noted at the call site.
- **A log line that misreported which path built a page.** After the attempts ran out it said "using
  template path" even when a legal earlier attempt was retained and returned — a real run reported
  the cover that way and then shipped attempt 1's AI layout.

### Still open from this audit

Fix 4 (the spacer leaf budget), Fix 5 (`MAX_REGIONS` riding `MAX_LEAVES`), the sixteen unverified
leads in §3, and design items **(B) batch + dry run, (C) PDF, (D) scaffold** — (D) being the one
that would let a reference *build* a page rather than only rearrange one.
