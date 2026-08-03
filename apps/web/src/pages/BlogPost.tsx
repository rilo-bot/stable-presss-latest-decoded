/**
 * Public blog post — /blog/:slug
 *
 * The body renders through `BlogRenderer`, the same component the composer will
 * use, so placement behaves identically in both. Everything this page adds is
 * chrome around that: cover treatment, byline, tags, and the paywall.
 */
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BlogRenderer } from '@/blog/BlogRenderer';
import { Paywall } from '@/components/Paywall';
import { EmptyState } from '@/components/EmptyState';
import { useBlogStore } from '@/stores/blogStore';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import { canViewContent } from '@/rbac/entitlement';
import { mediaById } from '@/types/blog';
import { BookOpen } from 'lucide-react';

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { current, currentLoading, currentError, movedTo, fetchOne, clearCurrent } = useBlogStore();
  const tier = useAuthStore((s) => s.currentUser?.subscriptionTier);

  // The cross-link blocks (horseCard / partyCard / articleRef) read from these
  // stores. Kick the fetches here rather than inside each card, so N cards on a
  // page cause one load apiece, not N.
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);

  useEffect(() => {
    if (slug) void fetchOne(slug);
    return () => clearCurrent();
  }, [slug, fetchOne, clearCurrent]);

  useEffect(() => {
    if (!current) return;
    if (current.blocks.some((b) => b.kind === 'horseCard')) void fetchHorses();
    if (current.blocks.some((b) => b.kind === 'partyCard')) void fetchParties();
    if (current.blocks.some((b) => b.kind === 'articleRef')) void fetchArticles();
  }, [current, fetchHorses, fetchParties, fetchArticles]);

  // A retired slug — the server told us where the post lives now. Replace so the
  // dead URL doesn't sit in the history stack.
  if (movedTo) return <Navigate to={`/blog/${movedTo}`} replace />;

  if (currentLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (currentError === 'notfound' || !current) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={BookOpen}
          heading="That post isn't here"
          description="It may have been unpublished, or the link may be wrong."
          ctaLabel="Back to the blog"
          ctaHref="/blog"
        />
      </div>
    );
  }

  const cover = mediaById(current, current.cover?.mediaId);
  const treatment = current.cover?.treatment ?? 'none';
  const showHero = !!cover && treatment !== 'none';
  const date = formatDate(current.publishedAt);
  const locked = !canViewContent(tier, current.minTier);

  const coverFocal = current.cover?.focal;
  const coverStyle = coverFocal
    ? { objectPosition: `${Math.round(coverFocal[0] * 100)}% ${Math.round(coverFocal[1] * 100)}%` }
    : undefined;

  return (
    <article className="pb-20">
      {/* ── Cover ── */}
      {showHero && treatment === 'hero-full' && (
        <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden md:h-[56vh]">
          <img
            src={cover.url}
            alt={cover.alt}
            crossOrigin="anonymous"
            className="h-full w-full object-cover"
            style={coverStyle}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4">
        <div className={cn('mx-auto max-w-[68ch]', showHero && treatment === 'hero-full' ? '-mt-16 relative' : 'pt-10')}>
          {/* Over a full-bleed hero this link sits on the photograph, where the
              muted foreground colour fails contrast against a dark image. On
              that treatment it goes white with a shadow instead. */}
          <Link
            to="/blog"
            className={cn(
              'mb-6 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] transition-colors',
              showHero && treatment === 'hero-full'
                ? 'text-white/90 [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)] hover:text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ArrowLeft size={13} />
            The Blog
          </Link>

          {/* ── Header ── */}
          <header
            className={cn(
              showHero && treatment === 'hero-full' && 'rounded-sm border border-border/60 bg-background p-6 shadow-sm',
            )}
          >
            {current.category && (
              <p
                className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                {current.category}
              </p>
            )}

            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground md:text-4xl">
              {current.title}
            </h1>

            {current.subtitle && (
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{current.subtitle}</p>
            )}

            {current.status === 'draft' && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                Draft — only visible to you
              </p>
            )}

            {/* Byline */}
            <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-4">
              {current.author.avatarUrl ? (
                <img
                  src={current.author.avatarUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-primary"
                  style={{ background: 'hsl(var(--primary) / 0.1)' }}
                  aria-hidden="true"
                >
                  {current.author.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {/* Bound to a real profile when the author picked one. */}
                  {current.author.partyId ? (
                    <Link to={`/parties/${current.author.partyId}`} className="hover:underline">
                      {current.author.name}
                    </Link>
                  ) : (
                    current.author.name
                  )}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {date}
                  {date && <span aria-hidden="true">·</span>}
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} />
                    {current.readingTime} min read
                  </span>
                </p>
              </div>
            </div>
          </header>

          {/* hero-split / inset covers sit under the header rather than behind it. */}
          {showHero && treatment !== 'hero-full' && (
            <figure className={cn('mt-8', treatment === 'inset' && 'mx-auto max-w-md')}>
              <img
                src={cover.url}
                alt={cover.alt}
                crossOrigin="anonymous"
                className="w-full rounded-sm object-cover"
                style={coverStyle}
              />
              {cover.caption && <figcaption className="mt-2 text-xs text-muted-foreground">{cover.caption}</figcaption>}
            </figure>
          )}
        </div>
      </div>

      {/* ── Body ──
          Full width so full-bleed blocks can actually reach the edges; the grid
          inside re-establishes the reading measure. */}
      <div className="mt-10">
        {locked ? (
          <div className="mx-auto max-w-[68ch] px-4">
            {/* First paragraph as the free teaser, then the gate. */}
            <BlogRenderer
              blocks={current.blocks.filter((b) => b.kind === 'paragraph').slice(0, 1)}
              media={current.media}
            />
            <Paywall requiredTier={current.minTier ?? 'premium'} />
          </div>
        ) : (
          <BlogRenderer blocks={current.blocks} media={current.media} />
        )}
      </div>

      {/* ── Tags ── */}
      {!locked && current.tags.length > 0 && (
        <div className="mx-auto mt-12 max-w-[68ch] px-4">
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-6">
            {current.tags.map((tag) => (
              <Link
                key={tag}
                to={`/blog?tag=${encodeURIComponent(tag)}`}
                className="rounded-sm border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Author note ── */}
      {!locked && current.author.bio && (
        <div className="mx-auto mt-8 max-w-[68ch] px-4">
          <div className="rounded-sm border border-border/60 bg-muted/20 p-5">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              About the author
            </p>
            <p className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
              {current.author.name}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{current.author.bio}</p>
          </div>
        </div>
      )}
    </article>
  );
}
