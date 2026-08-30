# Magazine Builder — Technical Foundation

**Version:** 0.2 — supersedes v0.1 entirely
**Scope:** Lane 0 only — the core every other lane builds on
**Companions:** Product Requirements v2.0, RULES.md, REPO-SURVEY.md

---

## 0. What changed from v0.1, and why

v0.1 assumed a greenfield repository. It is not greenfield. The repo survey measured the real codebase and found several of v0.1's decisions to be wrong, not merely different. Corrected here:

| v0.1 said | Reality | Now |
|---|---|---|
| Turborepo + pnpm | npm workspaces | **Keep npm workspaces.** No migration. |
| MongoDB via Mongoose | Raw `mongodb` driver v6, no ODM | **Keep the raw driver.** Mongoose was my error. |
| `apps/api`, `apps/viewer` | `apps/server`, viewer is a route in `apps/web` | **Match the repo.** |
| PDF via `pdf-lib` + Node text measurement | Puppeteer prints the live viewer route | **Keep Puppeteer.** See ADR-004. |
| Points as the unit | Pixels in page-canonical space at 150 DPI | **Keep pixels.** See ADR-002. |
| SVG text with explicit glyph positions | HTML text with CSS | **Keep HTML/CSS.** See ADR-005. |
| Full strict TypeScript repo-wide | Would produce 2,092 errors | **Scope strictness to new packages.** |

The survey also caught a contradiction inside v0.1 itself: ADR-004 said the PDF receives pre-computed line positions from the client, while §9.4 had the publish job compute layout server-side. Both cannot be true. Resolved below.

**The theme:** v0.1 specified a print-quality system. You went screen-first, and the existing repo already solved screen-first correctly. Adopting what works removes an entire workstream.

---

## 1. Scope

### What is being replaced

| Path | Lines | Why |
|---|---|---|
| `apps/web/src/editor-v2/` | 8,063 | The UX failure this rebuild exists to fix |
| `apps/server/src/routes/magazinesV2/index.ts` | 3,022 | One file, no test coverage, direct mutation |
| The `MagazineElement` model | — | No stories, no threading, no saved looks |
| The client undo stack | — | Add, delete and page ops aren't even on it |

### What is untouched

Auth, OTP, RBAC, the user model, `lib/db.ts`, `lib/ensureIndexes.ts`, `lib/storage.ts`, the worker queue, Pexels integration, PDF/DOCX extraction, `fontMetrics.data.ts`, and every existing collection.

**We build alongside.** The old editor stays behind `MAGAZINE_V2=true` and keeps working until the new one passes its acceptance test. Nothing is deleted until then. No migration of existing magazines.

---

## 2. Stack

| Layer | Choice | Note |
|---|---|---|
| Package manager | **npm workspaces** | Existing. No Turborepo, no pnpm. |
| Frontend | React 18.3 + Vite 5.4 + TypeScript | Existing |
| Routing | react-router-dom 6.26 | Existing |
| UI state | Zustand 4.5 | Existing |
| Magazine data | **Yjs** | New dependency |
| Styling | Tailwind 3.4 + Radix primitives | Existing |
| Backend | Express, `apps/server` | Existing |
| Database | **Raw `mongodb` driver v6** via `lib/db.ts` | Existing. No ODM. |
| Storage | `lib/storage.ts` | Existing |
| Queue | Existing Mongo poll queue | Existing |
| PDF | **Puppeteer** printing the viewer route | Existing |
| Logging | **pino** | New — RULES §1.5 requires a logger and none exists |

New dependencies, total: `yjs`, `y-indexeddb`, `nanoid`, `pino`. Nothing else without Lane 0 approval.

---

## 3. Decisions

### ADR-001 — Yjs from day one, sync server later

The magazine is a Yjs document from the first commit. No sync server in v1.

Yjs is a local CRDT — it works fine single-user. Adding collaboration later means adding a network provider and a relay, with **no schema change**. Retrofitting a CRDT onto plain JSON later means rewriting every command handler.

### ADR-002 — Pixels in page-canonical space

**Corrected from v0.1.** Coordinates are pixels in the page's own canonical space, matching the existing convention: A4 at 150 DPI is 1240 × 1754.

v0.1 chose points because PDF is written in points. But the PDF is produced by Chromium printing HTML (ADR-004), so nothing ever needs a point value. Pixels match the existing extraction pipeline's output space, which means that pipeline can later feed the new model with no conversion at all.

Pages carry their own `width` and `height`, so mixed page sizes work at the model level.

### ADR-003 — Commands are the only write path

Every change to a magazine is a typed command carrying its own inverse. Nothing mutates a magazine by any other route.

This is the one thing the existing editor most lacks and the one thing the AI phase most needs. Free undo/redo, a single validation point, and — critically — a surface the AI can drive later (FWD-02).

### ADR-004 — Puppeteer prints the viewer route

**Corrected from v0.1.** PDF output is headless Chromium navigating the public viewer route and printing it, as the existing system already does.

v0.1 specified a server-side `pdf-lib` writer with its own text measurement, because print output needs CMYK and embedded font subsets that a browser cannot produce. You went screen-first, so none of that applies. Rendering the actual viewer guarantees the PDF matches what the reader sees **by construction**, with no reconciliation and no second layout engine.

The existing implementation already has an LRU cache keyed on version. Keep it.

*This deletes: `pdf-lib` for magazines, a Node `TextMeasurer`, and a server-side layout pass.*

### ADR-005 — HTML and CSS text, browser line breaking

**Corrected from v0.1.** Text renders as HTML with CSS. The browser breaks lines.

v0.1 required SVG with explicit per-glyph positions so that an independent server-side PDF writer would match the screen. With ADR-004 there is no independent writer — the same browser renders both. So the browser's own line breaking is authoritative and correct in both places.

**Threading (TXT-11) still needs our logic**, but far less than v0.1 implied. See Section 7.

### ADR-006 — One page renderer, three consumers

The existing system renders the editor canvas, the public reader, and the PDF through a single component. That pattern is correct and we keep it.

Any divergence between those three surfaces is a bug by construction, because there is only one implementation.

### ADR-007 — Strictness scoped to new code

New `packages/*` compile under full strict settings. Existing apps keep their current configuration.

The survey measured 2,092 errors from applying RULES §9.1 repo-wide, of which 1,708 are `verbatimModuleSyntax` — a CommonJS-versus-ESM incompatibility requiring a server ESM migration, not import edits. Fixing 381 further errors in code we are not touching is pure friction.

`verbatimModuleSyntax` is **dropped from RULES entirely**.

---

## 4. Where the new code lives

Namespaced throughout as `magazine-builder`, so nothing collides with the existing `magazineV2` surface while both run.

```
packages/                          ← the workspace glob already matches this
  mb-schema/                       types, validation, defaults. ZERO dependencies.
  mb-commands/                     command registry, dispatch, history
  mb-store/                        Yjs binding
  mb-render/                       the shared page renderer (ADR-006)

apps/web/src/magazine-builder/     the studio
  shell/                           Lane 0 — toolbar slots, panels, selection
  features/                        one directory per lane
    interaction/  text/  photos/  pages/  colour/  shapes/

apps/server/src/
  lib/magazineBuilder/             domain modules
  routes/magazineBuilder/          router, split by concern — never one file

apps/worker/src/jobs/
  publishMagazine.ts               new job, existing queue
```

**Routes**

| Surface | Path |
|---|---|
| Studio library | `/magazine-builder` |
| Studio editor | `/magazine-builder/:id` |
| Public reader | `/m/:publishId` |
| API | `/api/magazine-builder/*` |

**Feature flag:** `MAGAZINE_BUILDER=true`, mirroring how `MAGAZINE_V2` gates the old surface. With the flag off, every route 404s.

**Import rules** (ESLint, once installed):

- `mb-schema` imports nothing.
- `mb-commands` imports `mb-schema` only.
- `mb-store` imports `mb-schema` and `mb-commands`.
- `mb-render` imports `mb-schema` only. It never dispatches — it reports events upward.
- `features/*` may import `packages/*` and `shell/`, but **never another feature**.

---

## 5. The magazine model

Types live in `packages/mb-schema/src/`, split by subject so no file approaches the line cap.

```
primitives.ts   magazine.ts   items.ts   text.ts
assets.ts       validation.ts defaults.ts index.ts
```

### 5.1 Primitives

```ts
/** Pixels in page-canonical space. A4 at 150 DPI = 1240 x 1754. */
export type Px = number;

/** nanoid(12), URL-safe. */
export type Id = string;

export interface Rect { x: Px; y: Px; w: Px; h: Px; }
export interface Insets { top: Px; right: Px; bottom: Px; left: Px; }

/** Screen-first: RGB hex only. */
export type Color = string;
```

### 5.2 Root

```ts
export interface Magazine {
  id: Id;
  schemaVersion: 1;

  meta: {
    title: string;
    slug: string;
    ownerId: Id;              // resolves against the existing users collection
    createdAt: string;
    updatedAt: string;
  };

  pageSetup: {
    width: Px;
    height: Px;
    margin: Insets;
    facingPages: boolean;
  };

  /** Repeating backgrounds (DOC-10). */
  backgrounds: Record<Id, RepeatingBackground>;

  /** Ordered. spreads[0] is the cover — one page. */
  spreads: Spread[];

  /** Text content, separate from the boxes that show it. */
  stories: Record<Id, Story>;

  /** Named looks (TXT-13). */
  looks: Record<Id, SavedLook>;

  /** The magazine's palette (CLR-02). */
  palette: Color[];

  assets: Record<Id, AssetRef>;
}

export interface Spread {
  id: Id;
  pages: Page[];              // 1 for covers, 2 for interior
}

export interface Page {
  id: Id;
  width: Px;                  // pages carry their own size
  height: Px;
  backgroundId: Id | null;
  backgroundColor: Color | null;
  /** Array order IS z-order. */
  items: Item[];
  hiddenBackgroundItems: Id[];
  columns: { count: number; gutter: Px } | null;
}

export interface RepeatingBackground {
  id: Id;
  name: string;
  items: Item[];
}
```

### 5.3 Items

```ts
export type Item = TextBox | Photo | Shape | Group;

interface ItemBase {
  id: Id;
  frame: Rect;
  rotation: number;           // degrees, about the frame centre
  opacity: number;            // 0..1 — on EVERY item, unlike the old model
  locked: boolean;
}

export interface TextBox extends ItemBase {
  type: 'text';
  storyId: Id;                // several boxes may share one story
  nextBoxId: Id | null;       // TXT-11 threading
  prevBoxId: Id | null;
  insets: Insets;
  columns: { count: number; gutter: Px };
  verticalAlign: 'top' | 'center' | 'bottom';
  /** What happens when text does not fit and there is no next box. */
  overflow: 'warn' | 'shrink';
}

export interface Photo extends ItemBase {
  type: 'photo';
  assetId: Id;
  fit: { mode: 'fill' | 'fit' | 'manual'; sourceRect: Rect | null };
  flipH: boolean;
  flipV: boolean;
  cornerRadius: Px;
  /** Rectangle wrap only in v1 (IMG-10). */
  textWrap: { gap: Insets } | null;
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
  children: Item[];
}
```

The old model's `qr` and `icon` element types are **not carried over**. Neither appears in the requirements. If they are needed, they are a new requirement, not a silent addition.

### 5.4 Text

Content is stored **separately from the boxes that display it**. This is what makes threading work: adding a word reflows every box in the chain, and no box changes.

```ts
export interface Story {
  id: Id;
  paragraphs: Paragraph[];
}

export interface Paragraph {
  id: Id;
  lookId: Id;
  overrides: Partial<ParagraphProps>;      // keep sparse
  runs: TextRun[];
  listType: 'none' | 'bullet' | 'number';
}

export interface TextRun {
  text: string;                            // plain text, never HTML
  overrides: Partial<CharacterProps>;
}

export interface ParagraphProps {
  align: 'left' | 'center' | 'right' | 'justify';
  firstLineIndent: Px;
  leftIndent: Px;
  rightIndent: Px;
  spaceBefore: Px;
  spaceAfter: Px;
  lineHeight: number;                      // multiplier of font size
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

**Runs carry plain text, never HTML.** The old model stored sanitised inline HTML on each element, which is why it has no styles and no threading. Structured runs are what make TXT-13 possible.

### 5.5 Assets

```ts
export interface AssetRef {
  id: Id;
  /** SHA-256 of the original. */
  hash: string;
  source: 'upload' | 'pexels';
  mimeType: string;
  /** Native size — needed for IMG-03 sensible placement and IMG-11 quality warning. */
  intrinsic: { w: Px; h: Px };
  originalFilename: string;
  /** Pexels requires attribution. */
  credit: string | null;
  storageKey: string;
}
```

### 5.6 Invariants

`validateMagazine(m): ValidationError[]` in `validation.ts`. Runs after every command in dev; throws.

1. Every `TextBox.storyId` resolves in `stories`.
2. Thread links are symmetric: `A.nextBoxId === B` implies `B.prevBoxId === A`.
3. Thread chains are acyclic and every box in a chain shares one `storyId`.
4. Exactly one box per chain has `prevBoxId === null`.
5. Every `lookId` resolves in `looks`.
6. Every `assetId` resolves in `assets`.
7. Item ids are unique across the whole magazine, including inside groups and backgrounds.
8. No frame has zero or negative width or height.
9. `spreads[0].pages.length === 1` when `facingPages` is true.

The old system's `validateElements()` clamps and drops silently. **Ours reports.** Silent repair is how invalid state becomes invisible.

---

## 6. The command layer

`packages/mb-commands`. The heart of the system, and the single largest departure from the existing code.

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

### 6.1 Registry and dispatch

```ts
export function registerCommand<T>(type: string, handler: CommandHandler<T>): void {
  if (registry.has(type)) throw new Error(`Command already registered: ${type}`);
  registry.set(type, handler);
}

export function dispatch(cmd: Command): DispatchResult {
  const handler = registry.get(cmd.type);
  if (!handler) return { ok: false, reason: 'unknown-command' };

  // ONE transaction = ONE undo step.
  return store.transact(() => {
    const result = handler(store.draft, cmd.payload);
    if (import.meta.env.DEV) {
      const errors = validateMagazine(store.draft);
      if (errors.length) throw new InvariantError(`Broken by ${cmd.type}`);
    }
    history.push({ command: cmd, inverse: result.inverse });
    return { ok: true, dirty: result.dirty };
  });
}
```

**Handler rules:** pure with respect to payload; validate fully before mutating; return a genuine inverse; never dispatch from inside a handler.

### 6.2 History

At least 50 steps (GL-06), default 100. Commands sharing a `coalesceKey` within 500ms merge into one entry — a drag produces dozens of `item.move` commands and exactly one undo step.

**Everything is on the stack**, including add, delete, and page structure. The old editor excluded these and it is why undo there is untrustworthy.

### 6.3 Foundation command set

Lane 0 implements these. Other lanes register their own alongside.

| Command | Payload |
|---|---|
| `item.create` | `{ pageId, item }` |
| `item.delete` | `{ itemId }` — must repair thread links |
| `item.move` | `{ itemId, x, y }` |
| `item.resize` | `{ itemId, frame }` |
| `item.rotate` | `{ itemId, degrees }` |
| `item.setProps` | `{ itemId, props }` |
| `item.reorder` | `{ itemId, toIndex }` |
| `item.setLocked` | `{ itemId, locked }` |

### 6.4 FWD-02 — the AI depends on this

Every requirement must be achievable by dispatching commands alone, with no UI interaction. When the AI phase arrives it will emit exactly these commands, and the existing generation pipeline will be retargeted to emit them instead of writing elements directly.

Write `packages/mb-commands/test/headless-build.test.ts` in Lane 0 — a script that builds a small magazine using only `dispatch()`. Extend it as lanes land. Anything not reachable this way will be impossible for the AI to do.

---

## 7. Text and threading

**Much smaller than v0.1 specified.** Because the browser breaks lines (ADR-005), we do not need a line-breaking engine. We need to know **where a story overflows a box**, so the remainder can flow into the next one.

```ts
export interface ThreadLayout {
  /** For each box in the chain, the slice of the story it displays. */
  slices: Map<Id, { fromParagraph: number; fromOffset: number;
                    toParagraph: number; toOffset: number }>;
  /** > 0 triggers the TXT-12 warning. */
  overflowParagraphs: number;
}
```

**How it works:** render the story into the first box, measure with the DOM, binary-search the split point where content stops fitting, pass the remainder to the next box, repeat. Cache per box keyed on box size plus story revision, and invalidate forward from the first change only.

This runs in the browser. The publish job runs in Chromium too (ADR-004), so it produces identical results with no second implementation.

`fontMetrics.data.ts` is **not needed** for this. It exists for the AI layout solver and stays where it is.

---

## 8. Rendering

One component, three consumers (ADR-006): the editor canvas, the public reader, the PDF.

```ts
export interface PageRendererProps {
  page: Page;
  magazine: Magazine;
  threadLayout: ThreadLayout;
  /** Editor draws selection and handles; reader and PDF do not. */
  mode: 'edit' | 'read';
}
```

**Rules:**

- Read-only. It never dispatches. It reports pointer events upward.
- Zoom and pan use CSS `transform` only. Never re-layout for zoom.
- **Virtualise:** mount only spreads in view plus one either side. The old editor mounts every page; a 24-page magazine must not.
- Scaling uses container queries and `cqw` units, as the existing renderer does. That approach is proven and prints correctly.

---

## 9. Backend

### 9.1 Auth — use what exists, unchanged

```ts
router.use(featureFlag('MAGAZINE_BUILDER'));
router.use(attachAccount);           // existing — the only producer of AccountUser
router.use(requireMagazineAccess);   // existing RBAC verb check
router.use(rateLimit('mb-write', 300));
```

`ownerId` on a magazine is `req.account.id`. No new access tier, no changes to RBAC.

### 9.2 Router — split by concern

The old router is 3,022 lines in one file and has no test coverage because it cannot be imported. RULES §2.1 caps files at 600 lines. Split:

```
routes/magazineBuilder/
  index.ts          mounting and middleware only
  magazines.ts      CRUD, duplicate, rename
  snapshot.ts       autosave
  publish.ts        publish, versions, restore
  assets.ts         upload URLs, registration
  photos.ts         Pexels proxy
```

Business logic goes in `lib/magazineBuilder/` as pure modules so it is testable without a Router — the pattern the existing tests already rely on.

### 9.3 API

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

GET    /m/:publishId                              public, no auth
```

Asset upload follows the existing presigned-PUT pattern, including `headObject` verification before registration — never trust client-reported size or type.

### 9.4 Collections

New, prefixed `mb`, alongside the existing eight. Add specs to `lib/ensureIndexes.ts`.

```ts
// mbMagazines
{ _id, ownerId, title, slug, createdAt, updatedAt,
  snapshotKey,           // S3 key of the current Yjs state
  latestVersion,         // 0 = never published
  publishId,             // STABLE public slug — never changes
  thumbnailKey }

// mbVersions — append-only, no update path in the API
{ _id, magazineId, version, publishedAt,
  documentKey, pdfKey, pageImageKeys, pageCount }

// mbAssets
{ _id, ownerId, magazineId, hash, source, mimeType,
  intrinsicW, intrinsicH, credit, storageKey, createdAt }
```

**Publishing model.** `publishId` lives on the magazine and **never changes**, so `/m/:publishId` always serves the latest published version and reader engagement stays attached. Each publish also writes an immutable `mbVersions` row for download and restore.

This is deliberate. The immutable-per-version-URL model was built on this platform and reverted on 2026-08-11 precisely because reactions and comments were orphaned. We keep the stable URL and get version history alongside it.

### 9.5 S3

```
public/magazine-builder/{magazineId}/source/{hash}.{ext}
public/magazine-builder/{magazineId}/media/{hash}.{ext}
public/magazine-builder/{magazineId}/media/{hash}.proxy.webp     1200px
public/magazine-builder/{magazineId}/media/{hash}.thumb.webp     200px
public/magazine-builder/{magazineId}/snapshot/current.bin
public/magazine-builder/{magazineId}/published/v{n}/document.bin
public/magazine-builder/{magazineId}/published/v{n}/magazine.pdf
public/magazine-builder/{magazineId}/published/v{n}/pages/{i}.png
```

Uses the existing `PUBLIC_PREFIX` convention and bucket policy. Published objects are written once, never overwritten.

**Derivatives are new** — the existing system has no proxy or thumbnail pipeline. `sharp` is already a worker dependency. The editor loads proxies; publish uses originals.

### 9.6 Publish job — the existing queue

Add a type to the existing `JobPayloads`, register a handler in `apps/worker/src/index.ts`. No new queue library.

```ts
publishMagazine: { magazineId: string; requestedBy: string };
```

Steps:

1. Read the current Yjs snapshot from S3.
2. Puppeteer navigates `/m/:publishId?version=draft`, waits for the ready flag, prints the PDF.
3. Render page images with the same page.
4. Upload everything under `published/v{n}/`.
5. **Then** insert the `mbVersions` row and bump `latestVersion`.

Step 5 last — the row must never point at objects that do not exist.

Progress reports through the magazine document (`status`, `stage`), matching the existing pattern. The client polls.

**The queue has no heartbeat and is single-worker-safe only** (survey §3). Fine at current volume. If publish becomes concurrent, that needs solving first.

---

## 10. Lane 0 deliverables

Done when all are true:

1. `packages/mb-schema` — all types split across the files in §5, `validateMagazine()`, factory defaults.
2. `packages/mb-commands` — registry, dispatch, history with coalescing, the eight foundation commands each with a working inverse.
3. `packages/mb-store` — Yjs binding, snapshot and load, IndexedDB persistence, subscription.
4. `packages/mb-render` — the page renderer, virtualisation, hit testing.
5. Thread layout (§7) — measurement and split points.
6. `apps/web/src/magazine-builder/shell` — toolbar with all five slots, three panel mounts, selection state including `hoveredId`.
7. `apps/server/src/routes/magazineBuilder/` — every route in §9.3, stubbed where a lane owns it, but present and typed.
8. Index specs added to `lib/ensureIndexes.ts`.
9. `pino` configured and exported; a lint rule banning `console.*` in new code.
10. ESLint installed at root with the RULES §9.2 rule set, scoped to `packages/*` and `apps/web/src/magazine-builder/**` only.
11. Root `lint`, `typecheck`, and `test` scripts.
12. The headless build test from §6.4.

**Gate:** `npm run lint`, `npm run typecheck`, `npm test` all clean. Then parallel lanes start.

---

## 11. Lane ownership

| Lane | Owns exclusively | Requirements |
|---|---|---|
| **0 Foundation** | `packages/mb-*`, `magazine-builder/shell`, `routes/magazineBuilder/index.ts` | FWD-01..07 |
| 1 Interaction | `magazine-builder/features/interaction` | ARR-01..14, GL-17 |
| 2 Text | `magazine-builder/features/text` | TXT-01..14 |
| 3 Photos | `magazine-builder/features/photos` | IMG-01..12 |
| 4 Pages | `magazine-builder/features/pages` | DOC-01..11 |
| 5 Colour & shapes | `magazine-builder/features/{colour,shapes}` | CLR, SHP |
| 6 Backend | `routes/magazineBuilder/*`, `lib/magazineBuilder/`, `jobs/publishMagazine.ts` | PUB-01..08, GL-16 |
| 7 Shared UX | `magazine-builder/shell/help`, error boundaries, vocabulary scan, touch-target audit, text-size setting | HLP-01..03, GL-01..15 |

**Lane 7 is new.** The survey found nobody owned HLP or the cross-cutting GL infrastructure. It exists now.

Still unowned and needing a person, not a lane: the twelve ready-made designs (DOC-02) and recruiting the elderly testers.

---

## 12. First session

A vertical slice proving the architecture, not v1:

- Schema, store, dispatch, undo
- The page renderer drawing one page
- Select, hover feedback, move, resize
- Add a text box and type in it
- Add a photo from the computer
- Save to Mongo and reload

Roughly Lane 0 plus thin slices of Lanes 1, 2 and 3. If it works end to end, the rest is mechanical. Measure real velocity from this before estimating anything else.

---

## 13. Open questions

1. **The existing AI pipeline.** Multi-agent generation, Pexels, extraction — all working, all writing to the old element model. Retarget it to emit commands in Phase B, or replace it? Not blocking v1.
2. **The 19 existing test suites.** Some test the old element model (delete), some test logic worth keeping like layout solving and fitting. Needs one pass to sort.
3. **DOC-02's twelve designs.** A design commission with a long lead time. Not blocking code today, on the critical path by the time Lane 4 finishes.
4. **Elderly user testing.** Needs an owner and a start date. Recruiting takes weeks.
5. **Old editor removal.** After cutover: delete `editor-v2/`, `routes/magazinesV2/`, and `lib/magazineV2/` — keeping extraction and font metrics, which the AI phase still needs.
