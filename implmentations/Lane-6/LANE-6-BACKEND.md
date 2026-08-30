# Lane 6 — Backend

**Starts:** the moment Lane 0's gate passes. Does not wait for the vertical slice.
**Read first:** RULES.md + Amendment 1 · FOUNDATION v0.3 · Requirements v2.0 · LANE-0-FOUNDATION.md §4 for the working cycle

---

## 1. Your role

You own everything between the editor and the outside world: saving, publishing, versions, assets, and the public reader.

Two properties matter more than anything else you build.

**Work is never lost.** Autosave, the conflict path, and IndexedDB backup are the difference between a tool an older person trusts and one they abandon. GL-16 is yours.

**A published magazine never changes.** Someone sends the link to their garden club on Tuesday. If Wednesday's editing alters what the club sees, that is a genuinely upsetting failure — and PUB-02 exists to make it structurally impossible.

**You are independent.** No other lane touches your files, and you touch none of theirs. You do not wait for the canvas. Of the seven lanes you have the least coordination cost and the most self-contained scope — use that to get ahead.

---

## 2. What you own

```
apps/server/src/routes/magazineBuilder/
  index.ts        ← Lane 0 owns this file. Everything else below is yours.
  magazines.ts    CRUD, duplicate, rename
  snapshot.ts     autosave
  publish.ts      publish, versions, restore
  assets.ts       upload URLs, registration, derivatives
  photos.ts       Pexels proxy

apps/server/src/lib/magazineBuilder/
  jobs.ts         job types and payloads
  publishing.ts   version creation, freezing
  preflight.ts    PUB-07 checks
  assets.ts       hashing, derivatives, verification
  render.ts       internal render route token minting
  pexels.ts       search, attribution

apps/worker/src/jobs/publishMagazine.ts

apps/web/src/magazine-builder/viewer/     the public reader
```

## 3. What you must not touch

- `packages/mb-*` — Lane 0's
- Any `features/` directory
- `routes/magazineBuilder/index.ts` — Lane 0's mounting and middleware
- **`lib/auth.ts`, `lib/rbac.ts`, `lib/storage.ts`, `lib/db.ts`** — existing, working, reused as-is
- `lib/ensureIndexes.ts` beyond the specs Lane 0 already added
- Anything under `magazineV2`

Needing a change in any of these is a blocker.

---

## 4. Reuse, do not rebuild

The survey found working infrastructure. Using it is the point.

| Need | Use | Do not |
|---|---|---|
| Authentication | `attachAccount` from `lib/auth.ts` | Write any auth |
| Authorization | Existing RBAC verbs | Add an access tier |
| S3 | `lib/storage.ts` — `presignPutUrl`, `headObject`, `uploadObject` | Import the AWS SDK directly |
| Database | `lib/db.ts` — including `updateOneIf` for compare-and-set | Add Mongoose or any ODM |
| Queue | Existing Mongo poll queue, `enqueueJob` | Add BullMQ or any queue library |
| Stock photos | Existing Pexels integration in `lib/stock.ts` | Write a new client |
| PDF | Puppeteer, as `lib/pdf.ts` already does | Use `pdf-lib` for magazines |

**`lib/db.ts`'s `find()` filters `deletedAt` but `aggregate()` does not.** If you aggregate, filter soft deletes yourself.

---

## 5. Build order

| # | Requirement | Note |
|---|---|---|
| 1 | **Magazine CRUD** | Create, list, get, rename, delete. Nothing works without it. |
| 2 | **GL-16** Autosave | The editor is unusable without saving. Highest priority after CRUD. |
| 3 | **Assets** | Upload URL, verification, registration, derivatives. Lane 3 blocks on this. |
| 4 | **Pexels proxy** | IMG-02. Small once assets exist. |
| 5 | **DOC-11** Duplicate | Needed for "this month from last month's" |
| 6 | **PUB-04** Public viewer | Build before publish — publish renders through it |
| 7 | **PUB-01** Publish job | PDF, page images, version row |
| 8 | **PUB-03** Version list | |
| 9 | **PUB-05, PUB-06** Downloads | Falls out of 7 |
| 10 | **PUB-07** Pre-publish checks | |
| 11 | **PUB-08** Restore | |

**Steps 3 and 6 unblock other lanes.** Lane 3 cannot build photo handling without assets; the viewer is what publish renders. Prioritise both over anything optional.

---

## 6. The hard parts

### 6.1 Autosave — GL-16

More consequential than it looks. Get it wrong and people lose work.

```
PUT /api/magazine-builder/magazines/:id/snapshot
Body (gzipped): { document: Magazine, rev: number }

200 { rev }                  saved
409 { rev, document }        stale — server's copy attached
```

**Rules:**

- **Debounce 5 seconds after the last command**, not during typing. Continuous typing produces no saves until a pause.
- **Gzip.** Magazine JSON is repetitive and compresses roughly ten to one.
- **Skip entirely if nothing changed** since the last successful save.
- **Ceiling: save at least every 60 seconds** during continuous activity, so a crash never loses more than a minute.
- Compare-and-set on `rev` using `updateOneIf`. Never a blind write.

**The 409 must ask, never discard.** Collaboration is excluded, so the realistic cause is the user's own second tab. Telling them to reload throws away live work, straight against Principle 3.

> *"This magazine is also open in another window. Which version do you want to keep?"*
> **Keep what I have here** · **Use the other version**

"Keep what I have here" saves with the server's `rev` to force through. The other copy is in IndexedDB either way.

**Show saved state in plain words** — *"All changes saved"* / *"Saving…"* / *"Couldn't save — trying again"*. Never a spinner alone, never "synced", never a cloud icon with no text (GL-10).

### 6.2 Publish — PUB-01, PUB-02

**The ordering rule.** Upload everything to S3, **then** write the version row. Never the reverse. A row pointing at objects that do not exist is unrecoverable; orphaned objects are merely untidy.

```
1. Read the document from mbMagazines
2. Run pre-flight (§6.5). Record warnings; do not block.
3. Mint a render token. Puppeteer navigates /internal/render/:magazineId,
   waits for the ready flag, prints the PDF.
4. Render page images from the same page.
5. Upload PDF and images under published/v{n}/
6. THEN insert the mbVersions row and bump latestVersion.
```

**PUB-02 is enforced structurally, not by discipline.** `mbVersions` gets **no update route and no update code path**. Not a route that checks a flag — no route at all. Someone should have to write new code to break it.

Write that as a test: assert the router exposes no PATCH, PUT, or DELETE against a version.

**Progress** reports through the magazine document — `status`, `stage` — matching the existing pattern. The client polls. The queue has no progress API and you are not adding one.

**The queue has no heartbeat and is single-worker-safe only.** Fine at current volume. If publish ever runs concurrently, that needs solving first — raise it as a blocker rather than working around it.

### 6.3 The internal render route

This is a security boundary. Get it exactly right.

```
GET /internal/render/:magazineId?token=<hmac>
```

- Token is an HMAC over `{ magazineId, exp }` using `JWT_SECRET`, five-minute expiry
- Not linked, not in the client bundle, **404 without a valid token** — not 401, which confirms the route exists
- Renders the current draft
- The publish job mints a fresh token per run

**`/m/:publishId` accepts no version query parameter at all.** An earlier draft of the plan had publish use `/m/:publishId?version=draft`, which would have let anyone read unpublished work by guessing. The two surfaces are separate routes so the mistake cannot recur.

### 6.4 The public viewer — PUB-04

```
GET /m/:publishId          the latest published version
GET /m/:publishId/v/:n     that version, frozen
```

- No auth, no account needed
- **Ships no editor code.** A reader on a phone should not download the studio bundle. Separate route, separate chunk.
- Works on phones and tablets — reading on mobile is required even though editing is not
- Renders through Lane 0's `mb-render` in `mode: 'read'` (ADR-006). One renderer, three consumers.

**`publishId` never changes.** It is the stable URL, and reader engagement attaches to it. Per-version-only URLs were built on this platform and reverted on 2026-08-11 precisely because reactions and comments were orphaned.

A versioned page shows a plain-language note — *"This is version 2, published 3 March. See the current version."* — so nobody mistakes it for the live magazine.

### 6.5 Pre-publish checks — PUB-07

Reports problems, never blocks. The user may always publish anyway.

| Check | Message |
|---|---|
| Hidden text | *"Some text doesn't fit on page 4."* |
| Very low photo quality | *"A photo on page 2 may look blurry."* |
| Item outside the page | *"Something on page 7 is off the edge of the page."* |
| Missing photo | *"A photo on page 3 is missing."* |
| Empty magazine | *"This magazine has no content yet."* |

Each entry navigates straight to the affected item on click. A list of problems with no way to reach them is worse than no list.

Runs client-side before the job is enqueued — it needs `ThreadLayout`, which is a browser computation.

### 6.6 Assets

**Upload:** presigned PUT, following the existing pattern in `lib/storage.ts`.

1. `POST /assets/upload-url` returns a presigned URL
2. Browser PUTs directly to S3
3. `POST /assets/confirm` registers it — **after `headObject` verification**

**Never trust client-reported size or content type.** The existing magazine builder already does this and it is the right pattern.

**Derivatives are new** — the existing system has none. Generate on confirm, in the worker, with `sharp` (already a worker dependency):

| Name | Size | Used by |
|---|---|---|
| `proxy.webp` | 1200px long edge | The editor canvas |
| `thumb.webp` | 200px long edge | Asset browser |
| original | untouched | Publish only |

The editor must never load a 40MB original. It loads the proxy; publish uses the original.

**Content-addressed by SHA-256.** The same photo uploaded twice is stored once. Compute the hash server-side on confirm, not client-side.

**Pexels requires attribution.** Capture the credit string at search time and store it on the asset. It must be reproducible in published output.

---

## 7. Retention

**Keep everything.** Document snapshots are small. PDFs and page images are both regenerable in principle and both would drift if the renderer changes, so treating them differently would be inconsistent. Storage at this scale is not a real cost.

Revisit if it becomes one. Do not build a pruning job now.

---

## 8. File size

The old router is **3,022 lines in one file** with no test coverage, because it cannot be imported without building a Router and pulling in the database.

RULES §2.1 caps files at 600 lines. Beyond that:

**Business logic goes in `lib/magazineBuilder/` as pure modules.** Route files handle HTTP — parse, validate, call, respond — and nothing else. That is what makes the logic testable, and it is the pattern the existing test suites already rely on.

If a route file approaches 300 lines, logic has leaked into it.

---

## 9. Seams with other lanes

Almost none, which is why you can start early.

| Lane | Seam |
|---|---|
| 0 | You implement routes it stubbed. Its `index.ts` mounts yours. |
| 3 | Photos depends on your asset endpoints. **Ship those early.** |
| All | Publish is the first time the renderer sees every feature at once — an integration-stage concern, not yours alone. |

---

## 10. Traps

**Do not add a queue library.** The existing Mongo poll queue works. Adding BullMQ means Redis, a second queue in the codebase, and a dependency Lane 0 has not approved.

**`aggregate()` does not filter soft deletes.** `find()` does. Easy to leak deleted magazines into a list.

**Publish ordering.** Uploads before the version row. Always.

**404, not 401, on the render route.** A 401 confirms the route exists.

**Gzip both ways.** Autosave sends compressed; the 409 response returns a full document and should be compressed too.

**Version numbers must not race.** Two publishes for one magazine could both read `latestVersion: 3`. Use an atomic increment, not read-then-write.

**Test with a real magazine.** A one-page test document publishes fine. A 24-page one with photos and threaded text is where PDF generation times out. Build a large fixture early.

---

## 11. Your gate

Beyond RULES §7 for every requirement:

1. **PUB-02 structurally.** Publish, then edit heavily, then confirm the published link and PDF are byte-identical to before. Plus: the router exposes no mutation route against a version.
2. **Autosave survives.** Close the browser at ten random points during a session; nothing is lost in any case.
3. **The conflict asks.** Two tabs, both editing, and the second one offers a choice rather than discarding.
4. **The viewer is clean.** No editor code in its bundle. Loads and renders correctly on a phone with no account.
5. **A large magazine publishes.** 24 pages, photos, threaded text, end to end within an agreed time.
6. **Assets are verified.** A lying client — wrong content type, wrong size — is rejected at confirm.
7. **Restore works.** Restoring version 1 over a heavily edited working copy produces content identical to version 1, and version 2 is untouched.
8. **Ordering holds.** Kill the worker mid-publish; no version row exists pointing at missing objects.

---

## 12. Open questions

Two you will hit, neither blocking on day one:

1. **PUB-07's boundary.** It reports and allows publishing anyway. Is that right for *every* problem, including a missing photo? My view is yes — blocking an older person from publishing because one photo is missing is worse than a magazine with a gap. Confirm.
2. **Concurrent publish.** The queue is single-worker-safe. If two people publish different magazines simultaneously, one waits. Acceptable now; raise it before it is not.
