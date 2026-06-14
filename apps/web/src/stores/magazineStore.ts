import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbJSONStorage } from '@/lib/idbStorage';
import { sanitizeRichText } from '@/editor/lib/sanitize';
import { createDefaultPages, FIRST_COVER_IMAGE, BLUEPRINT_BY_TYPE } from '@/editor/templates/blueprints';
import type {
  Magazine,
  MagazinePage,
  PublishPayload,
  RegionContent,
  TextStyle,
  ImageContent,
  QrContent,
  ImageRef,
} from '@/types/magazine';

// ── id + hash helpers ───────────────────────────────────────────────────────

function uid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${rnd}`;
}

/** Fast non-crypto content hash (FNV-1a) for image dedupe keys. */
function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function nowIso(): string {
  return new Date().toISOString();
}

function deepClonePages(pages: MagazinePage[]): MagazinePage[] {
  // structuredClone is available in all modern browsers; fall back to JSON.
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

// ── state ───────────────────────────────────────────────────────────────────

interface MagazineState {
  magazines: Magazine[];
  images: Record<string, ImageRef>;

  // ephemeral editor state (not persisted)
  currentId: string | null;
  selectedRegionId: string | null;

  // lifecycle
  createMagazine: (init?: { title?: string; edition?: string }) => string;
  loadMagazine: (id: string) => void;
  duplicateMagazine: (id: string) => string | null;
  deleteMagazine: (id: string) => void;
  updateMagazineMeta: (id: string, patch: Partial<Pick<Magazine, 'title' | 'edition' | 'coverImage'>>) => void;

  // selection
  select: (regionId: string | null) => void;

  // live content edits (no save button)
  setText: (magId: string, pageId: string, regionId: string, html: string) => void;
  setTextStyle: (magId: string, pageId: string, regionId: string, patch: Partial<TextStyle>) => void;
  setImage: (magId: string, pageId: string, regionId: string, patch: Partial<ImageContent>) => void;
  setQr: (magId: string, pageId: string, regionId: string, patch: Partial<QrContent>) => void;

  // page selection for publishing
  setPageSelected: (magId: string, pageId: string, selected: boolean) => void;
  setAllPagesSelected: (magId: string, selected: boolean) => void;

  // images
  addImageDataUrl: (dataUrl: string) => string; // returns image key
  addImageUrl: (url: string) => string;
  resolveImage: (keyOrUrl: string) => string;

  // publishing — issues are persisted server-side (see stores/issueStore.ts).
  // The store only builds the self-contained snapshot to POST, and records the
  // resulting issue id back onto the draft.
  buildIssuePayload: (magId: string, scope: 'full' | 'selected') => PublishPayload | null;
  markPublished: (magId: string, issueId: string) => void;
  getMagazine: (id: string) => Magazine | undefined;
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
            p.id !== pageId
              ? p
              : { ...p, content: { ...p.content, [regionId]: next } }
          ),
        }
  );
}

export const useMagazineStore = create<MagazineState>()(
  persist(
    (set, get) => ({
      magazines: [],
      images: {},
      currentId: null,
      selectedRegionId: null,

      createMagazine: (init) => {
        const id = uid('mag');
        const pages = createDefaultPages();
        const mag: Magazine = {
          id,
          title: init?.title ?? 'NZTROF Bulletin',
          edition: init?.edition ?? 'Advanced Bulletin · Prototype Issue',
          coverImage: FIRST_COVER_IMAGE,
          status: 'draft',
          pages,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          publishedIssueIds: [],
        };
        set((s) => ({ magazines: [...s.magazines, mag], currentId: id, selectedRegionId: null }));
        return id;
      },

      loadMagazine: (id) =>
        set((s) => ({
          currentId: id,
          selectedRegionId: null,
          magazines: s.magazines.map((m) =>
            m.id === id ? { ...m, pages: reconcilePages(m.pages) } : m
          ),
        })),

      duplicateMagazine: (id) => {
        const src = get().magazines.find((m) => m.id === id);
        if (!src) return null;
        const newId = uid('mag');
        const copy: Magazine = {
          ...src,
          id: newId,
          title: `${src.title} (copy)`,
          status: 'draft',
          pages: deepClonePages(src.pages),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          publishedIssueIds: [],
        };
        set((s) => ({ magazines: [...s.magazines, copy] }));
        return newId;
      },

      deleteMagazine: (id) =>
        set((s) => ({
          magazines: s.magazines.filter((m) => m.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        })),

      updateMagazineMeta: (id, patch) =>
        set((s) => ({
          magazines: s.magazines.map((m) =>
            m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m
          ),
        })),

      select: (regionId) => set({ selectedRegionId: regionId }),

      setText: (magId, pageId, regionId, html) =>
        set((s) => {
          const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
          const cur = page?.content[regionId];
          if (!cur || cur.kind !== 'text') return {};
          const next: RegionContent = { ...cur, html: sanitizeRichText(html) };
          return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
        }),

      setTextStyle: (magId, pageId, regionId, patch) =>
        set((s) => {
          const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
          const cur = page?.content[regionId];
          if (!cur || cur.kind !== 'text') return {};
          const next: RegionContent = { ...cur, style: { ...cur.style, ...patch } };
          return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
        }),

      setImage: (magId, pageId, regionId, patch) =>
        set((s) => {
          const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
          const cur = page?.content[regionId];
          if (!cur || cur.kind !== 'image') return {};
          const next: RegionContent = { ...cur, ...patch };
          return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
        }),

      setQr: (magId, pageId, regionId, patch) =>
        set((s) => {
          const page = s.magazines.find((m) => m.id === magId)?.pages.find((p) => p.id === pageId);
          const cur = page?.content[regionId];
          if (!cur || cur.kind !== 'qr') return {};
          const next: RegionContent = { ...cur, ...patch };
          return { magazines: patchRegion(s.magazines, magId, pageId, regionId, next) };
        }),

      setPageSelected: (magId, pageId, selected) =>
        set((s) => ({
          magazines: s.magazines.map((m) =>
            m.id !== magId
              ? m
              : {
                  ...m,
                  pages: m.pages.map((p) =>
                    p.id === pageId ? { ...p, selectedForPublish: selected } : p
                  ),
                }
          ),
        })),

      setAllPagesSelected: (magId, selected) =>
        set((s) => ({
          magazines: s.magazines.map((m) =>
            m.id !== magId
              ? m
              : { ...m, pages: m.pages.map((p) => ({ ...p, selectedForPublish: selected })) }
          ),
        })),

      addImageDataUrl: (dataUrl) => {
        const key = `img-${hashString(dataUrl)}`;
        set((s) =>
          s.images[key]
            ? {}
            : {
                images: {
                  ...s.images,
                  [key]: { key, kind: 'dataurl', value: dataUrl, bytes: dataUrl.length, createdAt: nowIso() },
                },
              }
        );
        return key;
      },

      addImageUrl: (url) => {
        const key = `img-${hashString(url)}`;
        set((s) =>
          s.images[key]
            ? {}
            : {
                images: {
                  ...s.images,
                  [key]: { key, kind: 'url', value: url, bytes: url.length, createdAt: nowIso() },
                },
              }
        );
        return key;
      },

      resolveImage: (keyOrUrl) => {
        if (!keyOrUrl) return '';
        if (keyOrUrl.startsWith('img-')) {
          return get().images[keyOrUrl]?.value ?? '';
        }
        return keyOrUrl; // already a URL or data URL
      },

      buildIssuePayload: (magId, scope) => {
        const s = get();
        const m = s.magazines.find((x) => x.id === magId);
        if (!m) return null;
        const selected =
          scope === 'selected' ? m.pages.filter((p) => p.selectedForPublish) : m.pages;
        if (selected.length === 0) return null;
        // Deep-clone, then resolve every image reference to a self-contained value
        // (a URL, or — for legacy drafts — the inline data URL behind an img-<hash>
        // key), so the published snapshot renders with no access to this store.
        const pages: MagazinePage[] = deepClonePages(selected).map((p) => ({
          ...p,
          content: Object.fromEntries(
            Object.entries(p.content).map(([id, c]) =>
              c.kind === 'image' ? [id, { ...c, src: s.resolveImage(c.src) }] : [id, c]
            )
          ),
        }));
        return {
          magazineId: m.id,
          title: m.title,
          edition: m.edition,
          coverImage: m.coverImage,
          coverImageUrl: s.resolveImage(m.coverImage),
          pages,
          scope,
        };
      },

      markPublished: (magId, issueId) =>
        set((s) => ({
          magazines: s.magazines.map((m) =>
            m.id === magId
              ? {
                  ...m,
                  status: 'published',
                  publishedIssueIds: [...m.publishedIssueIds, issueId],
                  updatedAt: nowIso(),
                }
              : m
          ),
        })),

      getMagazine: (id) => get().magazines.find((m) => m.id === id),
    }),
    {
      name: 'stablepress-magazines',
      storage: idbJSONStorage,
      // Issues are persisted server-side now; only drafts + their images stay local.
      partialize: (s) => ({ magazines: s.magazines, images: s.images }),
    }
  )
);
