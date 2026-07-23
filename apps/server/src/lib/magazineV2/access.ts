// ---------------------------------------------------------------------------
// Magazine Builder v2 — per-magazine access model.
//
// Reuses stable-press's staff + owner/collaborator model (NOT multi-tenant):
//   - owner        — the creator: edits any page, manages collaborators,
//                    publishes, deletes.
//   - collaborator — edits only the page ids assigned to them (or 'all').
// A collaborator's `pageIds` reference magazinePagesV2 document ids.
// ---------------------------------------------------------------------------

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

export function canEditPage(doc: IssueDoc, userId: string, pageId: string): boolean {
  const ids = editablePageIds(doc, userId);
  return ids === 'all' || ids.includes(pageId);
}
