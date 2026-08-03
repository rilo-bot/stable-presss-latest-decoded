# Instant — capture-to-draft module

**Status:** BUILT 2026-08-03 (P0–P3). Both endpoints and both save paths verified against the live provider and the real create endpoints — see §8. Not yet opened in a browser.
**Reference:** the "Finite Press / Instant" screens supplied by the user (capture step → review step).
**Sits in:** the production system, Content section, as a new module `instant`.

---

## 1. What it is

One screen that turns a phone-capture moment into a reviewed draft:

```
CAPTURE                              REVIEW                          SAVE
─────────────────────────────        ────────────────────────        ──────────────
mode: Story | Blog post              Title        [✨]               Story → POST /api/articles
main topic / headline (optional)     Body         [✨]                        status: draft
photos (camera or file)              ─ right rail ─                  Blog  → POST /api/blogs
voice note (recorded)                Category / Excerpt [✨]                  status: draft
                                     Tags         [✨]
[Generate draft]                     Cover image
                                     [Confirm & save draft]
                                     [Regenerate] [Back to capture]
```

The user's decisions (2026-08-03):

- **Both output targets**, chosen by the mode toggle — Story (an `articles` draft) or Blog post (a `blogs` draft).
- **Photos + voice note** in v1. No video (nothing in our stack reads video; storing it adds upload work and zero AI signal).

## 2. The constraint that shapes everything

**Articles have no body field.** `article.summary` *is* the whole body — [ArticleDetail.tsx:198](../apps/web/src/pages/ArticleDetail.tsx#L198) splits it into paragraphs, and [ArticleDetail.tsx:519](../apps/web/src/pages/ArticleDetail.tsx#L519) labels that same field "Article body". There is no separate excerpt on an article, and no rich text — it is plain paragraphs.

Blogs are the opposite: `blocks[]`, `excerpt`, `cover`, `media[]`, `subtitle`, `readingTime` — and [blocks.ts:11-14](../apps/server/src/lib/blog/blocks.ts#L11-L14) says in as many words that the block validator exists so an AI can emit blocks safely.

So the two modes are **not** the same form with a different save button:

| Field in the reference | Story mode | Blog mode |
|---|---|---|
| Title | `title` | `title` |
| Body (rich) | `summary` — plain paragraphs, no rich text | `blocks[]` — paragraph/heading/quote/image |
| Excerpt | **not shown** (no such field) | `excerpt` |
| Category | `category`, from the 9 keys in [news-index/constants.tsx:13](../apps/web/src/pages/news-index/constants.tsx#L13) | `category` (free string; blogs have no taxonomy) |
| Tags | `tags[]` | `tags[]` |
| Cover image | `imageUrl` | `cover` + `media[]` pool |
| Reading time | `readingTime` | derived by `readingTimeFor(blocks)` |

Story mode swaps the reference's Excerpt slot for **Category** (which blogs don't have). Blog mode keeps Excerpt. Both keep Tags and Cover. Nothing is faked into a field that doesn't exist.

## 3. What already exists — reuse, don't rebuild

| Need | Already in the repo |
|---|---|
| Vision analysis of an image | `ingestDocument()` image path, [documentIngest.ts:412-432](../apps/server/src/lib/agent/documentIngest.ts#L412-L432) — strict digest with a plain-description fallback for charts, plus timeout handling |
| Voice → text | `POST /api/agent/voice/transcribe` ([agentVoice.ts:24](../apps/server/src/routes/agentVoice.ts#L24)); browser client at `apps/web/src/agent/voice/voiceClient.ts` |
| Per-field ✨ rewrite | `POST /api/agent/compose` ([agentCompose.ts](../apps/server/src/routes/agentCompose.ts)); browser client at `apps/web/src/agent/compose/composeClient.ts` |
| Image storage | `POST /api/uploads/direct?kind=media` ([uploads.ts:61](../apps/server/src/routes/uploads.ts#L61)) — 15 MB images, 501 + data-URL fallback when S3 is unset |
| Client-side downscale before upload | `apps/web/src/lib/imageCompress.ts` |
| Rich-text surface for blog body | `InlineText.tsx` / `BlogEditorPane.tsx` in [blog-composer/](../apps/web/src/pages/blog-composer/) |
| Gated saves | `POST /api/articles` (articlesWriteGate + `enterPermission`), `POST /api/blogs` (blogsWriteGate + `normaliseBlocks`) |

**No new save endpoint.** Instant posts to the existing article/blog create routes. A bespoke save path would sidestep the workflow enforcement that [workflow.ts](../apps/server/src/lib/workflow.ts) was written to provide — the exact hole that let a contributor self-publish before.

## 4. Server design

New file `apps/server/src/routes/agentInstant.ts`, mounted in `index.ts` **before** the catch-all `/api/agent`:

```ts
app.use('/api/agent/instant', jsonAgent, agentInstantRouter)
```

### 4.1 `POST /api/agent/instant/vision?filename=`

Raw image bytes in, one image per call — the same shape as [agentEditor.ts:43](../apps/server/src/routes/agentEditor.ts#L43) `/ingest`. Returns `{ note: string }`: a faithful description of what is in the photo, plus every legible piece of text verbatim.

Why per-image raw bytes rather than one JSON call with S3 URLs: the browser already holds the bytes, it works identically whether or not S3 is configured, each body stays bounded, and it reuses `ingestDocument` untouched. The upload to `/api/uploads/direct` runs in parallel from the browser for the *stored* asset.

Caps: `image/*` only, 15 MB (matches `uploads.ts`), max 6 images per draft enforced client-side and re-checked on `/draft`.

### 4.2 `POST /api/agent/instant/draft`

```ts
{
  mode: 'story' | 'blog',
  topic?: string,          // ≤ 300 chars
  transcript?: string,     // ≤ 8000 chars, from the voice note
  imageNotes: string[],    // ≤ 6, ≤ 4000 chars each — the /vision output
  imageCount: number
}
```

One `generateObject` call per mode (new `lib/agent/instantPrompt.ts` + `lib/agent/instantDraft.ts`):

**Blog body — rich, as of 2026-08-03.** The blog draft's body is a FLAT array of typed items (`paragraph` / `heading` / `list` / `quote`) rather than the original `sections[{heading, paragraphs[]}]`. The old shape could only ever produce heading-then-prose — it had no way to emit a bulleted list at all, which is exactly what was missing. List points carry an optional two-to-four-word `lead` that renders bold, so the output matches the composer's own structure (verified: `<strong>` lead-ins survive `sanitizeBlogInline`).

Two schema details worth keeping: it is **one object shape with a `kind` discriminator and optional fields**, not a discriminated union — provider support for `anyOf`/`oneOf` is uneven and a union that fails server-side validation fails the entire call. And `cleanBody()` is what makes an item its actual kind: it drops fields that don't belong, demotes a one-point list to a paragraph, and strips a leading heading (a body that opens with one reads as a fragment).

**The prompt distinction that actually mattered.** The first version conflated *structuring* with *padding* and so produced flat prose for a transcript holding six discrete facts. The rule is now explicit: organising given facts into a heading and bullets adds nothing and helps the reader; inventing a fourth bullet is the forbidden thing. Structure freely, invent nothing — plus "never state the same fact twice", which removed a bullet that restated a paragraph.

**Story schema** — `{ title, body, category, tags, captions[], needsFacts }` where `category` is a **zod enum of the nine real category keys** (`race-reports`, `industry-news`, `morning-edition`, `form-guide`, `track-notes`, `bloodstock`, `trainer-profiles`, …) read from a shared constant, so the model cannot invent a taxonomy entry. `body` is 2–5 paragraphs separated by `\n\n`.

**Blog schema** — `{ title, subtitle?, excerpt, sections: [{ heading?, paragraphs: string[] }], tags, captions[], needsFacts }`.

The model does **not** emit `Block[]`. Blocks are assembled deterministically from `sections` (heading → heading block, paragraph → paragraph block, one image block after each section) and then pass through the existing `normaliseBlocks()` on save. Same "agent-brain + correct-renderer" split the magazine rebuild locked — the AI can't emit an invalid block shape because it never emits blocks.

**As built, the assembler lives in the browser** ([buildBlocks.ts](../apps/web/src/pages/instant/buildBlocks.ts)), not the server. The reason: the review step edits the plain-text sections, so blocks must be built from *what the user finally approved*, at save time — a server-side assembler would have needed a third endpoint called on save for no gain. The invariant that matters is untouched: the model returns `sections`, code turns them into blocks, and `normaliseBlocks` on `POST /api/blogs` remains the only trust boundary (exactly as the blog composer already works).

**A schema constraint worth knowing.** No array in either schema carries `.min()`/`.max()`. Anthropic's structured-output validator rejects `minItems` other than 0/1 *and* `maxItems` outright, and either one 400s the whole call — a stricter-looking schema simply doesn't run. Both failures were hit and fixed during the build. Counts now live in the field descriptions and are enforced in `instantDraft.ts` (`cleanTags`, `cleanSections`, `fitCaptions`) after the call, which is the only place a bound can actually hold.

**Anti-fabrication is the core requirement of this module.** It writes prose from a photograph, which is precisely where a model invents horse names, race names, placings, dates and sale prices. The prompt takes the same posture as `agentCompose`'s ("use ONLY the facts given; do NOT invent racing facts, names, dates, numbers, records, prices"), plus:

- Describe only what the photo notes, transcript and topic actually contain.
- Never name a horse, person, race, track or figure that isn't in the inputs.
- If there isn't enough to be specific, write honestly and generally, and set `needsFacts: true`.

`needsFacts` drives a "verify the facts before submitting" banner on the review step. Combined with the draft-only landing, a hallucination costs an editor a read, not a published error.

### 4.3 Auth and metering

`requireAuth` + a `canAccessNewsroom(req.account)` check — **not** `attachAccountOptional`. The AI-agents audit's top finding is guest-reachable unmetered model endpoints; this module is the most expensive per-call surface we'd have (up to 7 model calls per draft), so it does not repeat that. Add `lib/rateLimit.ts` to both endpoints.

Known and accepted for v1: there is still no token metering anywhere in the codebase, so cost is bounded only by the 6-image cap and the rate limit.

## 5. Web design

New directory `apps/web/src/pages/instant/`:

| File | Role |
|---|---|
| `InstantScreen.tsx` | Screen shell + the state machine: `capture → uploading → analysing → drafting → review → saving → saved` |
| `CaptureStep.tsx` | Mode toggle, topic input, photo picker, voice recorder, Generate draft |
| `PhotoTray.tsx` | Thumbnails, per-photo AI caption, remove, "make this the cover" |
| `VoiceNote.tsx` | `MediaRecorder` + `0:00` timer → `voiceClient` → transcript chip (re-record / clear) |
| `ReviewStep.tsx` | Title, Body, right rail (Category *or* Excerpt, Tags, Cover), the three actions |
| `instantStore.ts` | One capture session; zustand, same posture as `composerStore.ts` |

Details:

- **Take photo** is `<input type="file" accept="image/*" capture="environment">`; **Add photos** is the same input without `capture`. That is the whole difference — no camera API.
- Photos: compress via `imageCompress.ts`, then fire `/api/agent/instant/vision` and `/api/uploads/direct` in parallel. Vision failing on one photo of three must not sink the draft — keep the rest and say which one couldn't be read.
- **Generate draft** stays disabled until at least one of topic / photo / voice note is present (matches the reference's "Add a topic, a photo, or a voice note to continue").
- Body, story mode: a plain multi-paragraph textarea. The field is plain text — a rich toolbar there would be a lie. **Decided 2026-08-03: stories keep the plain body.** `article.summary` is one field serving as both body and card teaser across 17 files, so rich body is a blog-post feature only.
- Body, blog mode: a **read-only preview** rendered by the real `BlogRenderer` from the real blocks, built by the same `buildBlogPayload` that produces the save payload — so the preview cannot drift from what gets stored. Editing happens in the composer, which opens the instant the post is saved (`Save & open in composer` → `/production-system/blogs/:id`).

  Why not embed the composer's editor in the review step: `BodyToolbar` and `BlockCanvas` are both bound to `useComposerStore`, which owns exactly one SAVED post plus its autosave, dirty tracking and 409 conflict handling. Embedding them meant refactoring two shared components the composer itself depends on, to avoid a hand-off that takes one `navigate()`. Story mode still shows the saved panel, because a story's next step is the workflow, not an editor.
- Each ✨ chip calls the existing `composeClient` with the other fields as context — no new endpoint.
- **Mobile-first.** This is a phone flow; it must work at 360 px. Verify against the UI/UX review's mobile findings.

### 5.1 Registration (three frozen places + the route)

1. [newsroom/constants.tsx](../apps/web/src/pages/newsroom/constants.tsx#L88) `SIDE_NAV` — `{ id: 'instant', label: 'Instant', icon: <Zap size={15}/>, section: 'Content', slug: 'instant', badge: 'New' }`, placed after Blogs.
2. [permissionCatalogue.ts](../apps/server/src/lib/permissionCatalogue.ts#L210) `MODULE_CATALOGUE` — `{ id: 'instant', label: 'Instant Capture', section: 'Content' }`.
3. [App.tsx](../apps/web/src/App.tsx#L290) — `<Route path="instant" element={<InstantScreen />} />` under the `ProductionSystemLayout`.
4. A tile on `OverviewScreen` (Magazine Studio already reaches itself that way).

**Deliberately no `requiresPermission` on the module row.** The two modes need *different* permissions (`content.draft.create` vs `blog.create`) and a module row only carries one. Instead each mode button is gated individually, and if the user holds neither the screen renders an explicit empty state. A single gate would either hide the screen from a blog-only author or show them a Story mode whose save always 403s.

## 6. Phases

| Phase | Scope | Done when |
|---|---|---|
| **P0** Server | `agentInstant.ts` (`/vision`, `/draft`), `instantPrompt.ts`, `instantDraft.ts` (block assembly), shared category-key constant, auth + rate limit + caps, mount in `index.ts` | Both endpoints answer correctly for a real photo; typecheck clean |
| **P1** Capture | Module registration (all 4 places), route, screen shell + store, capture UI, photo upload + vision wiring, voice note, loading/error states | A photo + voice note produce a draft object in the console |
| **P2** Review | Both modes' review layouts, editable fields, ✨ per field, cover selection, tags editor, `needsFacts` banner | Every field is editable and every ✨ works |
| **P3** Save | Story → `POST /api/articles` (`status: 'draft'`, category, tags, `imageUrl`); Blog → `POST /api/blogs` (blocks, media pool, cover, excerpt). Success state links to the story on the Workflow Board / the post in Blogs, plus "Capture another" | A saved draft opens correctly in its existing editor |
| **P4** Polish | Regenerate, Start over, partial-vision-failure copy, slow-network guard, 360 px pass, no-permission empty state | Walked end-to-end on a phone viewport |

P0–P3 are built. P4's items are all present in code (Regenerate, Capture another, partial-failure toast + per-photo error, the no-permission state, responsive grid) but **nothing has been seen in a browser** — the remaining work is a real walkthrough on a phone viewport, which needs a person.

### 6.1 Files

**Server** — [newsCategories.ts](../apps/server/src/lib/newsCategories.ts) (closed category enum), [agent/instantPrompt.ts](../apps/server/src/lib/agent/instantPrompt.ts) (prompts + schemas), [agent/instantDraft.ts](../apps/server/src/lib/agent/instantDraft.ts) (the two calls + clamping), [routes/agentInstant.ts](../apps/server/src/routes/agentInstant.ts). Mounted in `index.ts` before the catch-all `/api/agent`; module row added to `MODULE_CATALOGUE`.

**Web** — [pages/instant/](../apps/web/src/pages/instant/): `InstantWorkspace` (shell + mode gating), `CaptureStep`, `VoiceNote`, `PhotoTray`, `ReviewStep`, `instantStore`, `instantClient`, `buildBlocks`, `categories`, `types`. Mounted by [InstantScreen.tsx](../apps/web/src/pages/production-system/screens/InstantScreen.tsx), registered in `SIDE_NAV`, routed in `App.tsx`, plus a shortcut on Overview.

**Migration** — [grant-instant-module.ts](../apps/server/scripts/grant-instant-module.ts). **APPLIED 2026-08-03** to the local test cluster (`stable-press-local`): all four roles — superadmin, contributor, editor, administrator — gained `modules: [… 'instant']`. Verified by re-running the dry run (0 changes) and by `GET /api/auth/me` on an `administrator` account reporting `instant` in `access.modules` with both `content.draft.create` and `blog.create` held.

It is **still required on every other environment.** `seedRoles()` is insert-only, so role rows written before Instant existed have no `instant` in `modules` — the rail filters on that array and the layout redirects away from a module the role lacks, so the screen is invisible to everyone but superadmin until this runs. Dry run first, then `--apply`. No API restart needed: the role cache TTL is 60s.

**This trap will recur for any future module.** Adding a row to `MODULE_CATALOGUE` grants it to nobody; a script like this one is part of shipping a module, not an afterthought.

## 8. Verified behaviour (2026-08-03)

Against the live provider (`anthropic/claude-sonnet-5`) and the real create endpoints, on the local test cluster:

- `POST /vision` — 401 unauthenticated; 200 with a real image, and it **refused to invent** silks, saddlecloth numbers or names, volunteering instead that the image was a logo rather than a photograph.
- `POST /draft` (story) — correct facts from the voice note, no invented placings, `category: morning-edition` chosen from the closed enum, tags and a caption derived from the photo note, `needsFacts: true`.
- `POST /draft` (blog) — title, standfirst, excerpt, two sections (one headed), tags, caption.
- Three fabrications the first blog run *did* produce were fixed by prompt rules and confirmed gone on re-run: "the Newmarket" → tag "newmarket handicap" (name expansion), a padded scene-setting clause, and a venue moved from the topic into a photo caption.
- `POST /api/articles` with the store's exact story payload — 201, `status: draft`, category and reading time stored.
- `POST /api/blogs` with `buildBlogPayload`'s exact output — 201, **4/4 blocks kept, 0 dropped** (so the assembled image block's pool reference survives `normaliseBlocks`), cover resolved, slug generated, excerpt and reading time set.
- Both test records were deleted afterwards.
- Role migration applied and verified (see §6.1).

**Rich blog body (2026-08-03).** From a flood capture (photo note + reporter voice note), the agent produced: two paragraphs → `H2 Council response` → a three-point bulleted list with bold lead-ins — the same structure as the composer's own output. Every fact traces to the transcript; `needsFacts: true`. Posting the assembled blocks to `POST /api/blogs` kept **3/3 blocks, 0 dropped**, and the `<strong>` lead-ins survived `sanitizeBlogInline` intact. Test post deleted.

Two prompt regressions were found and fixed in this pass, both by reading the output rather than assuming it: flat prose where the sources supported a list (the structure-vs-padding confusion above), and a bullet restating a fact already in a paragraph.

Both workspaces typecheck clean and **both production builds pass** (`npm run build -w apps/web`, `-w apps/server`).

Two pre-existing JSX syntax errors in the concurrent theme work were blocking the web build and were fixed in passing — a `{/* … */}` comment placed directly inside a `return (` / `&& (`, where JSX parses the brace as an object literal. `NewsroomDashboard.tsx` (also fixed in parallel by its author) and `ProductionSystemTopBar.tsx`. The comment text was preserved verbatim in both; only its position changed.

## 7. Open risks

1. **Fabrication.** Mitigated by the prompt, `needsFacts`, and draft-only landing — not eliminated. This module should never gain a "publish now" button.
2. **Cost.** Up to 7 model calls per draft with no token metering in the codebase. The 6-image cap and rate limit are the only ceilings.
3. **Vision quality on racing photos.** A photo of a horse cannot tell the model *which* horse. Expect `needsFacts: true` to be the common case for race photography, and write the review-step copy accordingly — "the AI described what it saw; you supply the facts."
4. **No video** in v1, by decision.
5. **Story mode has no excerpt**, so a Story draft's news-card teaser is the opening of the body. That matches how every existing article behaves; it is a data-model fact, not an Instant limitation.
