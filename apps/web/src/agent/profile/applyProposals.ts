// Apply / discard / undo for Stable Studio proposals. Kept out of the store to
// avoid a store↔store import cycle (mirrors editor/agent/applyEdits.ts).
// Field proposals → updateHorse/updatePerson; connection proposals → find-or-create
// the person then add ONE party edge. Every apply records an undo entry.

import { toast } from 'sonner';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { usePeopleStore } from '@/stores/peopleStore';

import type { Horse } from '@/types/horse';
import { useProfileAgentUi, type Proposal, type FieldProposal, type ConnProposal } from '@/stores/profileAgentUiStore';
import type { Person } from '@/types/party';

const NUMERIC_FIELDS = new Set(['careerWinnings', 'currentRating', 'handsSize', 'metricSize', 'damYob', 'startedYear']);

function coerce(field: string, raw: string): string | number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (!NUMERIC_FIELDS.has(field)) return v;
  // Tolerate currency/thousands formatting ("£1,200,000", "1 200 000"); never
  // write NaN — drop the value instead so a stray "unknown"/"N/A" is a no-op.
  const n = Number(v.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

async function applyField(p: FieldProposal) {
  const value = coerce(p.field, p.value);
  if (p.entityKind === 'horse') {
    const prev = (useHorseStore.getState().horses.find((h) => h.id === p.entityId) as Record<string, unknown> | undefined)?.[p.field];
    await useHorseStore.getState().updateHorse(p.entityId, { [p.field]: value } as Partial<Horse>);
    useProfileAgentUi.getState().pushUndo({ kind: 'field', entityKind: 'horse', entityId: p.entityId, field: p.field, prevValue: prev });
  } else {
    const prev = (usePeopleStore.getState().people.find((x) => x.id === p.entityId) as Record<string, unknown> | undefined)?.[p.field];
    await usePeopleStore.getState().updatePerson(p.entityId, { [p.field]: value } as Partial<Person>);
    useProfileAgentUi.getState().pushUndo({ kind: 'field', entityKind: 'party', entityId: p.entityId, field: p.field, prevValue: prev });
  }
}

/**
 * A connection IS a party edge. The person is created first when the name is
 * new, then ONE edge joins them to this horse under that role.
 *
 * The proposal's start/end years are ignored: an edge carries no dates, so
 * writing them would be inventing a field the server does not store.
 */
async function applyConnection(p: ConnProposal) {
  const name = p.partyName.trim();
  const existing = usePeopleStore.getState().people.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
  let personId = existing?.id;
  if (!personId) {
    personId = await usePeopleStore.getState().addPerson({ name, personnelSubtype: [] });
    if (!personId) return;
  }
  const edgeId = await usePartyStore.getState().addParty({ personId, role: p.role, horseId: p.entityId });
  if (edgeId) useProfileAgentUi.getState().pushUndo({ kind: 'connection', linkId: edgeId });
}

export async function applyProposal(p: Proposal) {
  if (p.kind === 'field') await applyField(p);
  else await applyConnection(p);
  useProfileAgentUi.getState().removeProposal(p.id);
  toast.success('Applied to the profile.');
}

export function discardProposal(id: string) {
  useProfileAgentUi.getState().removeProposal(id);
}

export async function applyAllProposals() {
  for (const p of [...useProfileAgentUi.getState().staged]) await applyProposal(p);
}

export function discardAllProposals() {
  useProfileAgentUi.getState().clearStaged();
}

export async function undoLastProposal() {
  const e = useProfileAgentUi.getState().popUndo();
  if (!e) return;
  if (e.kind === 'field') {
    if (e.entityKind === 'horse') await useHorseStore.getState().updateHorse(e.entityId, { [e.field]: e.prevValue } as Partial<Horse>);
    else await usePeopleStore.getState().updatePerson(e.entityId, { [e.field]: e.prevValue } as Partial<Person>);
  } else {
    await usePartyStore.getState().removeParty(e.linkId);
  }
  toast.success('Reverted.');
}
