# Magazine v2 — "Builder Strong" phase

**Date:** 2026-08-17 · **Direction (user):** builder quality before PDF export; the magazine
runs on the ChatGPT flagship (hardcoded, not env); intake is analyzed by the LLM (no
regex/heuristic parsing); the AI has full access and plans every page's look freely (no
forced cover); every hack found on the way is logged here and pinged to the user.

## The target flow (user's words, 2026-08-17)

1. User enters a prompt → **one thread starts right there** (the prompt is message 1).
2. The AI **analyzes the request properly**: topic, the exact ask, page count if given,
   documents / images / layout references if given.
3. The LLM **plans page 1's look and every other page's look** — no hardcoded cover,
   no page-type menu deciding anything.
4. Pages build **one by one**.
5. Everything is built by the AI. Images are **generated first** (bespoke, per the art
   director's brief), then found (user photos outrank everything; Pexels stock as backup).

## Built (WS1 + WS0) — 2026-08-17

- **WS1 — brain:** `MAGAZINE_MODEL = 'openai/gpt-5.6-sol'` hardcoded in
  `lib/agent/provider.ts` (`getMagazineModel()`), slug verified against
  openrouter.ai/models the same day. Used by: planner, add-pages planner, copywriter,
  art director, page agent (chat), reference fill, per-page fill/adjust (`format.ts`).
  Every other studio (blog, story, capture, compose…) stays on `AGENT_MODEL`.
- **WS0 — birth thread:** `POST /issues/generate` creates a thread with the user's
  prompt as message 1 (best-effort — a thread hiccup never blocks generation);
  `threadId` rides the job; the worker posts the planner's **read-back + page plan**
  into it after planning, and a completion note when all pages are built.
- **WS0 — LLM intake:** the planner's schema now has a required `readback` — what it
  understood (topic, exact ask, page count and why, material used). Prose page counts
  ("make me a 12 page magazine") are honoured by instruction, not regex.
- **WS0 — free planning:** the forced `cover`-first/`back-cover`-last rule is GONE from
  prompt and code; the canned FILLER pages are GONE. Each planned page carries a
  `look` — the Editorial Director's own visual direction — which the art director
  receives verbatim and is told outranks the structural family. A plan short of an
  explicit page count is topped up by RE-ASKING the planner (`planPages`), not by a
  filler table.

## Hacks / mechanical residue found while building (the log the user asked for)

1. **`kind` still exists** on every planned page — the enum is load-bearing for the
   template FALLBACK path (when the AI layout fails 3×) and the archetype steer. It is
   now documented as "nearest structural family, never a limit". Removing it entirely
   means rebuilding the fallback path — future work, not a blocker.
2. **`archetypeSteer(page.kind)`** still nudges layout by kind. Kept as inspiration
   only; the `look` line outranks it in the prompt.
3. **`planPages` last-resort fallback** (subject-derived page intents when even the
   re-ask fails) — a hack that deliberately stays: the user must never get fewer pages
   than they asked for because a model call failed.
4. **Vision (readLayout.ts) still on the Claude model** — reference-image reading is
   load-bearing; switch it to GPT only after one verified GPT reference-read.
5. **Duplicate completion note on retry** — a queue retry that resumes a half-built
   issue posts a second "all pages built" note. Rare + cosmetic; fix later.
6. **CONFIRMED LIVE + FIXED (2026-08-17):** GPT strict structured output rejects any
   schema with optional fields — first live build failed all 3 attempts in planning
   with `[Azure] Invalid schema … 'required' must include every key. Missing
   'sectionTitle'`. Fix: every field in PlanSchema / PagesSchema / format.ts
   EditsSchema is now REQUIRED, with `''` meaning none. Rule for all future magazine
   `generateObject` schemas: **no `.optional()` — required + empty-string sentinel.**
   Still watched: the chat agent's TOOL schemas keep optionals (function calling is
   non-strict by default) — if the studio chat errors the same way, same fix there.
7. **Display-type ceiling** — the art director's own prompt caps masthead guidance at
   44–72pt; the benchmark runs ~130pt. WS2 (not yet built) raises this.

## Still to build (approved plan, in order)

- **WS-images:** upgrade `MAGAZINE_V2_IMAGE_MODEL` (currently `google/gemini-2.5-flash-image`)
  + richer art-directed photo briefs. Note: image-gen is OFF without S3 locally.
- **WS2:** display-scale typography (raise ceilings, italic/tracking axis).
- **WS5:** fitReport gates on agent + apply paths (not just generation).
- Parked: PDF export page-doubling bug (every page spills a sliver sheet; folio strips
  render past the sheet edge — repro needed).
