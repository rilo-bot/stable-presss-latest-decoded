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

/** A chat attachment surfaced in the right pane (docks over the Inspector). */
export interface PreviewDoc {
  name: string;
  isImage: boolean;
  imageUrl?: string; // object URL for image attachments
  text?: string; // extracted text for PDF/text attachments
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
  formatBusy: boolean; // a Fill/Adjust text pass is running
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // AI editing assistant (per open page)
  chat: ChatMessage[];
  chatBusy: boolean;
  proposals: AgentProposal[];
  proposalsPageId: string | null;
  /** When set, the right pane shows this attachment instead of the Inspector. */
  previewDoc: PreviewDoc | null;
  setPreviewDoc: (d: PreviewDoc | null) => void;
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
  generatePages: (count: number, topic?: string, atIndex?: number) => Promise<void>;
  duplicatePage: (pageId: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  reorder: (from: number, to: number) => Promise<void>;
  rename: (title: string) => Promise<void>;
  reset: () => Promise<void>;
  /** Fill/Adjust a page's text. Defaults to the open page; passing another
   *  pageId opens that page first, then runs the pass on it. */
  runFormat: (mode: 'fill' | 'adjust', pageId?: string) => Promise<void>;
  /** Toggle whether a page is included in "publish selected pages". */
  setPageSelected: (pageId: string, selected: boolean) => Promise<void>;
  /** Publish to Bulletins ('full' = all pages, 'selected' = flagged pages). */
  publish: (scope: 'full' | 'selected') => Promise<boolean>;
  unpublish: () => Promise<void>;
  /** Re-fetch issue meta (collaborators, publish state) without reloading pages. */
  refreshIssue: () => Promise<void>;
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
  formatBusy: false,
  undoStack: [],
  redoStack: [],
  chat: [],
  chatBusy: false,
  proposals: [],
  proposalsPageId: null,
  previewDoc: null,
  setPreviewDoc: (d) => set({ previewDoc: d }),

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
      set({ page, currentPageId: pageId, selectedId: null, chat: [], proposals: [], proposalsPageId: null, previewDoc: null });
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

  generatePages: async (count, topic, atIndex) => {
    const { issueId, generating } = get();
    if (!issueId || generating) return;
    set({ generating: true });
    try {
      await api.generatePages(issueId, count, topic || undefined, atIndex);
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

  reset: async () => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { issue, pages } = await api.resetIssue(s.issueId);
      set({ issue, pages, selectedId: null, undoStack: [], redoStack: [], proposals: [], proposalsPageId: null });
      if (pages[0]) await get().openPage(pages[0].id);
      toast.success('Reset to a blank page.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset');
    }
  },

  // Fill (write empty + tighten crowded) / Adjust (tighten crowded) — the server
  // returns text edits; we auto-apply each through the undoable element CRUD.
  // A different pageId first opens that page (per-page buttons in the stack).
  runFormat: async (mode, pageId) => {
    if (pageId && pageId !== get().currentPageId) await get().openPage(pageId);
    const s = get();
    if (!s.issueId || !s.currentPageId || !s.page || s.formatBusy) return;
    set({ formatBusy: true });
    try {
      const { edits, note } = await api.formatPage(s.issueId, s.currentPageId, mode);
      if (edits.length === 0) {
        toast.message(note || 'Nothing to change on this page.');
        return;
      }
      for (const e of edits) {
        const before = get().page?.elements.find((x) => x.id === e.elementId);
        if (!before || before.type !== 'text' || !before.text) continue;
        await get().commit(e.elementId, { text: { ...before.text, content: e.content } }, before);
      }
      toast.success(note || `${mode === 'fill' ? 'Filled' : 'Adjusted'} ${edits.length} text block${edits.length === 1 ? '' : 's'}. Undo with Ctrl+Z.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Text pass failed');
    } finally {
      set({ formatBusy: false });
    }
  },

  // Toggle a page's inclusion in "publish selected pages".
  setPageSelected: async (pageId, selected) => {
    const s = get();
    if (!s.issueId) return;
    // Optimistic — the checkbox answers instantly; reconcile with the server list.
    set({ pages: s.pages.map((p) => (p.id === pageId ? { ...p, selectedForPublish: selected } : p)) });
    try {
      const { pages } = await api.setPageSelected(s.issueId, pageId, selected);
      set({ pages });
    } catch (e) {
      set({ pages: s.pages }); // roll back
      toast.error(e instanceof Error ? e.message : 'Could not update the page selection');
    }
  },

  publish: async (scope) => {
    const s = get();
    if (!s.issueId) return false;
    try {
      const { issue } = await api.publishIssue(s.issueId, scope);
      set({ issue });
      toast.success(scope === 'full' ? 'Published the full edition to Bulletins.' : 'Published the selected pages to Bulletins.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
      return false;
    }
  },

  unpublish: async () => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { issue } = await api.unpublishIssue(s.issueId);
      set({ issue });
      toast.success('Removed from Bulletins.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unpublish failed');
    }
  },

  refreshIssue: async () => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { issue, pages } = await api.getIssue(s.issueId);
      set({ issue, pages });
    } catch {
      /* keep current state */
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
    if (!s.page || s.proposalsPageId !== s.currentPageId || s.proposals.length === 0 || !s.issueId) return;
    const issueId = s.issueId;
    const idMap = new Map<string, string>();
    const isPageKind = (k: AgentProposal['kind']) => k === 'add-page' || k === 'remove-page' || k === 'reorder-page' || k === 'generate-pages';

    // 1) Element edits on the current page (rev-guarded CRUD; add → id remap).
    for (const p of s.proposals.filter((x) => !isPageKind(x.kind))) {
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

    // 2) Page-structure edits — indices resolved against the LATEST page list each
    // step (earlier ops shift positions). Blank/reorder/remove refresh summaries;
    // generate-pages hands off to the polling generation flow.
    let deferGenerate: { count: number; topic?: string; atIndex?: number } | null = null;
    for (const p of s.proposals.filter((x) => isPageKind(x.kind))) {
      try {
        if (p.kind === 'add-page') {
          const { pages } = await api.addPage(issueId, p.atIndex);
          set({ pages });
        } else if (p.kind === 'reorder-page' && p.from != null && p.to != null) {
          const { pages } = await api.reorderPages(issueId, p.from, p.to);
          set({ pages });
        } else if (p.kind === 'remove-page' && p.targetIndex != null) {
          const target = get().pages[p.targetIndex];
          if (target && get().pages.length > 1) {
            const { pages } = await api.deletePage(issueId, target.id);
            set({ pages });
            if (get().currentPageId === target.id && pages[0]) await get().openPage(pages[0].id);
          }
        } else if (p.kind === 'generate-pages' && p.count) {
          // Only one generation run per apply (they can't overlap while processing).
          deferGenerate = { count: p.count, topic: p.topic, atIndex: p.atIndex };
        }
      } catch {
        /* keep applying the rest */
      }
    }

    set({ proposals: [], proposalsPageId: null });
    toast.success('Applied the assistant’s changes.');
    if (deferGenerate) await get().generatePages(deferGenerate.count, deferGenerate.topic, deferGenerate.atIndex);
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
