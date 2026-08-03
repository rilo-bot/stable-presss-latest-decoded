/**
 * Public blog index — /blog
 *
 * A list of published posts, newest first. One row each: a small thumbnail, the
 * category and date, the headline, and a couple of lines of the opening.
 *
 * It was a featured-lead-plus-masonry grid, which is a magazine front page, not
 * an index. A reader arriving here wants to see what has been written and pick
 * one — a list does that in one column with no guessing about reading order.
 *
 * Server-paginated, unlike /news, which pulls every article into the browser and
 * filters in JS. Blog documents are far larger, so the list endpoint returns
 * card projections and this page asks for one page at a time.
 *
 * `status: 'published'` is pinned here and never taken from the URL: this is the
 * public page, and staff accounts can otherwise see drafts in list results —
 * which would put unfinished writing on a public index for anyone signed in.
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

function PostRow({ post }: { post: BlogSummary }) {
  const date = formatDate(post.publishedAt);

  return (
    <li>
      <Link
        to={`/blog/${post.slug}`}
        className="group flex gap-4 border-b border-border/50 py-5 transition-colors hover:bg-muted/30 sm:gap-6"
        aria-label={`Read: ${post.title}`}
      >
        {/* Fixed-size thumbnail so every row is the same height and the titles
            line up down the page. Hidden on the narrowest screens, where it
            would take a third of the width from the headline. */}
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            alt={post.thumbnailAlt ?? ''}
            crossOrigin="anonymous"
            loading="lazy"
            className="hidden h-20 w-28 flex-shrink-0 rounded-sm object-cover sm:block"
          />
        ) : (
          <span
            className="hidden h-20 w-28 flex-shrink-0 items-center justify-center rounded-sm bg-muted/40 sm:flex"
            aria-hidden="true"
          >
            <BookOpen size={18} className="text-muted-foreground/30" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {post.category && (
              <span
                className="font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                {post.category}
              </span>
            )}
            {date && <span>{date}</span>}
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              {post.readingTime} min read
            </span>
          </div>

          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold leading-snug text-foreground group-hover:text-primary md:text-xl">
            {post.title}
          </h2>

          {post.excerpt && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
          )}

          {post.author?.name && (
            <p className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
              {post.author.name}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="flex gap-4 border-b border-border/50 py-5 sm:gap-6">
      <div className="hidden h-20 w-28 flex-shrink-0 animate-pulse rounded-sm bg-muted/50 sm:block" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-2 w-24 animate-pulse rounded bg-muted/50" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/50" />
      </div>
    </li>
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
      status: 'published',
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

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };
  const hasFilters = !!(tagParam || categoryParam || qParam);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none text-foreground md:text-4xl">
          The Blog
        </h1>
        <div className="mt-3 h-px w-16" style={{ background: 'hsl(var(--brand-accent))' }} />
      </header>

      {/* Search, plus whatever filter the reader arrived with — tag and category
          links on the posts themselves point back here. */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
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

      {listError && (
        <div className="mb-6 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {listError}
        </div>
      )}

      {listLoading && items.length === 0 ? (
        <ul className="border-t border-border/50">
          {Array.from({ length: 6 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </ul>
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
          <ul className="border-t border-border/50">
            {items.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </ul>

          {hasMore && (
            <div className="mt-8 flex justify-center">
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
