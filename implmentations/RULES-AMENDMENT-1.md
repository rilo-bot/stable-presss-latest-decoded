# RULES.md — Amendment 1

**Applies to:** RULES.md as originally written
**Reason:** the repo survey measured the real codebase and found several rules unenforceable as stated, plus two errors of my own.

Apply these changes to RULES.md. Everything not mentioned stands unchanged.

---

## A. Scope — the rules apply to new code only

Add this to §0, immediately after the enforcement paragraph:

> ### What these rules cover
>
> **New code only.** Specifically:
>
> - `packages/mb-*`
> - `apps/web/src/magazine-builder/**`
> - `apps/server/src/routes/magazineBuilder/**`
> - `apps/server/src/lib/magazineBuilder/**`
> - `apps/worker/src/jobs/publishMagazine.ts`
>
> Existing code keeps its current configuration and is not retrofitted. Applying these rules repo-wide produces 2,092 TypeScript errors and would fail CI on day one in code we are not touching.
>
> **When you edit an existing file**, follow its local conventions. Do not "improve" it to match these rules — that turns a two-line change into a large diff nobody asked for and nobody can review.

---

## B. `verbatimModuleSyntax` is dropped

Remove it from §9.1 entirely.

The survey measured 1,708 errors from this flag alone — 82% of the total — and every one is `TS1286` or `TS1287`. The server compiles as CommonJS while its source is written in ESM syntax, and the flag forbids that combination. Clearing it means migrating `apps/server` to ESM: a build and runtime change with real deployment risk and no benefit to this project.

`import type` is still required. **§3.5 stands** — enforce it with the ESLint rule `@typescript-eslint/consistent-type-imports`, which works regardless of module system.

---

## C. §9.1 replaced

The strict settings apply to new packages only, via their own `tsconfig.json`. Existing app configs are untouched.

```jsonc
// packages/mb-*/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
    // verbatimModuleSyntax: deliberately absent — see B
  }
}
```

`noUncheckedIndexedAccess` remains the most valuable of these. It makes `looks[id]` return `SavedLook | undefined`, so §1.1 becomes mechanical rather than a matter of discipline.

---

## D. §9.3 and §9.4 — npm, not pnpm

The repo uses npm workspaces. Replace every `pnpm` invocation with `npm run`:

```bash
npm run lint       # --max-warnings=0
npm run typecheck
npm test
```

**None of these root scripts exist yet.** Creating them is a Lane 0 deliverable, along with installing ESLint — which is currently not present anywhere in the repo, despite existing source files carrying `eslint-disable` comments written against it.

There is also no CI and no pre-commit hook. Until CI exists, §9.4's checks run manually before each merge. Getting CI up is worth doing early; every rule here is a wish until a machine checks it.

---

## E. §2.1 — the line cap applies to new files

Add:

> The 600-line cap applies to new files. Existing files exceeding it — `routes/magazinesV2/index.ts` at 3,022 lines, `fontMetrics.data.ts` at 8,256 — are exempt and are not to be refactored as part of this work.
>
> Generated data files are exempt permanently. Configure `max-lines` to ignore them by path rather than by comment.

---

## F. §1.5 — the logger now exists

RULES said "use the logger" and no logger existed. `console.*` is the logging mechanism throughout the current codebase.

**pino** is the choice. Lane 0 configures and exports it. The `no-console` rule applies only within the new-code scope in section A — existing files keep their `console` calls until they are replaced.

---

## G. §7 line 7 — correcting my error

**As written:**

> 7. Every control is at least 44×44 pixels (GL-01).

This drops the clause added to GL-01 in requirements v2.0 specifically to resolve a contradiction with ARR-01, and by omitting it, reinstates the contradiction. **Replace with:**

> 7. Every control is at least 44×44 pixels, and selection handles at least 14 pixels (GL-01).

---

## H. §7 — the human gate is restored

RULES §7 has twelve items; requirements §8.1 has eleven. I dropped one and added three mechanical checks. The dropped one was the only item on the list a machine cannot verify, which is exactly why it must not go missing.

**Add as item 13:**

> 13. Someone outside the team has used it to complete a real task.

For requirements touching the primary flows — TXT-01, TXT-02, IMG-01, ARR-01 through ARR-06, DOC-02, PUB-01 — "someone outside the team" means **a person in the target age range**, not a colleague. Everything else may use any outside person.

This is the requirement that catches what nothing else does. The current platform's central failure is usability, and it was built by people who knew where every control was.

---

## I. §7 line 3 and §8 — paths corrected

Both referenced packages that did not exist. Corrected paths:

- §7 line 3: works through `dispatch()` alone, from `packages/mb-commands`
- §8: extend `packages/mb-commands/test/headless-build.test.ts`

Neither exists until Lane 0 builds it. Until then, that checklist item is not yet applicable — and no lane starts before Lane 0's gate passes anyway.

---

## J. §0 — file placement

RULES says to put the file at the repository root and reference it from `CLAUDE.md`. It currently sits at `implmentations/RULES.md` and there is no `CLAUDE.md`.

Create `CLAUDE.md` at the repository root:

```md
# Magazine Builder

A rebuild of the magazine editor. The existing platform — auth, RBAC, worker,
storage, database — is not being replaced. Only the editor and its data model.

Read before writing any code:
- @implmentations/RULES.md            engineering rules, binding
- @implmentations/RULES-AMENDMENT-1.md what changed after the repo survey
- @implmentations/FOUNDATION-v0.2.md   architecture and lane boundaries
- @REPO-SURVEY.md                      what already exists

New code goes under `magazine-builder` paths only. The existing `magazineV2`
surface keeps working until cutover — do not modify it.

Blocked? Append to BLOCKERS.md and stop that requirement. Do not work around it.
```

---

## K. §10 — the blocker mechanism

§10 says to stop and report rather than work around. That needs somewhere to report to. Create `BLOCKERS.md` at the root:

```md
# Blockers

## [OPEN] TXT-11 — thread split loses the last word at box boundaries
**Lane:** 2 · **Raised:** 2026-08-30
**Where:** packages/mb-commands — needs a change outside my lane
**What I need:** the split point calculation to be exclusive, not inclusive
**Stopped:** yes — TXT-11 is paused, moved to TXT-12
```

Rules: append, never edit someone else's entry. Stop that requirement and move to the next one in your lane. Never work around a problem in shared code.

---

## Summary

| Change | Effect |
|---|---|
| A — scope to new code | 2,092 errors in untouched code become irrelevant |
| B — drop `verbatimModuleSyntax` | Removes an unnecessary ESM migration |
| C — strictness per package | Full strict on new code, existing untouched |
| D — npm not pnpm | Matches the repo |
| E — line cap on new files | Existing 3,022-line files exempt |
| F — pino | Fills a gap the rules assumed away |
| G — selection handles | Fixes a contradiction I reinstated |
| H — human gate restored | The check nothing else catches |
| I, J, K — paths and process | Makes the rules actionable in this repo |
