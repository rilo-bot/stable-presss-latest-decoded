/**
 * Magazine drafts — SERVER-BACKED so multiple staff can collaborate on one
 * magazine (page-assigned, staff-only; see apps/server/src/routes/magazines.ts).
 *
 * Editing stays smooth: region edits update the in-memory cache instantly (the
 * uncontrolled contentEditable keystroke path is untouched) and a debounced
 * per-page PATCH persists them in the background. Collaboration is last-write-
 * wins per page; you see others' changes when the magazine is (re)opened.
 *
 * Images are URLs (S3 in deployment, data URL in local-dev fallback) stored
 * directly on the region, so `resolveImage` is now a passthrough.
 */

import { create } from 'zustand';
import { authFetch } from '@/lib/api';
import { toast } from 'sonner';
import { sanitizeRichText } from '@/editor/lib/sanitize';
import {
  createDefaultPages,
  createPagesFromTypes,
  FIRST_COVER_IMAGE,
  BLUEPRINT_BY_TYPE,
  renumberPages,
  createPageFromType,
} from '@/editor/templates/blueprints';
import type {
  Magazine,
  MagazinePage,
  MagazineSummary,
  MagazineAccess,
  StaffOption,
  PublishPayload,
  PageTypeKey,
  RegionContent,
  TextStyle,
  ImageContent,
  QrContent,
  IconContent,
} from '@/types/magazine';

function nowIso(): string {
  return new Date().toISOString();
}

/** Short, collision-resistant id for a newly inserted page. */
function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

// ── undo/redo history (full-pages snapshots, kept out of React state) ─────────
type PagesSnapshot = MagazinePage[];
interface MagHistory {
  past: PagesSnapshot[];
  future: PagesSnapshot[];
  /** Coalescing key of the last recorded gesture (so a typing run = one step). */
  lastKey: string | null;
  lastAt: number;
}
const HIST_CAP = 60;
const COALESCE_MS = 1500;

function deepClonePages(pages: MagazinePage[]): MagazinePage[] {
  if (typeof structuredClone === 'function') return structuredClone(pages);
  return JSON.parse(JSON.stringify(pages));
}

/**
 * Add any regions that exist in the page's blueprint but are missing from a
 * stored page (e.g. after the template gains new images), preserving edits.
 */
function reconcilePages(pages: MagazinePage[]): MagazinePage[] {
  return pages.map((p) => {
    const def = BLUEPRINT_BY_TYPE[p.pageType]?.defaultContent;
    if (!def) return p;
    let changed = false;
    const content = { ...p.content };
    for (const [id, c] of Object.entries(def)) {
      if (!(id in content)) {
        content[id] = structuredClone(c);
        changed = true;
      }
    }
    return changed ? { ...p, content } : p;
  });
}

/** Split the server doc into the Magazine + the caller's access slice. */
function ingest(doc: Record<string, unknown>): { magazine: Magazine; access: MagazineAccess } {
  const { myRole, myEditablePageIds, ...rest } = doc as Record<string, unknown>;
  const mag = rest as unknown as Magazine;
  return {
    magazine: {
      ...mag,
      collaborators: mag.collaborators ?? [],
      publishedIssueIds: mag.publishedIssueIds ?? [],
    },
    access: {
      role: (myRole as MagazineAccess['role']) ?? 'owner',
      editablePageIds: (myEditablePageIds as MagazineAccess['editablePageIds']) ?? 'all',
    },
  };
}

// Immutable helper: apply a region patch to one page of one magazine.
function patchRegion(
  magazines: Magazine[],
  magId: string,
  pageId: string,
  regionId: string,
  next: RegionContent
): Magazine[] {
  return magazines.map((m) =>
    m.id !== magId
      ? m
      : {
          ...m,
          updatedAt: nowIso(),
          pages: m.pages.map((p) =>
            p.id !== pageId ? p : { ...p, content: { ...p.content, [regionId]: next } }
          ),
        }
  );
}

// ── state ───────────────────────────────────────────────────────────────────

interface MagazineState {
  magazines: Magazine[];
  summaries: MagazineSummary[];
  access: Record<string, MagazineAccess>;
  /** Per-magazine undo/redo availability (drives toolbar button state). */
  history: Record<string, { canUndo: boolean; canRedo: boolean }>;

  // ephemeral editor state
  currentId: string | null;
  selectedRegionId: string | null;
  /** Page of the selected region — region ids are only unique per page type, so
   *  selection MUST carry the page to target the right one when a type repeats. */
  selectedPageId: string | null;

  // lifecycle (server-backed)
  fetchMagazines: () => Promise<void>;
  loadMagazine: (id: string) => Promise<boolean>;
  createMagazine: (init?: {
    title?: string;
    edition?: string;
    /** Ordered page types to assemble (a template); omitted = full bulletin. */
    pageTypes?: PageTypeKey[];
  }) => Promise<string | null>;
  deleteMagazine: (id: string) => Promise<void>;
  updateMagazineMeta: (id: string, patch: Partial<Pick<Magazine, 'title' | 'edition' | 'coverImage'>>) => void;

  // collaborators (magazine capability is derived server-side from the staff role)
  fetchStaffDirectory: () => Promise<StaffOption[]>;
  addCollaborator: (
    magId: string,
    body: { email: string; pageIds: string[] | 'all' }
  ) => Promise<boolean>;
  removeCollaborator: (magId: string, userId: string) => Promise<boolean>;

  // selection — pageId scopes the region to one page (ids repeat across page types)
  select: (regionId: string | null, pageId?: string | null) => void;

  // live content edits (no save button — debounced per-page persistence)
  setText: (magId: string, pageId: string, regionId: string, html: string) => void;
  setTextStyle: (magId: string, pageId: string, regionId: string, patch: Partial<TextStyle>) => void;
  setImage: (magId: string, pageId: string, regionId: string, patch: Partial<ImageContent>) => void;
  setQr: (magId: string, pageId: string, regionId: string, patch: Partial<QrContent>) => void;
  setIcon: (magId: string, pageId: string, regionId: string, patch: Partial<IconContent>) => void;

  // structural page ops (owner-only; persisted via PUT /:id/pages)
  addPage: (magId: string, pageType: PageTypeKey, atIndex?: number) => void;
  deletePage: (magId: string, pageId: string) => void;
  movePage: (magId: string, pageId: string, dir: -1 | 1) => void;

  // undo / redo of content edits + structural changes (session-scoped)
  undo: (magId: string) => void;
  redo: (magId: string) => void;

  // page selection for publishing (owner/editor)
  setPageSelected: (magId: string, pageId: string, selected: boolean) => void;
  setAllPagesSelected: (magId: string, selected: boolean) => void;

  /** Immediately flush any debounced edits to the server (call on editor close). */
  flushPending: () => void;

  // images — src values are URLs now, so this is a passthrough.
  resolveImage: (keyOrUrl: string) => string;

  // publishing — issues are persisted server-side (see stores/issueStore.ts).
  buildIssuePayload: (magId: string, scope: 'full' | 'selected') => PublishPayload | null;
  markPublished: (magId: string, issueId: string) => void;
  getMagazine: (id: string) => Magazine | undefined;
  getAccess: (id: string) => MagazineAccess | undefined;
}

export const useMagazineStore = create<MagazineState>()((set, get) => {
  // ── debounced server-sync plumbing (kept out of React state) ────────────────
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>();
  function schedule(key: string, run: () => void, ms = 700) {
    const ex = pending.get(key);
    if (ex) clearTimeout(ex.timer);
    pending.set(key, { run, timer: setTimeout(() => { pending.delete(key); run(); }, ms) });
  }

  let lastSaveErrorAt = 0;
  function noteSaveError(status?: number) {
    const t = Date.now();
    if (t - lastSaveErrorAt > 5000) {
      lastSaveErrorAt = t;
      // 403 = this page is no longer shared with you (access changed mid-session).
      toast.error(
        status === 403
          ? "This page isn't shared with you anymore — reload the magazine to see the latest."
          : "Couldn't save your latest change — check your connection."
      );
    }
  }

  function flushPage(magId: string, pageId: string) {
    const page = get().magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
    if (!page) return;
    void authFetch(`/api/magazines/${magId}/pages/${pageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: page.content }),
    })
      .then((res) => { if (!res.ok) noteSaveError(res.status); })
      .catch(() => noteSaveError());
  }

  function flushMeta(magId: string) {
    const m = get().magazines.find((x) => x.id === magId);
    if (!m) return;
    void authFetch(`/api/magazines/${magId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: m.title, edition: m.edition, coverImage: m.coverImage }),
    })
      .then((res) => { if (!res.ok) noteSaveError(); })
      .catch(() => noteSaveError());
  }

  function flushSelection(magId: string) {
    const m = get().magazines.find((x) => x.id === magId);
    if (!m) return;
    const selectedPageIds = m.pages.filter((p) => p.selectedForPublish).map((p) => p.id);
    void authFetch(`/api/magazines/${magId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPageIds }),
    })
      .then((res) => { if (!res.ok) noteSaveError(); })
      .catch(() => noteSaveError());
  }

  // Replace the whole ordered page list (add / remove / reorder) — owner only.
  function flushStructure(magId: string) {
    const m = get().magazines.find((x) => x.id === magId);
    if (!m) return;
    void authFetch(`/api/magazines/${magId}/pages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: m.pages }),
    })
      .then((res) => { if (!res.ok) noteSaveError(res.status); })
      .catch(() => noteSaveError());
  }

  // ── undo/redo history plumbing ──────────────────────────────────────────────
  const histories = new Map<string, MagHistory>();
  function histFor(magId: string): MagHistory {
    let h = histories.get(magId);
    if (!h) {
      h = { past: [], future: [], lastKey: null, lastAt: 0 };
      histories.set(magId, h);
    }
    return h;
  }
  function syncHistoryFlags(magId: string) {
    const h = histories.get(magId);
    set((s) => ({
      history: {
        ...s.history,
        [magId]: { canUndo: !!h && h.past.length > 0, canRedo: !!h && h.future.length > 0 },
      },
    }));
  }
  /** Snapshot the pages BEFORE a mutation. Coalesces a continuous gesture
   *  (typing, dragging a slider) into a single undo step. */
  function recordHistory(magId: string, key: string) {
    const m = get().magazines.find((x) => x.id === magId);
    if (!m) return;
    const h = histFor(magId);
    const t = Date.now();
    if (h.lastKey === key && t - h.lastAt < COALESCE_MS && h.past.length) {
      h.lastAt = t;
      if (h.future.length) { h.future = []; syncHistoryFlags(magId); }
      return;
    }
    h.past.push(deepClonePages(m.pages));
    if (h.past.length > HIST_CAP) h.past.shift();
    h.future = [];
    h.lastKey = key;
    h.lastAt = t;
    syncHistoryFlags(magId);
  }
  /** Persist the pages restored by an undo/redo. The owner replaces the whole
   *  list in one request; collaborators re-flush only the pages they may edit. */
  function persistRestored(magId: string) {
    const access = get().access[magId];
    if (access?.role === 'owner') { flushStructure(magId); return; }
    const m = get().magazines.find((x) => x.id === magId);
    if (!m) return;
    const ids = access?.editablePageIds ?? [];
    const editable = ids === 'all' ? m.pages.map((p) => p.id) : ids;
    for (const pid of editable) flushPage(magId, pid);
  }
  function restorePages(magId: string, pages: MagazinePage[]) {
    set((s) => ({
      magazines: s.magazines.map((x) => (x.id === magId ? { ...x, pages, updatedAt: nowIso() } : x)),
      selectedRegionId: null,
      selectedPageId: null,
    }));
    persistRestored(magId);
    syncHistoryFlags(magId);
  }

  return {
    magazines: [],
    summaries: [],
    access: {},
    history: {},
    currentId: null,
    selectedRegionId: null,
    selectedPageId: null,

    fetchMagazines: async () => {
      try {
        const res = await authFetch('/api/magazines');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const summaries = (await res.json()) as MagazineSummary[];
        set({ summaries });
      } catch {
        /* studio simply shows none if the list fails to load */
      }
    },

    loadMagazine: async (id) => {
      set({ currentId: id, selectedRegionId: null, selectedPageId: null });
      try {
        const res = await authFetch(`/api/magazines/${id}`);
        if (!res.ok) return false;
        const { magazine, access } = ingest(await res.json());
        // Fill any newly-added template regions, then derive positional page
        // numbers so older drafts (with the original out-of-order numbers) display
        // a clean 1..N sequence.
        magazine.pages = renumberPages(reconcilePages(magazine.pages));
        set((s) => ({
          magazines: [...s.magazines.filter((m) => m.id !== id), magazine],
          access: { ...s.access, [id]: access },
        }));
        // Start a fresh undo history for this editing session.
        histories.delete(id);
        syncHistoryFlags(id);
        return true;
      } catch {
        return false;
      }
    },

    createMagazine: async (init) => {
      try {
        const res = await authFetch('/api/magazines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: init?.title ?? 'NZTROF Bulletin',
            edition: init?.edition ?? 'Advanced Bulletin · Prototype Issue',
            coverImage: FIRST_COVER_IMAGE,
            pages: init?.pageTypes ? createPagesFromTypes(init.pageTypes) : createDefaultPages(),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { magazine, access } = ingest(await res.json());
        set((s) => ({
          magazines: [...s.magazines, magazine],
          summaries: [...s.summaries],
          access: { ...s.access, [magazine.id]: access },
          currentId: magazine.id,
          selectedRegionId: null,
          selectedPageId: null,
        }));
        return magazine.id;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create the magazine.');
        return null;
      }
    },

    deleteMagazine: async (id) => {
      const res = await authFetch(`/api/magazines/${id}`, { method: 'DELETE' });
      if (res.ok) {
        histories.delete(id);
        set((s) => ({
          magazines: s.magazines.filter((m) => m.id !== id),
          summaries: s.summaries.filter((m) => m.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        }));
      } else {
        toast.error(res.status === 403 ? 'Only the owner can delete this magazine.' : 'Could not delete the magazine.');
      }
    },

    updateMagazineMeta: (id, patch) => {
      set((s) => ({
        magazines: s.magazines.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m)),
      }));
      schedule(`meta:${id}`, () => flushMeta(id));
    },

    fetchStaffDirectory: async () => {
      try {
        const res = await authFetch('/api/magazines/staff-directory');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as StaffOption[];
      } catch {
        return [];
      }
    },

    addCollaborator: async (magId, body) => {
      try {
        const res = await authFetch(`/api/magazines/${magId}/collaborators`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const e = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        const { magazine, access } = ingest(await res.json());
        set((s) => ({
          magazines: [...s.magazines.filter((m) => m.id !== magId), magazine],
          access: { ...s.access, [magId]: access },
        }));
        void get().fetchMagazines();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not add collaborator.');
        return false;
      }
    },

    removeCollaborator: async (magId, userId) => {
      try {
        const res = await authFetch(`/api/magazines/${magId}/collaborators/${userId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { magazine, access } = ingest(await res.json());
        set((s) => ({
          magazines: [...s.magazines.filter((m) => m.id !== magId), magazine],
          access: { ...s.access, [magId]: access },
        }));
        void get().fetchMagazines();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove collaborator.');
        return false;
      }
    },

    select: (regionId, pageId) =>
      set({ selectedRegionId: regionId, selectedPageId: regionId ? pageId ?? null : null }),

    setText: (magId, pageId, regionId, html) => {
      const cur = get().magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId)?.content[regionId];
      if (!cur || cur.kind !== 'text') return;
      const clean = sanitizeRichText(html);
      if (cur.html === clean) return; // no-op (e.g. blur with no change)
      recordHistory(magId, `text:${pageId}:${regionId}`);
      const next: RegionContent = { ...cur, html: clean };
      set((s) => ({ magazines: patchRegion(s.magazines, magId, pageId, regionId, next) }));
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setTextStyle: (magId, pageId, regionId, patch) => {
      const cur = get().magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId)?.content[regionId];
      if (!cur || cur.kind !== 'text') return;
      recordHistory(magId, `style:${pageId}:${regionId}`);
      const next: RegionContent = { ...cur, style: { ...cur.style, ...patch } };
      set((s) => ({ magazines: patchRegion(s.magazines, magId, pageId, regionId, next) }));
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setImage: (magId, pageId, regionId, patch) => {
      const cur = get().magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId)?.content[regionId];
      if (!cur || cur.kind !== 'image') return;
      recordHistory(magId, `image:${pageId}:${regionId}`);
      const next: RegionContent = { ...cur, ...patch };
      set((s) => ({ magazines: patchRegion(s.magazines, magId, pageId, regionId, next) }));
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setQr: (magId, pageId, regionId, patch) => {
      const cur = get().magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId)?.content[regionId];
      if (!cur || cur.kind !== 'qr') return;
      recordHistory(magId, `qr:${pageId}:${regionId}`);
      const next: RegionContent = { ...cur, ...patch };
      set((s) => ({ magazines: patchRegion(s.magazines, magId, pageId, regionId, next) }));
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setIcon: (magId, pageId, regionId, patch) => {
      const cur = get().magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId)?.content[regionId];
      if (!cur || cur.kind !== 'icon') return;
      recordHistory(magId, `icon:${pageId}:${regionId}`);
      const next: RegionContent = { ...cur, ...patch };
      set((s) => ({ magazines: patchRegion(s.magazines, magId, pageId, regionId, next) }));
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    addPage: (magId, pageType, atIndex) => {
      if (get().access[magId]?.role !== 'owner') return;
      recordHistory(magId, `struct:add:${uid()}`);
      set((s) => ({
        magazines: s.magazines.map((m) => {
          if (m.id !== magId) return m;
          const page = createPageFromType(pageType, `${pageType}-${uid()}`);
          const idx = atIndex == null ? m.pages.length : Math.max(0, Math.min(atIndex, m.pages.length));
          const pages = renumberPages([...m.pages.slice(0, idx), page, ...m.pages.slice(idx)]);
          return { ...m, pages, updatedAt: nowIso() };
        }),
      }));
      flushStructure(magId);
      syncHistoryFlags(magId);
    },

    deletePage: (magId, pageId) => {
      const m0 = get().magazines.find((x) => x.id === magId);
      if (!m0 || get().access[magId]?.role !== 'owner' || m0.pages.length <= 1) return;
      recordHistory(magId, `struct:del:${uid()}`);
      set((s) => ({
        magazines: s.magazines.map((m) =>
          m.id !== magId ? m : { ...m, pages: renumberPages(m.pages.filter((p) => p.id !== pageId)), updatedAt: nowIso() }
        ),
        selectedRegionId: null,
        selectedPageId: null,
      }));
      flushStructure(magId);
      syncHistoryFlags(magId);
    },

    movePage: (magId, pageId, dir) => {
      const m0 = get().magazines.find((x) => x.id === magId);
      if (!m0 || get().access[magId]?.role !== 'owner') return;
      const idx = m0.pages.findIndex((p) => p.id === pageId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= m0.pages.length) return;
      recordHistory(magId, `struct:move:${uid()}`);
      set((s) => ({
        magazines: s.magazines.map((m) => {
          if (m.id !== magId) return m;
          const pages = [...m.pages];
          const [moved] = pages.splice(idx, 1);
          pages.splice(j, 0, moved);
          return { ...m, pages: renumberPages(pages), updatedAt: nowIso() };
        }),
      }));
      flushStructure(magId);
      syncHistoryFlags(magId);
    },

    undo: (magId) => {
      const h = histories.get(magId);
      const m = get().magazines.find((x) => x.id === magId);
      if (!h || !m || h.past.length === 0) return;
      const prev = h.past.pop()!;
      h.future.push(deepClonePages(m.pages));
      if (h.future.length > HIST_CAP) h.future.shift();
      h.lastKey = null;
      restorePages(magId, prev);
    },

    redo: (magId) => {
      const h = histories.get(magId);
      const m = get().magazines.find((x) => x.id === magId);
      if (!h || !m || h.future.length === 0) return;
      const next = h.future.pop()!;
      h.past.push(deepClonePages(m.pages));
      if (h.past.length > HIST_CAP) h.past.shift();
      h.lastKey = null;
      restorePages(magId, next);
    },

    setPageSelected: (magId, pageId, selected) => {
      set((s) => ({
        magazines: s.magazines.map((m) =>
          m.id !== magId
            ? m
            : { ...m, pages: m.pages.map((p) => (p.id === pageId ? { ...p, selectedForPublish: selected } : p)) }
        ),
      }));
      flushSelection(magId);
    },

    setAllPagesSelected: (magId, selected) => {
      set((s) => ({
        magazines: s.magazines.map((m) =>
          m.id !== magId ? m : { ...m, pages: m.pages.map((p) => ({ ...p, selectedForPublish: selected })) }
        ),
      }));
      flushSelection(magId);
    },

    flushPending: () => {
      for (const [key, { timer, run }] of pending) {
        clearTimeout(timer);
        pending.delete(key);
        run();
      }
    },

    resolveImage: (keyOrUrl) => keyOrUrl || '',

    buildIssuePayload: (magId, scope) => {
      const s = get();
      const m = s.magazines.find((x) => x.id === magId);
      if (!m) return null;
      const selected = scope === 'selected' ? m.pages.filter((p) => p.selectedForPublish) : m.pages;
      if (selected.length === 0) return null;
      return {
        magazineId: m.id,
        title: m.title,
        edition: m.edition,
        coverImage: m.coverImage,
        coverImageUrl: s.resolveImage(m.coverImage),
        pages: deepClonePages(selected),
        scope,
      };
    },

    markPublished: (magId, issueId) =>
      set((s) => ({
        magazines: s.magazines.map((m) =>
          m.id === magId
            ? { ...m, status: 'published', publishedIssueIds: [...m.publishedIssueIds, issueId], updatedAt: nowIso() }
            : m
        ),
      })),

    getMagazine: (id) => get().magazines.find((m) => m.id === id),
    getAccess: (id) => get().access[id],
  };
});
