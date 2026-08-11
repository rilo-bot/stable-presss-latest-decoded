# Magazine Builder v2 — code review

**Date:** 2026-08-11 · **Branch:** `feature/blogs`
**Scope:** the v2 subsystem only — `apps/server/src/lib/magazineV2/*` (13.7k LOC incl. the 8,256-line generated metrics table), `apps/server/src/routes/magazinesV2/index.ts` (1,673), `apps/worker/src/*` (2,004), `apps/web/src/editor-v2/*` (4,816).
**Method:** read the code directly and checked every structural claim in `docs/MAGAZINE-BUILDER-V2-TECHNICAL.md` against it. No agents, no sampling. Verified by measurement where measurable (endpoint count, flag values, typecheck, test discovery).
**Out of scope:** the uncommitted auth/session refactor in the working tree. When this review started it broke `npm run build -w apps/server` (`USERS` used at `routes/admin/index.ts:79,99` after its import had been removed), which blocked *deploying* v2 — not v2's code, and it was fixed in the session working on it while this pass was in progress. The server builds clean again; see §6.

Status key: **FIXED** — done in this pass. **OPEN** — left as-is, with the reason.

---

## 1. The technical doc is accurate

`docs/MAGAZINE-BUILDER-V2-TECHNICAL.md` describes what is actually in the code. Spot-checked and confirmed: **35 endpoints** (exact), the gate chain, `rev` compare-and-set on every element write, the two-phase reindex, `withIssueLock`, share-only 404s, the fallback ladder, the trust boundaries, the type scale, the auto-scrim rule, the publish snapshot shape.

The one drift found: it says the editing agent has **14 tools**; there are **15** (`agent.ts` — `list_media`, `set_element_text`, `set_element_style`, `move_element`, `set_element_image`, `set_qr_link`, `add_element`, `add_media_image`, `add_stock_image`, `delete_element`, `change_text_to_image`, `add_page`, `add_content_pages`, `remove_page`, `reorder_pages`).

Treat that doc as the reference for *how it works*; this file only records defects.

---

## 2. What holds up, and must not be undone

**The central invariant is real, not aspirational.** The art-director emits a relative frame tree (`layoutSpec.ts`); `solveLayout` owns every pixel. Overlap and off-page are consequences of recursively partitioning a rectangle, not checks that could be forgotten.

**The tiling argument in `solveLayout.ts` is sound.** Children are placed at rounded *cumulative* offsets, and because gaps are integers, `round(x + k) === round(x) + k`. Adjacent boxes therefore share an exact edge and the last child lands exactly on the parent edge — no 1px seams, no drift, no fudge constants. Padding is clamped to `⌊extent/2⌋`, gaps that don't fit shrink proportionally, and over-full fixed tracks are scaled down, so no length is ever negative.

**Both trust boundaries are genuine drop-invalid coercers that never throw.** `normalizeLayoutSpec` (untrusted LLM tree) and `validateElements` (untrusted element list) hand-coerce, clamp every token/weight, enforce every cap, and drop what they can't use. This is what makes the free-form-JSON art-director safe — and the reasoning behind choosing free-form over strict structured output is correct and worth preserving: strict mode rejects the tree's nested unions, which silently forced the seed spec on every page.

**One write pipeline.** Manual, AI, extraction, generation, duplicate and reuse all pass through `normalizeElements` = validate → sanitise → refit. The conditional refit in `normalizeElementPatch` is right: it fires only when the patch could change the fit *and* the client didn't send an explicit `fontSize`, so a colour-only patch never rewrites the size and the client's real DOM measurement is never clobbered by the server's conservative estimate.

**One renderer, three consumers — verified.** `IssuePageCanvas` is the editor's base layer, the public bulletin viewer, and the Puppeteer PDF. The generated gradient background is applied via the `background` shorthand, so it survives all three. Print sizing is derived per page (`px / 150`), not from a shared constant, which is what makes imported pages with their own dimensions print correctly.

**Copy is decoupled from layout.** `remapDraftByRole` keys on the *fine* leaf role (`figure ≠ headline`, `entry ≠ body`), so a layout self-heal costs zero copywriter tokens and a stat figure can't be flowed into the headline slot.

**The worker's rethrow-vs-catch asymmetry is deliberate and correct.** `generateMagazineIssue` clears stale pages up front, so it is idempotent and rethrows to earn queue retries; `generateMorePages` is not, so it catches and restores. Both are documented in place.

**Every fallback logs its reason.** The code explicitly calls out that these swaps used to be silent, which made each one an unexplained short page.

---

## 3. High

### H1 — There are no tests, anywhere in the repo · **FIXED (partly — the deterministic core)**

Test discovery over the whole repository returned nothing: no `*.test.ts`, no `*.spec.ts`, no runner configured. For a subsystem whose entire correctness story is "a pure deterministic solver owns the pixels", the guarantees existed **only as comments**.

This is the highest-leverage gap in v2, because the functions carrying the guarantees are pure, synchronous, dependency-free and trivially testable: `solveLayout`, `fitFontSize` / `estimateTextHeight`, `normalizeLayoutSpec`, `pruneLayoutSpec`, `validateElements`. The code was clearly written expecting tests — `queue.ts:66` says a function is "exported so it can be driven a fixed number of times in tests", and `seedSpecs.ts` describes itself as "parity fixtures" — and they were never written.

Added `apps/server/tests/magazineV2/` — **53 tests across 5 files, all passing** — covering the load-bearing claims:

| File | Covers |
|---|---|
| `solveLayout.test.ts` | exact integer tiling (incl. indivisible weight totals: 3/7/11/13 tracks), containment under nesting, no sibling overlap, stack layers sharing one rect with bottom-up z, non-negative lengths under hostile padding/gaps, sub-`MIN_SIZE` leaf dropping, margin inset, determinism |
| `layoutSpec.test.ts` | never throws on junk, unknown tokens fall back, the global leaf budget, depth/child/stack-layer caps, weight clamping, empty containers dropped, `repairStackLayers` both with and without backing, `contentRef` trim + cap |
| `pruneSpec.test.ts` | empty-text drop, tint-fallback images not counting as content, bare shapes dropped, scrim-survives-with-its-image, panel-survives-with-content-above, the FR-guarantee (and that it skips a non-prose trailing child), null when nothing real remains |
| `model.test.ts` | the H2 bounds invariant, full-bleed untouched, over-sized clamping, non-finite geometry, unknown types dropped without failing neighbours, the element cap, text-field coercion, image SSRF hosts, QR scheme allowlist, per-page dims for imported pages |
| `layout.test.ts` | `fitFontSize` bounds + monotonicity in both copy length and box width, fitted text actually fits, the longest-word guard, empty/tag-only text, newlines, uppercase widening, WCAG contrast extremes, `readableColor` keep-vs-swap, `refitText` touching only shrink+ceiling text |

Run with `npm run test -w apps/server` (**no new dependencies** — `tsx --test` over `node:test`, matching the existing `scripts/` + `check:*` convention). Tests live outside `src`, so `tsc` does not emit them into `dist` (verified).

One test caught a behaviour worth recording rather than changing — see §5, the FR-guarantee note.

### H2 — `validateElements` clamped `x` and `w` independently, so an element could persist off-page · **FIXED**

`model.ts` clamped `x` to `[0, page.width]` and `w` to `[MIN_SIZE, page.width]` as unrelated values. Nothing tied them together, so a `PATCH .../elements/:id` with `{x: 1200, w: 1275}` on a 1275px-wide page validated cleanly and stored an element running 1200px past the right edge. Same for `y`/`h`.

This directly contradicted `writePipeline.ts`'s stated contract ("geometry is clamped to the page"), which is the guardrail every other caller trusts. `validatePageLayout` does catch out-of-bounds boxes, but it only runs inside generation — never on a manual or agent write, which are exactly the paths that can send arbitrary geometry.

The origin is now pulled back so the box always ends inside the page (`x = min(x, width - w)`). Pulling the origin rather than shrinking the box is deliberate: shrinking a text box re-wraps its copy and would fight `refitText` in the same pipeline pass, whereas moving parks a dragged element flush against the edge, which is also what a user expects. Because `w ≤ page.width`, the result is never negative.

### H3 — `locked` was declared in both models and enforced nowhere · **FIXED**

`MagazineElement.locked` exists on the server and the web model. A repo-wide search found it referenced only in those two type declarations and in the `locked: false` literal `composeFromSolved` writes — the element CRUD, all 15 agent tools and the editor canvas ignored it entirely.

Severity note, since it changes what this is: **no code path sets `locked: true`.** There is no lock affordance in the inspector, so no user can reach this today; it is a dormant field, not a live hole. It is still worth closing because `validateElements` faithfully coerces `locked: o.locked === true`, so a hand-rolled API call *can* set it — and an ignored flag is worse than an absent one.

The element PATCH and DELETE routes now refuse a locked element (403), and `stageUpdate` / `delete_element` in the agent return a refusal the model reports back instead of staging a change that would 403 on apply. A patch that sets `locked: false` is allowed through, so unlocking always works. No lock UI was added — that is a feature, not a fix, and was not asked for.

---

## 4. Medium

### M1 — "Add more pages" silently ignored the user's uploaded photos · **FIXED**

`generateMagazineIssue` loads the magazine's uploaded images, builds a `makeUserPhotoPool`, and threads it through every page composer so a user's own photography is placed before anything is generated or sourced. `generateMorePages` called `composeOnePage(...)` **without the pool argument**, so the "add pages matching theme" path went straight to AI image-gen → Pexels → tinted block and never placed a photo the user had uploaded.

Silent, because the parameter is optional. `generateMorePages` now builds the same pool from the same query and passes it, so both generation entry points honour the documented "user photos come first" rule.

### M2 — `change_text_to_image` could stage a bare delete · **FIXED**

The tool pushed its `delete` proposal (and mutated `ctx.working`) *before* building the replacement image element. If `normalizeElements` returned nothing, it returned an error — with the delete already staged. Applying that turn removed the user's text with no photo replacing it.

Reordered: build and validate the replacement first, bail with nothing staged if it fails, then push the delete and the add together. The two-proposal delete+add shape is unchanged, so it still rides the ordinary element-CRUD apply path.

### M3 — A per-magazine chat thread is sent to a per-page agent · **OPEN**

`store.ts` keeps one `chat` array per magazine (loaded from `GET /issues/:id/chat`, which is not page-filtered) and `sendChat` posts the whole thing. So turns about page 7 enter the prompt window when the user asks about page 2. The server caps it at 30 messages × 4,000 chars, which bounds the cost but not the confusion.

Left open because the fix is a product decision, not a bug fix: either filter the sent history to the current `pageId` (loses genuinely useful issue-wide context, e.g. "keep the voice we used earlier"), or keep it whole and label each turn with its page number in the prompt. The second is probably right, but it changes how the agent behaves and should be chosen deliberately.

### M4 — Undo covers element edits only, so "Apply all" is partly irreversible · **OPEN**

`commit()` pushes an `UndoEntry`; `addElement` and `deleteElement` do not, and no page-structure op does. An AI turn that adds three elements and deletes one therefore cannot be walked back with Ctrl+Z — only the *updates* in it can. Documented at `store.ts:8` as inherited behaviour.

Left open because doing it properly means making the undo stack hold typed operations (add / delete / structural) rather than a single before/after element pair, with inverse application per kind. That is a real refactor of the store's undo model and deserves its own pass.

### M5 — `GET /issues` loads every magazine and filters access in JS · **OPEN**

`db.collection(COL.magazines).find()` with no filter, then `.filter(d => roleOnMagazine(d, uid) !== null)` in JS. The N+1 page-count problem was already fixed (one `$group` aggregation), but the magazine scan is still O(all magazines) on every library load.

Left open because the correct fix is a server-side `$or` on `ownerId` / `collaborators.userId` plus an index on both, and adding indexes belongs with the other index work in `lib/ensureIndexes.ts` rather than bolted on here. Not urgent at the current collection size.

---

## 5. Low / accepted

- **Doc drift:** the technical reference says 14 agent tools; there are 15. Corrected in that doc.
- **Single-process assumptions**, all documented in-code and still true: `withIssueLock` and `rateLimit` are in-memory, and the worker's orphan sweep has no heartbeat — `STALE_RUNNING_MS` (5 min) is shorter than a real generation job, which is safe *only* because the sweep runs while the single worker is idle. A second worker requires raising it or adding a heartbeat first.
- **`MAGAZINE_V2_IMAGE_MODEL` is unset** in `apps/server/.env`, so image generation uses the `google/gemini-2.5-flash-image` default. Worth pinning explicitly, given the last prod incident was an invalid model slug in `AGENT_MODEL`.
- **The FR-guarantee promotes the LAST prose-bearing child, not the body.** `pruneSpec.containsProse` counts `body`, `pullquote`, `entry`, `caption` and `subhead`, and the scan runs backwards and breaks on its first hit — so in a `[kicker, body, caption]` track it is the *caption* that gets stretched to fill the leftover strip, not the body. Found by writing the test for it. Left as-is: text is top-aligned, so the slack ends up as empty space inside that box instead of trailing the track, which looks the same either way. Worth knowing before anyone "fixes" it — and the test now pins the part that does matter (the promoted child is always prose-bearing, never a section tag).
- **The leaf budget is consumed depth-first.** `normalizeLayoutSpec` threads a global 14-leaf budget through coercion, so a large early subtree can exhaust it and later siblings are dropped rather than the tree being rejected. Intended (a cap must bind somewhere) but it means a spec can come back structurally lopsided instead of failing loudly.
- **`estimateLines` over-counts a word wider than its box** (`+= floor(wW / box)` gives 3 lines for a word exactly 2× the box). Deliberately conservative — the estimate must never under-report, or text overflows.
- **Layout QA is heuristic**, as the doc says: contrast assumes any image behind text is dark (`#1a1a1a`), overflow uses the estimate rather than real measurement, and overlap only catches same-type collisions. Fine as a ship/don't-ship gate; not a design oracle.
- **Imported source files are world-readable** under `public/`. A deliberate consequence of the `public/`-everywhere decision, already recorded in the technical doc's limitations and in the route's own comment.

---

## 6. Verification

All run after the fixes above.

| Check | Result |
|---|---|
| `tsc --noEmit` — server | exit 0 |
| `tsc --noEmit` — worker | exit 0 |
| `tsc --noEmit` — web | exit 0 |
| `npm run build -w apps/server` | exit 0 |
| `npm run test -w apps/server` | 53 tests, 53 pass, 0 fail |
| `dist/tests` not emitted | confirmed |
| Endpoint count | 35, matching the technical doc exactly |
| Feature flags | `MAGAZINE_V2=true`, `MAGAZINE_V2_AI_LAYOUT=1` |
| Provider keys | OpenRouter, Pexels, S3 all set (`MAGAZINE_V2_IMAGE_MODEL` unset → default) |

**Not verified:** nothing in this pass has been opened in a browser, and no generation run was executed against a live provider. Every fix is server-side and covered by typecheck plus the new tests; the two behavioural changes worth exercising by hand when convenient are the locked-element 403 (no lock UI exists, so it needs a hand-rolled request) and an "add pages matching theme" run on a magazine that has uploaded photos, to see them placed.

## 7. Files touched

| File | Change |
|---|---|
| `lib/magazineV2/model.ts` | H2 — box kept inside the page (origin pulled back) |
| `routes/magazinesV2/index.ts` | H3 — `isLockedAgainst` + 403 on locked element PATCH/DELETE |
| `lib/magazineV2/agent.ts` | H3 — locked refused in `stageUpdate`, `delete_element`, `change_text_to_image`; M2 — replacement built before the delete is staged |
| `lib/magazineV2/generate.ts` | M1 — new `loadUserPhotoPool`, used by BOTH generation entry points |
| `tests/magazineV2/*.test.ts` | H1 — 5 new test files |
| `apps/server/package.json` | H1 — `test` script |
