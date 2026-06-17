// ---------------------------------------------------------------------------
// UI + edit state for the in-editor Studio Assistant. Holds the open/visibility
// flags, the page the editor is currently viewing (for page-aware context and
// the 3 floating suggestions), a one-shot pending prompt (from suggestion chips
// / inline buttons), and the staging buffer + undo stack for AI edits.
//
// Pure state only — the apply/undo MUTATIONS to the magazine live in
// editor/agent/applyEdits.ts (which calls magazineStore), to avoid a store↔store
// import cycle.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { StagedEdit, UndoEntry, DocAttachment } from '@/editor/agent/types';

interface EditorAgentUiState {
  open: boolean;
  /** While true, the global site Stablehand launcher is hidden (editor is open). */
  suppressGlobal: boolean;
  currentPageId: string | null;
  pendingPrompt: string | null;
  staged: StagedEdit[];
  undo: UndoEntry[];
  /** Uploaded source documents (analysed digests) the agent can place from. */
  attachments: DocAttachment[];

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setSuppressGlobal: (v: boolean) => void;
  setCurrentPage: (pageId: string | null) => void;
  /** Open the panel and queue a question (from a suggestion chip / inline button). */
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  addStaged: (edits: StagedEdit[]) => void;
  removeStaged: (id: string) => void;
  removeBatch: (batchId: string) => void;
  clearStaged: () => void;

  pushUndo: (entry: UndoEntry) => void;
  popUndo: () => UndoEntry | undefined;

  addAttachment: (a: DocAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

export const useEditorAgentUi = create<EditorAgentUiState>((set, get) => ({
  open: false,
  suppressGlobal: false,
  currentPageId: null,
  pendingPrompt: null,
  staged: [],
  undo: [],
  attachments: [],

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setSuppressGlobal: (v) => set({ suppressGlobal: v }),
  setCurrentPage: (pageId) => set({ currentPageId: pageId }),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  addStaged: (edits) => set((s) => ({ staged: [...s.staged, ...edits] })),
  removeStaged: (id) => set((s) => ({ staged: s.staged.filter((e) => e.id !== id) })),
  removeBatch: (batchId) => set((s) => ({ staged: s.staged.filter((e) => e.batchId !== batchId) })),
  clearStaged: () => set({ staged: [] }),

  pushUndo: (entry) => set((s) => ({ undo: [...s.undo, entry].slice(-50) })),
  popUndo: () => {
    const { undo } = get();
    if (undo.length === 0) return undefined;
    const last = undo[undo.length - 1];
    set({ undo: undo.slice(0, -1) });
    return last;
  },

  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a].slice(-6) })),
  removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),
}));
