# Cross-lane contract decisions

**Supersedes:** LANE-1-AMENDMENT-1 Part A, and LANE-1-AMENDMENT-1-ADDENDUM items 1–4
**Status:** these block Lane 0. Nothing here is Lane 1's to decide.

Three items from the amendment review were left implicitly closed and are settled here. Five defects in the addendum are corrected. Where a question is genuinely open, it is routed rather than answered.

---

## 1. Preview — A1 was overcomplicated. No renderer change needed

**The hole is real.** Part C decided reflow happens during a resize, throttled, using preview. But `ThreadLayout` is computed from `Magazine`, and a previewed frame existed only in a map going to the renderer. Nothing for the relayout to read.

**A1's fix — a `preview` prop on the renderer — was the wrong shape.** It solves rendering and leaves layout stranded, and it puts a gesture concept into a contract that should not know about gestures.

**Decision: preview resolves to a derived `Magazine`.**

```ts
/** Applies ephemeral gesture offsets. Immer structural sharing makes this cheap. */
export function applyPreview(
  magazine: Magazine,
  preview: ReadonlyMap<Id, PreviewTransform>
): Magazine;
```

The editor holds the preview map, derives a previewed magazine, and passes it to both the renderer and the layout function. **Neither contract changes.** Neither knows preview exists.

| Cadence | What runs |
|---|---|
| Every frame (~16ms) | `applyPreview` then render. One `produce()` touching only the dragged items' paths. |
| Throttled (~60ms) | Recompute thread layout from the previewed magazine |

Both budgets are met, and A1's `PageRendererProps.preview` is withdrawn — **one fewer Lane 0 blocker, not one more.**

`applyPreview` belongs in `packages/mb-store` or `mb-schema`, whichever Lane 0 prefers. It is a pure function over a magazine.

---

## 2. Command payload types belong in `mb-commands` — new blocker

**Correct, and it blocks ARR-14.** Composing `copyLook` from `text.setLook`, `shape.setFill`, and `photo.setCornerRadius` means Lane 1 importing payload types from other features' `types.ts`, which RULES §9.2's zones make a lint error.

**General rule, not a special case for copyLook:**

> **A command's payload type is public API and lives in `packages/mb-commands`. Only the handler lives in the lane.**

A registered command is something any lane may dispatch and the AI phase will emit. Its payload cannot be private to the lane that implements it.

Lane 0 provides a payload types file per lane namespace; lanes add their types there and keep handlers, panels, and hooks local. It is the one place a lane writes outside its own directory, and it is a type-only file.

Applies to every lane, so it should land with the other Lane 0 changes.

---

## 3. Batch validation — corrected

Item 4's decision was right and its example was wrong. Grouping happens inside one handler inside one `produce()`, and a handler's intermediate steps are never validated. Nothing there was at risk.

**The example that motivates it is already in the code:** creating a text box and creating its story are two commands, and between them the box's `storyId` resolves to nothing. That is exactly why `CreateItemPayload.story?` exists — and it is also a good argument for keeping that field rather than treating it as redundant once `dispatchBatch` lands.

**The three unstated points:**

- **Full validation also runs once, at the end**, in dev and tests. Same cadence as structural.
- **`dirty` is the union** across every command in the batch, deduplicated.
- **Errors name the failing command by index**, since a batch has no single `cmd.type`:

```
Batch failed at [2] item.create: story not found: abc123
```

Without the index, a five-command batch failure is untraceable.

---

## 4. The group frame — three options, and my inclination was wrong

**QA-06 named a third option that A4 dismissed without addressing.** All three go to Lane 0:

| Option | Frame is | Cost |
|---|---|---|
| A | Union of child frames, ignoring child rotation | Group box can be smaller than what you see |
| B | Union of child rotated extents | Matches Figma and Canva — **but see below** |
| C | Authoritative; children positioned relative to it | What most scene graphs do. Group resize and rotate become trivial. |

**The argument against B is decisive and I had not seen it.** Under rotated extents, rotating a group continuously changes its frame width and height. Rotating 30° and back does not restore the frame bit-for-bit, which fails §7.4's "ungrouping must restore exact positions, sizes, and rotations" **and** RULES §8's deep-equal undo property test.

And my objection to A and C — that a selection box not containing what it selects looks broken — dissolves: **draw the selection overlay from rotated extents while storing a stable frame.** The overlay is Lane 1's and need not equal the stored frame.

**My inclination is now C**, which makes resize and rotate trivial and keeps undo exact. But this is Lane 0's call alongside QA-06, and it determines hit testing and what `item.resize` scales against.

**Naming, not numbering.** I have called this "invariant 13" and 13 is already taken in `validation.ts`. QA-15 is the open finding about exactly this. **Stop numbering invariants in prose.** Name them — `groupFrameMatchesChildren` — and let the code hold the ordering. The same applies to "invariant 12", which three documents now cite and which is not implemented and whose number is claimed.

---

## 5. Group and ungroup payloads — corrected

Addendum item 1 had the data on the wrong command. `items.group`'s inverse is `items.ungroup`, so children's original `Page.items` keys belong on **ungroup**. `items.group.restore` serves the inverse of ungroup — regrouping — which needs different data.

```ts
export interface GroupPayload {
  itemIds: Id[];
  groupId: Id;
  /** Inverse-of-ungroup only. */
  restore?: {
    /** The group's own key in Page.items, freed when it was ungrouped. */
    groupOrder: OrderKey;
    /** The group's original frame — not recomputed. */
    groupFrame: Rect;
    /** Each child's key within Group.children. */
    childOrders: Array<{ itemId: Id; order: OrderKey }>;
  };
}

export interface UngroupPayload {
  groupId: Id;
  /** Inverse-of-group only. Children's original keys in Page.items. */
  restore?: Array<{ itemId: Id; order: OrderKey }>;
}
```

`groupFrame` matters: on the inverse path the frame must be the original, not recomputed — otherwise the undo property test fails on floating-point drift.

**The collision path is dropped.** Under a linear undo stack, everything created after the group is undone before the group's undo is reached, so it is unreachable. It becomes reachable only under redo-after-divergence or a merge path, neither of which exists. RULES §8 requires the inverse to be tested, and untestable code should not ship.

---

## 6. Copy semantics — the selection is the unit, not the box

Addendum item 3 stated the rule per box, which breaks on the case ARR-03 makes ordinary. Copying a three-box chain would give three disconnected boxes, each carrying a full copy of the same 3,000 words.

**Corrected rule:**

> **Copy operates on the selection as a whole.** Each distinct `storyId` in the selection is copied **once**. Thread links between copied boxes are preserved. Links to boxes outside the selection are dropped, and the copy at that boundary becomes a chain end.

Consequences:

- Copying a whole chain gives a whole chain, one story
- Copying one box out of a chain gives a standalone box with a full story copy — the addendum's rule, which is right for that case
- **Copying a `Group` recurses**, and its descendants' stories participate in the same once-per-storyId rule

Stories are copied whole, never sliced. Copying a slice produces text whose boundaries the user never saw.

---

## 7. QA-07 — routed, not asserted

A4 answered this with an assertion about a handler nobody has written, against a D-17 that is still open, and did not cover the inverse.

**What is actually open:** deleting a `Group` whose children carry thread links, and recreating it. Restoring a group means restoring each child *and* each child's links — including links to boxes outside the group, which may themselves have been deleted or repaired since.

This sits on `item.delete`'s group behaviour, which is Lane 0's and unwritten. **It goes to Lane 0 with D-17, not into a lane document as a resolved rule.**

---

## 8. The human gate is project-wide, not per-lane

Addendum item 5 was scoped too narrowly. RULES Amendment §H names TXT-01, TXT-02, IMG-01, ARR-01 through ARR-06, DOC-02, and PUB-01 — **Lanes 1, 2, 3, 4 and 6**.

"Add to Lane 1's gate and Lane 2's gate" is the wrong shape. It should be **one project-wide provisional-completion policy with one list**, or the other three lanes each rediscover it.

And option 2 — allowing provisional completion and gating the release instead of the requirement — **amends RULES Amendment §H itself.** It needs whoever owns RULES to sign it, not a note in a lane addendum.

**Proposed, for sign-off:**

> A requirement whose only outstanding item is target-age verification may be marked **provisionally complete** and merged. It is added to `PENDING-USER-TESTING.md` at the root. **The release is gated on that file being empty**, not the requirement.

That keeps the check honest — nothing is quietly dropped, and the list is visible — while not stalling five lanes on recruitment that has not started.

---

## Lane 0 blocker list, current

| # | Item | From |
|---|---|---|
| 1 | ~~Renderer preview channel~~ — **withdrawn**, see §1 | — |
| 2 | Batch inverse: `restore` pattern plus `dispatchBatch` | A2, corrected §3 |
| 3 | Panel option API accepting `'all'` | A3 |
| 4 | Group frame — three options, §4 | QA-06, QA-15 |
| 5 | Group and ungroup payloads, §5 | §5 |
| 6 | **Command payload types move to `mb-commands`**, §2 | New |
| 7 | `applyPreview` as a pure function, §1 | New, replaces #1 |
| 8 | QA-07 group deletion and its inverse, with D-17 | §7 |

Six of these are corrections to contracts I specified wrongly. They should land together, before `mb-commands` is finished.

---

## Still to do, not blocking

**Consolidate Lane 1.** The document is now four deep — original, amendment, addendum, this. That is the same chain problem that produced the §7 error and prompted FOUNDATION v0.3. Lane 1 should be reissued as v2 with everything folded in, and the three predecessors archived, before an agent reads it.
