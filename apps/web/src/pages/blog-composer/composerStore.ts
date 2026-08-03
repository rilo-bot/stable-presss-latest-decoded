/**
 * Composer state.
 *
 * Separate from `blogStore` on purpose. blogStore is the app's view of posts —
 * lists, the public reader, publish toggles. This holds ONE post being edited,
 * plus everything only an editor cares about: selection, dirty tracking, the
 * autosave timer, undo history and conflict state. Mixing them would mean every
 * card list re-rendered on each keystroke.
 *
 * ── Saving ──
 * Edits are local and instant; a debounced autosave pushes them with the
 * `baseUpdatedAt` the server last returned. A 409 means someone else saved in
 * between, so we stop auto-saving and surface the conflict rather than deciding
 * whose work to discard.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch } from '@/lib/api';
import { uploadImage, uploadRawFile } from '@/lib/upload';
import type { Block, Blog, BlogMedia, Placement } from '@/types/blog';
import { blocksUsingMedia } from '@/types/blog';
import { duplicateBlock } from '@/blog/factories';

const AUTOSAVE_MS = 1500;
/** How many steps of history to keep. Deep enough to undo a bad paste, bounded
 *  so a long session cannot grow without limit. */
const UNDO_LIMIT = 50;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

interface Snapshot {
  blocks: Block[];
  media: BlogMedia[];
}

interface ComposerState {
  blog: Blog | null;
  /** The `updatedAt` the server last confirmed — the concurrency baseline. */
  baseUpdatedAt: string | null;
  selectedId: string | null;
  saveState: SaveState;
  saveError: string | null;
  /** Right pane: the selected block's settings, or the post's own settings. */
  pane: 'block' | 'post';
  uploading: number;

  undoStack: Snapshot[];
  redoStack: Snapshot[];

  load: (blog: Blog) => void;
  close: () => void;
  select: (id: string | null) => void;
  setPane: (pane: 'block' | 'post') => void;

  /** Patch post-level fields (title, slug, tags, cover, seo…). */
  patchPost: (patch: Partial<Blog>) => void;

  insertBlock: (block: Block, atIndex?: number) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  updatePlacement: (id: string, patch: Partial<Placement>) => void;
  moveBlock: (id: string, delta: number) => void;
  moveBlockTo: (id: string, index: number) => void;
  duplicate: (id: string) => void;
  removeBlock: (id: string) => void;

  addMedia: (file: File) => Promise<BlogMedia | null>;
  patchMedia: (mediaId: string, patch: Partial<BlogMedia>) => void;
  removeMedia: (mediaId: string) => Promise<void>;

  undo: () => void;
  redo: () => void;

  saveNow: () => Promise<boolean>;
  /** Discard local edits and adopt the server's version, ending a conflict. */
  reloadFromServer: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    /* non-JSON */
  }
  return `${fallback} (HTTP ${res.status})`;
}

export const useComposerStore = create<ComposerState>()((set, get) => {
  /** Queue an autosave. Never re-arms while a conflict is unresolved. */
  const scheduleSave = () => {
    if (get().saveState === 'conflict') return;
    cancelTimer();
    set({ saveState: 'dirty' });
    saveTimer = setTimeout(() => void get().saveNow(), AUTOSAVE_MS);
  };

  /** Snapshot the body onto the undo stack before a structural change. */
  const pushHistory = () => {
    const { blog, undoStack } = get();
    if (!blog) return;
    const snap: Snapshot = { blocks: blog.blocks, media: blog.media };
    set({
      undoStack: [...undoStack.slice(-(UNDO_LIMIT - 1)), snap],
      // Any new edit invalidates the redo branch, as in every editor.
      redoStack: [],
    });
  };

  const mutateBlocks = (fn: (blocks: Block[]) => Block[], history = true) => {
    const { blog } = get();
    if (!blog) return;
    if (history) pushHistory();
    set({ blog: { ...blog, blocks: fn(blog.blocks) } });
    scheduleSave();
  };

  return {
    blog: null,
    baseUpdatedAt: null,
    selectedId: null,
    saveState: 'idle',
    saveError: null,
    pane: 'post',
    uploading: 0,
    undoStack: [],
    redoStack: [],

    load: (blog) => {
      cancelTimer();
      set({
        blog,
        baseUpdatedAt: blog.updatedAt,
        selectedId: null,
        saveState: 'idle',
        saveError: null,
        pane: 'post',
        undoStack: [],
        redoStack: [],
      });
    },

    close: () => {
      cancelTimer();
      set({ blog: null, baseUpdatedAt: null, selectedId: null, saveState: 'idle', undoStack: [], redoStack: [] });
    },

    select: (id) => set({ selectedId: id, pane: id ? 'block' : 'post' }),
    setPane: (pane) => set({ pane }),

    patchPost: (patch) => {
      const { blog } = get();
      if (!blog) return;
      set({ blog: { ...blog, ...patch } });
      scheduleSave();
    },

    insertBlock: (block, atIndex) => {
      const { blog } = get();
      if (!blog) return;
      const index = atIndex ?? blog.blocks.length;
      mutateBlocks((blocks) => [...blocks.slice(0, index), block, ...blocks.slice(index)]);
      set({ selectedId: block.id, pane: 'block' });
    },

    // Text edits do NOT push history per keystroke — that would fill the stack
    // with one-character steps and make undo useless. Structural ops do.
    updateBlock: (id, patch) =>
      mutateBlocks((blocks) => blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)), false),

    updatePlacement: (id, patch) =>
      mutateBlocks(
        (blocks) =>
          blocks.map((b) => {
            if (b.id !== id) return b;
            if (b.kind !== 'image' && b.kind !== 'gallery') return b;
            return { ...b, placement: { ...b.placement, ...patch } } as Block;
          }),
        false,
      ),

    moveBlock: (id, delta) => {
      const { blog } = get();
      if (!blog) return;
      const from = blog.blocks.findIndex((b) => b.id === id);
      if (from < 0) return;
      const to = from + delta;
      if (to < 0 || to >= blog.blocks.length) return;
      mutateBlocks((blocks) => {
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      });
    },

    moveBlockTo: (id, index) => {
      const { blog } = get();
      if (!blog) return;
      const from = blog.blocks.findIndex((b) => b.id === id);
      if (from < 0 || from === index) return;
      mutateBlocks((blocks) => {
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        // Removing the item first shifts every later index down by one, so a
        // drop target past the origin has to be corrected or the block lands
        // one slot short of where it was dropped.
        const target = from < index ? index - 1 : index;
        next.splice(Math.max(0, Math.min(next.length, target)), 0, moved!);
        return next;
      });
    },

    duplicate: (id) => {
      const { blog } = get();
      if (!blog) return;
      const index = blog.blocks.findIndex((b) => b.id === id);
      if (index < 0) return;
      const copy = duplicateBlock(blog.blocks[index]!);
      mutateBlocks((blocks) => [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
      set({ selectedId: copy.id });
    },

    removeBlock: (id) => {
      mutateBlocks((blocks) => blocks.filter((b) => b.id !== id));
      if (get().selectedId === id) set({ selectedId: null, pane: 'post' });
    },

    addMedia: async (file) => {
      const { blog } = get();
      if (!blog) return null;
      set({ uploading: get().uploading + 1 });
      try {
        // Images are compressed client-side; anything else uploads as-is.
        const isImage = /^image\//i.test(file.type);
        const result = isImage
          ? await uploadImage(file, { kind: 'blog', maxDim: 2000, quality: 0.82 })
          : await uploadRawFile(file, 'blog');

        // Read intrinsic dimensions so the renderer can reserve space and avoid
        // a layout shift when the image loads.
        let width: number | undefined;
        let height: number | undefined;
        if (isImage) {
          const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = result.url;
          });
          if (dims) {
            width = dims.w;
            height = dims.h;
          }
        }

        const res = await authFetch(`/api/blogs/${blog.id}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: result.url,
            key: result.key,
            kind: isImage ? 'image' : 'file',
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            bytes: file.size,
            width,
            height,
            alt: '',
          }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, 'Could not attach the file'));

        const { media } = (await res.json()) as { media: BlogMedia };
        // The media endpoint bumped updatedAt server-side; adopt it or the next
        // autosave would 409 against a baseline we ourselves invalidated.
        const now = new Date().toISOString();
        set((s) => ({
          blog: s.blog ? { ...s.blog, media: [...s.blog.media, media], updatedAt: now } : s.blog,
          baseUpdatedAt: null,
          uploading: Math.max(0, s.uploading - 1),
        }));
        return media;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not attach the file');
        set((s) => ({ uploading: Math.max(0, s.uploading - 1) }));
        return null;
      }
    },

    patchMedia: (mediaId, patch) => {
      const { blog } = get();
      if (!blog) return;
      set({
        blog: { ...blog, media: blog.media.map((m) => (m.id === mediaId ? { ...m, ...patch } : m)) },
      });
      scheduleSave();
    },

    removeMedia: async (mediaId) => {
      const { blog } = get();
      if (!blog) return;

      const used = blocksUsingMedia(blog.blocks, mediaId);
      if (used.length > 0) {
        const ok = window.confirm(
          `That image is used in ${used.length} place${used.length === 1 ? '' : 's'}. ` +
            'Remove it and delete those blocks?',
        );
        if (!ok) return;
      }

      // Flush pending edits first: the server drops blocks that reference the
      // asset, and it can only do that to blocks it already has.
      if (get().saveState === 'dirty') await get().saveNow();

      try {
        const res = await authFetch(
          `/api/blogs/${blog.id}/media/${encodeURIComponent(mediaId)}?force=true`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error(await errorMessage(res, 'Could not remove the image'));
        // Re-read rather than patching locally: the server also stripped the
        // referencing blocks and any cover/thumbnail/OG slot pointing at it.
        await get().reloadFromServer();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove the image');
      }
    },

    undo: () => {
      const { blog, undoStack, redoStack } = get();
      if (!blog || undoStack.length === 0) return;
      const prev = undoStack[undoStack.length - 1]!;
      set({
        blog: { ...blog, blocks: prev.blocks, media: prev.media },
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, { blocks: blog.blocks, media: blog.media }],
      });
      scheduleSave();
    },

    redo: () => {
      const { blog, undoStack, redoStack } = get();
      if (!blog || redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1]!;
      set({
        blog: { ...blog, blocks: next.blocks, media: next.media },
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, { blocks: blog.blocks, media: blog.media }],
      });
      scheduleSave();
    },

    saveNow: async () => {
      cancelTimer();
      const { blog, baseUpdatedAt, saveState } = get();
      if (!blog || saveState === 'conflict') return false;

      set({ saveState: 'saving', saveError: null });
      try {
        const res = await authFetch(`/api/blogs/${blog.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: blog.title,
            subtitle: blog.subtitle,
            excerpt: blog.excerpt,
            slug: blog.slug,
            author: blog.author,
            category: blog.category,
            tags: blog.tags,
            linkedHorseIds: blog.linkedHorseIds,
            linkedPartyIds: blog.linkedPartyIds,
            blocks: blog.blocks,
            media: blog.media,
            cover: blog.cover ?? null,
            thumbnailMediaId: blog.thumbnailMediaId ?? null,
            seo: blog.seo,
            minTier: blog.minTier,
            // Omitted when null so a media upload (which legitimately moved
            // updatedAt) doesn't trip the check against a baseline we know is stale.
            ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
          }),
        });

        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          set({ saveState: 'conflict', saveError: body.error ?? 'This post changed elsewhere.' });
          return false;
        }
        if (!res.ok) {
          set({ saveState: 'error', saveError: await errorMessage(res, 'Could not save') });
          return false;
        }

        const saved = (await res.json()) as Blog & { droppedBlocks?: number };
        if (saved.droppedBlocks && saved.droppedBlocks > 0) {
          toast.warning(
            `${saved.droppedBlocks} block${saved.droppedBlocks === 1 ? '' : 's'} could not be saved.`,
          );
        }

        // Take the server's derived fields (slug, excerpt, readingTime) but keep
        // the local blocks: the user may have typed while the request was in
        // flight, and overwriting would drop those keystrokes.
        set((s) => ({
          blog: s.blog
            ? {
                ...s.blog,
                slug: saved.slug,
                slugHistory: saved.slugHistory,
                readingTime: saved.readingTime,
                excerpt: s.blog.excerpt || saved.excerpt,
                updatedAt: saved.updatedAt,
              }
            : saved,
          baseUpdatedAt: saved.updatedAt,
          saveState: 'saved',
        }));
        return true;
      } catch (err) {
        set({ saveState: 'error', saveError: err instanceof Error ? err.message : 'Could not save' });
        return false;
      }
    },

    reloadFromServer: async () => {
      const { blog } = get();
      if (!blog) return;
      cancelTimer();
      try {
        const res = await authFetch(`/api/blogs/${blog.id}`);
        if (!res.ok) throw new Error(await errorMessage(res, 'Could not reload'));
        const fresh = (await res.json()) as Blog;
        set({
          blog: fresh,
          baseUpdatedAt: fresh.updatedAt,
          saveState: 'idle',
          saveError: null,
          undoStack: [],
          redoStack: [],
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not reload');
      }
    },
  };
});
