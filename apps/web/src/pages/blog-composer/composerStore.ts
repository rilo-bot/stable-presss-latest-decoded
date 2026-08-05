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
import { useBlogStore } from '@/stores/blogStore';
import { uploadImage, uploadRawFile } from '@/lib/upload';
import type { Block, Blog, BlogMedia, BlogPart, Placement } from '@/types/blog';
import { allBlocks, blocksUsingMedia } from '@/types/blog';
import { duplicateBlock, newBlockId, paragraph } from '@/blog/factories';

const AUTOSAVE_MS = 1500;
/** How many steps of history to keep. Deep enough to undo a bad paste, bounded
 *  so a long session cannot grow without limit. */
const UNDO_LIMIT = 50;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

/**
 * Which block list an edit applies to: the post body (`null`) or one part, by
 * part id.
 *
 * Every id-based operation resolves this itself, so callers editing a block only
 * ever pass the block's id, exactly as before parts existed. Only inserting
 * needs to be told, because a new block has no id to look up yet.
 *
 * `null` and `undefined` are NOT interchangeable here: `null` is the body,
 * `undefined` means "no container holds that block". Read the guards with that in
 * mind — a truthiness test would treat the body as missing.
 */
export type ContainerId = string | null;

interface Snapshot {
  blocks: Block[];
  parts: BlogPart[];
  media: BlogMedia[];
}

interface ComposerState {
  blog: Blog | null;
  /** The `updatedAt` the server last confirmed — the concurrency baseline. */
  baseUpdatedAt: string | null;
  selectedId: string | null;
  /**
   * The non-block input the author has aimed the assistant at — a registry field
   * id like `excerpt` or `part:<id>.title` (see agent/blog/blogFields.ts).
   *
   * It lives HERE, next to the block selection, because the two are ONE
   * selection: whatever "this" means, it means one thing. `select` and
   * `selectField` each clear the other, so the body toolbar and the studio can
   * never disagree about what the author is pointing at.
   */
  selectedFieldId: string | null;
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
  /** Aim the assistant at one input. Clears any block selection — see `selectedFieldId`. */
  selectField: (field: string | null) => void;
  setPane: (pane: 'block' | 'post') => void;

  /** Patch post-level fields (title, slug, tags, cover, seo…). */
  patchPost: (patch: Partial<Blog>) => void;

  /** Insert into the body, or into a part when `container` is a part id. */
  insertBlock: (block: Block, atIndex?: number, container?: ContainerId) => void;
  /**
   * Insert SEVERAL blocks as ONE step.
   *
   * Not a loop over `insertBlock`: that would push an undo step and arm an
   * autosave per block, so undoing an assistant's five-paragraph insertion would
   * take five presses of Ctrl+Z and leave the author in the middle of it.
   */
  insertBlocks: (blocks: Block[], atIndex?: number, container?: ContainerId) => void;
  /** Swap one block for several (or none) — the AI's "rewrite this" in one step. */
  replaceBlockWith: (id: string, blocks: Block[]) => void;
  /** Replace the whole main body in one step (a whole-post AI rewrite). */
  setBodyBlocks: (blocks: Block[]) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  /**
   * Swap a block for a wholly different one, keeping its position.
   *
   * Distinct from `updateBlock`, which MERGES: retyping a heading into a
   * paragraph by merging would leave the old `level`/`text` fields riding along
   * on a block that no longer has them. Replacing is also structural, so unlike
   * a text edit it does push an undo step.
   */
  replaceBlock: (id: string, block: Block) => void;
  updatePlacement: (id: string, patch: Partial<Placement>) => void;
  moveBlock: (id: string, delta: number) => void;
  moveBlockTo: (id: string, index: number) => void;
  duplicate: (id: string) => void;
  removeBlock: (id: string) => void;

  /**
   * Parts — the post's titled sub-sections.
   *
   * `addPart` starts with one empty paragraph so there is something to type into
   * immediately, and returns the new part's id so the caller can put the caret in
   * its title field.
   */
  addPart: (init?: { title?: string; blocks?: Block[] }) => string | null;
  updatePart: (partId: string, patch: { title?: string }) => void;
  /** Replace a part's whole body in one step (the assistant writing a section). */
  setPartBlocks: (partId: string, blocks: Block[]) => void;
  movePart: (partId: string, delta: number) => void;
  removePart: (partId: string) => void;

  addMedia: (file: File) => Promise<BlogMedia | null>;
  /**
   * Take on an asset some OTHER caller registered against this post — the studio
   * sourcing a stock photo through `POST /:id/media/stock`.
   *
   * That endpoint writes to the document and moves `updatedAt`, so without this the
   * composer would hold a pool missing the new photo and a baseline the server has
   * already passed: the next autosave 409s and the author is told someone else
   * edited their post. Clearing `baseUpdatedAt` is the same trick `addMedia` uses.
   */
  adoptExternalMedia: (asset: BlogMedia) => void;
  patchMedia: (mediaId: string, patch: Partial<BlogMedia>) => void;
  removeMedia: (mediaId: string) => Promise<void>;

  undo: () => void;
  redo: () => void;

  saveNow: () => Promise<boolean>;
  /**
   * Take on the server's answer after a write this composer did NOT make through
   * `saveNow` — publishing and unpublishing go through their own endpoint.
   *
   * Those endpoints move `updatedAt`, which is the concurrency baseline. Without
   * adopting it the next autosave sends a baseline the server has already passed
   * and gets a 409, which the UI reports as "someone else saved this post while
   * you were editing" — wrong, and alarming, when they are the only editor.
   *
   * Keeps the LOCAL blocks and media for the same reason `saveNow` does: the
   * author may have typed while the request was in flight.
   */
  adoptServerVersion: (saved: Blog) => void;
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
    // Parts travel in the snapshot too, or undo after "remove part" would restore
    // the body and leave the part gone — a half-undo, which is worse than none.
    const snap: Snapshot = { blocks: blog.blocks, parts: blog.parts ?? [], media: blog.media };
    set({
      undoStack: [...undoStack.slice(-(UNDO_LIMIT - 1)), snap],
      // Any new edit invalidates the redo branch, as in every editor.
      redoStack: [],
    });
  };

  /** Which list holds this block — the body, a part, or nothing at all. */
  const containerOf = (id: string): ContainerId | undefined => {
    const { blog } = get();
    if (!blog) return undefined;
    if (blog.blocks.some((b) => b.id === id)) return null;
    return (blog.parts ?? []).find((p) => p.blocks.some((b) => b.id === id))?.id;
  };

  /** Apply `fn` to one container's block list. */
  const mutateIn = (container: ContainerId, fn: (blocks: Block[]) => Block[], history = true) => {
    const { blog } = get();
    if (!blog) return;
    if (container !== null && !(blog.parts ?? []).some((p) => p.id === container)) return;
    if (history) pushHistory();
    set({
      blog:
        container === null
          ? { ...blog, blocks: fn(blog.blocks) }
          : {
              ...blog,
              parts: (blog.parts ?? []).map((p) => (p.id === container ? { ...p, blocks: fn(p.blocks) } : p)),
            },
    });
    scheduleSave();
  };

  /**
   * Apply `fn` to whichever container holds `id`. This is what keeps every
   * existing call site — the toolbar, the rail, drag-and-drop — working on a
   * block inside a part without knowing parts exist.
   */
  const mutateWhere = (id: string, fn: (blocks: Block[]) => Block[], history = true) => {
    const container = containerOf(id);
    if (container === undefined) return;
    mutateIn(container, fn, history);
  };

  /** The block list `id` lives in, for index arithmetic. */
  const listFor = (id: string): Block[] => {
    const { blog } = get();
    if (!blog) return [];
    const container = containerOf(id);
    if (container === undefined) return [];
    if (container === null) return blog.blocks;
    return (blog.parts ?? []).find((p) => p.id === container)?.blocks ?? [];
  };

  /** Replace the part list wholesale — used by the part-level operations. */
  const setParts = (fn: (parts: BlogPart[]) => BlogPart[], history = true) => {
    const { blog } = get();
    if (!blog) return;
    if (history) pushHistory();
    set({ blog: { ...blog, parts: fn(blog.parts ?? []) } });
    scheduleSave();
  };

  return {
    blog: null,
    baseUpdatedAt: null,
    selectedId: null,
    selectedFieldId: null,
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
        selectedFieldId: null,
        saveState: 'idle',
        saveError: null,
        pane: 'post',
        undoStack: [],
        redoStack: [],
      });
    },

    close: () => {
      cancelTimer();
      set({ blog: null, baseUpdatedAt: null, selectedId: null, selectedFieldId: null, saveState: 'idle', undoStack: [], redoStack: [] });
    },

    select: (id) => set({ selectedId: id, selectedFieldId: null, pane: id ? 'block' : 'post' }),
    selectField: (field) => set({ selectedFieldId: field, selectedId: null, pane: 'post' }),
    setPane: (pane) => set({ pane }),

    patchPost: (patch) => {
      const { blog } = get();
      if (!blog) return;
      set({ blog: { ...blog, ...patch } });
      scheduleSave();
    },

    insertBlock: (block, atIndex, container = null) => {
      const { blog } = get();
      if (!blog) return;
      const list =
        container === null ? blog.blocks : (blog.parts ?? []).find((p) => p.id === container)?.blocks;
      if (!list) return;
      const index = atIndex ?? list.length;
      mutateIn(container, (blocks) => [...blocks.slice(0, index), block, ...blocks.slice(index)]);
      set({ selectedId: block.id, pane: 'block' });
    },

    insertBlocks: (blocks, atIndex, container = null) => {
      const { blog } = get();
      if (!blog || blocks.length === 0) return;
      const list =
        container === null ? blog.blocks : (blog.parts ?? []).find((p) => p.id === container)?.blocks;
      if (!list) return;
      const index = Math.max(0, Math.min(list.length, atIndex ?? list.length));
      mutateIn(container, (current) => [
        ...current.slice(0, index),
        ...blocks,
        ...current.slice(index),
      ]);
      // Select the FIRST of them: that is where the reader's eye goes, and it is
      // what the toolbar should be acting on if the author wants to adjust it.
      set({ selectedId: blocks[0]!.id, pane: 'block' });
    },

    replaceBlockWith: (id, blocks) => {
      const container = containerOf(id);
      if (container === undefined) return;
      mutateIn(container, (current) => {
        const at = current.findIndex((b) => b.id === id);
        if (at < 0) return current;
        return [...current.slice(0, at), ...blocks, ...current.slice(at + 1)];
      });
      set(blocks.length > 0 ? { selectedId: blocks[0]!.id, pane: 'block' } : { selectedId: null, pane: 'post' });
    },

    setBodyBlocks: (blocks) => {
      mutateIn(null, () => blocks);
      set({ selectedId: null, pane: 'post' });
    },

    // Text edits do NOT push history per keystroke — that would fill the stack
    // with one-character steps and make undo useless. Structural ops do.
    updateBlock: (id, patch) =>
      mutateWhere(id, (blocks) => blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)), false),

    replaceBlock: (id, block) =>
      mutateWhere(id, (blocks) => blocks.map((b) => (b.id === id ? block : b))),

    updatePlacement: (id, patch) =>
      mutateWhere(
        id,
        (blocks) =>
          blocks.map((b) => {
            if (b.id !== id) return b;
            if (b.kind !== 'image' && b.kind !== 'gallery') return b;
            return { ...b, placement: { ...b.placement, ...patch } } as Block;
          }),
        false,
      ),

    moveBlock: (id, delta) => {
      // Moves stay INSIDE the container: nudging the last block of a part must
      // not tip it into the next part, which is not what the arrow claims to do.
      const list = listFor(id);
      const from = list.findIndex((b) => b.id === id);
      if (from < 0) return;
      const to = from + delta;
      if (to < 0 || to >= list.length) return;
      mutateWhere(id, (blocks) => {
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      });
    },

    moveBlockTo: (id, index) => {
      const from = listFor(id).findIndex((b) => b.id === id);
      if (from < 0 || from === index) return;
      mutateWhere(id, (blocks) => {
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
      const list = listFor(id);
      const index = list.findIndex((b) => b.id === id);
      if (index < 0) return;
      const copy = duplicateBlock(list[index]!);
      mutateWhere(id, (blocks) => [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
      set({ selectedId: copy.id });
    },

    removeBlock: (id) => {
      mutateWhere(id, (blocks) => blocks.filter((b) => b.id !== id));
      if (get().selectedId === id) set({ selectedId: null, pane: 'post' });
    },

    addPart: (init) => {
      const { blog } = get();
      if (!blog) return null;
      // One empty paragraph by default, so the body is something you can click
      // into rather than an empty box with no caret target. A caller that brings
      // its own blocks (the assistant writing a section) gets those instead.
      const part: BlogPart = {
        id: newBlockId(),
        title: init?.title ?? '',
        blocks: init?.blocks?.length ? init.blocks : [paragraph()],
      };
      setParts((parts) => [...parts, part]);
      return part.id;
    },

    updatePart: (partId, patch) =>
      // A title is text, so no history step per keystroke — same rule as blocks.
      setParts((parts) => parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)), false),

    setPartBlocks: (partId, blocks) =>
      setParts((parts) => parts.map((p) => (p.id === partId ? { ...p, blocks } : p))),

    movePart: (partId, delta) => {
      const parts = get().blog?.parts ?? [];
      const from = parts.findIndex((p) => p.id === partId);
      if (from < 0) return;
      const to = from + delta;
      if (to < 0 || to >= parts.length) return;
      setParts((list) => {
        const next = [...list];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      });
    },

    removePart: (partId) => {
      const part = (get().blog?.parts ?? []).find((p) => p.id === partId);
      setParts((parts) => parts.filter((p) => p.id !== partId));
      // The selection may have been pointing into the part that just went away —
      // leaving it set would keep the toolbar and the rail acting on a block that
      // no longer exists anywhere in the post.
      const selectedId = get().selectedId;
      if (part && selectedId && part.blocks.some((b) => b.id === selectedId)) {
        set({ selectedId: null, pane: 'post' });
      }
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

    adoptExternalMedia: (asset) => {
      const { blog } = get();
      if (!blog) return;
      if (blog.media.some((m) => m.id === asset.id)) return;
      set({
        blog: { ...blog, media: [...blog.media, asset], updatedAt: new Date().toISOString() },
        baseUpdatedAt: null,
      });
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

      // Across the WHOLE post, parts included — counting only the body would
      // under-report the damage and then delete an image out of a part.
      const used = blocksUsingMedia(allBlocks(blog), mediaId);
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
        blog: { ...blog, blocks: prev.blocks, parts: prev.parts, media: prev.media },
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, { blocks: blog.blocks, parts: blog.parts ?? [], media: blog.media }],
      });
      scheduleSave();
    },

    redo: () => {
      const { blog, undoStack, redoStack } = get();
      if (!blog || redoStack.length === 0) return;
      const next = redoStack[redoStack.length - 1]!;
      set({
        blog: { ...blog, blocks: next.blocks, parts: next.parts, media: next.media },
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, { blocks: blog.blocks, parts: blog.parts ?? [], media: blog.media }],
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
            // Always sent, even when empty: this is the one writer that knows the
            // author's intent for the part list, so an omission here would be read
            // by the server as "leave them alone" and a deleted part would come
            // back on the next reload.
            parts: blog.parts ?? [],
            media: blog.media,
            cover: blog.cover ?? null,
            thumbnailMediaId: blog.thumbnailMediaId ?? null,
            seo: blog.seo,
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

        // Keep the list rail in step. Without this the sidebar still reads
        // "Untitled post" while the editor shows the real headline, which looks
        // like the save didn't work.
        useBlogStore.setState((s) => ({
          items: s.items.map((i) =>
            i.id === saved.id
              ? {
                  ...i,
                  title: saved.title,
                  status: saved.status,
                  updatedAt: saved.updatedAt,
                  readingTime: saved.readingTime,
                  excerpt: saved.excerpt,
                }
              : i,
          ),
        }));

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

    adoptServerVersion: (saved) => {
      const { blog, saveState } = get();
      if (!blog || blog.id !== saved.id) return;
      // An unresolved conflict is the one state not to touch — the author still
      // has to choose whose version wins, and moving the baseline underneath
      // that decision would quietly re-arm autosave against their wishes.
      if (saveState === 'conflict') return;
      set({
        blog: {
          ...blog,
          status: saved.status,
          publishedAt: saved.publishedAt,
          publishAt: saved.publishAt,
          slug: saved.slug,
          slugHistory: saved.slugHistory,
          readingTime: saved.readingTime,
          updatedAt: saved.updatedAt,
        },
        baseUpdatedAt: saved.updatedAt,
        saveError: null,
        // Deliberately does NOT cancel a pending autosave: if the author typed
        // during the round-trip those edits are still owed a save, and the timer
        // will now fire against the CORRECT baseline.
        saveState: saveState === 'dirty' ? 'dirty' : 'saved',
      });
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
