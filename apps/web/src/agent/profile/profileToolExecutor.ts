// Browser-side execution of the Stable Studio assistant's client tools.
//
// Mirrors the Article Studio model: edits apply DIRECTLY (no staged "Apply" step)
// and each write snapshots the prior value onto the profile-agent undo stack, so
// the panel's Undo button (undoLastProposal) reverts them. Writes go through the
// horse/people/party stores → the RBAC-gated API, so the assistant can never edit
// something the member couldn't. getProfile returns the live context.

import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { usePeopleStore } from '@/stores/peopleStore';

import { STOCK } from '@/lib/stockImages';
import { useProfileAgentUi } from '@/stores/profileAgentUiStore';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';
import type { Person } from '@/types/party';

const CLIENT_TOOLS = new Set(['getProfile', 'setField', 'setConnection', 'suggestImageOptions', 'setPhoto', 'clearField']);

export function isProfileClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

const NUMERIC_FIELDS = new Set(['careerWinnings', 'currentRating', 'handsSize', 'metricSize', 'damYob', 'startedYear']);

/** Coerce a raw string into the field's stored type; '' / NaN → undefined (clears). */
function coerce(field: string, raw: string): string | number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (!NUMERIC_FIELDS.has(field)) return v;
  const n = Number(v.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

type ToolResult = { ok: boolean; [k: string]: unknown };

/** Set one field directly + record an undo entry. */
async function setField(entityKind: 'horse' | 'party', entityId: string, field: string, value: string | number | undefined): Promise<ToolResult> {
  const ui = useProfileAgentUi.getState();
  if (entityKind === 'horse') {
    const prev = (useHorseStore.getState().horses.find((h) => h.id === entityId) as Record<string, unknown> | undefined)?.[field];
    await useHorseStore.getState().updateHorse(entityId, { [field]: value } as Partial<Horse>);
    ui.pushUndo({ kind: 'field', entityKind: 'horse', entityId, field, prevValue: prev });
  } else {
    const prev = (usePeopleStore.getState().people.find((p) => p.id === entityId) as Record<string, unknown> | undefined)?.[field];
    await usePeopleStore.getState().updatePerson(entityId, { [field]: value } as Partial<Person>);
    ui.pushUndo({ kind: 'field', entityKind: 'party', entityId, field, prevValue: prev });
  }
  return { ok: true, applied: true, field };
}

/** On-brand stock-photo candidates for a keyword (mirror of the article helper). */
function suggestImages(query?: string): { name: string; url: string }[] {
  const entries = Object.entries(STOCK) as Array<[string, string]>;
  const q = (query ?? '').toLowerCase().trim();
  const ranked = q
    ? entries
        .map(([name, url]) => ({ name, url, score: q.split(/\s+/).filter(Boolean).reduce((s, t) => s + (name.toLowerCase().includes(t) ? 1 : 0), 0) }))
        .sort((a, b) => b.score - a.score)
    : entries.map(([name, url]) => ({ name, url, score: 0 }));
  const top = (ranked.some((r) => r.score > 0) ? ranked.filter((r) => r.score > 0) : ranked).slice(0, 6);
  return top.map(({ name, url }) => ({ name, url }));
}

export async function executeProfileTool(name: string, input: unknown): Promise<unknown> {
  const ui = useProfileAgentUi.getState();
  const ctx = ui.context;
  const arg = (input ?? {}) as Record<string, unknown>;

  if (name === 'getProfile') {
    if (!ctx) return { ok: false, error: 'No profile is open.' };
    return { entityKind: ctx.entityKind, name: ctx.name, fields: ctx.fields, emptyFields: ctx.emptyFields, roleBoxes: ctx.roleBoxes ?? [] };
  }

  if (!ctx) return { ok: false, error: 'No profile is open.' };

  if (name === 'setField') {
    const field = String(arg.field ?? '').trim();
    if (!field) return { ok: false, error: 'field is required' };
    return setField(ctx.entityKind, ctx.entityId, field, coerce(field, String(arg.value ?? '')));
  }

  if (name === 'clearField') {
    const field = String(arg.field ?? '').trim();
    if (!field) return { ok: false, error: 'field is required' };
    return setField(ctx.entityKind, ctx.entityId, field, undefined);
  }

  if (name === 'setPhoto') {
    if (ctx.entityKind !== 'horse') return { ok: false, error: 'Photos can only be set on a horse profile here.' };
    const src = String(arg.src ?? '').trim();
    if (!src) return { ok: false, error: 'src is required (use a URL from suggestImageOptions).' };
    const res = await setField('horse', ctx.entityId, 'imageUrl', src);
    ui.setImageOptions(null);
    return res;
  }

  if (name === 'suggestImageOptions') {
    const candidates = suggestImages(arg.query ? String(arg.query) : undefined);
    ui.setImageOptions(candidates);
    return { candidates };
  }

  if (name === 'setConnection') {
    if (ctx.entityKind !== 'horse') return { ok: false, error: 'Connections can only be added to a horse profile.' };
    const role = arg.role as PartyRole;
    const partyName = String(arg.partyName ?? '').trim();
    if (!partyName) return { ok: false, error: 'partyName is required' };

    // Find-or-create the PERSON, then join them to this horse with ONE edge.
    // Any start/end year the assistant passes is ignored: an edge carries no
    // dates, so honouring them would mean writing a field nothing stores.
    const existing = usePeopleStore.getState().people.find((p) => p.name.trim().toLowerCase() === partyName.toLowerCase());
    let personId = existing?.id;
    if (!personId) {
      personId = await usePeopleStore.getState().addPerson({ name: partyName, personnelSubtype: [] });
      if (!personId) return { ok: false, error: 'Could not add that person to the register.' };
    }
    const edgeId = await usePartyStore.getState().addParty({ personId, role, horseId: ctx.entityId });
    if (!edgeId) return { ok: false, error: 'Could not add that connection.' };
    ui.pushUndo({ kind: 'connection', linkId: edgeId });
    return { ok: true, applied: true, role, partyName };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}
