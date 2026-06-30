// ---------------------------------------------------------------------------
// UI state for the "Article Studio" assistant — a right-side drawer that edits
// ONE open article in place on its detail page. Holds the open flag, which
// article it is bound to, the currently SELECTED field (the purple-ringed "data
// box" the assistant focuses on), a one-shot pending prompt (starter chips), a
// one-step undo snapshot of the last AI edit, and the latest stock-photo
// candidates to show as a clickable reference strip.
//
// Pure state only — the actual article mutations live in
// apps/web/src/agent/article/articleToolExecutor.ts (which calls the article
// store), to avoid a store↔store import cycle.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { ArticleUpdate } from '@/stores/articleStore';

/** A stock photo candidate surfaced by suggestImageOptions. */
export interface ImageOption {
  name: string;
  url: string;
}

interface ArticleStudioUiState {
  open: boolean;
  /** The article this studio session is editing (set when the drawer opens). */
  articleId: string | null;
  /** The field the user clicked — highlighted with a purple ring; the AI's focus. */
  selectedFieldId: string | null;
  pendingPrompt: string | null;
  /** Field values as they were BEFORE the last AI edit, so it can be undone once. */
  undoPatch: ArticleUpdate | null;
  /** Latest stock-photo candidates, shown as a clickable reference strip. */
  imageOptions: ImageOption[] | null;

  /** Open the drawer bound to an article (resets transient per-session state). */
  openFor: (articleId: string) => void;
  close: () => void;
  /** Open + queue a question (from a starter chip). */
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  select: (fieldId: string | null) => void;
  setUndo: (patch: ArticleUpdate | null) => void;
  clearUndo: () => void;
  setImageOptions: (options: ImageOption[] | null) => void;
}

export const useArticleStudioUi = create<ArticleStudioUiState>((set) => ({
  open: false,
  articleId: null,
  selectedFieldId: null,
  pendingPrompt: null,
  undoPatch: null,
  imageOptions: null,

  openFor: (articleId) =>
    set({ open: true, articleId, selectedFieldId: null, undoPatch: null, imageOptions: null }),
  close: () => set({ open: false }),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  select: (selectedFieldId) => set({ selectedFieldId }),
  setUndo: (undoPatch) => set({ undoPatch }),
  clearUndo: () => set({ undoPatch: null }),
  setImageOptions: (imageOptions) => set({ imageOptions }),
}));
