# Lane 1 — Amendment 1, Addendum

**Found on re-review.** Two items I under-covered, one I omitted, two the review did not raise.

---

## 1. Ungroup and order keys — under-covered

Amendment A2 listed `ungroup` alongside `align` and `distribute` under the `restore` pattern, with an example carrying `{ itemId, x, y }`. That is positions. The review's point was about **order keys**, and it is a harder problem.

**What actually happens on group:**

Items move out of `Page.items` into `Group.children`. Both are collections that invariant 10 governs — keys unique within their container, array sorted by them. So grouping either regenerates keys for the new container or carries the old ones, and ungroup has to put children back into `Page.items` at keys reproducing the original z-order relative to items that were never grouped — which may have been reordered in between.

**Decision:**

```ts
export interface GroupPayload {
  itemIds: Id[];
  groupId: Id;
  /** Inverse only. Original keys in Page.items, per child. */
  restore?: Array<{ itemId: Id; order: OrderKey }>;
}

export interface UngroupPayload {
  groupId: Id;
  restore?: Array<{ itemId: Id; order: OrderKey }>;
}
```

**On group:** record each child's original `Page.items` key in the command's inverse. Generate fresh sequential keys inside `Group.children`, preserving relative order.

**On ungroup:** if `restore` is present, use those keys verbatim. If a key now collides with an item added since, regenerate adjacent to it — invariant 10 requires uniqueness and a collision must not silently drop an item.

**Without `restore`** — an ordinary user-initiated ungroup — insert children at keys generated around the group's own key, preserving their relative order. That places them where the group visually sat, which is what a user expects.

**Owner:** Lane 0, with the rest of A2.

---

## 2. Invariant 13 is ambiguous about rotation — do not decide it in a bullet

A4 states: *"a group's frame equals the bounding box of its children."*

That is underspecified, and it is exactly the failure mode the review criticised in §7.4. A rotated child's visual extent exceeds its frame, so there are two readable meanings:

- **Union of child frames**, ignoring child rotation — simple, cheap, and the group box can be smaller than what you see
- **Union of child rotated extents** — matches what the user sees, and matches Figma and Canva

They differ visibly whenever any child is rotated, and an agent implementing one while Lane 1 assumes the other produces a group box that does not match its handles.

**I am not deciding this in a bullet.** It needs to be settled with Lane 0 alongside QA-06, because it determines both hit testing and what `item.resize` scales against.

My inclination is rotated extents, because a selection box that does not contain what it selects looks broken. But it makes the frame recompute on every child rotation, which is a cost worth weighing.

---

## 3. Copying a text box — does it copy the story? Not raised, and it is a real gap

B3 scoped ARR-12 to within-magazine copying, which removes the remapping problem. But it leaves an unanswered question I did not notice.

**Copy a text box and paste it. Does the copy share the original's story?**

If it shares, two unconnected boxes display the same content and editing one silently changes the other. Nothing in the invariants forbids it — invariant 3 requires boxes *in a chain* to share a story, but says nothing about two boxes outside a chain sharing one.

**Decision: copying a `TextBox` copies its story.** New story id, new paragraph ids, new order keys, identical content. Predictable, and it is what a user means by "copy".

**A mid-chain box copies the whole story**, not its displayed slice. The copy is standalone with `nextBoxId` and `prevBoxId` both null. Copying a slice would produce text the user never sees the boundaries of, and there is no sensible undo story for it.

Invariant 12 is satisfied — the new story is referenced by the copy.

**Owner:** Lane 1's paste implementation, but it needs Lane 0's `item.create` to accept a story, which `CreateItemPayload.story?` already provides.

---

## 4. `dispatchBatch` validation timing — unstated

A2 did not say when validation runs.

**Once, after every command in the batch has applied.** Not per command.

Intermediate states within a batch are legitimately invalid. Grouping three items removes them from `Page.items` before adding them to `Group.children` — between those steps, ids exist in neither collection and invariant 7 fails. Validating per command would reject a correct batch.

Any rejection or invariant failure after the full batch rejects the whole batch and commits nothing.

---

## 5. The human gate — omitted from the amendment entirely

The review raised this as point 10 and I left it out of the document. It belongs in writing, not in a chat message.

**RULES Amendment §H item 13** names ARR-01 through ARR-06 among the requirements where "someone outside the team" must mean **a person in the target age range**. Those are Lane 1 build steps 1 through 8 under the revised order.

**FOUNDATION §15 open question 5:** elderly testing has no owner, no start date, and recruiting takes weeks.

So Lane 1 cannot mark its first eight requirements complete, and Lane 2 hits the same wall on TXT-01 and TXT-02. Between them they cover most of the named requirements.

**Two honest options, and this is a decision for the project rather than the lane:**

- **Get an owner now.** Recruiting takes weeks and the lanes reach this in their first week, so it is already late.
- **Allow lanes to mark requirements *provisionally* complete** and gate the release rather than the requirement — with an explicit list of what is unverified, reviewed before acceptance.

The second is a reasonable accommodation. What is not reasonable is quietly dropping the check, which is how the current platform's usability problems reached production.

**Add to Lane 1's gate and Lane 2's gate:** a list of requirements marked provisionally complete, pending target-age testing.

---

## Summary

| # | Item | Owner |
|---|---|---|
| 1 | Ungroup order keys — `restore` carries keys, not positions | Lane 0 |
| 2 | Invariant 13's rotation meaning — settle with QA-06, do not assume | Lane 0 + Lane 1 |
| 3 | Copying a text box copies its story | Lane 1 |
| 4 | `dispatchBatch` validates once, after the batch | Lane 0 |
| 5 | The human gate blocks eight of Lane 1's requirements — needs an owner or an explicit provisional-completion policy | Project |

Items 1, 2 and 4 join the four Lane 0 blockers in Part A. Item 5 is not a technical decision and does not belong to any lane.
