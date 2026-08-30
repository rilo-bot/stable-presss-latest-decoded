# Engineering Rules

**Applies to:** every lane, every agent, every commit
**Status:** Binding. Not guidance.

---

## 0. How to use this

Put this file at the repository root and reference it from `CLAUDE.md`, so it loads automatically into every agent's context:

```md
<!-- CLAUDE.md -->
# Magazine Builder
Read @RULES.md before writing any code. Every rule is binding.
Read @FOUNDATION.md for the architecture and your lane's boundaries.
```

**Rules without enforcement are wishes.** Section 9 gives the actual lint and compiler configuration that makes most of these mechanical. Configure it in Lane 0, before any parallel work starts. A rule a machine checks is followed; a rule in a document is followed for about a day.

---

## 1. Absolute prohibitions

These fail CI. There is no case where they are acceptable, including "temporarily" and "just to unblock myself".

### 1.1 No silent fallbacks

A missing value that should be present is a bug. Hiding it makes the bug invisible and moves the failure somewhere far away from its cause.

```ts
// FORBIDDEN — hides a real problem
const title = magazine.meta.title ?? '';
const width = item.frame?.w || 100;
const name = user.name || 'Unknown';
const look = looks[id] ?? DEFAULT_LOOK;

// CORRECT — the type says whether it can be missing
const title = magazine.meta.title;              // typed string; if absent, that's a bug upstream

const look = looks[lookId];
if (!look) throw new InvariantError(`Look not found: ${lookId}`);
```

**The `??` operator is not banned.** It is correct when the value is *genuinely optional* and the default is *semantically right*:

```ts
// FINE — backgroundColor is legitimately nullable, transparent is the real default
const bg = page.backgroundColor ?? 'transparent';
```

**The test:** if the value being absent means something went wrong, throw. If absent is a valid state with a meaningful default, use `??` and make the type `| null`.

### 1.2 No placeholder values

```ts
// FORBIDDEN
const credit = asset.credit || '—';
const count = items.length || 0;
return { id: '', name: 'TODO', frame: { x: 0, y: 0, w: 0, h: 0 } };
```

Never ship a value that stands in for a real one. If you cannot compute it, the function should not return.

### 1.3 No type escape hatches

```ts
// ALL FORBIDDEN
const x = value as any;
const y = value as unknown as Magazine;
const z = item!;                    // non-null assertion
// @ts-ignore
// @ts-expect-error   (except in tests that assert a type error)
function f(x) {}                    // implicit any
```

If TypeScript is complaining, it has found something. Fix the cause.

### 1.4 No swallowed errors

```ts
// FORBIDDEN
try { doThing(); } catch {}
try { doThing(); } catch (e) { console.log(e); }
promise.catch(() => {});
```

Every catch either handles the error meaningfully, converts it to a typed result, or rethrows. Handling means the program is genuinely in a good state afterwards.

### 1.5 No leftovers

- No `TODO`, `FIXME`, `HACK`, or `XXX` comments in merged code. If it needs doing, it is a task, not a comment.
- No commented-out code. Git remembers it.
- No `console.log`. Use the logger.
- No unused imports, variables, or exports.

### 1.6 No unapproved dependencies

Adding a package requires Lane 0 approval. Five agents each reaching for their preferred library produces three date libraries, two state managers, and a 4MB bundle.

If you need something, ask. The answer is often "that's twelve lines, write it".

---

## 2. Files and modules

### 2.1 Length

| Limit | Rule |
|---|---|
| 600 lines | Hard maximum. CI fails above this. |
| 400 lines | Soft warning. Consider splitting. |

**This is a ceiling, not a target.** A 30-line file doing one thing well is correct. Do not pad files or merge unrelated modules to approach the limit.

Applies to `.ts` and `.tsx`. Generated files and lockfiles are exempt.

### 2.2 One concern per file

A file exports one main thing: one component, one hook, one handler, one class. Small private helpers used only by that export may live alongside it. Anything reused elsewhere moves to its own file.

### 2.3 Structure within a lane

```
features/<lane>/
  types.ts              all types for this lane
  constants.ts          all named constants
  commands/             one file per command handler
    createTextBox.ts
    setTextAlign.ts
  components/           one file per component
    TextPanel.tsx
  hooks/
    useTextSelection.ts
  index.ts              public surface — registration only
```

### 2.4 No circular imports

CI fails on any cycle. If A needs B and B needs A, the shared piece belongs in a third module — usually `packages/schema`.

---

## 3. Types

### 3.1 Types live in type files

```ts
// FORBIDDEN — inline in a component file
interface TextPanelProps {
  itemId: string;
  onChange: (v: string) => void;
}
export function TextPanel(props: TextPanelProps) { ... }
```

```ts
// CORRECT
// features/text/types.ts
export interface TextPanelProps {
  itemId: Id;
  onChange: (value: string) => void;
}

// features/text/components/TextPanel.tsx
import type { TextPanelProps } from '../types';
export function TextPanel(props: TextPanelProps) { ... }
```

**Where types go:**

| Type | Location |
|---|---|
| Used by more than one lane | `packages/schema/src/` |
| Used across files within a lane | `features/<lane>/types.ts` |
| Used in exactly one file, not exported | May stay in that file |

The last row is the only exception, and it exists so you don't create a types file for one local union.

### 3.2 Schema types are split by subject

`packages/schema` would exceed the file limit as one file. Split it:

```
packages/schema/src/
  primitives.ts       Pt, Id, Rect, Color, Insets
  magazine.ts         Magazine, PageSetup, Spread, Page
  items.ts            Item union, TextBox, Photo, Shape, Group
  text.ts             Story, Paragraph, TextRun, props, SavedLook
  assets.ts           AssetRef
  validation.ts       validateMagazine
  defaults.ts         factory functions for blank documents
  index.ts            re-exports
```

### 3.3 No `any`, ever

Use `unknown` and narrow it. If you truly cannot type something, that is a design problem to raise, not to suppress.

### 3.4 Explicit return types on exports

Every exported function annotates its return type. Inference is fine internally; across a module boundary it makes changes invisible to consumers.

### 3.5 `import type` for types

Keeps types out of the runtime bundle and makes the distinction visible.

---

## 4. Errors — fail loudly, never crash

These two requirements appear to conflict. They do not. The resolution is that **invalid state is detected immediately, and the user never sees a broken screen.**

### 4.1 Development: throw

```ts
export class InvariantError extends Error {
  constructor(message: string) {
    super(`Invariant violated: ${message}`);
  }
}
```

Throw on: an invariant break, a missing required value, an unreachable branch, a command handler receiving invalid payload. Loud and immediate, next to the cause.

### 4.2 Production: contain

The user must **never** see a white screen. For our audience that is not an inconvenience, it is the end of the session and possibly of their trust in the product.

```
Error boundary around:
  the whole app        → "Something went wrong. Your magazine is safe."
  the page canvas      → the rest of the interface keeps working
  each panel           → one broken panel doesn't take down the editor
```

Every boundary must:

1. Log the error with full context to the server.
2. Show a plain-language message with a next step (GL-12).
3. Leave the magazine data intact and saved.
4. Offer a way to continue — reload, undo, or go back to the home screen.

### 4.3 Never leave a partial change

Command handlers validate everything **before** they mutate. A handler that throws halfway leaves a corrupt magazine, which is far worse than rejecting the command.

```ts
// CORRECT
export function moveItem(draft: Magazine, payload: MovePayload): CommandResult {
  const item = findItem(draft, payload.itemId);
  if (!item) throw new InvariantError(`Item not found: ${payload.itemId}`);
  if (item.locked) return { rejected: 'item-locked' };

  const previous = { x: item.frame.x, y: item.frame.y };
  item.frame.x = payload.x;                    // mutate only after all checks
  item.frame.y = payload.y;

  return {
    inverse: { type: 'item.move', payload: { itemId: item.id, ...previous } },
    dirty: [item.id],
  };
}
```

### 4.4 Every async operation handles failure

No unhandled promise rejections. Network calls return a typed result rather than throwing across a boundary:

```ts
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

---

## 5. Naming

Five agents produce five naming styles unless this is fixed up front.

| Thing | Convention | Example |
|---|---|---|
| Files (components) | PascalCase | `TextPanel.tsx` |
| Files (everything else) | camelCase | `moveItem.ts`, `useSelection.ts` |
| Directories | kebab-case | `features/photo-library/` |
| Types and interfaces | PascalCase, no `I` prefix | `TextBox`, not `ITextBox` |
| Functions and variables | camelCase | `findItem` |
| Constants | SCREAMING_SNAKE | `MAX_UNDO_DEPTH` |
| Commands | `noun.verb` | `item.move`, `text.setAlign` |
| Booleans | `is` / `has` / `can` prefix | `isLocked`, `hasOverflow` |
| Event handlers | `handle` prefix | `handlePointerDown` |
| Handler props | `on` prefix | `onChange` |

**No magic numbers or strings.** Every literal that carries meaning is a named constant in `constants.ts`.

```ts
// FORBIDDEN
if (distance < 6) snap();
setTimeout(save, 2000);

// CORRECT
if (distance < SNAP_THRESHOLD_PX) snap();
setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
```

---

## 6. Lane discipline

### 6.1 Stay in your lane

- Create files only under your lane's path.
- Never edit another lane's files, `packages/`, or the shell.
- Needing a change outside your lane means **stop and ask Lane 0**. Do not work around it.

### 6.2 One requirement at a time

Take a single requirement ID. Finish it completely — including its tests and its Section 7 checklist — before starting the next. Do not open four requirements in parallel within a lane.

Depth beats breadth here. A perfect `TXT-01` is worth more than five half-finished text features, because a half-finished feature is indistinguishable from a bug to the user.

### 6.3 Commits reference requirement IDs

```
TXT-03: font list rendering each name in its own face
ARR-02: hover feedback on items and handles
```

One requirement per commit where possible. Never mix two lanes in one commit.

### 6.4 Never duplicate across lanes

If your lane needs something another lane already wrote, do not copy it. Ask Lane 0 to move it into `packages/`. Two copies diverge within a week.

---

## 7. Definition of done

A requirement is not finished until every line is true. Check them explicitly — do not assume.

1. The **Done when** criterion from the requirements document is demonstrated.
2. An automated test covers it.
3. It works through `dispatch()` alone, with no UI interaction (FWD-02).
4. Undo and redo work correctly, at the right granularity.
5. It works by keyboard alone (GL-13).
6. It works without any drag (GL-04).
7. Every control is at least 44×44 pixels (GL-01).
8. All user-facing text passes the vocabulary scan (GL-08).
9. It works at 200% browser zoom (GL-11).
10. Every error path shows a plain-language message with a next step (GL-12).
11. No file exceeds 600 lines.
12. `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.

---

## 8. Testing

**Required for every requirement:**

- **Command handlers:** unit test the forward action, the inverse, and rejection of invalid payloads.
- **Invariants:** after every command, `validateMagazine()` returns no errors.
- **Undo:** a property test — N random commands then N undos returns the magazine to an identical state.
- **The headless build test:** extend `packages/commands/test/headless-build.test.ts` as your lane lands. This is the FWD-02 guarantee and the single most valuable test in the codebase.

**Not required:** snapshot tests of rendered markup. They break constantly and catch almost nothing.

---

## 9. Enforcement configuration

Configure this in Lane 0. Rules that aren't checked aren't followed.

### 9.1 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,      // makes 1.1 mechanical
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true            // enforces `import type`
  }
}
```

`noUncheckedIndexedAccess` is the important one — it makes `looks[id]` return `SavedLook | undefined`, forcing you to handle the missing case explicitly instead of reaching for `??`.

### 9.2 ESLint

```jsonc
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/ban-ts-comment": "error",
    "@typescript-eslint/explicit-module-boundary-types": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "no-console": "error",
    "no-empty": ["error", { "allowEmptyCatch": false }],
    "max-lines": ["error", { "max": 600, "skipBlankLines": true, "skipComments": true }],
    "no-warning-comments": ["error", { "terms": ["todo", "fixme", "hack", "xxx"] }],
    "import/no-cycle": "error",
    "no-magic-numbers": ["warn", { "ignore": [0, 1, -1], "ignoreArrayIndexes": true }]
  }
}
```

Plus a boundaries rule restricting cross-lane imports:

```jsonc
"import/no-restricted-paths": ["error", {
  "zones": [{
    "target": "./apps/web/src/features/text",
    "from": "./apps/web/src/features",
    "except": ["./text"],
    "message": "Lanes must not import from each other. Ask Lane 0 to move shared code into packages/."
  }]
}]
```

Repeat one zone per lane.

### 9.3 Pre-commit

```bash
pnpm lint --max-warnings=0
pnpm typecheck
pnpm test --run
```

### 9.4 CI, on every merge to main

Everything above, plus:

- The vocabulary scan (GL-08) against all user-facing strings
- The touch-target audit (GL-01)
- The headless build test (FWD-02)
- The primary acceptance test — **if it breaks, revert the merge rather than patching forward**

---

## 10. The one that matters most

Everything above is mechanical and a machine can check it. This one cannot be automated:

> **When you find something wrong outside your lane, stop and report it. Do not work around it.**

A workaround is invisible. It looks like working code, it passes review, and it quietly encodes a wrong assumption that another lane will build on top of. By the time the underlying problem surfaces, four lanes depend on the workaround and fixing it properly costs more than the original problem ever would have.

This is how the previous platform accumulated the defects that led to this rebuild. The single highest-value habit across five parallel agents is being willing to stop.
