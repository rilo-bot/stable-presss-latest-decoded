// Magazine Builder v2 — collection names (kept in one place so routes/worker
// never hard-code strings). All are NEW collections; v1 'magazines'/'issues'
// are untouched. db.collection(name) works for any name (see lib/db.ts).

// NAMING — read this before adding a call site.
//
// Two different collections are involved in one magazine, and the word "issue"
// used to point at BOTH. `COL.issues` resolved to `magazinesV2` (the editable
// draft) while a bare `collection('issues')` meant the published snapshot — and
// routes/magazinesV2.ts used both, 21 times and 5 times respectively, in the same
// file. Nothing was broken by it, but swapping one for the other looked like a
// tidy-up and would have written drafts into the public collection.
//
// So: the draft is a MAGAZINE, the frozen published snapshot is a PUBLISHED
// magazine, and both now have a name here. Prefer `COL.*` over a raw string.
//
// Also note the id convention: `_id` is an ObjectId but the `magazineId` field on
// pages/media/chat is its STRING form. db.collection() normalises `_id` to a string
// on read so app code never notices, but a query written against the raw driver
// must use `String(id)` — pass the ObjectId and it matches nothing and returns an
// empty array rather than erroring.
export const COL = {
  /** Editable magazine draft: title, slug, status, origin, owner, collaborators… */
  magazines: 'magazinesV2',
  /**
   * FROZEN published snapshots — what the public newsstand, the reader's Bulletins
   * page and the PDF route all read. Shared with the retired v1 builder, hence the
   * bare name. Written only by the publish handler in routes/magazinesV2.ts.
   */
  published: 'issues',
  /** Per-page element data — split out so one page is re-processable alone. */
  pages: 'magazinePagesV2',
  /** Per-magazine browsable media library (upload/photo/graphic + provenance). */
  media: 'mediaAssetsV2',
  /** Worker job queue (extraction / generation). */
  jobs: 'magazineJobs',
  /** Persistent assistant chat MESSAGES (page-tagged, paginated) — so the
   *  conversation survives reloads instead of living only in memory. Every new
   *  message carries `threadId` + `userId`; rows with neither are the legacy
   *  flat log, served as one read-only "Earlier conversation". */
  chat: 'magazineChatV2',
  /**
   * Chat THREADS — one document per conversation, private to whoever started it.
   *
   * A thread is explicit rather than derived, because the things a user does to
   * one (name it, come back to it, delete it) all need something to point at.
   * The magazine owner can read every thread; nobody else sees anyone else's.
   */
  threads: 'magazineThreadsV2',
  /**
   * The submissions/approval AUDIT TRAIL — one row per review transition
   * (submit / approve / request-changes), append-only.
   *
   * Its own collection rather than an array on the page: page documents already
   * ship `elements[]` on every fetch and are the heaviest objects in the system,
   * so growing them with history would tax every editor load. It also survives
   * the page — a row written just before a submitted page is deleted keeps the
   * record of who submitted what.
   */
  reviews: 'magazineReviewsV2',
} as const;
