// ---------------------------------------------------------------------------
// Tiny UI bus for the Stablehand assistant. Lets any component (inline "Ask"
// buttons across the app) open the global chat widget and optionally seed a
// first question. The AgentWidget owns the conversation; this only carries the
// open state + a one-shot pending prompt the widget consumes on mount/effect.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

interface AgentUiState {
  open: boolean;
  /** A question queued by an inline trigger, sent once then cleared. */
  pendingPrompt: string | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Open the widget and queue a question to send. */
  ask: (prompt: string) => void;
  consumePrompt: () => void;
}

export const useAgentUi = create<AgentUiState>((set) => ({
  open: false,
  pendingPrompt: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),
}));
