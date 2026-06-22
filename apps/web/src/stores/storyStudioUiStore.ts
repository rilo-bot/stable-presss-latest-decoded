// ---------------------------------------------------------------------------
// UI state for the "Story Studio" assistant — a right-side drawer that writes a
// story draft with the user and files it. Holds the open flag, a one-shot pending
// prompt (suggestion chips), the current PENDING INTERACTION (the on-screen card
// the model is waiting on), and the id of the draft it just created (so the panel
// can navigate to it). The model's client tools (storyToolExecutor.ts) park a
// pending interaction here and await its `resolve`; the matching card calls
// resolvePending() when the user finishes.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

/** The kinds of inline cards the Story Studio renders, one at a time. */
export type InteractionKind = 'story' | 'photo' | 'byline' | 'tier' | 'category' | 'horses';

/** A card the model is currently waiting on. `resolve` sends the result back to the model. */
export interface PendingInteraction {
  /** The tool call id this interaction answers. */
  id: string;
  kind: InteractionKind;
  /** Card seed data, e.g. the proposed { title, summary } or a suggested byline. */
  data?: Record<string, unknown>;
  resolve: (output: unknown) => void;
}

interface StoryStudioUiState {
  open: boolean;
  pendingPrompt: string | null;
  pending: PendingInteraction | null;
  /** Set once createStoryDraft succeeds — the panel navigates to it, then clears. */
  createdDraftId: string | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  setPending: (p: PendingInteraction | null) => void;
  /** Resolve the current interaction with `output` and clear it. */
  resolvePending: (output: unknown) => void;

  setCreatedDraft: (id: string | null) => void;
  /** Clear transient per-session state (called when the drawer closes). */
  reset: () => void;
}

export const useStoryStudioUi = create<StoryStudioUiState>((set, get) => ({
  open: false,
  pendingPrompt: null,
  pending: null,
  createdDraftId: null,

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  setPending: (pending) => set({ pending }),
  resolvePending: (output) => {
    const { pending } = get();
    if (!pending) return;
    pending.resolve(output);
    set({ pending: null });
  },

  setCreatedDraft: (createdDraftId) => set({ createdDraftId }),
  reset: () => set({ pending: null, pendingPrompt: null, createdDraftId: null }),
}));
