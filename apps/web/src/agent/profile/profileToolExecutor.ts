// Browser-side execution of the Stable Studio assistant's client tools.
//
// Mirrors the Article Studio model: edits apply DIRECTLY (no staged "Apply" step)
// and each write snapshots the prior value onto the profile-agent undo stack, so
// the panel's Undo button (undoLastProposal) reverts them. Writes go through the
// horse/party/link stores → the RBAC-gated API, so the assistant can never edit
// something the member couldn't. getProfile returns the live context.

import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import { STOCK } from '@/editor/templates/helpers';
import { useProfileAgentUi } from '@/stores/profileAgentUiStore';
import type { Horse } from '@/types/horse';
import type { Party } from '@/types/party';
import type { PartyRole } from '@/types/party';

const CLIENT_TOOLS = new Set(['getProfile', 'setField', 'setConnection', 'suggestImageOptions', 'setPhoto', 'clearField']);

export function isProfileClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

const NUMERIC_FIELDS = new Set(['careerWinnings', 'currentRating', 'handsSize', 'metricSize', 'damYob', 'started_year']);

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
    const prev = (usePartyStore.getState().parties.find((p) => p.id === entityId) as Record<string, unknown> | undefined)?.[field];
    await usePartyStore.getState().updateParty(entityId, { [field]: value } as Partial<Party>);
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
    const rel = ROLE_BINDINGS[role]?.relType;
    if (!rel) return { ok: false, error: `${role} can't be linked directly.` };
    const partyName = String(arg.partyName ?? '').trim();
    if (!partyName) return { ok: false, error: 'partyName is required' };

    const existing = usePartyStore.getState().parties.find((p) => p.name.trim().toLowerCase() === partyName.toLowerCase());
    let partyId = existing?.id;
    if (!partyId) {
      partyId = await usePartyStore.getState().addParty({ name: partyName, roles: [role] });
      if (!partyId) return { ok: false, error: 'Could not create that party.' };
    }
    const startYear = typeof arg.startYear === 'string' ? arg.startYear : undefined;
    const endYear = typeof arg.endYear === 'string' ? arg.endYear : undefined;
    const present = arg.present === undefined ? !endYear : !!arg.present;
    const start = startYear ? `${startYear}-01-01` : new Date().toISOString().slice(0, 10);
    const end = present ? null : (endYear ? `${endYear}-12-31` : null);
    const linkId = await useHorsePartyLinkStore.getState().addLink({ horse_id: ctx.entityId, party_id: partyId, relationship_type: rel, start_date: start, end_date: end });
    if (!linkId) return { ok: false, error: 'Could not add that connection.' };
    ui.pushUndo({ kind: 'connection', linkId });
    return { ok: true, applied: true, role, partyName };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}
