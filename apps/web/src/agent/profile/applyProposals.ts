// Apply / discard / undo for Stable Studio proposals. Kept out of the store to
// avoid a store↔store import cycle (mirrors editor/agent/applyEdits.ts).
// Field proposals → updateHorse/updateParty; connection proposals → find-or-create
// the party (provisional) then addLink. Every apply records an undo entry.

import { toast } from 'sonner';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { Horse } from '@/types/horse';
import { useProfileAgentUi, type Proposal, type FieldProposal, type ConnProposal } from '@/stores/profileAgentUiStore';
import type { RegisterPerson } from '@/lib/register';

const NUMERIC_FIELDS = new Set(['careerWinnings', 'currentRating', 'handsSize', 'metricSize', 'damYob', 'started_year']);

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
    const prev = (usePartyStore.getState().parties.find((x) => x.id === p.entityId) as Record<string, unknown> | undefined)?.[p.field];
    await usePartyStore.getState().updateParty(p.entityId, { [p.field]: value } as Partial<RegisterPerson>);
    useProfileAgentUi.getState().pushUndo({ kind: 'field', entityKind: 'party', entityId: p.entityId, field: p.field, prevValue: prev });
  }
}

async function applyConnection(p: ConnProposal) {
  const rel = ROLE_BINDINGS[p.role]?.relType;
  if (!rel) { toast.error(`${p.role} can't be linked directly.`); return; }
  const name = p.partyName.trim();
  const existing = usePartyStore.getState().parties.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
  let partyId = existing?.id;
  if (!partyId) {
    partyId = await usePartyStore.getState().addParty({ name, roles: [p.role] });
    if (!partyId) return;
  }
  const start = p.startYear ? `${p.startYear}-01-01` : new Date().toISOString().slice(0, 10);
  const end = p.present ? null : (p.endYear ? `${p.endYear}-12-31` : null);
  const linkId = await useHorsePartyLinkStore.getState().addLink({ horse_id: p.entityId, party_id: partyId, relationship_type: rel, start_date: start, end_date: end });
  if (linkId) useProfileAgentUi.getState().pushUndo({ kind: 'connection', linkId });
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
    else await usePartyStore.getState().updateParty(e.entityId, { [e.field]: e.prevValue } as Partial<RegisterPerson>);
  } else {
    await useHorsePartyLinkStore.getState().removeLink(e.linkId);
  }
  toast.success('Reverted.');
}
