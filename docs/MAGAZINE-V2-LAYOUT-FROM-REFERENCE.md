# Magazine v2 — build a page from a REFERENCE IMAGE

**Locked 2026-08-12.** Client requirement, verbatim: *"if they upload image and say that take this
layout so our AI able to build ai and layout as the Image uploaded"*.

Upload a picture of a layout — a magazine spread, a screenshot, a hand sketch — and the builder
produces a page with **that composition** carrying **your content**.

---

## 0. The one rule this must not break

The AI does not author coordinates. It emits a **frame-tree** (`LayoutSpec`: rows / cols / stacks /
leaves in bounded tokens, no pixels), and a deterministic solver compiles it against the page
rectangle:

```
plan → artDirectPage() → normalizeLayoutSpec → pruneSpec → solveLayout → composeFromSolved → QA → retry
        (the model)       (trust boundary)                  (overlap and off-page are
                                                             STRUCTURALLY impossible)
```

Everything below feeds that pipeline. **Nothing bypasses `solveLayout`.** The moment a reference
image is allowed to produce x/y/w/h directly, the builder loses its only structural guarantee, and
we are back to the overlap bugs the frame-tree was built to end.

## 1. What the feature is, precisely

| We reproduce | We never take |
| --- | --- |
| Composition, proportions, margins, column count | **Photos from the reference** — someone else's licensed image |
| Which role sits where, and its relative emphasis | **Copy from the reference** — their words, not the client's |
| Optionally the palette (opt-in, §7) | Exact fonts — mapped to the nearest pairing we actually have |

**A frame-tree cannot express arbitrary overlap, rotation, or text wrapping around a shape.** So
this matches a layout's *structure*; it is not a pixel clone. That is the promise to make to the
client — before the build, not after.

## 2. Architecture

```
reference image (in the magazine's media library)
   │  ① ONE vision call — read the layout
   ▼
LayoutReading  ──②──►  LayoutSpec  ──►  solveLayout  ──►  page
 normalised boxes      deterministic     (existing, untouched)
   │                    partition
   │  ③ compare solved boxes back against the read boxes → a real fidelity number
   ▼
 shown to the user BEFORE the compose budget is spent
```

### Why an intermediate reading instead of "put the image in the art-director prompt"

The naive version is one line of plumbing and it would half-work, unverifiably. The reading earns
its keep four times over:

1. **It can be verified.** Normalised boxes make ③ possible — we can measure whether the built page
   matches the picture. docs/MAGAZINE-V2-QUALITY-PLAN.md's diagnosis of this builder is *"every page
   is designed in isolation and nothing ever looks at the output"*. Here, cheaply, something does.
2. **It can be shown.** The user sees what we understood before we spend the compose budget on it.
3. **It is reusable.** One reading → apply to many pages, or store it and use it again (§6).
4. **It fails honestly.** A reading whose regions cannot become a frame-tree is a case we can name
   ("I can match this approximately") instead of silently building something else.

### ① The reading

Deliberately in the vocabulary the DSL already speaks (`LeafRole`, `SpaceToken`, `ColorRef`) so
there is no second taxonomy to keep in sync:

```ts
interface ReadRegion {
  role: LeafRole;                               // headline · image · body · kicker · qr …
  box: { x: number; y: number; w: number; h: number };   // 0–1 of the reference, never pixels
  z?: number;                                   // only where regions genuinely overlap
  emphasis?: 'dominant' | 'normal' | 'quiet';   // relative weight, never a px size
  colorRef?: ColorRef;
  align?: TextAlignToken;
  note?: string;                                // "two-tone masthead", "bleeds off the left edge"
}
interface LayoutReading {
  aspect: number;                               // w/h of the reference
  background: 'light' | 'dark' | 'photo';
  margin: SpaceToken;                           // read from the outer whitespace
  columns?: number;
  regions: ReadRegion[];                        // ≤ MAX_LEAVES (14)
  palette?: { primary: string; secondary: string; accent: string };
  confidence: number;                           // 0–1, the model's own estimate
  notes?: string;                               // what it could not express
}
```

`normalizeLayoutReading` is the **trust boundary**, written in the same discipline as
`normalizeLayoutSpec` and `validateElements`: hand-coerce arbitrary untrusted model output, clamp,
cap, **drop what is invalid, never throw**.

### ② Conversion is deterministic — no second model call

A **guillotine partition** of the read boxes:

- Find horizontal cut lines no region straddles → a `col`; vertical cuts → a `row`; recurse.
- Band sizes become `fr` weights. Roles that should hug their content (headline, kicker, byline,
  caption, figure, icon) get `sizing:'content'` — the convention the art-director prompt teaches.
- Genuine overlap → a `stack`, and only in the sanctioned **backing + one content layer** form
  (image/shape under text). Two text layers on one rectangle is the bug `layoutSpec.ts` already
  repairs; we must not reintroduce it from a different direction.
- `MAX_TREE_DEPTH` 4 and `MAX_LEAVES` 14 are hard caps: deeper readings collapse into an ordered
  `col`, surplus regions are dropped lowest-confidence-first.
- **No clean cut anywhere** → hand the reading to the art-director as *guidance*, then fall back to
  the nearest archetype in the existing library.

Pure and unit-testable — synthetic readings for a full-bleed cover, a two-column feature, a stat
band, a hopeless overlap.

### ③ The fidelity check

IoU per region, solved box vs read box. Below threshold we **say so** and offer the closest
archetype, rather than claiming a match the page does not deliver.

## 3. Reflowing the client's content into it

The value is not a blank skeleton — it is *my page, that layout*. Conversion maps the page's
existing elements into the new tree **by role**: headline → headline leaf, body → body, photos →
image leaves in descending area. Surplus copy joins the largest body leaf; unfilled slots either
take a generation brief or are pruned. **Nothing is retyped.**

## 4. Aspect ratio

A landscape reference cannot be "the same layout" on an A4 portrait page. Small differences
normalise fine. Beyond a threshold, say the ratio does not fit — do not silently squash it.

## 5. Entry points

1. **Per page — "Match a layout"** in the page panel. Smallest, most testable, and exactly where the
   client's sentence points. **P1–P3.**
2. **New magazine — "Start from a reference"**: one reference applied to every page it fits, so a
   whole issue inherits the look. **P4.**
3. **In chat — attach + "use this layout"**. Needs an explicit chip on the attachment —
   **Use as layout reference** vs **Place this photo** — because an attached image already means
   "place this photo", and guessing intent from the sentence will be wrong often enough to be
   maddening. **P4.**

## 6. Storage

The reading lives on the magazine document as a capped `referenceLayouts` array (≤ 8). **No
migration and no new collection** — the field is absent on every existing magazine and reads as
`[]`, which is the same read-through-defaults discipline the review fields use.

## 7. Palette

**Opt-in.** A brand palette is usually deliberate, and silently overwriting it with the colours of
whatever someone screenshotted would be a bug that looks like a feature.

## 8. Cost, limits, permissions

- **One** vision call per reference. Images are passed **by URL** — uploads are world-readable by
  design (docs: image-upload-system), so no signing and no base64 bloat.
- The endpoint takes an **`assetId`**, not a URL, and requires `media.magazineId === magazine._id`
  — the id-in-our-DB proof. Accepting a caller-supplied URL would let anyone spend our model budget
  on any image on the internet.
- `rateLimit` on the read endpoint; existing magazine-edit gate.
- **No new permission id.** The catalogue is guarded by `check:permissions` and a new id needs its
  own enforcement proof.

## 9. Phases

| Phase | Scope | State |
| --- | --- | --- |
| **P1** | Vision plumbing · `LayoutReading` + trust boundary · read endpoint · outline preview. Nothing is built yet — this is "here is what I understood". | **BUILT 2026-08-12** |
| **P2** | Deterministic conversion → spec → existing solver, one page, with content reflow (§3). | **BUILT 2026-08-12** |
| **P3** | Fidelity check, honest reporting, archetype fallback. | **BUILT 2026-08-12** (archetype fallback deferred — see below) |
| **P4** | Apply to many pages · whole-magazine-from-a-reference · the chat path · save & reuse (§6). | **CHAT PATH BUILT 2026-08-12**; whole-magazine + save/reuse open |
| **P5** | Opt-in palette / type adoption. | — |

### P1, as built

- `lib/magazineV2/layoutReading.ts` — types + `normalizeLayoutReading` (the trust boundary) +
  `aspectMismatch`. **20 tests.**
- `lib/magazineV2/readLayout.ts` — the vision call. `temperature: 0.1`, because every other call in
  this pipeline wants invention (`artDirectPage` runs at 0.95) and this one is a *measurement* — a
  creative reading of a picture is just a wrong reading.
- `lib/magazineV2/parseJson.ts` — `parseJsonObject` lifted out of `generate.ts` (it was private)
  so the reader uses the SAME brace-balanced, string-aware parser as the art-director instead of a
  second copy that would drift.
- `POST /issues/:id/layout-reference` — assetId in, reading out. Reads only; writes nothing.
  **422** when the image can't be read, carrying a sentence worth showing the user.
- `kind: 'reference'` on media, **excluded from `GET /media`** — a reference is somebody else's
  licensed page, and offering it in the photo picker would invite the one thing §1 forbids.
- `LayoutReference.tsx` in the page panel: upload → the reading drawn over the reference, numbered,
  with confidence in words, the aspect warning, and an honest "building the page from it is next".

**One bug the tests caught before it shipped:** the percentage rescue (`60` → `0.6`) was per-value,
so a stray off-page `x: 1.4` in an otherwise fractional reading was "rescued" to `1.4%` and survived
as a real region. Scale is a property of the **whole reading**, decided from the region *sides*
(positions can be misread in isolation; in percent units some region is always tens of units wide).

### P2, as built

- `lib/magazineV2/readingToSpec.ts` — the guillotine. **18 tests**, one per real magazine shape
  (bands, side-by-side, two-column feature, stat trio, text-over-photo, scrim) plus the ones that
  must degrade rather than lie.
- `lib/magazineV2/applyLayout.ts` — `reflowContent` (role-matched, longest-prose-first, photos
  biggest-first, **surplus counted and reported**), `themeForPage`, and `applyReadingToPage` = the
  deterministic tail: prune → **solve** → compose → normalize → QA. **17 tests**, including an
  end-to-end one that asserts every composed element lands on the page.
- `POST /issues/:id/pages/:pageId/apply-layout` — takes the reading the client already holds (no
  second vision call) and **re-normalises it anyway**; `rev`-guarded like every page write, **422**
  when this layout and this page cannot be put together, and it says which.
- `store.applyLayout` — adopts the returned page, patches the summary + rail thumbnail, and
  **clears the undo stack**, because every element is new and Ctrl+Z would resurrect ghosts.
- The UI **confirms first**, counting what is on the page, since the rebuild is not undoable.

**Two decisions worth remembering:**

1. **`fr` weights everywhere, never `sizing:'content'`.** Content-sizing would let the solver give a
   headline whatever height its text needs — safer for legibility and the exact opposite of what was
   asked for. **The reference's proportions ARE the spec**; text that then doesn't fit is a fidelity
   problem to *report* (P3), not to paper over in the converter.
2. **The theme is derived from the PAGE when the magazine has no `genTheme`** (a PDF import), rather
   than synthesised by another model call. Applying a layout must change a page's structure, not
   repaint it in colours it never had.

### P3, as built

- `lib/magazineV2/layoutFidelity.ts` — `iou` + `measureFidelity`. **14 tests**, including a
  read → convert → **real solve** → measure round trip with no hand-built boxes.
- The converter now returns `{ spec, origin }`: `origin` maps each contentRef to the box it came
  from in the reference. Without that provenance, "does the built page look like the picture?" can
  only ever be answered by eye. Slots that never reached the tree are stripped from it, so the score
  is never measured against boxes we never claimed to place.
- Measured on the **SOLVED** boxes, not the composed elements — composing folds in text auto-fit and
  image cropping, which are real but are not what "did we match the layout" asks.
- Three verdicts: **matched** (≥0.72) · **adapted** (≥0.45) · **loose**. A perfect score with a
  missing box is **adapted, never matched**.
- The toast tone follows the verdict: a `loose` result is a **warning**, not a success message with
  the caveat buried in a panel.

**Weighted by read area, deliberately.** An unweighted mean lets six accurate captions hide one
badly misplaced photograph — which is the first thing a client would notice. There is a test that
fails on exactly that page.

**Deferred, with the reason:** the "offer the closest archetype instead" half of P3. `seedSpecFor`
selects by page KIND, not by similarity to a reading, so a genuine suggestion needs a distance
metric over the archetype library — a real piece of work, and worth more once we know from use how
often `loose` actually comes up. The measurement ships without it; a number nobody acts on is still
better than a claim nobody can check.

### The chat path (P4, first half), as built

Attach an image in the studio assistant and say either thing:

- *"use this photo / put this in the magazine"* → `add_media_image` (this already worked).
- *"use this layout / build a layout like this / make my page look like this"* → the new
  **`use_image_as_layout`** tool.

**The two intents are NOT guessed silently.** The prompt spells out both, side by side, and tells the
model to **ask in one line** when the sentence is genuinely ambiguous ("use this image" is). And the
architecture makes a wrong guess cheap anyway: the assistant never writes, it **stages a proposal**
the user applies — so a misread intent costs one click, not a page.

**A layout rebuild is EXCLUSIVE, enforced at the tool.** It replaces every element with new ids, so
an element edit staged in the same turn cannot survive in either order — edits first are thrown away
by the rebuild, edits second are applied to ghosts. `use_image_as_layout` refuses when anything else
is staged, and all six element-staging tools refuse once a layout is staged (`hasLayout`), each
returning a sentence the model can relay. Refusing at the tool is how this file already handles a
locked element or an owner-only page op: **the model cannot offer what it cannot do**, so the user
never gets "Applied the assistant's changes" over work that silently failed.

**The reading travels on the proposal**, so applying costs no second vision call — and what the user
approves is exactly what was described to them. Applying routes through the same `store.applyLayout`
the panel uses, so the undo-stack clear, the thumbnail refresh and the measured verdict cannot drift
between the two ways in.

**No new tests for this piece, deliberately noted:** the tool needs a live model call and
`buildTools` is not exported, so the only honest unit surface would be a refactor to export it. The
exclusivity rule is a one-line guard repeated at each staging site and is visible in the diff;
verification is a browser run.

**The bug the depth test caught:** `normalizeLayoutSpec` numbers the **root as depth 1** and drops
anything past `MAX_TREE_DEPTH`, so a container emitted one level too deep doesn't fail loudly — it
has **every leaf inside it silently deleted**. The first converter had that off by one and none of
the shape fixtures went deep enough to notice. `canContain(d) = d + 2 <= MAX_TREE_DEPTH` now states
the arithmetic once, and the test that covers it was **verified by re-planting the off-by-one**.