# Magazine v2 — "apply the layout from this image": in-depth review

**Reviewed 2026-08-13**, against the uncommitted working tree on `day-web`/`day-work`.
Feature plan: [MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md](MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).

## Status — 5 of these are FIXED (2026-08-13)

Phase 0 of [MAGAZINE-V2-BUILDER-PLAN.md](MAGAZINE-V2-BUILDER-PLAN.md) closed the findings
that destroy a page or lie about one. See that document's "Phase 0 AS BUILT" for the
reasoning, including three places where its own prescription was measured and rejected.

| finding | state |
|---|---|
| `layoutFidelity.ts` — one full-bleed region floats the whole score | **fixed** — guaranteed slots excluded from the mean, `check:fidelity` guards it |
| `layoutFidelity.ts` — `missing` documented as lowering the score but excluded | **fixed** — comment corrected, veto hardened; folding it into the mean was measured and made an honest cover read "loose" |
| `layoutFidelity.ts` — the score is aspect-blind | **fixed** — `aspect` vetoes "matched", and the sentence says why |
| `applyLayout.ts:84` — `bg === palette.text` blanks the page (CRITICAL, was unverified) | **fixed** — verified by hand first, then guarded for the whole family of inks |
| web — the chat path rebuilds with no confirm | **fixed** — confirm moved into `store.applyLayout`, and it names the page |
| everything else below | open |

The remaining 23 confirmed findings and 25 unverified leads are unchanged. Re-verifying the
25 is Phase 0's item 0.5 and is **blocked on the spend limit**, not forgotten.

## Method, and one honest gap

Ten reviewers, one per module, each reading every line of its scope plus the modules its
scope depends on, and running probes against the **real** pipeline
(`normalizeLayoutReading → readingToSpec → normalizeLayoutSpec → pruneLayoutSpec →
solveLayout → composeFromSolved → normalizeElements → measureFidelity`) rather than
reasoning about it. Every finding then went to a separate skeptic whose instructions were
to **refute** it, empirically, and to lean refuted when it could not construct the failure.

- **62 findings filed**, **37 verified**, of which **28 confirmed and 9 refuted**.
- **25 findings could not be verified**: the org hit its monthly spend limit part-way
  through, killing every skeptic for the `chat`, `client`, `contracts` and `tests`
  dimensions, plus the completeness critic. Those 25 are listed separately below and are
  **leads, not facts** — except the four I verified by hand afterwards, which are marked.
- Nothing in the tracked tree was modified. 210 tests were passing before and after.

**Coverage that never got a skeptic** (so treat the corresponding section as unaudited):
cross-module solver contracts, the test-quality audit, the web client, the chat path.

## What the review found, in one paragraph

The reading step is genuinely good and the trust boundary is sound — most of what was
filed against `layoutReading.ts` and `readLayout.ts` came back low or refuted. The
problems are concentrated in the two steps after it, and they share one root cause: **a
frame tree can only say "this sat in the top quarter" through `justify`/`pad` on a
container whose children are all leaves**, and there are at least four common shapes that
miss that condition. When they do, the cluster stretches to fill the page — which is
exactly the bug reported from the first real run, still reachable four other ways. Worse,
the IoU check built to catch precisely this cannot see it: on any reference with a
full-bleed photo the score has a mathematical floor of ~91%, so every one of these ruined
pages is affirmed to the user as *"Matched your reference closely."* And one theme
derivation can turn an imported cover into a blank white page while reporting a match.

## The five themes

### 1. Position is expressible in only one code path, and four shapes miss it

`readingToSpec` can only record "the cluster sat at this end" by content-sizing a
container's children and setting `justify` + `pad`. That path is guarded by
`allLeaves`, and the guard is correct — the solver's content sizing applies only to leaf
children — but the consequence is that these all silently fall back to `fr` weights that
fill the rect:

| shape (all ordinary magazine idioms) | where |
|---|---|
| exactly **one** text region over a full-bleed photo | `readingToSpec.ts:281` |
| a cluster containing a **side-by-side pair** (issue no. + price, two teasers) | `readingToSpec.ts:386` |
| a cluster containing an **image/qr/icon** leaf (content sizing is a no-op on those) | `readingToSpec.ts:393` |
| an **inset** photo promoted to a stack layer, blown up to full bleed over the hero | `readingToSpec.ts:280` |

Measured on a synthetic Horse-style cover, changing nothing but one centred label into two
side-by-side labels:

| | masthead lands at | height (page 1650px) |
|---|---|---|
| single label (all leaves) | y=60 | **101px** — correct |
| two labels side by side | y=0 | **1060px** — two thirds of the sheet |

That second row is the screenshot the client reported.

### 2. The fidelity number cannot detect theme 1

The score is area-weighted so that "six right captions can't hide one misplaced photo".
On a cover it inverts: the full-bleed photo is a **stack layer, so the solver always hands
it the whole page and it always scores IoU 1.0**, with weight 1.0 against ~0.09 for all
the text combined. The score therefore cannot fall below **1/(1+0.09) ≈ 91%** whatever
happens to the type. `MATCHED_AT` is 0.72, so the verdict is *"matched"* before a single
word is placed. Confirmed independently at 92%, 89%, 85% and 76% on four different ruined
pages. Compounding it: `missing` regions are excluded from the mean entirely (their doc
comment says they lower the score), and the score is aspect-blind, so a landscape
reference on a portrait page scores 0.947 "matched".

This is the component the whole design rests on — the plan's stated reason for choosing an
intermediate reading over prompt-stuffing was that it could be *measured*. Right now the
measurement is the least trustworthy part of the feature.

### 3. A derived theme can erase the page (the one CRITICAL)

White type over a dark photograph is the most common cover idiom there is. On an imported
page the photo lives in `background`, so `themeForPage` derives ink `#ffffff` (correct —
the words really are white) and background `#ffffff` (the `page.background.type === 'color'`
test fails for an image, so it falls through to white). Apply a reference whose photo box
is **not** full-bleed and the photo is consumed into that box, the rest of the sheet is
painted `#ffffff`, and every remaining word is white on white.

Probed: `palette` came back `{bg:#ffffff, text:#ffffff, primary:#ffffff, …}`, the page
background was painted `#ffffff`, **2 of 2 text elements matched the background exactly**,
and the verdict was *"Matched your reference closely (76%)."* A blank page, certified.

### 4. The chat path is not the panel path, and a comment says it is

`store.ts:1110` claims routing chat through `store.applyLayout` means "the confirm, the
undo-stack clear, the thumbnail refresh and the measured verdict can't drift between the
two ways of reaching it". The confirm is in `LayoutReference.tsx:100`; `store.applyLayout`
has none. So **the chat path rebuilds the page with no confirmation and no aspect
warning** — verified by hand. Also filed and unverified: parallel tool calls defeat the
`hasLayout` exclusivity guard, chat-attached references are stored `kind:'upload'` so the
photo-picker exclusion never covers them, and the reference's transcribed text reaches the
agent as a source document to copy from.

### 5. Two of the three "fixed" bugs have tests that pass with the bug re-planted

Filed by the test-quality reviewer (unverified — its skeptics were the ones killed):
the cover test's fidelity assertions still pass with the `pruneSpec` FR-GUARANTEE bug
re-planted; `pruneSpec.test.ts` never passes `keepWhitespace` at all; the terse-slot test
uses *roled* copy so pass 1 of the reflow is never exercised; and "no leaf was silently
deleted" compares the spec with itself. If these hold up, they explain why this feature's
bugs keep coming back: the regression net has holes exactly where the regressions are.

## Recommended order

1. **`themeForPage` must never return `bg === text`.** One guard, one test. It is the only
   finding here that destroys a page outright.
2. **Make the fidelity score honest** before anything else is tuned against it, because
   every other fix is currently graded by a broken instrument: exclude full-bleed backing
   layers from the weighted mean (or cap any single slot's weight), fold `missing` into the
   mean as the comment claims, refuse "matched" when the largest *text* slot is under 0.5,
   and make the verdict aspect-aware.
3. **Then theme 1.** The principled fix is to teach `solveLayout` intrinsic sizing for
   *container* children, which retires all four rows of that table at once — but it touches
   the generator path and needs its own verification pass. The cheap fix is to give the
   single-content stack branch the same `col`+`justify`+`pad` wrapper `flatten` already
   builds, which closes the most common row only. Worth a decision rather than a default.
4. **Close the chat/panel gap** (confirm + aspect warning in the shared action, not the
   component) and fix the comment that asserts it is already shared.
5. **Re-verify the 25 unverified findings** when budget allows, starting with the test-quality
   set, since it governs whether any of this stays fixed.

---

# Confirmed findings (28)

Each was filed by one reviewer and survived a separate skeptic instructed to refute it.

### HIGH — One line of type over a full-bleed photo loses its position, and the report still says "matched"

`apps/server/src/lib/magazineV2/readingToSpec.ts:281`  ·  guillotine

**Fails when:** Reading = `image {0,0,1,1}` + `headline {0.08,0.78,0.6,0.12}` (title across the bottom third of a full-bleed photo — a cover or a section opener). Built page: the headline element is `y=0.022 h=0.956 fontSize=96`, i.e. the title renders across the TOP of the page. Fidelity: `iou=0.08` for the headline, but the area-weighted score is 85% and the UI shows "Matched your reference closely (85%)" with a green tick. Add one kicker at y=0.72 to the same reading and the headline lands at `y=0.798` (iou 0.54) — correct.

**Proof:** Probe (deleted) at apps/server/tests/magazineV2/_probe_guillotine_0.mts, run with npx tsx. INPUT — reading (post-normalizeLayoutReading): regions = [ image {x:0,y:0,w:1,h:1,z:0}, headline {x:0.08,y:0.78,w:0.6,h:0.12,z:1,emphasis:'dominant'} ], margin 'md'. Page: 1 text element role 'headline' ("The Long Ride Home") + background {type:'image', value:'https://…/photo.jpg'} (the PDF-import shape the briefing describes — zero image elements). SPEC EMITTED: {"root":{"kind":"stack","layers":[{"kind":"leaf","role":"image","contentRef":"hero","fit":"cover"},{"kind":"leaf","role":"headline","contentRe…

### HIGH — An inset photo is blown up to full-bleed and drawn on top of the hero, hiding it

`apps/server/src/lib/magazineV2/readingToSpec.ts:280`  ·  guillotine

**Fails when:** Reading = `image {0,0,1,1}` + `image {0.55,0.6,0.4,0.35}` (a full-bleed shot with a small inset bottom-right) + `headline {0.06,0.06,0.5,0.12}`; the page has two photos. Built page: both photos get box `{0.028,0.022,0.944,0.956}`, the inset photo is drawn second so it covers the hero completely — the client sees the WRONG photograph filling the page. Reported verdict: "Matched your reference closely (77%)", because the hero's own iou is 0.90 and area-weighting (read area 1.0 vs 0.14) drowns the inset's iou of 0.16.

**Proof:** Probe (apps/server/tests/magazineV2/_probe_guillotine_1.mts, now deleted) — reading `image{0,0,1,1}` + `image{0.55,0.6,0.4,0.35}` + `headline{0.06,0.06,0.5,0.12}` through `normalizeLayoutReading` → `readingToSpec` → `applyReadingToPage` against a page holding two image elements (hero.jpg 800x600, inset.jpg 300x200) and one headline: SPEC: `{stack, layers:[leaf image hero, leaf image photo1, leaf headline]}` (unchanged by normalizeLayoutSpec). WHY: "" (QA passed, page written). FIDELITY: score 0.7734, verdict `matched`, summary "Matched your reference closely (77%)." missing 0. SLOTS: hero iou…

### HIGH — The EMPTY_END cover fix is skipped when a clustered band is a container, so it still stretches

`apps/server/src/lib/magazineV2/readingToSpec.ts:386`  ·  guillotine

**Fails when:** Reading = `headline {0.08,0.04,0.84,0.1}` (masthead) + `kicker {0.08,0.17,0.4,0.05}` + `label {0.52,0.17,0.4,0.05}` (two teasers side by side), empty lower 78% — a cover. Bands = [headline leaf, row(kicker,label)], weights 10 and 5, sizing `fr`. Built page: the masthead read at 10% of page height comes out at `h=0.613` (a 61% band through the whole upper page), the teaser row read at 5% comes out at `h=0.307`, and the empty lower three-quarters is gone. Fidelity 10%, "loose".

**Proof:** Probe (apps/server/tests/magazineV2/_probe_guillotine_3.mts, since deleted) calling the real `applyReadingToPage` with reading = headline{0.08,0.04,0.84,0.1}, kicker{0.08,0.17,0.4,0.05}, label{0.52,0.17,0.4,0.05} (aspect = PAGE_W/PAGE_H, background 'light', margin 'md') and a page holding a headline/subhead/caption text element: ===== end-to-end F ===== VERDICT loose 10% summary: This is a loose interpretation (10%) — the reference's arrangement could not be reproduced closely. headline iou=0.145 read y=0.040 h=0.100 -> got y=0.022 h=0.613 kicker iou=0.000 read y=0.170 h=0.050 -> got y=0.672 …

### HIGH — `sizing:'content'` is a no-op on image/icon/qr leaves, so the photo swallows the empty space

`apps/server/src/lib/magazineV2/readingToSpec.ts:393`  ·  guillotine

**Fails when:** Reading = `image {0.06,0.05,0.88,0.37}` + `headline {0.06,0.47,0.88,0.09}` + `byline {0.06,0.58,0.4,0.03}` — a photo across the top, title and byline under it, deliberate empty lower 39%. Built page: the photo read at 37% of the page height comes out at `h=0.647`, the headline read at y=0.47 lands at y=0.785, the byline at y=0.904, and the empty lower third is gone. Swap the photo for a `subhead` and the same shape keeps every band at its measured height.

**Proof:** Probe (apps/server/tests/magazineV2/_probe_guillotine_4.mts, now deleted) called the real `normalizeLayoutReading` → `readingToSpec` → `applyReadingToPage` on a 1275x1650 page holding one image element, a headline and a byline. Case B — reference deliberately leaves the top 52% empty, cluster in the lower half: regions: image {0.06,0.55,0.4,0.20}, headline {0.06,0.79,0.88,0.08}, byline {0.06,0.90,0.4,0.03} spec emitted: col justify=end pad=xl, children image:content/w20 headline:content/w8 byline:content/w3 solved: hero read y=0.550 h=0.200 -> got y=0.080 h=0.568 (iou 0.07); headline read y=0…

### HIGH — themeForPage can derive palette.bg === palette.text, saving a page whose every word is invisible

`apps/server/src/lib/magazineV2/applyLayout.ts:84`  ·  reflow

**Fails when:** A page imported from a PDF: `background:{type:'image',value:'…/scan-3.jpg'}`, three extracted text elements with `color:'#ffffff'` (headline, body, caption), magazine has no `genTheme`. Client uploads a reference with a photo band on top and headline+body below and says 'use this layout'. Probe output: `derived theme: {"palette":{"bg":"#ffffff","text":"#ffffff",…}}`, `background: {"type":"color","value":"#ffffff"}`, `text y=947 color=#ffffff role=headline`, `text y=1206 color=#ffffff role=body`. A white page with white text on it, saved, rev bumped, undo stack cleared — the page reads as blank and the original page is gone.

**Proof:** Probe calling the real applyReadingToPage on a PDF-import-shaped page (background:{type:'image'}, zero image elements, three extracted text elements with color '#ffffff') and a reading of [image 0,0,1,0.5 | headline 0.08,0.55,0.84,0.1 | body 0.08,0.68,0.84,0.26], genTheme null. Actual output: palette: {"bg":"#ffffff","text":"#ffffff","primary":"#ffffff","secondary":"#ffffff","accent":"#ffffff"} why: "" background: {"type":"color","value":"#ffffff"} image y=36 h=688 (…/background.jpg) text y=820 color=#ffffff role=headline text y=1054 color=#ffffff role=body fidelity: "Matched your reference c…

### HIGH — Merged spare prose overflows its band, and overflow aborts the whole apply with an unseeable UUID

`apps/server/src/lib/magazineV2/applyLayout.ts:292`  ·  reflow

**Fails when:** Page: 1275x1650, a headline plus four ~1150-char body paragraphs (an ordinary feature page). Reference: photo band 0-60%, headline band 63-73%, body band 76-94%. Probe result: 1 paragraph -> BUILT (fontSize 19); 2 -> BUILT (fontSize 14); 4 -> REFUSED `The page that layout produces fails layout QA — overflow: text 40c1b9df-… overflows`; 8 -> REFUSED. Had reflowContent placed paragraph 1 and reported `leftOver.text: 3`, the page would have built (the 1-paragraph run proves it). Instead the client can never apply a reference to any page with more than ~2 paragraphs.

**Proof:** Reference (two equal body columns), page 1275×1650, one hero image + one headline, body copy totalling 4392 chars: 4 elements × 1098 chars → reflow gives body=3296, body2=1098 → applyReadingToPage returns page:null, why="The page that layout produces fails layout QA — overflow: text 97927215-9685-4953-b655-03b53e536a8d overflows its box" → route 422 → toast.error with that sentence. 2 elements × 2196 chars (SAME 4392 total, same reference) → body=2196, body2=2196 → BUILT, both body boxes 572×549 at fontSize 13. So the reference has room for all of the copy; only the merge's "all spare into th…

### HIGH — One full-bleed region floats the whole score: a cover rebuilt as two text slabs reports "Matched (89%)"

`apps/server/src/lib/magazineV2/layoutFidelity.ts:120`  ·  fidelity

**Fails when:** Client uploads a magazine cover: full-bleed photo, masthead in the top 13%, teaser strip across the bottom 8%. The rebuilt page is the photo plus a 1275x863 headline box covering the top 52% of the sheet and a 1275x691 subhead box covering the bottom 42% — nothing like the cover. `LayoutReference.tsx` renders the emerald `matched` tone with a Check icon, "Matched" and "89%", and `store.ts:763` fires `toast.success("Matched your reference closely (89%).")`.

**Proof:** Probe A — the reviewer's scenario, end-to-end through the real `applyReadingToPage`. Input: reading `{margin:'none', regions:[image(0,0,1,1) z0, headline(.08,.03,.84,.10) dominant, kicker(.10,.85,.80,.08)]}`; page 1275x1650, `background:{type:'image',value:'…/scan.jpg'}`, two text elements (roles headline, subhead), `genTheme` null. Output: score 0.891 | verdict matched | missing 0 summary: Matched your reference closely (89%). hero iou=1.000 area=1.0000 got=[x0 y0 w1 h1] headline iou=0.161 area=0.0840 got=[x0 y0 w1 h0.523] kicker iou=0.153 area=0.0640 got=[x0 y0.581 w1 h0.419] elements: imag…

### HIGH — apply-layout reports "Matched your reference closely" for a page that silently dropped reference boxes

`apps/server/src/lib/magazineV2/layoutFidelity.ts:115`  ·  endpoints

**Fails when:** Client uploads a portrait page read as 5 regions: kicker(0,0,.2,.2), byline(.25,0,.2,.2), headline(0,.25,.45,.25), caption(.55,0,.45,.5), body(0,.6,1,.4). The page holds a headline, standfirst, byline, caption and body copy. The guillotine reaches depth 3 on the {kicker, byline} band, so `partition` returns only the biggest of the two and the BYLINE BOX IS DISCARDED. Run through applyReadingToPage the endpoint returns `fidelity: { score: 0.806, verdict: 'matched', missing: 0, summary: 'Matched your reference closely (81%).' }` and `leftOver: { text: 0, images: 0 }` — the byline copy was swept into the body paragraph by the spare-text merge. The user is told the layout matched, with zero ind…

**Proof:** Probe over the real modules (apps/server/tests/magazineV2/_probe_endpoints_0.mts, since deleted). 1) Reviewer's exact scenario through the real applyReadingToPage(reading, page, null), page = 816x1056 holding headline/subhead/byline/caption/body text elements: origin kept: kicker,headline,caption,body | DROPPED boxes: 1 verdict: matched | score: 0.781 | missing: 0 summary: "Matched your reference closely (78%)." leftOver: { text: 0, images: 0 } ("By Jane Rider" was appended to the body paragraph) 2) A realistic layout, no fuzz — masthead row (label + kicker), two columns, left column = image(…

### HIGH — kind:'reference' is excluded only from GET /media; the generator and agent tools still place the licensed page

`apps/server/src/lib/magazineV2/generate.ts:696`  ·  endpoints

**Fails when:** Owner uploads a competitor's magazine page through the Layout Reference panel (stored kind:'reference'), reads the layout, applies it. Then they use "add pages matching theme" for two more pages. `loadUserPhotoPool` finds the reference asset (source 'upload', kind 'reference' ≠ 'doc'), the composer claims user photos before stock, and the scanned competitor page is placed as the hero photo of a generated page. Owner publishes → that third party's copyrighted page is served from the public Bulletins newsstand and baked into the PDF export. Same outcome one turn earlier in chat: "put the image I just uploaded on the page" → list_media returns the reference url → add_media_image accepts it → t…

**Proof:** State: magazine `6a7d58b4e75511cbae021d56` in the local DB right now. It has exactly one media document that passes the user-photo-pool filter, and it is the layout reference (`kind:'reference'`, `source:'upload'`, url `…511cbae021d56/media/f9500ff7-0f16-42c9-b41f-c91c288f9578.jpg`). Input: the owner opens that magazine in the studio, page rail → AI pages → "add 2 pages" (`POST /issues/6a7d58b4…/pages/generate`). Wrong output: `loadUserPhotoPool` returns a one-photo pool containing the layout reference (probe: `poolWouldTakeIt: true, poolSize: 1, firstClaimed: 'reference'`), logs "placing 1 u…

### MEDIUM — Regions the guillotine throws away vanish from `origin`, so nothing tells the user a box was dropped

`apps/server/src/lib/magazineV2/readingToSpec.ts:436`  ·  guillotine

**Fails when:** Reading = `image {0,0,1,0.98}` + `image {0.05,0.05,0.9,0.85}` (two overlapping photo boxes); the page has one photo. Only `hero` is placed; the second reference box is discarded. Response: `missing: 0`, `leftOver: {text:0, images:0}`, verdict "Matched your reference closely (92%)". Across a 5,000-reading fuzz, 1,706 readings silently lost at least one region (4,837 regions total) and not one of those losses can appear in `missing`.

**Proof:** Probe case B (real `normalizeLayoutReading` → `readingToSpec` → `applyReadingToPage`, a plausible dense page: headline band, two-column row, left column = photo / two side-by-side labels / caption): INPUT reading, 6 regions: headline(0.02,0.02,0.9,0.10), image(0.02,0.15,0.42,0.35), body(0.50,0.15,0.48,0.80), label(0.02,0.55,0.19,0.06), label(0.24,0.55,0.19,0.06), caption(0.02,0.66,0.42,0.10). Page holds a headline, a body paragraph, two captions and one photo. ACTUAL OUTPUT: regions read : 6 origin keys : 5 ["headline","hero","label","caption","body"] <- the second label was discarded at part…

### MEDIUM — `alignFor` measures the midpoint against the PAGE, not the container, so right columns go right-aligned

`apps/server/src/lib/magazineV2/readingToSpec.ts:106`  ·  guillotine

**Fails when:** Reading = `subhead {0.05,0.1,0.4,0.05}` + `body {0.05,0.17,0.4,0.7}` + `subhead {0.55,0.1,0.4,0.05}` + `body {0.55,0.17,0.4,0.7}` — a plain two-column page with a standfirst over each column, both flush left in the reference. Emitted spec: `subhead align:'left'` in the left column and `subhead2 align:'right'` in the right one. The built page shows the right column's standfirst right-aligned; the two columns no longer match each other, and neither matches the upload. Same for the teaser `label` at x=0.52 on a cover.

**Proof:** Probe (`_probe_guillotine_5.mts`, since deleted) ran the finding's exact reading through `normalizeLayoutReading` → `readingToSpec` → `applyReadingToPage`. Input reading (symmetric two-column page, both standfirsts flush left in the reference): subhead {0.05,0.10,0.40,0.05} · body {0.05,0.17,0.40,0.70} · subhead {0.55,0.10,0.40,0.05} · body {0.55,0.17,0.40,0.70} Emitted spec (verbatim from the probe): root `col` → band 1 = `row` of {leaf subhead contentRef:"subhead" align:"left"} {leaf subhead contentRef:"subhead2" align:"right"} band 2 = `row` of two `body` leaves with no align (prose correc…

### MEDIUM — When the background photograph is retained, text contrast is computed against a phantom white page

`apps/server/src/lib/magazineV2/applyLayout.ts:311`  ·  reflow

**Fails when:** Imported page: `background:{type:'image',value:'…/dark-night-paddock.jpg'}` (a night shot), extracted text `color:'#1a1a1a'` (it sat in a white callout box on the scan, which processPage erased into the background). Reference is text-only (headline + body, no image region), so `usedBackground` stays false. Probe output: `background: {"type":"image","value":"https://x/dark-night-paddock.jpg"}` with `text color=#1a1a1a role=headline` and `text color=#1a1a1a role=body`. Near-black type over a night photograph, reported to the user as a fidelity match.

**Proof:** Probe (apps/server/tests/magazineV2/_probe_reflow_2.mts, since deleted) ran applyReadingToPage on ONE page — width 1275 x 1650, background {type:'image', value:'https://x/dark-night-paddock.jpg'}, elements = text(role 'headline', color #1a1a1a) + text(role 'body', color #1a1a1a) — against two readings. themeForPage(null, page) = {"palette":{"bg":"#ffffff","text":"#1a1a1a",...}} — bg is white although the page's background is a photograph. A) reference = headline box {0.1,0.1,0.8,0.15} + body {0.1,0.3,0.8,0.6}, background 'light' (no image region, so usedBackground stays false): background: {"…

### MEDIUM — Surplus QR codes, icons and every shape element are dropped without being counted in leftOver

`apps/server/src/lib/magazineV2/applyLayout.ts:161`  ·  reflow

**Fails when:** Page holds a headline, a subscription QR code, a brand icon and a gold rule (shape). Reference has one headline region and nothing else. Probe: `leftOver: {"text":0,"images":0}` — the QR, the icon and the shape are gone from the saved page, the toast says nothing had nowhere to go, and Ctrl+Z cannot bring them back. The client loses a working QR code silently.

**Proof:** Probe (real `applyReadingToPage`, deleted afterwards). Page = 5 normalized elements: headline text, body text, `qr {url:'https://stablepress.example/subscribe'}`, `icon {name:'Star', color:'#c9a227'}`, `shape {fill:'#c9a227'}` (a gold rule). Reading = two regions, `headline` + `body`, nothing else. Output: slots: [{"ref":"headline","role":"headline"},{"ref":"body","role":"body"}] why: "" (success — the page is written) leftOver: {"text":0,"images":0} element types out: text, text any qr on the new page? false any icon? false any shape? false So the saved page (routes/magazinesV2/index.ts:2778…

### MEDIUM — An unknown role silently becomes 'body': a photo region turns into prose and the page's photo is deleted

`apps/server/src/lib/magazineV2/layoutReading.ts:165`  ·  trust

**Fails when:** Reading `[{role:'photo', box:{0,0,1,0.5}}, {role:'headline',…}, {role:'body',…}]` applied to a page holding one image element + a headline + a body paragraph: the top half becomes a text box, the page comes back with `images: 0` (the hero photo is gone, only counted in `leftOver.images: 1`) and the user is told "Structure matched, proportions adapted (50%)". With `role:'image'` the identical reading returns the photo in place and "Matched your reference closely (78%)".

**Proof:** Probe (apps/server/tests/magazineV2/_probe_trust_0.mts, since deleted) calling the real `normalizeLayoutReading` → `applyReadingToPage`. Input: reading `[{role:<X>, box:{0,0,1,0.5}}, {role:'headline', box:{0.06,0.54,0.88,0.1}}, {role:'body', box:{0.06,0.66,0.88,0.3}}]`, aspect 800/1131, applied to an 800×1131 page holding one image element (hero.jpg, 800×560) + a headline + two body paragraphs. X='image' → normalised roles `image,headline,body`; elements `image@36h522 | text(headline)@618h104 | text(body)@782h313`; images on page 1; leftOver {"text":0,"images":0}; toast `[success] Matched you…

### MEDIUM — JSON with `//` comments (the shape the reading prompt demonstrates) parses as a nested `box` fragment

`apps/server/src/lib/magazineV2/parseJson.ts:41`  ·  trust

**Fails when:** Model returns exactly the shape it was shown: `{\n "aspect": 0.707, // width / height of the reference\n "background": "light",\n "regions": [ {"role":"image","box":{"x":0,"y":0,"w":1,"h":0.5},"z":0}, {"role":"headline",…} ],\n "confidence": 0.85\n}` → `parseJsonObject` returns `{"role":"image","box":{"x":0,"y":0,"w":1,"h":0.5},"z":0}` → reading null → HTTP 422 telling the user their image is illegible.

**Proof:** CONFIRMED (reduced): input = the comment-annotated JSON `readLayout.ts` demonstrates -> `parseJsonObject` returns `{"role":"image","box":{"x":0,"y":0,"w":1,"h":0.55},"z":0}` -> `normalizeLayoutReading` returns null (no `regions` key, `regions.length < 2` at layoutReading.ts:206) -> HTTP 422 'I could not make out a layout in that image. A flat, straight-on shot of the whole page works best.', with nothing logged server-side. REFUTED (the cited cause): parseJson.ts:41 is not the defect — `normalizeLayoutReading(parseJsonObject(text))` and `normalizeLayoutReading(null)` are both null for all fou…

### MEDIUM — One stray non-fractional side anywhere in the reading destroys the whole reading, not just that region

`apps/server/src/lib/magazineV2/layoutReading.ts:126`  ·  trust

**Fails when:** Reading `[{image, w:1, h:0.55}, {headline, w:0.84, h:0.1}, {body, x:0.08, y:0.72, w:80, h:0.2}, {caption, w:0.4, h:0.03}]` — three perfect fractional regions and one percent width — returns `null`, and the endpoint answers 422 'I could not make out a layout in that image. A flat, straight-on shot of the whole page works best.' A single `h: 1.6` overshoot in an otherwise perfect three-region reading does the same.

**Proof:** Probe (apps/server/tests/magazineV2/_probe_trust_2.mts, now deleted) against the real `normalizeLayoutReading` / `applyReadingToPage`: A) The reviewer's exact input `[{image,w:1,h:0.55},{headline,w:0.84,h:0.1},{body,x:0.08,y:0.72,w:80,h:0.2},{caption,w:0.4,h:0.03}]` → `null`. Also `single overshoot (h:1.6) → null`, and the boundary is exactly where the comment says: `side=1.5 → survives`, `side=1.501 → NULL`. So `readLayout.ts:129-133` returns the "I could not make out a layout in that image. A flat, straight-on shot of the whole page works best." sentence and `routes/magazinesV2/index.ts:939…

### MEDIUM — The score is aspect-blind: a landscape reference on a portrait page scores 0.947 'matched'

`apps/server/src/lib/magazineV2/layoutFidelity.ts:111`  ·  fidelity

**Fails when:** Client uploads a photograph of a landscape double-page spread and applies it to a portrait A4/Letter page. The rebuilt page's two columns are now narrow vertical strips that read nothing like the spread. Panel: emerald "Matched · 95%" + green success toast "Matched your reference closely (95%)", immediately contradicted by a neutral toast saying the layout "can only be adapted, not matched".

**Proof:** Probe (deleted) calling the real pipeline: reading = normalizeLayoutReading({aspect: 1.42, margin:'md', regions:[image 0,0,0.52,1 | headline .56,.06,.4,.14 | byline .56,.22,.4,.04 | body .56,.3,.4,.62]}), page = 1275x1650 portrait with a headline, byline, body paragraph and one image element, via applyReadingToPage(reading, page, null). Actual output: score 0.846, verdict 'matched', summary "Matched your reference closely (85%)."; aspectMismatch(reading,1275,1650) = "The reference is landscape and this page is portrait, so the layout can only be adapted, not matched." The route returns both i…

### MEDIUM — `missing` regions are documented as lowering the score but are excluded from the mean entirely

`apps/server/src/lib/magazineV2/layoutFidelity.ts:40`  ·  fidelity

**Fails when:** Reference has a headline, a photo and a QR panel; the page has no QR code, so pruneSpec drops that leaf. The two survivors land on their read boxes, `slots.length === 2`, `missing === 1`, `score === 1.0`. The verdict box reads "Adapted · 100%" and the sentence "Structure matched, proportions adapted (100%). 1 box from the reference had nothing to put in it, so the rest grew to fill the page." — a 100% match reported for a page that reproduced two thirds of the reference.

**Proof:** Proved with the REAL pipeline (probe at apps/server/tests/magazineV2/_probe_fidelity_3.mts, now deleted), calling `applyReadingToPage(normalizeLayoutReading(...), page, null)` — no hand-built SolvedLayout. Input D — reference read as a full-bleed photo with a text overlay over it: regions `[{role:'image',box:{0,0,1,1}},{role:'body',box:{0,0,1,1}}]`; target page = 1275x1650, `background:{type:'color'}`, elements = a headline and a body paragraph, NO image element and NO background image. Actual output: the built page has **0 image elements** and a flat `{"type":"color","value":"#ffffff"}` back…

### LOW — leftOver.images counts the retained background photo as lost, so the studio warns about a photo it kept

`apps/server/src/lib/magazineV2/applyLayout.ts:253`  ·  reflow

**Fails when:** Page with `background:{type:'image',value:'https://x/scan.jpg'}`, a headline and a body paragraph, zero image elements. Reference is text-only (headline box + body box). Probe: `background kept: {"type":"image","value":"https://x/scan.jpg"}` and `leftOver: {"text":0,"images":1}`. Toast reads 'Matched your reference closely (…%). 1 photo had nowhere to go and stayed out.' — a false loss report on a page where nothing was lost, which will send the client hunting for a missing photo.

**Proof:** Probe (apps/server/tests/magazineV2/_probe_reflow_3.mts, since deleted) calling the real applyReadingToPage/reflowContent. Input: page {width:1240,height:1754, background:{type:'image',value:'https://x/scan.jpg'}, elements:[text role=headline, text role=body]} (zero image elements); reading = two regions, headline {x:.08,y:.06,w:.84,h:.14} and body {x:.08,y:.26,w:.84,h:.62}, no image region. Actual output: slots: [{"ref":"headline","role":"headline"},{"ref":"body","role":"body"}] reflow leftOver: {"text":0,"images":1} usedBackground: false why: "" background kept: {"type":"image","value":"htt…

### LOW — A missing `aspect` defaults to A4 portrait, and aspectMismatch then asserts that orientation to the user

`apps/server/src/lib/magazineV2/layoutReading.ts:224`  ·  trust

**Fails when:** Model returns a valid two-region reading of a landscape screenshot but no `aspect` key; the target page is a landscape PDF import (1650×1275, or any page whose stored width > height). `aspectMismatch` returns 'The reference is portrait and this page is landscape, so the layout can only be adapted, not matched.' — a false statement about the user's own upload that discourages a layout which would in fact fit.

**Proof:** Probe (apps/server/tests/magazineV2/_probe_trust_3.mts, since deleted), real functions, real inputs: Input: `normalizeLayoutReading({ background:'light', margin:'md', confidence:0.9, regions:[{role:'image',box:{x:0,y:0,w:0.5,h:1}},{role:'body',box:{x:0.52,y:0.1,w:0.44,h:0.7}}] })` — i.e. a valid two-region reading of a landscape screenshot with no `aspect` key. Output: `aspect = 0.7071067811865475`. Then `aspectMismatch(reading, 1650, 1275)` (a landscape Letter PDF import at 150 DPI) returns: "The reference is portrait and this page is landscape, so the layout can only be adapted, not matched…

### LOW — unit() turns a 1–10 style confidence into 1–10%, and its test asserts only `<= 1`

`apps/server/src/lib/magazineV2/layoutReading.ts:99`  ·  trust

**Fails when:** Model returns `confidence: 8` (out of 10) with a clean reading → stored confidence 0.08 → panel shows 'Barely legible — a flatter, straight-on shot would read better · 8%' above a reading whose regions are correct.

**Proof:** Confirmed empirically against the real function. Input: `normalizeLayoutReading({ aspect: 0.707, background: 'light', margin: 'lg', regions: [{role:'image',box:{x:0,y:0,w:1,h:0.6}},{role:'headline',box:{x:0.08,y:0.65,w:0.84,h:0.12}}], confidence: 8 })`. Output: `confidence: 0.08` with `regions` unchanged and correct. Fed through the verbatim thresholds of LayoutReference.tsx:42-46 and the render at :173, the panel prints "Barely legible — a flatter, straight-on shot would read better · 8%" above a perfect reading. Same run: `1.4 -> 0.014`, `2 -> 0.02`, `7 -> 0.07`, `10 -> 0.1` (i.e. a 10/10 r…

### LOW — A model refusal reads as "your image is unreadable", and that path logs nothing

`apps/server/src/lib/magazineV2/readLayout.ts:129`  ·  vision

**Fails when:** A client uploads a straight-on flatbed scan of a printed magazine page. The model replies "I'm sorry, I can't help with reproducing this copyrighted magazine page." (probed: `parseJsonObject(...)` -> null -> `normalizeLayoutReading(null)` -> null). The user is told their photo is not flat enough and re-shoots it, forever; the server logs are empty, so nobody can see that the model is refusing rather than squinting. The same sentence is produced if the model answers with a top-level array of regions instead of an object (probed: parseJsonObject picks up the first region object, regions is absent, -> null).

**Proof:** Probed against the real functions. Input: the model completion `[{"role":"image","box":{"x":0,"y":0,"w":1,"h":0.5}},{"role":"body","box":{"x":0,"y":0.5,"w":1,"h":0.5}}]` (a correct reading, emitted as a top-level array). Output: parseJsonObject returns the FIRST region object, `o.regions` is absent, regions.length 0 < 2 -> normalizeLayoutReading null -> the user is told "I could not make out a layout in that image. A flat, straight-on shot of the whole page works best." about an image whose layout was read perfectly, and stdout contains no `[magazineV2]` line — only `[api] ... → 422`. Same ou…

### LOW — The vision call assumes the swappable AGENT_MODEL can see images; a permanent fault says "try again"

`apps/server/src/lib/magazineV2/readLayout.ts:104`  ·  vision

**Fails when:** An operator sets AGENT_MODEL to a text-only or misspelled slug on the API service (as happened in prod). Every "use this layout" upload returns 422 "Reading the layout failed. Please try again." or "That image could not be read by the model. PNG or JPEG under a few MB works best." Clients re-upload smaller and smaller JPEGs of the same page; the feature is 100% broken, the message says otherwise, and the diagnosis lives only in a console.warn line that names no model id.

**Proof:** Ran the real `readLayoutImage` against live OpenRouter with the repo's own key, one slug per process. AGENT_MODEL=meta-llama/llama-3.1-8b-instruct (a real, text-only model — the "swap for a cheaper model" case provider.ts:6 invites), image = a public .jpg URL: provider error message: "No endpoints found that support image input" readLayout.ts:143 regex /image|media type|unsupported|too large|payload/i matches on the word "image" returned to the user, verbatim, as a 422 body (index.ts:939) and toasted by LayoutReference.tsx:129: "That image could not be read by the model. PNG or JPEG under a f…

### LOW — `aspect` is an unruled model guess with a portrait default, so the shape warning switches itself off

`apps/server/src/lib/magazineV2/readLayout.ts:45`  ·  vision

**Fails when:** A client screenshots a wide desktop layout (aspect ~1.8) and uploads it against a portrait page. The model omits `aspect`. Probed: `aspectMismatch(reading, 1240, 1600)` returns '' -> LayoutReference.tsx renders no amber warning at all, so the user is told nothing and gets bands squashed into portrait. With `aspect: 1.4` present the same call returns "The reference is landscape and this page is portrait, so the layout can only be adapted, not matched."

**Proof:** Probe of the real functions: normalizeLayoutReading({background:'light',margin:'md',confidence:0.8,regions:[{role:'image',box:{x:0,y:0,w:0.55,h:1}},{role:'headline',...},{role:'body',...}]}) with NO `aspect` key -> reading.aspect === 0.7071067811865475. aspectMismatch(thatReading, 1275, 1650) === '' (canonical page; also '' for 1240x1754 and 1240x1600), while the identical payload plus `aspect: 1.8` -> "The reference is landscape and this page is portrait, so the layout can only be adapted, not matched." Wrong output #1: no amber banner at LayoutReference.tsx:165 and no toast at store.ts:764 …

### LOW — The 'adapted' sentence asserts "Structure matched" down to 0.45, and "proportions adapted" at 1.0

`apps/server/src/lib/magazineV2/layoutFidelity.ts:160`  ·  fidelity

**Fails when:** A reference that the guillotine could only half-reproduce scores 0.47. The user is shown the neutral (deliberately non-fault) 'adapted' tone, a success toast, and the words "Structure matched, proportions adapted (47%)" — told the structure was reproduced when less than half of the average box overlaps where it was read.

**Proof:** CONFIRMED (weak form). Input: normalizeLayoutReading({margin:'normal', regions:[kicker(0.09,0.06,0.50,0.28), image(0.52,0.34,0.47,0.19), caption(0.59,0.23,0.38,0.71)]}) -> readingToSpec -> solveLayout(1275x1650, measureLeaf 90) -> measureFidelity. Output: score=0.463, verdict='adapted', summary="Structure matched, proportions adapted (46%). The kicker moved the most.", while slot hero read=[0.52 0.34 0.47 0.19] got=[0.03 0.02 0.94 0.96] (iou 0.095) - a 9%-of-page photo block became the full-page backing layer, so "Structure matched" is false. Second instance via the real entry point: applyRea…

### LOW — `${short}` in the 'matched' sentence is unreachable, and `slots`/`worst` never reach the client

`apps/server/src/lib/magazineV2/layoutFidelity.ts:153`  ·  fidelity

**Fails when:** A maintainer adding a "which box moved?" affordance to the verdict box reads `Fidelity.worst` ('The slots that moved the most, worst first — what to mention') and wires the UI to it, then finds it undefined at runtime because the route dropped it; and a maintainer editing the missing-boxes wording edits the 'matched' branch's copy, which can never render.

**Proof:** Confirmed half: no input exists where `summarize`'s 'matched' branch renders `short` non-empty. Probe output over 232,400 real `measureFidelity` calls: `{ cases: 32400, matchedTotal: 610, matchedWithMissing: 0, matchedSummariesWithShort: 0 }` and `{ rndMatched: 44697, rndMatchedWithMissing: 0 }`. The exact state the reviewer says is impossible (origin `{hero, body, caption}`, solved leaves `{hero, body}` placed perfectly) returns score 1.000, verdict `adapted`, summary "Structure matched, proportions adapted (100%). 1 box from the reference had nothing to put in it, so the rest grew to fill t…

### LOW — apply-layout re-reads the image under the 20/min agent bucket, tripling the 10/min vision ceiling

`apps/server/src/routes/magazinesV2/index.ts:2729`  ·  endpoints

**Fails when:** A client bug (or a bored staff account) loops `POST /issues/<id>/pages/<pageId>/apply-layout` with `{ rev, assetId }` and no `reading`. The rev guard 409s after the first success, but the 422/409 is returned AFTER readLayoutImage has already run and been billed — the vision call is made before the write is attempted. 20 vision calls/min from that endpoint plus 10/min from /layout-reference = 1,800 paid image reads per hour per account, against an intended 600, and there is no token metering anywhere in this router (docs/AI-AGENTS-AUDIT.md).

**Proof:** Probe (deleted) exercising the real middleware with one account id: `mag2-layout-read` admitted 10, `mag2-agent` admitted 20, total 30 in the same 60s window; `mag2-write` admitted 300 and does not constrain it. Concrete abuse state that actually works: staff account with magazine.edit and a collaborator/owner role on magazine M, media asset A in M whose vision read fails or whose reading 422s in applyReadingToPage (index.ts:2771) — loop `POST /issues/M/pages/P/apply-layout {rev: <current rev>, assetId: A}`. No write occurs, so `rev` never advances and the guard at index.ts:2735 never fires; …

### LOW — "a reading deeper than the depth budget still survives" — it does not; only the truncated spec does

`apps/server/tests/magazineV2/readingToSpec.test.ts:305`  ·  endpoints

**Fails when:** Not a runtime failure — a coverage illusion. Someone changes MAX_TREE_DEPTH, `canContain`, or the `biggest()` fallback in `partition`/`stackFor` and increases how many regions get discarded. All 210 tests still pass, including this one, because it only ever compares the spec to itself after normalization.

**Proof:** Probe output on the test's exact fixture: `regions read: 5 headline,image,body,kicker,body` → `slots in the spec: 4 headline(headline),hero(image),body(body),body2(body)` → `LOST in the converter: 1`, `origin keys: headline,hero,body,body2`, `depthOf(spec.root) = 4`, and the test still passes (23/23 in readingToSpec.test.ts). Mutation matrix on the same fixture: `real d+2: slots=4 lost=1 depth=4 depthAssert=PASS deepEqual=PASS` / `loose d+1: slots=5 lost=0 depth=5 depthAssert=FAIL deepEqual=FAIL` / `tight d+3: slots=3 lost=2 depth=3 depthAssert=PASS deepEqual=PASS`. The tight row is the confi…


---

# Unverified leads (25)

Filed by a reviewer but **never put to a skeptic** — the org spend limit killed the
verifiers for the chat, client, contracts and test dimensions, plus the completeness
critic. Four were verified by hand afterwards and appear in the themes above (the
CRITICAL theme derivation, the missing chat confirm, and two cover-bug variants).
Treat the rest as leads to check, not facts.

### CRITICAL — Applying a layout to a PDF-imported page can produce an all-white page: white ink on a white repaint

`apps/server/src/lib/magazineV2/applyLayout.ts:84`

**Fails when:** A magazine imported from PDF (processPage stores `background:{type:'image'}` + text elements, and light text over a dark photo is the normal case for an imported feature spread). The client uploads a reference image and says "use this layout"; the reference has at least one photo region. Probe result on exactly that input: derived theme `{"palette":{"bg":"#ffffff","text":"#ffffff","primary":"#f2f2f2","secondary":"#ffffff","accent":"#f2f2f2"}}`, written page background `{"type":"color","value":"#ffffff"}`, and every text element `color:'#ffffff'` — a blank white page with one photo on it, reported to the user as "Structure matched, proportions adapted (63%)". Undo does not cover it (store.ts…

**Claim:** `themeForPage` derives the palette from the page itself. For an imported page the ground is a photo, so line 84 falls back to a hard-coded `'#ffffff'` for `palette.bg`, while `ink` (lines 74-82) is the colour most of the words are already in — which on a page whose text sat over a dark photograph is white/near-white. So the derived palette is `{bg:'#ffffff', text:'#ffffff', primary:'#f2f2f2', …}`. Then, when any image slot consumes the background photo (`usedBackground`), lines 311-313 keep `co…

### HIGH — Confirm promises "your words are kept", but surplus text is deleted for good and toasted as success

`apps/web/src/editor-v2/LayoutReference.tsx:101`

**Fails when:** Page 3 holds a headline plus three body paragraphs. The client uploads a photo-led reference the model reads as image + headline + caption (no body region). The dialog says "4 items will move into the new structure. Your words and photos are kept…", the user clicks OK, and a green toast says "Structure matched, proportions adapted (56%). The headline moved the most. 2 text blocks had nowhere to go and stayed out." Two of the three paragraphs no longer exist anywhere — not on the page, not in the undo stack, not on the server.

**Claim:** The one dialog where the user consents to an irreversible rebuild says: `${elementCount} item${...} will move into the new structure. Your words and photos are kept, but the current arrangement cannot be brought back with undo.` The promise is only true when the reference has a `body`/`entry` region. `reflowContent` (apps/server/src/lib/magazineV2/applyLayout.ts:242-251) parks spare prose in "the LARGEST body slot" — `slots.find((s) => s.role === 'body' || s.role === 'entry')` — and when the re…

### HIGH — The chat path rebuilds the page with no confirm, while its comment claims the confirm is shared

`apps/web/src/editor-v2/store.ts:1114`

**Fails when:** A user attaches a magazine spread in the Studio Assistant and types "use this layout". The tray shows one row: "Rebuild this page in that layout — a headline, a body, 2 images". They click "Apply all" expecting a stageable edit like every other proposal. Every element on the page is replaced with new ids, Ctrl+Z does nothing (undoStack was emptied), and the only warning they ever see arrives after the fact in the result toast.

**Claim:** The comment above the call reads: "Straight through the same store action the panel uses: one apply path means the confirm, the undo-stack clear, the thumbnail refresh and the measured verdict can't drift between the two ways of reaching it." The confirm is not in `applyLayout` — it lives in `LayoutReference.apply` (LayoutReference.tsx:99-103), which the chat path never calls. So `applyAllProposals` destroys every element on the page, clears the undo stack and returns, having asked nothing. The…

### HIGH — Parallel tool calls defeat the layout-exclusivity guard; both tools return ok, then the edit is dropped

`apps/server/src/lib/magazineV2/agent.ts:354`

**Fails when:** User attaches a reference page and sends one message: "use this layout, and make the headline bigger". The model emits `use_image_as_layout` + `set_element_style` in one step (call order layout-first). Both return ok; the tray lists "Rebuild this page in that layout — …" AND "Restyled the headline"; the assistant says it staged both. "Apply all" hits `applyAllProposals`, which finds the layout, applies it, clears `proposals`, and returns (store.ts:1103–1116) — the restyle is discarded with no toast, no count, no mention. The user is told two things were staged and one silently never happens.

**Claim:** `use_image_as_layout` checks `if (ctx.proposals.length > 0)` synchronously at the top of `execute`, but only pushes its `apply-layout` proposal TWO awaits later (line 360 `db…find`, line 364 `await readLayoutImage(url)` — a multi-second vision call). Every other tool's guard is the synchronous `if (hasLayout(ctx))` (lines 212, 332, 388, 413, 434, 452), which reads the same array. The AI SDK runs all of a step's tool calls concurrently — `ai@6.0.205` dist/index.mjs:4985, `executeTools()` = `awai…

### HIGH — Chat rebuilds the page with no confirm and no aspect warning; the shared-confirm comment is false

`apps/web/src/editor-v2/store.ts:1112`

**Fails when:** User attaches a landscape screenshot of a web page and types "make my page look like this" on a finished A4 page with 14 elements. The tool stages `apply-layout`; the tray shows one line, "Rebuild this page in that layout — a headline, 2 bodys, a image". The user clicks Apply all. Every element is replaced server-side, `undoStack` is emptied, and only then does a toast say "The reference is landscape and this page is portrait, so the layout can only be adapted, not matched." There is no undo, no revert endpoint, and the previous arrangement is gone — the same action the panel refuses to perform without a modal.

**Claim:** The comment at lines 1111–1113 says "Straight through the same store action the panel uses: one apply path means the confirm, the undo-stack clear, the thumbnail refresh and the measured verdict can't drift between the two ways of reaching it." The confirm is NOT in `applyLayout` — it lives in `LayoutReference.apply()` (LayoutReference.tsx:99–103, `window.confirm("…the current arrangement cannot be brought back with undo")`). `applyLayout` only does the write, the undo-stack clear (`undoStack: …

### HIGH — Agent media allow-lists ignore `kind`, so documents and licensed references are placeable photos

`apps/server/src/lib/magazineV2/agent.ts:236`

**Fails when:** (a) A magazine with a populated Uploads library: user says "add a photo from my library to the bottom of this page". `list_media` returns `{ assetId, url: 'https://…/brief.pdf', alt: 'brief.pdf' }`; `add_media_image` accepts it because `media.find(m => m.url === url)` matches with no kind check; `normalizeElements` does not validate the URL's media type. The page gets an image element pointing at a PDF — a broken image, saved and published. (b) User uploads a competitor's spread via the Layout panel (stored `kind:'reference'`), applies the layout, then next turn says "add a photo bottom-right" — the reference scan is in `list_media` and `add_media_image` places it, putting the licensed page…

**Claim:** `list_media` (line 236), `set_element_image`'s known-URL set (302–305), `add_media_image` (392–395) and `use_image_as_layout` (360–363) all do `db.collection(COL.media).find({ magazineId })` with no filter on `kind`. But `COL.media` holds three kinds: `'upload'`, `'reference'` (a layout scan) and `'doc'` (PDF/DOCX/CSV/JSON/text uploads, inserted at routes/magazinesV2/index.ts:782–797 with a real `url`). `GET /issues/:id/media` filters both out and calls the reference exclusion "a PROMISE: a lay…

### HIGH — The terse-slot test uses ROLED copy, so it never reaches pass 1, where unroled copy goes out longest-first

`apps/server/tests/magazineV2/applyLayout.test.ts:186`

**Fails when:** A PDF-imported page holding three unroled blocks — 'STABLE LIFE', 'The Hour Before Thunder', and a 130-char paragraph — plus a reference read as kicker(top) / headline / body. Probed through the real `applyReadingToPage`: kicker box gets the 130-char paragraph (rendered as a 22px subhead line in a 55px-tall strip at y=36), the 1109px body block gets 'STABLE LIFE', and the headline keeps the title. Every text on the page is in the wrong box, and the toast the user sees is "Matched your reference closely (75%)". No test in the four files goes red.

**Claim:** The test's two elements are `text('body', …)`, which land in the `byRole` pool. A `caption` slot therefore fails pass 1 (`takeMatching` finds no `caption` and `loose` is empty) and is filled in pass 2, which is the only place `TERSE_SLOTS` is consulted. So the assertion only ever exercises `takeAny`. The path a real page takes is pass 1. `takeMatching` (applyLayout.ts:178-183) ends with `return loose.shift();`, and `loose` was sorted longest-first at line 151. Slot roles are ignored: the FIRST …

### HIGH — 'no leaf was silently deleted' compares the spec with itself; the converter already dropped a region

`apps/server/tests/magazineV2/readingToSpec.test.ts:330`

**Fails when:** A reading of a full-bleed photo with a second inset photo and a scrim (3 regions) converts to ONE leaf — two regions silently discarded — and `measureFidelity` returns `missing: 0`, `score 0.90`, verdict `matched`, summary "Matched your reference closely (90%)." That sentence is toasted to the user by store.ts:763. The test file's own depth fixture is the milder version: 1 of 5 regions gone, reported as "Matched your reference closely (95%)."

**Claim:** The assertion is `leaves(normalized.root).length === leaves(spec.root).length`. Both sides come from the converter's own output, so it can only detect deletions by `normalizeLayoutSpec` — never deletions by the guillotine itself. On this very fixture the guillotine drops a region: 5 read regions → 4 leaves (`roles = [headline, image, body, body]`; the `kicker` is gone, collapsed by `canContain(3) === false` → `leafFor(biggest(regions))` at readingToSpec.ts:347). The loss is then hidden from the…

### HIGH — The cover test's fidelity assertions pass with the FR-GUARANTEE bug re-planted, and so does the user's number

`apps/server/tests/magazineV2/applyLayout.test.ts:366`

**Fails when:** Anyone who refactors pruneSpec's option plumbing (or flips the default) and checks only the fidelity numbers, or who trusts the shipped metric: a cover whose tagline covers 71% of the sheet is reported to the client as "Structure matched, proportions adapted (96%). The headline moved the most." — delivered by `toast.success` (store.ts:763), because the verdict is not 'loose'.

**Claim:** Lines 366-367 assert `fidelity.verdict === 'adapted'` and `fidelity.score > 0.75` with the comment "it was 0.05 before the fix". I re-planted the exact regression by copying pruneSpec.ts with `!keepWhitespace` removed from the FR-GUARANTEE condition (line 78) and pointing a copy of applyLayout.ts at it. The page comes back broken — tallest text 1177px of a 1650px sheet, lowest text bottom 1590px — and the fidelity report is byte-identical to the healthy run: `score 0.962`, `verdict adapted`, sa…

### HIGH — EMPTY_END content-sizing works only for text: one image band re-creates the stretched-cover bug

`apps/server/src/lib/magazineV2/readingToSpec.ts:387`

**Fails when:** Reference = a cover with the masthead cluster in the top 40% and the lower 60% deliberately empty: kicker(y .03-.06), headline(y .07-.16), photo(y .18-.40). readingToSpec correctly emits `sizing:['content','content','content'], justify:'start', pad:'lg'`. Solved with the real measure fn the photo lands at y 0.243-0.942 of the page instead of 0.18-0.40 — it fills the empty lower two-thirds — and measured fidelity is 0.232 ('loose'). With `justify:'end'` (cluster low on the page: photo .62-.82, headline .84-.92) the photo is dragged to y 0.080-0.776, i.e. to the TOP of the page, the opposite end from the reference.

**Claim:** The empty-end branch is guarded by `allLeaves` and its comment says content sizing "only applies to LEAF children (resolveMainSizes), which is why this path is limited to them". Leaf-ness is not the real precondition. `resolveMainSizes` (solveLayout.ts:110-119) only fixes a track when `measure` returns a finite number, and the production measure returns null for every non-text leaf: `makeMeasureLeaf` → `if (!TEXT_ROLES.has(leaf.role)) return null;` (measureLeaf.ts:33). An image / qr / icon leaf…

### HIGH — The background override never checks full-bleed, so a thumbnail slot deletes the page's photo ground

`apps/server/src/lib/magazineV2/applyLayout.ts:311`

**Fails when:** An imported page (its whole photographic content is `background:{type:'image'}`) + a reference whose first image region is a thumbnail, e.g. `{x:0.72,y:0.06,w:0.2,h:0.1}`. Result: the page's only picture is written as a 286x190 element in the top-right corner and the background becomes `{"type":"color","value":"#fbf7ef"}`. The rasterised page — the client's actual artwork — is reduced to a stamp, on an operation the user expected to rearrange the page, and the studio reports success with the undo stack cleared.

**Claim:** The override keeps a background photo only when nothing consumed it. Its comment justifies the other branch with "If the photo became a full-bleed element instead, the colour is right (the element covers it)" — but nothing in the code tests that the consuming slot is full-bleed, or even large. `reflowContent` unshifts the background image to the FRONT of the photo pool (line 158) and hands it to the FIRST image slot in tree order (line 211), whatever its size; `usedBackground` is then true and …

### MEDIUM — One median gap token capped at 96px collapses large internal whitespace and shifts later bands

`apps/server/src/lib/magazineV2/readingToSpec.ts:171`

**Fails when:** Reading = `subhead {0.06,0.05,0.88,0.05}` + `headline {0.06,0.47,0.88,0.09}` + `byline {0.06,0.58,0.4,0.03}` — a strapline at the top, the title mid-page, a 37%-of-page void between them. Built page: the strapline lands at y=0.08 (right), but the headline read at y=0.47 lands at y=0.165 and the byline read at y=0.58 lands at y=0.284 — the mid-page title is a third of a page too high. Score 10%, "loose".

**Claim:** `gapFor` reduces all inter-band gaps to a single token and `spaceTokenFor` clamps to `SPACE_PX.xl = 96` — 5.8% of PAGE_H (1650). Once a container is content-sized by the EMPTY_END path, each band keeps its own height but the void BETWEEN bands can no longer be expressed, so everything after a large gap slides up by (void − 96px). The fr path at least distributes the void into the bands proportionally. Note the DSL already offers `justify:'between'` (FLEX_ALIGNS) and the converter never emits it…

### MEDIUM — applyLayout clears the undo stack for every page and magazine, not just the page it rebuilt

`apps/web/src/editor-v2/store.ts:749`

**Fails when:** The user nudges three text boxes on page 2, scrolls to page 7 (the scroll-settle picker makes it current) and applies a reference layout there. Ctrl+Z, which the studio advertises for element edits, now does nothing for page 2's three edits even though those elements were untouched. Worse variant: the apply-layout POST is slow, the user opens another magazine and moves an element there; when the stale response lands it wipes that magazine's undo stack, clears its selection mid-edit, and sets `editedSinceLoad: true`, so it reports "needs republish" for a write that never happened to it.

**Claim:** `set((st) => ({ … undoStack: [], redoStack: [], selectedId: null, editedSinceLoad: true }))` is applied unconditionally, justified by "Every element on the page is new, so the old undo entries point at elements that no longer exist". But the undo stack is cross-page by design: `UndoEntry` carries a `pageId` and `undo()` opens `entry.pageId` before patching (store.ts:58-63, 484-502), so entries for other pages point at elements that are still there. Filtering (`st.undoStack.filter(e => e.pageId …

### MEDIUM — Selecting any element unmounts the panel and silently discards the reading and the vision call

`apps/web/src/editor-v2/LayoutReference.tsx:91`

**Fails when:** The user uploads a reference, reads "Read clearly · 88%" and the six numbered regions, then clicks the headline on the canvas to check its wording before committing. The right pane switches to the element inspector; deselecting returns a blank "Upload a reference" button. The reference image, the reading and the aspect warning are gone, and re-reading it costs another vision call.

**Claim:** `shot` and `fidelity` are `useState` inside `LayoutReference`, which is rendered only from `PagePanel` — and Inspector.tsx:202 chooses `el ? <ElementPanel/> : <PagePanel/>`, so the panel unmounts the moment anything on the canvas is selected, or the user switches to the Assets tab. Everything the reference cost (an S3 upload plus a rate-limited vision call, `rateLimit('mag2-layout-read', 10, 60_000)`) is discarded with it: the preview, the region list, the confidence line, the aspect warning an…

### MEDIUM — The verdict survives a page change and the confirm names no page, so the wrong page can be rebuilt

`apps/web/src/editor-v2/LayoutReference.tsx:222`

**Fails when:** Apply the reference to page 3; the verdict box says "Matched your reference closely (81%)" and the button relabels to "Use this layout on this page too". The user scrolls the canvas down to look at the result and stops with page 4 nearest the centre, so the settle picker makes page 4 active. Believing the panel still describes page 3, they click the button, confirm "Rearrange this page into that layout?", and page 4 — never intended, still showing an 81% verdict that belongs to page 3 — is rebuilt and cannot be restored.

**Claim:** Nothing resets `fidelity` when `currentPageId` changes — it is cleared only in `onPick` (line 116). Meanwhile the apply button re-targets itself silently: it reads no page id, and `applyLayout` uses whatever `s.page` is at call time. The active page changes not only from the rail but from merely scrolling the canvas — EditorCanvas.tsx:487-501 picks the page nearest the viewport centre after a 120 ms settle and calls `openPage(bestId)`. The confirm text (line 101) never names a page: "Rearrange …

### MEDIUM — Page-structure tools have no layout guard, and the client discards their proposals uncounted

`apps/server/src/lib/magazineV2/agent.ts:487`

**Fails when:** Owner attaches a reference and says "use this layout, then add three more pages in the same style". Step 1 stages `apply-layout`; step 2 stages `generate-pages` (count 3). Both tools return ok, the assistant says both are prepared, and the tray shows two rows. Apply all → the page is rebuilt, `deferGenerate` is never reached, and no page is generated. The toast is the layout's fidelity summary, so nothing tells the user the three pages did not happen. Same for "copy this layout and delete page 5": page 5 survives silently.

**Claim:** `hasLayout(ctx)` is checked at all six element-staging sites but at none of `add_page` (490), `add_content_pages` (500), `remove_page` (511) or `reorder_pages` (519). So a turn can legitimately (no race needed, just two sequential steps) stage `[apply-layout, add-page]` — `use_image_as_layout` runs first with an empty proposal list, and the page tools never look. `applyAllProposals` then handles the layout "on its own" and `return`s at store.ts:1115, before both application loops and before the…

### MEDIUM — A layout reference attached in chat is stored as kind:'upload', so the picker exclusion never covers it

`apps/web/src/editor-v2/AiPanel.tsx:263`

**Fails when:** User drags a scan of a Vogue spread into the chat composer, types "use this layout", and the layout is applied. The scan is now `kind:'upload'`. They open the Inspector's photo picker to change a photo, and the Vogue page is sitting there as a thumbnail alongside their own horses; one click puts a competitor's copyrighted page into the magazine and, via the cover picker, onto the public newsstand.

**Claim:** `uploadMediaImage(issueId, a.file, a.file.name)` is called with no `kind`, so the route defaults to `kind: 'upload'` (routes/magazinesV2/index.ts:887). The only caller that passes `'reference'` is LayoutReference.tsx:120. Chat is the primary entry point for this feature — the whole attached-images prompt block (agent.ts:131–146) and `use_image_as_layout` exist for it — yet a reference arriving that way is indistinguishable from the client's own photos in the DB. `GET /media` therefore lists it …

### MEDIUM — The reference image's transcribed content reaches the agent as a SOURCE DOCUMENT to copy from

`apps/web/src/editor-v2/AiPanel.tsx:273`

**Fails when:** User attaches a photo of a competitor's spread and types "use this layout for my page". The prompt contains the spread's transcribed headline, deck and pull quote as the SOURCE DOCUMENT, and the user's own sentence contains "use it for this page". The model calls `set_element_text` on the headline with the competitor's headline (this stages fine — nothing is in `proposals` yet), then calls `use_image_as_layout`, which is refused by the `ctx.proposals.length > 0` check at agent.ts:354. The user's page now carries the reference's copy and NOT the layout they asked for — the exact inversion of what both the panel copy and the tool description promise.

**Claim:** For every attached image the composer also runs `ingestFile` → `attachmentSourceText` (AiPanel.tsx:271–278), which for an image flattens the vision digest's `summary`, `sections`, `tables` and `facts` (documentUpload.ts:102–115) — i.e. a transcription of whatever text is on that page — and pushes it into `src`, which becomes the request's `sourceText`. The server then renders it into the system prompt under "The user attached a SOURCE DOCUMENT… draw real copy from its ACTUAL content (names, fig…

### MEDIUM — leftOver.images counts the background photo the page KEPT, so the user is told a photo stayed out

`apps/server/src/lib/magazineV2/applyLayout.ts:253`

**Fails when:** A PDF-imported page (`background: {type:'image'}`, zero image elements) plus a text-only reference (headline + body). Probed end-to-end: `background = {type:'image', value:'https://x/scan.jpg'}` — correctly kept — and `leftOver = {text:0, images:1}`. The user's toast reads "Structure matched, proportions adapted (64%). The text moved the most. 1 photo had nowhere to go and stayed out." while the photo is in fact still on the page, sending them to hunt for a photo that was never lost.

**Claim:** The page background is unshifted into the `images` pool at line 158. When no image slot consumes it, it stays in the pool and is counted by `leftOver: { …, images: images.length }` at line 253 — yet lines 311-313 deliberately keep it as the page background, which is the whole point of that clause. The two reports contradict each other. The web client turns that count into a claim of loss: `${leftOver.images} photo…` + " had nowhere to go and stayed out." (store.ts:757-759). The test that covers…

### MEDIUM — `pad` is emitted as a one-end margin but the solver insets all four sides, gutter-ing full-bleed bands

`apps/server/src/lib/magazineV2/readingToSpec.ts:396`

**Fails when:** Reference with `margin:'none'` (a full-bleed design): image `{x:0,y:0.2,w:1,h:0.3}` plus a headline below it, lower half empty. readingToSpec emits root `col` with `pad:'xl'`. The photo the model read as edge-to-edge (x 0..1) is solved at x 0.075..0.925 — a 96px white gutter down both sides of a full-bleed photograph, on a page whose margin was set to none precisely to avoid that.

**Claim:** Both places that emit `pad` (line 322 in `flatten`, line 396 in `partition`) choose it as the main-axis margin between the container edge and the cluster ('`pad` for the margin before it'). solveLayout applies it symmetrically on BOTH axes: `insetRect(rect, SPACE_PX[node.pad ?? 'none'])` (solveLayout.ts:153, 83-87). Two consequences the converter does not intend: (a) the cross axis is shrunk by 2xpad, so a region the model read as bleeding to the page edges is inset by up to 96px (`xl`) on each…

### MEDIUM — Spare prose is merged into one body slot, zeroing leftOver and often tripping the QA refusal

`apps/server/src/lib/magazineV2/applyLayout.ts:249`

**Fails when:** A page with a headline, a photo and six paragraphs + a reference read as headline(10%) / photo(62%) / body(16%). All six paragraphs are merged into the single body slot, the band is 16% of the page, and the user gets `422 The page that layout produces fails layout QA — overflow: text 8e9765c7-1167-4bb4-99e2-aea85d8ce214 overflows its box`, with no page produced and no hint of what to do. The same input reports `leftOver {text:0, images:0}` from reflowContent, i.e. 'nothing had nowhere to go'.

**Claim:** Lines 242-251 append every unplaced paragraph to the largest body slot and then do `spare.length = 0`, so `leftOver.text` — the counter the whole 'nothing is lost in silence' contract rests on (line 253, surfaced by store.ts:756-759) — always reports 0 for text however much copy was merged into one box. That is a report the client cannot check. It also feeds the one hard gate in the path. When the reference's bands are fr-weighted (the ordinary, non-empty-end case) the body band keeps the refer…

### MEDIUM — `missing` cannot count depth-cap losses, so a page that gave up regions still reports 'matched'

`apps/server/src/lib/magazineV2/layoutFidelity.ts:41`

**Fails when:** A dense reference needing one level more nesting than the budget: 7 regions (a nested top-left cluster, a left column, a right column). readingToSpec places 6 and silently drops the `kicker`; fidelity reports `score 0.875, verdict 'matched', missing 0`, and the studio toasts 'Matched your reference closely (87%)' for a page that is missing one of the boxes the client pointed at — the feature's stated must-never-happen failure mode surviving the very check added to prevent it.

**Claim:** `Fidelity.missing` is documented as 'Read regions that never reached the page (no content for them, or dropped by the depth cap)' and is computed as origin keys with no solved leaf (line 115). It can never include depth-cap losses: a region discarded by `biggest()` or the backing-only branch never gets a contentRef at all (leafFor is only called on the survivor), and readingToSpec.ts:435-436 additionally deletes any origin key not present in the tree. So `missing` only ever reports a slot the r…

### LOW — The "what we understood" list prints raw DSL tokens (entry, figure, md margin, photo ground)

`apps/web/src/editor-v2/LayoutReference.tsx:180`

**Fails when:** A reference whose sidebar of stats is read as three `figure` regions and whose bulleted box is read as `entry` displays as "1 figure 22×30% · 2 entry 30×5% · md margin". The user, asked to confirm we understood their layout, cannot tell whether "figure" is the photograph (it is not — a photograph is `image`), approves it, and gets a page where the picture box they expected was never read at all.

**Claim:** The panel's header calls the reading list the moment "the user can tell whether we understood their reference before the page is rearranged", but it renders the internal vocabulary verbatim: `{r.role}` (line 180) prints `LEAF_ROLES` values, and lines 191-193 print `{shot.reading.margin} margin · {shot.reading.background} ground` from `SPACE_TOKENS` and `BACKGROUNDS`. So the honesty surface reads "entry 30×5%", "figure 40×12%", "md margin · photo ground". `entry` means a list item and `figure` m…

### LOW — describeReading() builds ungrammatical role plurals into the summary the user approves

`apps/server/src/lib/magazineV2/agent.ts:196`

**Fails when:** A reading of two body columns, one photo and a headline produces the tray row: "Rebuild this page in that layout — a headline, 2 bodys, a image". Shown verbatim in AiPanel's proposal list next to the layout icon.

**Claim:** `parts` is built as `n > 1 ? `${n} ${role}s` : `a ${role}`` over the raw `LEAF_ROLES` vocabulary (`'image', 'icon', 'shape', 'qr', 'headline', 'subhead', 'kicker', 'byline', 'body', 'caption', 'pullquote', 'figure', 'label', 'entry'`). `body` pluralises to "bodys", `entry` to "entrys", and the singular article is always "a", giving "a image", "a icon", "a entry". This string is the `summary` of the `apply-layout` proposal (line 366), so it is the only description of the rebuild the user sees in…

### LOW — pruneSpec.test.ts never passes keepWhitespace, so the cover-bug opt-out has no unit coverage

`apps/server/tests/magazineV2/pruneSpec.test.ts:111`

**Fails when:** A refactor that moves the FR-GUARANTEE (into a shared helper, say, or that drops the flag while re-threading `pruneNode`'s arguments) leaves pruneSpec.test.ts fully green — its 9 tests all exercise the default path — and the only failure surfaces in a different file as an element-height assertion about a magazine cover, with nothing naming the option that broke.

**Claim:** pruneSpec.ts gained `opts.keepWhitespace` in this working-tree change (it is the FR-GUARANTEE opt-out, threaded through `pruneLayoutSpec` → `pruneNode` → `pruneContainer`), but pruneSpec.test.ts is untouched: every call site in the file omits the third argument. So the file tests only the promote-a-track branch, and the negative branch — a start-packed container whose survivors are all content-sized must be LEFT ALONE when the flag is set — is asserted nowhere. The only guard is the end-to-end …


---

# Refuted (9)

Filed and knocked down. Recorded so nobody re-files them.

- **applyLayout.ts:235** — Pass 2's `slot.role === 'shape'` guard is unreachable and implies shape slots are text-eligible
  <br>*Refuted:* I read applyLayout.ts, roleScale.ts, readingToSpec.ts, layoutSpec.ts, pruneSpec.ts and composeFromSolved.ts in full, then proved the behaviour empirically with a throwaway probe (now deleted). WHAT THE REVIEWER GOT RIGHT (verified, not just read): - `ROLE_SCALE` keys are exactly `headline,figure,pullquote,subhead,entry,kicker,label,byline,body,caption` and `TEXT_ROLES = new Set(Object.keys(ROLE_SCALE))` (roleScale.ts…
- **layoutReading.ts:49** — Two doc claims describe behaviour that does not exist (art-director hand-off; per-region confidence)
  <br>*Refuted:* The reviewer's factual greps are accurate, but neither claim is a defect, and the stated failure scenario cannot be constructed. (b) is the weaker half and is plainly refuted. The reviewer paraphrases the comment as promising a per-region confidence, but the comment's own parenthetical names the real mechanism: "dropping here (lowest confidence first, BY AREA) is at least explicit" (layoutReading.ts:71-72). "Lowest c…
- **readLayout.ts:65** — Prompt glosses 'deck' as a role; any off-vocabulary role silently becomes `body`
  <br>*Refuted:* The downstream MECHANISM is real, but the finding as filed — high severity, caused by the `deck` gloss on readLayout.ts:65 — does not hold. Three things break it. 1. THE FILED CAUSE DOES NOT PRODUCE THE FILED EFFECT. readLayout.ts:63, one line ABOVE the gloss, states the closed set verbatim: `role is one of: ${LEAF_ROLES.join(', ')}` → "image, icon, shape, qr, headline, subhead, kicker, byline, body, caption, pullquo…
- **readLayout.ts:115** — `hint` is raw user text spliced into the prompt that no in-app caller ever sends
  <br>*Refuted:* The finding has two halves. The factual half is correct; the half that gives it weight is wrong, and I disproved it by running the code. WHAT IS TRUE. `hint` really is unused end to end. `readLayout.ts:91` takes `hint?: string` and `:115` splices it as `The client says: ${hint.slice(0, 400)}`. Only three call sites exist: `agent.ts:364` `readLayoutImage(url)`, `routes/magazinesV2/index.ts:2753` `readLayoutImage(Strin…
- **readLayout.ts:77** — Region-count instruction is off by one and omits the minimum of 2, so simple pages are refused
  <br>*Refuted:* Both mechanisms the finding blames are wrong, and the behaviour it calls a defect is correct and protective. What survives is one misleading half-sentence. 1. The off-by-one at readLayout.ts:77 has no consequence. The cap is inclusive as claimed (probed: 14 in -> 14 out, 15 in -> 14 out trimmed by area), so "Keep the total under 14" does cost the model one nominal slot — but nothing wrong is output either way. A 13-r…
- **layoutFidelity.ts:108** — "compares like with like" for margins is false; the margin token alone swings the score 19 points
  <br>*Refuted:* Read layoutFidelity.ts, readingToSpec.ts, layoutReading.ts, solveLayout.ts, layoutSpec.ts (tokens/caps), applyLayout.ts, readLayout.ts (the vision prompt), the route, layoutFidelity.test.ts and the design doc, then reproduced the reviewer's numbers with a probe. Two of the finding's three claims are true as stated: the score does swing ~21 points on the margin token alone and does flip the verdict (xs 0.719 adapted -…
- **routes:index.ts:920** — POST /layout-reference gates on membership, not an editing role, contradicting its own comment
  <br>*Refuted:* The finding reads line 920 in isolation and misses the router-level gate 800 lines above it. Three of its load-bearing claims are false. 1. "byte-for-byte the same gate as the read-only GET /issues/:id" — the `if (!doc || !roleOnMagazine(...))` line is identical, but the EFFECTIVE gate is not. Every request into this router first passes `apps/server/src/routes/magazinesV2/index.ts:104-116`: `const isCreate = req.meth…
- **routes:index.ts:2776** — Owner can replace every element of a SUBMITTED page via apply-layout: no confirm, no email, no audit row
  <br>*Refuted:* Every literal claim in the finding is true about the code. What is refuted is that this is a defect of apply-layout, or that it deserves the delete-page safeguards. 1. IT IS NOT SPECIFIC TO THIS FEATURE — it is the same shared gate, and five sibling write paths behave identically. apply-layout, POST/PATCH/DELETE .../elements, POST .../agent and POST .../format all enter through the one `loadEditablePage` (index.ts:21…
- **routes:index.ts:2741** — A rejected `reading` falls through to the assetId branch: misleading 400, or an unrequested paid re-read
  <br>*Refuted:* The code at index.ts:2741-2759 does say what the reviewer quotes, but every input the finding needs is impossible from any real caller, and the stated failure scenario refutes itself. (a) The "unrequested paid re-read" requires a client that posts `reading` AND `assetId`. No client can. `apps/web/src/editor-v2/api.ts:454-458` types the call `body: { rev: number; reading: LayoutReading }` — there is no assetId field. …

Notably, **both access-control claims against the two endpoints were refuted**, as was
the claim that the optional vision-prompt hint splices raw user text into the prompt
(no in-app caller sends it).
