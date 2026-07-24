# v2 → v1 Capability Parity Plan

> **Goal:** make the **Magazine Builder v2** editor able to do everything the **v1** editor can, so
> **new** magazines can be built entirely in v2. v1 stays for existing/legacy magazines; published v1
> issues keep rendering via the `builder` tag.
> **Scope (decided 2026-07-24):** *capabilities only* — do **not** reproduce v1's ~48 bespoke template
> designs (v2's free-form canvas supersedes fixed templates). **No v1-draft migration, no v1 removal.**
> **End goal:** unblock v2 adoption for new work.
> Derived from the full audit in [MAGAZINE-V1-VS-V2.md](./MAGAZINE-V1-VS-V2.md). See also
> [MAGAZINE-BUILDER-V2.md](./MAGAZINE-BUILDER-V2.md), [TEMPLATE-BUILDER-V2-REVIEW.md](./TEMPLATE-BUILDER-V2-REVIEW.md).

## Already parity or beyond — do NOT rebuild

Free-form layout (drag/resize/z/add/delete any element) · per-element `rev` concurrency (fixes v1's
H1/M13) · PDF/DOCX/image import + MuPDF extraction · from-scratch multi-agent generation · media
library + Pexels + AI image-gen · collaboration/RBAC/page-scoped edit · shared publish→viewer→PDF path.
v2 is a strict superset on engine/ops. Parity work is only the **editor/agent capabilities** below.

## Complete gap inventory

`MUST` = required for capability parity · `OPT` = nicety, defer OK · `DESIGN` = intentional v2
divergence, close **only** if product wants it.

### A. Element model & typography
| id | Gap | v2 today | Tag |
|---|---|---|---|
| A1 | **Icon element** (Lucide glyph by name + tint, or uploaded SVG/PNG) | no `icon` kind (text/image/shape/qr) | MUST |
| A2 | `justify` align, `letterSpacing`, `textTransform`, weight `900` | 3-way align, no spacing/case, weights 400–800 | MUST |
| A3 | italic / underline block toggles | only inline `<b><i><u>` in content | MUST (cheap) |
| A4 | Full font library + categorized picker | ~7 hardcoded stacks (generation only), no editor picker | MUST |
| A5 | Image **focal-point** X/Y control | `focalPoint` is in the model but has **no inspector UI** | MUST (cheap) |

### B. Canvas & inspector interaction
| id | Gap | v2 today | Tag |
|---|---|---|---|
| B1 | **Inline text editing on the canvas** (contentEditable, debounced) | text edited off-canvas in the inspector textarea | MUST |
| B2 | **Click an image on canvas → upload** | canvas click only selects | MUST |
| B3 | One-click device upload inside the image inspector | must go via Assets tab / Cover picker | MUST (cheap) |
| B4 | Live **QR preview** in the inspector | url field only, no preview (though `QrBlock` exists) | OPT (cheap) |
| B5 | **Rotate handle** on canvas | rotation renders + persists but can't be set in UI | OPT |
| B6 | All visible pages interactive at once | one active page at a time | DESIGN |

### C. Undo & publish selection
| id | Gap | v2 today | Tag |
|---|---|---|---|
| C1 | **Ctrl+Z / Ctrl+Y keyboard undo** | toolbar buttons only — yet the Fill/Adjust toast tells users to press Ctrl+Z (**broken instruction / regression**) | MUST (cheap) |
| C2 | Undo covers **add / delete** (and ideally structural ops) | undo stack covers patches, not add/delete (review **L1**) | MUST |
| C3 | **Select All / None** publish toggles | per-page checkbox only | OPT (cheap) |

### D. AI agent
| id | Gap | v2 today | Tag |
|---|---|---|---|
| D1 | **CRM grounding** (`searchHorses`/`searchArticles`/`getHorseDossier`) so copy cites real records | no grounding tools at all | MUST |
| D2 | **Place an uploaded image** into a slot (`upload:<id>` → real asset) | attachment is vision-digest only, not placeable | MUST |
| D3 | Agent can **toggle a page's publish inclusion** (`setPageSelected` tool) | store has it; agent can't call it | OPT (cheap) |
| D4 | **Whole-magazine / cross-page** reasoning in one turn | per-page only; chat resets on page change | OPT |
| D5 | **Streaming** replies | non-streaming (`generateText` → one `{reply,proposals}`) | OPT |
| D6 | **Per-proposal** Apply/Discard with before→after diff cards | Apply-all / Discard-all only | OPT |
| D7 | Richer `set_element_style` (letterSpacing/textTransform/italic/underline) | subset — rides on A2/A3 | MUST |

### E. Document fill & ingestion
| id | Gap | v2 today | Tag |
|---|---|---|---|
| E1 | **Fill an EXISTING v2 layout from a document** (pour a doc into pre-designed pages) | generation makes a *new* issue; agent `sourceText` fills only the *current* page | MUST |
| E2 | Structured **ingest/OCR/digest** (tables, facts, icon detection) | raw `sourceText` into the LLM, or MuPDF geometry | OPT |
| E3 | **Coverage / unplaced-facts** reporting after a fill | none | OPT |

### F. Settings, publish & output
| id | Gap | v2 today | Tag |
|---|---|---|---|
| F1 | **`edition`** field end-to-end (capture → freeze → viewer header) | hardcoded `edition:''` | MUST |
| F2 | Per-page **label / human number** | numeric index only | OPT |
| F3 | **PDF sheet = the page's own dims** (US-Letter 1275×1650, not A4 794×1123) | letterboxed white band on every v2 page (review **M8**) | MUST |
| F4 | **Multiple published editions** per magazine (v1 keeps a `publishedIssueIds[]`) | single `publishedIssueId`, republish overwrites | DESIGN |
| F5 | List-level least-privilege (v1 lists only your magazines) | every magazine visible to any staff ("shared admin library") | DESIGN |

## Guiding constraints (keep v2's architecture intact)

1. **One write path.** Every new field/kind flows through `validateElements → sanitizeElements →
   refitText` (`writePipeline.ts`). No side channels.
2. **Additive & backward-compatible.** New element fields are optional; existing stored pages must
   validate unchanged.
3. **Geometry stays deterministic** — new capabilities are element *data*, never AI-authored coords.
4. **Fidelity chain.** Every new field/kind renders identically in editor canvas, public viewer, and
   PDF — verify all three; they can't drift.
5. **Fold in the relevant review fixes as you go:** **H1** (URL SSRF) with icon/image URLs;
   **H3** (`<br>` fit) with typography; **M8** (PDF dims) is F3; **L1** (undo) is C2.
6. **Font-fit safety.** `letterSpacing`/uppercase change text width → must feed
   `fitFontSize`/`estimateLines` (`layout.ts`) or text overflows.

---

## Phases (each shippable behind `MAGAZINE_V2`)

### TIER 1 — core editor parity (do first; unblocks most of "build in v2")

**Phase 0 — Model + validators (foundation).** `lib/magazineV2/model.ts`: add `'icon'` to
`ELEMENT_TYPES` + `ElementIconData {name?,src?,color?}`; extend `coerceText` with `letterSpacing`
(clamp), `textTransform` (enum), `align:'justify'`, weight `900`; `coerceIcon()` (name vs a ported
`iconRegistry`, `src` via `safePublicImageUrl`, `color` hex). `layout.ts`: fold `letterSpacing`/uppercase
into `estimateLines`/`fitFontSize`. Land review **H1** in `url.ts`. Unit-test: old elements still
validate; new fields clamp; icon SSRF-blocked. *(covers A1 data, A2, A5 data)*

**Phase 1 — Typography + fonts.** Render `letterSpacing`/`textTransform`/`justify`/900 in `EditorCanvas`,
`IssuePageCanvas`, `BulletinViewer` (→ fixes PDF too). Port `editor/fonts/registry.ts` into a shared/v2
module; add a categorized font picker + the new controls (+ italic/underline toggles that wrap the
selection in `<i>`/`<u>`) to `editor-v2/Inspector.tsx`; ensure every family has `@font-face` in editor +
viewer + PDF. Extend agent `set_element_style` (D7). Land **H3**. *(A2, A3, A4, D7)*

**Phase 2 — Icon element.** Port `iconRegistry`; add `editor-v2/IconBlock.tsx` (Lucide-by-name w/ tint,
or `<img>`) to all three renderers; `IconInspector` (library grid + custom upload via the media routes +
tint); `+Add ▸ Icon`; agent `add_element type:'icon'` + `set_element_icon` (name-validated,
provenance-guarded `src`). *(A1)*

**Phase 3 — Canvas editing parity.** Inline contentEditable text directly on the canvas (debounced →
element PATCH via the existing rev-guarded path; plain-text paste) — reuse v1's `EditableText` approach;
click-an-image → upload (reuse `EditableImage`); one-click upload in the image inspector; focal-point X/Y
sliders (model already supports it); live QR preview. *(B1, B2, B3, B4, A5 UI)*

**Phase 4 — Undo & publish selection.** Wire Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (blur active element first);
put element add/delete (and ideally page-structure ops) on the single undo stack; fix the Fill/Adjust
toast; add Select All / None publish toggles. *(C1, C2 = review L1, C3)*

**Phase 8a — Edition + PDF fidelity.** Add `edition` to v2 issue meta → settings `PATCH` → publish
snapshot → viewer header (F1). Make `pdf.ts` + `BulletinViewer` print CSS read each page's own
`width/height` instead of hardcoded 794×1123 (F3 = review **M8**). *(F1, F3)*

### TIER 2 — agent & document parity

**Phase 5 — Insert-from-template gallery.** `POST /issues/:id/pages/from-template {templateId}`
(owner-only, `withIssueLock`, `MAX_PAGES`) → `composePage(template, [], theme)` → insert; client gallery
with live previews rendered from the data templates. *(G4/B in the audit)*

**Phase 6 — AI agent parity.** Reuse the public assistant's `searchHorses`/`searchArticles`/
`getHorseDossier` server-side with RBAC so the v2 agent can cite real records (D1); make uploaded
attachments become real `MediaAsset`s the agent can place via `list_media` (D2); add a `set_page_selected`
tool (D3); optional: cross-page turn scope (D4), streaming replies (D5), per-proposal Apply/Discard diff
cards (D6). *(D1–D6)*

**Phase 7 — Document fill into existing layout + reporting.** A "fill this magazine from a document"
action that maps a digest onto existing v2 pages' empty/eligible text (+ image) elements across pages,
staged for review, respecting `editablePageIds`; reuse `documentIngest` for a structured digest
(tables/facts/icons) (E2); return coverage / unplaced-facts (E3). *(E1, E2, E3)*

### TIER 3 — product decisions (not built unless requested)

- **F4** multiple editions per magazine vs v2's single-snapshot republish (ties to review **H4** — fix
  the duplicate-publish race regardless).
- **F5** shared admin library vs v1 least-privilege list.
- **B5** rotate handle · **B6** all-pages-interactive editing (large; likely won't-fix — v2 is
  one-page-at-a-time by design).

## Definition of done

Every `MUST` gap is reachable in the v2 editor; new fields/kinds render identically in editor + viewer +
PDF; the validate→sanitize→refit single write path is preserved; the editor tells the truth about undo;
new-magazine creation can default to v2. (v1 template *designs* and v1-draft *migration* remain out of
scope.)

## Suggested order

**Tier 1 first**, in the listed order (Phase 0 is the shared foundation; 1→4 + 8a are the visible parity
wins and each ships independently). **Tier 2** (5/6/7) is independent and can run in parallel once Phase 0
lands. **Tier 3** are decisions to raise, not build. Recommend pairing the review's High fixes into the
phases they touch (H1→P0, H3→P1, L1→P4, M8→P8a, H4→whenever F4 is decided).
