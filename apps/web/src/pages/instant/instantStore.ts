/**
 * Instant — one capture session.
 *
 * Holds the capture (mode, topic, photos, voice transcript), the draft the agent
 * wrote, and the user's edits to it. Nothing here is persisted until `save()`,
 * which posts through the ORDINARY create endpoints — `POST /api/articles` and
 * `POST /api/blogs` — so the workflow gate and the block validator both run. This
 * module deliberately has no save path of its own.
 *
 * The pipeline in `generate()`:
 *   1. every new photo is uploaded AND analysed (two at a time)
 *   2. the notes, the topic and the transcript go to /api/agent/instant/draft
 *   3. the draft populates the review fields and the per-photo captions
 *
 * A photo whose analysis fails is KEPT, marked `failed`, and excluded from the
 * draft — one unreadable photo costs that photo, not the session.
 */
import { create } from 'zustand';
import { toast } from 'sonner';

import { uploadImage } from '@/lib/upload';
import { useArticleStore } from '@/stores/articleStore';
import { useAuthStore } from '@/stores/authStore';
import { useBlogStore } from '@/stores/blogStore';

import { MAX_PHOTOS, describePhoto, requestDraft } from './instantClient';
import { blogPlainText, buildBlogPayload, readingTimeFor } from './buildBlocks';
import type { BlogFields, CapturedPhoto, InstantMode, InstantStep, StoryFields } from './types';
import { isUsable } from './types';

/**
 * Photos are processed two at a time. The document-ingest path learned this the
 * hard way: firing several large images at the vision provider at once makes them
 * queue, so each call's wall-clock blows past its own timeout and the whole wave
 * aborts. Fewer-but-completing beats more-but-aborted.
 */
const PHOTO_CONCURRENCY = 2;

const EMPTY_STORY: StoryFields = { title: '', body: '', category: '', tags: [] };
const EMPTY_BLOG: BlogFields = { title: '', subtitle: '', excerpt: '', body: [], tags: [] };

interface SavedRef {
  kind: InstantMode;
  id: string;
  title: string;
}

interface InstantState {
  mode: InstantMode;
  topic: string;
  transcript: string;
  photos: CapturedPhoto[];
  coverPhotoId: string | null;

  step: InstantStep;
  /** What the pipeline is doing right now, for the working state. */
  progress: string;
  error: string | null;
  /** The agent's own admission that the piece needs facts it wasn't given. */
  needsFacts: boolean;
  saving: boolean;
  saved: SavedRef | null;

  story: StoryFields;
  blog: BlogFields;

  setMode: (mode: InstantMode) => void;
  setTopic: (topic: string) => void;
  setTranscript: (transcript: string) => void;
  addPhotos: (files: File[]) => void;
  removePhoto: (id: string) => void;
  setCover: (id: string) => void;
  setCaption: (id: string, caption: string) => void;

  patchStory: (patch: Partial<StoryFields>) => void;
  patchBlog: (patch: Partial<BlogFields>) => void;

  /** Can Generate draft run at all? */
  canGenerate: () => boolean;
  generate: () => Promise<void>;
  backToCapture: () => void;
  save: () => Promise<void>;
  reset: () => void;
}

/** Run `fn` over items with a bounded concurrency. `fn` must not throw. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
}

/** Read an image's natural dimensions from its object URL. Never throws. */
function readDimensions(url: string): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = url;
  });
}

export const useInstantStore = create<InstantState>()((set, get) => ({
  mode: 'story',
  topic: '',
  transcript: '',
  photos: [],
  coverPhotoId: null,

  step: 'capture',
  progress: '',
  error: null,
  needsFacts: false,
  saving: false,
  saved: null,

  story: EMPTY_STORY,
  blog: EMPTY_BLOG,

  setMode: (mode) => set({ mode }),
  setTopic: (topic) => set({ topic }),
  setTranscript: (transcript) => set({ transcript }),

  addPhotos: (files) => {
    const existing = get().photos;
    const room = MAX_PHOTOS - existing.length;
    if (room <= 0) {
      toast.error(`Instant works with up to ${MAX_PHOTOS} photos at a time.`);
      return;
    }
    const accepted = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (accepted.length < files.length) {
      const rejected = files.length - accepted.length;
      toast.error(
        room < files.length
          ? `Only the first ${accepted.length} photo${accepted.length === 1 ? '' : 's'} were added — ${MAX_PHOTOS} is the limit.`
          : `${rejected} file${rejected === 1 ? '' : 's'} skipped — photos only.`,
      );
    }

    const added: CapturedPhoto[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      caption: '',
      state: 'pending',
    }));
    set({
      photos: [...existing, ...added],
      coverPhotoId: get().coverPhotoId ?? added[0]?.id ?? null,
    });

    // Dimensions are only for the cover crop; fetch them in the background.
    added.forEach((photo) => {
      void readDimensions(photo.previewUrl).then((dims) => {
        if (!dims.width) return;
        set((s) => ({
          photos: s.photos.map((p) => (p.id === photo.id ? { ...p, ...dims } : p)),
        }));
      });
    });
  },

  removePhoto: (id) => {
    const photo = get().photos.find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    const photos = get().photos.filter((p) => p.id !== id);
    set({
      photos,
      coverPhotoId: get().coverPhotoId === id ? (photos.find(isUsable)?.id ?? photos[0]?.id ?? null) : get().coverPhotoId,
    });
  },

  setCover: (id) => set({ coverPhotoId: id }),

  setCaption: (id, caption) =>
    set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, caption } : p)) })),

  patchStory: (patch) => set((s) => ({ story: { ...s.story, ...patch } })),
  patchBlog: (patch) => set((s) => ({ blog: { ...s.blog, ...patch } })),

  canGenerate: () => {
    const { topic, transcript, photos } = get();
    return !!topic.trim() || !!transcript.trim() || photos.length > 0;
  },

  generate: async () => {
    if (!get().canGenerate()) return;
    set({ step: 'working', error: null, progress: 'Getting your capture ready…' });

    // ── 1. Upload + analyse every photo that hasn't been done yet.
    const todo = get().photos.filter((p) => p.state === 'pending' || p.state === 'failed');
    const total = get().photos.length;

    if (todo.length > 0) {
      let done = 0;
      set({ progress: total === 1 ? 'Reading your photo…' : `Reading your photos… (0 of ${todo.length})` });

      await mapLimit(todo, PHOTO_CONCURRENCY, async (photo) => {
        set((s) => ({ photos: s.photos.map((p) => (p.id === photo.id ? { ...p, state: 'working', error: undefined } : p)) }));

        const index = get().photos.findIndex((p) => p.id === photo.id);
        // Store and analyse concurrently — neither needs the other's result.
        const [stored, note] = await Promise.all([
          photo.url
            ? Promise.resolve({ url: photo.url, key: photo.key })
            : uploadImage(photo.file, { kind: 'media', maxDim: 1600, quality: 0.8 })
                .then((r) => ({ url: r.url, key: r.key }))
                .catch((e: unknown) => {
                  console.warn('[instant] upload failed:', e);
                  return null;
                }),
          describePhoto(photo.file, Math.max(0, index), total).catch((e: unknown) => {
            console.warn('[instant] vision failed:', e);
            return e instanceof Error ? e : new Error("I couldn't read that photo.");
          }),
        ]);

        done += 1;
        set((s) => ({
          progress: total === 1 ? 'Reading your photo…' : `Reading your photos… (${done} of ${todo.length})`,
          photos: s.photos.map((p) => {
            if (p.id !== photo.id) return p;
            if (note instanceof Error) {
              return { ...p, state: 'failed', error: note.message, url: stored?.url, key: stored?.key };
            }
            if (!stored) {
              return { ...p, state: 'failed', error: "That photo couldn't be stored — please try again.", note };
            }
            return { ...p, state: 'ready', note, url: stored.url, key: stored.key, error: undefined };
          }),
        }));
      });
    }

    const photos = get().photos;
    const notes = photos.filter(isUsable).map((p) => p.note!).filter(Boolean);
    const failed = photos.filter((p) => p.state === 'failed');

    // Everything the user gave us failed, and there is no other source.
    if (notes.length === 0 && !get().topic.trim() && !get().transcript.trim()) {
      set({
        step: 'capture',
        progress: '',
        error:
          failed.length > 0
            ? `${failed[0]!.error ?? "I couldn't read those photos."} Add a topic or a voice note, or try a different photo.`
            : 'Add a topic, a photo, or a voice note first.',
      });
      return;
    }

    // ── 2. Write the draft.
    set({ progress: 'Writing the draft…' });
    try {
      const result = await requestDraft({
        mode: get().mode,
        topic: get().topic.trim(),
        transcript: get().transcript.trim(),
        imageNotes: notes,
      });

      // ── 3. Captions come back in the order the notes went out.
      const usableIds = photos.filter(isUsable).map((p) => p.id);
      set((s) => ({
        photos: s.photos.map((p) => {
          const at = usableIds.indexOf(p.id);
          const caption = at >= 0 ? (result.captions[at] ?? '') : '';
          return caption && !p.caption ? { ...p, caption } : p;
        }),
      }));

      if (result.mode === 'blog') {
        set({ blog: result.fields, needsFacts: result.needsFacts });
      } else {
        set({ story: result.fields, needsFacts: result.needsFacts });
      }
      set({ step: 'review', progress: '', error: null });

      if (failed.length > 0) {
        toast.warning(
          `${failed.length} photo${failed.length === 1 ? '' : 's'} couldn't be read, so ${failed.length === 1 ? 'it wasn' : 'they weren'}'t used in the draft.`,
        );
      }
    } catch (err) {
      set({
        step: 'capture',
        progress: '',
        error: err instanceof Error ? err.message : "I couldn't write that draft — please try again.",
      });
    }
  },

  backToCapture: () => set({ step: 'capture', error: null, progress: '' }),

  save: async () => {
    const { mode, story, blog, photos, coverPhotoId } = get();
    const author = useAuthStore.getState().currentUser?.name ?? '';

    if (mode === 'story') {
      if (!story.title.trim() || !story.body.trim()) {
        toast.error('A story needs a title and a body before it can be saved.');
        return;
      }
    } else if (!blog.title.trim() || blog.body.length === 0) {
      toast.error('A post needs a title and some copy before it can be saved.');
      return;
    }

    set({ saving: true });
    try {
      const usable = photos.filter(isUsable);
      const cover = usable.find((p) => p.id === coverPhotoId) ?? usable[0];

      if (mode === 'story') {
        const created = await useArticleStore.getState().addArticle({
          title: story.title.trim(),
          // An article's `summary` IS its body — see ArticleDetail, which splits
          // this one field into paragraphs. There is no separate body column.
          summary: story.body.trim(),
          author,
          status: 'draft',
          publishedAt: null,
          linkedHorseIds: [],
          ...(story.category ? { category: story.category } : {}),
          ...(story.tags.length ? { tags: story.tags } : {}),
          ...(cover?.url ? { imageUrl: cover.url } : {}),
          readingTime: readingTimeFor(story.body),
        });
        if (!created) return; // the store has already surfaced the reason
        set({ step: 'saved', saved: { kind: 'story', id: created.id, title: created.title } });
        toast.success('Draft story saved.');
        return;
      }

      const payload = buildBlogPayload(blog, photos, coverPhotoId);
      const created = await useBlogStore.getState().createBlog({
        title: blog.title.trim(),
        ...(blog.subtitle.trim() ? { subtitle: blog.subtitle.trim() } : {}),
        excerpt: blog.excerpt.trim(),
        tags: blog.tags,
        status: 'draft',
        blocks: payload.blocks,
        media: payload.media,
        ...(payload.cover ? { cover: payload.cover } : {}),
      });
      if (!created) return;
      set({ step: 'saved', saved: { kind: 'blog', id: created.id, title: created.title } });
      toast.success('Draft post saved.');
    } finally {
      set({ saving: false });
    }
  },

  reset: () => {
    get().photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    set({
      mode: get().mode, // the user's choice of output survives "capture another"
      topic: '',
      transcript: '',
      photos: [],
      coverPhotoId: null,
      step: 'capture',
      progress: '',
      error: null,
      needsFacts: false,
      saving: false,
      saved: null,
      story: EMPTY_STORY,
      blog: EMPTY_BLOG,
    });
  },
}));

/** Plain text of whichever draft is active — for the ✨ helpers' context. */
export function activeDraftText(state: Pick<InstantState, 'mode' | 'story' | 'blog'>): string {
  return state.mode === 'story' ? state.story.body : blogPlainText(state.blog);
}
