// ---------------------------------------------------------------------------
// UI state for the "Story Studio" assistant — a right-side drawer that writes a
// story draft with the user (a natural type-or-speak conversation) and files it.
// Holds the open flag, a one-shot pending prompt (suggestion chips), the photo
// the user attached via the composer's 📎 button (kept out of the model's context
// so big data-URLs never bloat the chat), and the id of the draft just created
// (so the panel can navigate to it). The conversation itself lives in the panel's
// useChat hook and is preserved while the drawer is merely closed.
//
// `chat` is a READ-ONLY MIRROR of that hook (busy flag, message count, last
// reply), written by the panel on every change. It exists so the Operator's
// `stories.fileWithStudio` action — which types into the drawer like a person —
// can tell when the studio has finished answering. Nothing drives the
// conversation through it.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

/** A horse shown in the read-only reference list during the link step. */
export interface HorseOption {
  id: string;
  name: string;
  trainer: string;
}

/** Mirror of a studio panel's chat state — see the header note. */
export interface StudioChatMirror {
  /** A request is in flight (submitted / streaming). */
  busy: boolean;
  /** Messages in the conversation, both sides. */
  messageCount: number;
  /** Text of the latest assistant message ('' if none yet). */
  lastReply: string;
  /** The chat hook's error message, if the last turn failed. */
  error: string | null;
}

export const EMPTY_CHAT_MIRROR: StudioChatMirror = { busy: false, messageCount: 0, lastReply: '', error: null };

interface StoryStudioUiState {
  open: boolean;
  pendingPrompt: string | null;
  /** Lead photo the user attached via the composer — injected at file-draft time. */
  attachedImageUrl: string | null;
  /** Display-only list of horses on file — shown when the model reaches the link step. */
  horseOptions: HorseOption[] | null;
  /** Set once createStoryDraft succeeds — the panel navigates to it, then clears. */
  createdDraftId: string | null;
  /** Mirror of the panel's chat hook (see header). */
  chat: StudioChatMirror;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  setAttachedImage: (url: string | null) => void;
  setHorseOptions: (list: HorseOption[] | null) => void;
  setCreatedDraft: (id: string | null) => void;
  /** Panel-only: mirror the chat hook's state (see header). */
  setChatMirror: (chat: StudioChatMirror) => void;
  /** Clear transient per-conversation state (called on "New chat" / after filing). */
  reset: () => void;
}

export const useStoryStudioUi = create<StoryStudioUiState>((set) => ({
  open: false,
  pendingPrompt: null,
  attachedImageUrl: null,
  horseOptions: null,
  createdDraftId: null,
  chat: EMPTY_CHAT_MIRROR,

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  setAttachedImage: (attachedImageUrl) => set({ attachedImageUrl }),
  setHorseOptions: (horseOptions) => set({ horseOptions }),
  setCreatedDraft: (createdDraftId) => set({ createdDraftId }),
  setChatMirror: (chat) => set({ chat }),
  reset: () => set({ pendingPrompt: null, attachedImageUrl: null, horseOptions: null, createdDraftId: null }),
}));
