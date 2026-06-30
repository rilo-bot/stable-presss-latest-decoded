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
import { useHorseStore } from '@/stores/horseStore';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { Party } from '@/types/party';
import type { HorsePartyLink } from '@/types/horsePartyLink';
import { LEGACY_LINK_ID_PREFIX } from '@/types/horsePartyLink';
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
  const horse = useHorseStore((s) => s.horses.find((h) => h.id === horseId));

  const horseLinks = allLinks.filter((l) => l.horse_id === horseId);
  const partyById = (id: string) => parties.find((p) => p.id === id);

  // A horse connection can live in EITHER store: a dated horsePartyLinks row
  // (created via the inline rail / member onboarding) OR the legacy direct
  // id-array field the staff Horse management form writes (ownerIds, etc.).
  // We fold both so details entered in either place show on the public page.
  // Legacy ids have no store row, so we synthesize a read-only link for them.
  const syntheticLink = (def: RoleDef, partyId: string): HorsePartyLink => ({
    id: `${LEGACY_LINK_ID_PREFIX}${def.role}:${partyId}`,
    createdAt: new Date(0),
    horse_id: horseId,
    party_id: partyId,
    // Never read for synthetic links; kept type-valid for the role's relation.
    relationship_type: ROLE_BINDINGS[def.role].relType ?? 'personnel',
    start_date: '',
    end_date: null,
  });

  const entriesFor = (def: RoleDef): Entry[] => {
    const seen = new Set<string>();
    const out: Entry[] = [];

    if (def.rel) {
      for (const l of horseLinks) {
        if (l.relationship_type !== def.rel) continue;
        seen.add(l.party_id);
        out.push({ link: l, party: partyById(l.party_id) });
      }
    } else {
      // Syndicate manager: linked parties whose roles include the role (derived).
      for (const l of horseLinks) {
        const p = partyById(l.party_id);
        if (p && p.roles.includes('syndicate manager') && !seen.has(p.id)) { seen.add(p.id); out.push({ link: l, party: p }); }
      }
    }

    // Fold in the legacy id-array field (skip parties already linked above).
    const legacyIds = (horse?.[ROLE_BINDINGS[def.role].horseField] as string[] | undefined) ?? [];
    for (const partyId of legacyIds) {
      if (seen.has(partyId)) continue;
      seen.add(partyId);
      out.push({ link: syntheticLink(def, partyId), party: partyById(partyId) });
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
