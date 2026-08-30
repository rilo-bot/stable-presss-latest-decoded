# Lane 1 — Interaction

**Starts after:** the vertical slice
**Read first:** RULES.md + Amendment 1 · FOUNDATION v0.3 · Requirements v2.0 + Amendment 1 · LANE-0-FOUNDATION.md §4 for the working cycle

---

## 1. Your role

You own how it *feels*. Selecting, dragging, resizing, turning, aligning, layering, locking — everything a user does directly to something on the page.

Every other lane changes properties through panels. You are the only lane where the user manipulates the page itself, which means two things:

**You are the product's texture.** A drag that stutters, a handle that is hard to grab, a selection outline invisible against a photo — those are the things people describe when they say software feels bad. Nobody says "the alignment command has poor semantics."

**You set the interaction conventions every other lane inherits.** Whatever you decide about click behaviour, hover, and multi-selection becomes how the whole editor works.

**You are also the lane most in tension with the requirements.** Canva's interaction model is dense and drag-heavy; ours must work for someone with a tremor, on a trackpad, at 200% zoom, without a mouse at all. Section 5 is about holding both.

---

## 2. What you own

```
apps/web/src/magazine-builder/features/interaction/
  types.ts  constants.ts
  commands/       alignment, distribution, grouping
  components/     selection overlay, handles, guides, arrange panel
  hooks/          useDrag, useResize, useRotate, useSnapping
  index.ts        registration only
```

## 3. What you must not touch

- `packages/mb-*` — Lane 0's. The renderer reports pointer events; you decide what they mean. Never modify it.
- Any other `features/` directory
- The shell or the panel structure
- `item.move`, `item.resize`, `item.rotate`, `item.setProps`, `item.reorder`, `item.setLocked` — **Lane 0 already owns these.** You dispatch them; you do not write them.

That last point shapes your lane: much of what you do is dispatching commands that already exist. Your work is the interaction *layer* — hit testing, gesture handling, snapping, feedback — not the mutations.

---

## 4. Two decisions you must settle first

Both come from Lane 2 and both are yours to own, because you own selection.

### 4.1 Click behaviour — TXT-02 needs amending

**Decide: first click selects, a later click enters editing.** This is Canva's model and it is right.

TXT-02 currently says *"A single click on existing text places a cursor."* That contradicts, and it is the weaker option: once a layout is set, moving a box is more common than editing it, and accidentally entering edit mode when you meant to move is worse than the reverse.

**This does not violate GL-05.** There is no timing window — the second click can come ten seconds later. Two independent clicks are not a double-click.

**Consequence for you:** a text box has two selection states — *selected* (handles, movable) and *editing* (caret, text selection). Escape leaves editing and returns to selected. Clicking elsewhere leaves both.

Raise the amendment; do not diverge silently.

### 4.2 Overlap — who may sit on top of what

Lane 2 needs this for "Make this box bigger", and it is a general rule you own.

**Decide: items may overlap freely, except that an automatic action never overlaps a locked item.**

Canva-style layouts overlap constantly — text over photos, shapes behind headings — and forbidding it would make the product useless. But locking means *"do not disturb this"*, so anything the system does on the user's behalf must respect it. A user dragging something over a locked item manually is fine; that is their choice.

---

## 5. Following Canva, within our constraints

Canva is the reference. Where our requirements bind tighter, both must be satisfied — never one at the other's expense.

| Behaviour | Canva | Ours |
|---|---|---|
| Select | Single click | Same |
| Multi-select | Shift-click, or drag a rectangle | Same, **plus** "Select everything on this page" — GL-04 needs a non-drag route |
| Move | Drag | Same, **plus** arrow keys and typed position |
| Resize | Corner and edge handles | Same, **plus** typed width and height |
| Proportions | Corner keeps proportions for images | Same. Photos cannot be stretched by a corner unless explicitly unlocked. |
| Turn | Handle below the selection | Same, **plus** typed degrees. Modifier snaps to 15°. |
| Snapping | Guides appear during drag, gentle snap | Same. Threshold 6px at 100%, scaled by zoom. |
| Hover | Outline appears under the pointer | Same — ARR-02 requires it |
| Context menu | Right-click | **Additional only.** Everything must be reachable without it (GL-03). |
| Nudge | Arrow keys | Same. 1 unit, 10 with modifier. |

**Two places we deliberately differ:**

**Handles are bigger.** Canva's are roughly 8px. GL-01 requires 14px minimum for selection handles. At 50% zoom a Canva handle is 4px on screen, which is unusable with a tremor.

**Nothing appears only on hover.** Canva reveals controls on hover over an item. GL-03 forbids it — hover gives *feedback*, never *function*. Everything lives in the panel or the toolbar, always visible.

---

## 6. Build order

| # | Requirement | Note |
|---|---|---|
| 1 | **ARR-01** Select | Everything depends on it |
| 2 | **ARR-02** Hover feedback | Cheap once hit testing works, and immediately makes the product feel alive |
| 3 | **ARR-04** Move — drag | The core gesture |
| 4 | **ARR-04** Move — keyboard and typed | GL-04's second route. Do not defer it. |
| 5 | **ARR-05** Resize and reshape | Including proportion locking for photos |
| 6 | **ARR-07** Lining-up guides | Needs move and resize to exist |
| 7 | **ARR-06** Turn | |
| 8 | **ARR-03** Multi-select | Changes selection state shape — do it before things depend on single selection |
| 9 | **ARR-08** Align several items | Needs multi-select |
| 10 | **ARR-10** Bring to front, send to back | |
| 11 | **ARR-12** Copy, paste, duplicate, delete | |
| 12 | **ARR-11** Lock | |
| 13 | **ARR-09** Space evenly | |
| 14 | **ARR-13** Group | Transform maths across mixed types — the hardest arrange feature |
| 15 | **ARR-14** Copy the look | Last |

**Step 4 is where lanes usually cheat.** Building drag and deferring the keyboard route means GL-04 gets retrofitted badly. Do them together — the keyboard path is a different entry point into the same command.

---

## 7. The hard parts

### 7.1 Snapping and guides — ARR-07

The single biggest contributor to output looking designed rather than assembled. Users do not align things by eye; snapping does it for them.

**Snap targets, in priority order when several are within threshold:**

1. Page margins
2. Column guides
3. Other items' edges — left, right, top, bottom
4. Other items' centres — horizontal and vertical
5. Equal spacing between three or more items

**Threshold:** 6px at 100% zoom, divided by zoom factor so it feels constant. At 200% zoom the snap distance in document units halves.

**Guides render only during the gesture** and vanish on release. A guide left on screen reads as part of the design.

**Equal-spacing detection is what makes layouts look professional.** When dragging a third item into line with two others, detect that the gaps would match and snap to it, showing the matched gaps. This is the feature people notice without being able to name.

**Snapping must not fight the user.** If they move deliberately away from a snap point, do not pull them back. Track intent: once the pointer has moved more than the threshold past a snap, release it and do not re-acquire until the pointer leaves the vicinity.

### 7.2 Latency — GL-17

Under 16ms at p95, from pointer event to paint, on a 24-page magazine. This is a requirement, not an aspiration, and it is easy to fail.

**What breaks it:**

- Dispatching a command per pointer move. **Do not.** Update a local transform during the gesture; dispatch once on release, or on a coalesced interval.
- Re-rendering the whole page. Use Immer's structural sharing — an unchanged page keeps its object reference, so reference equality is enough.
- Recomputing snapping against every item every frame. Build the candidate list once at gesture start.
- Relayout of text during a resize. Lane 2's thread layout is expensive. Consider relayout on drag end rather than per frame.

**Measure it early**, not at the end. Add a latency assertion to your tests with a realistic fixture.

### 7.3 Multi-selection — ARR-03

Changes the shape of everything. Do it at step 8, not step 15.

**Three routes, per GL-04:**

- Shift-click to add or remove
- Drag a rectangle around items
- "Select everything on this page"

The drag rectangle is the *additional* route. Shift-click and select-all must be sufficient alone.

**The bounding box of a multi-selection** is what gets moved, resized, and turned. Resizing a multi-selection scales each item's frame proportionally — including font sizes? **No.** Scale geometry only; leave type size alone. Scaling text on group resize surprises people and produces inconsistent sizes across a document.

**Mixed selections and the properties panel.** Per Requirements Amendment 1, a mixed selection shows only options common to every selected type — position, colour, arrange. Appearance is shown and disabled. **This is yours to confirm**, since you own ARR-03.

### 7.4 Grouping — ARR-13

The hardest arrange feature, because transform maths differs per item type and groups can nest.

- A group's frame is the bounding box of its children
- Moving a group moves children by the same delta — simple
- Resizing a group scales each child's frame proportionally — geometry only, never type size
- Turning a group rotates children *about the group's centre*, which changes both their position and their own rotation
- Ungrouping must restore exact positions, sizes, and rotations

**Test the round trip specifically:** group, move, resize, turn, ungroup — and confirm items land where they visibly appeared. Floating-point drift accumulates here.

### 7.5 Selection visibility — ARR-01

The outline must be visible against white, black, and a busy photograph. A single-colour outline fails against at least one.

The standard solution is a two-tone outline — a light line with a dark one beneath, or a dashed pattern alternating both. Test against all three backgrounds explicitly; it is in your gate.

Handles at 14px minimum (GL-01), and they must stay 14px **on screen** regardless of zoom — a handle that scales with the document is 3px at 25% zoom.

---

## 8. Commands you register

Most manipulation commands are Lane 0's. Yours are the arrange operations:

```ts
items.align        { itemIds: Id[], edge: 'left' | 'center' | 'right'
                                        | 'top' | 'middle' | 'bottom' }
items.distribute   { itemIds: Id[], axis: 'horizontal' | 'vertical' }
items.group        { itemIds: Id[], groupId: Id }
items.ungroup      { groupId: Id }
items.copyLook     { fromId: Id, toIds: Id[] }
```

**`items.group` takes a caller-supplied `groupId`** so its inverse — `items.ungroup` — can name it, and so ungroup's inverse can recreate the same group.

**`items.align` inverses to a list of positions**, not to another align. Aligning six items left cannot be undone by aligning them somewhere else; the inverse must restore each item's original position. Carry them in the inverse payload.

Same for `items.distribute`.

**`items.copyLook` is not text-specific.** It copies fill, stroke, corner radius, and opacity between shapes, and text formatting between text boxes. Between different types, it copies whatever they share.

---

## 9. Panel options

You register into the **Arrange** section — a fixed section for every item type, per Requirements Amendment 1.

| Weight | Option | Visible |
|---|---|---|
| 10 | Order — front, forward, backward, back | Yes |
| 20 | Align — six buttons | Yes |
| 30 | Lock | Yes |
| 40 | Group, ungroup | Yes |
| 50 | Space evenly | Yes |
| 60 | Copy the look | Yes |

Six options, within GL-15's cap of seven. No "More settings" needed.

You also register into **Size & position**:

| Weight | Option |
|---|---|
| 10 | Position — X and Y in millimetres |
| 20 | Size — width and height in millimetres, with a keep-the-shape toggle |
| 30 | Turn — degrees |

**Position and size are typed in millimetres, turn in degrees.** Conversion happens here, at the UI boundary, using `mb-schema`'s helpers. Never show pixels (GL-08).

---

## 10. Seams with other lanes

| Lane | Seam | Resolution |
|---|---|---|
| 2 | Click behaviour — select versus edit | **Yours.** §4.1. Settle it before either lane builds. |
| 2 | Resizing a text box reflows its chain | You call Lane 2's relayout; watch GL-17 |
| 2 | Selection inside text versus of the box | Two selection states. §4.1. |
| 3 | Moving a photo with wrap reflows text | You move; Lane 3 triggers relayout |
| 4 | Selection when changing page | Clear selection on page change |
| 4 | Items in a repeating background | Not selectable on child pages. Lane 4 decides how they are edited. |
| 5 | Copy the look between shapes | Shared implementation — coordinate through Lane 0 rather than duplicating |

---

## 11. Traps

**Do not dispatch per pointer move.** The single most likely way to fail GL-17. Local transform during the gesture, one coalesced command on release.

**Handles scale with zoom if you let them.** They must be constant on screen. Compute size in screen pixels and divide by zoom for the document-space hit area.

**Locked items must resist everything.** Move, resize, turn, delete, and being caught in a drag rectangle. And GL-12 requires telling the user *why* — silently doing nothing reads as broken software.

**Rotated items break naive hit testing.** A rotated frame's bounding box is not the frame. Transform the point into item space before testing.

**Group resize must not scale type.** Geometry only. This surprises people who expect it and delights people who do not.

**Snapping to a locked item is fine.** Locking prevents modification, not alignment. Locked items are useful snap targets.

**Selection state is not in the document.** It is per-user Zustand state (FOUNDATION §10.2). Never dispatch a command to change selection.

---

## 12. Your gate

Beyond RULES §7 for every requirement:

1. **Latency.** Under 16ms at p95 dragging an item on a 24-page magazine with 40 items on the page.
2. **Selection visibility.** The outline is clearly visible against white, black, and a busy photograph.
3. **No drag at all.** Select, move, resize, turn, reorder, and multi-select, using only clicks and keyboard.
4. **Handles at zoom.** 14px on screen at 25%, 100%, and 200%.
5. **Group round trip.** Group, move, resize, turn, ungroup — items land where they visibly appeared, with no drift.
6. **Undo granularity.** One drag is one undo, not forty.
7. **Locked items.** Resist every operation, and say why.
8. **Snapping.** Guides appear for edges, centres, and equal spacing between three or more items — and release when the user moves deliberately away.
9. **Headless.** Every ARR requirement achievable through `dispatch()` alone (FWD-02).

---

## 13. Blockers to raise on day one

1. **TXT-02's click behaviour** (§4.1) — needs a requirements amendment, and Lane 2 needs the same answer.
2. **Mixed-selection panel behaviour** (§7.3) — Requirements Amendment 1 leaves it to you. Confirm: common options only, Appearance disabled.
3. **Group resize and type size** (§7.4) — I have specified geometry only. Confirm, because it is the kind of thing users have strong expectations about and reversing it later means changing stored documents.
