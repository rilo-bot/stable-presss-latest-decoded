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
  /** Persistent per-magazine assistant chat thread (page-tagged, paginated) —
   *  so the conversation survives reloads instead of living only in memory. */
  chat: 'magazineChatV2',
} as const;
