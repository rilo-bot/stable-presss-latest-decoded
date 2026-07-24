# Magazine Builder: v1 (template) vs v2 (layout-as-data) — Comprehensive Comparison

## 1. Executive summary

The two builders are separated by one architectural decision: **where layout lives**. v1 (`apps/web/src/editor/**`, `apps/server/src/routes/magazines.ts`) treats *layout as code* — a page picks one of ~48 hand-authored React components, and the user only fills named text/image/qr/icon **regions** inside a design that can never move. v2 (`apps/server/src/lib/magazineV2/**`, `apps/server/src/routes/magazinesV2.ts`, `apps/web/src/editor-v2/**`, `apps/worker/**`) treats *layout as data* — a page is a free-form list of absolutely-positioned `MagazineElement`s (x/y/w/h in the page's own px, `model.ts`), stored one document per page with a `rev` for compare-and-set concurrency. That single shift cascades into everything downstream: per-element CRUD instead of whole-page PATCH, optimistic concurrency instead of last-write-wins, a real coordinate system, server-side AI that can author geometry, and a genuine PDF/DOCX/image import + from-scratch generation engine that v1 has no equivalent of.

**Bottom line:** v2 is a dramatically more capable and safer engine (import, extraction, generation, free-form editing, concurrency-safe persistence); **v1 still wins on finished design richness** (~48 bespoke pages, icon primitive, richer typography controls, edition field, staged/coverage-reported document fill, and a correct A4 print/PDF sheet).

## 2. The core difference

**v1 — fixed-region model.** A page is `{id, pageType, label, number, selectedForPublish, content}` (`magazines.ts:159-172`). `pageType` is a key into a code registry (`PAGE_COMPONENTS`); the matching React component (`pagesA-D.tsx`, `premium/*.page.tsx`) hard-codes geometry as Tailwind flex/grid/absolute JSX at a fixed 794×1123 A4 canvas (`parts.tsx`). The only editable surface is `content`: a flat `Record<regionId, RegionContent>` discriminated union (text/image/qr/icon, `types/magazine.ts:144-155`). Regions have **no x/y/w/h** — they cannot be moved, resized, added, or deleted. Writes are coarse and unguarded: a content edit PATCHes one page's entire content map; structural add/remove/reorder re-PUTs the whole ordered pages array; there is no version token, so it is last-write-wins (the H1/M13 clobbering class in `docs/REVIEW-FINDINGS.md`).

**v2 — free-form element model.** A page is a document `{magazineId, index, width, height, background, elements[], status, selectedForPublish, rev, schemaVersion}` (`collections.ts:6-14`), where each element carries geometry, type, rotation, zIndex, locked, `source` (extracted/manual/ai-agent) and `confidence` (`model.ts:80-96`). Every mutation is a **targeted op**: element add/patch/delete is an atomic compare-and-set on the page `rev` via `db.updateOneIf` (stale writer → 409 + fresh page); structural page ops are serialized per issue with an in-process lock + two-phase reorder against stable ids (`magazinesV2.ts`). All writes funnel through validate-sanitize-refit (`writePipeline.ts`) which clamps geometry and drops invalid elements.

**Why it changes everything:** because layout is data, (a) the user *and the AI* can move/resize/restack/add/delete elements; (b) writes address a single element by stable id, shrinking the conflict surface enough that real optimistic concurrency becomes possible; (c) a page gains a coordinate system, so a PDF can be extracted *into* it and a generated page composed *onto* it; (d) the editor, public viewer, and PDF can all render from one `IssuePageCanvas` with zero drift. None of these are reachable from v1's code-layout premise.

## 3. Master feature matrix

Legend: ✅ has it / strong · ⚠️ partial or with a caveat · ❌ none · — not applicable. **Winner** column: which builder is better for that row.

### Data model & persistence

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Layout representation | ❌ code templates, named regions | ✅ free-form elements[] (`model.ts`) | **v2** |
| Storage shape | ⚠️ one doc, embedded pages[] | ✅ per-page docs, 2 collections (`collections.ts`) | **v2** |
| Content-edit granularity | ⚠️ replace whole page content map | ✅ per-element CRUD (`magazinesV2.ts:1086`) | **v2** |
| Structural ops (add/remove/reorder) | ❌ re-PUT full array (H1 vector) | ✅ targeted, locked, two-phase | **v2** |
| Optimistic-concurrency token (rev CAS) | ❌ last-write-wins | ✅ mandatory rev, `updateOneIf` 409 | **v2** |
| Structural-op serialization | ❌ none | ✅ `withIssueLock` (single-process) | **v2** |
| Element/page identity | ⚠️ region ids per page-type, array order | ✅ stable UUIDs, reorder-safe | **v2** |
| Server-side geometry validation/clamp | ⚠️ text sanitize only | ✅ clamp+drop, MAX 400/page (`writePipeline.ts`) | **v2** |
| Publish snapshot authorship | ⚠️ client builds (can freeze stale) | ✅ server builds from stored pages | **v2** |
| Coordinate system / page dims | ❌ none | ✅ per-page w/h + background | **v2** |
| Schema version / builder tag | ❌ untagged | ✅ `schemaVersion:2`, `builder:'v2'` | **v2** |
| Soft-delete + cascade | ✅ soft-delete (shared db.ts) | ✅ same + cascade child pages/snapshot | **v2** |
| Element provenance / confidence | ❌ none | ✅ source + confidence 0–1 | **v2** |
| Content kinds | text/image/qr/**icon** | text/image/**shape**/qr | equivalent (icon vs shape) |
| Media asset persistence | ⚠️ bare inline URLs | ✅ `mediaAssetsV2` verified library | **v2** |
| Draft load / read model | ⚠️ whole doc up front | ✅ meta + lazy per-page payloads | **v2** |
| Template-region reconciliation | ✅ backfills new regions | — (no templates to drift) | v1-only (by necessity) |
| Undo/redo persistence path | ⚠️ re-PUT whole array (H1) | ✅ rev-guarded CRUD path | **v2** |
| Per-page publish selection | ✅ | ✅ | equivalent |

### Template / layout system

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Number of distinct layouts | ✅ ~48 bespoke designs | ⚠️ 8 kinds + 1 SAFE (`templates.ts`) | **v1** |
| Where geometry lives | ❌ baked in JSX | ✅ fractional slots, `composePage()` | **v2** |
| Coordinate model | ⚠️ implicit CSS flow | ✅ explicit px, fraction→px | **v2** |
| User can reposition | ❌ | ✅ per-element | **v2** |
| Content-aware font fitting | ❌ fixed sizes overflow | ✅ `fitFontSize` (`layout.ts`) | **v2** |
| Auto contrast/color correction | ❌ hand-tuned | ✅ `readableColor`/`contrastRatio` | **v2** |
| Layout QA / self-validation | ❌ | ✅ `validatePageLayout` | **v2** |
| Malformed-page fallback | — | ✅ `SAFE_TEMPLATE` | **v2** |
| Theme-agnostic templates | ❌ palettes hardcoded | ✅ colorRef/fontRef/fillRef | **v2** |
| Add a layout | ❌ React+registry+data | ✅ one plain-data object | **v2** |
| Decorative shape primitives | ⚠️ baked JSX divs | ✅ first-class shape slot | **v2** |
| Resolution independence | ❌ tuned to 794×1123 | ✅ fractional → any page size | **v2** |
| Design richness per page | ✅ dense infographics/grids | ⚠️ clean generic editorial | **v1** |
| Icon primitive | ✅ Lucide/upload | ❌ | **v1** |
| Live preview gallery at pick time | ✅ real components (`TemplateGallery`) | ❌ | **v1** |
| Positional page-number system | ✅ `renumberPages` | ❌ no page-number slot | **v1** |
| Seeded real default content | ✅ full NZTROF copy | ❌ empty shells | **v1** |
| Human-curated starter magazines | ✅ `MAGAZINE_TEMPLATES` | ⚠️ AI-planned per issue | v1-only (different model) |

### Rendering / canvas

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Positioning source | ❌ template code | ✅ absolute x/y/w/h | **v2** |
| Free drag / move | ❌ | ✅ delta×ratio, clamp | **v2** |
| Free resize (8 handles) | ❌ | ✅ | **v2** |
| Rotation | ❌ | ⚠️ renders+persists, no rotate handle | **v2** (partial) |
| z-index control | ❌ DOM order | ✅ per-element zIndex | **v2** |
| Keyboard nudge/Delete/Escape | ❌ | ✅ | **v2** |
| Canvas scaling method | ⚠️ JS transform:scale | ✅ CSS container queries (cqw) | **v2** |
| Variable per-page dimensions | ❌ locked A4 | ✅ imported PDFs keep dims | **v2** |
| Editor↔publish fidelity | ✅ same component | ✅ same `IssuePageCanvas` (+PDF) | equivalent |
| Selection affordance | ⚠️ sky ring | ✅ purple ring + handles | **v2** |
| Inline contentEditable on canvas | ✅ type in place | ❌ edit in inspector | **v1** |
| Click-image-to-upload on canvas | ✅ | ❌ off-canvas | **v1** |
| Shape (fill rect) element | ❌ | ✅ | **v2** |
| Per-page background (image/color) | ❌ | ✅ | **v2** |
| Vertical text alignment | ❌ | ✅ | **v2** |
| Extracted-vs-generated wrap policy | ❌ | ✅ preserves PDF line breaks | **v2** |
| Image fit + focal point | ✅ | ✅ | equivalent |
| QR rendering | ⚠️ split components, no link | ✅ shared `QrBlock`, quiet zone, link | **v2** |
| Multi-page interactive editing | ✅ all pages inline | ⚠️ one active page at a time | **v1** (tradeoff) |
| Public viewer scaling | ⚠️ transform:scale + ResizeObserver | ✅ fluid container queries | **v2** |
| Print/PDF page box | ✅ 794×1123 fits A4 pages | ❌ v2's 1275×1650 letterboxed | **v1** (regression) |

### Editor UX

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Entry flow | ⚠️ template gallery only | ✅ AI-gen / import / blank (`MagazineV2Home`) | **v2** |
| Add elements | ❌ | ✅ text/image/shape/qr | **v2** |
| Delete elements | ✅ undoable region delete | ⚠️ not on undo stack | v1 (undoable) |
| Move/position | ❌ | ✅ drag/handles/nudge/numeric | **v2** |
| Text inspector richness | ✅ justify/italic/underline/tracking/case | ⚠️ subset + content textarea + vAlign | **v1** |
| Image inspector | ✅ focal + device upload | ⚠️ URL + fit + media library | equivalent (tradeoff) |
| QR inspector | ⚠️ live preview, no fg/bg | ⚠️ fg/bg edit, no preview | equivalent (tradeoff) |
| Icon inspector | ✅ upload/library/tint | ❌ | **v1** |
| Shape inspector | ❌ | ✅ fill | **v2** |
| Numeric X/Y/W/H | ❌ | ✅ | **v2** |
| Save model | ⚠️ debounced flush, no CAS | ✅ optimistic rev-guarded, 409 reconcile | **v2** |
| Undo/redo keyboard (Ctrl+Z) | ✅ | ❌ toolbar-only (broken toast hint) | **v1** (regression) |
| Undo scope | ✅ broad incl region delete | ⚠️ element move/resize/style only | **v1** |
| Page add | ⚠️ insert typed template | ✅ blank + AI-generate N | equivalent |
| Page duplicate | ❌ | ✅ | **v2** |
| Page reorder/delete | ✅ | ✅ | equivalent |
| Resizable persisted panes | ❌ fixed | ✅ localStorage | **v2** |
| Assets/media library | ❌ | ✅ | **v2** |
| Cover picker | ❌ | ✅ pages/library/upload/URL | **v2** |
| Reset magazine | ❌ | ✅ | **v2** |
| Per-page Fill/Adjust AI | ❌ | ✅ | **v2** |
| Attachment preview pane | ❌ | ✅ | **v2** |
| Include-in-publish bulk All/None | ✅ | ⚠️ per-page only | **v1** |
| Title + edition editing | ✅ both | ⚠️ title only | **v1** |
| Suggestion chips | ✅ 3 floating | ❌ | **v1** |

### AI agent

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Where tools execute | ⚠️ client-side draft | ✅ server, validated, rev-guarded | **v2** |
| Concurrency safety on apply | ❌ | ✅ 409 reconcile | **v2** |
| AI moves/resizes/restacks (geometry) | ❌ | ✅ `move_element` | **v2** |
| Geometry safety | — | ✅ `normalizeElements` clamp | **v2** |
| Add brand-new elements | ❌ fills existing only | ✅ `add_element`/`add_stock_image` | **v2** |
| Delete elements | ⚠️ clears region, slot stays | ✅ removes element | **v2** |
| Text→photo swap | ❌ | ✅ `change_text_to_image` | **v2** |
| Image URL from real source only | ⚠️ non-upload src passes through | ✅ strict media/on-page check | **v2** |
| QR link validation | ✅ https/mailto | ✅ +http/tel | equivalent |
| Icon placement | ✅ Lucide-validated | ❌ | **v1** |
| Text styling breadth | ✅ italic/underline/tracking/case | ⚠️ subset (+shape fill) | **v1** |
| Recolour a shape | ❌ | ✅ | **v2** |
| Magazine-structure edits (add/remove/reorder/generate pages) | ❌ | ✅ | **v2** |
| Toggle page publish inclusion | ✅ `setPageSelected` tool | ❌ not an agent tool | **v1** |
| Whole-magazine bulk fill from doc | ✅ `/compose`, per-page staged | ❌ per-page only | **v1** |
| Doc/image ingestion depth | ✅ digest/OCR/vision, persist image | ⚠️ reuses v1 ingest, single attach, no placeable image | **v1** |
| Preview before apply (staging) | ✅ rich diffs, per-item + batch | ⚠️ summary tray, all-or-nothing | **v1** |
| Undo of AI changes | ⚠️ separate agent stack, no redo | ✅ unified editor undo/redo | **v2** |
| Fill/Adjust one-shot pass | ❌ | ✅ crowded-box detection | **v2** |
| CRM grounding (horses/articles) | ✅ | ❌ | **v1** |
| Streaming replies | ✅ token stream | ❌ non-streaming spinner | **v1** |
| Multi-tool composition per turn | ⚠️ 8 steps, browser round-trip | ✅ 16 steps, shared working copy | **v2** |
| Prompt-injection defence (inline) | ⚠️ in prompt file only | ✅ explicit data-not-instructions | **v2** |
| Rate limiting | ❌ | ✅ per-window | **v2** |
| Turn scope | ✅ whole magazine, any page | ⚠️ one page | **v1** (tradeoff) |
| Voice | ✅ | ✅ | equivalent |

### Import & generation

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| PDF import → editable pages | ❌ | ✅ MuPDF (`pdf.ts`,`processIssue.ts`) | **v2** |
| DOCX import (layout) | ⚠️ text only | ✅ LibreOffice→PDF→extract | **v2** |
| Image import as a page | ❌ | ✅ pixel-faithful | **v2** |
| Text extraction / OCR / digest | ✅ tables/facts/icons/fullText | ⚠️ sourceText into prompts only | **v1** |
| Pixel-exact geometry from file | ❌ | ✅ @150dpi | **v2** |
| Font/size/weight/color extraction | ❌ | ✅ mapped to web stacks | **v2** |
| Word-spacing/line reconstruction | ❌ | ✅ | **v2** |
| Embedded image + alpha/SMask | ❌ | ✅ composite, dedup, store | **v2** |
| Rule/divider → shapes | ❌ | ✅ | **v2** |
| Vector QR detect → live qr | ❌ | ✅ | **v2** |
| Glyph-erase of raster bg | ❌ | ✅ | **v2** |
| Vision role tagging | ❌ | ✅ labels only | **v2** |
| Whole-issue AI generation from brief | ❌ | ✅ plan→draft→compose | **v2** |
| AI palette + font pairing | ❌ | ✅ | **v2** |
| AI page-plan (ordered kinds) | ❌ | ✅ | **v2** |
| Per-page copy generation | ⚠️ maps facts to slots | ✅ authors copy into created structure | **v2** |
| Generate issue from source doc | ✅ fill regions | ✅ design whole issue | equivalent (idea) |
| Image sourcing for gen pages | ❌ | ✅ AI-image→Pexels→tinted block | **v2** |
| Layout QA + SAFE fallback | — | ✅ | **v2** |
| Add N on-theme pages | ❌ | ✅ `generateMorePages` | **v2** |
| Async worker / job queue | ❌ synchronous | ✅ Mongo poll-queue | **v2** |
| Progress reporting | ❌ | ✅ per-page stage | **v2** |
| Per-page failure isolation + retry | ⚠️ group skip, no retry | ✅ single-page re-extract | **v2** |
| Page-count cap / truncation notice | ❌ | ✅ | **v2** |
| Staged human review of the plan | ✅ per-page Apply/Discard | ❌ writes directly | **v1** |
| Coverage / unplaced-facts report | ✅ | ❌ | **v1** |
| Fill an EXISTING hand-built layout | ✅ core purpose | ❌ | **v1** |
| Respect per-page edit permissions in fill | ✅ | — (creates fresh issue) | **v1** |

### Collaboration / RBAC / ops

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Staff-only write gate | ✅ (shared `isStaff`) | ✅ (shared `isStaff`) | equivalent |
| Owner/collaborator model | ✅ inline | ✅ extracted `access.ts` (reimpl) | equivalent |
| Page-scoped edit rights | ✅ | ✅ | equivalent |
| Add/remove collaborator (owner-only) | ✅ | ✅ | equivalent |
| Staff directory picker | ✅ owns endpoint | ✅ reuses v1 endpoint | equivalent (shared) |
| Feature-flag kill switch | ❌ | ✅ `MAGAZINE_V2_ENABLED`→404 | **v2** |
| Write rate limiting | ❌ | ✅ 300/60s | **v2** |
| AI-generation rate limiting | ❌ | ✅ 10/60s | **v2** |
| AI-agent rate limiting | ❌ | ✅ 20/60s | **v2** |
| Optimistic concurrency on edits | ❌ LWW | ✅ rev CAS | **v2** |
| Structural-op serialization | ❌ | ✅ `withIssueLock` | **v2** |
| Background worker + retry + orphan recovery | ❌ | ✅ | **v2** |
| AI graceful degradation (503) | — | ✅ | **v2** |
| AI agent server RBAC | ❌ client-side | ✅ page-edit-gated | **v2** |
| Busy-state guard during jobs | ❌ | ✅ | **v2** |
| List-level least privilege | ✅ own/collab only | ⚠️ every magazine to any staff | **v1** |

### Publish / viewer / PDF

| Feature | v1 | v2 | Winner |
|---|---|---|---|
| Snapshot freeze (by-value) | ✅ client-cloned pages | ✅ server-built from stored | equivalent |
| `builder` discriminator | ❌ untagged | ✅ `builder:'v2'` | v2-only (mechanism) |
| Viewer render branch | ✅ template components | ✅ `IssuePageCanvas` | equivalent |
| Page geometry fidelity | ⚠️ depends on template lib | ✅ same renderer edit/view/PDF | **v2** |
| Full vs selected scope | ✅ client-filtered | ✅ server-persisted flags | equivalent |
| Select-all/none in dialog | ✅ | ✅ | equivalent |
| Cover derivation | ⚠️ explicit only | ✅ auto-fallback from page 0 | **v2** |
| Edition field | ✅ captured+shown | ❌ hardcoded `''` | **v1** |
| Republish / version bump | ✅ (can push fresh set) | ✅ (re-freeze live draft) | equivalent |
| Multiple editions per source | ✅ new issue each publish | ⚠️ one stable snapshot/URL | tradeoff |
| Unpublish / re-show | ✅ | ✅ + draft status sync | equivalent |
| Public gating (staff preview) | ✅ shared | ✅ shared | equivalent |
| Delete published snapshot | ✅ | ✅ + cascade from draft | **v2** |
| PDF export route + cache | ✅ shared | ✅ shared | equivalent |
| PDF/print sheet dimensions | ✅ 794×1123 fits pages | ❌ 1275×1650 letterboxed | **v1** (regression) |
| Print-ready marker | ✅ shared | ✅ shared | equivalent |
| Render-time sanitization | ✅ | ✅ | equivalent |

## 4. What v2 can do that v1 fundamentally cannot

These are capability leaps that v1's code-layout premise structurally forecloses:

- **True document ingestion.** A whole PDF/DOCX/image is digitized into editable, absolutely-positioned elements with pixel-exact geometry (`pdf.ts` @150dpi), real fonts/sizes/colors mapped to web stacks, extracted photos with alpha/SMask compositing (`image.ts`), rule dividers as shapes, vector-detected QR codes, glyph-erased backgrounds, and vision role-tagging (`processPage.ts`). DOCX flows through the same extractor via LibreOffice (`docx.ts`); a bare JPEG/PNG becomes one pixel-faithful page. **v1 keeps only text and discards all layout.**
- **From-scratch multi-agent generation of a complete issue** (`generate.ts`): `planIssue` emits title/subtitle/palette/font-pairing/ordered page kinds; per-page `draftPage` writes char-budgeted role-aware copy; a deterministic asset curator sources imagery (AI image → Pexels → tinted block, stored as MediaAssets); templates compose with layout-QA and a `SAFE_TEMPLATE` fallback. Plus `generateMorePages` to extend an existing issue on-theme. **v1 cannot create pages, layout, themes, or images.**
- **Free-form direct manipulation** — drag, 8-handle resize, keyboard nudge, numeric X/Y/W/H, z-index, per-page background, shapes, vertical align (`EditorCanvas.tsx`, `Inspector.tsx`). **v1 regions have no geometry and can never move.**
- **Per-element atomic concurrency.** Mandatory page `rev` + `updateOneIf` compare-and-set (`magazinesV2.ts:1059-1178`) structurally eliminates the lost-update class v1 suffers (`REVIEW-FINDINGS.md` H1/M13). Structural ops are serialized under `withIssueLock`.
- **AI that authors geometry and structure** server-side (`agent.ts`): `move_element`, `add_element`, `add_stock_image`, `change_text_to_image`, `delete_element`, plus `add_page`/`add_content_pages`/`remove_page`/`reorder_pages` — every write validated and applied through the same rev-guarded CRUD as a manual edit.
- **Production ops hardening v1 lacks entirely:** feature-flag kill switch, layered rate limiting (write/generate/agent), a MongoDB poll-queue worker with atomic claim, capped retries, orphaned-job recovery, live progress, per-page failure isolation, and AI 503 degradation.
- **Media asset library, cover picker, resizable persisted panes, attachment preview, page duplicate, reset-to-blank.**

## 5. What v1 still does that v2 does NOT yet

Honest parity gaps and outright regressions:

**Design & content richness**
- **~48 finished bespoke designs** (board grids, ownership pyramids, stat quadrants, tree diagrams) vs v2's 8 generic kinds. v2 cannot reproduce v1's dense infographic pages.
- **Icon primitive** — a first-class editable Lucide/uploaded-SVG region with tint (`EditableIcon.tsx`, `IconInspector.tsx`); v2 has no icon element or agent tool anywhere.
- **Seeded real content** — every v1 blueprint ships full NZTROF copy as `defaultContent`, so the doc is finished on load; v2 templates are empty shells.
- **Live layout-accurate preview gallery** at pick time (`TemplateGallery` renders the real components); v2 has no template preview surface.
- **Positional page-number system** (`renumberPages`); v2 templates carry no page-number slot.

**Editor**
- **Ctrl+Z / Ctrl+Y keyboard undo** — v2 undo is toolbar-only, and the Fill/Adjust toast tells users to press Ctrl+Z when no such handler exists (broken instruction / regression).
- **Richer typography** — justify, italic, underline, letter-spacing, text-transform/case, and a categorized multi-font menu; v2 offers a subset and only 7 font stacks.
- **Image focal-point (X/Y) sliders** and **one-click device upload inside the image inspector**.
- **Inline contentEditable text editing on the canvas** and **click-image-to-upload on canvas** (v2 edits text in the inspector and uploads off-canvas).
- **Live QR preview** in the inspector; **bulk Select All / None** publish toggles; **separate edition field**; **always-on suggestion chips**; **simultaneous interactive editing of all pages** (v2 activates one page at a time); **undoable region delete** (v2 add/delete are off the undo stack).

**AI**
- **Whole-magazine bulk document fill** (`/compose`) with **staged per-page Apply/Discard diffs** and **coverage reporting** (`coverageNote`, `unplacedFacts`, `groupsOk/Failed`); v2 fills page-by-page, writes directly, and reports no coverage.
- **CRM grounding** (`searchHorses`/`searchArticles`/`getHorseDossier`) so copy cites real records; v2 has none.
- **Streaming replies** and **rich before→after staged diff cards with per-item controls** (v2 is non-streaming, summary tray, all-or-nothing).
- **Persisting an uploaded image for AI placement** (`upload:<id>`); **AI toggling page publish inclusion**; **cross-page reasoning in one turn**.

**Publish / print**
- **Edition string** captured and displayed (v2 always writes `''`).
- **Multiple published editions per source magazine** (v1 accumulates `publishedIssueIds`); v2 keeps exactly one snapshot.
- **Correct PDF/print sheet.** This is a real regression: `pdf.ts` hardcodes 794×1123 A4 sheets and `BulletinViewer`'s print CSS forces the same box; v2's 1275×1650 US-Letter-aspect pages resolve to ~794×1027 and are **letterboxed with a white band** because nothing reads the v2 page's own width/height for the print sheet.

**RBAC**
- **List-level least privilege** — v1's list returns only magazines you own/collaborate on (`magazines.ts:112-119`); v2 exposes every magazine's metadata to any staff member as a "shared admin library" (`magazinesV2.ts:186-208`). Editing is still gated, but list visibility is broader.

## 6. Shared / reused infrastructure

Genuinely shared code (imported, not reimplemented):

- **The entire public publish path.** `apps/server/src/routes/issues.ts` (list/get/`GET /:id/pdf`/DELETE, unpublished-gating, `canManageIssue`) serves both builders; v2 only adds its own publish/unpublish endpoints. The `issues` collection is the shared freeze target (v2 tags `builder:'v2'` and nulls `magazineId`; v1 untagged). `apps/server/src/lib/pdf.ts` (Puppeteer + shared browser singleton + content-addressed LRU cache) is used identically.
- **`apps/web/src/pages/BulletinViewer.tsx`** — one shell (header, Download button, staff-token forwarding, `data-bulletin-ready` fonts+images marker, `@media print` CSS, scope label); only the per-page render call branches on `issue.builder`. `issueStore.ts` (`fetchIssue`) feeds both.
- **The v2 renderer is one component with three consumers** — `editor-v2/IssuePageCanvas.tsx` is the editor's base layer, the public viewer's `ReadonlyV2Page`, and the PDF page. `geometry.ts` (`pctRect`/`fontSizeCqw`/`clampRect`) is shared by the read-only renderer and the interaction overlay.
- **Inspector control primitives** — v2's `Inspector.tsx` imports `Section`/`Stepper`/`Segmented`/`ColorControl` directly from v1's `@/editor/inspector/controls` (real reuse). Both editors share the same dark full-screen shell and publish-success toast pattern.
- **Sanitization** — `sanitizeRichText` (`@/editor/lib/sanitize`) is reused across v1 read-only views, v1 `EditableText`, and v2 `TextElement`; both re-sanitize on render.
- **AI plumbing** — both call `getAgentModel()`/`isAgentConfigured()` from `apps/server/src/lib/agent/provider`, both use the Vercel AI SDK, both use the `useVoiceChat` hook. v2's `AiPanel` imports v1's document-ingest module (`ingestFile`, `attachmentSourceText`, `ATTACH_ACCEPT` from `editor/agent/documentUpload`).
- **RBAC primitives** — `isStaff()` from `lib/rbac.ts`, `withIdentityDefaults`/`STAFF_ROLES` from `lib/identity.ts`, and the shared `issuesGate`. The v2 `ShareDialog` calls v1's `/api/magazines/staff-directory` directly.
- **Stock imagery source** — both draw from Pexels (v1 a hardcoded `STOCK` constant, v2 a runtime curator `stock.ts`); same source, no shared code. The shared `db.ts` gives both soft-delete + `deletedAt:null` filtering (only v2 uses its `updateOneIf`).

**Reimplemented, not shared:** the owner/collaborator model (`access.ts` duplicates v1's inline `roleOnMagazine`/`editablePageIds`/`canEditPage`), `magRoleForStaff` (copy-pasted), the add/remove-collaborator handlers, `ShareDialog.tsx` (near-verbatim port), and the entire template-layout systems (separate coordinate spaces 794×1123 vs 1275×1650, separate slot/region models, separate compose paths). v2's font-fitting/contrast helpers are ported from campaign-hq, not from v1.

## 7. Maturity & recommendation

**Production-ready today: v1.** It is the battle-tested, feature-complete builder for the specific NZTROF bulletin — pixel-perfect bespoke pages, correct A4 print/PDF, keyboard undo, edition field, staged document fill with coverage reporting. Its known liabilities are real but bounded: last-write-wins clobbering (H1/M13) and no rate limiting (H5), both documented in `docs/REVIEW-FINDINGS.md`.

**Architecturally superior but not yet a full replacement: v2.** It is a strict superset on *engine* concerns (persistence safety, concurrency, ops hardening, import, generation, free-form editing) and, per `access.ts`/`magazinesV2.ts`, closes v1's H1/M13/H5 findings on its own surface. But it has genuine gaps and at least two regressions that block a clean cutover.

**What v2 must finish to fully replace v1:**
1. **Fix the PDF/print sheet** — make `pdf.ts` and the `BulletinViewer` print CSS read each v2 page's own `width/height` instead of hardcoded 794×1123, or the printed output stays letterboxed. This is the most user-visible defect.
2. **Wire Ctrl+Z / Ctrl+Y** in the v2 editor (the UI already tells users it exists).
3. **Add the icon element** (type + inspector + agent tool) — the only fully-missing content kind.
4. **Restore edition** as a real field through publish.
5. **Recover richer typography** (justify/italic/underline/letter-spacing/text-case) and **image focal-point** in the inspector.
6. **Add coverage reporting / staged review** for generation, and ideally a "fill an existing v2 layout from a document" path plus **CRM grounding** for the agent.
7. **Reconsider list-level visibility** if least-privilege matters (v2 currently shows every magazine to any staff member).
8. Consider whether v2 needs to reproduce (or import) v1's dense bespoke designs, or whether "import the printed PDF and edit" is the intended replacement for that richness — that is a product decision, not a code gap.

**Migration note.** The two are cleanly separable and already coexist behind `MAGAZINE_V2_ENABLED` (`config.ts:11`), sharing only the downstream publish path, so they can run side-by-side indefinitely with no data-model collision — v2 issues carry `builder:'v2'` and `magazineId:null`/`magazineIdV2`, so `canManageIssue` and the viewer branch correctly. There is **no automated v1→v2 content migration** (different coordinate spaces, region-map vs element-array, no icon in v2); the practical migration path is to **publish v1 to PDF and re-import it into v2**, which digitizes the layout into editable elements — but that round-trips through the letterbox-affected sheet and drops icons, so the print fix and icon element are prerequisites for that path to be lossless.