/**
 * Blogs — /production-system/blogs
 *
 * A plain list of posts, one row each: thumbnail, title and URL, status,
 * category, when it was last touched, and the actions for it. Rows beat covers
 * for the thing this screen is actually for — finding a specific post and seeing
 * at a glance what state everything is in.
 *
 * The card grid is still here behind a toggle, because a wall of covers is the
 * better view when you're browsing rather than looking. The choice is per-user
 * and remembered, so nobody has to re-pick it every visit.
 *
 * The editor and the create form are sibling routes, not panes here — see
 * BlogEditorScreen and BlogCreateForm. All three stay inside the newsroom
 * layout, so the sidebar never disappears.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Clock, LayoutGrid, List as ListIcon, Loader2, Plus, Search, Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useCan } from '@/lib/permissions';
import { useBlogStore, type BlogListFilters } from '@/stores/blogStore';
import type { BlogSummary } from '@/types/blog';

type Tab = 'all' | 'draft' | 'published';
type Layout = 'list' | 'cards';

/** Per-user view preference. Rows are the default. */
const LAYOUT_KEY = 'stable-press.blogs-layout';

function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'cards' ? 'cards' : 'list';
  } catch {
    return 'list';
  }
}

function when(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / (60 * 24))}d ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusChip({ status }: { status: BlogSummary['status'] }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]',
        status === 'published' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
      )}
    >
      {status === 'published' ? 'Live' : 'Draft'}
    </span>
  );
}

function Thumb({ post, className }: { post: BlogSummary; className?: string }) {
  if (post.thumbnailUrl) {
    return (
      <img
        src={post.thumbnailUrl}
        alt=""
        crossOrigin="anonymous"
        loading="lazy"
        className={cn('object-cover', className)}
      />
    );
  }
  return (
    <span className={cn('flex items-center justify-center bg-muted/30', className)}>
      <BookOpen size={16} className="text-muted-foreground/30" />
    </span>
  );
}

/* ── Row actions, shared by both layouts so they cannot drift ──────────────── */

function RowActions({
  post,
  canPublish,
  canDelete,
  busy,
  onTogglePublish,
  onDelete,
}: {
  post: BlogSummary;
  canPublish: boolean;
  canDelete: boolean;
  busy: boolean;
  onTogglePublish: () => void;
  onDelete: () => void;
}) {
  const live = post.status === 'published';
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {live && (
        <a
          href={`/blog/${post.slug}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          View
        </a>
      )}
      {canPublish && (
        <button
          type="button"
          disabled={busy}
          onClick={onTogglePublish}
          className="rounded-sm px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted disabled:opacity-50"
        >
          {live ? 'Unpublish' : 'Publish'}
        </button>
      )}
      <Link
        to={`/production-system/blogs/${post.id}`}
        className="rounded-sm px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Edit
      </Link>
      {canDelete && (
        <button
          type="button"
          disabled={busy}
          aria-label={`Delete ${post.title || 'Untitled post'}`}
          onClick={onDelete}
          className="rounded-sm px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function PostCard({ post, actions }: { post: BlogSummary; actions: React.ReactNode }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-sm border border-border/60 bg-card transition-all hover:border-primary/30 hover:shadow-sm">
      <Link
        to={`/production-system/blogs/${post.id}`}
        className="block"
        aria-label={`Edit ${post.title || 'Untitled post'}`}
      >
        <Thumb post={post} className="aspect-[16/9] w-full" />
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <StatusChip status={post.status} />
          {post.category && (
            <span
              className="truncate text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              {post.category}
            </span>
          )}
          <span className="ml-auto flex flex-shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Clock size={9} />
            {post.readingTime}m
          </span>
        </div>

        <Link to={`/production-system/blogs/${post.id}`} className="group/t">
          <h3 className="mb-1 line-clamp-2 font-[family-name:var(--font-display)] text-sm font-bold leading-snug text-foreground group-hover/t:text-primary">
            {post.title || 'Untitled post'}
          </h3>
        </Link>
        {post.excerpt && (
          <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{post.excerpt}</p>
        )}
        <p className="truncate text-[10px] text-muted-foreground/70">
          {post.author?.name}
          {post.author?.name ? ' · ' : ''}
          {when(post.updatedAt)}
        </p>
      </div>

      <div className="border-t border-border/50 px-2 py-1.5">{actions}</div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-sm border border-border/60">
      <div className="aspect-[16/9] animate-pulse bg-muted/50" />
      <div className="space-y-2 p-3">
        <div className="h-2 w-16 animate-pulse rounded bg-muted/50" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/50" />
        <div className="h-2 w-3/5 animate-pulse rounded bg-muted/50" />
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-3 py-3 last:border-b-0">
      <div className="h-10 w-14 flex-shrink-0 animate-pulse rounded-sm bg-muted/50" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/5 animate-pulse rounded bg-muted/50" />
        <div className="h-2 w-1/4 animate-pulse rounded bg-muted/50" />
      </div>
      <div className="h-4 w-12 flex-shrink-0 animate-pulse rounded bg-muted/50" />
    </div>
  );
}

export default function BlogsScreen() {
  const navigate = useNavigate();
  const { items, total, hasMore, listLoading, listError, fetchList, loadMore, removeBlog, setPublished } =
    useBlogStore();
  const canCreate = useCan('blog.create');
  const canDelete = useCan('blog.delete');
  const canPublish = useCan('blog.publish');

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<Layout>(readLayout);
  /** The row mid-request, so its buttons can't be double-fired. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      /* private mode — the choice just won't survive a reload */
    }
  };

  const filters: BlogListFilters = {
    status: tab === 'all' ? undefined : tab,
    q: query || undefined,
    // Staff care about what was touched last, not what went live.
    sort: 'updated',
  };

  useEffect(() => {
    void fetchList(filters, 1);
    // Depend on the parts — the object's identity changes every render.
  }, [fetchList, tab, query]);

  const togglePublish = async (post: BlogSummary) => {
    setBusyId(post.id);
    await setPublished(post.id, post.status !== 'published');
    setBusyId(null);
  };

  const confirmDelete = async (post: BlogSummary) => {
    if (!window.confirm(`Delete “${post.title || 'Untitled post'}”? This cannot be undone.`)) return;
    setBusyId(post.id);
    await removeBlog(post.id);
    setBusyId(null);
  };

  const actionsFor = (post: BlogSummary) => (
    <RowActions
      post={post}
      canPublish={canPublish}
      canDelete={canDelete}
      busy={busyId === post.id}
      onTogglePublish={() => void togglePublish(post)}
      onDelete={() => void confirmDelete(post)}
    />
  );

  return (
    <div className="px-1 py-1">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">Blogs</h1>
          <p className="text-xs text-muted-foreground">
            Long-form posts with their own images and layout.
            {total > 0 && ` ${total} total.`}
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/production-system/blogs/new')}>
            <Plus size={14} />
            New post
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border/50 pb-3">
        <div role="tablist" aria-label="Filter posts" className="flex gap-1">
          {(['all', 'draft', 'published'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-sm px-2.5 py-1.5 text-xs transition-colors',
                tab === t
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t === 'all' ? 'All' : t === 'draft' ? 'Drafts' : 'Published'}
            </button>
          ))}
        </div>

        <form
          className="relative ml-auto w-full sm:w-56"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles…"
            aria-label="Search posts"
            className="w-full rounded-sm border border-border/60 bg-background py-1.5 pl-8 pr-2 text-xs focus:border-primary/40 focus:outline-none"
          />
        </form>

        <div
          role="group"
          aria-label="Choose layout"
          className="flex flex-shrink-0 items-center gap-0.5 rounded-sm border border-border/60 p-0.5"
        >
          <button
            type="button"
            onClick={() => chooseLayout('list')}
            aria-pressed={layout === 'list'}
            aria-label="List view"
            title="List view"
            className={cn(
              'rounded p-1.5 transition-colors',
              layout === 'list'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <ListIcon size={14} />
          </button>
          <button
            type="button"
            onClick={() => chooseLayout('cards')}
            aria-pressed={layout === 'cards'}
            aria-label="Card view"
            title="Card view"
            className={cn(
              'rounded p-1.5 transition-colors',
              layout === 'cards'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {listError && (
        <div className="mb-4 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {listError}
        </div>
      )}

      {listLoading && items.length === 0 ? (
        layout === 'cards' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-sm border border-border/60">
            {Array.from({ length: 6 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          heading={query ? 'Nothing matches' : tab === 'published' ? 'Nothing published yet' : 'No posts yet'}
          description={
            query
              ? 'Try a different search.'
              : 'A blog post is long-form: many images, your own layout, and a byline that can be a pen name.'
          }
          ctaLabel={canCreate && !query ? 'Write the first post' : undefined}
          onCta={canCreate && !query ? () => navigate('/production-system/blogs/new') : undefined}
        />
      ) : (
        <>
          {layout === 'cards' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((post) => (
                <PostCard key={post.id} post={post} actions={actionsFor(post)} />
              ))}
            </div>
          ) : (
            // A real table: rows of the same record, so the header can name the
            // columns once and a screen reader can say which column a cell is in.
            // It scrolls inside its own container rather than widening the page.
            <div className="overflow-x-auto rounded-sm border border-border/60">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Blog posts, most recently edited first</caption>
                <thead>
                  <tr className="border-b border-border/60 text-left">
                    {['Post', 'Status', 'Category', 'Read', 'Updated', ''].map((h, i) => (
                      <th
                        key={h || i}
                        scope="col"
                        className={cn(
                          'px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground',
                          i === 0 && 'pl-4',
                          h === '' && 'pr-4 text-right',
                        )}
                      >
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((post) => (
                    <tr
                      key={post.id}
                      className={cn(
                        'border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/40',
                        busyId === post.id && 'opacity-60',
                      )}
                    >
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <Link
                            to={`/production-system/blogs/${post.id}`}
                            aria-label={`Edit ${post.title || 'Untitled post'}`}
                            className="flex-shrink-0"
                          >
                            <Thumb
                              post={post}
                              className="h-10 w-14 rounded-sm border border-border/60"
                            />
                          </Link>
                          <div className="min-w-0">
                            <Link
                              to={`/production-system/blogs/${post.id}`}
                              className="block truncate font-[family-name:var(--font-display)] font-bold text-foreground hover:text-primary"
                              title={post.title || 'Untitled post'}
                            >
                              {post.title || 'Untitled post'}
                            </Link>
                            <span className="block truncate text-[11px] text-muted-foreground/70">
                              /blog/{post.slug}
                              {post.author?.name ? ` · ${post.author.name}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip status={post.status} />
                      </td>
                      <td className="px-3 py-3">
                        {post.category ? (
                          <span
                            className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: 'hsl(var(--brand-accent))' }}
                          >
                            {post.category}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-muted-foreground">
                        {post.readingTime}m
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-muted-foreground">
                        {when(post.updatedAt)}
                      </td>
                      <td className="py-3 pl-3 pr-4">{actionsFor(post)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void loadMore(filters)} disabled={listLoading}>
                {listLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin" />
                    Loading…
                  </span>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
