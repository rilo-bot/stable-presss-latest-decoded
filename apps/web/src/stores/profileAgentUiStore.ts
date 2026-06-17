// ---------------------------------------------------------------------------
// UI + proposal state for the in-profile "Stable Studio" assistant. Holds the
// open flag, the live profile context (current horse/party snapshot, sent to the
// server each turn), a one-shot pending prompt (suggestion chips), and the staged
// proposals + undo stack. The apply/undo MUTATIONS live in
// agent/profile/applyProposals.ts (to avoid a store↔store import cycle).
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { PartyRole } from '@/types/party';

/** Snapshot of the open profile, mirrored to the server's ProfileContext each turn. */
export interface ProfileContext {
  entityKind: 'horse' | 'party';
  entityId: string;
  name: string;
  fields: Record<string, string>;
  emptyFields: string[];
  roleBoxes?: { role: string; count: number }[];
}

export interface FieldProposal {
  id: string;
  kind: 'field';
  entityKind: 'horse' | 'party';
  entityId: string;
  field: string;
  value: string;
  note?: string;
}
export interface ConnProposal {
  id: string;
  kind: 'connection';
  entityId: string;
  role: PartyRole;
  partyName: string;
  startYear?: string;
  endYear?: string;
  present: boolean;
}
export type Proposal = FieldProposal | ConnProposal;

export type UndoEntry =
  | { kind: 'field'; entityKind: 'horse' | 'party'; entityId: string; field: string; prevValue: unknown }
  | { kind: 'connection'; linkId: string };

interface ProfileAgentUiState {
  open: boolean;
  context: ProfileContext | null;
  pendingPrompt: string | null;
  staged: Proposal[];
  undo: UndoEntry[];

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setContext: (ctx: ProfileContext | null) => void;
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  addProposal: (p: Proposal) => void;
  removeProposal: (id: string) => void;
  clearStaged: () => void;

  pushUndo: (e: UndoEntry) => void;
  popUndo: () => UndoEntry | undefined;
}

export const useProfileAgentUi = create<ProfileAgentUiState>((set, get) => ({
  open: false,
  context: null,
  pendingPrompt: null,
  staged: [],
  undo: [],

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setContext: (context) => set({ context }),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  addProposal: (p) => set((s) => ({ staged: [...s.staged, p] })),
  removeProposal: (id) => set((s) => ({ staged: s.staged.filter((p) => p.id !== id) })),
  clearStaged: () => set({ staged: [] }),

  pushUndo: (e) => set((s) => ({ undo: [...s.undo, e].slice(-50) })),
  popUndo: () => {
    const { undo } = get();
    if (undo.length === 0) return undefined;
    const last = undo[undo.length - 1];
    set({ undo: undo.slice(0, -1) });
    return last;
  },
}));
