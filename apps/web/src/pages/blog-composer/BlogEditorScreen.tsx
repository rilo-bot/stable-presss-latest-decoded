/**
 * The editor — /production-system/blogs/:id
 *
 * Document on the left, tools on the right. It opens on the standard shape of a
 * blog post so nothing has to be assembled from parts: cover image at the top,
 * then the title, then the body.
 *
 * The cover is a real slot in the document rather than a rail-only setting —
 * it's the first thing a reader sees, so it should be the first thing an author
 * sees, and clicking it changes it.
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
import { InlineText } from './InlineText';
import { ToolsRail } from './ToolsRail';
import { ImagePicker } from './ImagePicker';
import type { Blog } from '@/types/blog';

function SaveChip() {
  const { saveState, saveError } = useComposerStore();
  const map = {
    idle: { text: 'Up to date', cls: 'text-muted-foreground/70', icon: null },
    dirty: { text: 'Unsaved', cls: 'text-muted-foreground/70', icon: null },
    saving: { text: 'Saving…', cls: 'text-muted-foreground/70', icon: <Loader2 size={11} className="animate-spin" /> },
    saved: { text: 'Saved', cls: 'text-emerald-600', icon: <Check size={11} /> },
    error: { text: saveError ?? 'Save failed', cls: 'text-destructive', icon: <AlertTriangle size={11} /> },
    conflict: { text: 'Edited elsewhere', cls: 'text-destructive', icon: <AlertTriangle size={11} /> },
  } as const;
  const s = map[saveState];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px]', s.cls)}>
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
    <div className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2">
      <AlertTriangle size={14} className="text-destructive" />
      <p className="flex-1 text-[11px] text-destructive">
        {saveError} Autosave is paused so nothing is overwritten.
      </p>
      <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => void reloadFromServer()}>
        Reload theirs
      </Button>
    </div>
  );
}

/** The cover slot at the top of the document. */
function CoverSlot({ onPick }: { onPick: () => void }) {
  const { blog, patchPost } = useComposerStore();
  if (!blog) return null;
  const cover = mediaById(blog, blog.cover?.mediaId);

  if (!cover) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="mb-6 flex w-full flex-col items-center gap-1.5 rounded-sm border border-dashed border-border/60 py-10 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
      >
        <ImagePlus size={20} className="text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">Add a cover image</span>
        <span className="text-[11px] text-muted-foreground/60">Optional — appears above the headline</span>
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

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-0 flex-col overflow-hidden rounded-sm border border-border/60">
      {/* ── One slim bar ── */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <Link
          to="/production-system/blogs"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={13} />
          All posts
        </Link>
        <span className="h-4 w-px bg-border" />
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]',
            isPublished ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
          )}
        >
          {isPublished ? 'Live' : 'Draft'}
        </span>
        <SaveChip />

        <div className="ml-auto flex items-center gap-0.5">
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
          <span className="mx-1 h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" asChild>
            <Link to={`/blog/${blog.slug}`} target="_blank" rel="noreferrer">
              <Eye size={13} />
              View
            </Link>
          </Button>
          {canPublish && (
            <Button
              size="sm"
              className="h-7 text-xs"
              variant={isPublished ? 'outline' : 'default'}
              onClick={async () => {
                await saveNow();
                if (useComposerStore.getState().saveState === 'conflict') {
                  toast.error('Resolve the conflict before publishing.');
                  return;
                }
                const done = await setPublished(blog.id, !isPublished);
                if (done) patchPost({ status: isPublished ? 'draft' : 'published' } as Partial<Blog>);
              }}
            >
              {isPublished ? 'Unpublish' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      <ConflictBanner />

      {/* ── Document + tools ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="slim-scroll min-w-0 flex-1 overflow-y-auto" onClick={() => select(null)}>
          <div className="px-4 pb-16 pl-10 pt-6">
            {/* Cover, title and standfirst run through the SAME grid as the body,
                so every line starts on one left edge. */}
            <div className={BLOG_GRID_CLASS}>
              <div className={spanClass('text')}>
                <CoverSlot onPick={() => setCoverPickerOpen(true)} />
                <InlineText
                  plain
                  value={blog.title}
                  onChange={(title) => patchPost({ title })}
                  placeholder="Untitled post"
                  ariaLabel="Post title"
                  className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground"
                />
                <InlineText
                  plain
                  value={blog.subtitle ?? ''}
                  onChange={(subtitle) => patchPost({ subtitle })}
                  placeholder="Add a standfirst (optional)"
                  ariaLabel="Post subtitle"
                  className="mb-8 text-lg leading-relaxed text-muted-foreground"
                />
              </div>
            </div>
            <BlockCanvas horses={refs.horses} parties={refs.parties} articles={refs.articles} />
          </div>
        </div>

        {/* Tools — always there, so there is one place to look. */}
        <aside className="hidden w-72 flex-shrink-0 border-l border-border/60 lg:block">
          <ToolsRail refs={refs} onPickCover={() => setCoverPickerOpen(true)} />
        </aside>
      </div>

      {/* Cover chooser, shared by the slot and the rail. */}
      <ImagePicker
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        onChoose={(media) => patchPost({ cover: { mediaId: media.id, treatment: 'hero-full' } })}
      />
    </div>
  );
}
