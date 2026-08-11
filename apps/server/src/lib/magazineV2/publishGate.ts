// ---------------------------------------------------------------------------
// Magazine Builder v2 — the publish approval gate.
//
// This is the last thing standing between unreviewed work and the public
// newsstand, so it lives in its own pure module rather than inside the route: the
// route file can't be imported by a test (it builds a Router and pulls in the DB),
// and a rule this consequential should not be the one part of the flow that nothing
// exercises.
//
// See docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md §4 and §7.
// ---------------------------------------------------------------------------

import { isApprovedAndFresh, isApprovalStale } from './review.js';
import { isInReviewScope } from './access.js';
import { pageNumbersLabel } from '../pageLabels.js';

type PageDoc = { _id?: unknown; [k: string]: unknown };
type IssueDoc = { _id?: string; ownerId?: unknown; collaborators?: unknown; [k: string]: unknown };

export interface PublishBlock {
  error: string;
  reason: 'needs-approval';
  /** 1-based page numbers, ascending — so the UI can highlight them. */
  pageNumbers: number[];
}

/**
 * Every page going out must be approved-and-fresh, UNLESS it is out of review scope
 * (nobody but the owner is involved — see isInReviewScope for the solo-owner rule).
 *
 * The two failure modes get their own sentence, because the fix differs: work still
 * waiting on the owner, versus an approval invalidated by a later edit. "Some pages
 * aren't approved" would leave the owner hunting for which, and why.
 *
 * `included` is the pages actually being published (a 'selected' scope publishes a
 * subset), and `numberOf` resolves a page id to its number in the FULL issue — a
 * selected-scope snapshot renumbers from 0, and telling the owner to fix "page 1"
 * when they are looking at page 4 is worse than saying nothing.
 */
export function publishApprovalBlock(
  issue: IssueDoc,
  included: PageDoc[],
  numberOf: (pageId: string) => number,
): PublishBlock | null {
  const waiting: number[] = [];
  const stale: number[] = [];
  for (const p of included) {
    const id = String(p._id ?? '');
    if (!isInReviewScope(issue, id)) continue;
    if (isApprovedAndFresh(p)) continue;
    (isApprovalStale(p) ? stale : waiting).push(numberOf(id));
  }
  if (waiting.length === 0 && stale.length === 0) return null;

  const parts: string[] = [];
  if (waiting.length > 0) {
    parts.push(`${pageNumbersLabel(waiting)} ${waiting.length === 1 ? 'is' : 'are'} not approved yet`);
  }
  if (stale.length > 0) {
    parts.push(
      `${pageNumbersLabel(stale)} ${stale.length === 1 ? 'was' : 'were'} approved and then edited, so ` +
        `${stale.length === 1 ? 'it needs' : 'they need'} approving again`,
    );
  }
  return {
    error: `${parts.join(', and ')}. Approve them, or leave them out of this edition, before publishing.`,
    reason: 'needs-approval',
    pageNumbers: [...waiting, ...stale].sort((a, b) => a - b),
  };
}
