// ---------------------------------------------------------------------------
// Magazine Builder v2 — per-magazine access model.
//
// Reuses stable-press's staff + owner/collaborator model (NOT multi-tenant):
//   - owner        — the creator: edits any page, manages collaborators,
//                    publishes, deletes.
//   - collaborator — edits only the page ids assigned to them (or 'all').
// A collaborator's `pageIds` reference magazinePagesV2 document ids.
//
// Editability gained a second dimension with the submissions flow: assignment
// (who) AND review state (when). See ./review.ts and
// docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md.
// ---------------------------------------------------------------------------

import { reviewOf } from './review.js';

export type MagRole = 'owner' | 'editor' | 'contributor';

export interface V2Collaborator {
  userId: string;
  email: string;
  displayName: string;
  role: 'editor' | 'contributor';
  pageIds: string[] | 'all';
}

type IssueDoc = { _id?: string; ownerId?: unknown; collaborators?: unknown; [k: string]: unknown };

export function collaboratorsOf(doc: IssueDoc): V2Collaborator[] {
  return Array.isArray(doc.collaborators) ? (doc.collaborators as V2Collaborator[]) : [];
}

export function roleOnMagazine(doc: IssueDoc, userId: string): MagRole | null {
  if (doc.ownerId === userId) return 'owner';
  const c = collaboratorsOf(doc).find((x) => x.userId === userId);
  return c ? c.role : null;
}

export const isOwner = (role: MagRole | null): boolean => role === 'owner';

/** Page ids the user may edit: 'all' for the owner, else their assignment. */
export function editablePageIds(doc: IssueDoc, userId: string): string[] | 'all' {
  if (doc.ownerId === userId) return 'all';
  const c = collaboratorsOf(doc).find((x) => x.userId === userId);
  return c ? c.pageIds : [];
}

/**
 * May the user SEE this page? Assignment only.
 *
 * Deliberately separate from canEditPage: a collaborator must still be able to
 * READ a page they have submitted (to check what they sent, or to read the
 * owner's feedback on it). Using the edit gate for reads would 404 their own
 * submitted work.
 */
export function canViewPage(doc: IssueDoc, userId: string, pageId: string): boolean {
  const ids = editablePageIds(doc, userId);
  return ids === 'all' || ids.includes(pageId);
}

/**
 * The collaborators whose assignment covers this page — i.e. who to notify about
 * it, and who has an interest in it beyond the owner.
 *
 * An `'all'`-scoped collaborator counts: they can edit and submit every page, so
 * a decision on any page concerns them.
 */
export function assigneesOfPage(doc: IssueDoc, pageId: string): V2Collaborator[] {
  return collaboratorsOf(doc).filter(
    (c) => c.pageIds === 'all' || (Array.isArray(c.pageIds) && c.pageIds.some((id) => String(id) === String(pageId))),
  );
}

/**
 * Is this page subject to REVIEW at all?
 *
 * THE SOLO-OWNER RULE, and it is load-bearing. Most magazines have no
 * collaborators. If review bound on every page, a solo owner would have to approve
 * their own eight pages before publishing — pure theatre, and exactly what makes
 * people abandon a workflow feature. So review binds only where somebody other
 * than the owner is involved: pages nobody else is assigned to publish freely.
 *
 * An `'all'`-scoped collaborator does put every page in scope. That is deliberate
 * (you shared the whole magazine for editing, so the whole magazine is reviewed),
 * and the cost is bounded because approve takes a batch — "approve all" is one call.
 */
export function isInReviewScope(doc: IssueDoc, pageId: string): boolean {
  return assigneesOfPage(doc, pageId).length > 0;
}

/**
 * Why an edit is refused, or null when it is allowed.
 *
 * `draft-closed` is GONE. A published magazine used to be read-only, unlocked only by
 * creating a revision that became v2 — that model was dropped: a published magazine is
 * freely editable, and the divergence from the live edition is reported as
 * `needs_republish` instead of prevented. Review state is the only thing that still
 * locks a page, and only for non-owners.
 */
export type EditBlock = 'not-assigned' | 'page-submitted' | 'page-approved';

/**
 * The SINGLE decision point for "may this user change this page right now".
 *
 * Every element write (add / patch / delete), the per-page AI agent and the
 * Fill/Adjust pass all reach this through `loadEditablePage`, so a rule added here
 * cannot be bypassed by adding a caller — including the AI, which is the point.
 *
 * Order matters: assignment is checked first so an unassigned user learns nothing
 * about the page's review state.
 *
 * The OWNER is never blocked here — they are the approver, and locking them out of
 * their own magazine would make the flow unusable. Publishing does not lock anything
 * either; it only means the next edit will need a republish.
 */
export function pageEditBlock(
  doc: IssueDoc,
  userId: string,
  pageId: string,
  page?: { [k: string]: unknown } | null,
): EditBlock | null {
  if (!canViewPage(doc, userId, pageId)) return 'not-assigned';
  if (doc.ownerId === userId) return null;
  const review = reviewOf(page);
  if (review === 'submitted') return 'page-submitted';
  if (review === 'approved') return 'page-approved';
  return null;
}

export function canEditPage(
  doc: IssueDoc,
  userId: string,
  pageId: string,
  page?: { [k: string]: unknown } | null,
): boolean {
  return pageEditBlock(doc, userId, pageId, page) === null;
}
