# Decisions — D-01 to D-15

**Resolves:** every open decision in BLOCKERS.md
**Apply after:** FOUNDATION v0.2 + Amendments 1 and 2

Six of these are errors in my documents rather than genuine ambiguities: D-01, D-06, D-11, D-12, D-13, D-14. Three are real gaps nobody had answered: D-03, D-09, D-10. The rest are resolved by documents that exist but were not delivered.

---

## D-04 — RESOLVED. The amendments exist

Both files exist and were written before the survey came back. They were not placed in the repository, which is the whole problem.

Add to `implmentations/`:

- `FOUNDATION-v0.2-AMENDMENT-1.md` — 8 items
- `RULES-AMENDMENT-1.md` — 11 items

**These close four open blockers outright:** D-02 (item 3), D-05 (item 5), D-07 (item 4), D-08 (item 6). Read them before acting on anything below.

---

## D-01 — RESOLVED. Add an order key. My error

The contradiction is real. Amendment 2 §5.1 claimed `afterId`/`beforeId` was mergeable while FOUNDATION §5.2 kept order as array position. Both cannot be true, and I did not notice.

**Decision: add a fractional order key.** Do not walk back the mergeability claim.

```ts
interface ItemBase {
  // ...
  /** Fractional index. Items are stored sorted by this. */
  order: string;
}

interface Paragraph {
  // ...
  order: string;
}
```

Use the `fractional-indexing` package — roughly 2KB, one function:

```ts
import { generateKeyBetween } from 'fractional-indexing';

// reorder: place between two neighbours
item.order = generateKeyBetween(prev?.order ?? null, next?.order ?? null);
```

**The array stays sorted.** `Page.items` remains `Item[]`, kept in `order` sequence on every insert and reorder. Readers — renderer, hit testing, panels — never sort; they read the array as-is. Only the reorder and create commands touch keys.

That keeps the reader cost at zero while making reorder correct.

**Why pay this now rather than later.** It is small, it removes a migration of every stored document if collaboration ever arrives, and it is correct *today* under the two-tab case — an index computed against a stale view is wrong even with one user. Adding a field costs an afternoon; adding it to production documents later costs a migration.

**Add to §5.6 as invariant 10:** every item on a page has a unique `order` within that page, and the array is sorted by it.

---

## D-02 — RESOLVED by Amendment 1 §3

Fitted size goes in `ThreadLayout.fontScale`, never in the document. `TextBox` gains `minFontScale` as a legibility floor.

On the reviewer's concern about the publish render reproducing it identically: publish renders through the same browser code path via Puppeteer on the internal render route, so `fontScale` is recomputed by the same code and matches by construction. Nothing needs storing.

---

## D-03 — DECIDED. Warn by default, never shrink silently

A genuine gap. Nobody had answered it.

**Default is `'warn'`.** Text is clipped, the box shows an unmissable warning, and nothing changes without the user knowing.

**Why not shrink.** Our user is 80. Silent shrink-to-fit is exactly the class of invisible behaviour that makes software confusing — they type three more sentences, everything quietly gets smaller, and they cannot work out why. Worse, they may not notice at all and publish something they cannot read.

**Why not grow the box.** Items would overlap, and a layout that rearranges itself while you type violates Principle 4.

**`'shrink'` remains available per box**, off by default, for cases like a fixed headline area where the author deliberately wants fitting. It is bounded by `minFontScale` (default 0.7), and when shrinking hits the floor it falls back to warning.

**Per box, not per look.** Overflow is about the box's geometry, not the text's style. A saved look applied to a large box and a small one should not behave differently.

**What TXT-12 offers.** Three concrete actions, in plain words, on the warning itself:

- *"Make this box bigger"* — grows to fit, if space allows
- *"Make the text smaller"* — one-off size reduction, not a mode
- *"Continue in another box"* — starts the threading flow

Each is one click and each is undoable.

---

## D-05 — RESOLVED by Amendment 1 §5

The full shell contract is restored there: five toolbar slots, three panel slots, both registration signatures, `SelectionState` with `hoveredId`, and GL-09.

---

## D-06 — DECIDED. Regions are fixed; groups are capped. My error

The contradiction is real and it is mine. GL-09 and GL-15 as written cannot both hold.

**Resolution, close to the reviewer's suggestion:**

> **GL-09** guarantees fixed *regions* in fixed positions. The properties panel always occupies the same place, and its sections always appear in the same order.
>
> **GL-15** caps each *visible group* at seven controls. Beyond seven, the rest go behind a labelled "More settings" **within that section**, never in a different place.

**Section order in the properties panel is fixed for every item type:**

1. Size & position
2. Appearance — type-specific: text formatting, photo trim, shape colour
3. Colour
4. Arrange — order, lock, group

A section that does not apply to the current selection **is shown and disabled, not removed**. That preserves GL-09's real intent: our users navigate by position, and a panel whose sections come and go forces re-orientation every time.

Within "Appearance", text shows its seven most-used controls — font, size, colour, bold, italic, alignment, spacing — and the remaining eight sit behind "More settings" in the same section.

**This needs a requirements amendment**, not just a FOUNDATION change. I will write it.

---

## D-07 — RESOLVED by Amendment 1 §4

Draft rendering moves off the public path entirely. A separate `/internal/render/:magazineId` route behind an HMAC'd 5-minute token, and `/m/:publishId` accepts no version query parameter at all.

---

## D-08 — RESOLVED by Amendment 1 §6

Millimetres for geometry, points for type size and line thickness. Conversion only at the UI boundary; nothing inside `mb-*` ever sees anything but pixels.

---

## D-09 — DECIDED. Compress and debounce on idle. Command log deferred

Both halves of this are correct and it is a good catch.

**On payload size.** A megabyte every two seconds is unacceptable, particularly for an audience often on poor connections.

**Decision for v1:**

- Debounce **5 seconds after the last command**, not every 2 seconds during typing. Someone typing continuously produces no saves at all until they pause.
- **Gzip the payload.** Magazine JSON is highly repetitive and compresses roughly ten to one.
- **Skip the request entirely if nothing changed** since the last successful save.
- **Hard ceiling:** save at least every 60 seconds during continuous activity, so a crash mid-paragraph never loses more than a minute.

That is roughly 100KB per idle pause. Acceptable, and it is an afternoon of work.

**On the command-log argument.** The reviewer is right that it contradicts the command layer's premise, and it is the better design. But it needs a log collection, a compaction strategy, and replay-on-load — and if the log and the snapshot ever disagree, debugging is genuinely unpleasant. That is not where I would spend Lane 6's time before there is evidence the simple approach is insufficient.

**Record it as the known upgrade path.** If telemetry shows save payloads or frequency are a problem, the log is the answer, and the command layer already makes it possible.

**On the 409.** Also correct, and my instruction was wrong. With collaboration excluded, the realistic cause is the user's own second tab, and "reload" discards live work — straight against Principle 3.

Replace with: detect the conflict, and tell them plainly —

> *"This magazine is also open in another window. Which version do you want to keep?"*
> **Keep what I have here** · **Use the other version**

Never discard without asking. If they keep the current window's version, save with the server's `rev` to force through. The old copy is still in `mbVersions` if they published, and in IndexedDB either way.

---

## D-10 — DECIDED. Keep documents, prune images

Real, and cheaper than it looks once separated by cost.

| Artefact | Size | Policy |
|---|---|---|
| Document JSON in `mbVersions` | ~200KB–1MB | **Keep all.** 24 copies over two years is under 25MB. Trivial. |
| PDF in S3 | 2–20MB | **Keep all.** Users will want old issues, and regenerating needs the old renderer. |
| Page images in S3 | 5–50MB per version | **Keep the latest 5 versions.** Regenerable from the document, and mainly used for thumbnails and social sharing. |

A pruning job runs on publish, removing page images for versions older than the fifth most recent. If an old version's images are requested, regenerate on demand.

Revisit if storage becomes a real cost. It will not at this scale.

---

## D-11 — DECIDED. Constrain it. My error

Correct, and the reviewer's suggestion is right. A generic partial setter absorbs every lane's typed commands and FWD-02 degrades to one instruction meaning anything.

**`item.setProps` is restricted to `ItemBase` fields only:** `frame`, `rotation`, `opacity`, `locked`.

Type it so the restriction is mechanical, not a convention someone can ignore:

```ts
export type ItemBaseProps = Pick<ItemBase, 'frame' | 'rotation' | 'opacity' | 'locked'>;

export interface SetPropsPayload {
  itemId: Id;
  props: Partial<ItemBaseProps>;
}
```

Everything type-specific is a named command owned by its lane — `photo.setCornerRadius`, `shape.setFill`, `text.setAlign`. If a lane wants to add a field to `setProps`, that is a blocker, not a shortcut.

---

## D-12 — DECIDED. Add invariant 11. My error

Real gap. Invariant 9 covers the front cover and nothing covers the back.

**The rule:**

> With `facingPages` true: the first spread holds one page (front cover) and the last spread holds one page (back cover). Interior spreads hold two, except that when the interior page count is odd, the final interior spread holds one.

**Add as invariant 11.** Lane 4 maintains it when adding, deleting, and reordering pages.

**Why allow an odd interior spread** rather than auto-inserting a blank. Screen-first means no print signature constraint forcing an even count. Silently adding a blank page when someone adds a page is surprising, and surprise is what we are avoiding. A single page in the final interior spread displays cleanly and needs no explanation.

---

## D-13 — DECIDED. Lane 7 rescoped. My error

Correct. I over-assigned. Keyboard operation, screen reader support, zoom and contrast are properties of every component, not one lane's deliverable.

**Lane 7 owns:**

- HLP-01 to 03 — guided tour, panel help, text-size setting
- Error boundaries at app, canvas and panel level
- The logger
- The vocabulary scan (GL-08) as tooling
- The touch-target audit (GL-01) as tooling
- Shell-level accessibility — landmarks, focus management, skip links
- Running the global audits before acceptance

**Every other lane owns its own compliance** with GL-01, GL-02, GL-04, GL-10, GL-11, GL-13, GL-14 for the components it builds — exactly where RULES §7's checklist already puts it.

Lane 7 builds the tools that catch failures. It does not fix other lanes' components.

---

## D-14 — DECIDED. Add a per-version URL. My error

Correct. PUB-03 requires each version to offer its link, and I specified only the stable one.

```
GET /m/:publishId            → the latest published version
GET /m/:publishId/v/:n       → that specific version, frozen
```

The bare URL is what gets shared and what reader engagement attaches to — that is the point of the stable-`publishId` model and why per-version-only URLs were reverted on 2026-08-11. Versioned URLs exist for the version list, downloads, and comparison.

A versioned page shows a plain-language note — *"This is version 2, published 3 March. See the current version."* — so nobody thinks they are looking at the live magazine.

---

## D-15 — DECIDED. No migration, but export before deleting

Scope is confirmed: no migration, and the old editor is removed at cutover.

**One cheap safety measure.** Before deleting `magazinesV2`, run a script that publishes every existing magazine to PDF and stores it against its owner. If there is real work in there, it is preserved as a document even though it is no longer editable. If there is nothing, the script finds nothing and costs an hour.

**Do not build a converter.** The old model has no stories, no threading, and no saved looks. A conversion produces loose text boxes with inline formatting — worse to edit than starting from a ready-made design.

Keep the old editor behind its flag, read-only, until the new one has passed acceptance. Then delete.

---

## Summary

| # | Decision | Blocks |
|---|---|---|
| D-01 | Fractional order key on `Item` and `Paragraph` | `mb-schema` — **do this first** |
| D-02 | Resolved — Amendment 1 §3 | `mb-schema` |
| D-03 | Default `'warn'`; `'shrink'` opt-in, floored, per box | `mb-schema` |
| D-04 | Both Amendment 1 files exist — add them | Everything |
| D-05 | Resolved — Amendment 1 §5 | Shell |
| D-06 | Fixed regions, capped groups; needs a requirements amendment | Panels |
| D-07 | Resolved — Amendment 1 §4 | Lane 6 |
| D-08 | Resolved — Amendment 1 §6 | Lanes 1, 2, 5 |
| D-09 | Gzip, 5s idle debounce, 60s ceiling; conflict asks rather than reloads | Lane 6 |
| D-10 | Keep documents and PDFs; prune page images past 5 versions | Lane 6 |
| D-11 | `item.setProps` restricted to `ItemBase` fields | All lanes |
| D-12 | Invariant 11 — back cover single, odd interior allowed | Lane 4 |
| D-13 | Lane 7 owns tooling and help; compliance stays per lane | All lanes |
| D-14 | Add `/m/:publishId/v/:n` | Lane 6 |
| D-15 | No migration; export to PDF before deleting | Cutover |

**Lane 0 is unblocked.** D-01 and D-03 change `mb-schema` and should be applied before it is written.

Still outstanding, and it is a requirements change rather than a FOUNDATION one: the D-06 amendment to GL-09 and GL-15. I will write it next unless you want Lane 2 first.
