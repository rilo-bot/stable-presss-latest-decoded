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
