// ---------------------------------------------------------------------------
// Magazine Builder v2 — the per-page REVIEW axis (submissions & approval).
//
// Review is a SECOND axis, deliberately separate from two things it is easy to
// confuse it with:
//
//   • magazinesV2.status  — the machine/distribution lifecycle
//     (draft · uploading · processing · ready · published · failed).
//   • magazinePagesV2.status — the EXTRACTION state of a digitised page
//     (pending · extracted · reviewed · failed). Nothing to do with human review.
//
// A magazine cannot meaningfully be "in submissions" when three of eight pages are
// submitted, two approved and three untouched — so the human state lives on the
// PAGE and anything magazine-level is derived from it.
//
// NO MIGRATION: every field here is optional on existing documents, and every
// reader goes through one accessor that supplies the default. That is why these
// helpers exist as a module rather than as `??` expressions at call sites — an
// inline default gets copied, then one copy drifts. Pure + server-safe.
//
// See docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md.
// ---------------------------------------------------------------------------

/** Where a page sits in the human review flow. */
export const PAGE_REVIEW_STATES = ['in_progress', 'submitted', 'approved'] as const;
export type PageReview = (typeof PAGE_REVIEW_STATES)[number];

const REVIEW_SET = new Set<string>(PAGE_REVIEW_STATES);

type PageDoc = { [k: string]: unknown };
type IssueDoc = { [k: string]: unknown };

/**
 * A page's review state. Absent (every page that predates this feature) or
 * unrecognised reads as `in_progress` — the state that grants the most editing
 * freedom, so a missing field can never accidentally LOCK a page.
 */
export function reviewOf(page: PageDoc | null | undefined): PageReview {
  const v = page?.review;
  return typeof v === 'string' && REVIEW_SET.has(v) ? (v as PageReview) : 'in_progress';
}

/** How many times this page has been sent back. 0 = never. */
export function reviewRoundOf(page: PageDoc | null | undefined): number {
  const v = page?.reviewRound;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** The page `rev` an approval was granted against, or null if never approved. */
export function approvedAtRevOf(page: PageDoc | null | undefined): number | null {
  const v = page?.approvedAtRev;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Has the page changed since it was approved? `rev` increments on every element
 * write, so this is exact rather than heuristic. A stale approval must not be
 * treated as an approval — otherwise a page is approved, quietly edited, and
 * published unreviewed while the UI still says "approved".
 */
export function isApprovalStale(page: PageDoc | null | undefined): boolean {
  if (reviewOf(page) !== 'approved') return false;
  const at = approvedAtRevOf(page);
  if (at === null) return true; // approved with no recorded rev — cannot be trusted
  const rev = typeof page?.rev === 'number' ? page.rev : 0;
  return rev > at;
}

/** Approved AND unchanged since — the only state that may publish. */
export function isApprovedAndFresh(page: PageDoc | null | undefined): boolean {
  return reviewOf(page) === 'approved' && !isApprovalStale(page);
}

// ── Published, then edited ──────────────────────────────────────────────────
//
// DECIDED 2026-08-11, replacing the v1/v2 immutable-edition model: a published
// magazine stays FREELY EDITABLE, publishing keeps overwriting the same snapshot,
// and there is no version number to reason about.
//
// The problem that versioning was solving does not go away, though: the moment
// someone edits a published magazine, the draft says one thing and readers see
// another. Editions hid that divergence behind a version; instead we SURFACE it —
// `needs_republish` — and make republishing one click.
//
// It is DERIVED, not stored, and that is the important part. A stored flag would
// have to be flipped by every write path that can change published content, and
// there are at least six of those (element CRUD, page structure, reset, publish
// selection, extraction confirm, per-page retry). One missed path and the UI
// quietly claims a magazine is in sync when it is not — the same class of bug as
// gating one door and calling the building locked. Derived from timestamps, it
// cannot drift, because there is nothing to keep in step.

/** Lifecycle statuses, including the derived one the API reports. */
export const REPUBLISH_STATUS = 'needs_republish' as const;

/**
 * Has the draft changed since the live edition was frozen?
 *
 * `pages` must be the magazine's own pages. Both clocks are checked because they
 * move on different things: a page's `updatedAt` covers every element write, while
 * the magazine's covers structure (add / delete / reorder) and the title — and both
 * of those are in the published snapshot too. Publishing sets the magazine's
 * `updatedAt` to the same instant as `publishedAt`, so a freshly published magazine
 * reads as in sync.
 */
export function needsRepublish(issue: IssueDoc | null | undefined, pages: PageDoc[]): boolean {
  if (String(issue?.status ?? '') !== 'published') return false;
  const publishedAt = typeof issue?.publishedAt === 'string' ? issue.publishedAt : '';
  if (!publishedAt) return false;
  const at = (v: unknown) => (typeof v === 'string' ? v : '');
  // ISO-8601 strings compare lexicographically, which is why every timestamp in this
  // system is stored as one.
  if (at(issue?.updatedAt) > publishedAt) return true;
  return pages.some((p) => at(p.updatedAt) > publishedAt);
}

/** Was this individual page touched since the live edition was frozen? */
export function pageEditedSincePublish(issue: IssueDoc | null | undefined, page: PageDoc): boolean {
  if (String(issue?.status ?? '') !== 'published') return false;
  const publishedAt = typeof issue?.publishedAt === 'string' ? issue.publishedAt : '';
  if (!publishedAt) return false;
  return (typeof page.updatedAt === 'string' ? page.updatedAt : '') > publishedAt;
}

// ── Transitions ─────────────────────────────────────────────────────────────

/** The three things anyone can do to a page's review state. */
export type ReviewAction = 'submit' | 'approve' | 'request-changes';

/**
 * The Mongo filter that pins a page's CURRENT review state, for a compare-and-set.
 *
 * `{ review: 'in_progress' }` would be WRONG: it does not match a page that
 * predates this feature, because in Mongo a missing field is not an equal field.
 * Every submit on a legacy page would then fail its CAS and report a phantom
 * conflict — the exact bug the runtime-defaults decision exists to avoid.
 *
 * `$nin` is the mirror image of `reviewOf`: a missing field, `null`, and any
 * unrecognised string all read as `in_progress` there, and all match here.
 */
export function reviewIs(state: PageReview): Record<string, unknown> {
  if (state === 'in_progress') return { review: { $nin: ['submitted', 'approved'] } };
  return { review: state };
}

/**
 * May `action` be applied to this page? Returns null when it may, otherwise a
 * CLAUSE the caller composes into a sentence naming the page ("Page 4 is …"), so
 * the rule and its explanation can't drift apart.
 *
 * Two deliberate allowances beyond the obvious happy path:
 *
 *  • **Re-approving a stale approval.** The owner approves page 4, then edits it;
 *    `isApprovalStale` makes that approval untrustworthy, so approve must be able
 *    to refresh `approvedAtRev` rather than the page being stuck un-publishable.
 *  • **request-changes doubles as REOPEN.** Editing a submitted or approved page
 *    is refused with "ask the owner to reopen it" — so the owner needs a way to
 *    do exactly that, from `approved` as well as from `submitted`. Without it that
 *    error message points at a door that doesn't exist.
 */
export function reviewTransitionError(action: ReviewAction, page: PageDoc | null | undefined): string | null {
  const state = reviewOf(page);
  if (action === 'submit') {
    if (state === 'submitted') return 'already submitted and waiting on the owner';
    if (state === 'approved') return 'already approved';
    return null;
  }
  if (action === 'approve') {
    if (state === 'submitted') return null;
    if (state === 'approved') return isApprovalStale(page) ? null : 'already approved, with no changes since';
    return 'not submitted for review yet';
  }
  if (state === 'in_progress') return 'not submitted for review, so there is nothing to send back';
  return null;
}
