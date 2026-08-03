/**
 * The editor — /production-system/blogs/:id
 *
 * Laid out like the rest of the newsroom's editors: a back link, a page header
 * carrying the lifecycle buttons, then a wide left column for the work and a
 * 20rem settings card on the right.
 *
 *   ← All posts
 *   STABLE PRESS                        [Draft] [Saved] [Save] [Publish]
 *   Edit post
 *   ┌──────────────────────────────┐  ┌──────────────┐
 *   │ Title  [                   ] │  │ URL slug     │
 *   │ Body   ┌ B I U | H2 H3 … ─┐  │  │ Excerpt      │
 *   │        │ cover            │  │  │ Cover image  │
 *   │        │ …the post…       │  │  │ Tags, Author │
 *   └──────────────────────────────┘  └──────────────┘
 *
 * The page scrolls, rather than an inner pane with its own scrollbar. Two nested
 * scroll regions meant the browser's Find, Home/End and the scroll wheel all
 * behaved differently depending on where the pointer happened to be.
 *
 * Title and body are the two fields that matter, so they are labelled fields at
 * the top of the column — not chrome to be discovered. Everything else lives in
 * the card on the right, in the order a post actually gets finished.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Check, Eye, ImagePlus, Loader2, Redo2, Undo2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BLOG_GRID_CLASS, spanClass } from '@/blog/placement';
import { useCan } from '@/lib/permissions';
import { mediaById } from '@/types/blog';
import { useBlogStore } from '@/stores/blogStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import { useComposerStore } from './composerStore';
import { BlockCanvas } from './BlockCanvas';
import { BodyToolbar } from './BodyToolbar';
import { InlineText } from './InlineText';
import { ToolsRail } from './ToolsRail';
import { ImagePicker } from './ImagePicker';
import { inputCls } from './controls';
import type { Blog } from '@/types/blog';

function SaveChip() {
  const { saveState, saveError } = useComposerStore();
  const map = {
    idle: { text: '', cls: 'text-muted-foreground/70', icon: null },
    dirty: { text: 'Unsaved', cls: 'text-muted-foreground/70', icon: null },
    saving: { text: 'Saving…', cls: 'text-muted-foreground/70', icon: <Loader2 size={11} className="animate-spin" /> },
    saved: { text: 'Saved', cls: 'text-emerald-600', icon: <Check size={11} /> },
    error: { text: saveError ?? 'Save failed', cls: 'text-destructive', icon: <AlertTriangle size={11} /> },
    conflict: { text: 'Edited elsewhere', cls: 'text-destructive', icon: <AlertTriangle size={11} /> },
  } as const;
  const s = map[saveState];
  if (!s.text) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', s.cls)}>
      {s.icon}
      {s.text}
    </span>
  );
}

/** Offers only the safe action — never a "save anyway" that discards their work. */
function ConflictBanner() {
  const { saveState, saveError, reloadFromServer } = useComposerStore();
  if (saveState !== 'conflict') return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-2.5">
      <AlertTriangle size={14} className="text-destructive" />
      <p className="flex-1 text-xs text-destructive">
        {saveError} Autosave is paused so nothing is overwritten.
      </p>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void reloadFromServer()}>
        Reload theirs
      </Button>
    </div>
  );
}

/** The cover slot at the top of the document, inside the body box. */
function CoverSlot({ onPick }: { onPick: () => void }) {
  const { blog, patchPost } = useComposerStore();
  if (!blog) return null;
  const cover = mediaById(blog, blog.cover?.mediaId);

  if (!cover) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="mb-6 flex w-full flex-col items-center gap-1.5 rounded-sm border border-dashed border-border/60 py-8 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
      >
        <ImagePlus size={20} className="text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">Add a cover image</span>
        <span className="text-[11px] text-muted-foreground/60">Optional — the first thing a reader sees</span>
      </button>
    );
  }

  const focal = blog.cover?.focal;
  return (
    <div className="group/cover relative mb-6 overflow-hidden rounded-sm">
      <img
        src={cover.url}
        alt={cover.alt}
        crossOrigin="anonymous"
        className="aspect-[16/9] w-full object-cover"
        style={focal ? { objectPosition: `${focal[0] * 100}% ${focal[1] * 100}%` } : undefined}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover/cover:opacity-100">
        <button
          type="button"
          onClick={onPick}
          className="rounded-sm bg-white/90 px-2 py-1 text-[11px] font-semibold text-black hover:bg-white"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={() => patchPost({ cover: undefined })}
          className="rounded-sm bg-black/60 px-2 py-1 text-[11px] text-white hover:bg-destructive/80"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function BlogEditorScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const fetchOne = useBlogStore((s) => s.fetchOne);
  const setPublished = useBlogStore((s) => s.setPublished);
  const { blog, load, close, saveState, saveNow, undo, redo, undoStack, redoStack, patchPost, select } =
    useComposerStore();

  const canPublish = useCan('blog.publish');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  /** Bumped to ask the canvas to open its image picker at the end of the body. */
  const [imageRequest, setImageRequest] = useState(0);

  // Records the cross-link blocks and their pickers need.
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const articles = useArticleStore((s) => s.articles);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);

  useEffect(() => {
    void fetchHorses();
    void fetchParties();
    void fetchArticles();
  }, [fetchHorses, fetchParties, fetchArticles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      const fresh = await fetchOne(id);
      if (cancelled) return;
      if (!fresh) setNotFound(true);
      else load(fresh);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      // Flush buffered edits on the way out — the autosave debounce would
      // otherwise drop the last few seconds of typing.
      if (useComposerStore.getState().saveState === 'dirty') void useComposerStore.getState().saveNow();
      close();
    };
  }, [id, fetchOne, load, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Ctrl+Z inside a contentEditable belongs to the browser's text undo;
      // taking it would be a worse trade than not having block undo there.
      const inText =
        document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
      } else if (e.key.toLowerCase() === 'z' && !inText) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, undo, redo]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'conflict') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
          That post could not be opened
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or you may not have permission to edit it.
        </p>
        <Button variant="outline" onClick={() => navigate('/production-system/blogs')}>
          Back to Blogs
        </Button>
      </div>
    );
  }

  const isPublished = blog.status === 'published';
  const refs = {
    horses: horses.map((h) => ({ id: h.id, name: h.name })),
    parties: parties.map((p) => ({ id: p.id, name: p.name })),
    articles: articles.map((a) => ({ id: a.id, name: a.title })),
  };

  const publish = async () => {
    await saveNow();
    if (useComposerStore.getState().saveState === 'conflict') {
      toast.error('Resolve the conflict before publishing.');
      return;
    }
    const done = await setPublished(blog.id, !isPublished);
    if (done) patchPost({ status: isPublished ? 'draft' : 'published' } as Partial<Blog>);
  };

  return (
    <div className="pb-16">
      <Link
        to="/production-system/blogs"
        className="mb-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} />
        All posts
      </Link>

      {/* ── Page header: what this is, and every lifecycle action ── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'hsl(var(--brand-accent))' }}
          >
            Stable Press
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
            Edit post
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveChip />
          <span
            className={cn(
              'rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]',
              isPublished ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
            )}
          >
            {isPublished ? 'Live' : 'Draft'}
          </span>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={undoStack.length === 0}
              onClick={undo}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={redoStack.length === 0}
              onClick={redo}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <Redo2 size={14} />
            </button>
          </div>

          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" asChild>
            <Link to={`/blog/${blog.slug}`} target="_blank" rel="noreferrer">
              <Eye size={13} />
              View
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={saveState === 'saving'}
            onClick={() => void saveNow()}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </Button>
          {canPublish && (
            <Button size="sm" className="h-8 text-xs" variant={isPublished ? 'outline' : 'default'} onClick={() => void publish()}>
              {isPublished ? 'Unpublish' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      <ConflictBanner />

      {/* ── The work, and its settings ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div className="mb-4">
            <label
              htmlFor="blog-title"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Title
            </label>
            {/* A plain input, not a contentEditable heading: a headline is one
                line of text with no formatting, and an input gets Tab order,
                spellcheck and undo for free. */}
            <input
              id="blog-title"
              value={blog.title}
              placeholder="A headline for your post"
              onChange={(e) => patchPost({ title: e.target.value })}
              className={cn(
                inputCls,
                'font-[family-name:var(--font-display)] text-lg font-bold',
              )}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Body
            </p>
            <div className="rounded-sm border border-border/60 bg-background">
              {/* Sticky so the toolbar is still reachable a thousand words down. */}
              <div className="sticky top-0 z-30 bg-background">
                <BodyToolbar onAddImage={() => setImageRequest((n) => n + 1)} />
              </div>

              {/* Clicking the MARGIN deselects, so the toolbar stops claiming a
                  block is selected once you've clicked away from one.
                  `target === currentTarget` is what makes that safe: a block's
                  own click selects it and then bubbles up here, so an
                  unconditional handler would deselect every block the instant it
                  was selected — and the toolbar would never have anything to
                  act on. */}
              <div
                className="px-4 py-5 pl-10"
                onClick={(e) => {
                  if (e.target === e.currentTarget) select(null);
                }}
              >
                {/* Cover and standfirst run through the SAME grid as the body,
                    so every line starts on one left edge. The body's text track
                    is inset from the container, so anything laid out outside the
                    grid would sit a few dozen pixels to its left. */}
                <div className={BLOG_GRID_CLASS}>
                  <div className={spanClass('text')}>
                    <CoverSlot onPick={() => setCoverPickerOpen(true)} />

                    <InlineText
                      plain
                      value={blog.subtitle ?? ''}
                      onChange={(subtitle) => patchPost({ subtitle })}
                      placeholder="Add a standfirst (optional)"
                      ariaLabel="Post standfirst"
                      className="mb-6 text-lg leading-relaxed text-muted-foreground"
                    />
                  </div>
                </div>

                <BlockCanvas
                  horses={refs.horses}
                  parties={refs.parties}
                  articles={refs.articles}
                  imageRequest={imageRequest}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <ToolsRail refs={refs} onPickCover={() => setCoverPickerOpen(true)} />
        </div>
      </div>

      {/* Cover chooser, shared by the slot and the rail. */}
      <ImagePicker
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        onChoose={(media) => patchPost({ cover: { mediaId: media.id, treatment: blog.cover?.treatment ?? 'side' } })}
      />
    </div>
  );
}
