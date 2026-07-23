// ---------------------------------------------------------------------------
// Magazine Builder v2 — editor state (Zustand).
//
// Element writes are optimistic + rev-guarded: local edits render instantly;
// commit() sends the change with the page `rev`; a 409 means someone else wrote
// the page, so we reconcile to the server's current page (and tell the user).
// Undo/redo covers ELEMENT edits (move/resize/style); like the reference,
// element add/delete and page-structure ops are NOT on the undo stack.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { toast } from 'sonner';
import type { MagazineElement, MagazinePageV2, AgentProposal } from './model';
import * as api from './api';
import { ApiError, type IssueMeta, type PageSummary } from './api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UndoEntry {
  pageId: string;
  elementId: string;
  before: MagazineElement;
  after: MagazineElement;
}

interface EditorState {
  issueId: string | null;
  issue: IssueMeta | null;
  pages: PageSummary[];
  currentPageId: string | null;
  page: MagazinePageV2 | null; // full current page (elements + rev)
  selectedId: string | null;
  zoomWidth: number; // rendered page width in px
  loading: boolean;
  error: string | null;
  generating: boolean; // an "add AI pages" run is in flight (issue is processing)
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // AI editing assistant (per open page)
  chat: ChatMessage[];
  chatBusy: boolean;
  proposals: AgentProposal[];
  proposalsPageId: string | null;
  sendChat: (text: string, sourceText?: string) => Promise<void>;
  applyAllProposals: () => Promise<void>;
  discardProposals: () => void;

  load: (id: string) => Promise<void>;
  openPage: (pageId: string) => Promise<void>;
  select: (id: string | null) => void;
  setZoomWidth: (w: number) => void;
  canManage: () => boolean;

  /** Live, local-only element update (drag/resize feedback — no server call). */
  updateLocal: (elementId: string, patch: Partial<MagazineElement>) => void;
  /** Persist an element change (rev-guarded). `before` = state at edit start, for undo. */
  commit: (elementId: string, patch: Partial<MagazineElement>, before?: MagazineElement) => Promise<void>;
  addElement: (partial: Partial<MagazineElement>) => Promise<string | null>;
  deleteElement: (elementId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  addPage: () => Promise<void>;
  generatePages: (count: number, topic?: string) => Promise<void>;
  duplicatePage: (pageId: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  reorder: (from: number, to: number) => Promise<void>;
  rename: (title: string) => Promise<void>;
}

const el = (p: MagazinePageV2 | null, id: string | null) => p?.elements.find((e) => e.id === id) ?? null;

export const useEditorStore = create<EditorState>((set, get) => ({
  issueId: null,
  issue: null,
  pages: [],
  currentPageId: null,
  page: null,
  selectedId: null,
  zoomWidth: 720,
  loading: false,
  error: null,
  generating: false,
  undoStack: [],
  redoStack: [],
  chat: [],
  chatBusy: false,
  proposals: [],
  proposalsPageId: null,

  canManage: () => get().issue?.myRole === 'owner',

  load: async (id) => {
    set({ loading: true, error: null, issueId: id });
    try {
      const { issue, pages } = await api.getIssue(id);
      set({ issue, pages, loading: false, undoStack: [], redoStack: [], selectedId: null });
      if (pages[0]) await get().openPage(pages[0].id);
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' });
    }
  },

  openPage: async (pageId) => {
    const { issueId } = get();
    if (!issueId) return;
    try {
      const page = await api.getPage(issueId, pageId);
      // Chat + proposals are scoped to the open page — reset on page change.
      set({ page, currentPageId: pageId, selectedId: null, chat: [], proposals: [], proposalsPageId: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load page' });
    }
  },

  select: (id) => set({ selectedId: id }),
  setZoomWidth: (w) => set({ zoomWidth: Math.max(280, Math.min(1400, Math.round(w))) }),

  updateLocal: (elementId, patch) =>
    set((s) => {
      if (!s.page) return {};
      const merged = (e: MagazineElement): MagazineElement => {
        const next: MagazineElement = { ...e, ...patch } as MagazineElement;
        // one-level merge for sub-objects so a partial doesn't wipe siblings
        for (const k of ['text', 'image', 'shape', 'qr'] as const) {
          if ((patch as any)[k]) (next as any)[k] = { ...(e as any)[k], ...(patch as any)[k] };
        }
        return next;
      };
      return { page: { ...s.page, elements: s.page.elements.map((e) => (e.id === elementId ? merged(e) : e)) } };
    }),

  commit: async (elementId, patch, before) => {
    const s = get();
    if (!s.page || !s.issueId) return;
    const pageId = s.page.id;
    const rev = s.page.rev;
    const beforeEl = before ?? el(s.page, elementId) ?? undefined;
    try {
      const { element, rev: newRev } = await api.patchElement(s.issueId, pageId, elementId, rev, patch);
      set((st) => ({
        page: st.page ? { ...st.page, rev: newRev, elements: st.page.elements.map((e) => (e.id === elementId ? element : e)) } : st.page,
        undoStack: beforeEl ? [...st.undoStack.slice(-59), { pageId, elementId, before: beforeEl, after: element }] : st.undoStack,
        redoStack: [],
      }));
    } catch (e) {
      handleWriteError(e, set, get);
    }
  },

  addElement: async (partial) => {
    const s = get();
    if (!s.page || !s.issueId) return null;
    try {
      const { element, rev } = await api.addElement(s.issueId, s.page.id, s.page.rev, partial);
      set((st) => ({
        page: st.page ? { ...st.page, rev, elements: [...st.page.elements, element] } : st.page,
        selectedId: element.id,
      }));
      return element.id;
    } catch (e) {
      handleWriteError(e, set, get);
      return null;
    }
  },

  deleteElement: async (elementId) => {
    const s = get();
    if (!s.page || !s.issueId) return;
    try {
      const { rev } = await api.deleteElement(s.issueId, s.page.id, elementId, s.page.rev);
      set((st) => ({
        page: st.page ? { ...st.page, rev, elements: st.page.elements.filter((e) => e.id !== elementId) } : st.page,
        selectedId: st.selectedId === elementId ? null : st.selectedId,
      }));
    } catch (e) {
      handleWriteError(e, set, get);
    }
  },

  undo: async () => {
    const s = get();
    const entry = s.undoStack[s.undoStack.length - 1];
    if (!entry || !s.page || s.page.id !== entry.pageId || !s.issueId) return;
    try {
      const { element, rev } = await api.patchElement(s.issueId, s.page.id, entry.elementId, s.page.rev, entry.before);
      set((st) => ({
        page: st.page ? { ...st.page, rev, elements: st.page.elements.map((e) => (e.id === entry.elementId ? element : e)) } : st.page,
        undoStack: st.undoStack.slice(0, -1),
        redoStack: [...st.redoStack, entry],
      }));
    } catch (e) {
      handleWriteError(e, set, get);
    }
  },

  redo: async () => {
    const s = get();
    const entry = s.redoStack[s.redoStack.length - 1];
    if (!entry || !s.page || s.page.id !== entry.pageId || !s.issueId) return;
    try {
      const { element, rev } = await api.patchElement(s.issueId, s.page.id, entry.elementId, s.page.rev, entry.after);
      set((st) => ({
        page: st.page ? { ...st.page, rev, elements: st.page.elements.map((e) => (e.id === entry.elementId ? element : e)) } : st.page,
        redoStack: st.redoStack.slice(0, -1),
        undoStack: [...st.undoStack, entry],
      }));
    } catch (e) {
      handleWriteError(e, set, get);
    }
  },

  addPage: async () => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { pages } = await api.addPage(s.issueId);
      set({ pages });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add page');
    }
  },

  generatePages: async (count, topic) => {
    const { issueId, generating } = get();
    if (!issueId || generating) return;
    set({ generating: true });
    try {
      await api.generatePages(issueId, count, topic || undefined);
    } catch (e) {
      set({ generating: false });
      toast.error(e instanceof Error ? e.message : 'Failed to start generation');
      return;
    }
    toast.message('Designing new pages…');
    // Poll until the issue settles out of 'processing', then refresh summaries
    // (existing pages are untouched; the new ones just appear in the rail).
    const start = Date.now();
    const tick = async () => {
      try {
        const { issue, pages } = await api.getIssue(issueId);
        set({ issue, pages });
        if (issue.status === 'processing' && Date.now() - start < 180_000) {
          setTimeout(() => void tick(), 1500);
        } else {
          set({ generating: false });
          if (issue.status === 'failed') toast.error(issue.processingError || 'Adding pages failed');
          else toast.success('Pages added');
        }
      } catch {
        setTimeout(() => void tick(), 2000); // transient — keep polling
      }
    };
    setTimeout(() => void tick(), 1500);
  },

  duplicatePage: async (pageId) => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { pages } = await api.duplicatePage(s.issueId, pageId);
      set({ pages });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to duplicate');
    }
  },

  deletePage: async (pageId) => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { pages } = await api.deletePage(s.issueId, pageId);
      set({ pages });
      if (s.currentPageId === pageId && pages[0]) await get().openPage(pages[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete page');
    }
  },

  reorder: async (from, to) => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { pages } = await api.reorderPages(s.issueId, from, to);
      set({ pages });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder');
    }
  },

  rename: async (title) => {
    const s = get();
    if (!s.issueId) return;
    try {
      const issue = await api.renameIssue(s.issueId, title);
      set({ issue });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename');
    }
  },

  // ── AI editing assistant ──
  sendChat: async (text, sourceText) => {
    const s = get();
    const body = text.trim();
    if (!body || !s.issueId || !s.currentPageId || s.chatBusy) return;
    const history: ChatMessage[] = [...s.chat, { role: 'user', content: body }];
    set({ chat: history, chatBusy: true });
    try {
      const { reply, proposals } = await api.chatAgent(s.issueId, s.currentPageId, history, s.selectedId ?? undefined, sourceText);
      set((st) => ({
        chat: [...st.chat, { role: 'assistant', content: reply }],
        proposals,
        proposalsPageId: s.currentPageId,
        chatBusy: false,
      }));
    } catch (e) {
      set((st) => ({ chat: [...st.chat, { role: 'assistant', content: 'Sorry — I hit a snag just then. Please try again.' }], chatBusy: false }));
      toast.error(e instanceof Error ? e.message : 'Assistant failed');
    }
  },

  // Apply every staged proposal in order through the rev-guarded CRUD. 'add'
  // proposals return the server id, remapped so later proposals that referenced
  // the temp id resolve. Each write bumps the page rev (handled by the reused
  // store methods), so sequential awaits keep the token current.
  applyAllProposals: async () => {
    const s = get();
    if (!s.page || s.proposalsPageId !== s.currentPageId || s.proposals.length === 0) return;
    const idMap = new Map<string, string>();
    for (const p of s.proposals) {
      try {
        if (p.kind === 'add' && p.element) {
          const newId = await get().addElement(p.element);
          if (p.tempId && newId) idMap.set(p.tempId, newId);
        } else if (p.kind === 'update' && p.elementId && p.patch) {
          await get().commit(idMap.get(p.elementId) ?? p.elementId, p.patch);
        } else if (p.kind === 'delete' && p.elementId) {
          await get().deleteElement(idMap.get(p.elementId) ?? p.elementId);
        }
      } catch {
        /* keep applying the rest */
      }
    }
    set({ proposals: [], proposalsPageId: null });
    toast.success('Applied the assistant’s changes.');
  },

  discardProposals: () => set({ proposals: [], proposalsPageId: null }),
}));

/** Shared write-error handling: a 409 reconciles to the server's current page. */
function handleWriteError(e: unknown, set: any, get: any) {
  if (e instanceof ApiError && e.status === 409 && e.body?.page) {
    set({ page: e.body.page, selectedId: null });
    toast.message('This page was updated elsewhere — reloaded the latest. Please redo your change.');
    return;
  }
  toast.error(e instanceof Error ? e.message : 'Save failed');
}
