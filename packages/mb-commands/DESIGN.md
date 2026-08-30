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

---

## Addendum — decisions taken during the build

The note above was written before the code and is left as it was. These are the things the
build itself forced, recorded here rather than by rewriting history.

**Two more inverse-payload variants.** `restore` on `item.move`, `item.resize` and
`item.rotate`, and `order` on `item.reorder`. Same reason as the original three: an inverse has
to reproduce the *original value*. Regenerating a fractional key between the same neighbours is
a valid key but not the same string, and undoing a group resize by scaling by the reciprocal
ratio drifts by an ulp per round trip — LANE-1 §12 gate 5 allows none. The undo property test
compares whole documents, so both shortcuts fail it rather than passing quietly.

**`item.setProps` writes one field.** `ItemBaseProps` narrowed to `Pick<ItemBase, 'opacity'>`,
resolving D-11. Frame and rotation need handlers that transform a group's descendants; `locked`
gates those handlers. Narrowed at the type level rather than rejected at runtime — a payload
that permits what the handler refuses is the "rule reads stronger than it enforces" failure.

**A group's own frame and rotation are descriptive, not applied.** Children hold all geometry in
page space and the renderer draws them there. `Group.frame` is the children's bounding box,
maintained by the transform commands; `Group.rotation` records the accumulated turn for the
panel. Applying both would turn every child twice. This makes ungrouping exact by construction:
it moves children into the parent array and changes no coordinates.

**D-22 enforced at connect time.** `text.connectBox` refuses two boxes with different enclosing
groups. Refusing where a chain is *formed* rather than at every point one might be disturbed
means `item.delete` and Lane 1's group commands need no chain-repair logic at all. Not yet an
invariant — see BLOCKERS.

**`text.disconnectBox` hands the downstream boxes a new empty story**, and `item.delete` takes
the story with the last box showing it. Both keep the inverse exact and stop stories being
stranded.

**A fifteenth file in `commands/`.** `commands/index.ts` does the registering, so handlers stay
plain functions that a test can call without a registry, and one import is the whole
registration — no "was the module imported" failure mode under lazy bundling.

## What is not here

`internal/threads.ts` reads chains; it does not lay them out. Thread layout — measuring where a
story overflows and computing split points — is `mb-render`'s, and Lane 2 consumes it. Nothing
in this package computes or stores a derived value.
