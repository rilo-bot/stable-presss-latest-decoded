/**
 * RBAC — relationship scope.
 *
 * A party edge carries `horseId` directly, so reach over horses is a filter,
 * not a join through a link table.
 *
 * Connections are still recorded in TWO places: the party edge, and the legacy
 * `ownerIds`/`trainerIds`/… arrays on the horse itself, which the server still
 * accepts and stores. Both are folded in here so neither is silently dropped.
 * The arrays hold PERSON ids.
 *
 * Pure functions (no React) so the profile UI and the permission engine share
 * one source of truth. Mirrors apps/server/src/lib/scope.ts.
 */
import type { PartyRow } from '@/stores/authStore';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';

export interface ScopeData {
  /** Every party edge the client has loaded — see stores/partyStore.ts. */
  parties: PartyRow[];
  horses: Horse[];
}

function legacyIds(horse: Horse, role: PartyRole): string[] {
  const arr = horse[ROLE_BINDINGS[role].horseField] as string[] | undefined;
  return Array.isArray(arr) ? arr : [];
}

/** Horse ids a person is connected to in a SPECIFIC role. */
export function horsesForPersonInRole(
  personId: string,
  role: PartyRole,
  data: ScopeData,
): string[] {
  const ids = new Set(
    data.parties
      .filter((p) => p.personId === personId && p.role === role && p.horseId)
      .map((p) => p.horseId!),
  );
  data.horses.forEach((h) => {
    if (legacyIds(h, role).includes(personId)) ids.add(h.id);
  });
  return [...ids];
}

/** Horse ids a person is connected to in ANY role. */
export function horsesForPerson(personId: string, data: ScopeData): string[] {
  const ids = new Set(
    data.parties.filter((p) => p.personId === personId && p.horseId).map((p) => p.horseId!),
  );
  data.horses.forEach((h) => {
    for (const role of Object.keys(ROLE_BINDINGS) as PartyRole[]) {
      if (legacyIds(h, role).includes(personId)) {
        ids.add(h.id);
        break;
      }
    }
  });
  return [...ids];
}

/** The party edges attached to one horse — what its connections panel shows. */
export function partiesForHorse(horseId: string, data: ScopeData): PartyRow[] {
  return data.parties.filter((p) => p.horseId === horseId);
}

/** Person ids filling a given role on a horse, from BOTH representations. */
export function peopleForHorseInRole(
  horseId: string,
  role: PartyRole,
  data: ScopeData,
): string[] {
  const ids = new Set(
    data.parties
      .filter((p) => p.horseId === horseId && p.role === role && p.personId)
      .map((p) => p.personId),
  );
  const horse = data.horses.find((h) => h.id === horseId);
  if (horse) legacyIds(horse, role).forEach((id) => ids.add(id));
  return [...ids];
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
