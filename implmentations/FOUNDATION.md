# Magazine Builder — Technical Foundation

**Version:** 0.1
**Scope:** Lane 0 only — the core that every other lane builds on
**Companion:** Product Requirements v2.0

---

## 0. How to use this document

This defines the **foundation layer**: the data model, the command layer, the store, the renderer contract, and the editor shell. It is built by **one agent, sequentially, with nobody else running.**

Read this before writing any code.

### The rule that makes parallel work possible

> **Everything in this document must exist before any parallel lane starts.**

Not implemented — but *present*, with correct types and signatures, even if a function body is `throw new Error('not implemented')`. Parallel lanes import from these files constantly. If a lane has to create a shared type because it doesn't exist yet, two lanes will create it differently and you will spend more time reconciling than you saved.

### Non-negotiables

1. **Nothing mutates a magazine except through a command.** No exceptions, no shortcuts, not even "just this once for a quick fix". This is requirement FWD-01 and it is the single most important rule in the codebase.
2. **No lane edits a file owned by another lane.** Section 11 assigns every path an owner.
3. **Types live in `packages/schema` and nowhere else.** If you are about to define a type another lane will use, it belongs there.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Strict mode on |
| State | Zustand for UI state, Yjs for magazine data | Two separate concerns, kept separate |
| Magazine store | Yjs | Local now, networked later, same schema |
| Rendering | DOM + SVG | See ADR-003 |
| Backend | Node + Express + TypeScript | |
| Database | MongoDB via Mongoose | Metadata and snapshot pointers |
| Object storage | S3 | Assets, snapshots, published output |
| Jobs | Existing worker setup | Publish rendering, asset derivatives |
| PDF output | `pdf-lib` | Server-side, screen-quality RGB |
| Monorepo | Turborepo + pnpm workspaces | |

### ADR-001 — Yjs from day one, sync server later

**Decided.** The magazine is a Yjs document from the first commit. No sync server in v1.

Yjs is a local CRDT data structure — it works fine with one user. Adding multi-user later means adding a WebSocket provider on the client and a small relay server, with **no schema change and no rewrite**. Retrofitting a CRDT onto plain JSON later means rewriting every command handler.

Cost now: a slightly less familiar API for reads and writes. Cost of retrofitting later: weeks.

*Rejected:* plain JSON with a version field. Cheaper today, expensive the moment collaboration is wanted.

### ADR-002 — Points as the only unit

**Decided.** `type Pt = number`, where 1pt = 1/72 inch. Every coordinate, size, and spacing value in the magazine is in points.

PDF's native unit, so export needs no conversion and accumulates no float error. Screen conversion is a single multiply (`px = pt * 96/72 * zoom`) applied in the renderer only.

The user never sees points — the UI shows millimetres or inches per Section 9 of the requirements.

### ADR-003 — DOM + SVG renderer

**Decided.** The page renders as positioned `<div>`s for images and shapes, and `<svg>` for text.

Text editing, IME, selection, and accessibility work for free. Element counts here are low. Canvas would mean reimplementing carets and text selection, which is months of work that is never quite right.

**Behind an interface** (Section 8) so it can be swapped if element counts ever demand it.

### ADR-004 — Browser text metrics, own line breaking

**Decided.** Text measurement uses the browser's `TextMetrics`. Line breaking, wrapping, and threading are ours.

This is the big saving from going screen-first. Print output would have required HarfBuzz shaping and Knuth–Plass breaking on both client and server to guarantee identical output. Screen-first means the PDF is generated from the same browser-measured layout, so browser metrics are the source of truth and there is nothing to reconcile.

**Consequence:** the PDF writer must receive pre-computed line positions from the client, not recompute them. Section 9.4.

### ADR-005 — Commands are the only write path

**Decided.** Every change to a magazine is a typed command carrying its own inverse.

Free undo/redo, a single validation point, a clean seam for the AI phase (FWD-02), and testability — commands are pure data.

---

## 2. Repository structure

```
apps/
  web/                    React editor (Vite)
  api/                    Express API
  viewer/                 Public read-only magazine viewer

packages/
  schema/                 Types, validation, defaults.  ZERO dependencies.
  commands/               Command definitions, handlers, registry, history
  store/                  Yjs binding, document lifecycle
  canvas/                 Renderer — DOM/SVG implementation
  ui/                     Shared primitives (Button, Panel, Slider, ColorSwatch)
  config/                 tsconfig, eslint, tailwind presets

apps/web/src/features/    One directory per lane — see Section 11
```

**Import rules, enforced by eslint:**

- `schema` imports nothing.
- `commands` imports `schema` only.
- `store` imports `schema` and `commands`.
- `canvas` imports `schema` only. It never dispatches commands — it reports events upward.
- `features/*` may import anything in `packages/`, but **never another feature**.

---

## 3. The magazine model

All types live in `packages/schema/src/`. This is the file every lane reads.

### 3.1 Primitives

```ts
/** Points. 1pt = 1/72 inch. The only unit stored. */
export type Pt = number;

/** nanoid(12), URL-safe. */
export type Id = string;

export interface Rect { x: Pt; y: Pt; w: Pt; h: Pt; }

/** Screen-first: RGB hex only. No CMYK, no spot colour. */
export type Color = string;   // '#1a4d5c' or '#1a4d5cff' with alpha

export interface Insets { top: Pt; right: Pt; bottom: Pt; left: Pt; }
```

### 3.2 Root

```ts
export interface Magazine {
  id: Id;
  schemaVersion: 1;

  meta: {
    title: string;
    createdAt: string;      // ISO 8601
    updatedAt: string;
    ownerId: Id;
  };

  pageSetup: PageSetup;

  /** Repeating backgrounds (DOC-10). Referenced by Page.backgroundId. */
  backgrounds: Record<Id, RepeatingBackground>;

  /** Ordered. spreads[0] is the cover — a single page. */
  spreads: Spread[];

  /** Text content, separate from the boxes that display it. */
  stories: Record<Id, Story>;

  /** Named looks (TXT-13). */
  looks: Record<Id, SavedLook>;

  /** The magazine's colour palette (CLR-02). */
  palette: Color[];

  /** Photo references. Blobs live in S3. */
  assets: Record<Id, AssetRef>;
}

export interface PageSetup {
  width: Pt;
  height: Pt;
  margin: Insets;
  facingPages: boolean;
}

export interface Spread {
  id: Id;
  /** 1 for cover and back cover, 2 for interior. */
  pages: Page[];
}

export interface Page {
  id: Id;
  backgroundId: Id | null;
  backgroundColor: Color | null;      // CLR-04
  /** Painted above the repeating background. Array order IS z-order. */
  items: Item[];
  /** Ids from the repeating background this page hides. */
  hiddenBackgroundItems: Id[];
  columns: { count: number; gutter: Pt } | null;
}

export interface RepeatingBackground {
  id: Id;
  name: string;
  items: Item[];
}
```

### 3.3 Items

```ts
export type Item = TextBox | Photo | Shape | Group;

interface ItemBase {
  id: Id;
  frame: Rect;
  /** Degrees clockwise about the frame centre. */
  rotation: number;
  opacity: number;          // 0..1
  locked: boolean;          // ARR-11
}

export interface TextBox extends ItemBase {
  type: 'text';
  /** The story shown. Several boxes may share one story (TXT-11). */
  storyId: Id;
  /** Next box in the chain. null = end; overflow is hidden and warned (TXT-12). */
  nextBoxId: Id | null;
  prevBoxId: Id | null;
  insets: Insets;
  columns: { count: number; gutter: Pt };
  verticalAlign: 'top' | 'center' | 'bottom';
}

export interface Photo extends ItemBase {
  type: 'photo';
  assetId: Id;
  fit: {
    mode: 'fill' | 'fit' | 'manual';
    /** Image-space crop rect. Only used when mode is 'manual'. */
    sourceRect: Rect | null;
  };
  flipH: boolean;
  flipV: boolean;
  cornerRadius: Pt;
  /** Rectangle wrap only in v1 (IMG-10). null = no wrap. */
  textWrap: { gap: Insets } | null;
}

export interface Shape extends ItemBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  cornerRadius: Pt;
  fill: Color | null;
  stroke: { color: Color; width: Pt } | null;
  textWrap: { gap: Insets } | null;
}

export interface Group extends ItemBase {
  type: 'group';
  children: Item[];
}
```

### 3.4 Text

Content is stored **separately from the boxes that display it**. This is what makes threading work: adding a word reflows every box in the chain, and no box changes.

```ts
export interface Story {
  id: Id;
  paragraphs: Paragraph[];
}

export interface Paragraph {
  id: Id;
  lookId: Id;                                 // named look
  overrides: Partial<ParagraphProps>;         // keep sparse
  runs: TextRun[];
  listType: 'none' | 'bullet' | 'number';     // TXT-09
}

export interface TextRun {
  text: string;
  overrides: Partial<CharacterProps>;
}

export interface ParagraphProps {
  align: 'left' | 'center' | 'right' | 'justify';
  firstLineIndent: Pt;
  leftIndent: Pt;
  rightIndent: Pt;
  spaceBefore: Pt;
  spaceAfter: Pt;
  /** Multiplier of font size. 1.4 is a sensible default. */
  lineHeight: number;
  character: CharacterProps;
}

export interface CharacterProps {
  fontFamily: string;
  fontWeight: number;         // 100..900
  italic: boolean;
  underline: boolean;
  fontSize: Pt;
  /** Letter spacing, in 1/1000 em. */
  tracking: number;
  color: Color;
}

export interface SavedLook {
  id: Id;
  /** User-visible: 'Heading', 'Body text'. */
  name: string;
  props: ParagraphProps;
}
```

### 3.5 Assets

```ts
export interface AssetRef {
  id: Id;
  /** SHA-256 of the original. Also the S3 key prefix. */
  hash: string;
  source: 'upload' | 'library';
  mimeType: string;
  /** Native size in points. */
  intrinsic: { w: Pt; h: Pt };
  originalFilename: string;
  /** Attribution required by the photo library licence. */
  credit: string | null;
}
```

### 3.6 Invariants

Implement as `validateMagazine(m): ValidationError[]`. Run it after every command in dev builds and fail loudly.

1. Every `TextBox.storyId` resolves in `stories`.
2. Thread links are symmetric: if `A.nextBoxId === B` then `B.prevBoxId === A`.
3. Thread chains are acyclic, and every box in a chain shares one `storyId`.
4. Exactly one box per chain has `prevBoxId === null`.
5. Every `lookId` resolves in `looks`.
6. Every `assetId` resolves in `assets`.
7. Item ids are unique across the whole magazine, including inside groups and backgrounds.
8. No frame has zero or negative width or height.
9. `spreads[0].pages.length === 1` when `facingPages` is true.

---

## 4. The command layer

`packages/commands`. The heart of the system. Read this section twice.

### 4.1 Shape

```ts
export interface Command<T = unknown> {
  type: string;
  payload: T;
  /** Commands sharing a key within the window collapse into one undo step. */
  coalesceKey?: string;
}

export interface CommandResult {
  /** The command that exactly reverses this one. */
  inverse: Command;
  /** Ids whose layout must be recomputed. */
  dirty: Id[];
}

export type CommandHandler<T> = (draft: Magazine, payload: T) => CommandResult;
```

### 4.2 Registry

Each lane registers its own commands. **Adding to the registry is allowed; changing another lane's entry is not.**

```ts
const registry = new Map<string, CommandHandler<any>>();

export function registerCommand<T>(type: string, handler: CommandHandler<T>): void {
  if (registry.has(type)) throw new Error(`Command already registered: ${type}`);
  registry.set(type, handler);
}
```

### 4.3 Dispatch

```ts
export function dispatch(cmd: Command): DispatchResult {
  const handler = registry.get(cmd.type);
  if (!handler) return { ok: false, reason: 'unknown-command' };

  // ONE Yjs transaction = ONE undo step.
  return store.transact(() => {
    const result = handler(store.draft, cmd.payload);

    if (import.meta.env.DEV) {
      const errors = validateMagazine(store.draft);
      if (errors.length) throw new Error(`Invariant broken by ${cmd.type}`);
    }

    history.push({ command: cmd, inverse: result.inverse });
    return { ok: true, dirty: result.dirty };
  });
}
```

**Rules for handlers:**

- Pure with respect to payload. Same magazine + same payload = same result, always.
- Never partially apply. Validate first, then mutate.
- Always return a genuine inverse. `element.move` inverses to `element.move` with the old position — not to a "restore" command.
- Never dispatch another command from inside a handler. Compose in the caller instead.

### 4.4 History

```ts
export interface HistoryEntry { command: Command; inverse: Command; }

export const history = {
  push(entry: HistoryEntry): void,
  undo(): void,          // applies inverse, moves to redo stack
  redo(): void,
  canUndo(): boolean,
  canRedo(): boolean,
  /** GL-06 requires at least 50. */
  maxDepth: 100,
};
```

**Coalescing (GL-06):** commands with the same `coalesceKey` arriving within 500ms merge into one entry. A drag produces dozens of `item.move` commands but exactly one undo step. Use `coalesceKey = \`move:${itemId}\``.

### 4.5 Foundation command set

Lane 0 implements these. Other lanes register their own alongside.

| Command | Payload | Owner |
|---|---|---|
| `item.create` | `{ pageId, item }` | Lane 0 |
| `item.delete` | `{ itemId }` | Lane 0 — must repair thread links |
| `item.move` | `{ itemId, x, y }` | Lane 0 |
| `item.resize` | `{ itemId, frame }` | Lane 0 |
| `item.rotate` | `{ itemId, degrees }` | Lane 0 |
| `item.setProps` | `{ itemId, props }` | Lane 0 — generic partial setter |
| `item.reorder` | `{ itemId, toIndex }` | Lane 0 |
| `item.setLocked` | `{ itemId, locked }` | Lane 0 |

Everything else — text, photos, pages, colour, shapes — is registered by its lane.

### 4.6 FWD-02: the AI depends on this

Every requirement in Section 5 of the product doc **must be achievable by dispatching commands alone, with no UI interaction.** When the AI phase arrives, it will emit exactly these commands.

The test: a script that builds a complete magazine using only `dispatch()`. If any feature can't be reached that way, the AI will never be able to do it.

Write that script in Lane 0 as `packages/commands/test/headless-build.test.ts` and extend it as lanes land.

---

## 5. The store

`packages/store`. Wraps Yjs so no other package touches the Yjs API directly.

```ts
export interface Store {
  /** Reactive proxy over the Yjs doc. Read freely; write only in handlers. */
  readonly draft: Magazine;
  transact<T>(fn: () => T): T;
  subscribe(listener: (dirty: Id[]) => void): () => void;

  /** Serialise for saving. */
  snapshot(): Uint8Array;
  loadSnapshot(bytes: Uint8Array): void;

  /** Phase B: attach a network provider. No schema change needed. */
  connect?(url: string): void;
}
```

Use `y-indexeddb` for local persistence from day one — it gives offline resilience free and satisfies GL-16.

**Autosave:** debounce 2 seconds after the last command, then `PUT /api/magazines/:id/snapshot`. Show state in plain words per GL-16.

---

## 6. Text layout

`packages/canvas/src/layout/`. Owned by Lane 0 because Lane 2 (text) and Lane 1 (canvas) both depend on it.

```ts
export interface LayoutInput {
  story: Story;
  looks: Record<Id, SavedLook>;
  /** The thread chain, head first. */
  boxes: TextBox[];
  /** Wrap obstacles per box, in box-local coordinates. */
  obstacles: Map<Id, Rect[]>;
  measure: TextMeasurer;
}

export interface LayoutResult {
  boxes: Map<Id, PositionedLine[]>;
  /** > 0 triggers the TXT-12 warning. */
  overflowLines: number;
}

export interface PositionedLine {
  baseline: Pt;
  x: Pt;
  runs: { text: string; x: Pt; props: CharacterProps }[];
  /** Maps clicks back to text offsets. */
  source: { paragraphIndex: number; start: number; end: number };
}
```

**Requirements:**

- Greedy line breaking is acceptable for v1. Knuth–Plass is a later optimisation, not a v1 need.
- Measurement goes through `TextMeasurer`, which wraps canvas `measureText` with a cache keyed on `(text, font, size)`. Shaping is the expensive step; cache aggressively.
- **Incremental:** invalidate from the changed paragraph forward, and stop early when a paragraph's position and height are unchanged.
- Must run in Node for PDF export, so `TextMeasurer` is injected, never imported directly.

---

## 7. Renderer contract

```ts
export interface Renderer {
  mount(container: HTMLElement): void;
  render(magazine: Magazine, viewport: Viewport, layout: LayoutCache): void;
  /** Item id at a point, in magazine coordinates. */
  hitTest(point: { x: Pt; y: Pt }): Id | null;
  destroy(): void;
}

export interface Viewport {
  /** Visible spread indices — render only these plus one either side. */
  spreadRange: [number, number];
  zoom: number;
  pan: { x: Pt; y: Pt };
}
```

**Rules:**

- The renderer is **read-only**. It never dispatches. It reports pointer events upward and the interaction layer decides.
- Zoom and pan use CSS `transform` only. Never re-layout for a zoom change.
- Virtualise: mount only spreads in `spreadRange`. A 24-page magazine must not mount 24 spreads.
- Text renders as SVG with explicit per-line positions from Section 6. **Never** as HTML text with CSS — the browser must not re-break lines, or the PDF will not match.

---

## 8. Editor shell

`apps/web/src/shell/`. Lane 0 builds the frame; lanes fill the slots.

GL-09 requires the layout to hold still, so slots are fixed positions with fixed order:

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

The properties panel shows controls for the selected item type. **Controls are disabled, never removed or moved** (GL-09).

**Selection state** lives in Zustand, not in the magazine — it is per-user and must not be saved.

```ts
export interface SelectionState {
  itemIds: Id[];
  textRange: { storyId: Id; start: number; end: number } | null;
  hoveredId: Id | null;      // ARR-02
}
```

`hoveredId` is exposed here because ARR-02 requires hover feedback and FWD-07 requires selection to be readable as data.

---

## 9. Backend

### 9.1 API surface

```
POST   /api/magazines                    create
GET    /api/magazines                    list for user
GET    /api/magazines/:id                metadata + snapshot URL
PATCH  /api/magazines/:id                rename (DOC-11)
POST   /api/magazines/:id/duplicate      DOC-11
DELETE /api/magazines/:id

PUT    /api/magazines/:id/snapshot       autosave (GL-16)

POST   /api/magazines/:id/publish        PUB-01 — enqueues a job
GET    /api/magazines/:id/versions       PUB-03
POST   /api/magazines/:id/restore        PUB-08

POST   /api/assets/upload-url            presigned S3 PUT
POST   /api/assets/confirm               register after upload
GET    /api/photos/search?q=             photo library proxy (IMG-02)

GET    /p/:publishId                     public viewer (PUB-04) — no auth
```

### 9.2 MongoDB collections

```ts
// magazines
{
  _id, ownerId, title,
  createdAt, updatedAt,
  snapshotKey: string,        // S3 key of latest Yjs state
  latestVersion: number,      // 0 = never published
  thumbnailKey: string | null,
}

// versions — IMMUTABLE once written (PUB-02)
{
  _id, magazineId, version: number,
  publishedAt,
  publishId: string,          // public URL slug, unguessable
  documentKey: string,        // frozen Yjs snapshot
  pdfKey: string,
  pageImageKeys: string[],
  pageCount: number,
}

// assets
{
  _id, ownerId, hash, source, mimeType,
  intrinsicW, intrinsicH, credit, originalFilename,
  createdAt,
}
```

**PUB-02 is enforced here:** the versions collection is append-only. No update path exists in the API. Write it that way deliberately.

### 9.3 S3 layout

```
assets/{hash}/original.{ext}
assets/{hash}/proxy.webp          1200px long edge — the editor loads this
assets/{hash}/thumb.webp          200px long edge

snapshots/{magazineId}/current.bin

published/{magazineId}/v{n}/document.bin
published/{magazineId}/v{n}/magazine.pdf
published/{magazineId}/v{n}/pages/{index}.png
```

Published objects are written once and never overwritten.

### 9.4 Publish job

Runs on the existing worker setup.

1. Read the current Yjs snapshot.
2. Compute layout for every spread. **Uses the same layout code as the client** (Section 6) with a Node `TextMeasurer`.
3. Write the PDF with `pdf-lib` from the computed line positions.
4. Render page images.
5. Upload everything under `published/{magazineId}/v{n}/`.
6. Insert the versions row and bump `latestVersion`.

Steps 5 and 6 in that order — the row must never point at objects that don't exist yet.

---

## 10. What Lane 0 delivers

Done when all of these are true:

1. `packages/schema` — all types, `validateMagazine()`, and factory defaults for a blank magazine.
2. `packages/commands` — registry, dispatch, history with coalescing, and the eight foundation commands, each with a working inverse.
3. `packages/store` — Yjs binding, snapshot/load, IndexedDB persistence, subscription.
4. `packages/canvas` — the `Renderer` interface, a DOM/SVG implementation that renders text, photos, and shapes, virtualisation, hit testing.
5. Text layout — greedy breaking, threading across boxes, overflow reporting.
6. `apps/web/src/shell` — toolbar with all five slots, three panel mount points, selection state.
7. `apps/api` — every route in 9.1, stubbed where a lane owns the implementation, but present and typed.
8. **The headless test** from 4.6, building a small magazine using only `dispatch()`.
9. Every shared file another lane imports exists with correct types.

**Gate:** run `pnpm build` and `pnpm test` clean. Then, and only then, parallel lanes start.

---

## 11. Lane ownership

| Lane | Owns exclusively | Requirements |
|---|---|---|
| **0 Foundation** | `packages/schema`, `packages/commands`, `packages/store`, `packages/canvas`, `apps/web/src/shell` | FWD-01..07 |
| 1 Interaction | `apps/web/src/features/interaction` | ARR-01..14, GL-17 |
| 2 Text | `apps/web/src/features/text` | TXT-01..14 |
| 3 Photos | `apps/web/src/features/photos` | IMG-01..12 |
| 4 Pages | `apps/web/src/features/pages` | DOC-01..11 |
| 5 Colour & shapes | `apps/web/src/features/colour`, `.../shapes` | CLR-01..05, SHP-01..04 |
| 6 Backend | `apps/api`, `apps/viewer`, worker jobs | PUB-01..08, GL-16 |

**Rules:**

- A lane creates files only under its own path.
- A lane registers commands, toolbar items, and panels. It never edits the registry, the shell, or another lane's files.
- Needing a change in `packages/` means stopping and asking Lane 0. Do not edit it.
- `packages/ui` is shared read-only. Adding a primitive requires Lane 0.
- Every lane runs the full test suite before merging, not just its own.

---

## 12. The first session

Scope for a single working session. This is a **vertical slice that proves the architecture**, not v1.

- Schema, store, dispatch, undo
- Canvas rendering one page
- Select, hover feedback, move, resize
- Add a text box, type in it
- Add a photo from the computer
- Save to Mongo and reload

That is roughly Lane 0 plus a thin slice of Lanes 1, 2, and 3. If it works end to end, the remaining lanes are mechanical. If it doesn't, better to find out here than after five agents have built on it.

Measure actual velocity from this before estimating the rest.

---

## 13. Open questions

Blocking, in order:

1. **Greenfield or existing codebase?** This document assumes greenfield. If we are joining an existing repo, the structure in Section 2 needs reconciling with what's there.
2. **What is in the existing worker setup?** Section 9.4 assumes a queue with retries and progress reporting. Confirm what it is — BullMQ, SQS, something else — and whether it is reusable as-is.
3. **Does authentication exist?** `ownerId` appears throughout Section 9. If auth is not built, it is a lane of its own and nothing user-scoped works without it.
4. **Which photo library?** IMG-02 needs the specific API, its rate limits, and its attribution requirements — `AssetRef.credit` exists because most libraries mandate it.
5. **Is the public viewer a separate app or a route?** Section 2 assumes `apps/viewer`. A route inside `apps/web` is simpler but ships editor code to every reader.

Non-blocking, but decide before Lane 6 finishes:

6. **Are published links public or private?** Section 9.2 uses an unguessable slug, which is obscurity rather than security. If magazines can be private, that needs auth on the viewer.
7. **Version retention.** Every publish stores a full PDF and a set of page images. At what point do old versions get pruned, if ever?
