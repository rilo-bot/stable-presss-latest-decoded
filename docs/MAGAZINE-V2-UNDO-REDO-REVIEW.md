# Magazine Builder v2 — undo/redo review

**Date:** 2026-08-27 · **Branch:** `magz-issues` · **Commit:** `01118b4`
**Scope:** the undo/redo subsystem end to end — `apps/web/src/editor-v2/store.ts` (1,798), `MagazineEditorV2.tsx` (716), `EditorCanvas.tsx` (608), `AiPanel.tsx` (835), `Inspector.tsx`, `controls.tsx`, and the server-side `restore` branch in `apps/server/src/routes/magazinesV2/index.ts`.
**Method:** read the code directly and traced every write path that can reach `record()`. Each finding below was re-verified against the source a second time, including the interleavings. No agents, no sampling.
**Out of scope:** v1's editor, the blog composer's separate undo stack (`pages/blog-composer/composerStore.ts`).

Status key: **CONFIRMED** — reproduced by reading the interleaving; the defect is real. **BY DESIGN** — a gap, but a deliberate and documented one.

---

## 1. How it works

**The model is an op-log of inverse-able element writes, replayed through the server** — not local state snapshots. This is the right choice here: the server owns normalisation (geometry clamping, text refit, sanitising), so a snapshot restored locally would diverge from what the server would actually store.

**`UndoOp` — three shapes** ([store.ts:73-84](../apps/web/src/editor-v2/store.ts#L73-L84)):

| op | carries | inverse |
|---|---|---|
| `update` | `pageId`, `elementId`, `before`, `after` | PATCH the other snapshot |
| `add` | `pageId`, the **whole** element | DELETE it |
| `delete` | `pageId`, the **whole** element | re-create it with `restore=true` |

`add`/`delete` carry the entire element rather than an id precisely because undoing a delete has to put it back *identically* — same id, same geometry, same content.

**Recording.** Three store actions are the only element write paths, and each calls `record()`:

- [`commit()`:581](../apps/web/src/editor-v2/store.ts#L581) → `update`. Records the **server's** returned element as `after`, not what was requested, so a redo reproduces what was actually stored.
- [`addElement()`:621](../apps/web/src/editor-v2/store.ts#L621) → `add`, again with the server's canonical element.
- [`deleteElement()`:643](../apps/web/src/editor-v2/store.ts#L643) → `delete`, snapshotting the victim *before* the network call — once the server has it, that snapshot is the only copy left.

[`record()`:368](../apps/web/src/editor-v2/store.ts#L368) appends to the open batch, or pushes a lone entry capped at 60 (`slice(-59)`), clearing the redo stack.

**Batching.** [`batchEdits(label, fn)`:665](../apps/web/src/editor-v2/store.ts#L665) collects every write inside `fn` into one entry via a module-scoped `openBatch`. Two callers: [`runFormat`:943](../apps/web/src/editor-v2/store.ts#L943) (Fill/Adjust) and [`applyAllProposals`:1503](../apps/web/src/editor-v2/store.ts#L1503) (the AI apply). Empty batches are discarded so the button can't light up and do nothing, and a batch is dropped if the user switched magazines while it ran.

**Replay.** [`replayOps()`:1663](../apps/web/src/editor-v2/store.ts#L1663) walks ops forward for redo and reversed for undo, dispatching to [`replayUpdate`/`replayRemove`/`replayRestore`:1617-1650](../apps/web/src/editor-v2/store.ts#L1617-L1650). These deliberately bypass the store actions — a replay that recorded its own inverse would make Ctrl+Z toggle one change forever — with the `replaying` flag as a second line of defence.

**The `restore` contract.** Undoing a delete calls `api.addElement(..., restore=true)`; the server ([index.ts:2493-2511](../apps/server/src/routes/magazinesV2/index.ts#L2493-L2511)) then preserves the **original id and `source`** instead of minting a fresh id and forcing `source: 'manual'`. This is the load-bearing detail of the whole design: without it, every other stack entry naming that element would become a ghost, and an AI-added element would silently become "manual" after an undo/redo round trip. It can only ever create — an id already on the page is refused with a 409 — and it still goes through `normalizeElements`.

**Entry points.** Toolbar buttons at [MagazineEditorV2.tsx:417-418](../apps/web/src/editor-v2/MagazineEditorV2.tsx#L417-L418), whose tooltips name the pending entry's label ("Undo the assistant's changes"). Keyboard Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y at [:257-272](../apps/web/src/editor-v2/MagazineEditorV2.tsx#L257-L272), bound on `window`, bailing out on `INPUT`/`TEXTAREA`/`contentEditable` so the inline text editor keeps its native undo.

### What holds up, and must not be undone

These are correct and load-bearing. Any fix to §3 has to preserve them.

**Replays are serialised.** [`enqueueReplay`:343-350](../apps/web/src/editor-v2/store.ts#L343-L350) chains replays through a single promise, because each op consumes the `rev` the previous one produced. A held Ctrl+Z would otherwise start overlapping replays against the same rev, two of them 409, and the history would appear to skip entries at random. The chain also swallows rejections, so one thrown replay can't wedge every later undo. Verified: three fast clicks on a one-entry stack are safe — tasks 2 and 3 read an empty stack and no-op.

**The stack is read inside the queued task, not at keypress.** So a queued undo acts on the state its predecessor left behind.

**Failures are counted and spoken.** Every op is attempted even after an earlier one fails (a single stale op can't strand the rest), but `failed` is tallied and toasted with a distinct message for total-vs-partial failure. On partial failure the entry is dropped from both stacks rather than offered for redo. "Undid it" over a swallowed refusal is the one thing undo must never say, and the code takes that seriously.

**Ghost pruning.** [`withoutPage()`:364](../apps/web/src/editor-v2/store.ts#L364) drops every entry touching a page that was deleted or rebuilt from a reference, whole rather than op-by-op — half a batch is not a coherent thing to undo. Called from `deletePage` ([:806](../apps/web/src/editor-v2/store.ts#L806)), the reference rebuild ([:1021](../apps/web/src/editor-v2/store.ts#L1021)) and the agent's `remove-page` branch ([:1560](../apps/web/src/editor-v2/store.ts#L1560)). Without it a stale `delete` op would paste an orphan element onto a layout that never had it.

**Ops on a page you have scrolled away from still replay** — `replayOps` reopens the op's page rather than refusing.

**Flood control on the colour picker.** [`ColorControl`:138-184](../apps/web/src/editor-v2/controls.tsx#L138-L184) debounces the native picker's continuous `input` event, flushed on blur and unmount. Without it one colour drag emitted dozens of full commits and, at 60 entries, flushed the user's entire real history to make room. Three deliberate picks still yield three entries, which is right.

**`before` snapshots are captured at gesture start, not at commit time.** The drag stores it at pointerdown ([EditorCanvas.tsx:268](../apps/web/src/editor-v2/EditorCanvas.tsx#L268), committed at [:302-303](../apps/web/src/editor-v2/EditorCanvas.tsx#L302-L303)), the inline text editor at mount ([:97](../apps/web/src/editor-v2/EditorCanvas.tsx#L97), persisted at [:126](../apps/web/src/editor-v2/EditorCanvas.tsx#L126)), the inspector per change ([Inspector.tsx:222](../apps/web/src/editor-v2/Inspector.tsx#L222)). So a whole drag is one entry, not one per pointermove.

**`replayUpdate` sends the full element as the patch.** Combined with `normalizeElementPatch`'s conditional refit — which fires only when the patch could change the fit *and* no explicit `fontSize` was sent — the full snapshot carries `text.fontSize`, so an undo cannot be silently re-fitted to a different size than it had.

---

## 2. Summary of findings

| # | Severity | Finding | Status |
|---|---|---|---|
| H1 | High | `applyAllProposals` has no in-flight guard — a double-click applies every proposal twice and shreds the undo grouping | **CONFIRMED** |
| H2 | High | `openBatch` is a single module global with no re-entrancy — concurrent batches merge, then the first to finish orphans the rest | **CONFIRMED** |
| M1 | Medium | A cross-page undo is invisible: `replayOps` opens the page but never scrolls to it | **CONFIRMED** |
| M2 | Medium | A user edit made during an in-flight replay is silently unrecorded and becomes permanently un-undoable | **CONFIRMED** |
| M3 | Medium | Undoing a delete restores the element but leaves nothing selected | **CONFIRMED** |
| L1 | Low | No pending state on the undo/redo buttons during a multi-op replay | **CONFIRMED** |
| L2 | Low | Zero test coverage for undo/redo or the server's `restore` branch | **CONFIRMED** |

---

## 3. Findings

### H1 — `applyAllProposals` has no in-flight guard · **CONFIRMED**

**Where:** [store.ts:1443-1445](../apps/web/src/editor-v2/store.ts#L1443-L1445), [AiPanel.tsx:675](../apps/web/src/editor-v2/AiPanel.tsx#L675)

The "Use these changes" button is a plain `<button>` with no `disabled` and no pending state, and `applyAllProposals` guards only on `!s.page`, page mismatch, an empty proposal list and a missing `issueId`. There is no `applyBusy` flag anywhere in the store — `chatBusy`, `formatBusy` and `layoutBusy` exist; the apply path has no equivalent.

`s.proposals` is not cleared until [:1577](../apps/web/src/editor-v2/store.ts#L1577), *after* every write has completed. The apply is N sequential network round trips, so for a ten-proposal turn that window is seconds long.

**The interleaving, traced:**

1. Click 1 → run A captures `proposals = P`, guard passes, `batchEdits` sets `openBatch = A`, `fn_A` starts awaiting its first write.
2. Click 2 (during that await) → run B calls `get()`; `P` is still there, so **every guard passes**. `batchEdits` sees `openBatch` non-null and takes its nested path (`return fn()`), so `fn_B`'s ops are pushed into batch A.
3. Both loops now iterate the same `P`. Every `add` proposal is applied **twice** → duplicate elements on the page. Every `delete` is applied twice, the second refused. Both runs increment their own local `applied`/`refused`, so two toasts fire.
4. Whichever `fn` resolves first hits `batchEdits`'s `finally`, sets `openBatch = null` and pushes batch A. The other loop is **still running** — `batchEdits` never awaited it — so each of its remaining writes falls through to `record()` with no open batch and becomes its **own** stack entry, each one clearing the redo stack.

**Impact:** duplicated elements the user did not ask for, and an undo history where "the assistant's changes" is one entry plus a scatter of unlabelled singletons — so Ctrl+Z takes back part of the apply and leaves the duplicates behind. This is the worst failure mode in the subsystem: it corrupts the page *and* the mechanism for recovering from it.

**Fix direction:** an `applyBusy` flag in the store set before the first write and cleared in a `finally`, guarded at the top of `applyAllProposals` (the same shape as `formatBusy` at [:923](../apps/web/src/editor-v2/store.ts#L923)), plus `disabled={applyBusy}` and a spinner on the tray button. Clearing `proposals` up front instead of at the end would also close the window, but loses the ability to report what was refused, so the flag is the better shape.

### H2 — `openBatch` is a single module global with no re-entrancy · **CONFIRMED**

**Where:** [store.ts:324](../apps/web/src/editor-v2/store.ts#L324), [store.ts:665-684](../apps/web/src/editor-v2/store.ts#L665-L684)

`batchEdits`'s nested path exists for a good reason — `runFormat` called from inside an AI apply should stay one entry. But it assumes nesting is *lexical*. It is not: `openBatch` is a module global, so two batches that merely **overlap in time** merge, and the first to finish nulls the flag while the second is still writing.

H1 is one way to trigger this. The other is independent of H1: the per-page Fill/Adjust buttons ([EditorCanvas.tsx:566,574](../apps/web/src/editor-v2/EditorCanvas.tsx#L566)) are disabled on `formatBusy` only, so clicking Fill while an AI apply is mid-flight starts a genuinely concurrent batch. `formatBusy` guards format-vs-format; nothing guards format-vs-apply.

**Impact:** ops attributed to the wrong entry and the wrong label, then the tail of the later action scattered into singletons. Same class of damage as H1, reachable without a double-click.

**Fix direction:** make the batch a counted/stacked structure rather than a boolean-ish global — or (simpler, and enough given the small number of callers) a single "a batch or replay is in flight" gate that makes overlapping bulk actions refuse rather than merge. Whichever is chosen, the *lexically* nested `runFormat`-inside-apply case must still collapse into one entry.

### M1 — A cross-page undo is invisible · **CONFIRMED**

**Where:** [store.ts:1686](../apps/web/src/editor-v2/store.ts#L1686)

`replayOps` calls `get().openPage(op.pageId)` to bring the op's page back. `openPage` fetches and sets `currentPageId`, but **does not scroll** — scrolling lives in `scrollToPage()` ([:384](../apps/web/src/editor-v2/store.ts#L384)) and its wrapper `goToPage` ([:535](../apps/web/src/editor-v2/store.ts#L535)), neither of which the replay path uses.

So undoing an entry that touches an off-screen page writes the server correctly and updates the store, while the viewport never moves: **the user presses Ctrl+Z and sees nothing happen.** Two follow-on effects:

- The canvas's scroll-settle picker ([EditorCanvas.tsx:514-536](../apps/web/src/editor-v2/EditorCanvas.tsx#L514-L536)) makes the page nearest the viewport centre active on the next scroll, so `currentPageId` snaps back and the undo's page silently loses focus again.
- Until then, `currentPageId` points at an off-screen page — and the AI assistant targets `currentPageId`. The next chat turn acts on a page the user cannot see.

This is reachable from an ordinary AI apply, since the assistant's proposals can span pages.

**Fix direction:** `scrollToPage(op.pageId)` alongside the `openPage` in `replayOps`. Note `scrollToPage` uses `block: 'start'` specifically so the settle-picker lands on the same page and doesn't undo the scroll — that's why it's the right helper here.

### M2 — A user edit during a replay is silently unrecorded · **CONFIRMED**

**Where:** [store.ts:331](../apps/web/src/editor-v2/store.ts#L331), [store.ts:369](../apps/web/src/editor-v2/store.ts#L369), [store.ts:1666-1704](../apps/web/src/editor-v2/store.ts#L1666-L1704)

`replaying` is a module global set for the whole duration of `replayOps` — which is N awaited round trips, plus a page fetch — and `record()` returns early whenever it is true. Nothing blocks the canvas during that window.

So a drag released, or an inspector change made, while a multi-op replay is in flight: `updateLocal` paints it, `api.patchElement` persists it, and `record()` drops it. The edit is real, stored, visible — and **permanently un-undoable**. There is no toast, because from `commit`'s point of view the write succeeded.

The flag is correct in intent (a replay must not record its own inverse) but wrong in scope: it is guarding *time* when it should be guarding *provenance*. The replay helpers already bypass the recording store actions entirely, so the flag is belt-and-braces — which means it can be narrowed without weakening the real protection.

Two lesser interleavings in the same window, both already handled and worth not regressing: the user's write bumps the `rev` and 409s the replay's next op, which `adoptConflict` absorbs and `failed` counts.

**Fix direction:** either narrow `replaying` to the individual replay calls, or — better for the user — suppress input while a replay is in flight, which L1 needs anyway.

### M3 — Undoing a delete restores the element but not the selection · **CONFIRMED**

**Where:** [store.ts:1642-1650](../apps/web/src/editor-v2/store.ts#L1642-L1650)

`replayRemove` correctly clears `selectedId` when it removes the selected element ([:1635](../apps/web/src/editor-v2/store.ts#L1635)). `replayRestore` has no counterpart: the element comes back with nothing selected, so the inspector stays on "Nothing selected" and the user has to hunt for and re-click the thing they just recovered. The normal `addElement` path *does* select what it creates ([:616](../apps/web/src/editor-v2/store.ts#L616)), so this is an inconsistency, not a deliberate choice.

**Fix direction:** set `selectedId: created.id` in `replayRestore`. Worth deciding the multi-op case deliberately — for a batch that restores twelve elements, selecting the last one restored is arbitrary; selecting nothing may be better than selecting something random. Suggest: select only when the entry restored exactly one element.

### L1 — No pending state during a replay · **CONFIRMED**

**Where:** [MagazineEditorV2.tsx:417-418](../apps/web/src/editor-v2/MagazineEditorV2.tsx#L417-L418)

Both buttons are `disabled={!stack.length}` and nothing more. A replay is N sequential round trips — for an AI-apply entry that is a visible pause with no feedback, reading as a dead button. Because `enqueueReplay` defers the pop until the chain drains, the stack length (and therefore the button's enabled state and its tooltip label) also stays stale for the duration.

Not a correctness bug — the queueing is sound, and extra clicks resolve correctly. But it is the visible symptom of M2's open input window, and one `replaying` boolean in state fixes both.

**Fix direction:** promote `replaying` into store state, drive a spinner and `disabled` from it, and gate canvas input on it.

### L2 — Zero test coverage · **CONFIRMED**

Verified by search: no test file in the repository references undo, redo, or `restore`. The only two hits (`applyLayout.test.ts:657`, `pageDensity.test.ts:7`) use the word "undo" in prose comments about something else. There are no web tests at all, and no server test touches the elements endpoints.

The whole ghost-prevention design rests on one server-side claim — that `restore=true` preserves the original id and `source` — and it is **unverified**. So are the batch-collapse behaviour, the inverse mapping in `replayOps` (the `(op.op === 'add') === (dir === 'undo')` XOR at [:1690](../apps/web/src/editor-v2/store.ts#L1690) is exactly the kind of expression that survives review while being wrong), and `withoutPage`'s pruning.

`withoutPage` and the direction/op dispatch are pure and trivially testable. The `restore` endpoint is testable in the existing `apps/server/tests/magazineV2/` harness — which per the 2026-08-11 review already runs 53 tests under `tsx --test` with no extra dependencies.

**Fix direction:** server tests for the `restore` branch (id preserved, `source` preserved, duplicate id refused with 409, non-restore add still gets a fresh id and `source: 'manual'`, still normalised). Pure-function tests for `withoutPage` and the op/direction dispatch table.

---

## 4. Gaps that are by design

Recorded so they are not mistaken for defects, and so the reasoning survives.

**Page-structure ops are not on the stack** ([store.ts:13-15](../apps/web/src/editor-v2/store.ts#L13-L15)) — add / remove / reorder / generate page, and the layout rebuild from a reference. They replace or destroy whole pages, and both destructive paths `window.confirm` first ([:887](../apps/web/src/editor-v2/store.ts#L887), [:1003](../apps/web/src/editor-v2/store.ts#L1003)). **Deleting a page is irreversible.** Defensible, and the warning is honest — but it is the largest functional gap, and if page-level undo is ever wanted it is a different mechanism (a page-document snapshot), not another `UndoOp`.

**History does not survive a reload** — `load()` clears both stacks ([:465](../apps/web/src/editor-v2/store.ts#L465)), as do `reset` ([:909](../apps/web/src/editor-v2/store.ts#L909)) and switching magazine. Correct as it stands: the ops reference a `rev` lineage that a reload invalidates.

**The history is client-only and per-session.** A collaborator's writes are not in your stack, and yours are not in theirs. The rev-guard is what keeps that safe — you cannot silently undo over someone else's change; you get a 409 and a toast.

**60-entry cap** ([:374](../apps/web/src/editor-v2/store.ts#L374), [:681](../apps/web/src/editor-v2/store.ts#L681)). Fine, given batching keeps one user action to one entry.

**Restoring into a full page would fail.** The `MAX_ELEMENTS_PER_PAGE` check runs before the restore branch ([index.ts:2489](../apps/server/src/routes/magazinesV2/index.ts#L2489)), so undoing a delete on a full page 409s. The cap is 400 ([model.ts:120](../apps/server/src/lib/magazineV2/model.ts#L120)), so this is theoretical — noted only so it isn't rediscovered as a mystery.

---

## 5. Suggested fix order

1. **H1** — an `applyBusy` flag plus a disabled button. Smallest change, stops active page corruption.
2. **H2** — batch re-entrancy. Shares the shape of H1's fix; do them together so the gate is designed once.
3. **L1 + M2** — promote `replaying` into state; drive the spinner, the disabled buttons and the input gate from it. One change closes the unrecorded-edit window and the dead-button feel.
4. **M1** — add the `scrollToPage` call. One line.
5. **M3** — select the restored element for single-element entries.
6. **L2** — tests, especially the `restore` contract, before any of the above is considered done.
