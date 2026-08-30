# Lane 1 — Amendment 1, and four cross-lane decisions

**Amends:** LANE-1-INTERACTION.md
**Also changes:** FOUNDATION (renderer contract, batch dispatch), Requirements Amendment 1 (panel API), ARR-05, ARR-12
**Keep unchanged:** §5, §7, §11 of the Lane 1 document

Four of these are not Lane 1 problems. They are contracts I specified wrongly, and they affect every lane.

---

## Part A — Cross-lane. Decide before Lane 0 finishes `mb-commands`

### A1 — The renderer needs a preview channel

**The problem is real.** Lane 1 §7.2 says "update a local transform during the gesture; dispatch on release", but `PageRendererProps` is `{ page, magazine, threadLayout, mode }` and Lane 1 may not modify the renderer. There is no way to draw an item somewhere other than where the document says.

It also contradicts FOUNDATION §6.5, which specifies the opposite: dispatch per move, coalesce for undo.

**Decision: add a preview channel, and keep coalescing for a different case.**

```ts
export interface PreviewTransform {
  dx?: Px;  dy?: Px;
  dw?: Px;  dh?: Px;
  dRotation?: number;
}

export interface PageRendererProps {
  page: Page;
  magazine: Magazine;
  threadLayout: ThreadLayout;
  mode: 'edit' | 'read';
  /** Ephemeral gesture offsets. Applied on top of document values. */
  preview?: ReadonlyMap<Id, PreviewTransform>;
}
```

This does not break the renderer's read-only contract. Preview is per-user ephemeral state, the same class as selection, which already lives outside the document.

**Where each mechanism applies:**

| Gesture | Mechanism | Why |
|---|---|---|
| Pointer drag, resize, rotate | Preview, one dispatch on release | Text relayout during a resize is expensive; preview avoids it entirely |
| Held arrow key | Dispatch per repeat, `coalesceKey` | Discrete events, no continuous stream, coalescing is exactly right |
| Slider drag in a panel | Dispatch per change, `coalesceKey` | No renderer preview path, and the values are cheap |

Coalescing does not go unused — it moves to the cases it fits. FOUNDATION §6.5's example should be changed from "a drag" to "a held arrow key".

**Owner:** Lane 0. Small change, but it blocks Lane 1 steps 3, 5, 7 and 8.

### A2 — Batch inverse. Two patterns, one for each case

**The problem is systemic**, as the review says: no command touching N entities can currently be undone. It hits `items.align`, `items.distribute`, `items.ungroup`, `items.copyLook`, and Lane 2's `text.setRunOverride`.

Two distinct shapes, and they need different answers.

**Pattern 1 — one command, N entities of the same kind.** Optional `restore` on the payload, as `text.splitParagraph` already does:

```ts
export interface AlignPayload {
  itemIds: Id[];
  edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
  /** Present only when this command is serving as its own inverse. */
  restore?: Array<{ itemId: Id; x: Px; y: Px }>;
}
```

When `restore` is present the handler applies those positions verbatim and ignores `edge`. Same for `distribute` and `ungroup`.

**Pattern 2 — a compound operation spanning lanes.** Add batch dispatch to Lane 0:

```ts
export function dispatchBatch(commands: Command[]): DispatchResult;
```

All commands apply inside one `produce()`, producing **one history entry** whose inverse is the reversed list of inverses. Any rejection rejects the whole batch and commits nothing.

This does not violate FOUNDATION §6.4's "never dispatch from inside a handler" — composition happens in the caller, which is exactly what that rule asks for.

`dispatchBatch` also solves pasting a multi-selection, which is otherwise N undo entries.

**Owner:** Lane 0. Blocks Lane 1 steps 9, 13, 14, 15 and Lane 2's `text.setRunOverride`.

### A3 — The panel option API cannot express "all types"

**Correct, and my error.** `registerPanelOption(section, itemType: Item['type'], option)` is keyed by one type. A mixed selection has no key, and Lane 1's nine arrange and position controls would need 36 registrations.

```ts
export function registerPanelOption(
  section: PanelSection,
  itemTypes: Array<Item['type']> | 'all',
  option: PanelOption
): void;
```

**Resolution for a mixed selection:** show options registered for `'all'`, plus options registered for *every* type in the selection. That produces the rule Lane 1 §7.3 wanted — common options only — as a consequence of the API rather than a separate check.

Lane 1 registers its arrange and position options once with `'all'`.

**Owner:** Lane 0 shell. Amends Requirements Amendment 1.

### A4 — QA-06: a group's frame is stored, and an invariant keeps it honest

**The review is right that Lane 1 §7.4 decided an open QA item in a bullet.** Two things need separating.

**Is `Group.frame` stored or derived?** `Group extends ItemBase`, so it is stored. Hit testing, selection, and the panel all need it, and deriving it on every read is worse.

That is not the harmful kind of computed state. `ThreadLayout.fontScale` is harmful because it depends on measurement that changes under it. A group's frame depends only on its children, which only change through commands.

**Make it checkable rather than driftable — invariant 13:** a group's frame equals the bounding box of its children.

**Who owns group resize?** Lane 0, because `item.resize` is Lane 0's handler and a group is an item. Its behaviour on a group:

- Scale each child's frame proportionally to the group's frame change
- **Geometry only — never type size**
- Recompute the group frame afterwards so invariant 13 holds

Lane 1 §7.4's semantics move into Lane 0's specification. Lane 1 dispatches `item.resize` and gets the behaviour.

**QA-07 — a thread chain crossing a group boundary.** Allowed, and it needs no special handling: thread links are by id, not by containment. Deleting a group deletes its children, and each child deletion runs `item.delete`'s existing chain repair. State this so nobody invents a restriction.

**Owner:** Lane 0. Blocks Lane 1 step 14.

---

## Part B — Lane 1 changes

### B1 — `items.copyLook` is not a command

**Correct, and it is exactly the escape hatch D-11 narrowed `item.setProps` to prevent.** One command writing shape fills and text formatting, with Lane 1 mutating text that §3 forbids it from touching.

**It becomes a UI action** that reads the source item and builds a list of the owning lanes' typed commands, dispatched through `dispatchBatch` (A2).

| Source and target | Commands composed | Owner |
|---|---|---|
| Shape → shape | `shape.setFill`, `shape.setStroke`, `shape.setCornerRadius` | Lane 5 |
| Text → text | `text.setLook`, `text.setParagraphOverride` | Lane 2 |
| Photo → photo | `photo.setCornerRadius`, `item.setProps` for opacity | Lane 3 |
| Mixed | Only what they share — opacity, rotation | Lane 0 |

`items.copyLook` disappears from §8's command list. Add a seam row for text-to-text with Lane 2, which §10 was missing.

### B2 — "Keep the shape" is session-only UI state

`Photo` has no proportion-lock field and `ItemBaseProps` is `frame | rotation | opacity | locked`.

**Decision: session-only.** The toggle lives in Zustand alongside selection and resets when a different item is selected. Photos default to locked proportions; the toggle releases it for the current gesture.

A persistent per-photo proportion lock is a concept users do not need, and adding a schema field for it is not worth the cost.

**ARR-05's wording needs amending** — "unless the user explicitly unlocks them" reads as persistent. It should say the toggle applies while the item is selected.

### B3 — ARR-12 is within-magazine only for v1

**The review is right that this is the largest undeclared work in the document**, and I would not build it.

Copying between magazines means serialising an item with everything it depends on and remapping into a different document: a `TextBox` needs its `Story` and a `lookId` that resolves in the destination's `looks` (invariant 5); a `Photo` needs its `AssetRef` re-registered, and `mbAssets` rows are scoped `{ ownerId, magazineId }`. That reaches Lane 3 and Lane 6.

**The main use case is already served.** "This month from last month's issue" is DOC-11, duplicate — which copies everything and needs no remapping.

**Amend ARR-12's Done-when** to "items copy correctly between pages", and record cross-magazine copy as a later requirement.

If it turns out to be genuinely wanted, it is a feature with its own design, not a clause in an acceptance criterion.

### B4 — ARR-11 moves to step 5

**Correct.** Nine requirements that must respect locking currently ship before it, and under RULES §6.2 none of them is "finished completely" without the marker, the GL-12 message, and the drag-rectangle exclusion.

Revised order: 1 ARR-01 · 2 ARR-02 · 3 ARR-04 drag · 4 ARR-04 keyboard · **5 ARR-11 lock** · 6 ARR-05 · 7 ARR-07 · 8 ARR-06 · 9 ARR-03 · 10 ARR-08 · 11 ARR-10 · 12 ARR-12 · 13 ARR-09 · 14 ARR-13 · 15 ARR-14

Command rejection already exists in Lane 0's handlers, so enforcement is nearly free. What Lane 1 owns is the visible half.

### B5 — §13 replaced with real blockers

The review is right that the previous three were decisions I had already made. The template is wrong, not just this instance: **a blocker is something that stops work, not a request to confirm a call.**

| # | Blocker | Owner |
|---|---|---|
| 1 | Renderer preview channel (A1) — steps 3, 5, 7, 8 cannot be built without it | Lane 0 |
| 2 | Batch inverse (A2) — steps 9, 13, 14, 15 cannot be undone without it | Lane 0 |
| 3 | Panel option API for `'all'` (A3) — the shell cannot express mixed selection | Lane 0 |
| 4 | QA-06 group frame and resize ownership (A4) — step 14 | Lane 0 |
| 5 | Click behaviour — select then edit. Needs a requirements amendment; Lane 2 needs the same answer | Product |

Blockers 1 to 4 are all Lane 0's and should go in together, before `mb-commands` is finished.

### B6 — Read-first list corrected

```
RULES.md + Amendment 1
FOUNDATION v0.3          — intent and architecture
BLOCKERS.md              — before starting any requirement
QA-LOG.md                — before extending any package
Requirements v2.0 + Amendment 1 + this amendment
```

**The code is authoritative over v0.3 for type signatures.** `CommandResult` is now `CommandApplied | CommandRejected`; `CreateItemPayload` gained `story?`; `DisconnectBoxPayload` gained `newStoryId`. Read `packages/mb-schema` and `packages/mb-commands` for the current surface. v0.3 is authoritative for *intent* and for anything the code has not yet reached.

This applies to every lane document, not only Lane 1.

---

## Part C — Smaller corrections

**Units.** §9 must use `parseMm` and `parsePt` per QA-09. **Formatted output is never a write source** — a controlled React input that reads back its own formatted value is the bug that finding names.

**Nudge is 1mm**, which is 5.9055px. State the number. ARR-04's "all three produce identical results" and ARR-09's "within one unit" both depend on it being fixed, and rounding to whole pixels would break both.

**Reflow during or after a resize gesture.** ARR-05's Done-when reads as during; Lane 1 §7.2 and Lane 2 §11 both suggest after. **Decide: during, using preview.** With A1's preview channel the box outline follows the pointer immediately and text relayout runs at a throttled interval — 60ms is imperceptible for reflow while the outline stays at 16ms. Settle it jointly with Lane 2 rather than each lane choosing.

**Principle 6 must be addressed in the click amendment.** It forbids "double-click-to-edit" by name, and principles override features. The argument the review supplies is the strongest one and should be in the amendment: TXT-02's Done-when is entirely about paste fidelity, so amending the click sentence costs no acceptance criteria — and ARR-01's "A single click selects" is satisfied unchanged.

**"Changing page" needs defining.** The renderer is a virtualised continuous scroll, so §10's "clear selection on page change" has no trigger. **Decide: selection clears when the selected item scrolls fully out of view**, not on any page boundary. Simpler, and it matches what a continuous scroll makes visible.

**The Arrange section is deliberately widened.** Lane 0's definition is "order, lock, group"; Lane 1 adds align, space evenly, and copy look. That is right — they belong together — but say so, so Lane 7's section audit does not flag it as drift.

---

## What stands unchanged

§5, §7 and §11 of the Lane 1 document.

§7.1's snapping specification in particular — the priority order, the zoom-scaled threshold, and the intent-tracking rule that releases a snap once the pointer moves deliberately past it. That last one is the difference between snapping that helps and snapping that fights, and it is not in Canva.
