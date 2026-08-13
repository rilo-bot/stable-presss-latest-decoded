# Magazine Builder v2 — the plan to make it actually good

**Locked 2026-08-13.** Direction agreed with the client-side ask: *"upload an image or a
PDF and say build the page like this — the layout, the structure and the colours; give the
AI more power; make it modern and unique; and let it know how much room the text needs."*
Plus the standing complaint about today's output: *"it builds ok-ok magazines, sometimes
adds too-big elements, and shows more space than elements."*

**This document supersedes the build order in
[MAGAZINE-V2-QUALITY-PLAN.md](MAGAZINE-V2-QUALITY-PLAN.md)** and absorbs its phases 1–3 into
§6 here. That plan's diagnosis was right and none of it was ever built; this one is
sequenced so that each phase is verifiable on its own and cannot silently regress.
It depends on the confirmed defects in
[MAGAZINE-V2-LAYOUT-FROM-REFERENCE-REVIEW.md](MAGAZINE-V2-LAYOUT-FROM-REFERENCE-REVIEW.md).

Nothing in here is built yet. §11 lists the five decisions needed before Phase 1 starts.

---

## 1. The diagnosis

Everything in this section was verified against the code on 2026-08-13, not inferred.

### 1.1 The measurement already exists. The AI never sees it.

[fontMetrics.data.ts](../apps/server/src/lib/magazineV2/fontMetrics.data.ts) is 8,256 lines
of real per-glyph metrics. `measureRunWidthPx` and `estimateTextHeight` give exact wrapped
dimensions, and [measureLeaf.ts](../apps/server/src/lib/magazineV2/measureLeaf.ts) already
sizes a box to precisely the space its words need.

So *"can the AI know this text's width and height?"* — the machine can, to the pixel,
deterministically. But the art director authors the **entire layout tree before anything is
measured**, and `measureLeaf` only activates on leaves the model happened to mark
`sizing:"content"`. Copy is then written to a **static per-role character budget**
(`CHAR_GUIDE` — headline 80, body 1400, caption 140 — [generate.ts:379](../apps/server/src/lib/magazineV2/generate.ts#L379))
that has no relationship to the box the words will land in.

The AI is designing blind, then being surprised.

### 1.2 "Too big elements" and "more space than elements" are one mechanism

Three defaults compound:

1. **`fr` weights always fill their container.** Any fr track consumes the remainder, so a
   headline band at weight 3 of 10 takes 30% of the page height whether it holds three
   words or thirty.
2. **The prompt forbids emptiness.** *"The root must cover the whole page; never leave a
   large empty region"* ([generate.ts:1079](../apps/server/src/lib/magazineV2/generate.ts#L1079)).
   The model is instructed to inflate boxes until the sheet is covered.
3. **Type ceilings are per-role, never per-context.** `headline` maxes at 96px — **46pt** at
   this page scale. Correct for a cover opener, absurd on an interior page, and nothing in
   the system distinguishes the two.

Result: a three-word headline in a box occupying a third of the page, set at 46pt, ringed
by air. That is exactly the reported symptom, and it is a wiring problem — not a weak model.

### 1.3 Nothing anywhere evaluates whether a page is good

[layoutValidate.ts](../apps/server/src/lib/magazineV2/layoutValidate.ts) is the only QA, and
it checks exactly three things: boxes off the page, same-type overlap above 20%, and text
still overflowing after fitting. All three are **catastrophe** checks.

There is no measure of density, whitespace balance, grid alignment, type-scale discipline,
contrast, or focal-point respect. **"This page is ugly" is not a failure condition anywhere
in this codebase.** The retry loop at
[generate.ts:1120](../apps/server/src/lib/magazineV2/generate.ts#L1120) works and feeds a
hint back to the model — but it only ever fires on catastrophe, so mediocrity always ships.

This is the same diagnosis the quality plan gave a year of work ago: *"every page is
designed in isolation and nothing ever looks at the output."*

### 1.4 The freedom paradox

Canva's output looks professional because its AI has **less** freedom over geometry, not
more: drawn grids, locked type scales, fixed spacing, and AI deciding content, crop and
hierarchy. Our art director already has **more** geometric latitude than Canva's, and that
latitude is why the output reads as amateur.

So the client's ask — *give more power to the AI* — is right in intent and must be
implemented as **more editorial power, less pixel power**:

| AI should decide | AI should not decide |
|---|---|
| which photo, and where its focal point is | fr weights and fractions |
| what the words say, and the hierarchy | absolute type sizes |
| which strong skeleton this page wants | gap and margin values ad hoc |
| how this issue's look differs from the last | whether a page may be 60% empty |

Every "should not" item becomes a **derived** value in this plan: measured, or chosen from a
locked scale. That is what buys beauty, and it is also what removes whole families of bugs.

### 1.5 Why the bugs keep coming back

This is the part that matters most for *"finally make it bug-less."*

The layout-from-reference feature was fixed three times for the same underlying cause and
regressed each time, because each fix was **shape-specific**. The review found the cover bug
still has **four** live entrances. Meanwhile:

- the cover test's fidelity assertions **still pass with the bug re-planted**;
- `pruneSpec.test.ts` never passes `keepWhitespace`, the flag added to fix it;
- the fidelity score — the instrument meant to catch exactly this — has a **~91% floor** on
  any full-bleed cover and reported "matched" on every ruined page measured.

The pattern is not carelessness. It is that **the guard was written from the example rather
than from the mechanism**, and the same pattern produced the ESLint-hooks white-screen and
the fake `magazine.publish` gate. §10 makes the counter-measure a rule rather than an
intention.

---

## 2. Invariants this plan locks

These do not change in any phase. A change request that breaks one is a re-plan, not a task.

1. **The solver stays the sole pixel authority.** The AI emits a frame tree; `solveLayout`
   compiles it. Overlap and off-page remain structurally impossible. No phase here gives any
   model x/y/w/h.
2. **Every quality claim is a measured number, never an assertion.** If we tell the user a
   page matched, is legible, or is balanced, a function computed it and a test pins it.
3. **Derived beats stored.** No migration is introduced until every phase is done; new
   fields are read-through with defaults (the standing project rule).
4. **A user's words and photos are never silently lost.** Content that cannot be placed is
   counted and reported.
5. **We never take a reference's photos or copy.** Structure, proportion, margins, column
   count, emphasis — and with §8, optionally colour. Never the assets.
6. **Nothing ships on a typecheck.** Anything that changes rendered output is reviewed as
   rendered pixels (§10.4).

### 2b. REVERSED BY THE CLIENT, 2026-08-13 — "the AI decides everything"

§1's freedom paradox argued for **more editorial power, less pixel power**, and named the
11 archetypes' advisory status as the thing to tighten. The client has read that and decided
the opposite: *"I want the AI to decide everything… AI will decide, think and will make the
modern magazines."* The concern was put once, reaffirmed, and is therefore settled — it is
their product.

What that changes, and what it does not:

- **Type, colour and spacing ladders are gone as constraints.** The art-director names sizes
  in points, exact colours per leaf, arbitrary spacing, tracking and capitals. The tables in
  `roleScale.ts` become DEFAULTS for leaves that decide nothing.
- **The caps rose** (14 → 28 leaves, depth 4 → 6, 8 → 12 children) so modules are expressible.
- **The archetype-by-page-number rotation is gone**; the model picks or invents.
- **Invariant 1 stands, and is not in tension with this.** "Decides everything" is about
  design, not coordinates: the model still emits a tree and the solver still compiles it,
  which is precisely why more freedom is affordable — the failure mode of a bad decision is
  an ugly page, never a broken one.
- **Two floors stay, because they are not opinions.** Prose below 8pt cannot be read off
  paper, and ink that vanishes into its ground is a bug however deliberately it was chosen.

**And the half that makes it work:** freedom was shipped WITH feedback, in the same change.
An agent that cannot see its own page does not improve when handed more decisions — the run
that produced a one-element cover twice proved that. See §4c.

---

## 3. Phase 0 — Make the instruments honest

**Why first:** every later phase is graded by these two things. Tuning beauty against a
score that reports 92% on a ruined page, or shipping a builder that can blank a page, wastes
whatever comes after.

Scope is exactly the confirmed review findings that destroy a page or lie about one.

| # | change | file |
|---|---|---|
| 0.1 | `themeForPage` must never return `bg === text`. White type over a photo derives white ink correctly, then `bg` falls to `#ffffff` because `background.type === 'color'` is false for an image — the page comes out blank. Guard: when derived ink equals derived bg, take bg from the page's dominant non-ink colour, else invert to the ink's contrast pair. | [applyLayout.ts:84](../apps/server/src/lib/magazineV2/applyLayout.ts#L84) |
| 0.2 | Fidelity must stop floating on one full-bleed region. Cap any single slot's weight (proposal: no slot exceeds 40% of total weight), fold `missing` into the mean as its own doc comment already claims, refuse `matched` when the largest **text** slot is under 0.5 IoU, and make the verdict aspect-aware. | [layoutFidelity.ts:115](../apps/server/src/lib/magazineV2/layoutFidelity.ts#L115) |
| 0.3 | Delete the palette swatches from the reference panel **or** implement §8.3. Showing three detected colours for a feature that never applies them is a promise the build breaks. | [LayoutReference.tsx:195](../apps/web/src/editor-v2/LayoutReference.tsx#L195) |
| 0.4 | Move the confirm and the aspect warning into `store.applyLayout`, so the chat path gets both. Fix the comment at store.ts:1110 that claims this is already true. | [store.ts:731](../apps/web/src/editor-v2/store.ts#L731) |
| 0.5 | Re-verify the 25 unverified review findings, test-quality set first — it governs whether any of this stays fixed. | review doc |

**Exit criterion:** the four probe scenarios in the review (side-by-side cover, single line
over a photo, landscape-on-portrait, white-on-photo import) each produce either a correct
page or a verdict that is **not** `matched`. Both stated as tests.

**Guard:** `npm run check:fidelity` — asserts the score's mathematical properties on
synthetic cases, including that no single slot can carry the verdict.

### Phase 0 AS BUILT — 2026-08-13

223 tests (up from 210), `check:fidelity` added, both typechecks and both builds clean,
`check:hooks` / `check:studio` / `check:permissions` green. **Three of the five items were
not built the way this plan specified**, in each case because measurement contradicted the
prescription. The plan was wrong, not the code; the reasoning is recorded here so the next
person does not "fix" it back.

**0.1 done — and widened from the example to the family.** `themeForPage` guards every ink
that resolves against the ground, not just `text`: captions resolve through `secondary` and
kickers through `accent`, so guarding `bg !== text` alone would have left an invisible
caption on the same page. **The ground moves, not the ink** — white type exists *because* it
sat on a photograph, so repainting the words dark would be legible and would throw the
design away; only a mid-tone ink that reads on neither ground causes the ink itself to move.
The threshold is **invisibility (1.6:1), deliberately not WCAG AA**: this product's gold
accents sit at ~2.1:1 on white by design, and enforcing AA here would silently recolour
every magazine. That is [THEME-REVIEW.md](THEME-REVIEW.md)'s work, and there is a test
pinning gold-on-white as untouched so this guard cannot grow into it.

**0.2 done, but NOT by capping slot weights.** Capping was tried first and **two existing
tests correctly rejected it**: a misplaced hero photo *should* be able to condemn a page,
and a cap is symmetric, so it broke that case to fix the cover. The real defect was
narrower — measuring an outcome that could not have been otherwise. A backing layer that
fills both the reference and the page scores IoU 1.0 *by construction*, so it is now
excluded from the mean (`isGuaranteed`), which leaves the score to the slots whose
placement was a real decision. Added on top: a veto when the biggest piece of type misses
(`TEXT_MATCH_MIN`), itself limited to type worth measuring (`TEXT_VETO_MIN_AREA` — IoU is
brutal on small boxes, and an unrestricted veto fired on a caption 2% out), plus the
aspect veto, and the sentence now names which veto fired.

**0.2 deviation — `missing` stays OUT of the mean.** The plan said to fold it in. Doing so
was measured on the cover fixture and took a page that *is* recognisably the reference
(photo full-bleed, cluster in the top quarter, one reference box with no content) from
**0.60 to 0.39** — from "adapted" to "the arrangement could not be reproduced", which is
false. So the score answers "what we placed, did it land right?", `missing` vetoes
"matched" outright and is named in the sentence, and **the doc comment that claimed
otherwise was corrected instead**. Two questions, two answers.

**0.3 done as a third option.** Neither deleted nor implemented: the swatch caption read
*"kept out of your palette unless you ask"* and there is no way to ask, so it now states
what happens — *"not used — this page keeps its own colours"*. The broken promise is gone
and the observation the user might want is kept, with no churn when §8.3 lands.

**0.4 smaller than written.** The aspect warning was **already** shared — the route returns
it to every caller and `store.applyLayout` toasts it. Only the confirm was missing, so it
moved out of `LayoutReference.tsx` into `store.applyLayout`, and it now **names the page**
("Rearrange page 2 into that layout?") because from chat you may not be looking at the page
you are about to replace. The comment claiming a shared confirm was corrected.

**0.5 NOT done — blocked.** Re-verifying the 25 unverified review findings needs another
agent fleet, and the org is at its monthly spend limit. Still the first task when budget
allows, test-quality set first.

**Evidence the guards work:** per §10.2 both bugs were re-planted and `check:fidelity` was
observed going **red** on the right property each time — "A page whose biggest type did not
land was reported as MATCHED" for the fidelity re-plant, "A derived palette put an invisible
`text` on its own ground" for the palette re-plant — then green again after reverting.

**One recalibration worth knowing about:** the cover test's `score > 0.75` was an artefact
of the bug. Measured honestly, that page is kicker 0.67, headline 0.66, **subhead 0.00** →
0.60; the old 0.96 was almost entirely the guaranteed photo. The assertion is now
`> 0.5 && < 0.9`, the upper bound existing specifically to catch the flattery returning.

---

## 3b. The `spacer` primitive — BUILT 2026-08-13 (§11.1, decided)

**Decision taken: neither of §11.1's options.** Intrinsic container sizing in `solveLayout`
would have touched the sizing maths every generated page depends on, and it still could not
have fixed the image case (an image has no intrinsic height). The narrow patch would have
closed one of four entrances. The actual gap was smaller and more fundamental than either:
**the DSL had no way to say "this space is empty on purpose."**

`spacer` is a leaf that takes its `fr` share and renders nothing. Three small changes —
`LEAF_ROLES` accepts it, `pruneSpec` keeps it in flow (and drops a container that holds
nothing else), `composeFromSolved` emits no element for it. `solveLayout` is untouched.

### What it closed

All four entrances of the cover bug, each now a named test:

| entrance | was | now |
|---|---|---|
| 1 — one line of type over a full-bleed photo | `stackFor` short-circuited to a bare leaf, and a stack layer gets the whole rectangle: a title read at y 0.78 became a page-height box | `partition` → `placeOne` wraps it between spacers; lands at y 0.78 |
| 2 — a side-by-side pair in the cluster (**the reported bug**) | that band is a container, content sizing is ignored for containers, so `justify` died and the masthead came out **1060px tall on a 1650px page** | **y=121, h=121** — top quarter, right size |
| 3 — an image/qr/icon in the cluster | content sizing is a no-op on those, so one small photo took an fr share and swallowed the empty half | clustered |
| 4 — an inset photo promoted to a stack layer | every layer gets the whole rectangle, so a photo covering a third of the reference came out full-bleed **over** the hero | only a photo covering ≥`FILLS_RECT` is backing; scrims are exempt because a shape is decorative backing whatever its size |

### Two things measurement forced, against the obvious design

**Spacers are NOT used when every child is a text leaf.** A container carries ONE `gap` and
the solver puts it between every pair of children — including between a spacer and the
cluster. On the cover fixture that inserted an extra 60px above the masthead and dragged
every band down: **0.60 → 0.30**, measurably worse than the content-sizing path it replaced.
So `anchored()` picks by child type: all-text-leaves → content-size + `justify` + `pad`
(which is not a child, so no gap); anything else → `fr` + spacers. Both paths are live and
both are load-bearing.

**The root rect is the page's CONTENT area, not the sheet.** The solver already insets by
`page.margin` and the reading's boxes are absolute, so measuring clear runs against the sheet
counted the margin twice and pushed everything below where the reference had it.

### The honest catch — thresholds are now stale, and I have not touched them

Excluding the guaranteed full-bleed photo (Phase 0) **shifted the whole score distribution
down**, and `MATCHED_AT` (0.72) / `ADAPTED_AT` (0.45) were calibrated when that photo was
inflating every number. So pages that are now structurally correct report low:

| page (structurally correct after this change) | score | verdict |
|---|---|---|
| cover, side-by-side pair | 30% | loose |
| cover, photo in the cluster | 32% | loose |
| title across the bottom third | 60% | adapted |

Those verdicts are wrong in the *opposite* direction to the old ones. The cause is known and
specific: IoU is brutal on thin bands (an 8%-tall masthead 4% out loses half its overlap),
and a text band is structurally forced to the full cross width while the reference's was
84% — so the metric penalises a DSL decision rather than a mistake.

**I have deliberately not re-tuned the thresholds**, because picking numbers that make four
probe cases look good is precisely the unprincipled tuning Phase 0 exists to stop. The right
fix is Phase 2's labelled set: rank ~40 pages by eye, then derive thresholds (and probably a
main-axis-weighted metric) that agree with the ranking. **Until then the verdict word
understates a correct page, and that is the known state.**

## 4. Phase 1 — Fit before beauty

**Goal:** kill *"too-big elements"* and *"more space than elements"*. This is the phase that
changes what the client sees, and it is mostly rewiring parts that already exist.

### 4.1 Flip the sizing default

Text leaves become **content-sized by default**; `fr` is reserved for images, panels, and
the one intentionally-flexible body column per page. `measureLeaf` already does the work —
it just needs to be reached.

Consequence to design for: content sizing currently applies **only to leaf children**
(`resolveMainSizes`), which is why the reference feature's cover fix has four holes. Either
§11.1 resolves that in the solver, or Phase 1 must additionally wrap clusters so the
condition is always met. **This is the decision in §11.1 and Phase 1 cannot start without
it.**

### 4.2 Tell the AI the actual room

A first weight-only solve **already runs** for photo curation
([generate.ts:913](../apps/server/src/lib/magazineV2/generate.ts#L913)). Extend it into a
measured brief and hand the numbers to both models:

- to the **copywriter**, replace `CHAR_GUIDE`'s static budgets with the real one:
  *"`headline` box is 940×300px; at its 96px ceiling that is ~18 characters before it
  shrinks."*
- to the **art director** on retry, the same numbers as feedback:
  *"`body` needs 1,240px of height at 19px minimum; you allotted 700px."*

This is what "the AI knows the text's width and height" means concretely — not a new
capability, a new input.

### 4.3 Replace "never leave a large empty region" with a whitespace budget

A target fill ratio per page kind, with a tolerance band rather than a rule: an opener or a
statement spread may be 40–55% empty; a feature-well page may not exceed ~25%. Emptiness
stops being a defect and becomes a **budget the page is measured against** — which is also
what makes a page look designed rather than packed.

### 4.4 Context-aware type ceilings

The 96px headline ceiling applies per page kind and per leaf area: a headline occupying 8% of
the page cannot be set at the cover ceiling. Derived from the solved box, not chosen.

**Exit criterion:** on a fixed corpus of 20 generated pages, mean fill ratio inside its
band, zero pages with a text element under 40% filled by its own copy, and no headline above
its context ceiling.

**Guard:** `npm run check:density` over that corpus.

---

## 4b. Phase 1.5 — Density, furniture and modules (added 2026-08-13)

Added after comparing a real generated issue (`Good-Morning-Horse.pdf`, 5 pages) against the
quality target the client supplied (`Bulletin 1 PDF.pdf`, NZTROF, 13 pages). The verdict was
*"all clear but it looks lame and not much modern"*, and the cause is **not** the thing
Phase 1 fixes. Phase 1 is about boxes being the wrong size; this is about there being almost
nothing on the page.

### Counted, not eyeballed

| | our pages | the reference |
|---|---|---|
| elements per page | **1, 7, 6, 7, 7** | **40–85** |
| page furniture (section bar, tagline, folio) | **none, on any page** | on every page |
| repeated modules (stat card, icon+label+text, numbered step, labelled photo, quote block, logo row) | none | 5–20 per page |
| data devices (table, donut, pyramid, cycle diagram) | none — `ELEMENT_TYPES` is `text/image/shape/qr/icon` | several per spread |

Our cover is **one photograph with no words on it at all**. The reference cover has a
masthead, a two-tone title, a standfirst, a five-item "INSIDE THIS ISSUE" list, a badge, a
QR card, a six-logo partner row and a footer — roughly 25 elements.

### Three separate causes, in order of impact

**1. Nothing asks for density, and the AI is not even using the budget it has.**
`isTooSparse` ([generate.ts:630](../apps/server/src/lib/magazineV2/generate.ts#L630)) rejects a
page only when it has fewer than **2** meaningful elements. Two. So a 6-element page is a
pass, and the art director — allowed 14 leaves — produces 7. The retry hint for sparseness
exists and works; the bar it defends is just far too low. **And `cover` is exempt from the
check entirely**, which is exactly how a cover with zero words shipped.

**2. `MAX_LEAVES = 14` makes reference density arithmetically impossible.**
Even at full budget we reach a quarter of the reference. Worse, the reference's characteristic
device — a row of five icon+label+text cards — is **15 leaves on its own**, so it cannot be
expressed at any budget. (Depth is fine: root → row → card → leaves is exactly the depth-4
limit. The binding constraint is leaves, not depth.)

**3. There is no module vocabulary, so richness costs 3–4 leaves per item.**
What makes the reference look professional is not many primitives — it is a handful of
**repeated modules**. In our DSL each one must be assembled from separate leaves, which is
why the budget runs out before the page looks designed.

### What to build

**(a) Page furniture — deterministic, not AI, not from the leaf budget.** A header band
(section label from `page.kind`, right-aligned tagline from the plan) and a footer (tagline +
**page number**) added by the compose step. `pageNumber` is already threaded through
generation and used only in prompts — it is never drawn. This is the cheapest thing on this
list and the single biggest "looks like a publication" gain, because it repeats on every page.

**(b) Raise the density bar and the cap, together.** `isTooSparse` becomes a real
per-page-kind minimum (a feature page is not a pull-quote page), the art-director brief asks
for a target element count, and `MAX_LEAVES` goes to ~40 with `MAX_CHILDREN` to ~12.
**The cap may only rise together with Phase 1's fit work and Phase 3's type floors** — 40
boxes sized by guessed proportions, with a 6.7pt floor, is worse than 7 good ones, not better.

**(c) Composite leaves — the real fix.** One leaf that renders a group:
`statCard` (icon + value + label), `iconNote` (icon + title + text), `stepItem` (number +
title + text), `labelledPhoto` (image + label bar inside it), `quoteBlock` (mark + text +
attribution), `logoRow`, and later `dataTable` / `donut`. A five-across icon row then costs
**5 leaves instead of 15**, and the AI composes at the level a designer actually thinks at.
This is also what makes (b)'s raised cap safe, because density arrives as designed units
rather than loose boxes.

**(d) Two-tone headlines.** The reference's signature device ("BE PART OF / **SOMETHING
EXTRAORDINARY**", navy over gold) appears on nearly every page. One leaf property — colour
the last N words in the accent — not two leaves.

**(e) Icon contrast.** Page 5 of our issue put purple outline icons on a purple field: all
but invisible. Same family as Phase 0's palette guard, and it belongs in the same function.

**(f) Two typography rules the sample breaks.** Long prose is centred on page 5 (never
correct for a paragraph), and page 2 sets body copy in one full-width column — a measure far
past the ~65-character comfortable maximum. Both are Phase 1 rules; noted here because the
sample makes them visible.

### On "icons and emojis"

We already have a curated **75-glyph Lucide registry**
([icons.ts](../apps/server/src/lib/magazineV2/icons.ts)) including horse-racing customs, so
the vocabulary is not the gap — the gap is that icons are used as lone leaves rather than
inside modules, and without a contrast rule. Worth being direct with the client: what the
reference actually uses is **icons, not emoji**. Emoji render inconsistently in print, carry
another vendor's visual style, and would undercut exactly the premium feel being asked for.
The wanted effect comes from (c) and (e).

### The three that ship first

**(a) furniture, the `isTooSparse` bar, and the cover exemption are independent of Phase 1**
and visibly change every page. They should go first, before the Phase 1 foundation work,
precisely because the client's complaint is visual and those three are same-day.

### Phase 1.5a AS BUILT — 2026-08-13

Built: `pageFurniture.ts`, `pageDensity.ts`, `renumberFolios.ts`, one seam in
`composeOnePage`, and a new guard `npm run check:pages`. **249 tests (was 232)**; typecheck,
build and all five guards green. Where the build differs from the prescription above, the
reason is recorded here so nobody "fixes" it back.

**1. A running head and a folio, NOT a coloured band.** The plan said "header band"; what
shipped is a section label plus the masthead over a hairline rule at the top, and a rule with
the page number at the foot. A filled band would have to sit *over* the content area to read
as a band, and the entire safety argument below rests on furniture occupying only space that
is provably empty. A band is a Phase 3 decision, taken with the grid.

**2. THE BANDS ARE MEASURED, NEVER ASSUMED — and that is not a stylistic preference.**
`freeBands()` reads the composed elements and reports the clear space at each edge; on the AI
path that is the margin the solver inset by, on the template path it is whatever the template
left. Re-planting the obvious shortcut (assume the default `md` = 36px margin) put a folio and
a running head **on top of a full-bleed hero in 4 of the first 25 random pages**. Each end is
decided independently, so a page with a photo bleeding off the top still keeps its folio.

**3. The ground must be KNOWABLE, and a gradient has three answers.** A page whose background
is an image (any imported/rasterised page) or a paint we don't parse gets no furniture at all,
because the alternative is guessing at contrast. Where the ground is known, the ink is checked
against **every** stop of `backgroundPaint`'s three-stop gradient. **The single-stop version
passed my first test** — the fixture's stops were all dark, so a rejected ink fell back to a
colour that happened to work everywhere. The counter-example had to be searched for
numerically: a `#a8bdb0` ground flatters the primary at 3.97:1 on the middle stop while it
falls to 2.44:1 on the dark one, and a palette extreme would have held 5.70:1 on the worst of
the three. The test now asserts that property, not a fixed threshold.

**4. THE FOLIO IS AN ELEMENT, NOT RENDERER CHROME — a deliberate trade.** `IssuePageCanvas`
is the single renderer (editor base layer, page rail, public viewer, and the PDF, which
Puppeteer takes from the viewer), so drawing folios there would have been one file, always
correct, no storage. It was rejected: in a *builder*, chrome the user can see but cannot
select, move or delete is worse than a number that needs maintaining — and it would have
stamped folios onto imported scans too. The cost is paid honestly:
- `renumberFolios()` re-numbers an issue after any order change. `writeOrder()` in the pages
  route is the single seam every structural op (insert, duplicate, delete, reorder) funnels
  through, so the repair lives there and cannot be forgotten; the add-pages path in
  `generate.ts` splices its own order, so it calls it too.
- It writes `elements` and **nothing else — in particular not `rev`.** A reorder must not make
  an approved page read as "approved and then edited" (`publishGate` derives that from `rev`).
- Duplicate deliberately **keeps `furniture-*` ids** instead of regenerating them. Ids only
  have to be unique within a page, and regenerating them would freeze the copy's page number
  forever — the folio's id is the handle the repair finds it by.
- The folio box spans the full content measure at either parity, so the repair only ever
  rewrites the string and which edge it hugs. **Geometry never changes.**

**5. Furniture is fixed-size (`autoFit:'clip'`, no `maxFontSize`) on purpose.** `refitText`
runs on every write and only touches shrink-with-a-ceiling text; a running head that fell to
its 55% floor would print at ~4pt. Over-long section titles are truncated, not shrunk.

**6. It lands AFTER layout QA and AFTER the density gate.** Chrome must not be able to rescue
a thin page, and `pageDensity` excludes `FURNITURE_IDS` regardless of call order, so the
exclusion holds even if a future caller furnishes first.

**7. `isTooSparse` → `densityOf`, per kind, nothing exempt.** cover 4 · back-cover 3 ·
contents 6 · feature-full-bleed 4 · two-column-article 5 · photo-grid 5 · pull-quote 3 ·
stat-infographic 6. The wordless cover (1 element) now fails. The bars are set where the
art-director **already reaches when it is working** — grounded in the copywriter's own naming
conventions (entry1…entry5 + a title = 6; stat1–3 + label1–3 + a headline = 7) — because
failing this gate drops the page to the fixed-template path and costs the issue its variety.
**A bar the model cannot clear would make the magazine worse, not denser.** That is the
constraint Phase 1.5b must respect: the cap and the bars move together, or not at all.

**8. A bug found on the way out: the retry wrapper contradicted its own hint.** Every failure
had `"use fewer/shorter leaves or a simpler tree"` appended to it — so a page rejected **for
being too thin was told to thin itself**. Each hint now carries its own remedy, and the
density hint says *do NOT simplify* out loud and names both numbers.

**9. `npm run check:pages`** — 4,000 furnished random pages (every margin, plus the two
boundary values either side of `BAND_MIN`, plus full bleed, plus all four ground kinds), 4,000
density verdicts, and a consistency property tying each bar to the leaf budget. **Observed RED
on the re-planted band assumption** before being accepted (§10.2).

**Known open, deliberately:**
- Furniture is generation-only. Imported and hand-built pages get none, and nothing
  back-fills it — which is what keeps this migration-free.
- A page whose artwork bleeds to an edge keeps no furniture at that edge. Real magazines often
  reverse the folio out of the photo instead; that needs the grid, so it is Phase 3.
- `check:pages`' bar-vs-budget property **will fire** the moment Phase 1.5b raises
  `MIN_ELEMENTS` without raising `MAX_LEAVES`. That is the point of it.

## 4c. Phase 1 AS BUILT — the unlock and the fit report (2026-08-13)

Built together, deliberately: `fitReport.ts` (new), the DSL unlock in `layoutSpec.ts`, its
application in `composeFromSolved.ts`/`measureLeaf.ts`/`solveLayout.ts`, a rewritten
art-director brief, and measured copy budgets in the copywriter's. **270 tests (was 249)**;
five guards, both builds and both typechecks green. Also: the page size moved to **A4**
(1240×1754 at 150 DPI) at the client's instruction, with the sheet size de-duplicated from
the three files that had restated it as a literal.

**What the art-director now decides:** size in points (`fontPt`), leading, tracking, capitals,
any exact colour per leaf, shape fills and scrim opacity, the page ground, spacing as a token
OR a raw pixel count, and structures up to 28 leaves and 6 deep.

**THE FIT REPORT IS THE POINT OF THE WHOLE CHANGE.** For each leaf it compares the box the
solver gave it against what actually went in, in plain English, and feeds that into the retry:

- a square device in a long band — *"you gave the qr a 1200×160 box, but a qr is SQUARE… 87% of
  that box is empty"*
- type that could not be honoured — *"headline is set at 40pt but only fits at 12pt"*
- a box far bigger than its contents — the *"more space than elements"* complaint, measured
- prose past the readable measure — *"about 104 characters a line; 45–75 is readable"*

**Six decisions inside it that a re-reader will otherwise undo:**

1. **A LEGAL PAGE IS NEVER THROWN AWAY.** The first version accepted a page only if the report
   was clean, which sent essentially every page to the fixed template — measured, then
   discarded. Findings now buy another *attempt*: the best legal page is kept and re-asked
   for, so this can only improve a page, never cost one.
2. **`slack` and `overflow` do not count as flaws** (`seriousFlaws` counts only
   loud/square/shrunk/measure). Slack is common and often correct — a caption sharing a column
   with a photo — and overflow just means the composer will shrink the type, which it does
   well. Counting either would burn every attempt on every page.
3. **The report borrows `typeSizeFor` from the composer** rather than restating the size rules.
   A report that disagrees with the renderer is worse than no report.
4. **`measureLeaf` now measures at the AI's size, not the role ceiling.** Content-sizing's
   whole promise is that the box and the type agree; the moment a leaf could ask for 28pt,
   measuring at the role's 46pt would have handed it the wrong box.
5. **The prose floor applies ONLY where the AI opted in.** Raising the *defaults* (body 14px =
   6.7pt) is still Phase 3, for the measured reason recorded there: without fit-aware
   authoring a higher floor converts shrink-to-fit into overflow. So nothing moves for a spec
   that names no size — seeds, fixed templates and the reference path included.
6. **The reference path pins its own caps.** `readingToSpec` now declares local
   `MAX_TREE_DEPTH/MAX_CHILDREN/MAX_STACK_LAYERS` instead of importing the DSL's, because how
   deep the guillotine may cut decides which partition it finds — and therefore every IoU
   fidelity score. Raising the caps for the generator would silently have re-cut every
   reference layout.

**Three prompt lines were the direct cause of defects, and are gone:**

- *"never leave a large empty region"* → a whitespace budget (15–30% deliberate air, expressed
  with `spacer`), because the old line instructed the model to inflate boxes.
- *"Put one [QR] in a footer band on the cover, back-cover and feature pages"* → why every page
  in a real issue carried a QR, one of them a quarter of the sheet.
- The retry wrapper's *"use fewer/shorter leaves or a simpler tree"*, appended to every failure
  — which turned an overflowing cover into a 1-element cover on a real run.

Plus: attempts 2 → 3 (the contradiction above used to consume the only retry), the copywriter's
static `CHAR_GUIDE` replaced by a budget measured from the slot's real box (clamped by the old
table, so it can only ever ask for *less* than a size that doesn't fit), and the running head no
longer echoes words already on the page (a real page read "Reading the Walk" above
"READING THE WALK").

**Still open after this:** the design critic (§5) — nothing yet scores a page's beauty, so this
phase can tell the model that a box is wrong but not that a page is *dull*; the type floors
(§6); and a rendered-pixel review, which remains the honest gap (§10.4).

## 5. Phase 2 — The design critic

**Goal:** raise the ceiling on quality. This is the actual Canva step, and it is not a better
prompt — it is a critic.

The trick that made the reference feature honest was measuring instead of claiming. Do the
same for aesthetics: a deterministic `pageQuality(elements, dims, theme)` returning a score
and named deductions over

- fill ratio and whitespace distribution (is the air deliberate or leftover?),
- column-grid alignment of every box edge,
- type-scale discipline — how many distinct sizes are in play, and are they on the scale?
- contrast of every text colour against what is actually behind it (this is where
  white-on-white dies permanently, not just in the reference path),
- margin and gutter regularity,
- focal-point respect for cropped photos,
- orphan/widow and line-count sanity on headlines.

Then the retry loop at generate.ts:1120 **optimises toward the score** instead of merely
avoiding catastrophe: generate, score, feed the named deductions back as the hint, keep the
best of N attempts. The loop, the hint plumbing and the attempt budget all already exist.

**Exit criterion:** the score correlates with human judgement on a labelled set of ~40 pages
(we rank them by eye first, then check the score agrees). A score nobody sanity-checked
against eyes is exactly the mistake §3 is fixing.

**Guard:** `npm run check:quality` — the labelled set is committed; regressions in
correlation fail.

---

## 6. Phase 3 — Issue coherence (absorbs the quality plan's phases 1–3)

**Goal:** stop shipping a stack of individually-plausible pages and ship a magazine.

- **A locked issue grid**: one column count and gutter for the whole issue; every page's
  boxes snap to it. This alone is most of what reads as "professional".
- **One harmonised type scale per issue**, derived once from the issue's content, then
  applied everywhere — instead of each page choosing sizes independently.
- **Print-legible floors.** Pages are 1275×1650 = 8.5×11in **at 150 DPI**, so points are
  px × 0.48. Today's floors are `body` 14px = **6.7pt** and `caption` 12px = **5.8pt**
  against a 9–10pt norm. Raising them is §11.2, and it **must** come after Phase 1: raising a
  floor without measure-first authoring converts shrink-to-fit into overflow and simply
  multiplies QA failures.
- **Page furniture**: folios and running heads, so an issue paginates like a publication.
- **Deliberate rhythm**: a loud opener, then quieter pages — a property of the issue, not of
  any one page, and therefore invisible to today's per-page generator.

**Exit criterion:** across a whole generated issue, ≤3 distinct body sizes, 100% of boxes on
the grid, folios on every non-cover page, and no body copy below the agreed floor.

**Guard:** `npm run check:issue` — runs over a generated issue, not a page.

---

## 7. Phase 4 — Uniqueness with taste

**Goal:** *"modern to modern, very unique"* — without the freedom that produced ok-ok.

- **Make the archetype library binding.** There are 11 real skeletons in
  [layoutArchetypes.ts](../apps/server/src/lib/magazineV2/layoutArchetypes.ts), currently
  injected as *"for INSPIRATION only"*, which means they can be and are ignored. The AI
  instead **picks** one and varies **within** it: emphasis, crop, column split, which slot
  dominates. Freedom expressed as choice-among-strong-options.
- **Per-issue design tokens**, so two issues built from the same archetypes don't look like
  the same template twice: one type pairing, one accent, one spacing rhythm chosen per issue
  and held across it.
- **Grow the library deliberately.** New archetypes are drawn against real magazine
  references and added with a test, rather than the AI inventing structures at runtime.

**Exit criterion:** two issues from the same source material are recognisably different from
each other, and both score above the Phase 2 bar. Judged on rendered pages, by eye, on the
record.

---

## 8. Phase 5 — The upload surface

**Goal:** the client's sentence, completely: *upload an image or a PDF, and say use these
photos, or build this layout, or build it like this including the colours — on this page or
that one.*

| # | change | state today |
|---|---|---|
| 8.1 | Image → "use this photo" | **built** |
| 8.2 | Image → "build a layout like this" | built; needs Phase 0 + §11.1 |
| 8.3 | **"…and the colours"** — opt-in palette adoption. The reading already extracts a palette; nothing consumes it. Adoption is explicit (a toggle or the user actually saying it), because a brand palette is usually deliberate. | **not built** |
| 8.4 | **Target a named page from chat.** `use_image_as_layout` takes only a `url` and rebuilds whichever page is open, so *"build page 2 like this"* rebuilds page 1. Add a page argument, resolve "page 2" against the issue, and name the target page in the confirm. | **not built** |
| 8.5 | PDF → pages | **built** (`processPage`; remember its photography is the page `background`, not an element) |
| 8.6 | Reference media hygiene: chat-attached references are stored `kind:'upload'`, so the photo-picker exclusion misses them, and their transcribed text reaches the agent as source copy. | **broken** |
| 8.7 | Whole-magazine-from-one-reference, and saving a reading on the magazine for reuse across pages (`referenceLayouts`, ≤8, read-through). | not built |

---

## 9. What this plan does not do

- No new AI surface for freehand pixel editing. The frame tree stays the only authoring path.
- No pixel-cloning of a reference. A frame tree cannot express arbitrary overlap, rotation or
  text-wrap; we match structure and say so.
- No migrations until every phase is done.
- No second taxonomy. New concepts reuse the DSL's roles and tokens.
- No template marketplace, no user-authored archetypes, no collaborative editing changes.

---

## 10. The anti-regression spine

The client's requirement was *"finally make the issues less and bug-less."* That is a
process property, not a code property, so these are rules, not aspirations.

**10.1 Fix the mechanism, never the example.** The cover bug had four entrances because each
fix targeted the shape that was reported. Every fix names the **family** of inputs it covers
and enumerates them in the test. If the family cannot be enumerated, the fix is wrong.

**10.2 The re-plant rule.** No fix is accepted until the bug is re-planted and the new test
goes **red**. This repo has shipped a guard that passed on the very bug it was written for
(`check:hooks` v1) and still has a cover test that passes with the FR-GUARANTEE bug
re-planted. A test not observed failing is not a test.

**10.3 One measured number per phase, one guard per phase.** Every phase above names a
`npm run check:*`. A phase is done when its number is in range and its guard is green —
never when the code "looks right". This follows the pattern that already works here:
`check:permissions`, `check:hooks`, `check:studio`.

**10.4 Rendered pixels, not typechecks.** Much of this builder has never been opened in a
browser. For a plan whose subject is beauty that is disqualifying. Every phase touching
output renders a fixed corpus to images (the PDF path already drives a headless browser) and
those images are reviewed. "Typecheck and tests pass" is necessary and not sufficient.

**10.5 One phase at a time, in order.** Phase 1 before the type floors, Phase 0 before any
tuning. The dependencies in this document are load-bearing, not preferences.

**10.6 Findings are written down and closed explicitly.** The review's 28 confirmed and 25
unverified findings are the backlog. Each is either fixed with a guard, or recorded as
deliberately deferred with the reason — never dropped quietly.

---

## 11. Decisions needed before Phase 1

These five change the shape of the work, so they are yours, not mine. My recommendation is
given for each.

**11.1 Intrinsic sizing for container children in `solveLayout` — do it, or patch narrowly?**
Content sizing currently applies only to leaf children, which is the single root cause behind
all four cover-bug entrances and the main obstacle to Phase 1.4. Teaching the solver to
measure a container's intrinsic main size retires the whole family at once and unblocks
"content decides size" everywhere. It also touches the generator path, so it needs its own
verification pass over the existing corpus.
*Recommendation: do it properly, as the first task of Phase 1, with the corpus rendered
before and after.* The narrow patch closes one of four entrances and leaves the other three
to be rediscovered by a client.

**11.2 Print target: raise the type floors, or raise the page resolution?**
Body copy can currently shrink to 6.7pt. Either raise the floors (`body` 14px → ~19px,
`caption` 12px → ~17px), which changes how every existing page fits, or move pages to 300 DPI,
which touches every stored coordinate and is a migration. If print is not actually a
deliverable and this is screen-only, neither is urgent and the floors just need a sanity bump.
*Recommendation: raise the floors after Phase 1, and tell me whether printing is real.*

**11.3 How binding should archetypes be?**
This is the "how much power does the AI get" question in its concrete form. Options: advisory
(today, produces ok-ok), **binding-with-variation** (pick one, vary within it), or strict
(no variation).
*Recommendation: binding-with-variation.* It is the setting that made Canva's output look
professional and it directly serves "unique" better than free authoring does, because the
variation is applied to something that already works.

**11.4 Colour adoption: automatic when asked, or always a toggle?**
*Recommendation: adopt when the user's sentence asks for colours, and always show what will
change before applying — a brand palette is deliberate, and silently repainting an imported
magazine is the same class of mistake as overwriting its background photo.*

**11.5 Does anything here get to store a field before all phases are done?**
Per-issue design tokens (Phase 4) and saved readings (§8.7) both want persistence. They can
be derived-on-read at some cost in recomputation.
*Recommendation: keep deriving, honour the no-migration rule, and revisit once Phase 4 is
built and the field set has stopped moving.*

---

## 12. Sequencing summary

```
Phase 0    honest instruments    ──▶ BUILT. nothing can be graded until this is done
Phase 1.5a furniture + density   ──▶ BUILT 2026-08-13 (see §4b "AS BUILT")
             · running head + folio, deterministic, no leaf cost
             · per-kind density bars, nothing exempt   [check:pages]
Phase 1    fit before beauty     ──▶ BUILT 2026-08-13 (§4c) — the unlock + the fit report
             · type/colour/spacing decided by the AI; caps 14→28, depth 4→6
             · every box measured and reported back into the retry
Phase 1.5b composite modules     ──▶ NEXT (the caps already rose with Phase 1)
             · statCard, iconNote, stepItem, quoteBlock, logoRow…
             · a 5-across icon row is now BUILDABLE at 15 leaves; a module makes it 5
Phase 2    the design critic     ──▶ raises the ceiling; the Canva step
Phase 3    issue coherence       ──▶ pages become a magazine            [11.2 resolved]
Phase 4    uniqueness with taste ──▶ "modern, unique"                   [needs 11.3]
Phase 5    the upload surface    ──▶ the client's full sentence         [needs 11.4]
```

Phase 1.5a is split out and moved to the front because it is independent of everything else,
costs almost nothing, and is what the client will see first.

Phase 0 is small and unblocks measurement. Phase 1 is where the client sees the difference.
Phase 2 is where the quality ceiling actually moves.
