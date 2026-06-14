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
import { createDefaultPages, FIRST_COVER_IMAGE, BLUEPRINT_BY_TYPE } from '@/editor/templates/blueprints';
import type {
  Magazine,
  MagazinePage,
  MagazineSummary,
  MagazineAccess,
  PublishPayload,
  RegionContent,
  TextStyle,
  ImageContent,
  QrContent,
} from '@/types/magazine';

function nowIso(): string {
  return new Date().toISOString();
}

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

  // ephemeral editor state
  currentId: string | null;
  selectedRegionId: string | null;

  // lifecycle (server-backed)
  fetchMagazines: () => Promise<void>;
  loadMagazine: (id: string) => Promise<boolean>;
  createMagazine: (init?: { title?: string; edition?: string }) => Promise<string | null>;
  deleteMagazine: (id: string) => Promise<void>;
  updateMagazineMeta: (id: string, patch: Partial<Pick<Magazine, 'title' | 'edition' | 'coverImage'>>) => void;

  // collaborators
  addCollaborator: (
    magId: string,
    body: { email: string; role: 'editor' | 'contributor'; pageIds: string[] | 'all' }
  ) => Promise<boolean>;
  removeCollaborator: (magId: string, userId: string) => Promise<boolean>;

  // selection
  select: (regionId: string | null) => void;

  // live content edits (no save button — debounced per-page persistence)
  setText: (magId: string, pageId: string, regionId: string, html: string) => void;
  setTextStyle: (magId: string, pageId: string, regionId: string, patch: Partial<TextStyle>) => void;
  setImage: (magId: string, pageId: string, regionId: string, patch: Partial<ImageContent>) => void;
  setQr: (magId: string, pageId: string, regionId: string, patch: Partial<QrContent>) => void;

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
  function noteSaveError() {
    const t = Date.now();
    if (t - lastSaveErrorAt > 5000) {
      lastSaveErrorAt = t;
      toast.error("Couldn't save your latest change — check your connection.");
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
      .then((res) => { if (!res.ok) noteSaveError(); })
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

  return {
    magazines: [],
    summaries: [],
    access: {},
    currentId: null,
    selectedRegionId: null,

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
      set({ currentId: id, selectedRegionId: null });
      try {
        const res = await authFetch(`/api/magazines/${id}`);
        if (!res.ok) return false;
        const { magazine, access } = ingest(await res.json());
        magazine.pages = reconcilePages(magazine.pages);
        set((s) => ({
          magazines: [...s.magazines.filter((m) => m.id !== id), magazine],
          access: { ...s.access, [id]: access },
        }));
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
            pages: createDefaultPages(),
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

    select: (regionId) => set({ selectedRegionId: regionId }),

    setText: (magId, pageId, regionId, html) => {
      set((s) => {
        const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
        const cur = page?.content[regionId];
        if (!cur || cur.kind !== 'text') return {};
        const next: RegionContent = { ...cur, html: sanitizeRichText(html) };
        return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
      });
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setTextStyle: (magId, pageId, regionId, patch) => {
      set((s) => {
        const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
        const cur = page?.content[regionId];
        if (!cur || cur.kind !== 'text') return {};
        const next: RegionContent = { ...cur, style: { ...cur.style, ...patch } };
        return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
      });
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setImage: (magId, pageId, regionId, patch) => {
      set((s) => {
        const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
        const cur = page?.content[regionId];
        if (!cur || cur.kind !== 'image') return {};
        const next: RegionContent = { ...cur, ...patch };
        return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
      });
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
    },

    setQr: (magId, pageId, regionId, patch) => {
      set((s) => {
        const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
        const cur = page?.content[regionId];
        if (!cur || cur.kind !== 'qr') return {};
        const next: RegionContent = { ...cur, ...patch };
        return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
      });
      schedule(`page:${magId}:${pageId}`, () => flushPage(magId, pageId));
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
