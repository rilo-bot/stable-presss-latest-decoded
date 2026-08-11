# Magazine v2 — submissions, approval, and republishing

**Status: S1–S5 BUILT 2026-08-11, then the EDITION MODEL WAS REVERSED.** Decisions below are locked unless
marked open. Read the reversal first — several sections further down describe a design that no longer exists.

---

## ⛔ REVERSED 2026-08-11 — no versions, one status instead

**The user dropped the v1/v2 immutable-edition idea.** Editing a published magazine does not create a
version, and publishing does not fork a snapshot. What replaced it:

| Was (S2 + S4) | Now |
|---|---|
| A published magazine was **read-only** (`draft-closed` on six content doors) | **Freely editable.** Publishing locks nothing |
| `POST …/revision` unlocked it and bumped `draftVersion` | **Endpoint removed.** Nothing needs unlocking |
| Publish **inserted one `issues` doc per edition**, stamping the old one `supersededAt` | Publish **overwrites the same snapshot**, as it did before S4 |
| `publishedIssueIds` history, `GET …/editions`, v1↔v2 compare | All gone |
| Divergence between draft and live edition was **prevented** | Divergence is **reported**: `needs_republish` |

**The problem versioning was solving does not disappear** — the moment you edit a published magazine, the
draft says one thing and readers see another. Editions hid that behind a version; now it is surfaced as a
status and cleared by one click of **Republish**.

### `needs_republish` is DERIVED, not stored

This is the part worth defending. A stored flag would have to be flipped by every write path that can
change published content, and there are at least six of those (element CRUD, page structure, reset, publish
selection, extraction confirm, per-page retry). One missed path and the studio quietly claims a magazine is
in sync when it is not — the same class of bug as gating one door and calling the building locked.

So it is computed from timestamps: `status === 'published' && (magazine.updatedAt > publishedAt || any
page.updatedAt > publishedAt)`. Publish sets `updatedAt` to the same instant as `publishedAt`, so a freshly
published magazine reads as in sync. Nothing to keep in step, nothing to drift.

Per page, the same comparison answers "would a republish change this one?" (`editedSincePublish`), which the
page rail shows on hover — so the header's warning is traceable to specific pages.

**The client adds a third source**, OR'd with the server's: element writes return only `{element, rev}`, so
without a local "I have edited since I loaded this" flag the studio would keep saying *in sync* through an
entire editing session on a published magazine — the one moment the warning has to be right. The server's
per-page flag is kept as a backstop: if a write path ever fails to mark it, the warning appears on the next
load rather than never.

### Two open questions this reversal CLOSED

- **Public bulletin links no longer break.** One snapshot means the id never changes, so shared and indexed
  `/bulletins/:id` URLs keep working across republishes.
- **Reader reactions and comments survive**, for the same reason — they target that unchanging id.

### What survived from S4

The publish **approval gate** (`lib/magazineV2/publishGate.ts`), the `withIssueLock` around publish, and the
delete confirmation — though the last one is now "this magazine is live on Bulletins" rather than a count of
editions. The snapshot still records `pages[].rev` as provenance of what readers were given.

### Kept the old shape where reverting would have been worse

`version` still increments on each republish, because the PDF cache key is `${id}:${version}:${updatedAt}` —
without the bump a republished edition could serve the previous render.

---

## S5 — what shipped

The flow became reachable. Everything here is **pure UI over data S3/S4 already put on the wire** —
no new endpoint, no new server code.

| | Result |
|---|---|
| New module | `editor-v2/review.ts` — the four-from-three column derivation, review scope, the publish gate and the read-only reason, all as pure functions |
| The board | `editor-v2/ReviewBoard.tsx` — four columns, one modal, **both roles**: owner approves / sends back, collaborator submits |
| Store | `submitPages` / `approvePages` / `requestChanges`, each setting `pages` from the server's reply and reporting `skipped` + email failures rather than hiding them |
| Header | a `v2 · revising` chip (only once there's more than one version to confuse), **`N awaiting you`** for the owner, **`Submit for review`** for a collaborator |
| Publish | disabled **with a reason**, per scope — a full edition and a selected edition are gated separately |
| Page rail | a coloured state dot per page + the full state, round and last note on hover |
| Read-only | an amber banner naming *why* this page won't take edits, with a link to the board |
| Verified | server · worker · web typecheck exit 0; 115 tests; server build exit 0; **web production build exit 0** |

### Decisions and one defect

- **Four columns from three stored states.** "Needs changes" is `in_progress AND reviewRound > 0`,
  derived in `columnOf`. Storage stays at three values; the board reads the way people think.
- **A stale approval stays in Approved** with an amber "edited after approval" strip, rather than
  jumping back to Submitted. The cause matters, and moving the card would hide it.
- **The solo-owner case says so out loud.** With no collaborators the board explains that nothing
  needs approving, instead of showing four empty columns that imply forgotten work.
- **Defect found in my own S5 code:** `publishBlockers` filtered on `selectedForPublish`, but a
  `'full'` publish includes **every** page whatever its flag. Publish would have looked enabled and
  then 409'd on the default path — the exact silent failure the disabled state exists to prevent.
  Now judged per scope, so one unapproved page can block "full" while "selected" stays open.

### Known gap

`editor-v2/review.ts` mirrors two server rules — `isInReviewScope` and `publishApprovalBlock` — and
**nothing tests the mirror**, because the repo has no web test harness (tests are `apps/server/tests`
only). Drift would make the UI promise something the API refuses. Mitigating factors: the server is
still the enforcement, so the failure mode is a 409 with an honest message rather than bad data, and
both rules are one-liners with their server twin named in a comment.

## Cross-phase review of S1–S4 (2026-08-11)

A read of every changed line, after all four phases were in, looking for what the per-phase
checks missed. **Five defects fixed, one product decision surfaced.**

### Fixed

1. **`POST /publish` had no serialisation — and S4 made that dangerous.** While publishing
   overwrote one snapshot a double-click was near-harmless: both calls wrote the same document.
   Once a publish can *insert* an edition, two concurrent calls both read `status:'revising'`,
   both insert, and the newsstand carries **two live editions of one magazine** — only one of them
   recorded in `publishedIssueIds`, leaving the other an orphan nothing can ever retire. Now inside
   `withIssueLock` with the state re-read and re-checked *inside* the lock. It also shares the
   structural-op lock, so a publish can no longer freeze a snapshot mid-reorder.
2. **`applyAllProposals` claimed success over refusals.** Its keep-going `catch {}` swallowed
   every failure and then toasted "Applied the assistant's changes." Harmless when the only
   failures were bugs; a lie now that a page op can be *legitimately* refused (submitted page,
   published draft). Failures are counted and reported, and a `remove-page` proposal on a
   submitted page routes through the store's `deletePage` so the owner still gets the warning
   instead of a silent no-op — the assistant asking on their behalf is no reason to skip it.
3. **Mail subject-header injection surface.** Magazine titles are only `.trim()`ed, so a newline
   reaches the `subject` line, which is a mail header. Both transports happen to encode subjects
   safely, but that is their choice, not ours — and S3 added three more templates over the same
   path. Control characters are now stripped centrally in `send()`, which also fixes the
   pre-existing share email.
4. **The draft-closed refusal told contributors to do something they cannot.** "Create a revision
   to make changes" is not an instruction a contributor can follow. One shared
   `DRAFT_CLOSED_MESSAGE` now names the owner, so it is true for both audiences and still
   actionable for the one who can act.
5. Two smaller ones already noted in the S3/S4 sections: the page-removed email could tell an
   `'all'`-scoped collaborator they had submitted someone else's page, and the submit reply
   returned the unfiltered page list to a page-scoped collaborator.

### Verified clean

- **Every `pageSummary` response was audited for scope.** Thirteen call sites: two creates and
  nine owner-only routes, plus `GET /issues/:id` and `POST …/pages/submit`, both of which go
  through `visiblePages`. The notes and `submittedBy` added in S3 leak nowhere.
- Route shapes don't shadow: `/pages/submit` etc. differ from `/pages/:pageId/…` in segment count,
  and `PATCH …/pages/reorder` was already the same pattern.
- Email HTML escapes every interpolated value (`esc`), including notes and display names.
- `GET …/editions` is safe for a page-scoped collaborator: a published edition's title and page
  count are public on the newsstand anyway.

### Known, accepted

- **A revision cannot be abandoned.** The only way out of `revising` is to publish. Not harmful —
  the live edition stays live — but there is no way back. That is S6's "Discard revision".
- **`approve` on 120 pages is 120 CAS updates + 120 audit inserts, sequentially.** Bounded and
  correct, but slow; the db wrapper has no `insertMany`. Same "load-everything" pattern the deep
  review already records for v2.
- **`loadReviewCtx` + the response each load every page with its elements.** Two full loads per
  review call. Consistent with the rest of v2; the wrapper offers no projection.
**Migrations are deliberately NOT run yet** — the user will perform them once every phase is done. Everything
shipped so far works on untouched documents through read-through defaults.

## S4 — what shipped

Publishing stopped overwriting one snapshot and started inserting **one document per edition**.

| | Result |
|---|---|
| Publish | insert-per-edition + `supersededAt` on the one it replaces + `publishedIssueIds` history + `draftVersion` converged on the edition number |
| Snapshot | `pages[].rev` frozen in, so a later revision can say exactly which pages changed |
| The gate | `lib/magazineV2/publishGate.ts` — every included page must be approved-and-fresh **or** out of review scope (`isInReviewScope`, the solo-owner rule) |
| Newsstand | `supersededAt: null` added to `GET /api/issues` (**and** to the index it is served by), plus get-one and the PDF route |
| Other readers fixed | the newsroom dashboard totals, the reactions "how many bulletins" count, and the assistant's `listBulletins` — each would have counted a republished magazine twice |
| New endpoint | `GET /issues/:id/editions` — version, publishedAt, pageCount, live/superseded/hidden |
| Delete | refuses a magazine with editions unless `?confirm=1`, names the count and the versions, then removes **every** edition (soft) |
| Web | `getEditions` + `deleteIssue(id, confirm)` and the confirm wired through `remove()` |
| Tests | **11 new** (`tests/magazineV2/publishGate.test.ts`), **115 passing** overall |
| Typecheck / build | server · worker · web exit 0; server build exit 0; `check:permissions` 0 unenforced |

### The two decisions that took the most care

**A new edition is created only when `status === 'revising'`** — the owner's own explicit act. The obvious
alternative, "is `draftVersion` greater than the live edition's `version`?", is **wrong on legacy data**:
republishing used to bump `version` in place, so an existing edition can already be at v7 while `draftVersion`
reads 1, and a revision would then quietly overwrite the live edition instead of superseding it. Publishing
also now writes `draftVersion = editionVersion`, so that legacy divergence self-heals after one publish.

**Unpublish no longer clobbers an open revision.** It used to set `status: 'ready'` unconditionally. With the
rule above, that would silently cancel the revision *and* make the next publish overwrite v1 with v2's content
— destroying an edition the history still claims exists. Hiding the live edition and reworking the next one are
independent acts, so they are now independent in code.

Ordering also matters inside publish: the new edition is **inserted before** the old one is superseded. The
worst case is then two live editions for a few milliseconds, which the newsstand tolerates; the reverse
ordering risks a magazine with *no* live edition, which is an outage.

### ⚠ Public bulletin links break on republish (found in the cross-phase review)

Superseded editions 404 for readers — that was the decision ("viewable by staff, not the public").
But neither of us was thinking about **links already out in the world** when we made it. Under
in-place republishing a shared or indexed `/bulletins/:id` URL kept working and simply showed the
newer content. Now v2 gets a *new id*, and every existing link to v1 dies the moment v2 publishes.

Options:
1. **Redirect readers to the live edition.** Store `supersededBy: <newId>` where we already stamp
   `supersededAt`, and have the reader route follow it. Keeps every old link working, keeps v1
   staff-readable for the compare view. My recommendation.
2. **Let superseded editions stay publicly readable at their own URL.** Arguably the truest form of
   "immutable editions" — v1 is a real artifact — but a reader following an old link would then be
   reading a stale magazine with no hint that a newer one exists.
3. Accept the 404. Simple, and wrong for anyone who shared a link.

Not built, because it is a product decision about what readers see.

### ⚠ One consequence that needs a decision (not yet built)

**Reader reactions do not follow a magazine across editions.** Reactions and comments target the *published
issue id*, and each edition is now a new document — so publishing v2 makes a bulletin's reaction counts appear
to reset to zero, and v1's reactions become unreachable along with v1. Republishing in place used to keep them.

Three options, in order of my preference:
1. **Re-point reactions/comments at the new edition on publish.** Matches the expectation "my bulletin has 40
   reactions"; loses the (unasked-for) record of which edition a reaction was left on. No index collision — the
   new id is unique, so `{targetType, targetId, userId}` stays satisfied.
2. **Aggregate across a magazine's editions when displaying.** Most correct, most work; needs a magazine-level
   key that `reactions` does not currently have.
3. **Accept per-edition reactions.** Defensible under "immutable editions", but it will read as data loss.

Nothing here is urgent until a magazine is actually republished after a revision. Flagged rather than chosen,
because it changes stored reader data either way.

---

## S3 — what shipped

The flow itself: a collaborator submits, the owner approves or sends work back, and every
transition is recorded and emailed.

| | Result |
|---|---|
| Endpoints | `POST …/pages/submit`, `…/pages/approve`, `…/pages/request-changes`, `GET …/reviews` |
| Audit trail | `COL.reviews` = `magazineReviewsV2`, append-only, **plus its index** `{magazineId, deletedAt, at:-1}` |
| Transition rules | `reviewIs` (the CAS filter) + `reviewTransitionError` (who may do what) in `review.ts` |
| Emails | `lib/notifyReview.ts` + three templates; **batched by recipient** — approving 8 pages split between 2 people sends 2 emails, each naming only that person's pages |
| Page naming | `lib/pageLabels.ts` — one formatter, now also used by the share email so the two can't drift |
| Agent role-gate | `runPageAgent({ canEditStructure })` **omits** the four page-structure tools for non-owners (§12.1) |
| Delete-submitted | 409 naming who submitted it → `?confirm=1` goes through; audit row written **before** the delete; the submitter is emailed |
| Web | `submitPages` / `approvePages` / `requestPageChanges` / `getReviews` in api.ts, and the delete-confirm wired into the store |
| DB writes | still **zero** migration — new page fields are written only when a transition happens |
| Tests | **13 new** (`tests/magazineV2/submissions.test.ts`), **104 passing** overall |
| Typecheck / build | server · worker · web all exit 0; server build exit 0; `check:permissions` 0 unenforced |

### Decisions made while building

- **`submitNote` is a NEW field, separate from the plan's single `reviewNote`.** One field would
  have the resubmit's "done" overwrite the owner's "fix the headline", and the board would then
  attribute the wrong words to the owner. `reviewNote` stays the owner's; approving with no note
  deliberately clears it (the feedback is resolved), and the audit trail keeps every note anyway.
- **`request-changes` doubles as REOPEN**, accepting `approved` as well as `submitted`. Every
  blocked edit tells the collaborator to "ask the owner to reopen it" — without this that message
  points at a door that doesn't exist.
- **A stale approval can be re-approved.** Approved at rev 5 then edited to rev 7 is untrustworthy,
  so approve must be able to refresh `approvedAtRev` or the page is stuck un-publishable.
- **Approve pins `rev` in its CAS; submit does not.** `approvedAtRev` is the entire basis of
  staleness, so recording a rev the page has moved past would publish unreviewed content under an
  "approved" badge. Submit has no such payload, and failing it on the submitter's own autosave
  would just be flaky.
- **`GET …/reviews` is tighter than the plan's "any member":** a page-scoped collaborator sees only
  rows for pages shared with them, because everywhere else in this router an unshared page is a 404.
  Accepted consequence: after a page is deleted its id is pruned from assignments, so the
  `page-removed` row is visible to the owner only — the collaborator gets the email instead.
- **No `GET …/board` endpoint.** `GET /issues/:id` already returns `collaborators` plus a
  `pageSummary` per visible page carrying `review`, `reviewRound`, `approvalStale`, both notes and
  `submittedBy`/`submittedAt`. A board endpoint today would be a second name for data that already
  ships; S5 is pure UI.
- **The owner cannot submit** (400, `reason: 'owner-does-not-submit'`), per §12. §7's table said
  "collaborator (or owner)"; the later decision wins.

### Verification pass — four defects found in my own S3 code

1. **`MAX_REVIEW_BATCH` was 100 while `MAX_PAGES_PER_ISSUE` is 120**, so "approve everything" on a
   full issue would have been refused. Now derived from the page cap rather than a guessed round number.
2. **The page-removed email would have lied.** Recipients came from `assigneesOfPage`, and an
   `'all'`-scoped collaborator is an assignee of *every* page — so they'd be told "a page you had
   submitted was removed" about someone else's submission. Now narrowed to `page.submittedBy`.
3. **The submit reply leaked the whole page list.** It returned `pagesFor(...)` unfiltered to a
   page-scoped collaborator, while every other read they get goes through `visiblePages`.
4. **A growing collection with no index.** The audit trail is append-only and never pruned, and
   every read filters `magazineId` and sorts by `at` — without an index that is a full scan over
   every magazine's history, forever.

---

## S1 + S2 — what shipped

| | Result |
|---|---|
| New module | `lib/magazineV2/review.ts` — the review axis + runtime-default accessors |
| Access split | `canViewPage` (assignment) vs `pageEditBlock`/`canEditPage` (assignment + review + draft-open) |
| The lock | Element writes, the AI agent and Fill/Adjust all refuse a submitted/approved page for non-owners, and refuse **any** edit while published |
| The key | `POST /issues/:id/revision` — owner-only, `published → revising`, `draftVersion++` |
| Web | `createRevision` in api + store, a **Create revision** button, and a **Live edition** link that survives into `revising` |
| DB writes | **zero** — every new field is optional with a read-through default |
| Tests | **17 new** (`tests/magazineV2/access.test.ts`), 91 passing overall |
| Typecheck / build | server · worker · web all exit 0; server build exit 0 |

### Verification pass — five bugs found in the first cut, all fixed

A route-by-route audit of every endpoint against its content gate turned up five real defects in my own S1/S2 work:

1. **The lock covered element writes only.** `requireOwnedIssue` gates the five structural routes (add page, duplicate, delete, reorder, AI-generate) on `isBusy` alone, so the owner could restructure a published magazine — diverging the draft from the live edition just as surely as an element edit. `reset` and the publish-selection toggle had the same gap.
2. **`POST /publish` was a back door.** It checked owner + `isBusy` only, and `selectedPageIds` rewrites *which* pages the live edition contains — so the public page set could change with no revision. Now refused while published; `revising` and `ready` still pass.
3. **`confirm-upload` and `pages/:pageId/retry` bypassed everything.** Both re-run extraction, which **rewrites page elements** — the most sweeping content change in the system — and neither checked draft state. `confirm-upload` did not check `isBusy` either, so a double call could start two extractions of the same issue.
4. **A lost-update race on `collaborators`.** The page-delete prune computed the new collaborator array from a magazine document loaded *outside* `withIssueLock`, so a share landing between the load and the write would be silently dropped. Now re-read inside the lock, for the same reason the pages already are.
5. **A rejected write left its optimistic edit on screen.** Element writes paint locally first, and `handleWriteError` only reverted when the 409 carried a `page` body — which a state block does not. The canvas kept showing an edit the server refused, so the user believed it had saved. Now a `reason`-bearing 409 re-fetches the stored page and discards the local change.

Plus one hardening: `POST /revision` uses `updateOneIf(id, {status:'published'}, …)` rather than a blind write, so two concurrent clicks cannot both bump the version and land on v3.

**Six content doors now go through `refuseIfDraftClosed`** — structural ops (via `requireOwnedIssue`), `reset`, publish-selection, `publish`, `confirm-upload` and per-page `retry` — plus `pageEditBlock` on every element/agent/format write. *Published means frozen* is now true of content, not just of elements.

**Deliberately deferred from S1:** no indexes yet (nothing queries the review fields until S3's board) and no unused accessors — `isApprovedAndFresh` and `editionIdsOf` exist because S4 needs them and they are cheap to test now, but nothing speculative beyond that.

**Known UI gap until S5:** the header shows `Create revision` and the live-edition link, but there is no per-page review badge yet — `pageSummary` already returns `review`, `reviewRound` and `approvalStale` for it.

---

**Date:** 2026-08-11 · **Branch:** `feature/blogs`
**Depends on:** nothing. **Blocks:** `docs/MAGAZINE-V2-QUALITY-PLAN.md` should land *after* this, because this changes the data model and that plan does not.
**Reference:** `docs/MAGAZINE-BUILDER-V2-TECHNICAL.md` (verified accurate).

---

## 1. What exists, and the hole in it

Already built and reused wholesale by this plan:

- **Sharing** — `POST /issues/:id/collaborators` adds a staff account as `editor` or `contributor` with `pageIds: string[] | 'all'`, and emails them a deep link naming their actual page numbers.
- **Per-page edit scoping** — `canEditPage(issue, uid, pageId)` in [access.ts](apps/server/src/lib/magazineV2/access.ts). **Every** element write, the AI agent route and Fill/Adjust all reach it through `loadEditablePage`.
- **Per-page publish selection** — `selectedForPublish`, honoured by `scope: 'selected'`.
- **Optimistic concurrency** — every page carries a monotonic `rev`, compare-and-set on every element write.
- **Frozen snapshots** — publish copies selected pages *by value* into `issues` with `builder: 'v2'`.

**The hole.** Verified: `canEditPage` checks assignment only, and `isBusy()` covers just `processing`/`uploading`. **Nothing stops anyone editing a magazine that is already published.** The draft drifts away from the live snapshot with no signal, and a later republish silently overwrites the public edition in place (`buildPublishSnapshot` → `updateOne(existingId, …)`). Immutable editions fix this, not as a nicety but as a correctness fix.

Two other findings that shape the design:

- **`publishedIssueIds: []` is written at create in four places and read nowhere.** A vestigial plural field, already in every document. It becomes the edition history at zero migration cost.
- **The public newsstand filters on `unpublishedAt: null`** ([routes/issues/index.ts:79](apps/server/src/routes/issues/index.ts#L79)). So inserting one `issues` document per edition would make *every* edition appear as a separate public bulletin unless superseded ones are excluded. This is the main integration risk — §11.

---

## 2. The model: two axes, never one enum

The proposal that started this had six states in one list. It mixed three different things — and the giveaway was "submissions — per page or per contributor". **Submission is per page; lifecycle is per magazine.** A magazine cannot be "in submissions" when three of eight pages are submitted, two approved and three untouched.

| Axis | Where | Values |
|---|---|---|
| **Lifecycle** (machine + distribution) | `magazinesV2.status` | `draft · uploading · processing · ready · published · **revising** · failed` |
| **Review** (human, per page) — NEW | `magazinePagesV2.review` | `in_progress · submitted · approved` |
| **Publish scope** (exists) | `magazinePagesV2.selectedForPublish` | now *gated* by approval |

Mapping the original six onto this:

| Proposed | Becomes | Why |
|---|---|---|
| 1. draft — 1st build | `status: 'draft'` / `'ready'` | already exists |
| 2. building | `status: 'processing'` | **already exists** — with `stage`, `pagesProcessed`, `pagesTotal`, and `isBusy()` already blocking structural edits. Adding `building` duplicates a working mechanism. |
| 3. revisions | **not a state** — `review: 'in_progress'` + `reviewNote` + `reviewRound` | As its own value it can't distinguish "never touched" from "sent back twice", and needs a rule for what happens when editing resumes. The board still gets its column — §8. |
| 4. submissions | `review: 'submitted'` **per page** | The unit of record is the page; a submission *event* can cover several pages at once — §5. |
| 5. approved | `review: 'approved'` + `approvedAtRev` | The rev is what makes it trustworthy — §4. |
| 6. publish | `status: 'published'` + a new immutable edition | §6. |

**Do not overload `magazinePagesV2.status`.** That field is extraction state (`pending · extracted · reviewed · failed`). Review is a separate axis and gets its own field.

---

## 3. Enforcement is one function

Every element write in v2 — add, patch, delete, the AI agent, Fill/Adjust — funnels through `loadEditablePage` → `canEditPage`. So the whole feature's enforcement is one added condition:

```ts
// access.ts — the ONLY place editability is decided.
export function canEditPage(doc, userId, pageId, page?): boolean {
  const ids = editablePageIds(doc, userId);
  if (ids !== 'all' && !ids.includes(pageId)) return false;   // assignment (today's rule)
  if (!isDraftOpen(doc)) return false;                        // published & no revision in flight
  const owner = doc.ownerId === userId;
  if (owner) return true;                                     // the owner is never locked out
  return page?.review !== 'submitted' && page?.review !== 'approved';
}
```

Consequences, all free:
- A submitted page is locked against its author **by construction**.
- **AI edits are blocked on a submitted page too**, because the agent route uses the same gate.
- A published magazine with no revision in flight is read-only — the hole in §1 closes.
- The owner is never locked out of their own magazine.

`canEditPage` currently takes three arguments and callers already have the page in hand (`loadEditablePage` fetches it before calling), so threading `page` in is mechanical.

---

## 4. Approval must go stale — and it scopes revisions for free

Store `approvedAtRev` when a page is approved. Because `rev` increments on every element write, **`page.rev > page.approvedAtRev` means the page changed after approval** and the approval is void.

Without this, someone approves page 4, the contributor edits it, and it publishes unreviewed while the UI still says approved.

The same rule then does a second job that nothing else has to implement:

> **Starting a revision resets nothing.** You create v2, edit only page 4, and only page 4's approval goes stale. Pages untouched since v1 stay approved and carry over.

So a one-page correction is a one-page re-approval, not eight. This is the single most important reason not to model revisions as a status that resets the board.

To make "changed since v1" exact rather than guessed, `buildPublishSnapshot` gains one field per page: the page's `rev` at publish time. Then

- **changed in this revision** = `draftPage.rev !== snapshotPage.rev`
- **carried over unchanged** = equal

which drives the per-page badge and scopes the compare view (§8).

---

## 5. Submissions

A **submission is an event over a set of pages**; the state lives on each page. That resolves "per page or per contributor": a contributor hits Submit once, it covers all three of their assigned pages, one event, three transitions, one email naming pages 4, 5 and 6.

**Who does what** — owner-only approval, per your decision:

| Actor | Can |
|---|---|
| **owner** | approve, request changes, publish, edit anything, always |
| **editor / contributor** | edit their assigned pages while `in_progress`, submit them |

**The solo-owner rule — load-bearing.** Most magazines will have no collaborators at all. If review binds on every page, a solo owner must approve their own eight pages before publishing: pure theatre, and exactly what makes people abandon a workflow feature.

> **Review only binds on pages assigned to a collaborator.** Unassigned pages belong to the owner and publish freely.

Derived, not stored: a page is *in review scope* when some collaborator's `pageIds` covers it (or is `'all'`).

**Audit trail in its own collection**, `magazineReviewsV2`: `{ magazineId, pageId, from, to, actorId, actorName, note, rev, at }`. Not an array on the page — page documents already ship `elements[]` on every fetch and are the heaviest objects in the system.

---

## 6. Immutable published editions

**Locked:** once published, no direct editing. To change a published magazine the owner creates a **revision**, which becomes the next version. v1 stays live and clearly labelled while v2 is built.

### 6.1 The shift

Publish currently **updates the same `issues` document in place** and bumps `version` — destructive, v1's content is gone. Change it to **insert a new `issues` document per edition**.

The draft/snapshot split already gives us versioning for free: the frozen v1 sits untouched in `issues` while `magazinesV2` + `magazinePagesV2` move on as v2. **No page copying, no branching.**

### 6.2 Lifecycle

```
ready ──publish──▶ published            edition v1 inserted, live
                      │
        create revision│  (owner)       draftVersion = 2, status: 'revising'
                      ▼                  approvals kept; staleness scopes the work
                  revising  ◀──┐
                      │        │ submit / request changes / approve  (per page)
             publish  │        │
                      ▼        │
                  published ───┘        edition v2 inserted live, v1 stamped superseded
                      │
          unpublish   ▼
                    ready                live edition hidden, history kept
```

`discard revision` (optional, §12) restores draft pages from the live snapshot and returns to `published` — possible precisely because the snapshot holds full elements by value.

### 6.3 Schema

```
magazinesV2
  status            + 'revising'
  draftVersion      NEW  int, starts 1 — the version the draft will become
  publishedIssueId  UNCHANGED, now means "the LIVE edition"   ← backwards compatible
  publishedIssueIds NEW USE  ordered history [id, …]          ← field already exists, unused

magazinePagesV2
  review            NEW  'in_progress' | 'submitted' | 'approved'   default 'in_progress'
  reviewNote        NEW  string — the owner's last feedback
  reviewRound       NEW  int, starts 0, ++ on each request-changes
  approvedAtRev     NEW  int | null
  submittedBy/At    NEW  audit convenience
  reviewedBy/At     NEW

issues (snapshot)
  version           EXISTS  the edition number (v1, v2, …)
  supersededAt      NEW  set when a newer edition goes live  ← excludes it from the newsstand
  pages[].rev       NEW  the draft rev each page was frozen at (§4)

magazineReviewsV2  NEW collection — the audit trail
```

### 6.4 No migration — runtime defaults instead

**Decided: there is no migration script.** Every new field is optional and every read tolerates its absence, so existing documents work untouched:

| Field | Read as |
|---|---|
| `page.review` | `page.review ?? 'in_progress'` |
| `page.approvedAtRev` | `?? null` (⇒ never approved ⇒ nothing to go stale) |
| `page.reviewRound` | `?? 0` |
| `magazine.draftVersion` | `?? (liveEdition?.version ?? 1)` |
| `magazine.publishedIssueIds` | `?? (publishedIssueId ? [publishedIssueId] : [])` |
| `edition.supersededAt` | `?? null` (⇒ the sole edition is live) |
| `snapshotPage.rev` | `undefined` ⇒ "changed since v1" is unknown, so show nothing rather than a wrong badge |

One helper per field, used everywhere — never an inline `??` scattered across call sites, or they will drift. This is the same drop-invalid/degrade-never-fail discipline the rest of v2 already follows, and it means S1 ships with **zero database writes**.

The one consequence to accept: a magazine published *before* this lands has no `snapshotPage.rev`, so its first revision cannot show per-page "changed since v1" badges. It recovers on the next publish. Fine — and better than a migration that guesses.

**A bonus:** the PDF cache key is `${id}:${version}:${updatedAt}`. With one document per edition the ids differ, so cache correctness gets *simpler*, not harder.

---

## 7. Endpoints

All owner/collaborator-gated through `roleOnMagazine`, all non-GET rate-limited by the existing `mag2-write` bucket.

| Endpoint | Who | Effect |
|---|---|---|
| `POST /issues/:id/pages/submit` | collaborator (or owner) | body `{ pageIds[], note? }` → those pages `in_progress → submitted`. Rejects pages not assigned to the caller, or not `in_progress`. Emails the owner, naming page numbers. |
| `POST /issues/:id/pages/approve` | **owner** | `{ pageIds[], note? }` → `submitted → approved`, sets `approvedAtRev = page.rev`. Emails each affected collaborator. |
| `POST /issues/:id/pages/request-changes` | **owner** | `{ pageIds[], note }` → `submitted → in_progress`, `reviewRound++`, stores `reviewNote`. `note` is **required**. Emails the collaborator with the note. |
| `GET /issues/:id/board` | any member | Per-page review state + assignee + changed-since-live + staleness. One call, no `elements[]`. |
| `GET /issues/:id/reviews` | any member | The audit trail, newest first, paginated like `/chat`. |
| `POST /issues/:id/revision` | **owner** | `published → revising`, `draftVersion++`. Refuses if already revising or not published. |
| `DELETE /issues/:id/revision` | **owner** | Discard: restore draft pages from the live snapshot, back to `published`. *(optional — §12)* |
| `GET /issues/:id/editions` | any member | The edition history: version, publishedAt, publishedBy, pageCount, live/superseded. |
| `POST /issues/:id/publish` | **owner** | **Changed:** inserts a new edition, stamps the previous `supersededAt`, appends to `publishedIssueIds`. Refuses unless every included page is approved-and-fresh *or* out of review scope. |

Batch shape (`pageIds[]`) everywhere, because a submission is an event over pages.

**Emails follow the share route's precedent exactly:** best-effort, return `{ emailed, emailError }`, **never fail the state change**, and name the actual page numbers.

---

## 8. UI / UX

Three surfaces. The goal is that at a glance you know *what is live*, *what is mine*, and *what is waiting on me*.

### 8.1 The studio header — version state is always visible

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ←  Spring Issue 2026        ┌──────────────┐ ┌───────────────┐               │
│    v2 · revising            │ v1 LIVE  ↗   │ │ 3 awaiting you │  [Publish v2]│
│                             └──────────────┘ └───────────────┘               │
└──────────────────────────────────────────────────────────────────────────────┘
```

- `v2 · revising` — what you are editing.
- **`v1 LIVE ↗`** — an emerald chip linking to the public bulletin. This is the "show somewhere that v1 is published" requirement, and it belongs in the persistent header, not a panel you have to open. It stays visible the entire time you build v2.
- `Publish v2` is **disabled with a reason** until every included page is approved-and-fresh — never a silent no-op. Hovering says *"page 4 was edited after approval"*.
- When published with no revision in flight, the whole editing surface is read-only and the primary action becomes **`Create revision (v2)`** — an explicit, named action, never a bare "Edit" that silently forks.

### 8.2 The review board — pages, not magazines

Reuse the story kanban's visual language (cards, horizontal scroll, small radii) rather than inventing a second board idiom.

```
 In progress (2)      Needs changes (1)     Submitted (3)        Approved (2)
┌──────────────┐     ┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│ ▢ p6  Gallery│     │ ▢ p4  Feature│      │ ▢ p2  Letter │     │ ▢ p1  Cover  │
│ Priya        │     │ Sam          │      │ Sam          │     │ carried over │
│              │     │ ⚠ "tighten   │      │ 2h ago       │     │ from v1      │
│              │     │   the deck"  │      │ [Approve]    │     │              │
│              │     │ round 2      │      │ [Changes…]   │     │              │
└──────────────┘     └──────────────┘      └──────────────┘     └──────────────┘
```

- **Four columns from three stored states.** "Needs changes" is `in_progress AND reviewRound > 0` — derived, so storage stays at three values and the board still reads the way people think.
- Cards carry a **page thumbnail** (the real renderer at small width), the page number, the assignee and the last note.
- **`carried over from v1`** on approved-and-unchanged pages. Without this the board looks like eight items of work when there is one, which is the failure mode of every workflow board.
- **Stale approvals surface as a distinct treatment**, not silently back in Submitted: an amber `approval stale — edited after approval` strip on the card, because the cause matters.
- Owner actions are on the card. Multi-select then one Approve for a batch.

### 8.3 Versions panel — a right-pane tab beside Element / Assets

```
 Editions
 ┌────────────────────────────────────────────┐
 │ ● v2   draft · revising      5 of 8 ready  │
 │ ● v1   LIVE  · 4 Aug, Mahin · 8 pages      │
 │        [View ↗]  [Compare with v2]         │
 │ ○ —    no earlier editions                 │
 └────────────────────────────────────────────┘
```

**Compare is nearly free, and it is the best payoff of the one-renderer invariant.** `IssuePageCanvas` already renders editor, reader and PDF from the same data, so a side-by-side "v1 page 4 | v2 page 4" is two instances of a component that already exists — no diff engine, no second renderer. Scope it to the pages where `draftPage.rev !== snapshotPage.rev` so it opens on what actually changed.

### 8.4 Cross-magazine attention

The Production System Overview was rebuilt around an attention list. **"3 pages awaiting your approval"** belongs there, across all magazines, linking straight to the board — not buried inside one magazine. For a collaborator, the mirror: "2 pages need your changes".

### 8.5 The page stack

Each page in the vertical stack gets one badge: `submitted` / `approved` / `needs changes · round 2` / `carried over from v1`, plus a lock affordance when it is read-only, with the reason ("submitted 2h ago — ask the owner to reopen"). A read-only page that just silently ignores clicks is the worst possible version of this feature.

---

## 9. What this deliberately does not do

- No new enforcement surface — `canEditPage` remains the only decision point.
- No page copying or branching for versions — the existing draft/snapshot split already is the version boundary.
- No change to the solver, the renderer, or the write pipeline.
- No approval by `editor` collaborators (your call: owner-only for now). The shape supports adding it later — approval is already a permission check, not a hardcode.
- No reset of review state when a revision starts. Staleness handles it.

---

## 10. Build order

| Phase | Scope | Why here |
|---|---|---|
| **S1** ✅ | Field accessors + runtime defaults (§6.4) and the stale-`pageIds` cleanup (§11.6). **No migration, no behaviour change.** | Everything else reads through these helpers; shipped with zero DB writes. |
| **S2** ✅ | The access split, the draft-open lock on every content door, and `POST /revision` as its key. **Closed the edit-after-publish hole.** | The correctness fix. Shipped with the minimal web wiring so the lock is never a dead end. |
| **S3** ✅ | Submit / approve / request-changes endpoints + `magazineReviewsV2` + emails + **role-gate the agent's page tools** (§12.1) + the delete-submitted warn/notify. | The flow itself, testable by API before any UI. |
| **S4** ✅ | Publish → immutable editions: insert-per-edition, `supersededAt`, `publishedIssueIds`, snapshot `pages[].rev`, the approval gate, **newsstand filter fix (§11)**, `GET …/editions`, the delete guard. | Depends on S1/S3; the riskiest server change. |
| **S5** ✅ | Board + header version chips + per-page badges + the Submit button + publish-disabled-with-a-reason + the read-only banner. | The visible half. |
| **S6** | Versions panel + compare view + Overview attention list. | Highest polish, lowest risk. |

S2 alone is worth shipping early — it closes a live hole regardless of when the rest lands.

---

## 11. Risks

1. **The newsstand would show every edition.** `GET /api/issues` filters only `unpublishedAt: null`, so N editions per magazine become N public bulletins. **S4 must add `supersededAt: null` to that `$match`** — and note the aggregation does *not* inherit `find()`'s soft-delete filter, so the existing `deletedAt: null` there is load-bearing; add alongside it, carefully.
2. **Deleting a draft currently deletes its published snapshot** ([index.ts:916](apps/server/src/routes/magazinesV2/index.ts#L916)). With history that would destroy every edition. **Refuse to delete a magazine with published editions**, or require an explicit confirmation that names how many editions will be destroyed. Losing published history is worse than an orphan.
3. **Republish semantics get stricter.** Editing a published magazine now requires an explicit revision. That is the point, but it is a behaviour change for anyone used to the current silent overwrite — worth a one-line note in the UI the first time.
4. **`isBusy` interaction.** "Add more pages" runs while `processing`; new pages must land `review: 'in_progress'` and unassigned, so a mid-flight generation can't inject unreviewed pages into an otherwise-approved issue.
5. **Email volume.** A per-page approve on eight pages must send *one* email, not eight. Batch by recipient.
6. **Stale `collaborators[].pageIds` after a page delete.** Verified: `DELETE …/pages/:pageId` removes the page and reindexes, but **never prunes that id from any collaborator's assignment**. Harmless today (a stale id simply never matches a page, so `canEditPage` returns false for something that no longer exists) but the board and the share dialog would report "3 pages assigned" when one is gone. **Fixed in S1** by pruning the id inside the same `withIssueLock` block.
7. **Deleting a page a collaborator has submitted** — *decided: allow, but warn and notify.* The owner confirms a dialog naming who submitted it, and the collaborator is emailed that their submitted page was removed. The audit row is written before the delete so the trail survives the page.

---

## 12. Decided

- **Approval is owner-only** for now.
- **Published editions are immutable.** A revision becomes the next version; v1 stays live and labelled until v2 publishes.
- **The owner never submits.** A collaborator submits straight into the owner's approval queue, and the owner then approves and re-publishes. No self-submission, so the solo case has zero ceremony.
- **Only the owner adds pages.** *Already true in code* — `requireOwnedIssue` gates `POST /issues/:id/pages`, `…/duplicate`, `DELETE …/:pageId`, `PATCH …/reorder` and `POST …/pages/generate`. No work needed, but see the gap below.

### 12.1 A gap this exposes — the AI agent has no role awareness

`runPageAgent` is never told the caller's role, so it offers `add_page`, `add_content_pages`, `remove_page` and `reorder_pages` to **every** caller including contributors. A contributor asks for a page, the model stages the proposal, and `applyAllProposals` calls the owner-only endpoint — which 403s. The client `catch { /* keep applying the rest */ }` **swallows it**, so the contributor sees "Applied the assistant's changes" and nothing happened.

Fix in S3: pass the caller's `MagRole` into `runPageAgent` and **omit the four page-structure tools** when they are not the owner. Omitting beats refusing — the model can't offer what it can't see, so it says "I can change this page, but only the owner can add pages" instead of staging something doomed. Whether `applyAllProposals` should also stop silently swallowing failures is tracked as M4-adjacent in the review doc.

## 13. Still open

1. **Discard revision** — worth building? Cheap (restore draft pages from the live snapshot) and the only way back from "started a revision by mistake". Recommend yes, in S6.
2. **How many editions to keep?** Snapshots hold full element payloads, so history has real storage cost. Recommend keeping all for now — but decide before it is thousands.
3. **Should a superseded edition stay viewable by URL?** Recommend yes for staff (the `/bulletins/:id` route already lets staff view unpublished issues with a token), no for the public.
