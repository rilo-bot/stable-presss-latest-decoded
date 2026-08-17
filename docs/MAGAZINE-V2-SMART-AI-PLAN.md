# Smart AI, Full Access — the plan (2026-08-17)

**The goal, stated by the client:** a smart AI with FULL access to the magazine that can do anything
and design whatever it wants — and a build process that doesn't feel mechanical. This extends the
§2b reversal in docs/MAGAZINE-V2-BUILDER-PLAN.md (AI decides everything about design) with REACH
(the whole magazine, not one page) and EYES (it sees what it makes).

Grounded in docs/MAGAZINE-V2-FULL-REVIEW-2026-08-17.md (9-agent verification, all file:line).

## Where it is still mechanical today (verified)

1. **The chat agent is a one-page mechanic** — sees one page as 60-char text lines, no other
   pages, no theme, no vision, no memory of unapplied proposals, no measurements (agent.ts:100-185).
2. **The issue planner pads with canned filler** — `normalizePages` (generate.ts:193-223) fills a
   requested page count with 5 hardcoded FILLER page kinds; the 8-kind taxonomy itself constrains
   what a page can be.
3. **Fallbacks are canned pages** — seedSpecFor / fixed templates / SAFE_TEMPLATE ship a canned
   skeleton silently whenever the AI stumbles, and those pages get the LEAST quality scrutiny.
4. **Static tables still shape output** — two divergent CHAR_GUIDE tables (generate.ts:408 vs
   format.ts:20), per-kind density bars that count elements, KIND_LABEL running heads.
5. **Quality is arithmetic, not judgement** — the fit report is mechanical checks; nothing ever
   looks at a rendered page. Attempt 1 is authored blind.
6. **The experience is mechanical in the worst way** — polls that give up at fixed timers, false
   "Pages added" toasts, page-wipe on retry.

## What stays mechanical ON PURPOSE (and why that serves the goal)

The solver stays the only thing that writes coordinates. That is not a limit on the AI's
intelligence — it's the AI's hands. Overlap-free, on-page, integer-tiled geometry is what lets the
AI take big swings without producing broken pages. Same for permission gates and the publish gate:
those are authority questions, not intelligence questions. Everything else is up for grabs.

---

## Phase A — Reliability floor (the stall fixes) — FIRST, ~1 session

A smart AI that freezes at page 6 feels dumb no matter what its brain is. All six from §7 of the
review: poll-until-status-changes (no wall clock), honest toasts (restored-status+processingError
= failure), incremental add-pages inserts + pagesProcessed, API-side stuck-issue watchdog,
resume-not-wipe on job retry, stale-job threshold above real runtime. Plus the `isAdding` flag fix
so the honest page counter finally shows.

## Phase B — Full access (the agent commands the whole magazine) — ~2-3 sessions

B1. **Issue context in the prompt**: title, theme/palette/fonts, plan, and one line per page via
    the existing `pagesAlreadyIn` digest (pageDigest.ts) — the generator already gets this; the
    agent never has.
B2. **`get_page` tool**: read any page's element listing by ordinal (reuse `resolvePageOrdinal`).
    Unlocks "make page 3 like page 1", cross-page consistency, honest answers.
B3. **`page` argument on every element tool** (the proposal shape already carries pageId — the
    `use_image_as_layout` pattern, generalized). The agent edits ANY page from anywhere.
B4. **`regenerate_page` tool**: re-run `composeOnePageAI` for an existing page with the agent's
    brief as the intent (owner-gated like the other structure tools). This is "redesign page 4" —
    impossible today.
B5. **Issue-wide restyle proposal kind**: theme/palette/fonts/all-headlines as ONE staged proposal
    applying across pages (the only genuinely new apply path).
B6. **Memory + feedback**: persist a one-line summary of staged proposals into the thread (so
    unapplied work stops evaporating), and echo fitReport/density/fidelity into tool results (so
    the agent knows whether its move helped).
B7. **`duplicate_page`** — cheap, frequently asked for.

Collaborator gating stays as-is: page-structure tools remain owner-only (permission, not smarts).

## Phase C — De-mechanize generation — ~2-3 sessions

C1. **Kill canned filler**: `normalizePages` stops padding with FILLER kinds — the Editorial
    Director plans every page with a real intent, or the count is honestly reduced.
C2. **One measured text-budget authority**: fold both CHAR_GUIDE tables into the measured
    `charBudget` module (today AI edits and AI generation disagree 2× about the same box).
C3. **Band height + aggregate whitespace gate** (Part 1 fix order #1-2): minimum track heights /
    merge small bands; sum slack + consume `emptyShare`; count overflow/deep-shrunk. This kills
    the mechanical-looking dead-air pages.
C4. **Honest fallbacks**: a page that fell to seed/template is MARKED (`source:'fallback'`) and
    surfaced in the studio ("this page needs a redesign — ask the assistant"), and B4's
    regenerate_page is the recovery path. Canned pages stop masquerading as designed ones.
C5. **Loosen the kind taxonomy**: kinds become briefs, not molds — density bars move to
    area-based, KIND_LABEL fallback already deleted where it lied.

## Phase D — Eyes (the real end of "mechanical") — the big one

D1. **Render harness** (§10.4 of the builder plan — still the disqualifying gap): render any page
    to pixels server-side (the Puppeteer PDF path already renders pages — reuse it for PNG).
D2. **Vision critique in the generation loop**: after compose, the model SEES its page and
    iterates — replacing arithmetic-only retries with actual judgement. This is what "not
    mechanical" ultimately means.
D3. **Vision in chat**: the agent can look at the page it's editing ("this looks cramped" becomes
    answerable), and at user-attached images as images.
D4. Phase 2 critic from the builder plan (pageQuality score) calibrated against rendered pages
    ranked by eye — unblocked by D1.

## Order and rationale

A → B → C → D. A is hygiene (everything else looks broken without it). B is the fastest change in
perceived intelligence per line of code — B1+B2 alone are roughly an afternoon. C makes generated
output stop looking machine-assembled. D is the deepest change and the only one that needs new
infrastructure — but D1 reuses the existing Puppeteer render path, so it's cheaper than it sounds.

**Anti-regression spine applies throughout** (from the builder plan): fix the mechanism not the
example; re-plant every fix; one measured number per phase; the guards must actually exercise the
changed path (the reference-path lesson: 274 green tests proved nothing about a path no test ran).
