# mb-commands — design note

**Lane 0, step 3.** Written before the code, per LANE-0 §4. Locked once building starts.

## What it is

The only write path to a magazine (ADR-003). A command is typed data carrying its own
inverse; `dispatch()` applies it through Immer, validates, commits, and records history.
Fourteen foundation commands. Lanes register their own alongside.

## Consumers

`mb-store` (satisfies the store contract), the shell, all six feature lanes, and — later —
the AI phase, which will emit exactly these commands (FWD-02).

## The one architectural correction

**FOUNDATION §6.2's sample has `dispatch()` referencing `store.current` and
`store.commit()`, but §4 says `mb-commands` imports `mb-schema` only.** As written it
would import `mb-store`, which imports `mb-commands` — a cycle, and CI fails on cycles.

Resolved by injection, the same way `configureDispatch` already handles environment.
`mb-commands` declares a minimal structural interface:

```ts
export interface CommandStore {
  readonly current: Magazine;
  commit(next: Magazine): void;
}
```

`mb-store`'s `Store` is a superset, so it satisfies this without either package importing
the other. The import direction in §4 is correct; only the sample code was wrong.

## Decisions

**Payload variants over extra commands.** Three payloads carry an optional field that
switches them between "normal use" and "serving as an inverse" — `order` on `item.create`
(D-17), `runs` on `text.insert`, and `restore` on `text.splitParagraph` (FOUNDATION §6.7).
This is the pattern the specification already chose for `splitParagraph`; using it
consistently keeps the surface at fourteen commands rather than seventeen, and seven lanes
read this surface.

`text.insert` needs it because deleting a span that crossed runs with different formatting
cannot be undone by inserting plain text — the inverse has to carry the runs verbatim.

**`item.create` carries the story.** A `TextBox` references a story that must already
resolve (invariant 1), so creating the first box and creating its story cannot be two
commands — `validateStructure` runs after *every* command and would fire on the state
between them. The payload takes an optional `story`, and `item.delete` puts it back.

**`NewItem` distributes.** `Omit<Item, 'order'>` collapses the discriminated union: `keyof`
over a union is the *intersection* of keys, so every type-specific field is silently
dropped and a text box loses `storyId`. Verified against the compiler. The type is
`T extends unknown ? Omit<T, 'order'> & { order?: OrderKey } : never`.

**Handlers reject; they do not throw.** A locked item (ARR-11) or a merge with no preceding
paragraph is an expected refusal, not a bug — it returns `{ rejected }` and nothing
commits. `InvariantError` is reserved for a handler that produced an invalid document,
which is always a defect.

**Coalescing keeps the first inverse and the last command.** A drag emits dozens of
`item.move`; merging them means undo returns to before the gesture began and redo lands on
the final position. Keeping the last inverse instead would undo one pixel.

**Undo does not re-record.** Applying an inverse runs the same validate-and-commit path
with recording switched off, then moves the entry to the redo stack. Without that,
undoing would push the inverse as a new entry and the stack would grow forever.

## Files

`types.ts` `errors.ts` `config.ts` `registry.ts` `history.ts` `dispatch.ts` ·
`internal/{find,order,runs,threads}.ts` · `commands/*.ts` (14) · `index.ts`

## Tests

`headless-build.test.ts` — builds a magazine with `dispatch()` alone, no DOM. The FWD-02
guarantee, and the most important test in the codebase.
`undo.property.test.ts` — fifty random commands, fifty undos, deep-equal to the start.
Per-command tests for inverses, rejections, and order-key placement.

## Rejected

**A thirteenth `item.restore` command.** It would reproduce a deletion exactly, but
"restore" is not a thing users do — undo is — and a second mechanism for the same idea is
one more thing seven lanes each interpret once.

**Dispatching from inside handlers to compose.** FOUNDATION §6.4 forbids it and it would
break coalescing and the inverse contract. Composition happens in the caller.
