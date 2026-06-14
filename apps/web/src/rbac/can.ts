/**
 * RBAC — the permission engine (client).
 *
 * Composes the three checks from RBAC.md:
 *   - staff/editorial  → the existing matrix in lib/permissions.ts
 *   - party/org racing → verified role + relationship SCOPE (scope.ts)
 *   - premium content  → entitlement only (entitlement.ts)
 *
 * These are the building blocks the dashboards, guards, and CRMs call. The
 * server mirrors the enforcing subset in apps/server/src/lib/rbac.ts.
 */
import type { AuthUser } from '@/stores/authStore';
import { can as staffCan } from '@/lib/permissions';
import type { PermissionAction } from '@/lib/permissions';
import { horsesLinkedToParty, type ScopeData } from './scope';
import { canViewContent, type SubscriptionTier } from './entitlement';
import { isStaffRole, type OrgRole } from './roles';

/** True if the user holds any staff/editorial role. */
export function isStaff(user: AuthUser | null | undefined): boolean {
  return !!user && user.roles.some(isStaffRole);
}

/** Party record ids the user can act through (verified claims only). */
export function verifiedPartyIds(user: AuthUser | null | undefined): string[] {
  return (user?.partyClaims ?? [])
    .filter((c) => c.status === 'verified')
    .map((c) => c.partyId);
}

/** Staff/editorial permission — delegates to the matrix via the derived staff role. */
export function canStaff(
  user: AuthUser | null | undefined,
  action: PermissionAction,
): boolean {
  return staffCan(user?.role, action);
}

/** The org role the user holds within a given organisation, if any. */
export function orgRoleIn(
  user: AuthUser | null | undefined,
  orgId: string,
): OrgRole | undefined {
  return (user?.orgMemberships ?? []).find((m) => m.orgId === orgId)?.orgRole;
}

/**
 * Horse ids the user has CURRENT authorised access to — the union of horses
 * linked to any verified party they hold and any organisation they belong to.
 */
export function authorisedHorseIds(
  user: AuthUser | null | undefined,
  data: ScopeData,
): string[] {
  if (!user) return [];
  const partyIds = [
    ...verifiedPartyIds(user),
    ...(user.orgMemberships ?? []).map((m) => m.orgId),
  ];
  const ids = new Set<string>();
  partyIds.forEach((pid) =>
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

/** Can the user edit this horse's racing data? Staff (CRM) or a current linked party/org. */
export function canManageHorse(
  user: AuthUser | null | undefined,
  horseId: string,
  data: ScopeData,
): boolean {
  if (isStaff(user)) return true;
  return authorisedHorseIds(user, data).includes(horseId);
}

/** Premium content gating — entitlement axis only, independent of roles. */
export function canViewPremium(
  user: AuthUser | null | undefined,
  minTier: SubscriptionTier | undefined,
): boolean {
  return canViewContent(user?.subscriptionTier, minTier);
}
