// Magazine Builder v2 — collection names (kept in one place so routes/worker
// never hard-code strings). All are NEW collections; v1 'magazines'/'issues'
// are untouched. db.collection(name) works for any name (see lib/db.ts).

export const COL = {
  /** v2 issue meta (title, slug, status, origin, owner, collaborators…). */
  issues: 'magazinesV2',
  /** Per-page element data — split out so one page is re-processable alone. */
  pages: 'magazinePagesV2',
  /** Per-magazine browsable media library (upload/photo/graphic + provenance). */
  media: 'mediaAssetsV2',
  // `published: 'publishedIssuesV2'` was declared here and NEVER read or written.
  // Publishing freezes into the shared `issues` collection — the one the public
  // newsstand and the PDF route already read (see routes/magazinesV2.ts publish).
  // A collection name that nothing uses reads like a live seam, so it's gone.
  /** Worker job queue (extraction / generation). */
  jobs: 'magazineJobs',
  /** Persistent per-magazine assistant chat thread (page-tagged, paginated) —
   *  so the conversation survives reloads instead of living only in memory. */
  chat: 'magazineChatV2',
} as const;
