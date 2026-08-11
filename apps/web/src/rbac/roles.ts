/**
 * RBAC — the role taxonomy.
 *
 * There are two categories of account: users, and admins. An admin role is a
 * ROW in the server's `adminRoles` collection, so it is not typeable here —
 * what it grants arrives on the session as `user.access`, and whether the
 * account is an admin at all arrives as `user.isAdmin`.
 *
 * What remains here are the two axes that are deliberately STATIC, because they
 * are bound to real domain machinery rather than to job descriptions:
 *
 *   PartyRole — a row in the racing register, one per person × role × horse
 *   OrgRole   — membership within a single organisation
 *
 * Mirrored server-side in apps/server/src/lib/identity.ts.
 */
import type { PartyRole } from '@/types/party';

export type { PartyRole };

/** Org-membership roles — meaningful only WITHIN one organisation. */
export type OrgRole = 'owner' | 'manager' | 'member';

/** What `user.roles[]` carries: the static racing axis only. */
export type Role = PartyRole;
