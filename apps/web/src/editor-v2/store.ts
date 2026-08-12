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

/** A file the user attached to a chat turn, shown as a chip inside their sent
 *  message bubble (so the attachment reads as "sent", not stuck in the input). */
export interface ChatAttachmentRef {
  name: string;
  isImage: boolean;
  url?: string; // media-library URL for images (thumbnail); undefined for docs
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachmentRef[];
  /** Present on messages loaded from the persisted server thread (used as the
   *  paging cursor identity + optional page tag); absent on optimistic in-session
   *  messages until the next reload pulls them back from the server. */
  id?: string;
  pageIndex?: number | null;
  createdAt?: string;
}

/** Map a persisted server chat message into the in-store shape. */
const dtoToChat = (m: api.ChatMsgDto): ChatMessage => ({
  role: m.role,
  content: m.content,
  id: m.id,
  pageIndex: m.pageIndex,
  createdAt: m.createdAt,
  attachments: m.attachments,
});

/** A chat attachment surfaced in the right pane (docks over the Inspector). */
export interface PreviewDoc {
  name: string;
  isImage: boolean;
  imageUrl?: string; // object URL for image attachments
  text?: string; // extracted text for PDF/text attachments
  /** The document's own URL, when it can be rendered in-browser (PDFs — served
   *  inline by GET /file/*). Lets the pane show the REAL file, with `text` (what
   *  generation actually consumes) behind a toggle. */
  docUrl?: string;
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
  justGenerated: boolean; // a from-scratch generation just finished this session (offer "add more pages")
  formatBusy: boolean; // a Fill/Adjust text pass is running
  publishing: boolean; // a publish/unpublish call is in flight
  reviewBusy: boolean; // a submit/approve/request-changes call is in flight
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // AI editing assistant (per open page)
  chat: ChatMessage[];
  chatBusy: boolean;
  chatHasMore: boolean;
  chatOldest: string | null;
  chatLoadingOlder: boolean;
  // ── Threads ──
  // The conversation list, and which one the transcript above belongs to.
  threads: api.ChatThread[];
  threadsLoading: boolean;
  /** null = a new, not-yet-created chat: the first turn creates it server-side. */
  activeThreadId: string | null;
  loadThreads: () => Promise<void>;
  /** Switch the transcript to a thread. Discards staged proposals — they belong to
   *  a turn, and applying them from a different conversation would be a surprise. */
  openThread: (threadId: string) => Promise<void>;
  /** A blank chat. Nothing is written until the first message is sent. */
  newThread: () => void;
  renameThread: (threadId: string, title: string) => Promise<void>;
  removeThread: (threadId: string) => Promise<void>;
  proposals: AgentProposal[];
  proposalsPageId: string | null;
  /** When set, the right pane shows this attachment instead of the Inspector. */
  previewDoc: PreviewDoc | null;
  setPreviewDoc: (d: PreviewDoc | null) => void;
  sendChat: (text: string, sourceText?: string, attachedImages?: api.AttachedImage[], attachments?: ChatAttachmentRef[]) => Promise<void>;
  loadOlderChat: () => Promise<void>;
  applyAllProposals: () => Promise<void>;
  discardProposals: () => void;

  load: (id: string) => Promise<void>;
  openPage: (pageId: string) => Promise<void>;
  select: (id: string | null) => void;
  setZoomWidth: (w: number) => void;
  canManage: () => boolean;
  /** Can edit at least some pages (owner or collaborator). False = view-only. */
  canEdit: () => boolean;

  /** Live, local-only element update (drag/resize feedback — no server call). */
  updateLocal: (elementId: string, patch: Partial<MagazineElement>) => void;
  /** Persist an element change (rev-guarded). `before` = state at edit start, for undo. */
  commit: (elementId: string, patch: Partial<MagazineElement>, before?: MagazineElement) => Promise<void>;
  addElement: (partial: Partial<MagazineElement>) => Promise<string | null>;
  deleteElement: (elementId: string) => Promise<void>;
  /** Copy an element (offset slightly, on top) and select the copy. */
  duplicateElement: (elementId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  addPage: () => Promise<void>;
  generatePages: (count: number, topic?: string, atIndex?: number) => Promise<void>;
  duplicatePage: (pageId: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  reorder: (from: number, to: number) => Promise<void>;
  rename: (title: string) => Promise<void>;
  setCover: (cover: { coverImage?: string; coverPageId?: string }) => Promise<boolean>;
  /** Delete the whole magazine (draft + pages + any published edition). */
  remove: () => Promise<boolean>;
  reset: () => Promise<void>;
  /** Fill/Adjust a page's text. Defaults to the open page; passing another
   *  pageId opens that page first, then runs the pass on it. */
  runFormat: (mode: 'fill' | 'adjust', pageId?: string) => Promise<void>;
  /** Toggle whether a page is included in "publish selected pages". */
  setPageSelected: (pageId: string, selected: boolean) => Promise<void>;
  /** Publish (or republish) to Bulletins ('full' = all pages, 'selected' =
   *  flagged pages) → returns the public Bulletins issue id, or null on failure. */
  publish: (scope: 'full' | 'selected') => Promise<string | null>;
  unpublish: () => Promise<void>;
  /**
   * The draft has diverged from the live edition, so a republish is needed.
   *
   * Two sources, OR'd: what the server derived when the magazine was loaded, and
   * whether we have written anything ourselves since. The local half matters because
   * element writes return only `{element, rev}` — without it the studio would keep
   * saying "in sync" through a whole editing session on a published magazine, which is
   * the one moment the warning has to be right.
   */
  needsRepublish: () => boolean;
  /** Set by every successful write; cleared on load and on publish. */
  editedSinceLoad: boolean;

  // ── Submissions & approval (the review axis) ──
  // A submission is an EVENT over a set of pages, so all three take pageIds[] and
  // resolve to a single toast naming the pages that actually moved.
  /** Collaborator: send assigned pages to the owner for review. */
  submitPages: (pageIds: string[], note?: string) => Promise<boolean>;
  /** Owner: approve pages, recording the rev they were approved at. */
  approvePages: (pageIds: string[], note?: string) => Promise<boolean>;
  /** Owner: send pages back (doubles as reopen). `note` is required by the server. */
  requestChanges: (pageIds: string[], note: string) => Promise<boolean>;
  /** Re-fetch issue meta (collaborators, publish state) without reloading pages. */
  refreshIssue: () => Promise<void>;
  /** While an issue is still generating (status 'processing'), poll and reveal
   *  its pages as they land — no blocking screen. */
  watchGeneration: () => void;
  /** Stop the generation poll (on unmount / navigating away). */
  stopWatching: () => void;
  /** Dismiss the post-generation "add more pages" nudge. */
  clearJustGenerated: () => void;
}

const el = (p: MagazinePageV2 | null, id: string | null) => p?.elements.find((e) => e.id === id) ?? null;

// Poll handle for watching a still-generating issue reveal its pages live (so
// "Build with AI" drops the user straight into the studio instead of a blocking
// loading screen). Module-scoped so it survives store updates but stays single.
let genPoll: ReturnType<typeof setTimeout> | null = null;
function stopGenPoll() { if (genPoll) { clearTimeout(genPoll); genPoll = null; } }

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
  justGenerated: false,
  formatBusy: false,
  publishing: false,
  reviewBusy: false,
  editedSinceLoad: false,
  undoStack: [],
  redoStack: [],
  chat: [],
  threads: [],
  threadsLoading: false,
  activeThreadId: null,
  chatBusy: false,
  chatHasMore: false,
  chatOldest: null,
  chatLoadingOlder: false,
  proposals: [],
  proposalsPageId: null,
  previewDoc: null,
  setPreviewDoc: (d) => set({ previewDoc: d }),

  canManage: () => get().issue?.myRole === 'owner',
  canEdit: () => !!get().issue?.myRole,

  load: async (id) => {
    stopGenPoll();
    // editedSinceLoad resets here: the freshly-loaded `issue.needsRepublish` is the
    // server's own answer, so carrying a stale local flag across a reload would keep
    // claiming changes that were already published.
    set({ loading: true, error: null, issueId: id, generating: false, justGenerated: false, currentPageId: null, page: null, chat: [], proposals: [], proposalsPageId: null, editedSinceLoad: false });
    try {
      const { issue, pages } = await api.getIssue(id);
      set({ issue, pages, loading: false, undoStack: [], redoStack: [], selectedId: null });
      if (pages[0]) await get().openPage(pages[0].id);
      // Load the conversation list and open the most recent one — the behaviour of
      // every chat app: you come back to where you left off. Best-effort; a chat
      // fetch failure must never block opening the magazine.
      try {
        const threads = await api.listThreads(id);
        // Guard against a slow response landing after the user opened another issue.
        if (get().issueId !== id) return;
        set({ threads });
        // Resume the newest thread YOU can write to. Landing in the legacy log or
        // someone else's read-only thread would mean the composer is disabled before
        // the user has done anything.
        const resume = threads.find((t) => t.mine && !t.legacy);
        if (resume) await get().openThread(resume.id);
      } catch {
        /* start with a blank chat */
      }
      // Still generating (from "Build with AI" / import)? Poll and reveal pages
      // as they arrive instead of making the user wait on a loading screen.
      if (issue.status === 'processing') get().watchGeneration();
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' });
    }
  },

  openPage: async (pageId) => {
    const { issueId } = get();
    if (!issueId) return;
    // Re-opening the already-active page (scroll jitter, or clicking the active
    // tab) would needlessly refetch and reset selection — skip it.
    if (get().currentPageId === pageId && get().page) return;
    try {
      const page = await api.getPage(issueId, pageId);
      // Proposals are page-scoped → reset on a page change. Selection and chat are
      // deliberately NOT reset here: a stale selectedId harmlessly resolves to
      // nothing on a page that doesn't contain it (every consumer looks it up on
      // the current page), and keeping both means scrolling/switching pages no
      // longer clears your selection or wipes the conversation. Both are cleared
      // per-issue in load(). previewDoc is not page-scoped and survives too.
      set({ page, currentPageId: pageId, proposals: [], proposalsPageId: null });
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
    const s0 = get();
    if (!s0.page || !s0.issueId) return;
    const pageId = s0.page.id;
    const issueId = s0.issueId;
    const beforeEl = before ?? el(s0.page, elementId) ?? undefined;

    // Optimistic: reflect the edit on the canvas IMMEDIATELY so the inspector
    // never feels "dead" waiting on the network, and a later conflict can't erase
    // the change silently. The server write then confirms (or reconciles) it.
    get().updateLocal(elementId, patch);

    const send = async (rev: number, isRetry: boolean): Promise<void> => {
      try {
        const { element, rev: newRev } = await api.patchElement(issueId, pageId, elementId, rev, patch);
        set((st) => ({
          page: st.page && st.page.id === pageId
            ? { ...st.page, rev: newRev, elements: st.page.elements.map((e) => (e.id === elementId ? element : e)) }
            : st.page,
          undoStack: beforeEl ? [...st.undoStack.slice(-59), { pageId, elementId, before: beforeEl, after: element }] : st.undoStack,
          redoStack: [],
          editedSinceLoad: true,
        }));
      } catch (e) {
        // A stale rev (an AI/format write or a collaborator landed first) must NOT
        // discard the user's edit or their selection — that is exactly what made
        // the inspector look "dead" after using the assistant. Adopt the server's
        // fresh page, re-apply the edit on top, and retry ONCE against the new rev.
        const fresh = e instanceof ApiError && e.status === 409 ? (e.body?.page as MagazinePageV2 | undefined) : undefined;
        if (fresh && !isRetry && fresh.elements.some((x) => x.id === elementId)) {
          set((st) => (st.page && st.page.id === pageId ? { page: fresh } : {}));
          get().updateLocal(elementId, patch);
          await send(fresh.rev, true);
          return;
        }
        handleWriteError(e, set, get);
      }
    };
    await send(s0.page.rev, false);
  },

  addElement: async (partial) => {
    const s = get();
    if (!s.page || !s.issueId) return null;
    try {
      const { element, rev } = await api.addElement(s.issueId, s.page.id, s.page.rev, partial);
      set((st) => ({
        page: st.page ? { ...st.page, rev, elements: [...st.page.elements, element] } : st.page,
        selectedId: element.id,
        editedSinceLoad: true,
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
        editedSinceLoad: true,
      }));
    } catch (e) {
      handleWriteError(e, set, get);
    }
  },

  duplicateElement: async (elementId) => {
    const s = get();
    if (!s.page) return;
    const src = s.page.elements.find((e) => e.id === elementId);
    if (!src) return;
    const topZ = s.page.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    // Offset so the copy is visibly distinct; the server re-clamps to the page box.
    const off = 24;
    const { id: _id, ...rest } = src;
    void _id;
    await get().addElement({ ...rest, x: src.x + off, y: src.y + off, zIndex: topZ + 1, source: 'manual' });
    // addElement already selects the new element.
  },

  undo: async () => {
    const entry = get().undoStack[get().undoStack.length - 1];
    if (!entry || !get().issueId) return;
    // The edit may live on another page (you scrolled/navigated away since). Bring
    // that page into view first, so Undo always works — not just on the current page.
    if (get().page?.id !== entry.pageId) await get().openPage(entry.pageId);
    const s = get();
    if (!s.page || s.page.id !== entry.pageId || !s.issueId) return;
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
    const entry = get().redoStack[get().redoStack.length - 1];
    if (!entry || !get().issueId) return;
    if (get().page?.id !== entry.pageId) await get().openPage(entry.pageId);
    const s = get();
    if (!s.page || s.page.id !== entry.pageId || !s.issueId) return;
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
      set({ pages, editedSinceLoad: true });
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
    // Uses the shared, cancellable genPoll handle and guards every set() on the
    // captured issueId — otherwise navigating to a different magazine mid-run
    // would overwrite THAT magazine's state with this one's for up to 180s.
    stopGenPoll();
    const start = Date.now();
    const tick = async () => {
      if (get().issueId !== issueId) { set({ generating: false }); return; } // navigated away
      try {
        const { issue, pages } = await api.getIssue(issueId);
        if (get().issueId !== issueId) { set({ generating: false }); return; } // re-check after await
        set({ issue, pages });
        if (issue.status === 'processing' && Date.now() - start < 180_000) {
          genPoll = setTimeout(() => void tick(), 1500);
        } else {
          genPoll = null;
          set({ generating: false });
          if (issue.status === 'failed') toast.error(issue.processingError || 'Adding pages failed');
          else toast.success('Pages added');
        }
      } catch {
        if (get().issueId !== issueId) { set({ generating: false }); return; } // stop if we've moved on
        genPoll = setTimeout(() => void tick(), 2000); // transient — keep polling
      }
    };
    genPoll = setTimeout(() => void tick(), 1500);
  },

  duplicatePage: async (pageId) => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { pages } = await api.duplicatePage(s.issueId, pageId);
      set({ pages, editedSinceLoad: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to duplicate');
    }
  },

  deletePage: async (pageId) => {
    const s = get();
    if (!s.issueId) return;
    const issueId = s.issueId;
    const finish = async (pages: PageSummary[]) => {
      set({ pages, editedSinceLoad: true });
      if (get().currentPageId === pageId && pages[0]) await get().openPage(pages[0].id);
    };
    try {
      const { pages } = await api.deletePage(issueId, pageId);
      await finish(pages);
    } catch (e) {
      // A page a collaborator has SUBMITTED is refused first time round, naming who
      // submitted it, so the owner can't discard someone's work without being told.
      // The server's own sentence is what we show — it already names the page and the
      // people — and confirming retries with ?confirm=1. Without this the refusal
      // would be a dead end: a lock with no key.
      if (e instanceof ApiError && e.status === 409 && e.body?.reason === 'page-submitted') {
        if (!window.confirm(`${e.message}\n\nDelete it anyway? They'll be emailed about it.`)) return;
        try {
          const { pages } = await api.deletePage(issueId, pageId, true);
          await finish(pages);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete page');
        }
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Failed to delete page');
    }
  },

  reorder: async (from, to) => {
    const s = get();
    if (!s.issueId) return;
    try {
      const { pages } = await api.reorderPages(s.issueId, from, to);
      set({ pages, editedSinceLoad: true });
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

  setCover: async (cover) => {
    const s = get();
    if (!s.issueId) return false;
    try {
      const issue = await api.setCover(s.issueId, cover);
      set({ issue });
      toast.success(cover.coverImage === '' ? 'Cover reset to automatic.' : 'Cover updated.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set cover');
      return false;
    }
  },

  remove: async () => {
    const s = get();
    if (!s.issueId) return false;
    const issueId = s.issueId;
    try {
      await api.deleteIssue(issueId);
      toast.success('Magazine deleted.');
      return true;
    } catch (e) {
      // Deleting a LIVE magazine also takes the bulletin off the public newsstand,
      // which isn't obvious from a button in the studio — so the server refuses the
      // first attempt and says so. Show its sentence, then confirm through.
      if (e instanceof ApiError && e.status === 409 && e.body?.reason === 'is-live') {
        if (!window.confirm(`${e.message}\n\nDelete it anyway? This cannot be undone.`)) return false;
        try {
          await api.deleteIssue(issueId, true);
          toast.success('Magazine deleted, and removed from Bulletins.');
          return true;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Delete failed');
          return false;
        }
      }
      toast.error(e instanceof Error ? e.message : 'Delete failed');
      return false;
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
      set({ pages, editedSinceLoad: true });
    } catch (e) {
      set({ pages: s.pages }); // roll back
      toast.error(e instanceof Error ? e.message : 'Could not update the page selection');
    }
  },

  // Publish/republish to Bulletins. Returns the frozen edition's public id (or
  // null on failure); the caller shows the success toast + "View" navigation.
  publish: async (scope) => {
    const s = get();
    if (!s.issueId || s.publishing) return null;
    set({ publishing: true });
    try {
      const { publishedIssueId } = await api.publishIssue(s.issueId, scope);
      // Re-read the whole issue rather than trusting the publish reply: `needsRepublish`
      // is derived from the pages, and only GET /issues/:id carries them. Refreshing the
      // summaries also picks up any selectedForPublish the server changed.
      const fresh = await api.getIssue(s.issueId);
      set({ issue: fresh.issue, pages: fresh.pages, editedSinceLoad: false });
      return publishedIssueId;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
      return null;
    } finally {
      set({ publishing: false });
    }
  },

  needsRepublish: () => {
    const s = get();
    if (s.issue?.status !== 'published') return false;
    // THREE sources, any of which is enough:
    //  1. what the server derived from timestamps when the magazine loaded;
    //  2. any page it flagged as edited since the snapshot — a backstop, so if a write
    //     path ever forgets (3), the warning appears on the next load instead of never;
    //  3. our own writes this session, because element writes return no page summary
    //     and this is the one moment the warning has to be immediate.
    return s.issue.needsRepublish === true || s.pages.some((p) => p.editedSincePublish) || s.editedSinceLoad;
  },

  // ── Submissions & approval ────────────────────────────────────────────────
  //
  // All three share the same shape, and the same discipline about honesty:
  //  • `pages` comes back from the server, so the board reflects what was STORED,
  //    not what we hoped for — a partially-applied batch shows as such.
  //  • the toast names the pages that actually moved (`label`, phrased server-side)
  //    and reports `skipped` rather than hiding it.
  //  • email failure is REPORTED, never fatal: the transition is already committed,
  //    so "approved, but we couldn't email them" is the truth and the user needs it.
  submitPages: async (pageIds, note) => {
    const s = get();
    if (!s.issueId || pageIds.length === 0 || s.reviewBusy) return false;
    set({ reviewBusy: true });
    try {
      const r = await api.submitPages(s.issueId, pageIds, note);
      set({ pages: r.pages });
      // Re-open the current page so its read-only state takes effect immediately —
      // submitting locks it, and a canvas that still looks editable would invite
      // edits the server then refuses.
      if (s.currentPageId && pageIds.includes(s.currentPageId)) await get().openPage(s.currentPageId);
      const what = r.label || `${r.submitted} page${r.submitted === 1 ? '' : 's'}`;
      if (r.emailed) toast.success(`Sent ${what} for review — the owner has been emailed.`);
      else toast.success(`Sent ${what} for review.${r.emailError ? ` (Couldn't email the owner: ${r.emailError})` : ''}`);
      if (r.skipped > 0) toast.message(`${r.skipped} page${r.skipped === 1 ? '' : 's'} had already moved on.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit those pages');
      return false;
    } finally {
      set({ reviewBusy: false });
    }
  },

  approvePages: async (pageIds, note) => {
    const s = get();
    if (!s.issueId || pageIds.length === 0 || s.reviewBusy) return false;
    set({ reviewBusy: true });
    try {
      const r = await api.approvePages(s.issueId, pageIds, note);
      set({ pages: r.pages });
      const what = r.label || `${r.approved} page${r.approved === 1 ? '' : 's'}`;
      toast.success(`Approved ${what}.${r.emailed ? '' : ' (Nobody was emailed.)'}`);
      if (r.emailErrors?.length) toast.message(`Couldn't email: ${r.emailErrors.join('; ')}`);
      if (r.skipped > 0) toast.message(`${r.skipped} page${r.skipped === 1 ? '' : 's'} changed while you were reviewing — reload to see them.`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not approve those pages');
      return false;
    } finally {
      set({ reviewBusy: false });
    }
  },

  requestChanges: async (pageIds, note) => {
    const s = get();
    if (!s.issueId || pageIds.length === 0 || !note.trim() || s.reviewBusy) return false;
    set({ reviewBusy: true });
    try {
      const r = await api.requestPageChanges(s.issueId, pageIds, note.trim());
      set({ pages: r.pages });
      const what = r.label || `${r.returned} page${r.returned === 1 ? '' : 's'}`;
      toast.success(`Sent ${what} back with your note.${r.emailed ? '' : ' (Nobody was emailed.)'}`);
      if (r.emailErrors?.length) toast.message(`Couldn't email: ${r.emailErrors.join('; ')}`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send those pages back');
      return false;
    } finally {
      set({ reviewBusy: false });
    }
  },

  unpublish: async () => {
    const s = get();
    if (!s.issueId || !s.issue?.publishedIssueId || s.publishing) return;
    set({ publishing: true });
    try {
      const { issue } = await api.unpublishIssue(s.issueId);
      set({ issue });
      toast.success('Removed from Bulletins.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unpublish failed');
    } finally {
      set({ publishing: false });
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

  watchGeneration: () => {
    const watchId = get().issueId;
    if (!watchId) return;
    stopGenPoll();
    set({ generating: true });
    const start = Date.now();
    const tick = async () => {
      if (get().issueId !== watchId) { set({ generating: false }); return; } // navigated away
      try {
        const { issue, pages } = await api.getIssue(watchId);
        set({ issue, pages });
        // Reveal the first page the moment it exists so the user sees the build.
        if (!get().currentPageId && pages[0]) await get().openPage(pages[0].id);
        if (issue.status === 'processing' && Date.now() - start < 300_000) {
          genPoll = setTimeout(() => void tick(), 1500);
        } else {
          genPoll = null;
          // Completed OK → offer "add more pages" (the preview is intentionally short).
          set({ generating: false, justGenerated: issue.status !== 'failed' && issue.origin !== 'upload' });
          if (issue.status === 'failed') toast.error(issue.processingError || 'Generation failed');
        }
      } catch {
        genPoll = setTimeout(() => void tick(), 2500); // transient — keep polling
      }
    };
    genPoll = setTimeout(() => void tick(), 1200);
  },

  stopWatching: () => { stopGenPoll(); },

  clearJustGenerated: () => set({ justGenerated: false }),

  // ── Threads ──
  loadThreads: async () => {
    const id = get().issueId;
    if (!id) return;
    set({ threadsLoading: true });
    try {
      const threads = await api.listThreads(id);
      set((st) => (st.issueId === id ? { threads, threadsLoading: false } : { threadsLoading: false }));
    } catch {
      set({ threadsLoading: false });
    }
  },

  openThread: async (threadId) => {
    const id = get().issueId;
    if (!id) return;
    // Clear the transcript FIRST. Loading over the old one would leave another
    // conversation on screen for the length of the fetch, and the user would read it
    // as belonging to the thread they just clicked.
    set({ activeThreadId: threadId, chat: [], chatHasMore: false, chatOldest: null, proposals: [], proposalsPageId: null });
    try {
      const t = await api.listThreadMessages(id, threadId, { limit: 50 });
      set((st) => (st.issueId === id && st.activeThreadId === threadId
        ? { chat: t.messages.map(dtoToChat), chatHasMore: t.hasMore, chatOldest: t.oldestCreatedAt }
        : {}));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open that chat.');
    }
  },

  // No server call: an empty chat that nobody has spoken in isn't worth a document.
  // The first turn creates it and adopts the id the server returns.
  newThread: () => set({ activeThreadId: null, chat: [], chatHasMore: false, chatOldest: null, proposals: [], proposalsPageId: null }),

  renameThread: async (threadId, title) => {
    const id = get().issueId;
    if (!id || !title.trim()) return;
    try {
      const updated = await api.renameThread(id, threadId, title.trim());
      set((st) => ({ threads: st.threads.map((t) => (t.id === threadId ? updated : t)) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rename that chat.');
    }
  },

  removeThread: async (threadId) => {
    const id = get().issueId;
    if (!id) return;
    try {
      await api.deleteThread(id, threadId);
      const wasActive = get().activeThreadId === threadId;
      set((st) => ({ threads: st.threads.filter((t) => t.id !== threadId) }));
      // Deleting the chat you're reading leaves the panel showing a transcript that
      // no longer exists — so land on the next one, or a blank chat.
      if (wasActive) {
        const next = get().threads.find((t) => t.mine && !t.legacy);
        if (next) await get().openThread(next.id);
        else get().newThread();
      }
      toast.success('Chat deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete that chat.');
    }
  },

  // ── AI editing assistant ──
  sendChat: async (text, sourceText, attachedImages, attachments) => {
    const s = get();
    const body = text.trim();
    if (!body || !s.issueId || !s.currentPageId || s.chatBusy) return;
    // Read-only thread (someone else's, or the legacy log) — the composer is
    // disabled for these, and this is the matching guard so a stale render can't
    // post into a conversation the server would refuse anyway.
    const active = s.threads.find((t) => t.id === s.activeThreadId);
    if (active?.readOnly) return;
    set({ chat: [...s.chat, { role: 'user', content: body, attachments }], chatBusy: true });
    try {
      // ONE turn, plus the thread id. The server reads the rest of the history from
      // the thread itself — the client's transcript is for display, not the prompt.
      const { reply, proposals, threadId } = await api.chatAgent(
        s.issueId,
        s.currentPageId,
        [{ role: 'user', content: body }],
        s.selectedId ?? undefined,
        sourceText,
        attachedImages,
        s.activeThreadId ?? undefined,
      );
      set((st) => ({
        chat: [...st.chat, { role: 'assistant', content: reply }],
        proposals,
        proposalsPageId: s.currentPageId,
        chatBusy: false,
        // Adopt the thread the server used — on the first turn of a new chat this is
        // the id it just created. Without this, every turn would start another one.
        activeThreadId: threadId || st.activeThreadId,
      }));
      // Refresh the list so the new/renamed thread appears with its real title and
      // sorts to the top. Cheap, and it keeps the list honest without a socket.
      void get().loadThreads();
    } catch (e) {
      set((st) => ({ chat: [...st.chat, { role: 'assistant', content: 'Sorry — I hit a snag just then. Please try again.' }], chatBusy: false }));
      toast.error(e instanceof Error ? e.message : 'Assistant failed');
    }
  },

  // Lazily pull the batch OLDER than the oldest message we hold, prepending it —
  // so a long thread pages upward without loading all of it at once.
  loadOlderChat: async () => {
    const s = get();
    if (!s.issueId || !s.activeThreadId || !s.chatHasMore || s.chatLoadingOlder || !s.chatOldest) return;
    const issueId = s.issueId;
    const threadId = s.activeThreadId;
    const before = s.chatOldest;
    set({ chatLoadingOlder: true });
    try {
      const t = await api.listThreadMessages(issueId, threadId, { before, limit: 50 });
      set((st) => (st.issueId !== issueId || st.activeThreadId !== threadId ? { chatLoadingOlder: false } : {
        chat: [...t.messages.map(dtoToChat), ...st.chat],
        chatHasMore: t.hasMore,
        chatOldest: t.oldestCreatedAt ?? st.chatOldest,
        chatLoadingOlder: false,
      }));
    } catch {
      set({ chatLoadingOlder: false });
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

    // Refusals are COUNTED, not just survived. Each loop keeps going after a failure
    // (one bad proposal shouldn't strand the rest), but the toast at the end has to
    // reflect what actually happened: since the submissions flow landed, a page op can
    // legitimately be refused — a submitted page, a published draft — and reporting
    // "Applied the assistant's changes" over a swallowed 409 tells the user their
    // magazine changed when it did not.
    let refused = 0;

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
        refused++;
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
          set({ pages, editedSinceLoad: true });
        } else if (p.kind === 'reorder-page' && p.from != null && p.to != null) {
          const { pages } = await api.reorderPages(issueId, p.from, p.to);
          set({ pages, editedSinceLoad: true });
        } else if (p.kind === 'remove-page' && p.targetIndex != null) {
          const target = get().pages[p.targetIndex];
          if (target && get().pages.length > 1) {
            // Deleting a SUBMITTED page is refused first time with a 409 naming who
            // submitted it. Route it through the store's own deletePage so the owner
            // gets that confirmation dialog instead of a silent no-op — the assistant
            // asking on their behalf is no reason to skip the warning.
            if (target.review === 'submitted') {
              const before = get().pages.length;
              await get().deletePage(target.id);
              if (get().pages.length === before) refused++;
            } else {
              const { pages } = await api.deletePage(issueId, target.id);
              set({ pages, editedSinceLoad: true });
              if (get().currentPageId === target.id && pages[0]) await get().openPage(pages[0].id);
            }
          }
        } else if (p.kind === 'generate-pages' && p.count) {
          // Only one generation run per apply (they can't overlap while processing).
          deferGenerate = { count: p.count, topic: p.topic, atIndex: p.atIndex };
        }
      } catch {
        refused++;
      }
    }

    set({ proposals: [], proposalsPageId: null });
    if (refused > 0) {
      toast.warning(
        `Applied what I could — ${refused} change${refused === 1 ? '' : 's'} ${refused === 1 ? 'was' : 'were'} refused.`,
      );
    } else {
      toast.success('Applied the assistant’s changes.');
    }
    if (deferGenerate) await get().generatePages(deferGenerate.count, deferGenerate.topic, deferGenerate.atIndex);
  },

  discardProposals: () => set({ proposals: [], proposalsPageId: null }),
}));

/** Shared write-error handling: a 409 reconciles to the server's current page.
 *  Keeps the user's SELECTION if that element still exists on the fresh page —
 *  blanking it is what made the inspector snap to "Nothing selected" after a
 *  conflict and read as a dead panel. */
function handleWriteError(e: unknown, set: any, get: any) {
  if (e instanceof ApiError && e.status === 409 && e.body?.page) {
    const fresh = e.body.page as MagazinePageV2;
    const keep = get().selectedId as string | null;
    const stillThere = Array.isArray(fresh.elements) && fresh.elements.some((x: MagazineElement) => x.id === keep);
    set({ page: fresh, selectedId: stillThere ? keep : null });
    toast.message('This page was updated elsewhere — reloaded the latest.');
    return;
  }
  // A STATE block (page-submitted / page-approved) carries a `reason`
  // and no page body. Writes are optimistic — updateLocal already painted the change —
  // so without re-reading the stored page the canvas would keep showing an edit the
  // server refused, and the user would believe it saved. Re-fetch to discard it.
  if (e instanceof ApiError && e.status === 409 && typeof e.body?.reason === 'string') {
    const { issueId, page } = get();
    if (issueId && page) {
      const pageId = page.id as string;
      void api
        .getPage(issueId, pageId)
        .then((stored) => {
          if (get().page?.id === pageId) set({ page: stored });
        })
        .catch(() => {
          /* the toast below already told them; leave state alone */
        });
    }
    toast.error(e.message);
    return;
  }
  toast.error(e instanceof Error ? e.message : 'Save failed');
}
