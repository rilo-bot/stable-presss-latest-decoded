/**
 * RBAC — role taxonomy (the "what you are" axis).
 *
 * One identity can hold many roles. Reader is the floor; staff + verified party
 * roles live in `user.roles[]`. Org-membership roles are SCOPED to a single org
 * and therefore live in `user.orgMemberships`, never in `roles[]`.
 *
 * See RBAC.md §4 for the model. Mirrored server-side in apps/server/src/lib/identity.ts.
 */
import type { PartyRole } from '@/types/party';

export type { PartyRole };

export type ReaderRole = 'reader';

export type StaffRole =
  | 'contributor'
  | 'editor'
  | 'legal_reviewer'
  | 'podcast_producer'
  | 'publisher'
  | 'administrator';

/** Org-membership roles — meaningful only WITHIN one organisation. */
export type OrgRole = 'org_owner' | 'org_manager' | 'org_member';

/** Roles stored in user.roles[]. (Org roles are scoped → orgMemberships.) */
export type Role = ReaderRole | StaffRole | PartyRole;

export const STAFF_ROLES: StaffRole[] = [
  'contributor',
  'editor',
  'legal_reviewer',
  'podcast_producer',
  'publisher',
  'administrator',
];

const STAFF_RANK: Record<StaffRole, number> = {
  administrator: 6,
  publisher: 5,
  editor: 4,
  legal_reviewer: 3,
  podcast_producer: 2,
  contributor: 1,
};

export function isStaffRole(r: string | null | undefined): r is StaffRole {
  return !!r && (STAFF_ROLES as string[]).includes(r);
}

/**
 * Highest-privilege STAFF role the user holds, or undefined for non-staff.
 * Used to keep the legacy `currentUser.role` field (and the staff permission
 * matrix) working unchanged — readers/parties simply have `role: undefined`.
 */
export function primaryStaffRole(roles: Role[] | undefined): StaffRole | undefined {
  let best: StaffRole | undefined;
  for (const r of roles ?? []) {
    if (isStaffRole(r) && (!best || STAFF_RANK[r] > STAFF_RANK[best])) best = r;
  }
  return best;
}
