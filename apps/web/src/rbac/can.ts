/**
 * RBAC — the permission engine (client).
 *
 * Composes the three checks from RBAC.md:
 *   - staff/editorial  → the existing matrix in lib/permissions.ts
 *   - party/org racing → verified role + relationship SCOPE (scope.ts)
 *   - premium content  → entitlement only (entitlement.ts)
 *
 * These are the building blocks the dashboards, guards, and Production Systems call. The
 * server mirrors the enforcing subset in apps/server/src/lib/rbac.ts.
 */
import type { AuthUser } from '@/stores/authStore';
import { can as staffCan } from '@/lib/permissions';
import type { PermissionAction } from '@/lib/permissions';
import { horsesLinkedToParty, type ScopeData } from './scope';
import { canViewContent, type SubscriptionTier } from './entitlement';
import type { OrgRole } from './roles';

/**
 * True if the user can reach newsroom tooling.
 *
 * Was "holds any staff role", tested against a hardcoded slug list. Roles are
 * database rows now, so this is the `newsroom.access` permission — which means
 * it only ever answers for the SIGNED-IN user (permissions are resolved onto
 * the active session). The `user` argument is kept so the ~15 call sites read
 * naturally and still short-circuit when signed out.
 */
export function isStaff(user: AuthUser | null | undefined): boolean {
  return !!user && staffCan('newsroom.access');
}

/** Party record ids the user can act through (verified claims only). */
export function verifiedPartyIds(user: AuthUser | null | undefined): string[] {
  return (user?.partyClaims ?? [])
    .filter((c) => c.status === 'verified')
    .map((c) => c.partyId);
}

/** Party record ids whose claim is still awaiting verification (any pending). */
export function pendingPartyIds(user: AuthUser | null | undefined): string[] {
  return (user?.partyClaims ?? [])
    .filter((c) => c.status === 'pending')
    .map((c) => c.partyId);
}

/**
 * Party record ids the user may ACT THROUGH (write). A claim qualifies when it's
 * verified, OR pending but self-registered — provisional access to one's own
 * party. A pending claim on a pre-existing party stays view-only (not included).
 */
export function manageablePartyIds(user: AuthUser | null | undefined): string[] {
  return (user?.partyClaims ?? [])
    .filter((c) => c.status === 'verified' || (c.status === 'pending' && c.selfRegistered !== false))
    .map((c) => c.partyId);
}

/**
 * True if the user holds a provisional (pending self-registered) party — editable
 * now. `selfRegistered` unset counts as self-registered: every dashboard claim is
 * a self-registration, so only an explicit `false` (claiming a pre-existing party)
 * opts out.
 */
export function hasProvisionalParty(user: AuthUser | null | undefined): boolean {
  return (user?.partyClaims ?? []).some((c) => c.status === 'pending' && c.selfRegistered !== false);
}

/** True if the user has at least one role claim still in the verification stage. */
export function hasPendingClaim(user: AuthUser | null | undefined): boolean {
  return (user?.partyClaims ?? []).some((c) => c.status === 'pending');
}

/**
 * Staff/editorial permission. The `user` argument is vestigial — permissions
 * are resolved server-side onto the active session, so this always answers for
 * the signed-in user. It is kept only to short-circuit when signed out.
 */
export function canStaff(
  user: AuthUser | null | undefined,
  action: PermissionAction,
): boolean {
  return !!user && staffCan(action);
}

/** The org role the user holds within a given organisation, if any. */
export function orgRoleIn(
  user: AuthUser | null | undefined,
  orgId: string,
): OrgRole | undefined {
  return (user?.orgMemberships ?? []).find((m) => m.orgId === orgId)?.orgRole;
}

/**
 * Horse ids the user may SEE — horses linked to any party they hold, plus horses
 * of ANY organisation they belong to (whatever their role in it), plus horses they
 * created themselves.
 *
 * Mirrors `visibleHorseIds` in apps/server/src/lib/scope.ts.
 */
export function authorisedHorseIds(
  user: AuthUser | null | undefined,
  data: ScopeData,
): string[] {
  return horseIdsFor(user, data, (user?.orgMemberships ?? []).map((m) => m.orgId));
}

/**
 * Horse ids the user may WRITE. Same as the visible set EXCEPT that an org grants
 * reach only when the user OWNS or MANAGES it — a plain `org_member` may see the
 * org's horses but not edit them (RBAC.md §4.3).
 *
 * Mirrors `writableHorseIds` in apps/server/src/lib/scope.ts. Read and write scope
 * used to be one function on both sides, which over-granted on the server and made
 * this client offer edit affordances that the server now (correctly) refuses.
 */
export function writableHorseIds(
  user: AuthUser | null | undefined,
  data: ScopeData,
): string[] {
  return horseIdsFor(
    user,
    data,
    (user?.orgMemberships ?? [])
      .filter((m) => m.orgRole === 'org_owner' || m.orgRole === 'org_manager')
      .map((m) => m.orgId),
  );
}

function horseIdsFor(
  user: AuthUser | null | undefined,
  data: ScopeData,
  orgIds: string[],
): string[] {
  if (!user) return [];
  const partyIds = [...manageablePartyIds(user), ...orgIds];
  const ids = new Set<string>();
  partyIds.forEach((pid) =>
    horsesLinkedToParty(pid, data, { currentOnly: true }).forEach((h) => ids.add(h)),
  );
  // Horses the user created via self-registration — they manage these even before
  // a party link or claim verification exists (mirrors the server gate).
  data.horses.forEach((h) => {
    if (h.createdByUserId && h.createdByUserId === user.id) ids.add(h.id);
  });
  return Array.from(ids);
}

/**
 * Horse ids the user may PREVIEW read-only — the authorised set PLUS horses linked
 * to a party whose claim is still pending AND NOT self-registered (i.e. claiming a
 * pre-existing party). That preview scope is view-only: it never feeds
 * canManageHorse, so writes stay gated to `authorisedHorseIds`. Self-registered
 * pending parties already grant full provisional access, so they're not preview.
 */
export function previewHorseIds(
  user: AuthUser | null | undefined,
  data: ScopeData,
): string[] {
  if (!user) return [];
  const ids = new Set(authorisedHorseIds(user, data));
  const manageable = new Set(manageablePartyIds(user));
  pendingPartyIds(user)
    .filter((pid) => !manageable.has(pid))
    .forEach((pid) =>
      horsesLinkedToParty(pid, data, { currentOnly: true }).forEach((h) => ids.add(h)),
    );
  return Array.from(ids);
}

/** Can the user view an "authorised-only" record (private report, vet) for this horse? */
export function canViewAuthorisedRecord(
  user: AuthUser | null | undefined,
  horseId: string,
  data: ScopeData,
): boolean {
  if (isStaff(user)) return true;
  return authorisedHorseIds(user, data).includes(horseId);
}

/**
 * Can the user edit this horse's racing data? Staff (Production System), or a
 * current linked party, or an org they own/manage.
 *
 * Uses the WRITE set — `authorisedHorseIds` (visibility) would show an Edit button
 * to a plain org member whose PUT the server rejects.
 */
export function canManageHorse(
  user: AuthUser | null | undefined,
  horseId: string,
  data: ScopeData,
): boolean {
  if (isStaff(user)) return true;
  return writableHorseIds(user, data).includes(horseId);
}

/**
 * Can the user edit this party's profile? Staff, or the account that manages it —
 * a verified OR provisional (pending self-registered) claim. Their own party
 * identity is the hub of their self-service, editable from the moment they
 * register (provisional) through verification (public).
 */
export function canManageParty(
  user: AuthUser | null | undefined,
  partyId: string,
): boolean {
  if (isStaff(user)) return true;
  return manageablePartyIds(user).includes(partyId);
}

/** The user's primary party id (first manageable claim), if any — their profile hub. */
export function primaryPartyId(user: AuthUser | null | undefined): string | undefined {
  return manageablePartyIds(user)[0];
}

/** Premium content gating — entitlement axis only, independent of roles. */
export function canViewPremium(
  user: AuthUser | null | undefined,
  minTier: SubscriptionTier | undefined,
): boolean {
  return canViewContent(user?.subscriptionTier, minTier);
}
