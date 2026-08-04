/**
 * Public blog post — /blog/:slug
 *
 * ONE layout: the picture on the left, the writing on the right.
 *
 *   Home › The Blog › Bloodstock
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
 * Three things are load-bearing:
 *
 * THERE IS NO TREATMENT BRANCH ANY MORE. This page used to read
 * `cover.treatment` and pick between a full-bleed hero, a below-the-header
 * banner, an inset image, a side column and nothing — five ways to lay out one
 * photograph, four of which nobody chose deliberately. A post with a cover now
 * gets the side layout; a post without one gets a single column. Stored
 * treatment values are ignored rather than migrated, so nothing breaks.
 *
 * THE COVER IS NOT CROPPED. It renders at its natural aspect inside the sticky
 * frame. It used to be forced to `aspect-[4/5]` while the editor previewed it at
 * 16/9, so a landscape photograph — the normal case here — was centre-cropped to
 * portrait and the author never saw it happen. Below `md` it is capped by height
 * instead, or a tall cover would push the opening paragraph off the screen.
 *
 * THE BODY RENDERS THROUGH `BlogRenderer`, the same component the editor draws
 * with, so what an author places is what a reader gets. This file only supplies
 * the chrome around it.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, ChevronRight, Clock, Link2, Loader2 } from 'lucide-react';

import { usePageMeta } from '@/lib/usePageMeta';
import { BLOG_GRID_CLASS, spanClass } from '@/blog/placement';
import { BlogRenderer } from '@/blog/BlogRenderer';
import { ReactionBar } from '@/components/ReactionBar';
import { Paywall } from '@/components/Paywall';
import { EmptyState } from '@/components/EmptyState';
import { useBlogStore } from '@/stores/blogStore';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import { useReactionStore } from '@/stores/reactionStore';
import { canViewContent } from '@/rbac/entitlement';
import { allBlocks, mediaById, partHasContent, type BlogMedia, type BlogPart } from '@/types/blog';

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

/**
 * One part of the post: a numbered section masthead, the part's own writing, and
 * its own reaction scale.
 *
 * The scale is the reason a part is a part rather than a heading inside the body —
 * a reader answers this section, not the whole piece, and the copy says so. A
 * part is its OWN reaction target (`blogPart`, keyed on the part's uuid), with
 * `postId` travelling as the parent so the server can return the post and every
 * part's counts in one query rather than one per bar.
 */
function PartSection({
  part,
  index,
  media,
  postId,
}: {
  part: BlogPart;
  index: number;
  media: BlogMedia[];
  postId: string;
}) {
  // A part may legitimately have writing and no title, so the section is labelled
  // by its heading only when there IS one — `aria-labelledby` pointing at an
  // element that was never rendered leaves the section with no name at all.
  const titled = part.title.trim().length > 0;

  return (
    <section
      className="mt-14"
      {...(titled ? { 'aria-labelledby': `part-${part.id}-title` } : { 'aria-label': `Part ${index + 1}` })}
    >
      {/* Run the masthead through the body's grid so its left edge lands on the
          same line as the prose underneath, which is laid out by the same grid. */}
      <div className={BLOG_GRID_CLASS}>
        <div className={spanClass('text')}>
          <div className="flex items-center gap-3">
            <p
              className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              Part {index + 1}
            </p>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          {titled && (
            <h2
              id={`part-${part.id}-title`}
              className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight text-foreground md:text-3xl"
            >
              {part.title}
            </h2>
          )}
        </div>
      </div>

      {/* No drop cap — that belongs to the opening of the post, not to every
          section of it. */}
      <BlogRenderer blocks={part.blocks} media={media} dropCap={false} className="mt-4" />

      {/* On the grid's `wide` track, not the full page: a card the width of the
          whole layout floats free of the section it belongs to, while the text
          measure alone is too narrow for seven tiles and their labels. `wide` is
          the text column plus its shoulders, which is exactly this case. */}
      <div className={BLOG_GRID_CLASS}>
        <div className={spanClass('wide')}>
          <ReactionBar
            variant="compact"
            targetType="blogPart"
            targetId={part.id}
            parentId={postId}
            idPrefix={`part-${part.id}-reactions`}
            heading={`Your take on part ${index + 1}`}
            note="This part is reacted to separately — your pick here counts for this section only."
          />
        </div>
      </div>
    </section>
  );
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { current, currentLoading, currentError, movedTo, fetchOne, clearCurrent } = useBlogStore();
  const tier = useAuthStore((s) => s.currentUser?.subscriptionTier);
  const viewerId = useAuthStore((s) => s.currentUser?.id);
  const loadReactions = useReactionStore((s) => s.load);

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

  // Every reaction bar on the page in ONE request: the post's own counts and, via
  // `withParts`, each part's. Re-runs when the signed-in account changes, because
  // `mine` — which pick is yours — belongs to the account, not the browser.
  useEffect(() => {
    if (current?.id && !current.locked) void loadReactions('blog', current.id, true);
  }, [current?.id, current?.locked, viewerId, loadReactions]);

  useEffect(() => {
    if (!current) return;
    // The whole post, parts included — a horse card that only appears inside a
    // part would otherwise render with no horses loaded and show nothing.
    const blocks = allBlocks(current);
    if (blocks.some((b) => b.kind === 'horseCard')) void fetchHorses();
    if (blocks.some((b) => b.kind === 'partyCard')) void fetchParties();
    if (blocks.some((b) => b.kind === 'articleRef')) void fetchArticles();
  }, [current, fetchHorses, fetchParties, fetchArticles]);

  // Above the early returns, because hooks cannot be called conditionally. The
  // post's own SEO overrides win where an author set them.
  usePageMeta({
    title: current?.seo?.metaTitle ?? current?.title ?? undefined,
    description: current?.seo?.metaDescription ?? current?.excerpt ?? current?.subtitle,
    // A draft is readable here only by its author and staff; it must never be
    // indexed on the strength of one of them opening it.
    noindex: current?.seo?.noindex === true || current?.status === 'draft',
  });

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
  const date = formatDate(current.publishedAt);

  /**
   * Image left, writing right — whenever there is an image. No treatment branch
   * and no second layout to keep in step; a post without a cover simply centres
   * its single column.
   */
  const sideBySide = !!cover;

  /** Only parts with something in them are shown, so this is the honest count. */
  const visibleParts = (current.parts ?? []).filter(partHasContent);
  const hasParts = visibleParts.length > 0;

  /**
   * `current.locked` is the SERVER'S answer — it now withholds the body of a
   * post above the reader's tier instead of sending it and trusting this file to
   * hide it. The local check stays as the fallback for a cached or
   * staff-privileged payload that arrived ungated.
   */
  const locked = current.locked === true || !canViewContent(tier, current.minTier);

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
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        {/* Breadcrumb, matching /news and /bulletins — this used to be a lone
            "← The Blog" link, which told a reader where they could go but not
            where they were. */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 pt-8 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          <Link to="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronRight size={10} aria-hidden="true" />
          <Link to="/blog" className="transition-colors hover:text-foreground">
            The Blog
          </Link>
          {current.category && (
            <>
              <ChevronRight size={10} aria-hidden="true" />
              <span className="truncate text-foreground/70">{current.category}</span>
            </>
          )}
        </nav>

        {/* ── Masthead ── */}
        <header className="mt-8 text-center">
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
              {/* "…only visible to you" was shown to every staff viewer, not just
                  the author, so it was false for most of the people who saw it. */}
              Draft — not published yet
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

        {/* ── The read ── */}
        {sideBySide ? (
          <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            {/* Two things this needs to work, both easy to lose:
                `self-start`, because a stretched grid item is already as tall as
                its row and so has nowhere to stick; and a `top` that clears the
                site header, which is ~125px at this breakpoint — at top-24 (96px)
                the held image slid 29px underneath it. */}
            <div className="md:sticky md:top-32 md:self-start">
              <figure className="overflow-hidden rounded-sm border border-border/60 bg-background p-2 shadow-sm md:p-3">
                {/* NO forced aspect. The photograph keeps its own shape, so a
                    landscape cover is not centre-cropped to portrait behind the
                    author's back — which is what `aspect-[4/5]` was doing while
                    the editor previewed the same image at 16/9.

                    `max-h` + `object-cover` is the mobile guard: stacked above
                    the prose, a tall portrait would otherwise fill the screen and
                    push the opening paragraph out of sight. Above `md` it is a
                    sidebar, so it is free to be as tall as it likes. */}
                <div className="w-full overflow-hidden rounded-sm">
                  <img
                    src={cover.url}
                    alt={cover.alt}
                    crossOrigin="anonymous"
                    width={cover.width}
                    height={cover.height}
                    className="max-h-[46vh] w-full object-cover md:max-h-none md:object-contain"
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

        {/* Parts, then the post-level scale. Both sit OUTSIDE the two-column grid,
            so a scale gets the full page width the way it does on the policy pages
            — seven tiles squeezed into a 7/12 text column wrap to two rows and
            stop reading as a scale. Parts are full width for the same reason.

            An empty part is skipped rather than printing a bare "Part 3" over an
            empty scale; the editor says so on the card, so it is never a silent
            disappearance. */}
        {!locked &&
          visibleParts.map((part, i) => (
            <PartSection key={part.id} part={part} index={i} media={current.media} postId={current.id} />
          ))}

        {/* Hidden behind the paywall: asking someone how a piece sat with them
            when they were only shown the first paragraph is a question they
            cannot answer. */}
        {!locked && (
          <ReactionBar
            targetType="blog"
            targetId={current.id}
            idPrefix="post-reactions"
            // Named for what it covers, so it can't be mistaken for one more part
            // once a post has several scales on it.
            {...(hasParts
              ? {
                  heading: 'How did the post as a whole sit with you?',
                  note: 'One reaction per reader, on the piece overall — the parts above are rated separately.',
                }
              : {})}
          />
        )}
      </div>
    </article>
  );
}
