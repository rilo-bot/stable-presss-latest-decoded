# Magazine v2 — quality plan: from "good AI layout" to "typeset"

**Status: PLANNED.** Nothing here is built. Seven phases, each self-contained and shippable on its own.
**Date:** 2026-08-11 · **Branch:** `feature/blogs`
**Basis:** the code review in `docs/MAGAZINE-V2-REVIEW-2026-08-11.md`. Architecture reference stays `docs/MAGAZINE-BUILDER-V2-TECHNICAL.md` (verified accurate — do not re-derive it).

---

## 1. The diagnosis

The engineering is sound. The **quality ceiling comes from two structural facts**, not from bugs:

> **Every page is designed in isolation, and nothing in the pipeline ever looks at what it produced.**

Everything below follows from those two sentences.

| # | Limit | Evidence |
|---|---|---|
| Q1 | **No issue-wide typography.** `fitFontSize` runs per leaf, independently, so body can render 24px on p3 and 14px on p5 because their boxes differ. | `composeFromSolved` fits each leaf alone |
| Q2 | **No shared grid.** `margin` is a token the *model* picks per page, so p2 can have 36px margins and p3 96px. | `solveLayout` reads `spec.page.margin` per spec |
| Q3 | **No folios, page numbers or running heads — at all.** The only page numbers in the system are *copy* on the contents page. | zero hits across the whole lib |
| Q4 | **The type scale's floors are print-illegible.** Sizes are px at 150 DPI, so `px × 0.48 = pt`. `body.minFontSize: 14` = **6.7pt**; `caption.minFontSize: 12` = **5.8pt**. Any box that drives text to its floor is unreadable in print. | `roleScale.ts` + `RASTER_DPI = 150` |
| Q5 | **No measure control.** Nothing stops a body leaf spanning the full 1275px — ~110 characters per line, which reads as broken however well it is fitted. | no width constraint on text roles |
| Q6 | **Every `cover` crop is dead-centre.** `focalPoint` is coerced from input but nothing ever *computes* one, so heads and horizons get cut. | `focalPoint` appears only in model.ts coercion |
| Q7 | **Contrast over photos is guessed.** `bgBehind` returns `'#1a1a1a'` for *any* image, so light text lands on a light photo. | `composeFromSolved.ts:110` |
| Q8 | **The art director is blind to its siblings.** `archetypeSteer(kind, pageNumber)` rotates archetypes by page index to *fake* variety. Rhythm is pseudo-random, not composed. | `artDirectPage(plan, page, pageNumber, retryHint)` |
| Q9 | **Copy is drafted per page in isolation** — no narrative arc, no dedup, no fact-consistency check against the source. `draftGaps` checks *presence*, never quality. | `draftPage` sees only its own intent |
| Q10 | **Richness capped at 14 leaves / depth 4** — below what real editorial pages carry. | `MAX_LEAVES = 14` |
| Q11 | **Zero token or cost accounting.** Worst case ≈ `1 + 4N` model calls plus an image-gen call per slot, entirely unmeasured. | no `usage`/token/cost references in v2 |

**Q4 is the sleeper.** It is easy to read `roleScale.ts` as UI pixels and conclude the sizes are fine. They are canonical print pixels: `body` tops out at 24px = **11.5pt** (reasonable) but bottoms out at 6.7pt (unreadable). Raising the floors is a one-line change with a real consequence — more text will fail to fit, which is exactly why **P6 exists and why Q10's caps must not rise before it**.

---

## 2. What must not change

The five invariants from the technical doc. Every phase below is designed to hold all five; if a phase can't, it is wrong.

1. **No LLM emits a coordinate.** `solveLayout` stays the sole pixel authority.
2. **Every element write goes through validate → sanitise → refit.**
3. **The AI agent never writes the database** — it stages proposals.
4. **One renderer** for editor, reader and print.
5. **Degrade, never fail.** Every new step must have a defined behaviour when its input is missing.

Two additions specific to this plan:

6. **The exact-tiling guarantee is not negotiable.** `solveLayout` places children at rounded cumulative offsets so adjacent boxes share exact edges. Any "snap to grid" idea that rounds *internal* boundaries breaks this and will reintroduce 1px seams. Snap the **content rect only**; internal tiling stays exact. The new test suite (`tests/magazineV2/solveLayout.test.ts`) will catch a violation.
7. **Page streaming survives.** `insertComposedPage` writes each page as it is composed so the studio reveals the build live. No phase may convert generation into "compose everything, then insert" — issue-wide passes run as a **finalise step that updates already-inserted pages**.

---

## 3. Phase 1 — Lock the issue grid

**Goal:** one set of margins for the whole issue, chosen once, instead of a per-page token the model picks.

**Why first:** it is the smallest change, it is a prerequisite for P3 (folios need a predictable margin band to live in), and inconsistent margins are the most immediately visible "not a real magazine" signal after typography.

**Touchpoints**
- `generate.ts` — `genTheme` gains `grid: { margin: SpaceToken }`, persisted at plan time alongside palette/fonts so "add pages months later" inherits it.
- `generate.ts` / `artDirectPage` — after `normalizeLayoutSpec` returns, **override** `spec.page.margin` with the issue grid margin. The model may still propose one; it is ignored. One assignment.
- Seed specs and the fixed-template path get the same override, so all three origins agree.

**How to choose it:** deterministically from the issue, not by asking the model — `lg` (60px = 0.4in) for photo-led issues, `xl` (96px = 0.64in) for text-led. Simplest defensible rule: always `lg`, with `xl` on the cover/back-cover for a more generous frame.

**Acceptance:** every interior page in a generated issue reports the same `solved.margin`. **Tests:** extend `solveLayout.test.ts` with a margin-override case; assert `genTheme.grid` round-trips through the add-pages path.

**Deliberately not in this phase — mirrored verso/recto margins.** A wider gutter is only correct if pages are *presented* as spreads, and `BulletinViewer` is a vertical stack of single pages, so mirroring would look plainly wrong on screen. It is gated on the spread decision in §10.

**Risk:** low. No pixel-authority change.

---

## 4. Phase 2 — Issue-wide type harmonisation, and print-legible floors

**Goal:** one body size, one caption size, one kicker size across the issue. Headlines keep varying — that is drama, not inconsistency.

This is the single biggest tell that a magazine was machine-made.

**Two parts.**

**(a) Raise the floors** in `roleScale.ts` so nothing can be typeset below ~8pt:

| role | floor now | = pt | proposed | = pt |
|---|---:|---:|---:|---:|
| body | 14 | 6.7 | **19** | 9.1 |
| caption | 12 | 5.8 | **17** | 8.2 |
| byline | 13 | 6.2 | **17** | 8.2 |
| label | 14 | 6.7 | **18** | 8.6 |
| entry | 16 | 7.7 | **19** | 9.1 |

Ceilings stay. Consequence: text that used to shrink to fit now *fails* to fit, so `validatePageLayout` rejects more pages and more self-heal retries fire. That is the correct trade — a rejected page is retried into a roomier layout; an illegible page ships.

**(b) Harmonise, as a finalise step** (so streaming survives): after the last page is inserted, `harmonizeIssueType(issueId)` reads every page, and for each harmonised role computes one issue-wide target, then rewrites `fontSize` + `maxFontSize` per text element through the ordinary page update.

**Which target:** *not* the plain minimum — one pathological page would drag the whole issue down to 9pt. Use the **median** of the fitted sizes for that role across interior pages, then per leaf apply `min(target, that leaf's own fitted size)`. A leaf whose box genuinely cannot hold the median keeps its own smaller size and is logged; if that happens often, the layouts are too tight and the log says so.

**Harmonise:** `body`, `caption`, `kicker`, `byline`, `label`, `entry`. **Leave alone:** `headline`, `figure`, `pullquote`.

**Acceptance:** in a generated 8-page issue, every `body` element on an interior page shares one `fontSize`, bar logged exceptions. **Tests:** a pure `harmonizeSizes(pages)` function unit-tested against fixtures — median selection, the per-leaf cap, the exception path. Add a `roleScale` guard test asserting no floor is below 8pt (`px × 0.48 ≥ 8`).

**Risk:** medium — it rewrites stored elements. It must go through the normal write path, and note that `refitText` will re-fit from the new `maxFontSize`, which is why both fields are set together.

---

## 5. Phase 3 — Page furniture: folios and running heads

**Goal:** page numbers and running heads on every interior page. Currently there are none, and their absence is unmistakable.

**Touchpoints:** a new `pageFurniture.ts`, applied after `composeFromSolved` and before `normalizeElements`, so it rides the existing guardrails.

**Rules**
- Skip cover and back-cover.
- Live in the **margin band** — outside the content rect that P1 fixed. This is why P1 comes first.
- Folio: the page number. Running head: the section title, else the magazine title.
- Low `zIndex`, `body` font, `secondary` colour, contrast-repaired like anything else.

**The size detail that matters:** at 150 DPI a 9pt folio is **≈19px**, not 12px. UI intuition says 12px and would render a 5.8pt folio that is invisible in print. Use the same `px × 0.48 = pt` arithmetic as P2.

**Acceptance:** every interior page carries exactly one folio and one running head, both fully inside the page and outside the content rect, neither overlapping any content element. **Tests:** furniture is added/skipped per page kind; boxes sit in the margin band; `validatePageLayout` still passes.

**Risk:** low, and it is the fastest visible win in the plan.

---

## 6. Phase 4 — Measure control

**Goal:** stop full-width body text. A 1275px-wide body column at 19px is ~110 characters per line; readable prose is 45–75.

**How:** `fontMetrics.measureRunWidthPx` already gives real glyph advances, so characters-per-line is computable, not guessable. Add a spec transform that runs **after prune, before the final solve**: solve, inspect each body leaf's width at the harmonised size, and if it exceeds the measure ceiling, rewrite that leaf into a two-column `row` (`body` + `body2` — a shape the DSL already supports and the copywriter already writes for) and re-solve.

The pipeline already solves more than once (pseudo-template → prune → re-solve), so a third pass is architecturally consistent rather than a new pattern.

**Acceptance:** no `body` element in a generated issue exceeds 75 characters per line at its final size. **Tests:** a pure `measureChars(width, size, font)` helper; the transform splits an over-wide leaf and leaves a correctly-sized one untouched.

**Risk:** medium — it mutates the tree between prune and solve, so it must preserve the FR-guarantee that `pruneSpec` establishes. Existing prune tests plus new transform tests cover it.

---

## 7. Phase 5 — Real image analysis: focal points and luminance

**Goal:** stop cropping heads off, and stop guessing what colour sits behind text.

**How:** analyse each image once, when it is stored, and persist the result on the MediaAsset:
- `focal: {x, y}` from `sharp`'s attention-based crop offsets → copied onto the element by `composeFromSolved`, fixing Q6 with no renderer change (`object-position` already honours `focalPoint`).
- `luminance: number` (mean, 0–1) → replaces the hardcoded `'#1a1a1a'` in `bgBehind`, fixing Q7. Scrim opacity can then adapt: a bright photo needs a stronger wash than `SCRIM_OPACITY = 0.55`.

**Touchpoints:** `stock.ts`, `imagegen.ts` (store time), `composeFromSolved.ts` (`bgBehind` needs `ResolvedContent` threaded in — it already has `content` in scope at the call site).

**⚠ Dependency blocker, resolve first.** `sharp` is a **worker-only** dependency and is **absent from `apps/server`** — but the agent's `add_stock_image` tool calls `fetchAndStoreStock` from the **API process**. Importing sharp into `stock.ts` as-is would crash that tool in production. Two options:
- **(a) Add `sharp` to `apps/server` dependencies.** Simplest; it is already in the tree via the worker.
- **(b)** Keep analysis worker-side as a follow-up job, and have generation read it when present.

Recommend (a), with the analysis wrapped so a sharp failure degrades to today's behaviour (invariant 5).

**Acceptance:** a generated issue's image elements carry non-default `focalPoint`; text over a *light* photo resolves to dark text. **Tests:** `bgBehind` returns the stored luminance rather than the constant; a missing luminance falls back to today's assumption.

**Risk:** medium, entirely in the dependency question above.

---

## 8. Phase 6 — Close the loop on rendered pixels

**The step change.** Everything upstream is *estimated*: `estimateTextHeight` is a deliberately conservative guess and overflow QA trusts the guess; contrast is assumed. The pipeline never sees its own output.

**The architecture is already shaped for this:**
- `puppeteer ^25.2.1` is already an `apps/server` dependency and already renders these exact pages for the PDF export.
- `IssuePageCanvas` is already the one renderer for editor, reader and print.
- **`artDirectPage(plan, page, pageNumber, retryHint)` already takes a feedback string**, and the self-heal loop already feeds QA reasons into it.

The only missing piece is measuring the real artefact.

**What to measure** — one browser, reused across an issue's pages, in the **worker**:

| Signal | How | Replaces |
|---|---|---|
| **Real text overflow** | `page.evaluate` comparing `scrollHeight > clientHeight` per text element | `estimateTextHeight`'s guess — this is an *exact* oracle |
| **Real contrast** | sample rendered pixels behind each text box, compute the true ratio | the `'#1a1a1a'` assumption (and P5's mean) |
| **Ink / whitespace balance** | coverage per page third — catches "all content crammed top-left" | nothing today |
| **Edge collisions** | measured bounding boxes vs the page rect | `validatePageLayout`'s pre-render arithmetic |

Failures become `retryHint` text. Optionally add a vision critique ("does this read as a premium magazine page; what is wrong?") as a second, opt-in signal — but the deterministic measurements are the valuable half and should land first.

**Acceptance:** a page with genuinely overflowing text is detected from the render, not the estimate, and the retry hint names it. **Tests:** the measurement functions unit-tested against a fixture page; the render step must be skippable so the suite stays hermetic.

**Risks — the highest in the plan**
- **Chromium in the worker.** The PDF route needs Chromium in the API service; the worker service would need it too. Verify on Render before building.
- **Latency and cost.** One render per page per attempt. Mitigate by reusing one browser per issue and running the render pass **only on pages that pass the cheap checks**, as a confirmation rather than a first gate.
- Must degrade to today's behaviour when Chromium is unavailable (invariant 5).

**Only after this lands should Q10's leaf/depth caps rise.** More richness without measurement just means more silent fallbacks.

---

## 9. Phase 7 — Copy coherence, telemetry, house style

Three smaller items, independent of each other.

- **Cross-page copy pass.** One cheap call after all pages are drafted: flag repeated phrasing, duplicated claims, and statements that contradict the source. Pages are currently drafted in isolation, so a real issue can say the same thing three ways.
- **Per-issue token accounting.** The AI SDK returns `usage` on every call and **v2 discards all of it**. Sum it per issue and store it on the magazine with the model ids. This is a handful of lines and it is the prerequisite for any budget cap — worth remembering that the last production incident was an invalid `AGENT_MODEL` slug that nothing detected.
- **House style.** `reusedFromId` reuses *layout* only. A saved brand — palette, font pairing, grid, masthead — inherited by every new issue is what makes a magazine look like *the same* magazine month to month. Largest product surface here; smallest technical risk.

---

## 10. Build order, and open questions

**Order:** P1 → P2 → P3 → P4 → P5 → P6 → P7.

The rationale: P1 is a prerequisite for P3; P2's floor change increases overflow pressure that P4 then relieves and P6 finally measures properly; P5 is independent but gated on a dependency decision; P7 is independent throughout. P1+P3 together are the fastest visible improvement and could ship as one push if you want a quick win.

**Open questions — worth deciding before the phase that needs them**

1. **Spreads.** Should the reader present facing pages as spreads? If yes, mirrored margins, cross-page composition and spread-aware planning all become available — and they are a large part of what makes print *look* like print. If no, P1 stays uniform and Q8's rhythm problem is only partly addressable. *(Needed for: P1's deferred half.)*
2. **`sharp` in `apps/server`, or a worker-side analysis job?** *(Needed for: P5.)*
3. **Is Chromium available in the worker service on Render?** *(Needed for: P6 — verify before building, not during.)*
4. **Print target.** The whole geometry is US Letter at 150 DPI. If these are ever physically printed, bleed and trim margins matter and the canonical page needs a bleed allowance. If they are screen/PDF only, ignore.
5. **How short is a preview?** The planner defaults to a 4–5 page preview. Several quality signals (rhythm, narrative arc, a contents page that earns its place) only exist at 12+ pages. Worth knowing whether the target artefact is the preview or the full issue.

## 11. What this plan does not do

- It does not touch the solver's tiling algorithm.
- It does not give the LLM any pixel authority.
- It does not raise the leaf/depth caps — that waits for P6.
- It does not address M3/M4/M5 from the review (chat scoping, undo model, `GET /issues` query). Those are correctness/UX items, tracked there, not quality items.
