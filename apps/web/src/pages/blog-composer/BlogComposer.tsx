/**
 * The blog composer — /production-system/blogs/:id
 *
 * Full-screen, outside the production-system layout, matching how the magazine
 * editors sit outside it: the sidebar's navigation is noise when you are writing,
 * and the canvas needs the width.
 *
 * Three columns — media tray, canvas, inspector. The canvas renders through the
 * same `BlogRenderer` the public page uses, so placement is never previewed
 * through a second implementation that could disagree with it.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Check, Eye, Loader2, Redo2, Save, Settings2,
  SlidersHorizontal, Undo2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/permissions';
import { useBlogStore } from '@/stores/blogStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import { useComposerStore } from './composerStore';
import { BlockCanvas } from './BlockCanvas';
import { BlockInspector } from './BlockInspector';
import { MediaTray } from './MediaTray';
import { SettingsPanel } from './SettingsPanel';
import { InlineText } from './InlineText';

/** Save-state chip. The one place that says whether work is safe. */
function SaveIndicator() {
  const { saveState, saveError } = useComposerStore();

  const map = {
    idle: { text: 'Up to date', cls: 'text-muted-foreground', icon: null },
    dirty: { text: 'Unsaved changes', cls: 'text-muted-foreground', icon: null },
    saving: { text: 'Saving…', cls: 'text-muted-foreground', icon: <Loader2 size={12} className="animate-spin" /> },
    saved: { text: 'Saved', cls: 'text-emerald-600', icon: <Check size={12} /> },
    error: { text: saveError ?? 'Save failed', cls: 'text-destructive', icon: <AlertTriangle size={12} /> },
    conflict: { text: 'Edited elsewhere', cls: 'text-destructive', icon: <AlertTriangle size={12} /> },
  } as const;

  const s = map[saveState];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', s.cls)}>
      {s.icon}
      {s.text}
    </span>
  );
}

/**
 * Conflict banner. Deliberately blocks further autosaving and offers only one
 * safe action — reload — rather than a "save anyway" that would discard the
 * other person's work without showing it.
 */
function ConflictBanner() {
  const { saveState, saveError, reloadFromServer } = useComposerStore();
  if (saveState !== 'conflict') return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2.5">
      <AlertTriangle size={15} className="text-destructive" />
      <p className="flex-1 text-xs text-destructive">
        {saveError} Autosave is paused so nothing is overwritten.
      </p>
      <Button size="sm" variant="outline" onClick={() => void reloadFromServer()}>
        Reload their version
      </Button>
    </div>
  );
}

export default function BlogComposer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { blog, load, close, pane, setPane, saveState, saveNow, undo, redo, undoStack, redoStack, patchPost } =
    useComposerStore();
  const { fetchOne } = useBlogStore();
  const setPublished = useBlogStore((s) => s.setPublished);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // A hook, so it has to sit above the loading/not-found early returns.
  const canPublish = useCan('blog.publish');

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
      close();
    };
  }, [id, fetchOne, load, close]);

  // Ctrl/Cmd+S saves, Ctrl/Cmd+Z / Shift+Z undo & redo. Skipped while a
  // contentEditable has focus for undo, so the browser's own text undo still
  // works inside a paragraph — losing that would be a worse trade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const inText =
        document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable;

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
        return;
      }
      if (e.key.toLowerCase() === 'z' && !inText) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, undo, redo]);

  // Warn on close with unsaved work. A debounced autosave means there is always
  // a window where a reflex Cmd+W would lose the last few seconds of typing.
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link
            to="/production-system/blogs"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Blogs
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

          <SaveIndicator />

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={undoStack.length === 0}
              onClick={undo}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={redoStack.length === 0}
              onClick={redo}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <Redo2 size={15} />
            </button>

            <span className="mx-1 h-4 w-px bg-border" />

            <Button size="sm" variant="ghost" className="gap-1.5" asChild>
              <Link to={`/blog/${blog.slug}`} target="_blank" rel="noreferrer">
                <Eye size={14} />
                Preview
              </Link>
            </Button>

            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void saveNow()}>
              <Save size={14} />
              Save
            </Button>

            {canPublish && (
              <Button
                size="sm"
                className={cn('gap-1.5', !isPublished && 'bg-primary text-primary-foreground hover:bg-primary/90')}
                variant={isPublished ? 'outline' : 'default'}
                onClick={async () => {
                  // Flush first — publishing a post whose last edits are still
                  // in the debounce window would put a stale version live.
                  const ok = await saveNow();
                  if (!ok && useComposerStore.getState().saveState !== 'saved') {
                    toast.error('Save the post before publishing.');
                    return;
                  }
                  const done = await setPublished(blog.id, !isPublished);
                  if (done) patchPost({ status: isPublished ? 'draft' : 'published' });
                }}
              >
                {isPublished ? 'Unpublish' : 'Publish'}
              </Button>
            )}
          </div>
        </div>

        {/* Title, edited in place at the top of the page rather than in a panel. */}
        <div className="border-t border-border/50 px-4 py-3">
          <InlineText
            plain
            value={blog.title}
            onChange={(title) => patchPost({ title })}
            placeholder="Untitled post"
            ariaLabel="Post title"
            className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground"
          />
        </div>
      </header>

      <ConflictBanner />

      {/* ── Three columns ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Media tray */}
        <aside className="hidden w-60 flex-shrink-0 border-r border-border/60 lg:block">
          <div className="sticky top-[8.5rem] h-[calc(100vh-8.5rem)]">
            <MediaTray />
          </div>
        </aside>

        {/* Canvas */}
        <main className="slim-scroll min-w-0 flex-1 overflow-y-auto">
          {/* Left padding leaves room for the per-block gutter controls, which
              sit outside the block at -left-11. */}
          <div className="py-8 pl-14 pr-4">
            <BlockCanvas />
          </div>
        </main>

        {/* Inspector / settings */}
        <aside className="hidden w-72 flex-shrink-0 border-l border-border/60 xl:block">
          <div className="sticky top-[8.5rem] flex h-[calc(100vh-8.5rem)] flex-col">
            <div className="flex border-b border-border/50">
              <button
                type="button"
                onClick={() => setPane('block')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs transition-colors',
                  pane === 'block'
                    ? 'border-b-2 border-primary font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <SlidersHorizontal size={13} />
                Block
              </button>
              <button
                type="button"
                onClick={() => setPane('post')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs transition-colors',
                  pane === 'post'
                    ? 'border-b-2 border-primary font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Settings2 size={13} />
                Post
              </button>
            </div>
            <div className="slim-scroll flex-1 overflow-y-auto">
              {pane === 'block' ? (
                <BlockInspector
                  horses={horses.map((h) => ({ id: h.id, name: h.name }))}
                  parties={parties.map((p) => ({ id: p.id, name: p.name }))}
                  articles={articles.map((a) => ({ id: a.id, name: a.title }))}
                />
              ) : (
                <SettingsPanel />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
