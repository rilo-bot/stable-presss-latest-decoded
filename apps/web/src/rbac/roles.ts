/**
 * RBAC — role taxonomy (the "what you are" axis).
 *
 * THE STAFF/EDITORIAL ROLE UNION IS GONE. Those six slugs
 * (contributor/editor/legal_reviewer/podcast_producer/publisher/administrator)
 * used to be a TypeScript union here, which made a database-defined role
 * literally untypeable. They are now rows in the server's `roles` collection,
 * referenced by slug, and what they grant arrives on the session as
 * `user.access` — see stores/authStore.ts and lib/permissions.ts.
 *
 * What remains here are the two axes that are deliberately STATIC, because they
 * are bound to real domain machinery rather than to job descriptions:
 *
 *   PartyRole — racing identities, bound to horsePartyLinks + claim verification
 *   OrgRole   — membership within a single organisation
 *
 * See RBAC.md §4 and docs/DYNAMIC-RBAC-PLAN.md. Mirrored server-side in
 * apps/server/src/lib/identity.ts.
 */
import type { PartyRole } from '@/types/party';

export type { PartyRole };

export type ReaderRole = 'reader';

/** Org-membership roles — meaningful only WITHIN one organisation. */
export type OrgRole = 'org_owner' | 'org_manager' | 'org_member';

/**
 * Roles stored in user.roles[] — the STATIC axis only.
 * Dynamic staff roles live in `user.staffRoles[]` as slugs.
 */
export type Role = ReaderRole | PartyRole;
