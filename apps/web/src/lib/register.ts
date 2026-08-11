/**
 * The register, reassembled: a PERSON together with the roles they fill.
 *
 * The server stores these apart on purpose — `people` holds who someone is,
 * `parties` holds one edge per role × horse — so a trainer on thirty horses has
 * one profile and thirty edges rather than thirty copies of their date of birth.
 *
 * Almost every screen wants them back together ("Sarah Chen — Trainer, Owner"),
 * so the join lives here once instead of in each of them. This is a derived
 * view: writes still go to peopleStore (the profile) or partyStore (the edges).
 */
import { useMemo } from 'react';
import type { Person, PartyRole } from '@/types/party';
import type { PartyRow } from '@/stores/authStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { usePartyStore } from '@/stores/partyStore';

export interface RegisterPerson extends Person {
  /** Distinct roles this person fills, from their edges. */
  roles: PartyRole[];
  /** The edges themselves — each one a role, and maybe a horse and an org. */
  edges: PartyRow[];
  horseIds: string[];
  orgIds: string[];
  /** The account that claimed them, if any and if the viewer may see it. */
  claimedByUserId?: string;
}

export function buildRegister(people: Person[], parties: PartyRow[]): RegisterPerson[] {
  const edgesByPerson = new Map<string, PartyRow[]>();
  for (const p of parties) {
    if (!p.personId) continue;
    const list = edgesByPerson.get(p.personId);
    if (list) list.push(p);
    else edgesByPerson.set(p.personId, [p]);
  }

  return people.map((person) => {
    const edges = edgesByPerson.get(person.id) ?? [];
    return {
      ...person,
      edges,
      roles: [...new Set(edges.map((e) => e.role))],
      horseIds: [...new Set(edges.filter((e) => e.horseId).map((e) => e.horseId!))],
      orgIds: [...new Set(edges.filter((e) => e.orgId).map((e) => e.orgId!))],
      claimedByUserId: edges.find((e) => e.userId)?.userId,
    };
  });
}

/** The joined register, recomputed only when either store actually changes. */
export function useRegister(): RegisterPerson[] {
  const people = usePeopleStore((s) => s.people);
  const parties = usePartyStore((s) => s.parties);
  return useMemo(() => buildRegister(people, parties), [people, parties]);
}

/** Load both halves. Safe to call from several components — each store dedupes. */
export function useLoadRegister(): void {
  const fetchPeople = usePeopleStore((s) => s.fetchPeople);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  useMemo(() => {
    void fetchPeople();
    void fetchParties();
  }, [fetchPeople, fetchParties]);
}

/** People filling a given role on a horse, from the edges. */
export function peopleOnHorse(
  register: RegisterPerson[],
  horseId: string,
  role?: PartyRole,
): RegisterPerson[] {
  return register.filter((p) =>
    p.edges.some((e) => e.horseId === horseId && (!role || e.role === role)),
  );
}
