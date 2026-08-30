# Blockers

Append, never edit someone else's entry. When you hit one: record it, **stop that
requirement**, and move to the next one in your lane. Never work around a problem in
shared code.

Format:

```md
## [OPEN] TXT-11 — thread split loses the last word at box boundaries
**Lane:** 2 · **Raised:** 2026-08-30
**Where:** packages/mb-commands — needs a change outside my lane
**What I need:** the split point calculation to be exclusive, not inclusive
**Stopped:** yes — TXT-11 paused, moved to TXT-12
```

Mark an entry `[RESOLVED]` with a one-line note when it is closed. Do not delete entries.

---

## Open decisions — carried in from the plan review

These predate any lane. The first four block `packages/mb-schema`, so they need answers
before it is written.

### [OPEN] D-01 — Order keys have nowhere to live
**Raised:** 2026-08-30 · **Blocks:** `mb-schema`, `item.reorder`, ARR-10

Amendment 2 §5.1 requires `item.reorder { itemId, afterId, beforeId }` and calls it
mergeable. But FOUNDATION §5.2 defines `Page.items: Item[]` with "array order IS
z-order", and `Story.paragraphs` likewise. With order as array position, `afterId` /
`beforeId` must resolve to an index at apply time, and two concurrent inserts between the
same neighbours still collide.

**Needs:** either a sortable order key field on `Item` and `Paragraph` (items become an
unordered set sorted by key), or drop the mergeability claim from §5.1 and treat
`afterId`/`beforeId` as safer addressing only.

---

### [OPEN] D-02 — `overflow: 'shrink'` has no fitted-size field
**Raised:** 2026-08-30 · **Blocks:** `mb-schema`, TXT-12

`TextBox.overflow` accepts `'shrink'`, but `CharacterProps` carries only `fontSize`.
Shrink-to-fit means the displayed size diverges from the authored size and must reproduce
identically in the publish render. The old model needed `fontSize` + `maxFontSize` +
`minFontSize` for exactly this reason.

**Needs:** add the ceiling / floor / fitted fields, or make `'warn'` the only value.

---

### [OPEN] D-03 — What a text box does when text does not fit
**Raised:** 2026-08-30 · **Blocks:** `mb-schema`, TXT-11, TXT-12, TXT-13, ARR-05, IMG-10

Unstated in requirements v1.0 and v2.0, FOUNDATION v0.2, and Amendment 2. Three answers
are all defensible — shrink the type, clip and warn, or grow the box — and they produce
different text engines and different saved-look semantics. ARR-05's acceptance criterion
("edge handles reshape text boxes correctly with text reflowing") hints at an answer but
is the wrong place for the decision.

**Needs:** the default behaviour, whether it is per-box or per-look, and what TXT-12's
"offering to fix it" actually offers the user.

---

### [OPEN] D-04 — FOUNDATION Amendment 1 is missing
**Raised:** 2026-08-30 · **Blocks:** anything relying on its items 2–8

`FOUNDATION-v0.2-AMENDMENT-2.md` says "apply after Amendment 1", deletes "Amendment 1
item 1 in full", and states items 2–8 still apply. No `FOUNDATION-v0.2-AMENDMENT-1.md`
exists in the repository. Item 1 (Y.UndoManager rollback) and item 2 (`configureDispatch`
replacing `import.meta.env`) can be inferred from Amendment 2's own text. Items 3–8 cannot.

**Needs:** the document, or confirmation that only items 1 and 2 existed.

---

### [OPEN] D-05 — The shell contract was dropped in v0.2
**Raised:** 2026-08-30 · **Blocks:** Lane 0 deliverable 6, and every lane that registers into it

FOUNDATION v0.1 §8 named five toolbar slots (`file | undo | insert | arrange | zoom`),
three panel slots (`pages | properties | library`), the `registerToolbarItem` /
`registerPanel` signatures, the `SelectionState` shape, and the rule that properties-panel
controls are *disabled, never removed or moved* (GL-09). FOUNDATION v0.2 refers to "all
five slots, three panel mounts" and defines none of them. Six lanes register into this.

**Needs:** restore that section into v0.2.

---

### [OPEN] D-06 — GL-09 and GL-15 contradict, and the properties panel is where they meet
**Raised:** 2026-08-30 · **Blocks:** Lane 0 shell, Lanes 1–5 panels

GL-09 requires every control present at all times, enabled or disabled by selection.
GL-15 caps a panel at seven visible options. Text alone needs about fifteen controls;
ARR-08 is six buttons and ARR-10 is four. No arrangement satisfies both.

**Suggested resolution:** GL-09 guarantees fixed *regions* in fixed positions with
contents that vary by selection; GL-15 caps *each visible group* at seven. Then name the
always-visible control set per item type. Requires a requirements amendment, not just a
FOUNDATION one.

---

### [OPEN] D-07 — `?version=draft` exposes the working copy on a public route
**Raised:** 2026-08-30 · **Blocks:** Lane 6, PUB-01

FOUNDATION §9.6 step 2 has the publish job navigate `/m/:publishId?version=draft`, and
§9.3 marks `/m/:publishId` public with no auth. Anyone holding a publishId could append
that parameter and read unpublished content.

**Needs:** a signed short-lived token, or an internal-only render route the job uses.

---

### [OPEN] D-08 — The user-facing unit is named nowhere
**Raised:** 2026-08-30 · **Blocks:** Lanes 1, 2, 5 (not Lane 0)

Coordinates are pixels internally (ADR-002, settled). But DOC-03 offers page sizes "with
real-world dimensions shown" and a custom size that "can be entered"; ARR-04 types a
position, ARR-05 types width and height, TXT-04 types a text size, SHP-02 sets an outline
thickness, and ARR-09 is accurate "to within one unit". FOUNDATION v0.1 said the UI shows
millimetres or inches; v0.2 deleted that sentence and requirements v2.0 had already
dropped it from DOC-03.

**Needs:** one unit for geometry and one for type, named in the requirements.

---

### [OPEN] D-09 — Autosave sends the whole document
**Raised:** 2026-08-30 · **Blocks:** nothing yet · **Decide before:** Lane 6 builds snapshot

Amendment 2 §6.3 PUTs `{ document: Magazine, rev }` on a 2-second debounce. For a
text-led 24-page magazine that is roughly a megabyte every two seconds of active typing,
to an audience often on poor connections — and it contradicts the premise of the command
layer, whose whole point is that every change is a small serialisable instruction.

**Suggested:** send the command log; keep the full-document PUT as the recovery path.

Related: on a 409 the plan tells the user to reload. With simultaneous editing excluded,
the realistic cause is the user's own second tab, so reloading discards live work —
against Principle 3.

---

### [OPEN] D-10 — Version retention
**Raised:** 2026-08-30 · **Blocks:** nothing yet · **Decide before:** Lane 6 ships publish

`mbVersions` stores a full frozen copy of the document per publish, not a pointer. A
monthly publisher over two years is 24 complete copies. FOUNDATION v0.1 §13 listed this
as an open question; v0.2 dropped it and Amendment 2 made it more expensive.

---

### [OPEN] D-11 — `item.setProps` is an escape hatch
**Raised:** 2026-08-30 · **Blocks:** nothing · **Decide before:** lanes register commands

A generic partial setter will absorb every lane's typed command, and FWD-02's "everything
is a named instruction" degrades to one instruction that means anything.

**Suggested:** constrain it to `ItemBase` fields (frame, rotation, opacity, locked).

---

### [OPEN] D-12 — No invariant covers the back cover
**Raised:** 2026-08-30 · **Blocks:** nothing · **Decide before:** Lane 4 builds DOC-04/05

Invariant 9 enforces `spreads[0].pages.length === 1`. DOC-07 requires the back cover to
display singly too, and nothing says what happens to it when inserting a page flips the
parity. Lane 4's requirement, Lane 0's schema.

---

### [OPEN] D-13 — Lane 7 cannot own GL-01..15
**Raised:** 2026-08-30 · **Blocks:** nothing · **Decide before:** lanes fan out

Keyboard operation (GL-13), screen reader support (GL-14), 200% zoom (GL-11) and contrast
(GL-10) are properties of every lane's components, not one lane's deliverable.

**Suggested:** Lane 7 owns tooling, help, error boundaries and shell-level accessibility;
per-requirement compliance stays on each lane, where RULES §7 already puts it.

---

### [OPEN] D-14 — PUB-03 needs a per-version URL
**Raised:** 2026-08-30 · **Blocks:** nothing · **Decide before:** Lane 6 builds versions

PUB-03 requires each published version to offer "its link and its downloads". §9.3 has
only `/m/:publishId`, which always serves the latest.

---

### [OPEN] D-15 — Do existing magazines migrate?
**Raised:** 2026-08-30 · **Blocks:** nothing · **Decide before:** cutover is planned

FOUNDATION §1 says no migration. Requirements §11 decision 3 leaves it open. If there are
real magazines in `magazinesV2` at cutover, either users lose them or both editors run
indefinitely.

---

## Reported blockers

### [ANSWERED] D-21 — `Group.frame` has no defined relationship to its children
**Lane:** 0 · **Raised:** 2026-08-30 · **Answered:** 2026-08-30 · **From:** QA-06

**Answered by `implmentations/lane-1/LANE-1-INTERACTION.md` §7.4**, which states it directly:
*"A group's frame is the bounding box of its children"*, moving a group moves children by the
same delta, resizing scales each child's frame proportionally, turning rotates children about
the group's centre, and *"ungrouping must restore exact positions, sizes, and rotations"*.
That is the derived reading recommended below, so `item.resize` is unblocked and built.

**One thing the lane document does not settle, decided here and recorded so Lane 1 can
object:** children hold ALL the geometry in page space and the renderer never composes a group
transform on top of them. `Group.rotation` records the accumulated turn for the panel to
display; applying it as well would turn every child twice. This is also what makes ungrouping
exact — it moves children into the parent array and changes no coordinates at all, so
LANE-1 §12 gate 5 passes by construction rather than by careful arithmetic.

`Group.frame` ignores child rotation, so a turned child's painted extent can exceed it. Lane 1's
selection overlay computes its own visual extent where it needs one.

Still open from LANE-1 §13: whether a group resize should scale type size. Built as
**geometry only**, per §7.3. That is a UI expectation, not a schema question — it changes no
stored shape either way.

---

### [SUPERSEDED] D-21 (original text)
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** `item.resize` in `mb-commands` · **From:** QA-06

FOUNDATION v0.3 does not say whether a group's frame is *derived* — a computed bounding box,
in which case storing it creates a second source of truth — or *authoritative*, with children
positioned relative to it, in which case `Rect` means something different inside a group.
Today it is stored and means nothing, and `item.resize` on a group has no defined behaviour.

`item.resize` is a Lane 0 foundation command; ARR-13 (group) is Lane 1. This is the seam.

**Recommended:** the frame is **derived** — recomputed from the children's bounding box on
every change, and children keep page coordinates. Resizing a group scales each child's frame
proportionally. This keeps one source of truth for a child's position and means ungrouping is
free. The stored `Group.frame` becomes a cache the commands maintain, with an invariant
asserting it matches.

---

### [OPEN] D-22 — may a thread chain cross a group boundary?
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** `item.delete` in `mb-commands` · **From:** QA-07

Nothing forbids it, so `item.delete` — specified as "must repair thread links" — has to handle
deleting a group that contains half a chain. That compounds D-17, which already had no
expressible inverse for a mid-chain box.

**Recommended:** forbid it. A new invariant: every box in a thread chain sits in the same
containing collection. Grouping is a visual convenience (ARR-13, a SHOULD); threading is a
MUST and the product's differentiator. Making the harder one refuse the easier one is the
cheaper trade, and it removes an entire class of repair logic from `item.delete`.

**Built on the recommendation, 2026-08-30, to unblock the handlers.** `text.connectBox` refuses
when the two boxes have different enclosing groups: *"Text cannot continue into a box in a
different group."* Enforced at the point a chain is FORMED rather than at every point one might
be disturbed, so `item.delete`, `items.group` and `items.ungroup` need no repair logic at all.

Not yet an invariant in `validateStructure` — a document loaded from before this rule could
violate it, and validation reports rather than repairs. **This still needs ratifying**, at which
point it becomes invariant 15 and the check moves into the structural pass. Until then a chain
crossing a group boundary is unreachable through the command set but not reported if present.

---

### [OPEN] D-23 — `Spread` has no order key, so page reordering cannot be mergeable
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** DOC-05, Lane 4 · **From:** QA-16

Amendment 2 §5.1 requires entity-relative ordering for "item z-order, **page order**, and
paragraph order". `ItemBase.order` and `Paragraph.order` shipped. FOUNDATION v0.3's invariant
10 lists only `Page.items`, `Group.children`, `RepeatingBackground.items` and
`Story.paragraphs` — page order was dropped somewhere in the consolidation. There is also no
`page.reorder` in the foundation command set.

DOC-05 is a MUST. As it stands Lane 4 writes an array splice, which §5.1 forbids.

**Recommended:** add `Spread.order` now, while nothing depends on the shape. A field costs an
afternoon today and a migration later. D-01 should not be closed until this is settled.

---

### [OPEN] D-16 — `item.create` has two sources for `order`
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** `mb-commands` step 3

FOUNDATION §6.7 gives `item.create { pageId, item, afterId, beforeId }`. But `ItemBase.order`
is required, so the caller passes an item that already carries a key *and* the neighbours
for the handler to generate one. An inconsistent pair trips invariant 10.

**Suggested:** payload takes `Omit<Item, 'order'>` and the handler generates the key from
the neighbours. The item's `id` stays caller-supplied, for the same reason
`text.splitParagraph` supplies `newParagraphId` — the inverse has to name it, and undo/redo
must reproduce the same id.

---

### [OPEN] D-17 — `item.delete` has no expressible inverse for a mid-chain text box
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** `mb-commands` step 3

Deleting a box in the middle of a thread chain repairs its neighbours' links —
`prev.nextBoxId = next.id`, `next.prevBoxId = prev.id`. The inverse must restore the item,
its order key, **and** those links. `item.create` as specified touches no thread links, so
no command can currently undo that deletion.

Also unresolved: deleting the last box of a chain orphans its `Story`. No invariant forbids
an unreferenced story, so it leaks silently.

**Suggested:** give `item.delete` an inverse of `item.restore`, carrying the full item plus
the link state it displaced. Decide separately whether an orphaned story is an invariant
violation or is garbage-collected on delete.

---

### [OPEN] D-18 — nobody owns `text.connectBox` / `text.disconnectBox`
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** TXT-11

TXT-11 is a MUST, and connecting boxes maintains invariants 2, 3 and 4 — Lane 0's rules.
FOUNDATION §9.3 assigns Lane 2 only *where the new box is placed*. By the same argument the
document uses to put `splitParagraph` and `mergeParagraph` in the foundation set, these
belong there too.

---

### [OPEN] D-19 — `text.insert` does not say what happens at a run boundary
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** `mb-commands` step 3, Lane 2

`text.insert { paragraphId, offset, text }` takes an offset into the paragraph's
concatenated runs. Each run carries its own `overrides`, so inserting exactly between two
runs inherits one or the other. Inserting mid-run splits a run; deleting across runs merges
them.

**Suggested:** inherit from the left run, which is what word processors do. Needs stating
either way, because Lane 2 and the handler must agree.

---

### [OPEN] D-20 — page-structure commands are Lane 4's, but the invariants are Lane 0's
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** nothing yet · **Decide before:** Lane 4 starts

DOC-04 and DOC-05 need add, delete, duplicate and reorder page commands. Lane 4 registers
them, but each must maintain invariants 9, 10, 11 and 12 — spread parity and order keys —
which are defined here. Inserting a page in the middle of a facing-pages magazine reflows
every spread after it.

**Suggested:** Lane 0's handover names the invariants each page command must preserve, and
`validateMagazine` in the tests is what proves it.

---

### [OPEN] D-24 — the overflow default: grow-then-warn, or warn immediately?
**Lane:** 0 · **Raised:** 2026-08-30 · **Blocks:** nothing yet · **Decide before:** Lane 2 starts TXT-01
**From:** `implmentations/Lan-2/LANE-2-TEXT.md` §6, raised here because it changes `mb-schema`

Lane 2 is instructed to file this before building anything, and it lands on a shipped file.
`TextBox.overflow` is `'warn' | 'shrink'`, default `'warn'` (FOUNDATION §9.3, D-03). Lane 2
argues for a third behaviour first: a free-standing box **grows downward** as text is typed,
Canva-style, stopping at the page bottom and warning there; a box in a thread chain never
grows, because a fixed frame is what connecting means.

I think Lane 2 is right, and the reasoning is the same one behind `'warn'` being the default:
nothing should silently disappear. Growing hides less than warning does.

**What it costs.** `OverflowBehaviour` gains a member or `TextBox` gains a `growth` field, and
the mb-schema range checks and defaults follow. That is cheap now — `mb-commands` does not
read `overflow`, and no lane has started. After Lane 2 has built TXT-01, TXT-02 and TXT-12
against the current shape it is a migration of stored documents.

**Recommended:** decide it now, before the vertical slice, rather than at TXT-12.

---

### Recorded during the `mb-commands` build — not blockers, decisions taken

**`item.setProps` writes one field.** `ItemBaseProps` narrowed from
`Pick<ItemBase, 'frame' | 'rotation' | 'opacity' | 'locked'>` to `Pick<ItemBase, 'opacity'>`.
Frame and rotation need commands that transform a group's descendants, and `locked` gates
those commands — a general setter able to write it would be a hole in ARR-11 rather than a
convenience. Type-level, not a runtime rejection: a rule that reads stronger than it enforces
is the failure QA-10 was about.

**Two more inverse-payload variants**, alongside the three FOUNDATION §6.7 already chose.
`restore` on `item.move` / `item.resize` / `item.rotate` carries a geometry snapshot per
descendant, and `order` on `item.reorder` carries the original key. Both exist because an
inverse must reproduce the ORIGINAL VALUE: regenerating a fractional key between the same
neighbours is valid but is not the same string, and scaling a group back by the reciprocal
ratio drifts. The undo property test compares whole documents, so both would have failed it.

**`text.disconnectBox` gives the downstream boxes a new EMPTY story.** The words stay with the
chain they were typed into, which is what InDesign does. Splitting the text at the break would
mean an unrelated later edit silently moves where the split lands.

**`item.delete` takes the story with the last box showing it**, and the inverse carries it
back. Leaving it behind would strand text nothing displays, and would make redo of a create
fail on "that text is already in this magazine".
