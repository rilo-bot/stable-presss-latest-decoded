// Magazine Builder v2 — client-side view of the per-page REVIEW axis.
//
// Everything here is DERIVED from what the server already sends on each
// PageSummary (`review`, `reviewRound`, `approvalStale`, `submittedBy`) plus the
// issue's `collaborators`. No new endpoint: S3/S4 put the fields on the wire
// precisely so this phase could be pure UI.
//
// TWO RULES ARE MIRRORED FROM THE SERVER and must not drift, or the UI will
// promise something the API then refuses:
//
//   • review scope        — lib/magazineV2/access.ts  → isInReviewScope
//   • the publish gate    — lib/magazineV2/publishGate.ts → publishApprovalBlock
//
// They are re-implemented rather than fetched because both are cheap predicates
// over data already in the store, and a round trip per page would make the page
// rail flicker. Each one below names its server twin.

import type { IssueMeta, PageSummary } from './api';

/** The FOUR board columns, derived from the three stored states. */
export type ReviewColumn = 'in_progress' | 'needs_changes' | 'submitted' | 'approved';

/**
 * "Needs changes" is not stored — it is `in_progress` with a round already behind
 * it. Storage stays at three values; the board still reads the way people think
 * about it, which is the whole reason for the derivation.
 */
export function columnOf(p: PageSummary): ReviewColumn {
  const review = p.review ?? 'in_progress';
  if (review === 'submitted') return 'submitted';
  if (review === 'approved') return 'approved';
  return (p.reviewRound ?? 0) > 0 ? 'needs_changes' : 'in_progress';
}

export const COLUMN_ORDER: ReviewColumn[] = ['in_progress', 'needs_changes', 'submitted', 'approved'];

export const COLUMN_LABEL: Record<ReviewColumn, string> = {
  in_progress: 'In progress',
  needs_changes: 'Needs changes',
  submitted: 'Submitted',
  approved: 'Approved',
};

/** One palette for badges, dots and column headers, so they can't disagree. */
export const COLUMN_TONE: Record<ReviewColumn, { dot: string; chip: string; text: string }> = {
  in_progress: { dot: 'bg-white/30', chip: 'border-white/20 bg-white/5', text: 'text-white/60' },
  needs_changes: { dot: 'bg-amber-400', chip: 'border-amber-400/30 bg-amber-400/10', text: 'text-amber-200' },
  submitted: { dot: 'bg-sky-400', chip: 'border-sky-400/30 bg-sky-400/10', text: 'text-sky-200' },
  approved: { dot: 'bg-emerald-400', chip: 'border-emerald-400/30 bg-emerald-400/10', text: 'text-emerald-200' },
};

/**
 * Mirrors the server's `isInReviewScope` — THE SOLO-OWNER RULE.
 *
 * Review binds only where somebody other than the owner is involved. A magazine
 * with no collaborators has nothing in review scope, so a solo owner never sees a
 * board full of approvals they have to grant themselves.
 */
export function inReviewScope(issue: IssueMeta | null, pageId: string): boolean {
  const collaborators = issue?.collaborators ?? [];
  return collaborators.some((c) => c.pageIds === 'all' || (Array.isArray(c.pageIds) && c.pageIds.some((id) => String(id) === String(pageId))));
}

/** Display names for whoever this page is shared with, owner excluded. */
export function assigneeNames(issue: IssueMeta | null, pageId: string): string[] {
  const collaborators = issue?.collaborators ?? [];
  return collaborators
    .filter((c) => c.pageIds === 'all' || (Array.isArray(c.pageIds) && c.pageIds.some((id) => String(id) === String(pageId))))
    .map((c) => c.displayName || c.email)
    .filter(Boolean);
}

/** Approved AND unchanged since — the only state the server will publish. */
export function approvedAndFresh(p: PageSummary): boolean {
  return (p.review ?? 'in_progress') === 'approved' && !p.approvalStale;
}

/**
 * Mirrors `publishApprovalBlock`: the pages that will make the server refuse.
 *
 * SCOPE MATTERS, and getting it wrong breaks the whole promise of disabling the
 * button. The server judges only the pages actually going out — and a `'full'`
 * publish includes EVERY page regardless of its `selectedForPublish` flag, while
 * `'selected'` honours the flags. Filtering on the flag in both cases would leave
 * Publish enabled for a full edition that the server then refuses with a 409, which
 * is exactly the silent no-op this is meant to prevent.
 *
 * Judging only the included pages is also what makes "leave it out of this edition"
 * a real option rather than advice.
 */
export function publishBlockers(
  issue: IssueMeta | null,
  pages: PageSummary[],
  scope: 'full' | 'selected',
): { waiting: PageSummary[]; stale: PageSummary[] } {
  const waiting: PageSummary[] = [];
  const stale: PageSummary[] = [];
  for (const p of pages) {
    if (scope === 'selected' && !p.selectedForPublish) continue;
    if (!inReviewScope(issue, p.id)) continue;
    if (approvedAndFresh(p)) continue;
    if (p.approvalStale) stale.push(p);
    else waiting.push(p);
  }
  return { waiting, stale };
}

/** "page 4" · "pages 4 and 5" · "pages 4, 5 and 9" — the server's phrasing. */
export function pageNumbersLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return `page ${sorted[0]}`;
  return `pages ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/** One sentence for why Publish is unavailable at this scope, or '' when it is available. */
export function publishBlockedReason(issue: IssueMeta | null, pages: PageSummary[], scope: 'full' | 'selected'): string {
  const { waiting, stale } = publishBlockers(issue, pages, scope);
  const parts: string[] = [];
  if (waiting.length > 0) parts.push(`${pageNumbersLabel(waiting.map((p) => p.index + 1))} not approved yet`);
  if (stale.length > 0) parts.push(`${pageNumbersLabel(stale.map((p) => p.index + 1))} edited after approval`);
  return parts.length > 0 ? `Waiting on approval: ${parts.join('; ')}.` : '';
}

/**
 * Pages sitting in the owner's queue. Drives the "N awaiting you" chip.
 *
 * Scoped, so the chip and the Publish gate agree: a page whose collaborator has since
 * been un-shared no longer blocks publishing, so counting it as "awaiting you" would
 * nag about something that isn't holding anything up. The board is deliberately more
 * permissive — it still lets the owner clear such a page if they want to.
 */
export function awaitingOwner(issue: IssueMeta | null, pages: PageSummary[]): PageSummary[] {
  return pages.filter((p) => inReviewScope(issue, p.id) && (columnOf(p) === 'submitted' || p.approvalStale === true));
}

/** A collaborator's own pages that are theirs to submit right now. */
export function submittablePages(issue: IssueMeta | null, pages: PageSummary[]): PageSummary[] {
  const mine = issue?.myEditablePageIds ?? [];
  const isMine = (id: string) => mine === 'all' || (Array.isArray(mine) && mine.includes(id));
  return pages.filter((p) => isMine(p.id) && (p.review ?? 'in_progress') === 'in_progress');
}

/**
 * Why the current page is read-only for THIS user, or '' when it is editable.
 *
 * §8.5: "a read-only page that just silently ignores clicks is the worst possible
 * version of this feature." The server refuses the write either way — this is only
 * about saying so before the user spends effort on it.
 */
export function readOnlyReason(issue: IssueMeta | null, page: PageSummary | undefined): string {
  if (!issue || !page) return '';
  // NOTE: being published no longer makes a page read-only. That was the immutable-
  // edition model; a published magazine is now freely editable and simply reports
  // `needs_republish` until the owner republishes. Review state is the only lock left.
  if (issue.myRole === 'owner') return '';
  const review = page.review ?? 'in_progress';
  if (review === 'submitted') return 'Submitted for review — ask the owner to reopen it before editing.';
  if (review === 'approved') return 'Approved — ask the owner to reopen it before editing.';
  return '';
}
