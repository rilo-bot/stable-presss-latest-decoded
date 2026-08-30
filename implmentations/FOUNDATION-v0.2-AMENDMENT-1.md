# FOUNDATION v0.2 — Amendment 1

**Fixes six defects found in review, plus two accepted changes.**
Apply to FOUNDATION-v0.2.md. Everything not mentioned stands.

Items 1, 2, 4 and 5 are errors in my document. Items 3 and 6 are genuine gaps. All are in code Lane 0 has not written yet, so nothing is wasted.

---

## 1. Rollback — §6.1 `dispatch()` is wrong

The review is correct, and this is the most serious item. As written, `dispatch()` mutates through the handler, then validates, then throws on failure. **Yjs does not roll back a transaction when it throws.** The mutations are already applied. So the failure path leaves a corrupt magazine — precisely what RULES §4.3 forbids.

Two changes, both needed.

### 1a. Handlers validate completely before mutating

This is the primary defence and it is already RULES §4.3. Make it explicit in the handler contract:

> A handler performs **every** check before its first mutation. Once it has mutated, it must run to completion. A handler that discovers a problem halfway through is a handler with a bug in its precondition checks.

A correct handler never produces an invalid magazine. Post-hoc validation exists to catch handler bugs, not to guard against expected failure.

### 1b. Mechanical rollback for when a handler is wrong anyway

Handlers will have bugs. Give the transaction a real undo path using Yjs's own machinery:

```ts
const DISPATCH_ORIGIN = Symbol('mb-dispatch');

/** Tracks only our own transactions, so external changes are never reverted. */
const rollback = new Y.UndoManager(root, {
  trackedOrigins: new Set([DISPATCH_ORIGIN]),
  captureTimeout: 0,          // one transaction = one revertible unit
});

export function dispatch(cmd: Command): DispatchResult {
  const handler = registry.get(cmd.type);
  if (!handler) return { ok: false, reason: 'unknown-command' };

  let result: CommandResult | undefined;

  doc.transact(() => {
    result = handler(draft, cmd.payload);
  }, DISPATCH_ORIGIN);

  if (!result) return { ok: false, reason: 'handler-produced-nothing' };

  if (config.validateAfterCommand) {
    const errors = validateMagazine(draft);
    if (errors.length > 0) {
      rollback.undo();                    // mechanical, not semantic
      throw new InvariantError(
        `${cmd.type} produced an invalid magazine: ${errors[0].message}`
      );
    }
  }

  history.push({ command: cmd, inverse: result.inverse });
  return { ok: true, dirty: result.dirty };
}
```

**`rollback` is not the undo feature.** It is a safety net for handler bugs. The user-facing undo is `history`, which stores commands and their inverses — because that is what the AI phase needs to emit later, and what gives semantic coalescing.

The two must not be confused. Add to the handler contract:

> `history` is semantic undo. `rollback` is transaction safety. Never expose `rollback` to the UI, and never use `history` to recover from a handler bug.

---

## 2. `import.meta.env.DEV` — §6.1

Correct. `import.meta.env` is a Vite construct. `packages/mb-commands` must run under Node for the headless test, where that expression is a syntax-level failure.

Configure explicitly at setup:

```ts
// packages/mb-commands/src/config.ts
export interface DispatchConfig {
  /** Run validateMagazine after every command. Costly — off in production. */
  validateAfterCommand: boolean;
}

let config: DispatchConfig = { validateAfterCommand: false };

export function configureDispatch(next: DispatchConfig): void {
  config = next;
}
```

```ts
// apps/web/src/magazine-builder/shell/bootstrap.ts
configureDispatch({ validateAfterCommand: import.meta.env.DEV });

// packages/mb-commands/test/headless-build.test.ts
configureDispatch({ validateAfterCommand: true });   // always on in tests
```

**General rule for `packages/mb-*`: no bundler-specific globals.** No `import.meta.env`, no `process.env`, no `window`. Anything environmental is injected. These packages run in the browser, in Node tests, and potentially in the worker.

---

## 3. `overflow: 'shrink'` has no fitted size — §5.3

A real gap. If a box shrinks text to fit, the resulting size has to live somewhere, and I never said where.

**It does not go in the document.** Fitted size is derived from box dimensions and content, so storing it makes it a second source of truth that goes stale the moment either changes. The old model stored the fitted `fontSize` on the element alongside `maxFontSize` and `minFontSize`, which is exactly why its text behaviour is hard to reason about.

It belongs in `ThreadLayout`, recomputed with everything else:

```ts
export interface ThreadLayout {
  slices: Map<Id, StorySlice>;
  /** Per box: the scale applied to reach a fit. 1 = no shrinking. */
  fontScale: Map<Id, number>;
  overflowParagraphs: number;
}
```

The document keeps only the *intent* and the legibility floor:

```ts
export interface TextBox extends ItemBase {
  // ...
  overflow: 'warn' | 'shrink';
  /** Floor for 'shrink'. Below this, stop shrinking and warn instead. */
  minFontScale: number;        // 0.7 is a sensible default
}
```

`minFontScale` matters for our users specifically — unbounded shrink-to-fit produces 6pt text that an 80-year-old cannot read, and silently. When shrinking hits the floor and still does not fit, fall back to the TXT-12 warning.

---

## 4. `?version=draft` on a public route — §9.6

Correct, and a real security defect. `/m/:publishId?version=draft` would let anyone read unpublished work by guessing a query parameter.

The publish job must not use the public route at all. Add a separate render route, gated by a signed token:

```
GET /internal/render/:magazineId?token=<signed>
```

- The token is an HMAC over `{ magazineId, exp }` using `JWT_SECRET`, with a 5-minute expiry.
- The publish job mints it and passes it to Puppeteer.
- The route is not linked, not in the client bundle, and returns 404 without a valid token.
- It renders the **current draft**; `/m/:publishId` renders only published versions and accepts no version parameter at all.

That keeps the two surfaces separate by construction rather than by a query-parameter check somebody can forget.

---

## 5. The shell contract — restore from v0.1 §8

My error. I compressed v0.2 and dropped it, but lanes register into these slots, so without it every lane invents its own structure.

Restore in full as **§8.5**:

```ts
export type ToolbarSlot =
  | 'file'        // new, save state, publish
  | 'undo'        // GL-06 — always visible, never moves
  | 'insert'      // add text, photo, shape
  | 'arrange'     // align, order, lock, group
  | 'zoom';       // DOC-08

export type PanelSlot =
  | 'pages'       // left sidebar   — Lane 4
  | 'properties'  // right sidebar  — the selected item's controls
  | 'library';    // right sidebar  — photo library, Lane 3

export function registerToolbarItem(slot: ToolbarSlot, item: ToolbarItem): void;
export function registerPanel(slot: PanelSlot, panel: PanelDef): void;
```

**GL-09 — controls are disabled, never removed or moved.** Selecting a different item type changes which controls are *enabled*. It never changes which are *present* or where they sit. Our users navigate by position; a toolbar that reshapes itself forces re-orientation every time.

Selection state lives in Zustand, not in the magazine — it is per-user and must never be saved:

```ts
export interface SelectionState {
  itemIds: Id[];
  textRange: { storyId: Id; start: number; end: number } | null;
  hoveredId: Id | null;        // ARR-02
}
```

`hoveredId` is here because ARR-02 requires hover feedback and FWD-07 requires selection to be readable as data.

---

## 6. The user-facing unit — new §5.7

Correct, and a genuine gap. The document stores pixels. Pixels are meaningless to someone laying out a newsletter, and "px" is jargon under GL-08.

Follow the convention people already know from word processors:

| What the user sees | Unit | Why |
|---|---|---|
| Position, size, margins, spacing | **millimetres** | What they'd measure a printed page in |
| Text size | **points** | What Word and every print context uses |
| Outline and line thickness | **points** | Consistent with text |

```ts
// packages/mb-schema/src/units.ts

/** Page canonical space is 150 DPI. */
export const DPI = 150;
export const PX_PER_MM = DPI / 25.4;      // 5.9055...
export const PX_PER_PT = DPI / 72;        // 2.0833...

export function pxToMm(px: Px): number { return px / PX_PER_MM; }
export function mmToPx(mm: number): Px  { return mm * PX_PER_MM; }
export function pxToPt(px: Px): number  { return px / PX_PER_PT; }
export function ptToPx(pt: number): Px  { return pt * PX_PER_PT; }
```

**Rules:**

- Conversion happens **only at the UI boundary**. Nothing inside `mb-schema`, `mb-commands`, or `mb-store` ever sees millimetres or points.
- Displayed values round to one decimal for millimetres and whole numbers for points. Never show `47.3821`.
- Add to the RULES §9 vocabulary list: **never say** pixels, px, DPI, points-as-a-position → **say** millimetres for measurements, and just "size" for text.
- An inches setting can follow later. Millimetres only for v1, per the English-only decision.

---

## 7. Accepted — §9.6 job type placement

Correct. `JobPayloads` for `publishMagazine` goes in `apps/server/src/lib/magazineBuilder/jobs.ts`, mirroring the existing pattern where the server declares job types and payloads and the worker registers handlers against them.

---

## 8. Accepted — two threaded boxes in the first session

Correct, and the better call. §12's slice becomes:

- Schema, store, dispatch, undo
- The page renderer drawing one page
- Select, hover feedback, move, resize
- **Two threaded text boxes** — type in the first, watch it overflow into the second
- Add a photo from the computer
- Save to Mongo and reload

Threading is the highest-risk thing in the product and the main differentiator. Proving the measure-and-split loop in the first session is worth more than proving a single text box, which we already know works.

If the split loop turns out to be wrong, that is a foundation problem — and finding it in session one rather than after five lanes have built on it is the entire point of the vertical slice.

---

## Summary

| # | Item | Severity |
|---|---|---|
| 1 | Yjs does not roll back on throw | **Serious** — corrupts the document |
| 2 | `import.meta.env` breaks Node tests | Blocks the headless test |
| 3 | Fitted size has nowhere to live | Design gap |
| 4 | Draft exposed on a public route | **Security** |
| 5 | Shell contract missing | Every lane would invent its own |
| 6 | User-facing unit unnamed | Would surface pixels to users |
