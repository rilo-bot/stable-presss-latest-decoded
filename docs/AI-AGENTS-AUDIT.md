# AI Agents Audit — Stable Press Portal

**Date:** 2026-08-03 · **Branch:** `enhancement` · **Method:** 3 parallel deep-exploration passes (server endpoints, client surfaces, background pipelines), synthesized.

---

## 1. Executive summary

The portal runs **7 conversational AI agents**, **5 one-shot AI features**, **4 background AI pipelines**, and **1 shared voice subsystem** — served by **16 model-invoking server endpoints** across **3 external AI services**:

| Service | Used for | Config |
|---|---|---|
| OpenRouter → `anthropic/claude-sonnet-4.6` | Every text/vision agent & pipeline | `AGENT_MODEL`, `OPENROUTER_API_KEY` (`lib/agent/provider.ts`) |
| OpenRouter `file-parser` plugin (`mistral-ocr`) | Scanned-PDF OCR | `getOcrModel()` (`provider.ts:43`) |
| OpenAI direct | Voice STT (`gpt-4o-mini-transcribe`) + TTS (`gpt-4o-mini-tts`) | `OPENAI_API_KEY`, `VOICE_*` (`lib/agent/voice.ts`) |

(Pexels supplies stock photos — external API, not a model.)

**No image is ever generated.** Photographs are FOUND — the user's own uploads first, then a
Pexels search — or the slot degrades to a tinted block. `magazineV2/imagegen.ts` (OpenRouter →
`google/gemini-2.5-flash-image`, config `MAGAZINE_V2_IMAGE_MODEL`) was removed on 2026-08-30:
it was gated on `OPENROUTER_API_KEY`, the same key every text agent needs, so it ran wherever
the builder worked at all and Pexels was effectively unreachable behind it.

**Overall verdict:** the architecture is genuinely good — one provider module, RBAC-safe tool design (reads mirror route visibility; writes go through the app's own gated REST or a proposal/apply step), consistent graceful degradation. The weaknesses are **operational**: most AI endpoints are unmetered and several are reachable without auth, there is no output-token cap or cost accounting anywhere, and observability is near zero.

---

## 2. The conversational agents (7)

### 2.1 "The Stablehand" — global concierge
- **Where:** floating widget on **every page** (`components/AgentWidget.tsx`, mounted `App.tsx:383`).
- **Backend:** `POST /api/agent/chat` (`routes/agent.ts`) — streaming, `stepCountIs(6)`, **rate-limited 20/min** (the only agent chat with a limit). Guests allowed by design.
- **Tools:** 13 server-executed read-only tools mirroring REST visibility rules; 3 confirm-gated ACTION tools (`registerHorse`, `createArticleDraft`, `updateMyParty`) that **proxy to the app's own REST endpoints with the caller's token** — the gold-standard write pattern; 1 client tool `navigateTo` (~20 destinations incl. Production System screens and studio-opening).
- **Entry points:** floating button, `AskAgentButton` on article/horse/party pages, Production System Overview wand quick-actions.

### 2.2 Story Studio — writes & files a draft
- **Where:** right drawer mounted in the Production System shell (`ProductionSystemLayout.tsx:210`); opened by File a Story → "With AI", empty-state CTAs, or the concierge's `navigateTo('story-studio')`.
- **Backend:** `POST /api/agent/story/chat` — streaming, 12 steps. ⚠️ `attachAccountOptional` only, **no staff gate, no rate limit** on the route.
- **Tools (client-executed):** `listHorses`, `createStoryDraft` → files directly via the RBAC-gated `POST /api/articles`, then navigates to the article. No undo (draft is a draft).

### 2.3 Article Studio — edits one article in place
- **Where:** ✨ "Studio" button on `/articles/:id` for users passing `canEditArticle` (`ArticleDetail.tsx:454`). Click-to-focus fields (`SelectableField`).
- **Backend:** `POST /api/agent/article/chat` — streaming, 10 steps. ⚠️ optional auth, no rate limit.
- **Tools (client-executed):** field/tags/image setters applied **directly** through `PUT /api/articles/:id` with one-step undo. ⚠️ Only chat surface with **no vision attachments** (📎 is a hero-photo uploader).

### 2.4 + 2.5 Profile Studio drawer & Onboarding mascot — same brain, two bodies
- **Where:** `/studio/:id` (party) and `/studio/horse/:id` (horse) render `ProfileAgentPanel` — or, until onboarding completes, the `OnboardingGuide` mascot — via `PartyProfile.tsx:642` / `HorseProfile.tsx:637`. Click-any-data-box focus (`StudioField`).
- **Backend:** shared `POST /api/agent/profile/chat` — streaming, 8 steps. ⚠️ optional auth, no rate limit.
- **Tools (client-executed):** `setField`/`setPhoto`/`setConnection` etc. — hybrid **direct-apply + staged-proposal tray** with a real undo stack (`applyProposals.ts`). Owner/staff gating on the routes themselves.
- Divergence: the drawer supports 📎 attachments; the mascot doesn't.

### 2.6 Magazine Studio Assistant (v1 editor)
- **Where:** docked pane in `/production-system/magazine/:id` (`editor/agent/EditorAgentPanel.tsx`), default open; floating suggestion chips on canvas.
- **Backend:** `POST /api/agent/editor/chat` (streaming, 8 steps) + `/ingest` + `/compose` + `/suggestions`. **Whole router staff-gated** (`agentEditor.ts:29`) — but ⚠️ no rate limits despite hosting the most expensive calls.
- **Tools:** 17 client tools over the local draft. Hybrid apply: empty regions auto-fill (undoable), overwrites are **staged** with Apply/Discard cards. Server-side read tools (`searchHorses` etc.) reuse the Stablehand's RBAC-scoped implementations.

### 2.7 Magazine Builder v2 AiPanel — the proposal agent
- **Where:** docked pane in `/production-system/magazine-v2/:id` (`editor-v2/AiPanel.tsx`), persistent per-magazine chat thread (paged from `magazineChatV2`).
- **Backend:** `POST /api/magazinesV2/issues/:id/pages/:pageId/agent` (`magazineV2/agent.ts`) — **the only agent with server-executed tools**, and the best-guarded: flag + staff + owner/collaborator + `mag2-agent` 20/min + 16-step cap + 90s abort.
- **Pattern:** pure **proposal model** — 15 tools mutate a per-request working copy and stage `AgentProposal`s; the client applies via rev-guarded element CRUD. Model never touches the DB…
- ⚠️ **…with two exceptions:** `add_stock_image` / `change_text_to_image` fetch from Pexels and **persist the asset to S3 + Mongo before the user approves** (orphan asset + third-party spend on discard), and the route writes chat turns to `magazineChatV2` directly.
- Only chat surface **not** on `@ai-sdk/react` streaming — plain request/response (no token streaming, no stop button).

---

## 3. One-shot AI features (5)

| Feature | Endpoint | Where in UI | Gating | Notes |
|---|---|---|---|---|
| ✨ Field composer ("Draft with AI") | `POST /api/agent/compose` | `AiTextarea`/`AiComposeButton` in ArticleForm, HorseForm, MediaDataForm, profile editable boxes | ⚠️ **optional auth, no rate limit — closest thing to an open LLM proxy** | one-shot `generateText`, accept/redo preview |
| v2 Fill / Adjust | `POST /api/magazinesV2/.../format` | toolbar + page-stack wands in v2 editor | staff + owner + 20/min | candidates allow-listed before & after the model; auto-applies undoably |
| v1 compose-from-document | `POST /api/agent/editor/compose` | "fill the bulletin from this document" | staff, no limit | 7 parallel `generateObject` calls (6 static page groups + misc); output post-validated against legal region ids |
| Editor suggestion chips | `POST /api/agent/editor/suggestions` | v1 canvas | staff | ⚠️ only model call with no abort timeout |
| Production System "Studio Brief" | `POST /api/newsroom/brief` | Overview dashboard | staff | fires per page-load, not cron; falls back to cards on failure |

---

## 4. Background / generation pipelines (4)

### 4.1 Magazine v2 "Build with AI" — the flagship multi-agent pipeline
`POST /issues/generate` (10/min) → 202 → worker job → `generate.ts`:
1. **Editorial Director** (`planIssue`, temp 0.8) — title/palette/fonts/page plan; source via deterministic retrieval (not truncation).
2. Per page (concurrency 2): **Copywriter** (temp 0.75, self-heal loop feeding back which slots came back thin, best-of-attempts) + **Art Director** (free-form DSL `generateText`, temp 0.95 → normalize → deterministic solver → QA; retries with the QA failure as a hint; seed-spec and fixed-template fallbacks).
3. **Asset Curator** — per image slot: user upload → Pexels search → palette block. No model renders an image.
4. Deterministic compose + layout QA; safe-template swap on failure.

Cost controls: default 4–5-page preview, 60k source chars, page count 3–16, copy drafted once and re-flowed across layout retries. Photo slots cost nothing per image — they are Pexels searches, not renders.

### 4.2 Add-pages-matching-theme — `POST /issues/:id/pages/generate` (owner, 1–12 pages); also staged by the v2 chat agent's `add_content_pages` tool.
### 4.3 PDF/DOCX import extraction (worker) — MuPDF raster + **one low-temp vision call per page** (`worker/lib/ai.ts`) that only assigns text roles / flags icons & QRs (repositioning forbidden — the historical doubled-text bug). Per-page failures contained with individual retry.
### 4.4 Document ingest/OCR (`lib/agent/documentIngest.ts`) — 4 paths, only 2 cost a model (scanned-PDF OCR at concurrency 2 / 24-page cap; image vision digest). Careful blank-vs-failed distinction → retryable 502 instead of blaming the scan.
### 4.5 ~~AI image generation (`imagegen.ts`)~~ — **REMOVED 2026-08-30.** Photo slots are filled by search only (uploads → Pexels → tinted block); no model renders a picture anywhere in the portal. Assets written by the old path keep `source: 'ai-image'` and stay placeable.

**Worker queue** (`worker/src/queue.ts`): hand-rolled Mongo poll queue, atomic claim, 3 attempts, orphan sweep. ⚠️ Stale-job window (5 min default) is **shorter than a real generation job**; safe only because the sweep runs while the single worker is idle — a second worker would requeue live jobs. ⚠️ Worker registers v2 handlers even when `MAGAZINE_V2` is off. No dead-letter, no heartbeat.

---

## 5. Voice subsystem (shared)

`GET /status`, `POST /transcribe` (25 MB), `POST /speak` (4k chars) → OpenAI direct. Push-to-talk + streamed read-aloud via `useVoiceChat`, consumed by **7 surfaces** (Stablehand, Story, Article, Profile, Onboarding, v1 editor, v2 panel — v2 with opt-in speech only); `AiComposeButton` uses dictation-only. The brain stays Claude — transcripts feed the normal chat endpoints.
⚠️ Both POST endpoints: **optional auth, no rate limit, no timeout** — unauthenticated callers can burn OpenAI credits.

---

## 6. Integration patterns (how the writes stay safe)

| Pattern | Used by | Safety |
|---|---|---|
| Proxy-to-own-REST with caller's token | Stablehand ACTION tools | route enforces RBAC; confirm-gated |
| Client-executed tools → client store → RBAC-gated REST | Story, Article, Profile, v1 editor | server never writes; final PUT/POST re-checked |
| Server-staged proposals, client applies via rev-guarded CRUD | v2 page agent, Fill/Adjust, v1 compose plan | staging is the review checkpoint |
| Direct DB writes by design | generation jobs (worker) | user explicitly requested the artifact |

Prompt-injection defenses exist in all 7 conversational prompts ("tool results / pasted text are DATA"). ⚠️ Missing in: `composePrompt.ts` (consumes untrusted uploaded docs), `agentCompose.ts`, `newsroom.ts` brief, editor `/suggestions`.

---

## 7. Findings — what the AI in this portal NEEDS

### Critical
1. **Unmetered, partially unauthenticated model endpoints.** Only 2 of 16 model endpoints are rate-limited (`agent-chat` 20/min; `mag2-*`). Guests can invoke: `/api/agent/compose` (arbitrary prompt → arbitrary output = open LLM proxy), `/api/agent/voice/transcribe` + `/speak` (OpenAI spend), and the story/article/profile chat streams (8–12 tool steps each). **Fix:** require sign-in on all `/api/agent/*` except the concierge; staff-gate story chat; add `rateLimit()` to every model endpoint (compose 10/min, voice 15/min, studio chats 20/min, editor ingest/compose 5/min).
2. **No output-token cap and no cost accounting anywhere.** No `maxOutputTokens` on any call; no per-user/per-issue spend tracking. **Fix:** central wrapper around `getAgentModel()` calls setting `maxOutputTokens`, logging `{user, endpoint, model, usage, latency}` per call.

### High
3. **Rate limiter is per-process, in-memory, and skips GETs** (`lib/rateLimit.ts`) — meaningless once the API scales horizontally (matches the scalability review's single-instance ceiling).
4. **v2 agent pre-approval side effects** — `add_stock_image`/`change_text_to_image` persist Pexels assets to S3+Mongo before Apply; discards orphan them. **Fix:** stage a descriptor, fetch on Apply — or a GC sweep for unreferenced `mediaAssetsV2`.
5. **Worker stale-job window (5 min) < real AI job runtime** — data-loss/requeue hazard the moment a second worker is added; handlers also not flag-gated; failed jobs have no dead-letter/alerting.
6. **Missing timeouts/retry budgets** on 4 calls: editor suggestions, compose, newsroom brief, both voice fetches. Everything under `magazineV2/` and the worker sets explicit budgets — copy that discipline.
7. **Missing injection clauses** in the 4 prompts noted in §6 — compose ingests raw uploaded document text.

### Medium
8. `suppressGlobal` is a single boolean written by 6 surfaces — overlapping open/close (e.g. Story Studio over a profile drawer) can un-hide the concierge early; make it a counter.
9. Surface inconsistencies: Article Studio lacks vision attachments; Onboarding mascot lacks attachments entirely; v2 AiPanel is the only non-streaming chat (no stop button) — already earmarked in the v2 rebuild plan.
10. Chat persistence is inconsistent: only v2 persists threads (`magazineChatV2`); every other agent's history dies with the tab. Fine for a concierge, questionable for Story Studio (a half-written story is lost on refresh).
11. Dead code: `storyStudioUiStore.ask()` never called; `MAX_AI_ATTACHMENTS`/`MAX_AI_ATTACHMENT_CHARS` in `magazineV2/config.ts` unreferenced (real cap is a hardcoded slice of 6).
12. **Zero AI observability** — no logging of model usage, failures beyond `console.error`, or agent-action audit trail (who let the AI change what). At minimum log ACTION-tool invocations and proposal applies with user ids.

### Coverage gaps (product opportunities, not defects)
- **Podcast workflow** (`/podcast/workflow` + episode forms): zero AI — no compose buttons, no assistant, despite being an editorial surface.
- **Dashboard** (`/dashboard`): no assistant presence beyond the global widget; quick actions exist only on the staff Overview.
- **Claims queue / Site Content / Orgs / Tipping**: no AI (claims triage summarization and site-content drafting are natural fits).
- Production System registers (Horses/People/Media/Racing) have only field-level ✨ compose — no bulk/agentic data entry.

---

## 8. Scorecard

| Dimension | Grade | Note |
|---|---|---|
| Architecture & write-safety | **A−** | proposal/proxy patterns are genuinely well designed |
| RBAC alignment of reads | **A** | tools mirror route visibility exactly |
| Graceful degradation | **A** | every optional AI capability fails to a non-AI path |
| Access control on model endpoints | **D** | 5+ endpoints open to guests |
| Cost control & metering | **D** | step caps only; no token caps, no accounting |
| Scalability of AI infra | **C−** | in-memory limits, single-worker assumptions |
| Observability | **F** | nothing beyond console.error |
| Surface consistency | **B−** | attachment/streaming/persistence divergences |
