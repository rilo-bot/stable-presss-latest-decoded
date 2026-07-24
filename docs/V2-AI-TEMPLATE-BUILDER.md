# Magazine Builder v2 — AI-Authored Layout (the Solver architecture)

> **Vision (locked with the user, 2026-07-24):** ONE way to build a magazine — a smart AI agent.
> No static-template path, no deterministic pixel-extraction path. The user clicks **Create**, gets a
> centered prompt + attach (images/docs), **chats**, and the agent builds — starting from an **empty
> page and filling it live, block by block**. PDFs/images are **sources the agent reads** ("take the
> data and build", or "take the layout *and* data and build"), never a digitizer. Every result is
> **modern**, and the agent can compose **any** layout. Hard constraints: **issue-less / bug-free**,
> **no regex, no jugaad (heuristics/hacks)**, users can still **manually edit anything**.
> **Flag:** `MAGAZINE_V2_AI_LAYOUT` (sub-flag of `MAGAZINE_V2`). **Builds on:** Phase 0 (icon element +
> rich typography). Design hardened by a 4-architecture design panel + adversarial critique
> (2026-07-24). Companion: [V2-PARITY-PLAN.md](./V2-PARITY-PLAN.md), [MAGAZINE-BUILDER-V2.md](./MAGAZINE-BUILDER-V2.md).

## 1. The resolution (how "AI designs freely" AND "bug-free" are both true)

> **The AI never emits a pixel. It authors a *relative frame-tree* + *design tokens*. A pure
> deterministic engine (`solveLayout`) compiles that into absolute boxes by recursively partitioning
> the page rectangle, and sizes text boxes from *measured content*. Freedom lives in the AI;
> correctness lives in the engine.**

Two ideas carry it, plus four gap-closers the naive version misses:

1. **Partition ⇒ no overlap / no off-page (structural, provable).** A frame-tree is a recursive
   subdivision of the page rect: siblings tile their parent's content box; children are a strict
   subset of the parent. Overlap and off-page become closed algebraic properties — proved by induction,
   enforced by property tests. The AI can compose *any* tree and still cannot produce an overlapping or
   off-page box, because it doesn't produce boxes at all.
2. **Content-aware sizing ⇒ no overflow.** Tiling bounds *space*, not *content*. A text leaf declares
   `sizing:'content'`; the solver **measures the copy** and grows/shrinks that track to fit **before**
   distributing remaining space by weight. Box size follows copy volume — the way the hand-tuned
   templates do it today, but automatically.

**The four gap-closers (this is why it's genuinely bug-free, not "falls back to a boring template"):**
- **Overflow** → content-aware sizing (above) + measured fit; if copy still can't fit at the floor, the
  solver **splits/paginates** the block rather than clipping.
- **Illegible text over photos** → any text leaf stacked over an image gets a solver-emitted **scrim**;
  contrast is computed against the *known* scrim colour, never a guessed photo luminance. (Retires the
  `#1a1a1a` guess in `templates.ts:328`.)
- **Aspect-ratio dead-space / push** → image leaves are `fit:'cover'` (conform to the solved box, crop
  via focal point); the box stays authoritative, so no letterbox gaps and no sibling push.
- **Bad taste** → the DSL is **bounded** (fixed token scales, capped weights, min track sizes, a
  curated set of layout archetypes as few-shot seeds) so degenerate proportions can't be expressed;
  a design-lint + single bounded re-solve steers quality. *Honest scope: safety is **guaranteed**,
  aesthetics are **steered**.*

**Killing the jugaad you named.** The current "bug-free" mechanism is itself a heuristic:
`advanceRatio` ([layout.ts:36](apps/server/src/lib/magazineV2/layout.ts#L36)) classifies fonts with a
**regex over font-family names** + magic constants, and `validatePageLayout` ships a magic `1.25`
overflow fudge. We replace `advanceRatio` with a **measured font-metrics table** (real average glyph
advances read from the actual font files) — same `fitFontSize` API, principled data instead of a
pattern-match. (The one regex we keep is `toPlain`'s HTML-strip for measurement — the same legitimate
use as `HEX_RE`/`safeUrl`.)

## 2. Target architecture

| Component | File (new unless noted) | Role |
|---|---|---|
| **Layout DSL + Zod schema** | `magazineV2/layoutSpec.ts` | The frame-tree + tokens the LLM emits. Depth ≤4, leaves ≤14, bounded enums, coerce-clamp. |
| **`solveLayout` engine** | `magazineV2/solveLayout.ts` | Pure `LayoutSpec + ContentDoc + theme → px boxes`. Recursive weighted partition + content-sizing + split-on-overflow. The single geometry authority. |
| **`composeFromSolved`** | refactor of `composePage` in `templates.ts` | Solved boxes + fills → raw elements; reuses `fitFontSize`/`readableColor`. Fraction path becomes one caller. |
| **Font-metrics table** | `magazineV2/fontMetrics.ts` | Measured glyph advances per curated font/weight — **replaces the regex `advanceRatio`**. |
| **Art-Director agent** | extend `generate.ts` / `agent.ts` | `generateObject → LayoutSpec` per page; replaces `defaultTemplateForKind`. Seeds as few-shot. |
| **Seed specs** | `magazineV2/seedSpecs.ts` | The 8 current templates re-expressed in the DSL: few-shot exemplars + parity fixtures + offline fallback. |
| **Live build stream** | extend the generate route + `store.ts` | Agent builds block-by-block; each solved step streamed to the client and shown live on the empty page. |
| **Ingestion: content digest** | reuse `documentIngest` | PDF/doc → structured text (data) as `sourceText`. |
| **Ingestion: layout reference** | new vision digest | PDF page raster → vision model → structured layout description → design reference for the Art-Director (for "take the layout and data"). |
| **Ingestion: palette** | `apps/worker/.../palette.ts` | `sharp` median-cut/k-means → `GenPalette`, contrast-repaired. "Pick the theme from this image/PDF." |
| **Centered composer UI** | `editor-v2` / `MagazineV2Home` | Middle-of-screen prompt + attach; the single entry. |
| **Relayout / retheme tools** | extend `agent.ts` | "redesign this page", "make it modern", "change theme" → emit `LayoutSpec`/tokens → solve → CRUD. |

**Where the bug-free guarantee lives** — four deterministic layers, none of them the LLM:
1. **Partition** (`solveLayout`) — non-overlap + on-page, structural.
2. **Content-aware sizing + measured fit** — boxes follow copy; font only shrinks; split on true overflow.
3. **Auto-scrim + `readableColor`** — legibility against a known colour.
4. **Existing net kept intact** — `normalizeElements` (validate→sanitize→refit) + `validatePageLayout` +
   `SAFE_TEMPLATE`. Even a solver bug degrades to a clean page.

## 3. What the LLM outputs (typed, not parsed)

A single Zod-validated object via `generateObject` — the discipline `planIssue`/`draftPage` already use.
Two decoupled halves so "restructure" and "rewrite copy" are independent:

**`LayoutSpec`** — relative structure, **no coordinates**:
```jsonc
{ "page": { "background": { "ref": "text" }, "margin": "lg" },   // dark full-bleed now expressible
  "root": { "kind": "stack", "layers": [
    { "kind": "leaf", "role": "image", "contentRef": "hero", "fit": "cover" },
    { "kind": "col", "gap": "sm", "pad": "lg", "justify": "end", "children": [
      { "sizing": "content", "node": { "kind": "leaf", "role": "kicker",   "contentRef": "kicker", "colorRef": "accent", "fontRef": "body" } },
      { "sizing": "content", "node": { "kind": "leaf", "role": "headline", "contentRef": "title",  "colorRef": "bg", "fontRef": "display", "weightHint": 800 } },
      { "sizing": "content", "node": { "kind": "leaf", "role": "subhead",  "contentRef": "sub",    "colorRef": "bg", "fontRef": "body" } }
    ] } ] } }
```
**`ContentDoc`** — leaf-keyed copy/briefs: `{ "hero": {"imageBrief":"lone rider, dawn"}, "title": {"text":"The Long Ride Home"}, ... }`

**Node union:** `col`/`row { gap, pad, align, justify, children:[{weight, sizing:'fr'|'content', node}] }` ·
`stack { layers:[node] }` (the one sanctioned overlap — z-layers on one rect) ·
`leaf { role, contentRef?, colorRef?, fontRef?, weightHint?, align?, fit?, aspect? }`.
Every AI-touched dimension is a **weight**, a **content flag**, or a **token** — never a pixel. Out-of-range
values coerce-clamp exactly as `model.ts` already does. **Not regex/jugaad:** the model speaks a typed
object; geometry is real weighted rectangle-partition (the flexbox family); every value is schema-bounded
and page-clamped. No "if it looks wrong, nudge N px" path exists.

**Scope cut that keeps the solver correct:** row/col/stack **flex-partition only** — no general CSS-grid
track-sizing (the most bug-prone algorithm in layout engines). Grid-like results come from nesting.

## 4. The build loop (single path, live)

1. **Create** → canvas opens in an **empty-page** state with a centered prompt + attach (images/docs) + voice.
2. **Ingest** (if attached): content digest → `sourceText` (data); optional **vision layout-reference**
   ("take the layout") → structural hints; optional **palette** ("pick the theme"). All principled — real
   parsers + colour quantization + structured LLM output; **no pixel extraction, no regex**.
3. **Build live** — the Art-Director agent works **incrementally on the empty page**: each step it extends
   the page's frame-tree, the solver **re-flows the whole page**, and the client **renders the new state
   live** (blocks appear as the agent narrates). At no instant can the page be broken — the solver, not the
   agent, owns the pixels, so every intermediate state is already valid.
4. **Edit** — identical to today: solver output is plain `MagazineElement[]`, so drag/resize/inspector/undo
   and per-element rev-guarded CRUD work unchanged. Chat edits ("make it modern", "change the theme",
   "rework this page") and manual edits share the one write path + undo stack.

**Live mechanism:** the generate route streams solved page states (SSE/chunked) keyed by page; the client
applies each to the store and re-renders. Direct-apply + streaming (not staged), so the build is visible.
Default to genuine block-by-block (agent extends → solver reflows → stream); a "plan then reveal" animation
is an option if we want it snappier.

## 5. Ingestion — principled, source-only (no pixel extraction)

- **Data** ("extract the data and build") — `documentIngest` (vision OCR / text walk) → plain text →
  `sourceText` into the agent. The copywriter draws real names/figures/quotes into the `ContentDoc`; the AI
  designs a fresh modern layout around them. **Fidelity guard:** for any `figure`-role leaf, assert the
  emitted figure is a substring of `sourceText`; on miss, drop/flag. A containment check, not a parser.
- **Layout reference** ("take the layout and data") — rasterize the PDF pages → a **vision model** returns a
  *structured* description of each page's composition (hero position, column count, hierarchy) → fed to the
  Art-Director as a **design reference** it reproduces in its own frame-tree, modernized. Structured output,
  not coordinate scraping.
- **Theme** ("pick the colours/theme") — worker `palette.ts` decodes the raster with `sharp` → median-cut /
  k-means → dominant clusters → role assignment (bg=lightest, text=darkest, accent=most-saturated) → every
  pair run through the existing `contrastRatio`/`readableColor` so legibility holds. Hex from real pixels,
  never an LLM guess. User can override in the inspector.

## 6. What changes vs today (honest)

**The invariant is relocated, not broken.** Restate [MAGAZINE-BUILDER-V2.md](./MAGAZINE-BUILDER-V2.md) §2:
> *No LLM output is ever interpreted as a coordinate/size/z in page pixels. Geometry is produced only by the
> deterministic `solveLayout` over an AI-authored relative frame-tree + tokens, then clamped by the validators.*

A strict generalization: the AI's surface widens from "pick 1 of 8 templates + fill slots" to "author a
frame-tree" — and it still never emits `x/y/w/h`.

- **Retired from the product (single-path decision):** the static-template pick flow and the MuPDF
  *pixel-faithful element-extraction* path. PDFs now flow through the ingestion reads above. (Extraction code
  may linger dormant, but it is not an offered path.)
- `composeOnePage` swaps `defaultTemplateForKind` → Art-Director `LayoutSpec` → `solveLayout` → `composeFromSolved`.
- `composePage` refactored to resolve a slot against an explicit px box (fraction + solved paths share it);
  **snapshot-parity gate before any AI change**.
- `draftPage`'s regex id-hints (`/^stat\d/`, `generate.ts:318`) replaced by the leaf's schema `role` — kills
  another jugaad.
- `#ffffff` hardcoded background and `#1a1a1a` photo assumption retired (token background + auto-scrim).
- **Reused wholesale:** the element model (incl. Phase-0 icon + `letterSpacing`/`textTransform`); the
  `writePipeline` normalize path; `fitFontSize`/`readableColor`/`refitText`; `validatePageLayout` + `SAFE_TEMPLATE`
  (kept as the backstop, **not** demoted); `curateFills`/`mapWithConcurrency`/graceful degradation; the chat
  agent's staged/CRUD plumbing; the whole editor; the worker queue.

## 7. Incremental roadmap (small, flag-gated; ✅ Phase 0 done)

1. **DSL + schema** (`layoutSpec.ts`): frame-tree + tokens + `ContentDoc`, depth/leaf caps, coerce-clamp. Pure types, unit-tested. No behaviour change. **← start here**
2. **`solveLayout` + property tests**: pure weighted partition (row/col/stack), last-child rounding absorption. Fuzz thousands of trees; assert always-tiles / never-overlaps / never-escapes. Ships dormant.
3. **Content-aware sizing + split-on-overflow** in `solveLayout`. Property test: no overflow on realistic copy volumes.
4. **Refactor `composePage` → explicit px + `composeFromSolved`**; re-express the 8 templates as `seedSpecs`; route them through `solveLayout` and **snapshot-assert pixel parity** with today. Proves the pipe; output identical.
5. **`fontMetrics.ts`** — replace the `advanceRatio` regex with measured metrics. Same API. Kills the load-bearing jugaad.
6. **Art-Director `generateObject` agent** (seeds as few-shot); replace `defaultTemplateForKind` behind `MAGAZINE_V2_AI_LAYOUT`. **First AI-authored layouts.**
7. **Auto-scrim + token background** in `composeFromSolved`; retire `#1a1a1a`/`#ffffff`. Unlocks dark/full-bleed + guarantees over-photo legibility.
8. **Centered composer UI** + **live build streaming** (empty page → agent builds → stream solved states → client renders live).
9. **Ingestion**: content digest wired to `sourceText` + `figure` fidelity guard; palette-from-image (`palette.ts`); vision layout-reference.
10. **Relayout / retheme tools** in `agent.ts` (focused page or whole issue → `LayoutSpec`/tokens → solve → CRUD).
11. **Design-lint + bounded re-solve** for taste; telemetry on SAFE-fallback rate.

Tasks 1–3 are pure/dormant and safe to land regardless. Real risk concentrates in 4 (parity refactor) and 6
(quality) — both flag-gated with A/B against the fixed-template baseline.

## 8. Risks & mitigations

- **Overflow (the #1 real bug):** content-aware sizing + measured fit (`fontMetrics`) + split-on-overflow;
  residual borderline copy still degrades cleanly via the untouched QA→SAFE net.
- **Illegible over photos:** structural auto-scrim + contrast vs known colour.
- **Dead-space / push from images:** `fit:'cover'` conforms image to box; no letterbox, no push.
- **Taste isn't provable:** *safety guaranteed, aesthetics steered* — bounded DSL, 8 seeds as heavy priors,
  design-lint + one re-solve. Worst case is a valid but plain page, never a broken one.
- **Solver correctness is load-bearing:** row/col/stack scope cut, property fuzzing, seed-parity snapshots,
  and the validate→QA→SAFE backstop.
- **Data fidelity from PDFs:** substring containment guard on figure leaves; the AI re-designs around data, it
  does not claim pixel reproduction.
- **Live-stream latency/cost:** reuse `mapWithConcurrency` + graceful degradation; retheme/relayout reuse the
  compiler without a copywriter call.

**Bottom line:** one path — the agent — authoring a bounded frame-tree that a deterministic solver turns into
always-valid, always-modern pages, built live on an empty canvas. Freedom in the AI, correctness in the engine.
