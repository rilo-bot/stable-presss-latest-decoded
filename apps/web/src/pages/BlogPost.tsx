/**
 * Public blog post — /blog/:slug
 *
 * Laid out as a broadsheet feature:
 *
 *   ← THE BLOG
 *            ── CATEGORY ──
 *      A large centred headline
 *        an italic standfirst
 *   ══════════════════════════════
 *   BY NAME ◆ date ◆ ⏱ 6 min read
 *   ══════════════════════════════
 *   ┌ sticky ┐   The Challenge
 *   │ cover  │   As our…  (drop cap)
 *   │        │   …
 *   └────────┘   ◆ ◆ ◆
 *                tags · byline card · share
 *
 * Two things are load-bearing:
 *
 * The COVER COLUMN IS STICKY, so the photograph stays with the reader for the
 * whole piece instead of scrolling away in the first screenful. That is the
 * `side` treatment and it is the default; the other treatments (full-bleed hero,
 * below-the-header, inset, hidden) fall back to a single column.
 *
 * The BODY STILL RENDERS THROUGH `BlogRenderer` — the same component the editor
 * draws with, so what an author places is what a reader gets. This file only
 * supplies the chrome around it. In the two-column layout the renderer's grid
 * resolves its `wide` and `full-bleed` blocks against the text column rather
 * than the viewport, which is the honest reading of "full width" once the prose
 * has a photograph beside it.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, Clock, Link2, Loader2 } from 'lucide-react';

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

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Hairline rules either side of a centred label. */
function Hairlines({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="h-px w-12 bg-border sm:w-16" aria-hidden="true" />
      {children}
      <span className="h-px w-12 bg-border sm:w-16" aria-hidden="true" />
    </div>
  );
}

/** The ◆ that separates byline items. Decorative, so hidden from readers. */
function Diamond() {
  return (
    <span aria-hidden="true" style={{ color: 'hsl(var(--brand-accent))' }}>
      ◆
    </span>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!navigator.clipboard) return;
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border/60 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {copied ? <Check size={13} /> : <Link2 size={13} />}
      {copied ? 'Copied' : 'Share'}
    </button>
  );
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
  const treatment = current.cover?.treatment ?? 'side';
  const hasCover = !!cover && treatment !== 'none';
  const date = formatDate(current.publishedAt);
  const locked = !canViewContent(tier, current.minTier);

  /** Two-column with a sticky cover — the default reading layout. */
  const sideBySide = hasCover && treatment === 'side';
  const fullHero = hasCover && treatment === 'hero-full';

  const coverFocal = current.cover?.focal;
  const coverStyle = coverFocal
    ? { objectPosition: `${Math.round(coverFocal[0] * 100)}% ${Math.round(coverFocal[1] * 100)}%` }
    : undefined;

  const body = locked ? (
    <>
      {/* First paragraph as the free teaser, then the gate. */}
      <BlogRenderer
        blocks={current.blocks.filter((b) => b.kind === 'paragraph').slice(0, 1)}
        media={current.media}
        dropCap
      />
      <Paywall requiredTier={current.minTier ?? 'premium'} />
    </>
  ) : (
    <BlogRenderer blocks={current.blocks} media={current.media} dropCap />
  );

  const tags = !locked && current.tags.length > 0 && (
    <div className="mt-8 flex flex-wrap gap-2">
      {current.tags.map((tag) => (
        <Link
          key={tag}
          to={`/blog?tag=${encodeURIComponent(tag)}`}
          className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          {tag}
        </Link>
      ))}
    </div>
  );

  const bylineCard = !locked && (
    <div className="mt-8 flex items-center justify-between gap-4 rounded-sm border border-border/60 bg-background p-4">
      <div className="flex min-w-0 items-center gap-3">
        {current.author.avatarUrl ? (
          <img
            src={current.author.avatarUrl}
            alt=""
            crossOrigin="anonymous"
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary"
            style={{ background: 'hsl(var(--primary) / 0.1)' }}
            aria-hidden="true"
          >
            {current.author.name.charAt(0).toUpperCase() || '?'}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Written by</p>
          <p className="truncate font-[family-name:var(--font-display)] text-base font-bold text-foreground">
            {current.author.partyId ? (
              <Link to={`/parties/${current.author.partyId}`} className="hover:underline">
                {current.author.name}
              </Link>
            ) : (
              current.author.name
            )}
          </p>
          {current.author.bio && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{current.author.bio}</p>
          )}
        </div>
      </div>
      <ShareButton />
    </div>
  );

  return (
    <article className="pb-20">
      {/* ── Full-bleed hero, for the one treatment that wants it ── */}
      {fullHero && (
        <div className="relative h-[38vh] min-h-[240px] w-full overflow-hidden md:h-[50vh]">
          <img
            src={cover.url}
            alt={cover.alt}
            crossOrigin="anonymous"
            className="h-full w-full object-cover"
            style={coverStyle}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        {/* Over a photograph the muted foreground colour fails contrast, so on
            that one treatment the link goes white with a shadow instead. */}
        <Link
          to="/blog"
          className={cn(
            'inline-flex items-center gap-1.5 pt-8 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
            fullHero
              ? 'relative -mt-14 text-white/90 [text-shadow:0_1px_3px_rgb(0_0_0_/_0.7)] hover:text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ArrowLeft size={13} />
          The Blog
        </Link>

        {/* ── Masthead ── */}
        <header className={cn('text-center', fullHero ? 'mt-10' : 'mt-8')}>
          {current.category && (
            <Hairlines>
              <p
                className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                {current.category}
              </p>
            </Hairlines>
          )}

          <h1 className="mx-auto mt-5 max-w-3xl font-[family-name:var(--font-display)] text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl">
            {current.title || 'Untitled post'}
          </h1>

          {current.subtitle && (
            <p className="mx-auto mt-5 max-w-2xl text-lg italic leading-relaxed text-muted-foreground md:text-xl">
              {current.subtitle}
            </p>
          )}

          {current.status === 'draft' && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
              Draft — only visible to you
            </p>
          )}

          {/* Double-ruled byline strip. */}
          <div className="mx-auto mt-8 max-w-2xl border-y-[3px] border-double border-border py-3">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/80">
                By {current.author.name || 'Staff'}
              </span>
              {date && (
                <>
                  <Diamond />
                  <span>{date}</span>
                </>
              )}
              <Diamond />
              <span className="inline-flex items-center gap-1">
                <Clock size={13} />
                {current.readingTime} min read
              </span>
            </div>
          </div>
        </header>

        {/* ── Cover under the header, for the treatments that ask for it ── */}
        {hasCover && (treatment === 'hero-split' || treatment === 'inset') && (
          <figure className={cn('mt-10', treatment === 'inset' ? 'mx-auto max-w-lg' : 'mx-auto max-w-4xl')}>
            <img
              src={cover.url}
              alt={cover.alt}
              crossOrigin="anonymous"
              className="w-full rounded-sm object-cover"
              style={coverStyle}
            />
            {cover.caption && (
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">{cover.caption}</figcaption>
            )}
          </figure>
        )}

        {/* ── The read ── */}
        {sideBySide ? (
          <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            {/* `self-start` is what makes `sticky` do anything: a stretched grid
                item is already as tall as the row, so it has no room to stick. */}
            <div className="md:sticky md:top-24 md:self-start">
              <figure className="overflow-hidden rounded-sm border border-border/60 bg-background p-2 shadow-sm md:p-3">
                <div className="aspect-[4/5] w-full overflow-hidden rounded-sm">
                  <img
                    src={cover.url}
                    alt={cover.alt}
                    crossOrigin="anonymous"
                    className="h-full w-full object-cover"
                    style={coverStyle}
                  />
                </div>
                {cover.caption && (
                  <figcaption className="px-1 pb-1 pt-2 text-xs leading-snug text-muted-foreground">
                    {cover.caption}
                  </figcaption>
                )}
              </figure>
            </div>

            <div className="min-w-0">
              {body}
              <div
                className="mt-12 text-center text-lg tracking-[0.5em]"
                style={{ color: 'hsl(var(--brand-accent))' }}
                aria-hidden="true"
              >
                ◆◆◆
              </div>
              {tags}
              {bylineCard}
            </div>
          </div>
        ) : (
          <div className="mt-10">
            {body}
            <div className="mx-auto max-w-[68ch]">
              <div
                className="mt-12 text-center text-lg tracking-[0.5em]"
                style={{ color: 'hsl(var(--brand-accent))' }}
                aria-hidden="true"
              >
                ◆◆◆
              </div>
              {tags}
              {bylineCard}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
