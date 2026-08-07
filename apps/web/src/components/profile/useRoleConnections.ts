/**
 * useRoleConnections — the store-backed data + handlers for a horse's connection
 * boxes (entries per role, add, remove).
 *
 * A connection IS a party edge: `{ personId, role, horseId }`. Adding one either
 * points at an existing person or creates them in `people` first, then writes
 * the edge. There is no link table and no dates.
 *
 * A connection can still live in EITHER place: an edge, or the legacy direct
 * id-array on the horse (ownerIds, trainerIds…) that the staff Horse form
 * writes and the server still stores. Both are folded in so details entered in
 * either place show on the public page. Legacy ids have no edge row, so they
 * come back marked `legacy` and are read-only here.
 */
import { toast } from 'sonner';
import { usePartyStore } from '@/stores/partyStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { useHorseStore } from '@/stores/horseStore';
import { useRegister, type RegisterPerson } from '@/lib/register';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { RoleDef, Entry, AddPayload } from '@/components/profile/RoleConnectionBox';

export interface RoleConnections {
  /** The joined register, for the name datalist. */
  people: RegisterPerson[];
  entriesFor: (def: RoleDef) => Entry[];
  onAdd: (def: RoleDef, payload: AddPayload) => Promise<void>;
  onRemove: (edgeId: string) => void;
}

export function useRoleConnections(horseId: string): RoleConnections {
  const parties = usePartyStore((s) => s.parties);
  const addParty = usePartyStore((s) => s.addParty);
  const removeParty = usePartyStore((s) => s.removeParty);
  const addPerson = usePeopleStore((s) => s.addPerson);
  const updatePerson = usePeopleStore((s) => s.updatePerson);
  const horse = useHorseStore((s) => s.horses.find((h) => h.id === horseId));
  const people = useRegister();

  const personById = (id: string) => people.find((p) => p.id === id);
  const horseEdges = parties.filter((p) => p.horseId === horseId);

  const entriesFor = (def: RoleDef): Entry[] => {
    const seen = new Set<string>();
    const out: Entry[] = [];

    for (const edge of horseEdges) {
      if (edge.role !== def.role) continue;
      seen.add(edge.personId);
      out.push({ id: edge.id, party: personById(edge.personId), legacy: false });
    }

    // Fold in the legacy id-array field, skipping anyone already edged above.
    const legacyIds = (horse?.[ROLE_BINDINGS[def.role].horseField] as string[] | undefined) ?? [];
    for (const personId of legacyIds) {
      if (seen.has(personId)) continue;
      seen.add(personId);
      out.push({ id: `legacy:${def.role}:${personId}`, party: personById(personId), legacy: true });
    }

    return out;
  };

  const onAdd = async (def: RoleDef, payload: AddPayload) => {
    const name = payload.name.trim();
    if (!name) { toast.error('Enter a name.'); return; }

    const existing = people.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    let personId = existing?.id;
    if (!personId) {
      personId = await addPerson({ name, imageUrl: payload.photo, personnelSubtype: [] });
      if (!personId) return;
    } else if (payload.photo && !existing?.imageUrl) {
      // Fill a missing portrait, never overwrite one they already have.
      await updatePerson(existing!.id, { imageUrl: payload.photo });
    }

    // Already on this horse under this role? Adding again would create a second
    // identical edge, and the register would show them twice.
    const dupe = horseEdges.some((e) => e.personId === personId && e.role === def.role);
    if (dupe) { toast.error(`${name} is already recorded as a ${def.role} for this horse.`); return; }

    const edgeId = await addParty({ personId, role: def.role, horseId });
    if (edgeId) toast.success(existing ? `${name} linked.` : `${name} added to the register and linked.`);
  };

  const onRemove = (edgeId: string) => { void removeParty(edgeId); };

  return { people, entriesFor, onAdd, onRemove };
}
