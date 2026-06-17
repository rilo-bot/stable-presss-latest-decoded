// Browser-side execution of the Stable Studio assistant's client tools.
// getProfile returns the live context; proposeField / proposeConnection stage a
// review card in the store (the member taps Apply to commit). Mirrors the
// magazine editor's editOpsExecutor.

import { useProfileAgentUi, type Proposal } from '@/stores/profileAgentUiStore';
import type { PartyRole } from '@/types/party';

const CLIENT_TOOLS = new Set(['getProfile', 'proposeField', 'proposeConnection']);

export function isProfileClientTool(name: string): boolean {
  return CLIENT_TOOLS.has(name);
}

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `p-${Date.now()}-${Math.round(Math.random() * 1e6)}`; }
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

  if (name === 'proposeField') {
    const field = String(arg.field ?? '').trim();
    const value = String(arg.value ?? '');
    if (!field) return { ok: false, error: 'field is required' };
    const proposal: Proposal = {
      id: newId(), kind: 'field', entityKind: ctx.entityKind, entityId: ctx.entityId, field, value,
      note: typeof arg.note === 'string' ? arg.note : undefined,
    };
    ui.addProposal(proposal);
    return { ok: true, staged: true, message: `Drafted "${field}". It's waiting for the member to Apply — it is not saved yet.` };
  }

  if (name === 'proposeConnection') {
    if (ctx.entityKind !== 'horse') return { ok: false, error: 'Connections can only be proposed on a horse profile.' };
    const partyName = String(arg.partyName ?? '').trim();
    if (!partyName) return { ok: false, error: 'partyName is required' };
    const proposal: Proposal = {
      id: newId(), kind: 'connection', entityId: ctx.entityId, role: arg.role as PartyRole, partyName,
      startYear: typeof arg.startYear === 'string' ? arg.startYear : undefined,
      endYear: typeof arg.endYear === 'string' ? arg.endYear : undefined,
      present: arg.present === undefined ? !arg.endYear : !!arg.present,
    };
    ui.addProposal(proposal);
    return { ok: true, staged: true, message: `Drafted ${proposal.role} "${partyName}". Waiting for the member to Apply — not saved yet.` };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}
