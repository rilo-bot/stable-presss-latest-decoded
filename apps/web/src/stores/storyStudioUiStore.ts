// ---------------------------------------------------------------------------
// UI state for the "Story Studio" assistant — a right-side drawer that writes a
// story draft with the user (a natural type-or-speak conversation) and files it.
// Holds the open flag, a one-shot pending prompt (suggestion chips), the photo
// the user attached via the composer's 📎 button (kept out of the model's context
// so big data-URLs never bloat the chat), and the id of the draft just created
// (so the panel can navigate to it). The conversation itself lives in the panel's
// useChat hook and is preserved while the drawer is merely closed.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

/** A horse shown in the read-only reference list during the link step. */
export interface HorseOption {
  id: string;
  name: string;
  trainer: string;
}

interface StoryStudioUiState {
  open: boolean;
  pendingPrompt: string | null;
  /** Lead photo the user attached via the composer — injected at file-draft time. */
  attachedImageUrl: string | null;
  /** Display-only list of horses on file — shown when the model reaches the link step. */
  horseOptions: HorseOption[] | null;
  /** Set once createStoryDraft succeeds — the panel navigates to it, then clears. */
  createdDraftId: string | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  setAttachedImage: (url: string | null) => void;
  setHorseOptions: (list: HorseOption[] | null) => void;
  setCreatedDraft: (id: string | null) => void;
  /** Clear transient per-conversation state (called on "New chat" / after filing). */
  reset: () => void;
}

export const useStoryStudioUi = create<StoryStudioUiState>((set) => ({
  open: false,
  pendingPrompt: null,
  attachedImageUrl: null,
  horseOptions: null,
  createdDraftId: null,

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  setAttachedImage: (attachedImageUrl) => set({ attachedImageUrl }),
  setHorseOptions: (horseOptions) => set({ horseOptions }),
  setCreatedDraft: (createdDraftId) => set({ createdDraftId }),
  reset: () => set({ pendingPrompt: null, attachedImageUrl: null, horseOptions: null, createdDraftId: null }),
}));
