/**
 * Blogs management — /production-system/blogs
 *
 * A filterable list (Drafts / Published / All), not a kanban board. Blogs have
 * two states, so five workflow columns have nothing to show; the board is keyed
 * to the article stages and blogs deliberately do not use them. See
 * docs/BLOG-SYSTEM-PLAN.md §3.5.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Loader2, Plus, Search, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useCan } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useBlogStore, type BlogListFilters } from '@/stores/blogStore';

type Tab = 'all' | 'draft' | 'published';

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BlogsScreen() {
  const navigate = useNavigate();
  const { items, total, hasMore, listLoading, listError, fetchList, loadMore, createBlog, removeBlog } =
    useBlogStore();

  const canCreate = useCan('blog.create');
  const canDelete = useCan('blog.delete');
  const displayName = useAuthStore((s) => s.currentUser?.displayName);

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filters: BlogListFilters = {
    status: tab === 'all' ? undefined : tab,
    q: query || undefined,
    // Staff care about what was touched most recently, not what went live.
    sort: 'updated',
  };

  useEffect(() => {
    void fetchList(filters, 1);
    // The object identity changes every render, so depend on its parts.
  }, [fetchList, tab, query]);

  const startNew = async () => {
    setCreating(true);
    const created = await createBlog({
      title: 'Untitled post',
      author: { name: displayName ?? 'Staff' },
      blocks: [],
      media: [],
      tags: [],
    });
    setCreating(false);
    if (created) navigate(`/production-system/blogs/${created.id}`);
  };

  return (
    <div className="px-1 py-1">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">Blogs</h1>
          <p className="text-xs text-muted-foreground">
            Long-form posts with their own images and layout.
            {total > 0 && ` ${total} total.`}
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="gap-1.5" onClick={() => void startNew()} disabled={creating}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New post
          </Button>
        )}
      </div>

      {/* Tabs + search */}
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border/50 pb-3">
        <div role="tablist" aria-label="Filter posts" className="flex gap-1">
          {(['all', 'draft', 'published'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-sm px-2.5 py-1.5 text-xs capitalize transition-colors',
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
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
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

      {/* List */}
      {listLoading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
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
          onCta={canCreate && !query ? () => void startNew() : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-sm border border-border/60">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="hidden px-3 py-2 font-semibold sm:table-cell">Author</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((post) => (
                <tr key={post.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/production-system/blogs/${post.id}`}
                      className="group flex items-center gap-2.5"
                    >
                      {post.thumbnailUrl ? (
                        <img
                          src={post.thumbnailUrl}
                          alt=""
                          crossOrigin="anonymous"
                          className="h-9 w-12 flex-shrink-0 rounded-sm object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-12 flex-shrink-0 items-center justify-center rounded-sm bg-muted/50 text-muted-foreground/40">
                          <BookOpen size={13} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground group-hover:underline">
                          {post.title || 'Untitled post'}
                        </span>
                        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {post.category && <span>{post.category}</span>}
                          <span className="inline-flex items-center gap-1">
                            <Clock size={9} />
                            {post.readingTime} min
                          </span>
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                    {post.author?.name}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                        post.status === 'published'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {post.status === 'published' ? 'Live' : 'Draft'}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                    {formatWhen(post.updatedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete ${post.title}`}
                        onClick={() => {
                          if (window.confirm(`Delete “${post.title || 'Untitled post'}”?`)) {
                            void removeBlog(post.id);
                          }
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border/50 p-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => void loadMore(filters)} disabled={listLoading}>
                {listLoading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
