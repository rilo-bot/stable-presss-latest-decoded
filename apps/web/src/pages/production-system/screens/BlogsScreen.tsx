/**
 * Blogs — /production-system/blogs
 *
 * All posts as cards. A post is a visual thing, so a grid of covers tells you
 * what you have far faster than a table of titles does; click one to edit it.
 *
 * The editor and the create form are sibling routes, not panes here — see
 * BlogEditorScreen and BlogCreateForm. All three stay inside the newsroom
 * layout, so the sidebar never disappears.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Loader2, Plus, Search, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useCan } from '@/lib/permissions';
import { useBlogStore, type BlogListFilters } from '@/stores/blogStore';
import type { BlogSummary } from '@/types/blog';

type Tab = 'all' | 'draft' | 'published';

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

function PostCard({ post, onDelete }: { post: BlogSummary; onDelete?: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-sm border border-border/60 bg-card transition-all hover:border-primary/30 hover:shadow-sm">
      <Link to={`/production-system/blogs/${post.id}`} className="block" aria-label={`Edit ${post.title || 'Untitled post'}`}>
        {post.thumbnailUrl ? (
          <div className="aspect-[16/9] overflow-hidden bg-muted/40">
            <img
              src={post.thumbnailUrl}
              alt=""
              crossOrigin="anonymous"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-muted/30">
            <BookOpen size={22} className="text-muted-foreground/30" />
          </div>
        )}

        <div className="p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={cn(
                'rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]',
                post.status === 'published'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {post.status === 'published' ? 'Live' : 'Draft'}
            </span>
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

          <h3 className="mb-1 line-clamp-2 font-[family-name:var(--font-display)] text-sm font-bold leading-snug text-foreground">
            {post.title || 'Untitled post'}
          </h3>
          {post.excerpt && (
            <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{post.excerpt}</p>
          )}
          <p className="truncate text-[10px] text-muted-foreground/70">
            {post.author?.name}
            {post.author?.name ? ' · ' : ''}
            {when(post.updatedAt)}
          </p>
        </div>
      </Link>

      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${post.title || 'Untitled post'}`}
          onClick={onDelete}
          className="absolute right-2 top-2 rounded bg-black/50 p-1.5 text-white/80 opacity-0 transition-opacity hover:bg-destructive/80 hover:text-white group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
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

export default function BlogsScreen() {
  const navigate = useNavigate();
  const { items, total, hasMore, listLoading, listError, fetchList, loadMore, removeBlog } = useBlogStore();
  const canCreate = useCan('blog.create');
  const canDelete = useCan('blog.delete');

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

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
      </div>

      {listError && (
        <div className="mb-4 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {listError}
        </div>
      )}

      {listLoading && items.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDelete={
                  canDelete
                    ? () => {
                        if (window.confirm(`Delete “${post.title || 'Untitled post'}”?`)) {
                          void removeBlog(post.id);
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void loadMore(filters)} disabled={listLoading}>
                {listLoading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
