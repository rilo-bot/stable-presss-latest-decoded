# Magazine v2 — submissions, approval, and immutable published editions

**Status: PLANNED.** Nothing built. Decisions below are locked unless marked open.
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

**Migration is a non-destructive backfill:** for every magazine with a `publishedIssueId`, set `publishedIssueIds = [thatId]` and `draftVersion = (edition.version ?? 1)`. Existing pages default to `review: 'in_progress'`. Nothing is rewritten or deleted, and every existing read path keeps working because `publishedIssueId` keeps its meaning.

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
| **S1** | Schema + migration backfill + `review` on pages, defaulted. No behaviour change. | Everything else reads it; ships invisibly. |
| **S2** | `canEditPage` gains the review + draft-open conditions; `isDraftOpen`. **Closes the edit-after-publish hole.** | The correctness fix. Small, high value, independent of any UI. |
| **S3** | Submit / approve / request-changes endpoints + `magazineReviewsV2` + emails + **role-gate the agent's page tools** (§12.1). | The flow itself, testable by API before any UI. |
| **S4** | Publish → immutable editions: insert-per-edition, `supersededAt`, `publishedIssueIds`, snapshot `pages[].rev`, the approval gate, **newsstand filter fix (§11)**. | Depends on S1/S3; the riskiest server change. |
| **S5** | Board + header version chips + per-page badges. | The visible half. |
| **S6** | Versions panel + compare view + Overview attention list. | Highest polish, lowest risk. |

S2 alone is worth shipping early — it closes a live hole regardless of when the rest lands.

---

## 11. Risks

1. **The newsstand would show every edition.** `GET /api/issues` filters only `unpublishedAt: null`, so N editions per magazine become N public bulletins. **S4 must add `supersededAt: null` to that `$match`** — and note the aggregation does *not* inherit `find()`'s soft-delete filter, so the existing `deletedAt: null` there is load-bearing; add alongside it, carefully.
2. **Deleting a draft currently deletes its published snapshot** ([index.ts:916](apps/server/src/routes/magazinesV2/index.ts#L916)). With history that would destroy every edition. **Refuse to delete a magazine with published editions**, or require an explicit confirmation that names how many editions will be destroyed. Losing published history is worse than an orphan.
3. **Republish semantics get stricter.** Editing a published magazine now requires an explicit revision. That is the point, but it is a behaviour change for anyone used to the current silent overwrite — worth a one-line note in the UI the first time.
4. **`isBusy` interaction.** "Add more pages" runs while `processing`; new pages must land `review: 'in_progress'` and unassigned, so a mid-flight generation can't inject unreviewed pages into an otherwise-approved issue.
5. **Email volume.** A per-page approve on eight pages must send *one* email, not eight. Batch by recipient.

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
