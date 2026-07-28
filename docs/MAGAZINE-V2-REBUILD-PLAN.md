# Magazine Builder v2 — Rebuild Plan

**Date:** 2026-07-28
**Status:** PLAN — not yet executing. Awaiting sign-off on sequencing.
**Grounded by:** [MAGAZINE-V2-DEEP-REVIEW.md](./MAGAZINE-V2-DEEP-REVIEW.md) (the audit) + the enhancement effort in flight.

## Decisions (locked with the user)

1. **Generation = Agent brain + correct renderer.** The AI is the brain with full read/create/update/edit tools over the magazine; correctness comes from a *correct* deterministic validator/renderer the agent self-corrects against — not from silent fallbacks.
2. **Editor = rebuild interaction with inline editing.** Click-and-type directly on the page (v1 parity), single-click select, a right panel that actually applies fonts/size/colour, simpler image placement, agent follows the page you scroll to.
3. **Chat = one persistent thread per magazine.** Server-stored, survives refresh/navigation, page-tagged per message, paginated/scalable.

## What "no jugaads" means operationally

We remove **silent fakes and hacks**, not all deterministic code.

| Remove (jugaad) | Keep / build (correct primitive) |
|---|---|
| `SAFE_TEMPLATE` silent swap, `backfillDraft` fabricated copy | A **correct validator** + **agent self-heal** (agent is told what's wrong and fixes it) |
| Magic truncation (6k/14k/8k/16k slices) | **Retrieval** — agent reads the relevant source section via a tool |
| Hardcoded `DOMAIN_CONTEXT` / `FILLERS` / `FALLBACK_ANGLES` (NZ racing) | Domain **derived from the brief**; more pages = ask the agent, not a canned list |
| Silent tint-block image fallback | Surface a **generation warning** when a configured provider fails |
| Swallow-and-fake (`catch {}` → empty=success, job `done` on failure) | Failures **rethrow / surface**; queue retry actually runs |
| Fragile regex (clause-split headline, 6× "parse HTML with regex") | Correct parsing / store plain text alongside HTML |
| Unbounded polls, guessed-retry loops | **Bounded** agent self-heal loops + capped polls (a bounded loop is not a hack) |

**Bounded agent loops are allowed** (write → validate → fix, max N). **Unbounded / guess loops are not.**

## Target architecture

```
          ┌──────────────── PERSISTENT CHAT THREAD (per magazine) ───────────────┐
          │  history stored server-side · page-tagged · paginated                │
          └──────────────────────────────────┬───────────────────────────────────┘
                                              │
  brief + uploaded docs ──▶  AI AGENT (the brain)
                              │   full tools:  READ  getIssue/getPage/getElements/listMedia/retrieveSource
                              │                WRITE add/update/delete page+element, setText/style/image/theme
                              │
                              ▼
                    structured pages (elements)
                              │
                    VALIDATOR (correct text measure + layout)  ──▶  agent self-corrects (bounded)
                              │
                              ▼
                    CORRECT RENDERER → pixels        ◀── same data drives the INLINE EDITOR
                    (gradients/duotone/devices)          (click-and-type, live right panel,
                                                          scroll-aware current page)
```

The **same structured data** is what the agent writes, what the renderer draws, and what the inline editor edits — one source of truth, no divergent paths.

---

## Phases (dependency-ordered)

### Phase 0 — Foundations & de-jugaad at the root
*The honest, correct base everything else stands on.*
- **Correct text measurement** — fix `fontMetrics` non-ASCII under-estimate (audit M4) so `validatePageLayout` becomes trustworthy (unblocks removing the overflow fallback + accurate inline editing).
- **Remove silent fakes** — retire `SAFE_TEMPLATE` silent swap, `backfillDraft` fabrication, `FILLERS`/`DOMAIN_CONTEXT`/`FALLBACK_ANGLES` (racing), silent tint fallback → replace with *surfaced* failure + (Phase 1) agent self-heal. **This subsumes WS4.**
- **Kill magic truncation** — define a `retrieveSource(pageIntent)` interface (real impl in Phase 1) to replace 6k/14k/8k slices.
- **Infra P0 (crash/silent-failure cluster from the audit):** worker OOM caps (`pdf.ts` page-dimension clamp H2, embedded-image downscale M16, WASM `destroy()` M17), `soffice` timeout (M18); `asyncHandler` wrapper for hanging routes (H3); queue retry so failed ≠ `done` (H1) + surface provider failures.
- **DoD:** a non-racing brief yields on-topic content; a failing provider warns instead of faking; the worker survives an adversarial PDF; typecheck + targeted tests green.

### Phase 1 — Agent core (brain + full data access)
*Delivers "fully AI-agent based" generation & editing.*
- **Consolidated tool layer** — complete, validated CRUD: read (getIssue/getPage/getElements/listMedia/retrieveSource), write (add/update/delete page & element, setText/setStyle/setImage/setTheme, reorder). Validate every LLM-supplied id/index/coord (no trusting raw model output).
- **Bounded self-heal** — write → validate → agent fixes, capped iterations.
- **Real retrieval** — chunk the source, retrieve per page intent (removes all truncation caps; content genuinely follows uploads).
- **Bound the data layer** — fix unbounded `find()` (getHorseDossier H4, media/issues M6–M9) with filters/limits/projections + indexes; rate-limit `/api/agent` (M14).
- **DoD:** the agent builds and edits an entire magazine through tools with no silent fallback; queries bounded; content reflects the whole source.

### Phase 2 — Editor rebuild (inline editing)
*Your #3, #4, #7.*
- **Inline editing** — single-click select; click/type to edit text directly on the page (contentEditable), commit on blur, rev-guarded with a captured-`pageId` identity guard (fixes audit H5 / reconciler-wrong-page + rev-race).
- **Live right panel** — controlled inputs for font family / size / weight / colour / alignment that apply instantly (fixes #7 and the audit's uncontrolled-`defaultValue` Inspector bug).
- **Simpler images** — click an image → "Replace" from a media drawer; drag from the drawer onto an element (no full-canvas drag).
- **Scroll-aware current page** — IntersectionObserver tracks the most-visible page → sets the agent's context automatically (#4; supersedes the manual page-hop and fixes audit M20 by construction).
- **DoD:** edit headings directly on the page; font/size changes stick; replace images in two clicks; agent follows your scroll.

### Phase 3 — Chat threads & history
*Your #5.*
- **Backend** — `chatMessages` collection `{magazineId, role, content, pageContext, attachments, createdAt}`, indexed on `magazineId`; `GET` (paginated) + `POST` (append).
- **Frontend** — load thread on open, append optimistically + persist, **stop resetting on page switch** (the vanish bug); attach the scroll-aware page context to each message.
- **DoD:** history survives refresh/navigation; stored + paginated; prompts never disappear.

### Phase 4 — Design level-up
*Your #6.*
- **Renderer** — gradients / duotone / scrim / focal-point support in `IssuePageCanvas` (the WS5 dependency).
- **Design system** — richer archetypes, real type hierarchy, colour systems, editorial devices (drop caps, pull quotes, kickers, captions), image treatment.
- **Agent art-direction** — guided by brief/brand, varied per page (no identical-seed fallback).
- **DoD:** output is visibly a tier above "average," varied and on-brief.

---

## How the in-flight enhancement work folds in

- **WS1 (never-blank)** — reframed: never-blank must mean *agent fills it*, not *silently backfilled*. The Phase 0 self-heal replaces the fabrication.
- **WS3 (user photos)** — keep; becomes part of the Phase 1 image tool/retrieval.
- **WS4 (drop racing)** — becomes Phase 0.
- **WS5 (modern design)** — becomes Phase 4.
- **Uploads UX + creation-doc persistence + page-hop** (already built this session) — commit as-is; the page-hop is superseded by Phase 2's scroll-aware context (and its audit gap M20 is fixed there).

## Recommended sequencing

**Foundations first: Phase 0 → 1 → 2 → 3 → 4**, because the correct renderer/validator (Phase 0) is the prerequisite for both jugaad-free generation *and* accurate inline editing, and the infra P0 fixes are load-bearing once the agent starts hammering the system. Phases 2 and 3 can overlap Phase 1 (different surfaces).

*Alternative if you want visible wins sooner:* front-load Phase 2 (editor) — it's the most user-visible — accepting that inline-edit precision is slightly rougher until Phase 0's text metrics land, and that we're improving UX on top of infra that can still crash under load.

## Open risks
- This is a large multi-week effort; each phase should ship independently.
- Fully-correct text measurement without a real font-rendering engine is hard — Phase 0 targets *conservative-correct* (never under-estimate) rather than pixel-perfect.
- Inline contentEditable + rev-guarded optimistic writes is the trickiest interaction; Phase 2 depends on the store-race fixes landing with it.
