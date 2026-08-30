# FOUNDATION v0.2 — Amendment 2

**Supersedes:** ADR-001, §2 dependency list, §7 store section, §9.4 and §9.5 storage, and Amendment 1 item 1
**Reason:** Yjs is not justified for v1. Removing it deletes the most fragile part of the design.

Apply after Amendment 1. Where the two conflict, this one wins.

---

## 1. The change

**Yjs is out. Plain JSON with Immer is in.**

The `Store` interface is unchanged, so this is an implementation swap, not an architecture change. Yjs can slot in behind the same interface later if collaboration becomes real.

### Dependencies

| Remove | Add |
|---|---|
| `yjs` | `immer` |
| `y-indexeddb` | `idb-keyval` (client-side backup persistence) |

`nanoid` and `pino` are unchanged.

---

## 2. ADR-001 replaced — plain JSON with Immer

The magazine is a plain JSON object. Commands mutate an Immer draft; the result is committed only after validation passes.

**Why this and not Yjs:**

Yjs was justified as cheap insurance against a painful collaboration retrofit. On inspection the retrofit is contained anyway, because the command layer already isolates it — a handler writing `item.frame.x = 5` does not care whether the draft is a plain object or a CRDT proxy. The schema does not change. Only the `Store` implementation does.

Against that, Yjs costs today:

- Yjs applies mutations as they happen and **does not roll back when a transaction throws**. Amendment 1 item 1 exists entirely to work around this, adding a `Y.UndoManager` purely as a safety net.
- Documents become binary snapshots in S3 rather than readable JSON in Mongo — a new storage pattern in a platform that already stores magazine documents in Mongo.
- The draft becomes a proxy, so it cannot simply be logged or inspected while debugging.

Immer's `produce()` gives validate-then-commit for nothing:

```ts
const next = produce(current, (draft) => { handler(draft, payload); });
const errors = validateMagazine(next);
if (errors.length > 0) throw new InvariantError(...);   // `current` untouched
```

**The corruption bug Amendment 1 defends against becomes structurally impossible.** There is no path where a failed command leaves a half-mutated magazine, because the mutation is never committed.

*Amendment 1 item 1 is deleted in full — both the rollback `UndoManager` and the two-phase handler contract it introduced. Handlers should still validate preconditions before mutating, but that is now good practice rather than a correctness requirement.*

---

## 3. Dispatch, rewritten

Replaces §6.1 and Amendment 1 item 1.

```ts
// packages/mb-commands/src/dispatch.ts
import { produce } from 'immer';

export function dispatch(cmd: Command): DispatchResult {
  const handler = registry.get(cmd.type);
  if (!handler) return { ok: false, reason: 'unknown-command' };

  let result: CommandResult | undefined;

  const next = produce(store.current, (draft) => {
    result = handler(draft, cmd.payload);
  });

  if (!result) return { ok: false, reason: 'handler-produced-nothing' };

  if (config.validateAfterCommand) {
    const errors = validateMagazine(next);
    if (errors.length > 0) {
      // `store.current` was never touched. Nothing to roll back.
      throw new InvariantError(
        `${cmd.type} produced an invalid magazine: ${errors[0].message}`
      );
    }
  }

  store.commit(next);
  history.push({ command: cmd, inverse: result.inverse });
  return { ok: true, dirty: result.dirty };
}
```

Amendment 1 item 2 still applies: `config.validateAfterCommand` is injected via `configureDispatch()`, never read from `import.meta.env`. `packages/mb-*` must run unchanged in the browser and in Node.

---

## 4. Store interface — unchanged shape, new implementation

Replaces §7.

```ts
export interface Store {
  /** The current magazine. Immutable — never mutate directly. */
  readonly current: Magazine;

  /** Replace the current magazine. Called only by dispatch. */
  commit(next: Magazine): void;

  subscribe(listener: (next: Magazine, dirty: Id[]) => void): () => void;

  /** Serialise for saving. */
  snapshot(): Magazine;
  load(magazine: Magazine): void;

  /** Optimistic concurrency against the server copy. */
  readonly rev: number;
}
```

Deliberately the same shape as the Yjs version, minus its binary encoding. Swapping in a CRDT later means writing a second implementation of this interface and nothing else.

**Client-side backup persistence:** write the current magazine to IndexedDB (`idb-keyval`) on a 2-second debounce, alongside the server autosave. If a save fails or the laptop closes, work survives. GL-16 requires this regardless of the store.

**Structural sharing:** Immer means an unchanged page keeps the same object reference across commits, so React re-renders only what actually changed. Use reference equality in the renderer rather than deep comparison.

---

## 5. Commands must be mergeable — new §6.5

**This is the actual future-proofing, and it costs nothing today.**

Swapping the store later is contained. What is *not* contained is discovering your commands cannot merge. Two rules, mandatory from the first handler:

### 5.1 Identify entities, never positions

```ts
// FORBIDDEN — cannot merge. Two concurrent reorders produce nonsense.
item.reorder { itemId, toIndex: 3 }

// CORRECT — a fractional key placed between neighbours
item.reorder { itemId, afterId: 'abc', beforeId: 'def' }
```

Applies to item z-order, page order, and paragraph order. Any command taking an array index is a command that cannot merge.

This is also more robust *today*: an index computed against a stale view is wrong even with one user and two browser tabs.

### 5.2 Text operations are offsets into an identified paragraph

```ts
// FORBIDDEN — destroys concurrent edits, and makes undo granularity useless
text.replaceContent { storyId, paragraphs: [...] }

// CORRECT
text.insert { paragraphId, offset: 42, text: 'hello' }
text.delete { paragraphId, offset: 42, length: 5 }
```

Whole-content replacement can never merge under any store. Offsets into a stable paragraph id can.

This also gives proper undo granularity — one typed word is one undo step, not one whole-paragraph snapshot.

### 5.3 The test

> Could two people issue this command at the same time against the same magazine and get a sensible result?

If not, redesign the payload. Do this now, while there are eight commands, not later when there are sixty.

---

## 6. Storage — Mongo, not S3

Replaces §9.4 and the document parts of §9.5.

### 6.1 Collections

```ts
// mbMagazines — the working copy lives HERE, not in S3
{ _id, ownerId, title, slug,
  createdAt, updatedAt,
  document: Magazine,      // the full JSON document
  rev: number,             // increments on every save
  latestVersion: number,   // 0 = never published
  publishId: string,       // STABLE public slug — never changes
  thumbnailKey: string | null }

// mbVersions — append-only. No update path exists in the API.
{ _id, magazineId, version, publishedAt,
  document: Magazine,      // frozen copy
  pdfKey, pageImageKeys, pageCount }

// mbAssets
{ _id, ownerId, magazineId, hash, source, mimeType,
  intrinsicW, intrinsicH, credit, storageKey, createdAt }
```

Readable JSON in Mongo. A magazine can be inspected with a database query, which matters more at 2am than it sounds.

**Size:** a 24-page magazine is comfortably under Mongo's 16MB document limit — text and geometry only, since photos are S3 references. If a magazine ever approached the limit, pages would move to their own collection, as the existing `magazinePagesV2` does. Not needed for v1.

### 6.2 S3 keeps only binaries

```
public/magazine-builder/{magazineId}/media/{hash}.{ext}
public/magazine-builder/{magazineId}/media/{hash}.proxy.webp     1200px
public/magazine-builder/{magazineId}/media/{hash}.thumb.webp     200px
public/magazine-builder/{magazineId}/published/v{n}/magazine.pdf
public/magazine-builder/{magazineId}/published/v{n}/pages/{i}.png
```

`snapshot/current.bin` and `published/v{n}/document.bin` are gone — those live in Mongo now.

### 6.3 Autosave with compare-and-set

```
PUT /api/magazine-builder/magazines/:id/snapshot
Body: { document: Magazine, rev: number }

200 { rev: number }          saved, new rev
409 { rev, document }        stale — server's current copy attached
```

Debounce 2 seconds after the last command. On 409, the client tells the user their magazine was changed elsewhere and offers to reload — in plain words per GL-12. The existing `magazineV2` router already uses this pattern on `page.rev`; follow it.

---

## 7. What this changes elsewhere

| Section | Change |
|---|---|
| §2 stack table | Yjs → Immer; `y-indexeddb` → `idb-keyval` |
| §3 ADR-001 | Replaced by section 2 above |
| §6.1 dispatch | Replaced by section 3 above |
| §6 commands | Add §6.5 from section 5 above |
| §7 store | Replaced by section 4 above |
| §9.4, §9.5 | Replaced by section 6 above |
| §9.6 publish job | Step 1 reads the document from Mongo, not S3. Steps 2–5 unchanged. |
| §10 deliverable 3 | "`packages/mb-store` — Immer-backed store, IndexedDB backup, subscription" |
| Amendment 1 item 1 | **Deleted in full** |
| Amendment 1 items 2–8 | All still apply |

---

## 8. If collaboration becomes real

Recorded so the path is known and nobody has to rediscover it.

1. Write a second `Store` implementation backed by Yjs. Nothing outside `packages/mb-store` changes.
2. Add a WebSocket relay. The worker becomes a peer for AI-generated changes.
3. Add presence UI — cursors and selections. This is work you would do regardless of the store.
4. Run a one-time script converting stored JSON documents into Yjs documents.

Steps 2 and 3 are the bulk of it and are not Yjs-specific. Step 1 is contained *because* of the command layer and the §6.5 rules.

**The one case this does not cover:** two people typing in the same paragraph simultaneously. Nothing but a text CRDT handles that well, and retrofitting it is genuinely painful. If that turns out to be a requirement, raise it before Lane 0 finishes — it is the only scenario that would justify taking on Yjs now.

Different pages, different items, or one person after another all merge fine under §6.5's rules.
