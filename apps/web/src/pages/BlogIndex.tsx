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
 * The CHROME around that list is the shared public-page chrome: the green header
 * band with a breadcrumb, a display heading, a standfirst and the search box on
 * the right, exactly as /news, /newsletter and /bulletins wear it. This page used
 * to be a bare `max-w-3xl` column with a plain heading, so it read as a different
 * website from every other public page.
 *
 * The band spans the full page width like the others; the LIST inside it does
 * not. Rows at 1280px put sixty words on a line and leave the thumbnail marooned
 * from its headline, so the list keeps a readable measure and the band does the
 * job of making the page look like it belongs.
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
import { BookOpen, ChevronRight, Clock, Loader2, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { usePageMeta } from '@/lib/usePageMeta';
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

/**
 * An active filter, with its own dismiss button.
 *
 * These used to be inert labels beside one "Clear" that dropped everything, so a
 * reader who had narrowed to a tag AND a search had no way to let go of just one.
 */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border/60 bg-muted/40 py-1 pl-2 pr-1 text-xs text-foreground">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={11} />
      </button>
    </span>
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

  usePageMeta({
    title: 'The Blog',
    description:
      'Longform writing from the Stable Press desk — bloodstock analysis, paddock notes and opinion from the thoroughbred racing world.',
  });

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) next.set('q', searchInput.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  /** Drop one filter, leaving the others alone. */
  const dropParam = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    if (key === 'q') setSearchInput('');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };
  const hasFilters = !!(tagParam || categoryParam || qParam);

  // `fetchList` empties the store before it asks, so an in-flight first page is
  // simply an empty list — no stale rows from the newsroom screen to screen out
  // here. See the comment on `fetchList` in stores/blogStore.ts.
  const showSkeleton = listLoading && items.length === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Page header band, shared with /news, /newsletter and /bulletins ── */}
      <div className="border-b border-primary/80 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary-foreground/50"
          >
            <Link to="/" className="transition-colors hover:text-primary-foreground/80">
              Home
            </Link>
            <ChevronRight size={10} aria-hidden="true" />
            <span className="text-primary-foreground/80">The Blog</span>
          </nav>

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-primary-foreground md:text-4xl">
                The Blog
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-primary-foreground/65">
                Longform writing from the Stable Press desk — bloodstock analysis, paddock notes and
                opinion, at whatever length the subject deserves.
              </p>
            </div>

            <form onSubmit={submitSearch} className="relative flex-shrink-0 md:w-72">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-foreground/40"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search posts…"
                aria-label="Search blog posts"
                className={cn(
                  'w-full rounded-sm border border-primary-foreground/20 bg-primary-foreground/10 py-2 pl-8 pr-3 text-xs',
                  'text-primary-foreground placeholder:text-primary-foreground/40',
                  'focus:outline-none focus:ring-1 focus:ring-primary-foreground/30',
                )}
              />
            </form>
          </div>
        </div>
      </div>

      {/* ── The list ── */}
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Count + active filters, in the rule-and-label form /news uses for
              its own result count. */}
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {total} {total === 1 ? 'post' : 'posts'}
            </span>
            <div className="h-px flex-1 bg-border/40" />
            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2">
                {tagParam && <FilterChip label={`#${tagParam}`} onRemove={() => dropParam('tag')} />}
                {categoryParam && (
                  <FilterChip label={categoryParam} onRemove={() => dropParam('category')} />
                )}
                {qParam && <FilterChip label={`“${qParam}”`} onRemove={() => dropParam('q')} />}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {listError && (
            <div className="mb-6 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {listError}
            </div>
          )}

          {showSkeleton ? (
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

              {/* Announced, because "Load more" appends rows BELOW the button and
                  leaves focus on it — without this a screen-reader user gets no
                  signal that anything happened. */}
              <p aria-live="polite" className="sr-only">
                {listLoading ? 'Loading more posts' : `Showing ${items.length} of ${total} posts`}
              </p>

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
      </div>
    </div>
  );
}
