# Repository Survey

**Surveyed:** 2026-08-30 · **Against:** `implmentations/FOUNDATION.md` (v0.1) and `implmentations/RULES.md`
**Method:** direct inspection of the working tree. TypeScript counts in Section 8 come from real `tsc` runs, not estimates.

This document describes the repository **as it is today**. It makes no recommendations; the last two sections list every point where the current state and the two planning documents disagree.

---

## 1. Structure

**Monorepo**, three apps, no shared packages.

| | Actual |
|---|---|
| Package manager | **npm workspaces** (`package-lock.json`, root `workspaces: ["apps/*", "packages/*"]`) |
| Build orchestration | **None.** Root scripts call `npm run -w <app>` directly; `concurrently` for dev |
| Build tools | Vite 5 (web), `tsc` (server), `tsx` (worker, dev + run) |
| Turborepo | Not present — no `turbo.json` |
| pnpm | Not present — no `pnpm-lock.yaml`, no `pnpm-workspace.yaml` |
| `packages/` | **Directory does not exist.** The workspace glob matches nothing |

Root `package.json` scripts: `dev`, `dev:no-worker`, `dev:worker`, `build`, `start`, `start:worker`. There is no root `lint`, `test`, or `typecheck`.

### Apps

| Path | Name | Purpose | Module system |
|---|---|---|---|
| `apps/web` | `@rilo/web` | React + Vite SPA — public site, staff CRM, newsroom, blog studio, and the magazine editor. 50 routes in `App.tsx` | CommonJS pkg, ESNext/bundler TS |
| `apps/server` | `@rilo/server` | Express REST API — auth, RBAC, content, magazines, publishing, S3 presigning, Puppeteer PDF | **CommonJS** |
| `apps/worker` | `@rilo/worker` | Standalone Node process — polls the Mongo job queue, runs PDF/DOCX extraction and AI generation | **ESM** (`"type": "module"`) |

The worker imports server internals by relative path across the app boundary — e.g. `apps/worker/src/queue.ts` imports `../../server/src/lib/db.js`, and `apps/worker/src/index.ts` imports `../../server/src/lib/magazineV2/generate.js`. There is no package boundary between them.

### Other top-level items

`docs/` (28 review and plan documents plus `docs/magazine/`), `implmentations/` (RULES.md, FOUNDATION.md), `PLANNING.md`, `RBAC.md`, `deploy.ps1` + `deploy.secrets.ps1`, `.env.prod`, `repro.tmp.ts` (stray scratch file at root).

---

## 2. Auth

**Bearer JWT over email OTP. No cookies, no passwords.**

- Token: `jsonwebtoken`, HS256, **7-day TTL**, claims `{ sub, email, v }`.
- `v` is a session generation compared against `users.tokenVersion` on **every request** — the only way to revoke a Bearer JWT. Bumping it signs the user out everywhere.
- `JWT_SECRET` missing while `PROD=true` calls `process.exit(1)` (fails closed). Missing in dev falls back to a warned insecure constant.

### Routes

```
POST /api/auth/start   | /request-otp    rate-limited, emails a 6-digit code
POST /api/auth/verify  | /verify-otp     rate-limited, returns the JWT
GET  /api/auth/me                        attachAccount
POST /api/auth/sign-out-everywhere       bumps tokenVersion
```

OTP is generated with `crypto.randomBytes` and stored **hashed** (SHA-256) in the `otps` collection.

### The user model

Two layers, both in `apps/server/src/lib/`:

```ts
// identity.ts — the stored shape
export interface IdentityUser {
  id: string
  name: string
  email: string
  createdAt: string
  isAdmin: boolean
  lastLogin: string | null
}
```

```ts
// effectiveAccess.ts — the resolved shape put on the request
export interface AccountUser extends IdentityUser {
  parties: PartyRow[]
  orgMembers: OrgMemberRow[]
  isSuperAdmin: boolean
  permissions: ReadonlySet<PermissionAction>
  scopes: RoleScopes
  modules: ReadonlySet<string>
  workflowStages: ReadonlySet<string>
  role: RoleDoc | null          // exactly one role, or none
}
```

**The JWT carries no role data.** Every authorization input is read live from the database on each request, so a role change takes effect immediately.

### How a route reads the current user

`req.account` is declared by module augmentation in `lib/auth.ts`:

```ts
declare global {
  namespace Express {
    interface Request { account?: AccountUser }
  }
}
```

Two middlewares, sharing one loader:

```ts
// lib/auth.ts
async function loadAccount(req: Request): Promise<LoadResult> {
  if (req.account) return 'ok'                    // idempotent — routers nest

  const claims = claimsFromHeader(req)            // Bearer → jwt.verify
  if (!claims) return 'no-token'
  const doc = await db.collection(USERS).findById(claims.sub)
  if (!doc) return 'no-account'
  if (isRevoked(claims, doc)) return 'revoked'    // claims.v < users.tokenVersion

  req.account = await resolveAccount(withIdentityDefaults({ id: doc._id, ...doc }))
  return 'ok'
}

/** Load the live user and resolve permissions, or 401. The ONLY producer of an
 *  AccountUser, and the only place in the API that answers 401. */
export async function attachAccount(req, res, next): Promise<void> {
  try {
    const outcome = await loadAccount(req)
    if (outcome === 'ok') return next()
    res.status(401).json({ error: UNAUTHORIZED[outcome] })
  } catch (err) { failClosed(req, res, err) }
}

/** Same, but a missing or revoked session proceeds anonymously. For public
 *  routes whose answer depends on who is asking. */
export async function attachAccountOptional(req, res, next): Promise<void> { … }
```

`failClosed` answers 500 explicitly because Express 4 does not forward a rejected promise from an async middleware — without it the request hung until client timeout.

### Authorization on top

`lib/rbac.ts` exports `can`, `canOn`, `accountCan`, `scopeFor`, `isAdmin`, `isPlatformAdmin`, `adminGate`, `authedWriteGate`, plus team/org helpers. `lib/permissionCatalogue.ts` holds the verb catalogue.

The magazine router's gate chain ([routes/magazinesV2/index.ts:88-126](apps/server/src/routes/magazinesV2/index.ts#L88-L126)):

```
MAGAZINE_V2_ENABLED flag  →  attachAccount  →  isAdmin(req.account)  →  RBAC verb  →  rateLimit('mag2-write', 300/min)
```

**`isAdmin` means staff.** There is no self-serve path to the magazine builder for a member of the public.

---

## 3. Worker

**No queue library.** A hand-rolled MongoDB poll queue lives in `apps/worker/src/queue.ts`.

- **Claim:** atomic `findOneAndUpdate` (`db.claimOne`) on the oldest `queued` job — safe across replicas; two workers never grab the same job.
- **Concurrency:** one job at a time per process, deliberately — rasterisation is CPU-bound. Scale out with more processes.
- **Poll interval:** `MAGAZINE_V2_POLL_INTERVAL_MS`, default 2000ms, floor 250ms.
- **Retry:** requeue up to `maxAttempts: 3` (`JOB_MAX_ATTEMPTS`), then `failed` with `lastError`.
- **Stale sweep:** jobs stuck in `running` past `MAGAZINE_V2_STALE_JOB_MS` (default **45 min**) are requeued or failed. The file's own comment notes there is **no per-job heartbeat**, so this is only safe with a single worker process.
- **Reaping:** terminal jobs carry `expiresAt`; a TTL index on `magazineJobs.expiresAt` drops them after `MAGAZINE_V2_JOB_TTL_MS` (default 7 days).
- **API-side watchdog:** `healStuckIssue` in `lib/magazineV2/jobs.ts`, called from `GET /issues/:id`, marks an issue `failed` when no job exists past a 20s enqueue grace, or a job has outlived any possible real run.

### Job definition and enqueue

Types are declared server-side, handlers registered worker-side.

```ts
// apps/server/src/lib/magazineV2/jobs.ts
export type MagazineJobType = 'processIssue' | 'processPage' | 'generateIssue' | 'generatePages';

export interface JobPayloads {
  processIssue:  { issueId: string };
  processPage:   { issueId: string; pageId: string; index: number };
  generateIssue: { issueId: string; prompt: string; pageCount?: number; sourceText?: string; threadId?: string };
  generatePages: { issueId: string; count: number; topic?: string; atIndex: number; prevStatus: string };
}

export async function enqueueJob<T extends MagazineJobType>(type: T, payload: JobPayloads[T]): Promise<string> {
  const now = new Date().toISOString();
  return db.collection(COL.jobs).insertOne({
    type, payload, status: 'queued',
    attempts: 0, maxAttempts: JOB_MAX_ATTEMPTS, lastError: '',
    createdAt: now, updatedAt: now,
  });
}
```

```ts
// apps/worker/src/index.ts
const handlers: JobHandlers = {
  processIssue:  (payload) => processIssue(payload as { issueId: string }),
  processPage:   (payload) => processPageJob(payload as { … }),
  generateIssue: (payload) => { … generateMagazineIssue(…) },
  generatePages: (payload) => { … generateMorePages(…) },
  noop: async () => {},          // liveness / smoke test
};
startQueueLoop(handlers).catch(…)
```

`JobHandler` is typed `(payload: any) => Promise<void>` with an inline `eslint-disable` for `no-explicit-any`; every handler casts its payload at the boundary.

### Jobs that exist today

| Job | What it does |
|---|---|
| `processIssue` | Digitise an uploaded PDF/DOCX/JPEG/PNG into pages and editable elements |
| `processPage` | Re-run extraction for one page (the retry endpoint) |
| `generateIssue` | Build a whole issue from a brief via the multi-agent AI pipeline |
| `generatePages` | Design and insert N on-theme pages into an existing issue |
| `noop` | Heartbeat / smoke test |

### Progress reporting

There is **no queue-level progress API**. Progress is reported through the domain document instead: `magazinesV2` carries `status`, `stage`, `pagesProcessed`, `pagesTotal`, `processingError`, and pages flip `status: 'pending' → 'extracted' | 'failed'`. The client polls `GET /issues/:id` (~1.5s in `watchGeneration`).

Worker dependencies: `mupdf` (WASM rasteriser), `sharp`, `ai`, `zod`, `dotenv`. Note it loads the API's `.env` explicitly because its cwd differs.

---

## 4. Database

**MongoDB via the raw `mongodb` driver (v6). There is no Mongoose and no ODM — zero files reference it.**

`apps/server/src/lib/db.ts` wraps the driver with a thin helper exposing `collection(name)` with `findById`, `find`, `insertOne`, `updateOneIf` (compare-and-set), etc. It normalises `_id` to a string on read and filters `deletedAt` on `find()` — **but not on `aggregate()`**. Soft deletes are used throughout.

There are no schema definitions. Document shapes live in TypeScript interfaces beside the code that reads them. The `Doc` index signature is deliberately `any` (documented in `db.ts`) so routes can read arbitrary fields without failing strict `tsc`.

`MONGODB_URI` is required at import time — the process throws at startup if it is missing. There is no in-memory fallback.

### Collections

**Identity and access**

| Collection | Constant | Purpose |
|---|---|---|
| `users` | `USERS` | Accounts. `isAdmin`, `tokenVersion`, `lastLogin` |
| `otps` | `OTPS` | Hashed sign-in codes |
| `roles` | `ROLES` | Role catalogue (unique on `name`) |
| `adminRoles` | `ADMIN_ROLES` | User → role assignment (unique on `userId`) |
| `organisations` | `ORGANISATIONS` | Orgs |
| `orgMembers` | `ORG_MEMBERS` | Membership (unique on `userId`+`orgId`) |
| `people` | `PEOPLE` | Person records |
| `parties` | `PARTIES` | Claimed identities and horse links |
| `pendingStaffGrants` | `INVITES` | Staff invites, by `tokenHash` |

**Magazine v2** — names in `lib/magazineV2/collections.ts`

| Collection | `COL` key | Purpose |
|---|---|---|
| `magazinesV2` | `magazines` | Editable draft: title, slug, status, origin, owner, collaborators, gen plan |
| `magazinePagesV2` | `pages` | Per-page element payloads, `rev`, review state |
| `mediaAssetsV2` | `media` | Per-magazine media library |
| `magazineJobs` | `jobs` | The worker queue (TTL on `expiresAt`) |
| `magazineChatV2` | `chat` | Assistant messages |
| `magazineThreadsV2` | `threads` | Chat threads |
| `magazineReviewsV2` | `reviews` | Append-only submission/approval audit trail |
| `issues` | `published` | **Frozen published snapshots.** Name shared with the retired v1 builder |

**Content and engagement**

`articles`, `blogs`, `breakingNews`, `podcastEpisodes`, `mediaItems`, `notifications`, `comments`, `commentReports`, `reactions`, `reports`, `sponsors`, `sales`, `tips`, `tipperProfiles`, `horses`, `races`.

### Indexes

Declared centrally in `lib/ensureIndexes.ts` as a spec array, created fire-and-forget once per process on connect (idempotent, swallows its own errors). Roughly 50 index specs covering all of the above, including uniques on `users.email`, `blogs.slug`, `roles.name`, `adminRoles.userId`, `orgMembers.{userId,orgId}`, `reactions.{targetType,targetId,userId}`, and the TTL on `magazineJobs.expiresAt`.

---

## 5. S3

One module: `apps/server/src/lib/storage.ts`. Provider-agnostic — written against the S3 API, so `S3_ENDPOINT` also targets R2 / MinIO / Backblaze / Spaces.

**Configuration** (all env): `S3_BUCKET`, `S3_REGION` (or `AWS_REGION`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, plus optional `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE`, `S3_OBJECT_ACL`, `API_PUBLIC_URL`.

**When unconfigured** `isConfigured()` returns false and upload routes tell the client to fall back to inline data URLs, so local development works with no setup.

### Key convention

A single public prefix, `public/`, exposed by **bucket policy** — not by object ACL (`S3_OBJECT_ACL` defaults to `none`; the bucket has `BucketOwnerEnforced` + `BlockPublicAcls`).

```
public/magazinesV2/{magazineId}/source.{ext}                  imported source file
public/magazinesV2/{magazineId}/media/{uuid}.{ext}            media library uploads
public/magazinesV2/{magazineId}/{uuid}.{ext}                  ad-hoc uploads
public/magazinesV2/{issueId}/pages/{index}/background.jpg     extracted page rasters
public/blogs/{id}/…                                           blog imagery
public/{folder}/…                                             generic uploads
```

`PUBLIC_PREFIX = 'public/'`, with `isPublicKey(key)`, `publicUrl(key)` and `keyFromUrl(url)` as the round-trip helpers.

### How uploads happen

Two paths, both present:

1. **Proxied** — `uploadObject()`. The server streams bytes to S3. The browser only ever talks to our API, so no bucket CORS policy is needed. This is the default the client uses.
2. **Presigned PUT** — `presignPutUrl()`. The browser uploads directly to S3; needs bucket CORS. Used for large files, and it is the path the magazine builder takes: `POST …/media/upload-url` returns a presigned URL, the browser PUTs, then `POST …/media` registers the asset — **after the server verifies with `headObject`**, so client-reported size and content type are never trusted.

Other exports: `presignGetUrl`, `getObject`, `downloadObject`, `headObject`, `listObjectKeys`, `deleteObject`, `deleteObjectByUrl`.

There is **no derivative pipeline** — no proxy or thumbnail renditions are generated on upload. `sharp` is used inside the worker's extraction job only.

---

## 6. Frontend

| | Actual |
|---|---|
| React | **18.3.1** (`react`, `react-dom`) |
| Build | Vite 5.4 + `@vitejs/plugin-react` |
| Router | **react-router-dom 6.26** — 50 routes in `apps/web/src/App.tsx` |
| State | **Zustand 4.5**, used widely — 10+ stores |
| Styling | Tailwind CSS 3.4 + `tailwindcss-animate`, `clsx`, `tailwind-merge`, `class-variance-authority` |
| Components | **Radix primitives** (`react-dialog`, `react-label`, `react-slot`) wrapped in a small local set: `components/ui/{badge,button,dialog,input,label,textarea}.tsx`. No third-party component library |
| Icons | `lucide-react` |
| Animation | `framer-motion` 11 |
| Toasts | `sonner` |
| Markdown | `react-markdown` + `remark-gfm` |
| AI | `ai` (Vercel AI SDK) 6, `@ai-sdk/react` |
| Sanitisation | `dompurify` |
| Other | `qrcode.react`; `playwright` is a devDependency with no config or script |

Zustand stores: `stores/{authStore, articleStore, blogStore, agentUiStore, articleStudioUiStore, blogStudioUiStore, …}`, `pages/blog-composer/composerStore.ts`, `pages/instant/instantStore.ts`, `editor-v2/store.ts`, plus `lib/idbStorage.ts` (an IndexedDB persistence adapter).

`apps/web/src/` top level: `App.tsx`, `main.tsx`, `agent/`, `blog/`, `components/`, `editor-v2/`, `hooks/`, `lib/`, `pages/`, `rbac/`, `stores/`, `styles/`, `types/`.

---

## 7. The existing magazine editor

### Where it lives

| Layer | Path | Lines |
|---|---|---|
| Studio UI | `apps/web/src/editor-v2/` (23 files) | **8,063** |
| Domain libraries | `apps/server/src/lib/magazineV2/` (46 modules) | **18,447** (8,256 of which is `fontMetrics.data.ts`) |
| REST router | `apps/server/src/routes/magazinesV2/index.ts` | **3,022** (one file) |
| Server tests | `apps/server/tests/magazineV2/` | 19 suites |
| Worker jobs | `apps/worker/src/jobs/` | 2 files |
| Public reader | `apps/web/src/pages/BulletinViewer.tsx`, `Bulletins.tsx` | — |
| PDF export | `apps/server/src/lib/pdf.ts` | Puppeteer |

Web routes: `/production-system/magazine-v2` (library) and `/production-system/magazine-v2/:id` (studio). API mount: `/api/magazinesV2`. Everything is behind `MAGAZINE_V2=true` — with the flag off, every route 404s.

Largest UI files: `store.ts` 1,297 · `AiPanel.tsx` 655 · `MagazineEditorV2.tsx` 635 · `Inspector.tsx` 581 · `EditorCanvas.tsx` 576 · `api.ts` 531.

### The data model

Layout is data, not code. A page is a flat list of absolutely-positioned elements in the page's **own** canonical pixel space (A4 @ 150 DPI = 1240 × 1754 px; `pt = px × 0.48`). Pages carry their own `width`/`height`, so mixed page sizes already work at the model level.

```ts
// apps/server/src/lib/magazineV2/model.ts
export const ELEMENT_TYPES = ['text', 'image', 'shape', 'qr', 'icon'] as const;

export interface MagazineElement {
  id: string;
  type: ElementType;
  x: number; y: number; w: number; h: number;   // px, page-canonical
  rotation: number;                             // degrees
  zIndex: number;
  locked: boolean;
  text?: ElementTextData;
  image?: ElementImageData;
  shape?: ElementShapeData;
  qr?: ElementQrData;
  icon?: ElementIconData;
  source: 'extracted' | 'manual' | 'ai-agent';
  confidence?: number;
}

export interface ElementTextData {
  content: string;            // sanitised inline HTML
  role: 'headline' | 'subhead' | 'byline' | 'body' | 'caption' | 'pullquote' | 'other';
  fontFamily: string;
  fontSize: number;           // px, current (fitted) size
  maxFontSize?: number;       // design ceiling
  minFontSize?: number;       // legibility floor, carried on the element
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  autoFit: 'shrink' | 'clip';
  vAlign?: 'top' | 'center' | 'bottom';
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface ElementShapeData { fill: string; opacity?: number; }   // flat rectangle only
```

A page document (`magazinePagesV2`) holds `{ _id, magazineId, index, width, height, background, elements[], rev, status, review, … }`. `MAX_ELEMENTS_PER_PAGE = 400`.

**Text has no separate content store.** Each text element owns its own HTML and typography; there are no stories, no linked boxes, no named styles.

### Write path and concurrency

- The client never sends a whole page — every mutation is a targeted issue/page/element op applied server-side.
- Element writes are **compare-and-set on `page.rev`**. `rev` is mandatory; a stale writer gets `409` with the server's current page attached.
- Every element write — manual, AI, extraction, generation — passes `validate → sanitise → refit` in `writePipeline.ts`.
- Structural ops are serialised per issue with an **in-process** lock (`withIssueLock`).
- Invalid input is dropped, never thrown.

### Undo

Client-side only, in `editor-v2/store.ts`. Its opening comment states that **element add/delete and page-structure ops are not on the stack**; `apply-layout` is excluded too. Depth is 60 entries (`undoStack.slice(-59)`). Entries are `{ pageId, elementId, before, after }` element snapshots — not commands with inverses. `EditorCanvas.tsx` deletes the selected element on the Delete key with no confirmation.

### Rendering

One renderer, three consumers: `IssuePageCanvas` draws the editor base layer, the public reader and the Puppeteer PDF. Scaling is pure CSS — container queries, `%` positions, `cqw` font sizes. `lib/pdf.ts` navigates headless Chromium to the live viewer route `/bulletins/:id`, waits for `data-bulletin-ready="true"`, and prints at the page's own dimensions, with an LRU byte-bounded cache (256 MB) keyed `id:version:updatedAt`.

### Publishing

A frozen snapshot **by value** written into `issues` tagged `builder: 'v2'`. **One snapshot per magazine, refreshed in place** — the immutable-editions model was built and then dropped (2026-08-11) so the public URL never changes and reader reactions and comments stay attached. `version` still increments because it is part of the PDF cache key.

---

## 8. TypeScript

### Current configuration

| Flag | web | server | worker |
|---|---|---|---|
| `strict` | ✅ | ✅ | ✅ |
| `target` | ES2020 | ES2020 | ES2022 |
| `module` | ESNext | **CommonJS** | NodeNext |
| `moduleResolution` | bundler | node | NodeNext |
| `skipLibCheck` | ✅ | ✅ | ✅ |
| `noFallthroughCasesInSwitch` | ✅ | — | — |
| `noUnusedLocals` | **explicitly `false`** | **explicitly `false`** | — |
| `noUnusedParameters` | **explicitly `false`** | **explicitly `false`** | — |
| `verbatimModuleSyntax` | — | — | **explicitly `false`** |
| `noUncheckedIndexedAccess` | — | — | — |
| `noImplicitReturns` | — | — | — |
| `exactOptionalPropertyTypes` | — | — | — |

`apps/web` also sets `allowImportingTsExtensions`, `isolatedModules`, `noEmit`, and a `@/*` path alias. `apps/server` emits to `dist/` with declarations.

### Baseline

```
apps/web     0 errors
apps/server  0 errors
apps/worker  0 errors
```

The repository typechecks clean as configured.

### With RULES.md §9.1 flags enabled repo-wide

All seven flags not already on, added to the existing configs:

| App | Errors |
|---|---|
| `apps/web` | **275** |
| `apps/server` | **1,490** |
| `apps/worker` | **327** |
| **Total** | **2,092** |

Per flag, measured independently:

| Flag | Total | web | server | worker |
|---|---|---|---|---|
| `verbatimModuleSyntax` | **1,708** | 0 | 1,406 | 302 |
| `exactOptionalPropertyTypes` | **273** | 198 | 57 | 18 |
| `noUnusedLocals` | **62** | 43 | 15 | 4 |
| `noUncheckedIndexedAccess` | **38** | 26 | 9 | 3 |
| `noUnusedParameters` | **7** | 5 | 2 | 0 |
| `noImplicitReturns` | **1** | 0 | 1 | 0 |
| `noFallthroughCasesInSwitch` | 0 | on | 0 | 0 |

**82% of the total is one flag, and it is not a code-quality problem.** Every one of the 1,708 `verbatimModuleSyntax` errors is `TS1286` ("ESM syntax is not allowed in a CommonJS module when 'verbatimModuleSyntax' is enabled", 947 in server + 141 in worker) or `TS1287` (459 + 161). The server is `"module": "CommonJS"` while its source is written in ESM syntax that `tsc` down-compiles. Enabling the flag forbids that combination outright. Clearing it means migrating the server to ESM — a build and runtime change — not editing import statements.

Excluding `verbatimModuleSyntax`, the remaining six flags produce **381 errors**, and 273 of those are `exactOptionalPropertyTypes`.

---

## 9. Lint and test setup

### Lint

**There is no linter.** No `.eslintrc*`, no `eslint.config.*`, at root or in any app. ESLint is not in any `package.json`. There is no Prettier config either.

Source files contain `eslint-disable` comments (`@typescript-eslint/no-explicit-any` in `db.ts` and `worker/queue.ts`, `@typescript-eslint/no-namespace` in `auth.ts`) — written against a linter that is not installed.

### Tests

| App | Runner | Command |
|---|---|---|
| `apps/server` | Node's built-in test runner via `tsx` | `tsx --test tests/**/*.test.ts` |
| `apps/web` | **none** | — |
| `apps/worker` | **none** | — |

Server suites: 19 under `tests/magazineV2/` (`access`, `addPages`, `applyLayout`, `buildStatus`, `fitReport`, `layout`, `layoutFidelity`, `layoutFreedom`, `layoutReading`, `layoutSpec`, `model`, `pageDensity`, `pageFurniture`, `pruneSpec`, `publishGate`, `readingToSpec`, `solveLayout`, `submissions`, `threads`) plus `tests/permissions.test.ts`.

The route file itself has no test coverage — it cannot be imported by a test because it builds a Router and pulls in the DB. Correctness rests on rules deliberately extracted into pure modules.

`playwright` is a devDependency of `apps/web` with no config file, no spec directory, and no script.

### Other checks that do exist

`apps/server` has a set of bespoke script-based checks, all run manually:

```
check:types        tsc --noEmit -p tsconfig.scripts.json
check:permissions  scripts/check-permission-enforcement.ts
check:hooks        scripts/check-hooks.ts
check:studio       scripts/check-studio-tokens.ts
check:admins       scripts/check-admins.ts
check:fidelity     scripts/check-fidelity.ts
check:pages        scripts/check-pages.ts
```

`apps/worker` has `typecheck: tsc --noEmit`. `apps/web` has none.

### CI and hooks

No `.github/`, no CI configuration, no pre-commit hook, no husky. Deployment is `deploy.ps1` at the root.

---

## 10. Conflicts with FOUNDATION.md

FOUNDATION §13 Q1 asks "Greenfield or existing codebase?" and states the document assumes greenfield. **It is not greenfield.** Everything below follows from that.

### Structure and tooling

| # | FOUNDATION says | Repo has |
|---|---|---|
| F1 | §1: "Turborepo + pnpm workspaces" | npm workspaces, `package-lock.json`. No `turbo.json`, no pnpm lockfile or workspace file |
| F2 | §2: `apps/api` | `apps/server` |
| F3 | §2: `apps/viewer` as a separate app | The public reader is a route inside `apps/web` (`BulletinViewer.tsx` at `/bulletins/:id`) |
| F4 | §2: six `packages/*` (`schema`, `commands`, `store`, `canvas`, `ui`, `config`) | **`packages/` does not exist.** The workspace glob matches nothing |
| F5 | §2: "Import rules, enforced by eslint" | No ESLint is installed |
| F6 | §2: `features/*` never imports another feature | No `features/` directory; `apps/worker` imports `apps/server/src/**` by relative path across the app boundary |
| F7 | §1: "MongoDB via Mongoose" | Raw `mongodb` driver v6. **Mongoose appears nowhere in the repo** |
| F8 | §1: "State — Zustand for UI state, Yjs for magazine data" | Zustand is present and used; **Yjs, y-indexeddb and nanoid are not installed** |
| F9 | §1: "PDF output — `pdf-lib`, server-side" | `pdf-lib` is a server dependency but the magazine PDF path is Puppeteer rendering the live viewer route. `pdf-lib` is used elsewhere |
| F10 | §10: gate is "`pnpm build` and `pnpm test` clean" | Neither script exists. Root has `build` (web + server only) and no `test` |

### Data model

| # | FOUNDATION says | Repo has |
|---|---|---|
| F11 | ADR-002: points as the only unit, `1pt = 1/72in` | Pixels at 150 DPI (`PAGE_W/PAGE_H = 1240 × 1754`), with `pt = px × 0.48` applied at export |
| F12 | §3.2 `Magazine` with `spreads[]`, `stories`, `looks`, `palette`, `backgrounds`, `assets` | `magazinesV2` (meta) + separate `magazinePagesV2` documents. No spreads, no stories, no saved looks, no palette on the magazine, no repeating backgrounds |
| F13 | §3.3 `Item = TextBox \| Photo \| Shape \| Group` | `MagazineElement` with `type: 'text' \| 'image' \| 'shape' \| 'qr' \| 'icon'`. **No `Group`; `qr` and `icon` have no FOUNDATION equivalent** |
| F14 | §3.3 `TextBox` has `storyId`, `nextBoxId`, `prevBoxId`, `insets`, `columns`, `verticalAlign` | Text content lives **on the element** as sanitised HTML. No stories, no threading fields |
| F15 | §3.3 `Shape` has `shape: 'rect' \| 'ellipse' \| 'line'`, `cornerRadius`, `fill`, `stroke`, `textWrap` | `ElementShapeData` is `{ fill, opacity? }` — a flat rectangle, documented as such. No ellipse, line, radius, stroke or wrap |
| F16 | §3.3 `ItemBase.opacity` on every item | `opacity` exists only on `shape` |
| F17 | §3.4 `SavedLook`, `Story`, `Paragraph`, `TextRun`, `ParagraphProps`, `CharacterProps` | None of these exist |
| F18 | §3.6 nine invariants with `validateMagazine()` | `validateElements()` exists and clamps/drops rather than reporting. No document-level invariant checker |
| F19 | §3.5 `AssetRef` with `hash`, `intrinsic`, `credit` | `mediaAssetsV2` has `digest`, `kind`, `source`, `sourceText`, `alt` — no intrinsic size, no credit field |

### Command layer, store, renderer

| # | FOUNDATION says | Repo has |
|---|---|---|
| F20 | ADR-005 / §4: every change is a typed command carrying its own inverse; nothing mutates except through a command (**FWD-01**) | REST endpoints mutate directly. Guardrails come from a server-side write pipeline, not a command layer. **No command registry, no `dispatch()`, no inverses** |
| F21 | §4.4 history with `coalesceKey`, `maxDepth: 100` | Client-side 60-entry before/after element snapshot stack |
| F22 | §4.4 GL-06: every change undoable | Element add/delete, page structure and apply-layout are explicitly **not** on the stack |
| F23 | §4.6 headless build test using `dispatch()` alone | No such test; no dispatch to test |
| F24 | §5 `Store` over Yjs with `snapshot()`, `loadSnapshot()`, IndexedDB persistence | Zustand store issuing HTTP calls; persistence is server-side Mongo documents. `lib/idbStorage.ts` exists but is unrelated |
| F25 | §5 autosave: debounce 2s then `PUT /api/magazines/:id/snapshot` | Per-element CAS writes against `/api/magazinesV2/issues/:id/pages/:pageId/elements` |
| F26 | §6 own line breaking, `TextMeasurer` injected, layout in `packages/canvas` | No line-breaking engine. Text is HTML in a box with `autoFit: 'shrink' \| 'clip'`. `fontMetrics.data.ts` (8,256 lines) exists but serves the AI layout solver |
| F27 | §7 renderer draws text as **SVG with explicit per-line positions**, never HTML text with CSS | `IssuePageCanvas` renders HTML text with CSS, sized in `cqw` |
| F28 | §7 virtualise — mount only spreads in `spreadRange` | The editor scrolls all pages; thumbnails are lazy via IntersectionObserver, the canvas is not virtualised |
| F29 | §8 toolbar slots and `registerPanel`/`registerToolbarItem` | No slot registry. `Inspector.tsx` renders different sections per element type |

### Backend

| # | FOUNDATION says | Repo has |
|---|---|---|
| F30 | §9.1 `/api/magazines/*`, `/api/assets/*`, `/api/photos/search`, `/p/:publishId` | `/api/magazinesV2/*` with a different shape; the public reader is `/bulletins/:id` |
| F31 | §9.2 three collections: `magazines`, `versions`, `assets` | Eight magazine collections (§4 above) |
| F32 | §9.2 `versions` **immutable, append-only, no update path** | `issues` holds one snapshot per magazine, **refreshed in place**. The immutable-editions model was built and deliberately removed on 2026-08-11 |
| F33 | §9.3 `assets/{hash}/original + proxy.webp + thumb.webp` | `public/magazinesV2/{id}/…` with UUID filenames. **No derivative pipeline** |
| F34 | §9.3 `snapshots/{magazineId}/current.bin`, `published/{magazineId}/v{n}/…` | Neither prefix exists; documents live in Mongo, not S3 |
| F35 | §9.4 publish job computes layout with a **Node `TextMeasurer`** | PDF is produced by headless Chromium rendering the live viewer route |
| F36 | §9.4 vs ADR-004 | **Internal contradiction in FOUNDATION itself:** ADR-004 states "the PDF writer must receive pre-computed line positions from the client, not recompute them"; §9.4 step 2 has the job compute layout server-side |
| F37 | §13 Q3 "Does authentication exist?" | Yes — email OTP + Bearer JWT + full RBAC. `ownerId` resolves today only to a **staff** account; `isAdmin` gates the whole magazine surface and there is no self-serve path for a public user |
| F38 | §13 Q4 "Which photo library?" | Pexels is already integrated (`lib/stock.ts`, `lib/magazineV2/stock.ts`) behind `STOCK_PROVIDER` / `PEXELS_API_KEY`, used only by AI generation |
| F39 | §13 Q2 "What is in the existing worker setup?" | Hand-rolled Mongo poll queue; atomic claim, 3 attempts, TTL reaping, 45-minute stale sweep, **no heartbeat** (single-worker-safe only), no progress API |
| F40 | §11 lane ownership | Nobody owns HLP-01..03, the shared GL infrastructure (vocabulary scan, touch-target audit, error boundaries, logger, text-size setting), DOC-02's twelve designs, or migration of existing magazines |

---

## 11. Conflicts with RULES.md

### Rules whose enforcement does not exist

| # | RULES says | Reality |
|---|---|---|
| R1 | §9.2: a full ESLint rule set | **ESLint is not installed anywhere.** Every rule in §9.2 is currently unenforced |
| R2 | §9.2: `import/no-cycle`, `import/no-restricted-paths` | Needs `eslint-plugin-import`, not present. The lane zones must be hand-written per lane |
| R3 | §7.12 / §9.3: `pnpm lint`, `pnpm typecheck`, `pnpm test` | None of these scripts exist; the repo uses npm. Only `apps/server` has `test`, only `apps/worker` has `typecheck` |
| R4 | §9.3: pre-commit hook | No hook, no husky, no `.github/` |
| R5 | §9.4: CI on every merge — vocabulary scan, touch-target audit, headless build test, acceptance test | **No CI exists.** None of these four checks exists |
| R6 | §8: unit tests, invariant tests, an undo property test | No test runner in `apps/web`; no property-test library anywhere; no `validateMagazine()` to assert against |

### Rules the existing code violates today

| # | RULES says | Reality |
|---|---|---|
| R7 | §9.1 `noUnusedLocals` / `noUnusedParameters: true` | Both **explicitly set to `false`** in web and server. Enabling: **69 errors** |
| R8 | §9.1 `verbatimModuleSyntax: true` | **Explicitly `false`** in worker; server is CommonJS. Enabling: **1,708 errors**, all `TS1286`/`TS1287`. Needs an ESM migration, not import edits |
| R9 | §9.1 `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns` | None set. Enabling: **312 errors** |
| R10 | §2.1: 600-line hard maximum, CI fails above | Exceeded by at least: `routes/magazinesV2/index.ts` **3,022**, `fontMetrics.data.ts` **8,256**, `generate.ts` **1,743**, `store.ts` **1,297**, `agent.ts` 748, `readingToSpec.ts` 618, `applyLayout.ts` 618, `AiPanel.tsx` 655, `MagazineEditorV2.tsx` 635. Repo-wide `max-lines` would fail CI on day one |
| R11 | §1.3: no `any`, no `@ts-ignore`, no non-null assertion | `lib/db.ts` `Doc` has an `any` index signature (deliberate, documented); `worker/queue.ts` types `JobHandler` as `(payload: any)`; both carry `eslint-disable` comments for a linter that is not installed |
| R12 | §1.5: no `console.log` — "use the logger" | `console.log` / `console.error` / `console.warn` are the logging mechanism throughout (`db.ts`, `auth.ts`, `queue.ts`, `index.ts`). **No logger exists**, and neither document names one |
| R13 | §3.1: types live in type files, not inline in component files | `editor-v2/*.tsx` declare props interfaces inline throughout |
| R14 | §1.1: no silent fallbacks | `?? ''` and `?? 0` normalisation is pervasive in server env parsing and document reads — some legitimate under §1.1's own test, much of it not |

### Rules that conflict with the requirements or with FOUNDATION

| # | Issue |
|---|---|
| R15 | §7 line 7 says "Every control is at least 44×44 pixels (GL-01)" but omits GL-01's own clause "Selection handles are at least 14 pixels", added in PRD v2.0 specifically to resolve the ARR-01 contradiction. As written, RULES reinstates it |
| R16 | §7 has 12 lines; PRD §8.1 has 11. RULES drops PRD line 11 ("someone outside the team has used it to complete a real task") and adds three mechanical checks. The human gate is not relocated anywhere |
| R17 | §7 line 3 requires every feature to work "through `dispatch()` alone" — `dispatch()` does not exist (see F20) |
| R18 | §8 requires extending `packages/commands/test/headless-build.test.ts` — that package does not exist |
| R19 | §0 instructs placing RULES.md "at the repository root and reference it from `CLAUDE.md`". It is at `implmentations/RULES.md`, and **there is no `CLAUDE.md` at the repository root** |
| R20 | §1.6 requires Lane 0 approval for new dependencies, but FOUNDATION introduces Yjs, y-indexeddb, nanoid, pdf-lib usage, Turborepo and pnpm without pinned versions |
| R21 | §6.1 "Create files only under your lane's path" assumes the `features/<lane>/` layout from FOUNDATION §2.3, which does not exist |

---

## 12. Summary of measured facts

| Question | Answer |
|---|---|
| Monorepo? | Yes — npm workspaces, 3 apps, no packages, no Turborepo |
| Mongoose? | No — raw `mongodb` driver v6, no ODM, no schemas |
| Yjs? | Not installed |
| ESLint? | Not installed |
| CI? | None |
| Auth? | Email OTP + Bearer JWT + live RBAC resolution; staff-gated |
| Queue? | Hand-rolled Mongo poll queue, 3 attempts, TTL reap, no heartbeat |
| Baseline `tsc` errors | **0** across all three apps |
| `tsc` errors with RULES §9.1 | **2,092** (web 275, server 1,490, worker 327) |
| — of which `verbatimModuleSyntax` | **1,708** (82%), a module-system incompatibility, not code quality |
| — remaining six flags | **381** |
| Magazine editor size | 8,063 lines UI + 18,447 lines server libs + 3,022-line router |
| Files over the 600-line cap | 9 or more, largest 8,256 |
