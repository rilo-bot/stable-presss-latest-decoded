/**
 * Public blog index — /blog
 *
 * Server-paginated, unlike /news, which pulls every article into the browser
 * and filters in JS. Blog documents are far larger, so the list endpoint
 * returns card projections and this page asks for one page at a time.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Clock, Loader2, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useBlogStore, type BlogListFilters } from '@/stores/blogStore';
import type { BlogSummary } from '@/types/blog';

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function BlogCard({ post, featured }: { post: BlogSummary; featured?: boolean }) {
  const date = formatDate(post.publishedAt);

  return (
    <Link
      to={`/blog/${post.slug}`}
      className={cn(
        'group block overflow-hidden rounded-sm border border-border/60 bg-card',
        'transition-all duration-200 hover:border-primary/30 hover:shadow-sm',
      )}
      aria-label={`Read: ${post.title}`}
    >
      {post.thumbnailUrl && (
        <div className={cn('overflow-hidden', featured ? 'aspect-[16/9]' : 'aspect-[3/2]')}>
          <img
            src={post.thumbnailUrl}
            alt={post.thumbnailAlt ?? ''}
            crossOrigin="anonymous"
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className={featured ? 'p-5' : 'p-4'}>
        <div className="mb-2 flex items-center gap-2">
          {post.category && (
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              {post.category}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock size={10} />
            {post.readingTime} min
          </span>
          {post.status === 'draft' && (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Draft
            </span>
          )}
        </div>

        <h3
          className={cn(
            'mb-1.5 font-[family-name:var(--font-display)] font-bold leading-snug text-foreground',
            'transition-opacity duration-140 group-hover:opacity-85',
            featured ? 'text-xl line-clamp-2' : 'text-base line-clamp-2',
          )}
        >
          {post.title}
        </h3>

        {post.excerpt && (
          <p className={cn('mb-3 leading-relaxed text-muted-foreground', featured ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2')}>
            {post.excerpt}
          </p>
        )}

        <hr className="mb-3 border-border/50" />
        <div className="flex items-center justify-between">
          <span className="truncate text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {post.author?.name}
          </span>
          {date && <span className="flex-shrink-0 text-[11px] text-muted-foreground">{date}</span>}
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-sm border border-border/60 bg-card">
      <div className="aspect-[3/2] animate-pulse bg-muted/50" />
      <div className="space-y-2 p-4">
        <div className="h-2 w-20 animate-pulse rounded bg-muted/50" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted/50" />
      </div>
    </div>
  );
}

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagParam = searchParams.get('tag');
  const categoryParam = searchParams.get('category');

  const { items, total, hasMore, listLoading, listError, fetchList, loadMore } = useBlogStore();

  // Local input, committed to the URL on submit — searching on every keystroke
  // would fire a request per character against a paginated endpoint.
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const qParam = searchParams.get('q');

  const filters = useMemo<BlogListFilters>(
    () => ({
      tag: tagParam ?? undefined,
      category: categoryParam ?? undefined,
      q: qParam ?? undefined,
    }),
    [tagParam, categoryParam, qParam],
  );

  useEffect(() => {
    void fetchList(filters, 1);
  }, [fetchList, filters]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) next.set('q', searchInput.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const hasFilters = !!(tagParam || categoryParam || qParam);

  const [lead, ...rest] = items;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
      {/* Masthead */}
      <header className="mb-8">
        <p
          className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'hsl(var(--brand-accent))' }}
        >
          Stable Press
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-foreground md:text-5xl">
          The Blog
        </h1>
        <div className="mt-4 h-px w-20" style={{ background: 'hsl(var(--brand-accent))' }} />
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Longer-form writing from the yard, the ring and the road — diaries, deep dives and the
          stories behind the form line.
        </p>
      </header>

      {/* Search + active filters */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <form onSubmit={submitSearch} className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search posts…"
            aria-label="Search blog posts"
            className={cn(
              'w-full rounded-sm border border-border/60 bg-background py-2 pl-9 pr-3 text-sm',
              'placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none',
            )}
          />
        </form>

        {hasFilters && (
          <div className="flex items-center gap-2">
            {tagParam && <FilterChip label={`#${tagParam}`} />}
            {categoryParam && <FilterChip label={categoryParam} />}
            {qParam && <FilterChip label={`“${qParam}”`} />}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        )}

        {total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {total} post{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Results */}
      {listError && (
        <div className="mb-6 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {listError}
        </div>
      )}

      {listLoading && items.length === 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          heading={hasFilters ? 'Nothing matches that' : 'No posts yet'}
          description={
            hasFilters
              ? 'Try a different search, or clear the filters to see everything.'
              : 'The first post is still being written. Check back shortly.'
          }
          ctaLabel={hasFilters ? 'Clear filters' : undefined}
          onCta={hasFilters ? clearFilters : undefined}
        />
      ) : (
        <>
          {/* The newest post leads at double width, with the next two stacked
              beside it. With nothing to sit alongside, the lead would otherwise
              be a two-thirds card against a third of dead space — so on its own
              it takes a centred single column instead. */}
          {lead && (
            <div className="mb-5 grid gap-5 lg:grid-cols-3">
              <div className={rest.length > 0 ? 'lg:col-span-2' : 'mx-auto w-full max-w-2xl lg:col-span-3'}>
                <BlogCard post={lead} featured />
              </div>
              {rest.slice(0, 2).length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  {rest.slice(0, 2).map((post) => (
                    <BlogCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </div>
          )}

          {rest.length > 2 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.slice(2).map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-10 flex justify-center">
              <Button variant="outline" onClick={() => void loadMore(filters)} disabled={listLoading}>
                {listLoading ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load more posts'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="rounded-sm border border-border/60 bg-muted/40 px-2 py-1 text-xs text-foreground">
      {label}
    </span>
  );
}
