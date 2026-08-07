/**
 * RBAC — relationship scope.
 *
 * A party edge carries `horseId` directly, so reach over horses is a filter,
 * not a join through a link table.
 *
 * Connections used to be recorded in TWO places — the edge, and `ownerIds` /
 * `trainerIds` / … on the horse itself — and every function here folded both in
 * so neither was silently dropped. The arrays are gone: the edge is the only
 * representation, so `data.horses` is no longer consulted for connections at all.
 *
 * Pure functions (no React) so the profile UI and the permission engine share
 * one source of truth. Mirrors apps/server/src/lib/scope.ts.
 */
import type { PartyRow } from '@/stores/authStore';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';

export interface ScopeData {
  /** Every party edge the client has loaded — see stores/partyStore.ts. */
  parties: PartyRow[];
  /**
   * Loaded horses. Connections no longer come from here, but the shape is kept
   * so callers keep passing the store they already have and the horse-side
   * helpers below stay available.
   */
  horses: Horse[];
}

/** Horse ids a person is connected to in a SPECIFIC role. */
export function horsesForPersonInRole(
  personId: string,
  role: PartyRole,
  data: ScopeData,
): string[] {
  return [
    ...new Set(
      data.parties
        .filter((p) => p.personId === personId && p.role === role && p.horseId)
        .map((p) => p.horseId!),
    ),
  ];
}

/** Horse ids a person is connected to in ANY role. */
export function horsesForPerson(personId: string, data: ScopeData): string[] {
  return [
    ...new Set(
      data.parties.filter((p) => p.personId === personId && p.horseId).map((p) => p.horseId!),
    ),
  ];
}

/** The party edges attached to one horse — what its connections panel shows. */
export function partiesForHorse(horseId: string, data: ScopeData): PartyRow[] {
  return data.parties.filter((p) => p.horseId === horseId);
}

/** Person ids filling a given role on a horse. */
export function peopleForHorseInRole(
  horseId: string,
  role: PartyRole,
  data: ScopeData,
): string[] {
  return [
    ...new Set(
      data.parties
        .filter((p) => p.horseId === horseId && p.role === role && p.personId)
        .map((p) => p.personId),
    ),
  ];
}

/** Horse ids reachable through a set of organisations. */
export function horsesForOrgs(orgIds: string[], data: ScopeData): string[] {
  const wanted = new Set(orgIds);
  return [
    ...new Set(
      data.parties
        .filter((p) => p.orgId && wanted.has(p.orgId) && p.horseId)
        .map((p) => p.horseId!),
    ),
  ];
}
