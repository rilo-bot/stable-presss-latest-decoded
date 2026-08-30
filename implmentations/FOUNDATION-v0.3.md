# Magazine Builder — Technical Foundation

**Version:** 0.3 — the single source of truth
**Scope:** Lane 0 — the core every other lane builds on
**Companions:** Product Requirements v2.0, RULES.md + Amendment 1, agents-work.md

---

## 0. Status

This document **supersedes and replaces**:

- FOUNDATION.md (v0.1)
- FOUNDATION-v0.2.md
- FOUNDATION-v0.2-AMENDMENT-1.md
- FOUNDATION-v0.2-AMENDMENT-2.md
- DECISIONS-D01-D15.md

Archive all five. Everything in them that survived review is folded in here.

**Why consolidate.** Reconstructing `dispatch()` required reading v0.2 §6.1, then Amendment 1 §1, then Amendment 2 §3 — where the third deleted the second. Reconstructing `TextBox` required four documents. That chain produced a real error: Amendment 2 §4 claimed to replace "§7, the store section", but v0.2 §7 is *Text and threading* and has no store section at all. Read literally it deleted the threading specification.

One document removes that class of error.

**RULES.md and its Amendment 1 stay separate** — they govern how code is written, not what is built.

---

## 1. Scope

### Replaced

| Path | Lines | Why |
|---|---|---|
| `apps/web/src/editor-v2/` | 8,063 | The UX failure this rebuild exists to fix |
| `apps/server/src/routes/magazinesV2/index.ts` | 3,022 | One file, no test coverage, direct mutation |
| The `MagazineElement` model | — | No stories, no threading, no saved looks |
| The client undo stack | — | Add, delete and page ops are not on it |

### Untouched

Auth, OTP, RBAC, the user model, `lib/db.ts`, `lib/ensureIndexes.ts`, `lib/storage.ts`, the worker queue, Pexels, PDF/DOCX extraction, `fontMetrics.data.ts`, and every existing collection.

**Built alongside.** The old editor stays behind `MAGAZINE_V2=true` and keeps working until the new one passes acceptance. No migration of existing magazines — but before deletion, run a script publishing every existing magazine to PDF so nothing is lost.

---

## 2. Stack

| Layer | Choice | Note |
|---|---|---|
| Package manager | npm workspaces | Existing. No Turborepo, no pnpm. |
| Frontend | React 18.3 + Vite 5.4 + TypeScript | Existing |
| Routing | react-router-dom 6.26 | Existing |
| UI state | Zustand 4.5 | Existing |
| Magazine data | **Plain JSON + Immer** | New |
| Styling | Tailwind 3.4 + Radix primitives | Existing |
| Backend | Express, `apps/server` | Existing |
| Database | Raw `mongodb` driver v6 via `lib/db.ts` | Existing. No ODM. |
| Storage | `lib/storage.ts` | Existing |
| Queue | Existing Mongo poll queue | Existing |
| PDF | Puppeteer printing an internal render route | Existing pattern |
| Logging | pino | New |

**Five new dependencies, total:** `immer`, `idb-keyval`, `nanoid`, `pino`, `fractional-indexing`. Nothing else without Lane 0 approval.

---

## 3. Decisions

### ADR-001 — Plain JSON with Immer, not a CRDT

The magazine is a plain JSON object. Commands mutate an Immer draft; the result commits only after validation passes.

Yjs was considered and rejected. It was justified as insurance against a painful collaboration retrofit, but the retrofit is contained anyway because the command layer isolates it — a handler writing `item.frame.x = 5` does not care what the draft is underneath. Against that, Yjs applies mutations as they happen and does not roll back on throw, requiring a `Y.UndoManager` purely as a safety net; and documents become binary blobs in S3 rather than readable JSON in Mongo.

Immer's `produce()` gives validate-then-commit for nothing. A command that throws leaves the previous state completely untouched.

**Honest limit:** this protects against throws, not against a handler that returns normally having made a wrong change. Section 6.2 addresses that with always-on structural validation.

**If collaboration becomes real:** write a second `Store` implementation behind the same interface, add a relay and presence UI, run a one-time conversion. The one case this does not cover is two people typing in the same paragraph simultaneously — nothing but a text CRDT handles that, and it is the only scenario that would justify taking on Yjs now.

### ADR-002 — Pixels in page-canonical space

Coordinates are pixels in the page's own canonical space, matching the existing convention: A4 at 150 DPI is 1240 × 1754.

The PDF is produced by Chromium printing HTML (ADR-004), so nothing ever needs a point value. Pixels match the existing extraction pipeline's output space, so that pipeline can later feed the new model with no conversion.

Pages carry their own `width` and `height`, so mixed page sizes work at the model level.

### ADR-003 — Commands are the only write path

Every change is a typed command carrying its own inverse. Nothing mutates a magazine by any other route.

This is what the existing editor most lacks and what the AI phase most needs: free undo/redo, a single validation point, and a surface the AI can drive later.

### ADR-004 — Puppeteer prints an internal render route

PDF output is headless Chromium navigating an internal render route and printing it.

Screen-first means no CMYK, no bleed, no embedded font subsets — none of the things that would require a dedicated PDF writer. Rendering the actual page guarantees the PDF matches what readers see *by construction*, with no second layout engine to reconcile.

The route is **not** the public one. See §11.3.

### ADR-005 — HTML and CSS text, browser line breaking

Text renders as HTML with CSS. The browser breaks lines.

With ADR-004 there is no independent server-side writer, so the browser's own line breaking is authoritative in both places. Threading still needs our logic, but far less than a full line-breaking engine — see §9.

### ADR-006 — One page renderer, three consumers

The editor canvas, the public reader, and the PDF all render through a single component. Any divergence between them is impossible by construction, because there is only one implementation.

The existing system already does this. Keep it.

### ADR-007 — Strictness scoped to new code

New `packages/*` compile under full strict settings. Existing apps keep their configuration.

The survey measured 2,092 errors from applying RULES §9.1 repo-wide, of which 1,708 are `verbatimModuleSyntax` — a CommonJS-versus-ESM incompatibility requiring a server ESM migration. That flag is dropped entirely. Fixing 381 further errors in untouched code is pure friction.

---

## 4. Where the new code lives

Namespaced as `magazine-builder` so nothing collides with `magazineV2` while both run.

```
packages/
  mb-schema/            types, validation, defaults. ZERO dependencies.
  mb-commands/          registry, dispatch, history
  mb-store/             Immer store, persistence
  mb-render/            page renderer, thread layout

apps/web/src/magazine-builder/
  shell/                Lane 0 — toolbar slots, panels, selection
  features/             one directory per lane
    interaction/  text/  photos/  pages/  colour/  shapes/

apps/server/src/
  lib/magazineBuilder/          domain modules
  routes/magazineBuilder/       split by concern, never one file

apps/worker/src/jobs/publishMagazine.ts
```

**Routes**

| Surface | Path |
|---|---|
| Studio library | `/magazine-builder` |
| Studio editor | `/magazine-builder/:id` |
| Public reader, latest | `/m/:publishId` |
| Public reader, a version | `/m/:publishId/v/:n` |
| Internal render (token-gated) | `/internal/render/:magazineId` |
| API | `/api/magazine-builder/*` |

**Feature flag:** `MAGAZINE_BUILDER=true`. With it off, every route 404s.

**Import rules** (ESLint):

- `mb-schema` imports nothing.
- `mb-commands` imports `mb-schema` only.
- `mb-store` imports `mb-schema` and `mb-commands`.
- `mb-render` imports `mb-schema` only. It never dispatches.
- `features/*` may import `packages/*` and `shell/`, never another feature.

---

## 5. The magazine model

`packages/mb-schema/src/`, split so no file approaches the line cap:

```
primitives.ts  magazine.ts  items.ts  text.ts
assets.ts      units.ts     validation.ts  defaults.ts  index.ts
```

### 5.1 Primitives

```ts
/** Pixels in page-canonical space. A4 at 150 DPI = 1240 x 1754. */
export type Px = number;

/** nanoid(12), URL-safe. */
export type Id = string;

/** Fractional index from `fractional-indexing`. Sorts lexicographically. */
export type OrderKey = string;

export interface Rect { x: Px; y: Px; w: Px; h: Px; }
export interface Insets { top: Px; right: Px; bottom: Px; left: Px; }

/** Screen-first: RGB hex only. */
export type Color = string;
```

### 5.2 Units — the UI boundary

The document is pixels throughout. Users never see pixels.

| What the user sees | Unit |
|---|---|
| Position, size, margins, spacing | **millimetres** |
| Text size | **points** |
| Outline and line thickness | **points** |

```ts
// units.ts
export const DPI = 150;
export const PX_PER_MM = DPI / 25.4;      // 5.9055...
export const PX_PER_PT = DPI / 72;        // 2.0833...

export function pxToMm(px: Px): number { return px / PX_PER_MM; }
export function mmToPx(mm: number): Px  { return mm * PX_PER_MM; }
export function pxToPt(px: Px): number  { return px / PX_PER_PT; }
export function ptToPx(pt: number): Px  { return pt * PX_PER_PT; }
```

Conversion happens **only at the UI boundary**. Nothing in `mb-schema`, `mb-commands`, or `mb-store` sees millimetres or points. Display rounds to one decimal for millimetres, whole numbers for points.

Add to the RULES vocabulary list: never say pixels, px, or DPI.

### 5.3 Root

```ts
export interface Magazine {
  id: Id;
  schemaVersion: 1;

  meta: {
    title: string;
    slug: string;
    ownerId: Id;
    createdAt: string;
    updatedAt: string;
  };

  pageSetup: {
    width: Px;
    height: Px;
    margin: Insets;
    facingPages: boolean;
  };

  backgrounds: Record<Id, RepeatingBackground>;

  /** Ordered. spreads[0] is the front cover. */
  spreads: Spread[];

  /** Text content, separate from the boxes that show it. */
  stories: Record<Id, Story>;

  looks: Record<Id, SavedLook>;
  palette: Color[];
  assets: Record<Id, AssetRef>;
}

export interface Spread {
  id: Id;
  pages: Page[];
}

export interface Page {
  id: Id;
  width: Px;
  height: Px;
  backgroundId: Id | null;
  backgroundColor: Color | null;
  /** Stored sorted by `order`. Array position IS z-order at read time. */
  items: Item[];
  hiddenBackgroundItems: Id[];
  columns: { count: number; gutter: Px } | null;
}

export interface RepeatingBackground {
  id: Id;
  name: string;
  items: Item[];        // also sorted by `order`
}
```

### 5.4 Items

```ts
export type Item = TextBox | Photo | Shape | Group;

interface ItemBase {
  id: Id;
  /** Fractional index. Unique within its containing collection. */
  order: OrderKey;
  frame: Rect;
  rotation: number;
  opacity: number;          // 0..1 — on EVERY item
  locked: boolean;
}

export interface TextBox extends ItemBase {
  type: 'text';
  storyId: Id;
  nextBoxId: Id | null;
  prevBoxId: Id | null;
  insets: Insets;
  columns: { count: number; gutter: Px };
  verticalAlign: 'top' | 'center' | 'bottom';

  /** Default 'warn'. See §9.3. */
  overflow: 'warn' | 'shrink';
  /** Floor for 'shrink'. Below this, stop shrinking and warn. Default 0.7. */
  minFontScale: number;
}

export interface Photo extends ItemBase {
  type: 'photo';
  assetId: Id;
  fit: { mode: 'fill' | 'fit' | 'manual'; sourceRect: Rect | null };
  flipH: boolean;
  flipV: boolean;
  cornerRadius: Px;
  textWrap: { gap: Insets } | null;      // rectangle wrap only in v1
}

export interface Shape extends ItemBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  cornerRadius: Px;
  fill: Color | null;
  stroke: { color: Color; width: Px } | null;
  textWrap: { gap: Insets } | null;
}

export interface Group extends ItemBase {
  type: 'group';
  children: Item[];         // also sorted by `order`
}
```

The old model's `qr` and `icon` types are not carried over. Neither appears in the requirements. If needed, they are a new requirement, not a silent addition.

### 5.5 Text

Content is stored **separately from the boxes that display it**. This is what makes threading work: adding a word reflows every box in the chain, and no box changes.

```ts
export interface Story {
  id: Id;
  paragraphs: Paragraph[];        // sorted by `order`
}

export interface Paragraph {
  id: Id;
  order: OrderKey;
  lookId: Id;
  overrides: Partial<ParagraphProps>;    // keep sparse
  runs: TextRun[];
  listType: 'none' | 'bullet' | 'number';
}

export interface TextRun {
  text: string;                          // plain text, never HTML
  overrides: Partial<CharacterProps>;
}

export interface ParagraphProps {
  align: 'left' | 'center' | 'right' | 'justify';
  firstLineIndent: Px;
  leftIndent: Px;
  rightIndent: Px;
  spaceBefore: Px;
  spaceAfter: Px;
  lineHeight: number;                    // multiplier of font size
  character: CharacterProps;
}

export interface CharacterProps {
  fontFamily: string;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  italic: boolean;
  underline: boolean;
  fontSize: Px;
  letterSpacing: Px;
  color: Color;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface SavedLook {
  id: Id;
  name: string;               // user-visible: 'Heading', 'Body text'
  props: ParagraphProps;
}
```

**Runs carry plain text, never HTML.** The old model stored sanitised inline HTML per element, which is why it has no styles and no threading.

### 5.6 Assets

```ts
export interface AssetRef {
  id: Id;
  hash: string;                          // SHA-256 of the original
  source: 'upload' | 'pexels';
  mimeType: string;
  intrinsic: { w: Px; h: Px };
  originalFilename: string;
  credit: string | null;                 // Pexels requires attribution
  storageKey: string;
}
```

### 5.7 Invariants

`validateMagazine(m): ValidationError[]` in `validation.ts`. It **reports; it never repairs.** The old system's `validateElements()` clamps and drops silently, which is how invalid state becomes invisible.

1. Every `TextBox.storyId` resolves in `stories`.
2. Thread links are symmetric: `A.nextBoxId === B` implies `B.prevBoxId === A`.
3. Thread chains are acyclic and every box in a chain shares one `storyId`.
4. Exactly one box per chain has `prevBoxId === null`.
5. Every `lookId` resolves in `looks`.
6. Every `assetId` resolves in `assets`.
7. Item ids are unique across the whole magazine, **including inside groups and repeating backgrounds**.
8. No frame has zero or negative width or height.
9. `spreads[0].pages.length === 1` when `facingPages` is true.
10. **Order keys are unique within their containing collection, and every ordered array is sorted by them.** This applies to `Page.items`, `Group.children`, `RepeatingBackground.items`, and `Story.paragraphs` — the same reach as invariant 7.
11. **With `facingPages` true:** the first spread holds one page (front cover) and the last spread holds one page (back cover). Interior spreads hold two, except that when the interior page count is odd, the final interior spread holds one.

Invariant 11 allows an odd interior spread deliberately. Screen-first means no print signature forcing an even count, and silently inserting a blank page when someone adds a page is surprising. A single page in the final interior spread displays cleanly and needs no explanation.

### 5.8 Split validation — cheap always, full in dev

ADR-001 protects against a handler that throws. It does not protect against one that returns normally having made a wrong change. Split the checker:

```ts
/** Cheap. Runs after EVERY command, in every environment. */
export function validateStructure(m: Magazine): ValidationError[];
// invariants 1-7, 10 — id resolution, thread symmetry, uniqueness, sort order

/** Expensive. Dev and tests only. */
export function validateMagazine(m: Magazine): ValidationError[];
// everything, including geometry and spread parity
```

Structural checks are id lookups and array scans — microseconds on a 24-page magazine. They catch the failures that corrupt a document. Run them always.

---

## 6. The command layer

`packages/mb-commands`. The heart of the system.

```ts
export interface Command<T = unknown> {
  type: string;
  payload: T;
  coalesceKey?: string;
}

export interface CommandResult {
  inverse: Command;
  dirty: Id[];
}

export type CommandHandler<T> = (draft: Magazine, payload: T) => CommandResult;
```

### 6.1 Registry

```ts
export function registerCommand<T>(type: string, handler: CommandHandler<T>): void {
  if (registry.has(type)) throw new Error(`Command already registered: ${type}`);
  registry.set(type, handler);
}
```

Throwing on duplicates is how two lanes choosing the same command name surfaces immediately rather than weeks later.

### 6.2 Dispatch

```ts
import { produce } from 'immer';

export function dispatch(cmd: Command): DispatchResult {
  const handler = registry.get(cmd.type);
  if (!handler) return { ok: false, reason: 'unknown-command' };

  let result: CommandResult | undefined;

  const next = produce(store.current, (draft) => {
    result = handler(draft, cmd.payload);
  });

  if (!result) return { ok: false, reason: 'handler-produced-nothing' };

  // ALWAYS — cheap, catches corruption
  const structural = validateStructure(next);
  if (structural.length > 0) {
    throw new InvariantError(`${cmd.type}: ${structural[0].message}`);
  }

  // DEV and tests only — expensive
  if (config.validateFully) {
    const errors = validateMagazine(next);
    if (errors.length > 0) {
      throw new InvariantError(`${cmd.type}: ${errors[0].message}`);
    }
  }

  store.commit(next);
  history.push({ command: cmd, inverse: result.inverse });
  return { ok: true, dirty: result.dirty };
}
```

`store.current` is never touched on any failure path. There is nothing to roll back.

### 6.3 No bundler globals

```ts
// packages/mb-commands/src/config.ts
export interface DispatchConfig {
  validateFully: boolean;
}

let config: DispatchConfig = { validateFully: false };
export function configureDispatch(next: DispatchConfig): void { config = next; }
```

```ts
// apps/web/.../shell/bootstrap.ts
configureDispatch({ validateFully: import.meta.env.DEV });

// packages/mb-commands/test/headless-build.test.ts
configureDispatch({ validateFully: true });
```

**`packages/mb-*` contain no `import.meta.env`, no `process.env`, no `window`.** They run in the browser, in Node tests, and potentially in the worker. Anything environmental is injected.

### 6.4 Handler rules

- Pure with respect to payload.
- **Validate everything before the first mutation.** A handler that discovers a problem halfway through has a bug in its precondition checks.
- Return a genuine inverse — `item.move` inverses to `item.move` with the old position.
- Never dispatch from inside a handler. Compose in the caller.

### 6.5 History

At least 50 steps (GL-06), default 100. Commands sharing a `coalesceKey` within 500ms merge into one entry — a drag produces dozens of `item.move` commands and one undo step.

**Everything is on the stack**, including add, delete, and page structure. The old editor excluded these and that is why its undo is untrustworthy.

### 6.6 Commands must be mergeable

Two rules, mandatory from the first handler.

**Identify entities, never positions.**

```ts
// FORBIDDEN — two concurrent reorders produce nonsense
item.reorder { itemId, toIndex: 3 }

// CORRECT — a fractional key generated between neighbours
item.reorder { itemId, afterId: Id | null, beforeId: Id | null }
```

The handler resolves neighbours to their order keys and calls `generateKeyBetween`. This is also more robust today: an index computed against a stale view is wrong even with one user and two tabs.

**Text operations are offsets into an identified paragraph.**

```ts
// FORBIDDEN — destroys concurrent edits, ruins undo granularity
text.replaceContent { storyId, paragraphs: [...] }

// CORRECT
text.insert { paragraphId, offset, text }
text.delete { paragraphId, offset, length }
```

**The test for any new command:** could two people issue this at the same time against the same magazine and get a sensible result?

### 6.7 Foundation command set

Lane 0 implements these. Other lanes register their own alongside.

| Command | Payload |
|---|---|
| `item.create` | `{ pageId, item, afterId, beforeId }` |
| `item.delete` | `{ itemId }` — must repair thread links |
| `item.move` | `{ itemId, x, y }` |
| `item.resize` | `{ itemId, frame }` |
| `item.rotate` | `{ itemId, degrees }` |
| `item.setProps` | `{ itemId, props }` — **`ItemBase` fields only** |
| `item.reorder` | `{ itemId, afterId, beforeId }` |
| `item.setLocked` | `{ itemId, locked }` |
| `text.insert` | `{ paragraphId, offset, text }` |
| `text.delete` | `{ paragraphId, offset, length }` |
| `text.splitParagraph` | see below |
| `text.mergeParagraph` | see below |

**`item.setProps` is constrained**, so it cannot become an escape hatch that absorbs every lane's typed commands:

```ts
export type ItemBaseProps = Pick<ItemBase, 'frame' | 'rotation' | 'opacity' | 'locked'>;
export interface SetPropsPayload { itemId: Id; props: Partial<ItemBaseProps>; }
```

Everything type-specific is a named command owned by its lane — `photo.setCornerRadius`, `shape.setFill`, `text.setAlign`. A lane wanting to widen `setProps` files a blocker, not a shortcut.

**Paragraph split and merge** are here, not in Lane 2, because pressing Enter mid-paragraph and Backspace at offset 0 are the two most common editing actions after typing, and both need order keys:

```ts
export interface SplitParagraphPayload {
  paragraphId: Id;
  offset: number;
  /** Caller-supplied so the inverse can name it. */
  newParagraphId: Id;
  /** Present only when this command is serving as the inverse of a merge. */
  restore?: { lookId: Id; overrides: Partial<ParagraphProps>;
              listType: Paragraph['listType'] };
}
// inverse: text.mergeParagraph { paragraphId: newParagraphId }

export interface MergeParagraphPayload {
  /** This paragraph merges INTO the one before it. */
  paragraphId: Id;
}
// inverse: text.splitParagraph with `restore` carrying the merged paragraph's
// look, overrides and list type, so undo is faithful.
```

The new paragraph's order key is generated between its neighbours. Merge frees the key.

### 6.8 FWD-02 — the AI depends on this

Every requirement must be achievable by dispatching commands alone, with no UI. When the AI phase arrives it emits exactly these commands, and the existing generation pipeline is retargeted to emit them rather than writing elements directly.

`packages/mb-commands/test/headless-build.test.ts` builds a magazine with `dispatch()` only — no DOM, plain Node. Extend it as lanes land. Anything not reachable this way will be impossible for the AI to do.

---

## 7. The store

`packages/mb-store`.

```ts
export interface Store {
  /** The current magazine. Immutable — never mutate directly. */
  readonly current: Magazine;

  /** Replace the current magazine. Called only by dispatch. */
  commit(next: Magazine): void;

  subscribe(listener: (next: Magazine, dirty: Id[]) => void): () => void;

  snapshot(): Magazine;
  load(magazine: Magazine): void;

  /** Optimistic concurrency against the server copy. */
  readonly rev: number;
}
```

Deliberately shaped so a CRDT-backed implementation could replace it without touching anything else.

**Immer setup:** `ThreadLayout` uses `Map`, so call `enableMapSet()` once at initialisation.

**Structural sharing:** Immer preserves object identity for unchanged branches, which is what lets the renderer skip work. Spreading everything — `{...page, items: [...page.items]}` — destroys that. Mutate the draft directly; that is the point of Immer.

**Client backup:** write to IndexedDB (`idb-keyval`) on a 2-second debounce alongside the server autosave. If a save fails or the laptop closes, work survives. GL-16 requires this regardless of the store.

---

## 8. Rendering

One component, three consumers (ADR-006): editor canvas, public reader, PDF.

```ts
export interface PageRendererProps {
  page: Page;
  magazine: Magazine;
  threadLayout: ThreadLayout;
  mode: 'edit' | 'read';
}
```

**Rules:**

- Read-only. It never dispatches. It reports pointer events upward.
- Zoom and pan use CSS `transform` only. Never re-layout for zoom.
- **Virtualise from the start.** Mount only spreads in view plus one either side. The old editor mounts every page and that is a known problem; retrofitting is painful.
- Scaling uses container queries and `cqw` units, as the existing renderer does. That approach is proven and prints correctly.
- Items render in array order, which is `order` order.

---

## 9. Text and threading

Much smaller than a line-breaking engine, because the browser breaks lines (ADR-005). We only need to know **where a story overflows a box**.

### 9.1 Contract

```ts
export interface ThreadLayout {
  /** Per box, the slice of the story it displays. */
  slices: Map<Id, { fromParagraph: number; fromOffset: number;
                    toParagraph: number; toOffset: number }>;
  /** Per box, the scale applied to reach a fit. 1 = none. */
  fontScale: Map<Id, number>;
  /** > 0 triggers the TXT-12 warning. */
  overflowParagraphs: number;
}
```

**`fontScale` is derived and lives here, never in the document.** Storing it would create a second source of truth that goes stale the moment the box or the content changes. The old element model stored fitted `fontSize` alongside `maxFontSize` and `minFontSize`, which is why its text behaviour is hard to reason about.

Publish renders through the same browser code path, so `fontScale` is recomputed identically. Nothing needs storing.

### 9.2 How it works

Render the story into the first box, measure with the DOM, binary-search the split point where content stops fitting, pass the remainder to the next box, repeat.

Cache per box, keyed on box size plus story revision. Invalidate forward from the first change only.

### 9.3 What happens when text does not fit

**Default is `'warn'`.** Text is clipped, the box shows an unmissable warning, and nothing changes without the user knowing.

Not shrink, because our user is 80. Silent shrink-to-fit is exactly the class of invisible behaviour that makes software confusing — they type three more sentences, everything quietly gets smaller, and they cannot work out why. Worse, they may not notice and publish something they cannot read.

Not grow, because items would overlap and a layout that rearranges itself while you type violates Principle 4.

**`'shrink'` is available per box**, off by default, bounded by `minFontScale` (default 0.7). When shrinking hits the floor and still does not fit, it falls back to warning.

Per box, not per look — overflow is about the box's geometry, not the text's style.

**TXT-12's warning offers three actions**, each one click and each undoable:

| Action | What it does |
|---|---|
| *"Make this box bigger"* | Grows the box downward within page bounds, stopping before it would overlap a locked item. Lane 2 defines the exact rule. |
| *"Make the text smaller"* | Sets `overflow: 'shrink'` on this box. One field, no look edited, no paragraph overrides written. |
| *"Continue in another box"* | Starts the threading flow. Lane 2 defines where the new box is placed. |

"Make the text smaller" deliberately reuses `shrink` rather than writing paragraph overrides. Overrides would silently detach paragraphs from their saved look and get messy across a multi-paragraph box; editing the look itself would change every other box using it.

### 9.4 Threading and repeating backgrounds

A text box inside a repeating background **cannot be threaded**. The connect control is unavailable there.

Simplest rule, nothing surprising for the user, and it avoids a background item behaving unlike every other background item. Lane 4 enforces it; Lane 2 hides the control.

---

## 10. The shell

`apps/web/src/magazine-builder/shell/`. Lane 0 builds the frame; lanes fill the slots.

```ts
export type ToolbarSlot =
  | 'file'        // new, save state, publish
  | 'undo'        // GL-06 — always visible, never moves
  | 'insert'      // add text, photo, shape
  | 'arrange'     // align, order, lock, group
  | 'zoom';       // DOC-08

export type PanelSlot =
  | 'pages'       // left sidebar   — Lane 4
  | 'properties'  // right sidebar  — the selected item's controls
  | 'library';    // right sidebar  — photo library, Lane 3

export function registerToolbarItem(slot: ToolbarSlot, item: ToolbarItem): void;
export function registerPanel(slot: PanelSlot, panel: PanelDef): void;
```

### 10.1 GL-09 and GL-15 — regions are fixed, groups are capped

These two global requirements contradict each other as originally written. GL-09 requires every control present at all times; GL-15 caps a panel at seven options. Text alone needs about fifteen controls.

**The resolution:**

> **GL-09** guarantees fixed *regions* in fixed positions. The properties panel always occupies the same place and its sections always appear in the same order.
>
> **GL-15** caps each *visible group* at seven options, where **one option means one labelled control group**. Bold/italic/underline is one option, not three. Alignment's four buttons are one option. Beyond seven, the rest go behind a labelled "More settings" **within that section**, never elsewhere.

**Section order is fixed for every item type:**

1. Size & position
2. Appearance — type-specific
3. Colour
4. Arrange — order, lock, group

A section that does not apply to the current selection **is shown and disabled, never removed**. Our users navigate by position; sections that come and go force re-orientation every time.

*This requires a matching amendment to requirements GL-09 and GL-15.*

### 10.2 Selection

Lives in Zustand, not in the magazine — per-user, never saved.

```ts
export interface SelectionState {
  itemIds: Id[];
  textRange: { storyId: Id; start: number; end: number } | null;
  hoveredId: Id | null;        // ARR-02
}
```

`hoveredId` is here because ARR-02 requires hover feedback and FWD-07 requires selection to be readable as data.

---

## 11. Backend

### 11.1 Auth — existing, unchanged

```ts
router.use(featureFlag('MAGAZINE_BUILDER'));
router.use(attachAccount);           // existing
router.use(requireMagazineAccess);   // existing RBAC verb
router.use(rateLimit('mb-write', 300));
```

`ownerId` is `req.account.id`. No new access tier, no RBAC changes.

### 11.2 Router — split by concern

```
routes/magazineBuilder/
  index.ts          mounting and middleware only
  magazines.ts      CRUD, duplicate, rename
  snapshot.ts       autosave
  publish.ts        publish, versions, restore
  assets.ts         upload URLs, registration
  photos.ts         Pexels proxy
```

Business logic goes in `lib/magazineBuilder/` as pure modules, testable without a Router — the pattern the existing tests already rely on. The old router is 3,022 lines in one file and untestable because it cannot be imported.

### 11.3 API

```
POST   /api/magazine-builder/magazines
GET    /api/magazine-builder/magazines
GET    /api/magazine-builder/magazines/:id
PATCH  /api/magazine-builder/magazines/:id
POST   /api/magazine-builder/magazines/:id/duplicate
DELETE /api/magazine-builder/magazines/:id

PUT    /api/magazine-builder/magazines/:id/snapshot
POST   /api/magazine-builder/magazines/:id/publish
GET    /api/magazine-builder/magazines/:id/versions
POST   /api/magazine-builder/magazines/:id/restore

POST   /api/magazine-builder/assets/upload-url
POST   /api/magazine-builder/assets/confirm
GET    /api/magazine-builder/photos/search

GET    /m/:publishId              public, latest version
GET    /m/:publishId/v/:n         public, that version, frozen
GET    /internal/render/:magazineId?token=...
```

**The internal render route** is how publish reaches the draft. The token is an HMAC over `{ magazineId, exp }` using `JWT_SECRET`, five-minute expiry. The route is not linked, not in the client bundle, and 404s without a valid token.

`/m/:publishId` accepts **no version query parameter at all**. The two surfaces are separate by construction rather than by a check somebody can forget.

A versioned page shows a plain-language note — *"This is version 2, published 3 March. See the current version."* — so nobody mistakes it for the live magazine.

### 11.4 Collections

Prefixed `mb`, alongside the existing eight. Add specs to `lib/ensureIndexes.ts`.

```ts
// mbMagazines — the working copy lives here, not in S3
{ _id, ownerId, title, slug, createdAt, updatedAt,
  document: Magazine,
  rev: number,
  latestVersion: number,
  publishId: string,        // STABLE — never changes
  thumbnailKey }

// mbVersions — append-only. No update path exists in the API.
{ _id, magazineId, version, publishedAt,
  document: Magazine, pdfKey, pageImageKeys, pageCount }

// mbAssets
{ _id, ownerId, magazineId, hash, source, mimeType,
  intrinsicW, intrinsicH, credit, storageKey, createdAt }
```

**Publishing model.** `publishId` never changes, so `/m/:publishId` always serves the latest and reader engagement stays attached. This is deliberate: per-version-only URLs were built on this platform and reverted on 2026-08-11 precisely because reactions and comments were orphaned.

**Retention: keep everything.** Document snapshots are small. PDFs and page images are both regenerable in principle and both would drift if the renderer changes, so treating them differently is inconsistent. Storage at this scale is not a real cost. Revisit if it becomes one.

### 11.5 S3

```
public/magazine-builder/{magazineId}/media/{hash}.{ext}
public/magazine-builder/{magazineId}/media/{hash}.proxy.webp     1200px
public/magazine-builder/{magazineId}/media/{hash}.thumb.webp     200px
public/magazine-builder/{magazineId}/published/v{n}/magazine.pdf
public/magazine-builder/{magazineId}/published/v{n}/pages/{i}.png
```

Existing `PUBLIC_PREFIX` convention and bucket policy. Published objects are written once, never overwritten.

Derivatives are new — the existing system has none. `sharp` is already a worker dependency. The editor loads proxies; publish uses originals.

### 11.6 Autosave

```
PUT /api/magazine-builder/magazines/:id/snapshot
Body (gzipped): { document: Magazine, rev: number }

200 { rev }                  saved
409 { rev, document }        stale — server's copy attached
```

- **Debounce 5 seconds after the last command**, not during typing. Continuous typing produces no saves until a pause.
- **Gzip.** Magazine JSON is repetitive and compresses roughly ten to one.
- **Skip entirely if nothing changed** since the last successful save.
- **Ceiling: save at least every 60 seconds** during continuous activity, so a crash never loses more than a minute.

**On a 409, ask — never discard.** With collaboration excluded, the realistic cause is the user's own second tab, and reloading would throw away live work, straight against Principle 3.

> *"This magazine is also open in another window. Which version do you want to keep?"*
> **Keep what I have here** · **Use the other version**

Keeping the current version saves with the server's `rev` to force through. The other copy is in IndexedDB either way.

**Known upgrade path:** if telemetry shows payload size or frequency is a problem, send the command log instead and keep the full-document PUT as recovery. The command layer already makes this possible. Not worth building before there is evidence.

### 11.7 Publish job

Add a type to `JobPayloads` in `lib/magazineBuilder/jobs.ts`; register the handler in `apps/worker/src/index.ts`. Existing queue, no new library.

```ts
publishMagazine: { magazineId: string; requestedBy: string };
```

1. Read the document from Mongo.
2. Puppeteer navigates `/internal/render/:magazineId` with a fresh token, waits for the ready flag, prints the PDF.
3. Render page images from the same page.
4. Upload everything under `published/v{n}/`.
5. **Then** insert the `mbVersions` row and bump `latestVersion`.

Step 5 last — the row must never point at objects that do not exist.

Progress reports through the magazine document (`status`, `stage`), matching the existing pattern. The client polls.

**The queue has no heartbeat and is single-worker-safe only.** Fine at current volume. If publish becomes concurrent, that needs solving first.

---

## 12. Lane 0 deliverables

1. `packages/mb-schema` — types split per §5, `validateStructure()`, `validateMagazine()`, `units.ts`, factory defaults.
2. `packages/mb-commands` — registry, config, dispatch, history with coalescing, the twelve foundation commands each with a working inverse.
3. `packages/mb-store` — Immer store, IndexedDB backup, subscription.
4. `packages/mb-render` — page renderer, virtualisation, hit testing.
5. Thread layout per §9.
6. `magazine-builder/shell` — five toolbar slots, three panel mounts, selection state, the §10.1 section structure.
7. `routes/magazineBuilder/` — every route in §11.3, stubbed where a lane owns it, present and typed. Stubs return `501` with a real error shape, never `{} as T`.
8. Index specs in `lib/ensureIndexes.ts`.
9. `pino` configured and exported.
10. ESLint at root, scoped to new paths.
11. Root `lint`, `typecheck`, `test` scripts.
12. The headless build test, and the undo property test.

**Gate:** agents-work.md §1, every box. Then lanes start.

---

## 13. Lane ownership

| Lane | Owns exclusively | Requirements |
|---|---|---|
| **0 Foundation** | `packages/mb-*`, `shell/`, `routes/magazineBuilder/index.ts` | FWD-01..07 |
| 1 Interaction | `features/interaction` | ARR-01..14, GL-17 |
| 2 Text | `features/text` | TXT-01..14 |
| 3 Photos | `features/photos` | IMG-01..12 |
| 4 Pages | `features/pages` | DOC-01..11 |
| 5 Colour & shapes | `features/{colour,shapes}` | CLR, SHP |
| 6 Backend | `routes/magazineBuilder/*`, `lib/magazineBuilder/`, `jobs/publishMagazine.ts` | PUB-01..08, GL-16 |
| 7 Shared UX | `shell/help`, error boundaries, logger, audit tooling | HLP-01..03 |

**Lane 7 owns tooling and help, not other lanes' compliance.** Keyboard operation, screen reader support, zoom and contrast are properties of every component. Lane 7 builds the vocabulary scan and the touch-target audit and runs the global checks; **each lane owns GL-01, 02, 04, 10, 11, 13, 14 for the components it builds**, exactly where RULES §7's checklist puts it.

Still unowned and needing a person, not a lane: the twelve ready-made designs (DOC-02) and recruiting the elderly testers.

---

## 14. First session

A vertical slice proving the architecture:

- Schema, store, dispatch, undo
- The page renderer drawing one page
- Select, hover feedback, move, resize
- **Two threaded text boxes** — type in the first, watch overflow into the second
- Add a photo from the computer
- Save to Mongo and reload

Threading is the highest-risk piece and the main differentiator. Proving the measure-and-split loop here is worth more than proving a single text box.

Measure real velocity from this before estimating anything else.

---

## 15. Open questions

1. **Requirements amendment for §10.1** — GL-09 and GL-15 need updating to match the regions-and-groups resolution. Decided but not yet written.
2. **The existing AI pipeline.** Working, writing to the old element model. Retarget to emit commands in Phase B, or replace? Not blocking v1.
3. **The 19 existing test suites.** Some test the old model (delete), some test logic worth keeping. Needs one sorting pass.
4. **DOC-02's twelve designs.** A design commission, long lead time, critical path by the time Lane 4 finishes.
5. **Elderly user testing.** Needs an owner and a start date. Recruiting takes weeks.
6. **Old editor removal.** After cutover: delete `editor-v2/`, `routes/magazinesV2/`, `lib/magazineV2/` — keeping extraction and font metrics, which Phase B still needs.
