/**
 * useRoleConnections — the store-backed data + handlers for a horse's connection
 * boxes (entries per role, add/link, edit dates, remove). Extracted from
 * RoleConnectionsRail so both the rail and the onboarding focus overlay can drive
 * a RoleConnectionBox from one source of truth (the parties + horsePartyLinks
 * stores). Adding a connection links an EXISTING party by name or creates a NEW
 * provisional one — the universal mechanism, unchanged from the rail.
 */
import { toast } from 'sonner';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { usePartyStore } from '@/stores/partyStore';
import type { Party } from '@/types/party';
import type { RoleDef, Entry, AddPayload } from '@/components/profile/RoleConnectionBox';

export interface RoleConnections {
  parties: Party[];
  entriesFor: (def: RoleDef) => Entry[];
  onAdd: (def: RoleDef, payload: AddPayload) => Promise<void>;
  onSaveDates: (linkId: string, payload: Omit<AddPayload, 'name'>) => Promise<void>;
  onRemove: (linkId: string) => void;
}

export function useRoleConnections(horseId: string): RoleConnections {
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const updateLink = useHorsePartyLinkStore((s) => s.updateLink);
  const removeLink = useHorsePartyLinkStore((s) => s.removeLink);
  const parties = usePartyStore((s) => s.parties);
  const addParty = usePartyStore((s) => s.addParty);
  const updateParty = usePartyStore((s) => s.updateParty);

  const horseLinks = allLinks.filter((l) => l.horse_id === horseId);
  const partyById = (id: string) => parties.find((p) => p.id === id);

  const entriesFor = (def: RoleDef): Entry[] => {
    if (def.rel) {
      return horseLinks
        .filter((l) => l.relationship_type === def.rel)
        .map((l) => ({ link: l, party: partyById(l.party_id) }));
    }
    // Syndicate manager: linked parties whose roles include the role (derived).
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const l of horseLinks) {
      const p = partyById(l.party_id);
      if (p && p.roles.includes('syndicate manager') && !seen.has(p.id)) { seen.add(p.id); out.push({ link: l, party: p }); }
    }
    return out;
  };

  const datesToFields = ({ startYear, endYear, present }: Omit<AddPayload, 'name'>) => ({
    start_date: startYear ? `${startYear}-01-01` : new Date().toISOString().slice(0, 10),
    end_date: present ? null : (endYear ? `${endYear}-12-31` : null),
  });

  const onAdd = async (def: RoleDef, payload: AddPayload) => {
    if (!def.rel) return;
    const name = payload.name.trim();
    if (!name) { toast.error('Enter a name.'); return; }
    const existing = parties.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    let partyId = existing?.id;
    if (!partyId) {
      partyId = await addParty({ name, roles: [def.role], photo: payload.photo });
      if (!partyId) return;
    } else if (existing && payload.photo && !existing.photo) {
      // fill a missing portrait on the existing party (never overwrite one they have)
      await updateParty(existing.id, { photo: payload.photo });
    }
    const { start_date, end_date } = datesToFields(payload);
    await addLink({ horse_id: horseId, party_id: partyId, relationship_type: def.rel, start_date, end_date });
    toast.success(existing ? `${name} linked.` : `${name} added (pending verification) and linked.`);
  };

  const onSaveDates = async (linkId: string, payload: Omit<AddPayload, 'name'>) => {
    await updateLink(linkId, datesToFields(payload));
  };

  return { parties, entriesFor, onAdd, onSaveDates, onRemove: removeLink };
}
