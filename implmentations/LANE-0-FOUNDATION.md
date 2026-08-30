# Lane 0 — Foundation

**You are the only agent running.** Nobody else starts until your gate passes.

**Read first:** RULES.md + Amendment 1 · FOUNDATION v0.2 + Amendments 1 and 2 · Requirements v2.0 · REPO-SURVEY.md

---

## 1. Your role

You build the layer every other lane imports. Seven agents will build on what you produce, and they will not read your implementation — they will read your **types and signatures** and assume they are correct.

That asymmetry defines your job:

> A flaw in your work is not one bug. It is seven agents each inventing a different workaround, and a reconciliation that costs more than the original problem ever would have.

This is why you run alone, and why your gate is strict.

**You are not building features.** No panels, no toolbars with actual buttons in them, no text editing UI. You build the machinery those things plug into. If you find yourself implementing TXT-03 or IMG-04, stop — that belongs to a lane that has not started yet.

---

## 2. What you own

Exclusively. No other lane may create or modify anything here.

```
packages/mb-schema/          types, validation, defaults
packages/mb-commands/        registry, dispatch, history, 8 commands
packages/mb-store/           Immer store, persistence
packages/mb-render/          page renderer, thread layout

apps/web/src/magazine-builder/shell/
apps/server/src/routes/magazineBuilder/index.ts
apps/server/src/lib/magazineBuilder/           (structure only, not logic)

Root: eslint config, root package scripts, CLAUDE.md, BLOCKERS.md
```

## 3. What you must not touch

- **Anything under `magazineV2`** — the old editor keeps working until cutover
- `lib/auth.ts`, `lib/rbac.ts`, `lib/db.ts`, `lib/storage.ts`, `lib/ensureIndexes.ts` — **except** to add index specs for the new collections
- Existing tsconfig files in `apps/*` — new strictness applies to new packages only
- Any existing app's dependencies, beyond adding the four new ones

If you believe something existing needs changing, that is a blocker. Write it down and work around it *by design*, not by editing.

---

## 4. How to work — the cycle

Apply this to every unit of work. The failure mode for an agent is jumping straight to code and discovering the design problem after two hundred lines exist. This cycle exists to prevent that.

### Think

Read the requirement and the constraints. Answer, in writing, before anything else:

- What does this need to do, in one sentence?
- Who consumes it — which lanes, which files?
- What in FOUNDATION or RULES constrains it?
- What already exists in this repo that solves part of it?

That last question matters more than it looks. The survey found working auth, storage, a queue, extraction, and Pexels. Reusing beats rebuilding.

### Analyse

Now find what will go wrong. Write down:

- Every edge case. Empty document, one page, 24 pages, an item with zero size, a thread chain of one box, a deleted asset still referenced.
- Every interaction with another lane's future work
- What could make this fail *silently* — the worst kind of failure, and the kind RULES §1.1 is written against
- What is genuinely ambiguous in the specification

Ambiguity found here is cheap. Ambiguity found during building is a rewrite.

### Discuss

Write a short design note — twenty lines, not a document. State:

- The approach, and the alternative you rejected, and why
- The exact type signatures other lanes will import
- The files you will create
- The tests you will write

Then check it against RULES. Does anything need `any`? Would any file exceed 600 lines? Is any type declared inline? Does any command take an array index?

**If something is genuinely ambiguous, it is a blocker.** Write it in `BLOCKERS.md` and move on. Do not guess and do not invent a reasonable-sounding default — a wrong guess in Lane 0 propagates to seven lanes.

### Finalize

Lock it. Type signatures, file list, test list, all fixed.

**No design changes once building starts.** If you discover the design is wrong mid-build, stop, return to Analyse, and redo the note. Do not patch a design while implementing it — that is how the 3,022-line router happened.

### Build

Implement to the finalized design. Tests alongside the code, not after. Run the checklist in RULES §7 before considering anything finished.

---

## 5. Build order

Sequenced deliberately. Each step exists because the next one needs it.

### Step 1 — Scaffolding

Create `packages/` with the four package directories. Per-package `tsconfig.json` with the strict flags from RULES Amendment §C. Install ESLint at root with the rule set from RULES §9.2, **scoped to new paths only** per Amendment §A. Add root `lint`, `typecheck`, `test` scripts. Configure and export `pino`. Create `CLAUDE.md` and `BLOCKERS.md`.

*Nothing works yet, and that is fine. Get the guardrails up before writing code they will govern.*

### Step 2 — `mb-schema`

Types first, split across the files in FOUNDATION §5. Then `defaults.ts` — factory functions producing a valid blank magazine. Then `units.ts` per Amendment 1 §6. Then `validation.ts`.

`validateMagazine()` **reports; it never repairs.** The old system's `validateElements()` clamps and drops silently, which is exactly how invalid state becomes invisible.

*Checkpoint: you can construct a blank magazine and validate it.*

### Step 3 — `mb-commands`

Registry, then `config.ts` (Amendment 1 §2 — injected, never `import.meta.env`), then `dispatch` per Amendment 2 §3, then `history` with coalescing.

Then the eight commands from FOUNDATION §6.3. Each with a genuine inverse.

Check each against Amendment 2 §5 as you write it: *could two people issue this at once and get a sensible result?* `item.reorder` takes `{ afterId, beforeId }`, never `toIndex`.

*Checkpoint: commands apply, invert, and coalesce.*

### Step 4 — `mb-store`

Immer-backed store implementing FOUNDATION Amendment 2 §4. Subscription with an accurate dirty list. IndexedDB backup on a 2-second debounce.

*Checkpoint: state commits, subscribers fire, reload restores.*

### Step 5 — The headless build test

`packages/mb-commands/test/headless-build.test.ts`. Build a small magazine — two pages, a text box, a photo, a shape — using `dispatch()` alone. No DOM, no browser, plain Node.

**This is the most important test in the codebase.** It is the FWD-02 guarantee. Anything not reachable this way will be impossible for the AI to do later.

Also here: the undo property test. Fifty random commands, fifty undos, deep-equal to the start.

*Checkpoint — and a significant one. You now have a working magazine engine with no UI at all. If this passes, the core is sound.*

### Step 6 — `mb-render`

The page renderer per FOUNDATION §8. HTML and CSS, container queries, `cqw` sizing — the existing renderer's approach, which is proven and prints correctly.

One component, three consumers (ADR-006). Read-only: it never dispatches, it reports pointer events upward.

Virtualisation from the start. Retrofitting it is painful and the old editor's lack of it is a known problem.

*Checkpoint: a magazine document renders.*

### Step 7 — Thread layout

FOUNDATION §7 plus Amendment 1 §3. Render into the first box, measure, binary-search the split, pass the remainder onward. `fontScale` goes in `ThreadLayout`, never in the document.

Respect `minFontScale`. Unbounded shrink produces 6pt text an 80-year-old cannot read, silently.

*Checkpoint: text flows from one box into the next, and editing at the start reflows correctly.*

### Step 8 — Shell

Toolbar with all five slots, three panel mounts, `registerToolbarItem` and `registerPanel`, `SelectionState` including `hoveredId`. Per Amendment 1 §5.

**Slots are empty.** You provide the frame; lanes fill it.

GL-09: controls are disabled, never removed or moved.

### Step 9 — Server skeleton

Every route in FOUNDATION §9.3, present and typed, stubbed where a lane owns the implementation. Router split by concern per §9.2 — never one file.

Collections and index specs added to `lib/ensureIndexes.ts`.

The middleware chain from §9.1, using existing `attachAccount` and RBAC unchanged.

Stubs return `501` with a typed shape. **Never `any`, never an empty object.**

### Step 10 — Gate

Work through Section 1 of `agents-work.md` line by line.

---

## 6. Traps specific to this lane

Things that will bite, listed because they are not obvious.

**Immer and Maps.** `ThreadLayout` uses `Map`. Immer needs `enableMapSet()` called once at setup, or drafts of Maps behave strangely. Call it in the store's initialisation.

**Structural sharing is easy to destroy.** Immer preserves object identity for unchanged branches, which is what lets the renderer skip work. Spreading everything — `{...page, items: [...page.items]}` — throws that away. Mutate the draft directly; that is the entire point of Immer.

**The dirty list must be accurate.** Too few ids and the screen shows stale content. Too many and you re-render everything, failing GL-17's 16ms budget. Each handler returns exactly what it touched.

**Coalescing granularity.** `coalesceKey` decides what one undo step means. Too broad and an entire editing session collapses into one entry. Too narrow and a drag needs forty undos. One drag gesture, one typed word.

**Duplicate registration must throw.** `registerCommand` rejecting a duplicate type is how you find out that two lanes chose the same command name. Silent overwrite is a bug that surfaces weeks later.

**Never put derived state in the document.** Fitted font size, layout positions, overflow counts — all computed. The moment computed state is stored, it goes stale and you have two sources of truth. This is the mistake the old element model made with `fontSize` alongside `maxFontSize`.

**Stubs must be honestly typed.** A stub returning `{} as MagazineResponse` type-checks and lies. Return `501` with a real error shape.

**Do not implement features.** Repeating this because it is the most likely way Lane 0 overruns. The temptation to "just add the font picker while I'm here" is strong and it belongs to Lane 2.

---

## 7. Your gate

`agents-work.md` Section 1, in full. Six groups, every box ticked.

The three that matter most:

1. **The headless build test passes.** No UI, plain Node. If a magazine cannot be built without a browser, the AI phase is already blocked.
2. **A failing command leaves `store.current` completely untouched.** Test this explicitly with a deliberately broken handler.
3. **Every type another lane imports exists.** Walk the lane ownership table and ask, for each: what does this lane import from me, and does it exist?

---

## 8. Blockers

Append to `BLOCKERS.md` and keep going on something else.

```md
## [OPEN] Lane 0 — thread split at a paragraph boundary is ambiguous
**Raised:** 2026-09-01
**Where:** packages/mb-render, thread layout
**The ambiguity:** when a paragraph splits exactly at its end, does the next box
start with an empty first line or with the following paragraph?
**Why I did not guess:** either choice is defensible and both text and pages
lanes depend on it.
**Doing instead:** moved to step 8.
```

Note what makes this a real blocker rather than a decision: **both choices are defensible and other lanes depend on it.** Something with one obvious right answer is not a blocker — decide it and note the decision in your design note.

---

## 9. What you hand over

When the gate passes:

1. A one-page summary of what exists, what is stubbed, and anything that turned out differently from FOUNDATION
2. `BLOCKERS.md` with everything you hit, resolved or not
3. The list of command types you registered, so no lane collides
4. Any place FOUNDATION was wrong — the survey found six errors in it already, and there will be more

**That last item is not optional.** The lane documents get written from your output. If FOUNDATION and reality have diverged, seven agents will be told something untrue.

---

## 10. The one thing

You will be tempted to move fast because six lanes are waiting.

Do not. Every hour here saves several later. A defect in `mb-schema` is found by seven agents simultaneously, each of whom writes a different workaround, none of whom tells you. By the time it surfaces, the workarounds are load-bearing.

Slow is the correct speed for this lane. It is the only one where that is true.
