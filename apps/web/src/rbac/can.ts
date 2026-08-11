/**
 * RBAC — the permission engine (client).
 *
 * Two axes, and only two:
 *   - ADMIN      → `user.isAdmin` plus the server-resolved action set
 *   - RACING     → the party edges the account has claimed, and their scope
 *
 * These are the building blocks the dashboards, guards, and Production Systems
 * call. The server enforces the same rules independently on every route — this
 * is a UI-affordance gate, never a security boundary.
 */
import type { AuthUser } from '@/stores/authStore';
import { can as adminCan } from '@/lib/permissions';
import type { PermissionAction } from '@/lib/permissions';
import { horsesForOrgs, type ScopeData } from './scope';
import type { OrgRole } from './roles';

/**
 * Holds an admin role — the ONE test for reaching Campaign Engine tooling.
 *
 * Server-derived from `users.roleId`, so it cannot disagree with the role the
 * account actually holds. This used to ask for a `newsroom.access` permission,
 * which the server removed from the catalogue: being on the team IS access, and
 * the role decides only what is inside.
 */
export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.isAdmin === true;
}

/** Party edge ids the account has claimed. A claim IS the identity. */
export function myPartyIds(user: AuthUser | null | undefined): string[] {
  return (user?.parties ?? []).map((p) => p.id);
}

/** The people the account is — usually one, occasionally more for an agency. */
export function myPersonIds(user: AuthUser | null | undefined): string[] {
  return [...new Set((user?.parties ?? []).map((p) => p.personId).filter(Boolean))];
}

/**
 * An admin permission. The `user` argument is vestigial — permissions are
 * resolved server-side onto the active session, so this always answers for the
 * signed-in user. Kept only to short-circuit when signed out.
 */
export function canAdmin(
  user: AuthUser | null | undefined,
  action: PermissionAction,
): boolean {
  return !!user && adminCan(action);
}

/** The org role the user holds within a given organisation, if any. */
export function orgRoleIn(
  user: AuthUser | null | undefined,
  orgId: string,
): OrgRole | undefined {
  return (user?.orgMembers ?? []).find((m) => m.orgId === orgId)?.role;
}

/** Horse ids reached through the account's own claimed edges. */
function ownHorseIds(user: AuthUser | null | undefined): string[] {
  return (user?.parties ?? []).filter((p) => p.horseId).map((p) => p.horseId!);
}

/**
 * Horse ids the user may SEE — horses on any edge they hold, plus horses of any
 * organisation they belong to whatever their role in it, plus horses they
 * created themselves.
 *
 * Mirrors `visibleHorseIds` in apps/server/src/lib/scope.ts.
 */
export function authorisedHorseIds(
  user: AuthUser | null | undefined,
  data: ScopeData,
): string[] {
  if (!user) return [];
  const orgIds = (user.orgMembers ?? []).map((m) => m.orgId);
  return [...new Set([...ownHorseIds(user), ...horsesForOrgs(orgIds, data)])];
}

/**
 * Horse ids the user may WRITE. Same as the visible set EXCEPT that an org
 * grants reach only when the user OWNS or MANAGES it — a plain member may see
 * the org's horses but not edit them.
 *
 * Mirrors `writableHorseIds` in apps/server/src/lib/scope.ts. Read and write
 * scope used to be one function, which made this client offer edit affordances
 * the server then refused.
 */
export function writableHorseIds(
  user: AuthUser | null | undefined,
  data: ScopeData,
): string[] {
  if (!user) return [];
  const orgIds = (user.orgMembers ?? [])
    .filter((m) => m.role === 'owner' || m.role === 'manager')
    .map((m) => m.orgId);
  return [...new Set([...ownHorseIds(user), ...horsesForOrgs(orgIds, data)])];
}

/** Can the user view an "authorised-only" record (private report, vet) for this horse? */
export function canViewAuthorisedRecord(
  user: AuthUser | null | undefined,
  horseId: string,
  data: ScopeData,
): boolean {
  if (isAdmin(user)) return true;
  return authorisedHorseIds(user, data).includes(horseId);
}

/**
 * Can the user edit this horse's racing data? An admin, a current linked edge,
 * or an org they own/manage.
 */
export function canManageHorse(
  user: AuthUser | null | undefined,
  horseId: string,
  data: ScopeData,
): boolean {
  if (isAdmin(user)) return true;
  return writableHorseIds(user, data).includes(horseId);
}

/** Can the user edit this party edge? An admin, or whoever claimed it. */
export function canManageParty(
  user: AuthUser | null | undefined,
  partyId: string,
): boolean {
  if (isAdmin(user)) return true;
  return myPartyIds(user).includes(partyId);
}

/** Can the user edit this person's profile? An admin, or the person themselves. */
export function canManagePerson(
  user: AuthUser | null | undefined,
  personId: string,
): boolean {
  if (isAdmin(user)) return true;
  return myPersonIds(user).includes(personId);
}

/** The user's primary party edge, if any — their profile hub. */
export function primaryPartyId(user: AuthUser | null | undefined): string | undefined {
  return myPartyIds(user)[0];
}

/** The user's own person id — whose profile "Edit my profile" opens. */
export function primaryPersonId(user: AuthUser | null | undefined): string | undefined {
  return myPersonIds(user)[0];
}
