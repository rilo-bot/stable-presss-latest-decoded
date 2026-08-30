# Decisions — D-16 to D-19

**Blocks:** `packages/mb-commands`
**Apply with:** FOUNDATION v0.3

---

## D-16 — ACCEPTED, with one addition

`item.create` takes the item without its order key; the handler generates it from `afterId`/`beforeId`. The id stays caller-supplied so the inverse can name it.

**Add: define the both-null case.** When `afterId` and `beforeId` are both null, append — generate a key after the last item in the collection.

That is the common path. "Add a text box" places it on top of everything else, which is last in array order, which is the highest z-index. Making append the default means the common case needs no neighbour lookup at all.

```ts
export interface CreateItemPayload {
  pageId: Id;
  /** No `order` — the handler generates it. */
  item: Omit<Item, 'order'> & { order?: OrderKey };
  afterId: Id | null;
  beforeId: Id | null;
}
```

The optional `order` is D-17's mechanism. See below.

---

## D-17 — CHANGED. No thirteenth command; and yes, delete the story

Two parts, and I would do the first differently.

### Part 1 — `item.create` serves as the inverse, not a new `item.restore`

The reasoning for a separate command is sound: a plain `item.create` cannot reproduce a deletion exactly, because regenerating a key between the same neighbours yields a *different* key than the original, and because restoring a mid-chain box has to re-split a chain the delete repaired.

But a thirteenth command is not the cheapest fix, and it introduces a user-facing concept — "restore" — that is not a thing users do. Undo is the thing users do.

**Instead: make `order` optional on the create payload.** Present means use it verbatim; absent means generate from neighbours.

```ts
// Normal create — handler generates the key
dispatch({ type: 'item.create', payload: { pageId, item, afterId, beforeId: null } });

// As the inverse of a delete — the item carries its original key and thread links
dispatch({ type: 'item.create', payload: { pageId, item: deletedItem, afterId: null, beforeId: null } });
```

One optional field, no new command, and it matches the pattern already used by `text.splitParagraph`, whose optional `restore` lets it serve as the inverse of a merge. Consistency matters more here than it usually does — twelve commands is a surface seven lanes will read, and two different mechanisms for the same idea is a thing they will each interpret once.

**Thread repair comes free.** A deleted `TextBox` carries its own `prevBoxId` and `nextBoxId`. The create handler, given an item whose links point at existing boxes, re-splits the chain by writing `prev.nextBoxId = item.id` and `next.prevBoxId = item.id`. Nothing extra needs carrying in the payload.

### Part 2 — deleting the last box of a chain deletes its story. Agreed

Agreed, and the inverse carries the whole story. A 3,000-word story is roughly 20KB in an in-memory undo entry — irrelevant against a 100-entry history.

**Why delete rather than orphan.** There is no use case in the requirements for a story with no box. Text lives in boxes; TXT-01 creates a box. An orphaned story is invisible to the user, grows the document forever, and gets serialised into every autosave and every published version.

**But orphans must be detectable, not merely unlikely.** A bug anywhere in thread handling could create one silently, which is exactly the failure class RULES §1.1 exists to prevent.

**Add invariant 12:** every story in `stories` is referenced by at least one text box.

That belongs in `validateStructure` — it is a set difference over two collections, microseconds on any realistic magazine.

---

## D-18 — ACCEPTED, but the payloads need defining

Agreed that these belong to Lane 0. They maintain invariants 2 to 4, and `item.delete` already needs thread repair, so the logic is Lane 0's either way. Two implementations of chain manipulation would be worse than one.

But the names hide a real decision, and Lane 2 would otherwise have to make it.

```ts
export interface ConnectBoxPayload {
  /** Text overflowing this box continues into the next. */
  fromBoxId: Id;
  toBoxId: Id;
}

export interface DisconnectBoxPayload {
  /** Breaks the link AFTER this box. */
  boxId: Id;
}
```

**Connect** requires `toBoxId` to be the head of its own chain and not already downstream of `fromBoxId` — otherwise you create a cycle and break invariant 3. Reject rather than repair.

**Disconnect** is the one needing a decision. Given `A → B → C` and disconnecting at B:

- Everything downstream of B — here, C — becomes a standalone box with a **fresh empty story**.
- The original story stays with the upstream chain, `A → B`.
- B now likely overflows, and warns per §9.3.

**Why this way.** The user connected boxes so text would flow. When they disconnect, the expectation is that their writing stays where they wrote it — in the story — and the trailing box empties. The alternative, splitting the story so C keeps the overflow text, means a disconnect silently *divides an article in two*, which is a surprising and destructive thing for a click to do.

It also keeps the operation cheaply invertible: reconnecting restores the chain, and the empty story created for C is deleted by the inverse.

**Add to §9.4:** neither command is available for a text box inside a repeating background.

---

## D-19 — ACCEPTED, with the offset-zero case defined

Text inserted at a run boundary inherits the left run's formatting. Standard word-processor behaviour and what users expect.

**At offset 0 there is no left run.** Inherit the **first run's** formatting — which is also what Word does. Typing at the start of a bold heading produces bold text, not unformatted text that suddenly diverges from the line it is on.

If the paragraph has no runs at all, the new run takes the paragraph's look with empty overrides.

---

## Summary

| # | Decision |
|---|---|
| D-16 | Accepted. Both-null means append. |
| D-17 | **Changed.** Optional `order` on `item.create`, not a thirteenth command. Story deletion agreed; **add invariant 12** so orphans are detectable. |
| D-18 | Accepted. Disconnect gives downstream boxes fresh empty stories; the original story stays upstream. Neither command available in repeating backgrounds. |
| D-19 | Accepted. At offset 0, inherit the first run. |

**Command count stays at twelve**, plus `text.connectBox` and `text.disconnectBox` from D-18 — fourteen.

**Also ready:** `REQUIREMENTS-v2.0-AMENDMENT-1.md` closes the GL-09/GL-15 contradiction and defines `registerPanelOption`, which deliverable 6 needs. It should be read before the shell is built.
