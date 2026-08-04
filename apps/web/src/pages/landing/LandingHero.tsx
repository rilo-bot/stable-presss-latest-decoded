/**
 * The front page's masthead — the breaking ticker and the lead story.
 *
 * THE LEAD STORY IS THE HERO. It used to be marketing copy: an 80vh stock
 * photograph under the headline "The premium voice of thoroughbred racing", with
 * the standfirst "Breaking news, expert analysis, exclusive interviews and
 * in-depth features from the world's greatest racetracks." The actual lead story
 * appeared in a 19rem card pinned to the bottom-right corner — behind
 * `hidden lg:flex`, so on a phone the front page of a racing paper showed no
 * headline at all. That is inverted here: the lead story's own headline is the
 * largest type on the page and it is there at every breakpoint.
 *
 * GREEN IS NEVER THE FIELD HERE. docs/THEME-DIRECTION.md gives green one job —
 * "chrome and commitment, the frame around the work" — and one prohibition: "a
 * content background. Green is the frame, never the picture." An intermediate
 * version of this file made the whole hero `bg-primary`, which put a ~700px flat
 * green field directly under an identically-green navbar; the header dissolved
 * into it. So:
 *
 *   lead story HAS a photograph  →  the photograph is the field, full bleed
 *   lead story has NO photograph  →  the WHITE sheet is the field, ink on white
 *
 * Neither case is green. Green survives as the navbar above, the committing
 * button, and the gold kicker's counterpart elsewhere on the page.
 *
 * NO STOCK FALLBACK. A hotlinked Pexels winners-circle shot used to fill the
 * background whenever the lead story had no image, so the front page could open on
 * a photograph of a race we did not cover, carrying the alt text of a story it does
 * not illustrate.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Clock, Play, Zap } from 'lucide-react';
import type { Article } from '@/types/article';
import type { BreakingNewsItem } from '@/types/breakingNews';
import type { SiteMetrics } from '@/stores/metricsStore';

interface MetricCard {
  label: string;
  value: string;
  icon: ReactNode;
}

interface LandingHeroProps {
  tickerItems: BreakingNewsItem[];
  heroArticle: Article | null;
  metricCards: MetricCard[];
  metrics: SiteMetrics | null;
}

/**
 * The scrim over the photograph.
 *
 * NEUTRAL dark, not the near-black GREEN (`hsl(150 36% 6%)`) this used to use.
 * Tinting the scrim green pushed the whole photograph towards the brand hue, which
 * is how a page with one picture on it still read as "all green". This lets the
 * photograph keep its own colour and only darkens enough to carry white type.
 *
 * Weighted left and stopped by 70%, so the right-hand two-fifths of the picture —
 * usually the horse — is barely touched.
 */
const SCRIM_ACROSS =
  'linear-gradient(90deg, hsl(160 12% 5% / 0.93) 0%, hsl(160 12% 5% / 0.80) 32%, hsl(160 12% 5% / 0.34) 62%, transparent 88%)';
/** A short lift at the base so the date/counts line stays legible on a pale photo. */
const SCRIM_FOOT =
  'linear-gradient(0deg, hsl(160 12% 5% / 0.70) 0%, transparent 32%)';

export function LandingHero({
  tickerItems,
  heroArticle,
  metricCards,
  metrics,
}: LandingHeroProps) {
  // Rotate through every active breaking-news item, not just the first.
  const [tickerIdx, setTickerIdx] = useState(0);
  useEffect(() => {
    setTickerIdx(0);
    if (tickerItems.length <= 1) return;
    const t = setInterval(() => {
      setTickerIdx((i) => (i + 1) % tickerItems.length);
    }, 5000);
    return () => clearInterval(t);
  }, [tickerItems.length]);

  // Empty strings count as absent, so `imageUrl: ''` doesn't become a broken <img>.
  const heroImage = heroArticle?.imageUrl?.trim() ? heroArticle.imageUrl : null;
  const activeTicker = tickerItems[Math.min(tickerIdx, tickerItems.length - 1)];

  const publishedOn = heroArticle?.publishedAt ?? heroArticle?.createdAt ?? null;
  const publishedLabel = publishedOn
    ? new Date(publishedOn).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /** The date + live counts line. Same content on both surfaces, different ink. */
  const straplineText = (
    <>
      {todayLabel}
      {metrics && metrics.articlesPublished > 0 && (
        <>
          {' · '}
          {metrics.articlesPublished.toLocaleString()} stor
          {metrics.articlesPublished === 1 ? 'y' : 'ies'} published
        </>
      )}
    </>
  );

  return (
    <>
      {/* ── Breaking News Ticker ─────────────────────────── */}
      {tickerItems.length > 0 && (
        <div
          className="border-b border-border/40 overflow-hidden"
          style={{ background: 'hsl(var(--brand-accent) / 0.08)' }}
        >
          <div className="px-6 md:px-10 lg:px-16 py-2 flex items-center gap-4">
            <span
              className="flex-shrink-0 text-[11px] uppercase tracking-[0.12em] font-bold px-2 py-0.5 rounded-sm"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              Breaking
            </span>
            <div className="overflow-hidden flex-1">
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeTicker.id ?? tickerIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="text-[13px] text-foreground/85 font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {activeTicker.text}
                </motion.p>
              </AnimatePresence>
            </div>
            {tickerItems.length > 1 && (
              <span className="flex-shrink-0 text-[11px] tabular-nums text-foreground/50 font-semibold">
                {tickerIdx + 1}/{tickerItems.length}
              </span>
            )}
            <Zap size={13} className="flex-shrink-0 opacity-40" />
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      {heroImage ? (
        /* ── The photograph is the field ──
           FULL SCREEN, less the header. `100svh` not `100vh`: on mobile the
           dynamic browser chrome makes `vh` taller than what you can actually see,
           so a `100vh` hero always hides its own bottom edge. `--navbar-h` is the
           header's measured height (NavBar.tsx publishes it from a ResizeObserver),
           so subtracting it lands the hero exactly in the visible area instead of
           creating a scrollbar for a strip of nothing. */
        <section
          className="relative w-full overflow-hidden"
          style={{ height: 'calc(100svh - var(--navbar-h, 92px))', minHeight: '480px' }}
        >
          <img
            src={heroImage}
            alt={heroArticle?.title ?? ''}
            crossOrigin="anonymous"
            width={1880}
            height={1300}
            fetchPriority="high"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0" style={{ background: SCRIM_ACROSS }} />
          <div className="absolute inset-0" style={{ background: SCRIM_FOOT }} />

          <div className="relative h-full px-6 md:px-10 lg:px-16 flex flex-col justify-center">
            <div className="max-w-2xl">
              <HeroKicker category={heroArticle?.category} onDark />

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] mb-4 text-white text-balance"
              >
                <Link
                  to={`/articles/${heroArticle!.id}`}
                  className="transition-colors hover:text-[hsl(var(--brand-accent))]"
                >
                  {heroArticle!.title}
                </Link>
              </motion.h1>

              <HeroByline
                author={heroArticle!.author}
                publishedLabel={publishedLabel}
                readingTime={heroArticle!.readingTime}
                className="text-white/75"
              />

              <HeroActions articleId={heroArticle!.id} onDark />

              <p className="text-[12px] uppercase tracking-[0.14em] text-white/60 font-medium">
                {straplineText}
              </p>
            </div>
          </div>
        </section>
      ) : (
        /* ── No photograph: the WHITE sheet is the field ──
           Not flat green. A story with no picture is common and must not turn the
           front page into a slab of brand colour — see the note at the top. */
        <section
          className="relative w-full border-b border-border bg-background flex items-center"
          style={{ minHeight: 'calc(100svh - var(--navbar-h, 92px))' }}
        >
          <div className="px-6 md:px-10 lg:px-16 py-16 md:py-24 w-full">
            <div className="max-w-3xl">
              <HeroKicker category={heroArticle?.category} />

              {heroArticle ? (
                <>
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] mb-4 text-foreground text-balance"
                  >
                    <Link
                      to={`/articles/${heroArticle.id}`}
                      className="transition-colors hover:text-primary"
                    >
                      {heroArticle.title}
                    </Link>
                  </motion.h1>

                  <HeroByline
                    author={heroArticle.author}
                    publishedLabel={publishedLabel}
                    readingTime={heroArticle.readingTime}
                    className="text-muted-foreground"
                  />

                  <HeroActions articleId={heroArticle.id} />
                </>
              ) : (
                <>
                  {/* Nothing published at all. The brand line is the one honest
                      thing to say — there is no headline to promote. */}
                  <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] mb-5 text-foreground">
                    The premium voice of{' '}
                    <span style={{ color: 'hsl(var(--brand-accent-ink))' }}>thoroughbred</span>{' '}
                    racing
                  </h1>
                  <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
                    Breaking news, expert analysis, exclusive interviews and in-depth
                    features from the world&rsquo;s greatest racetracks.
                  </p>
                  <HeroActions />
                </>
              )}

              <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {straplineText}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Live counts strip ─────────────────────────────── */}
      {metricCards.length > 0 && (
        <div className="bg-card border-b border-border">
          <div className="px-6 md:px-10 lg:px-16">
            <div className="flex flex-wrap items-stretch divide-x divide-border">
              {metricCards.map((metric) => (
                <div
                  key={metric.label}
                  className="flex items-center gap-3 px-4 md:px-6 py-4 flex-1 min-w-[150px]"
                >
                  <span className="text-primary opacity-80">{metric.icon}</span>
                  <div>
                    <span className="block font-[family-name:var(--font-display)] text-xl font-bold tabular-nums leading-none text-foreground">
                      {metric.value}
                    </span>
                    {/* 11px sentence case, was 9px uppercase at 0.1em tracking. */}
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      {metric.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Pieces shared by the two surfaces ───────────────────────────────────────
   Both hero variants show the same things in the same order; only the ink
   changes. Writing them once means the photo and no-photo versions cannot drift
   apart, which is how the old file ended up with a headline in one and marketing
   copy in the other. */

/** The section kicker. Gold on dark is a fill (5.19:1); on light it must be ink. */
function HeroKicker({ category, onDark }: { category?: string | null; onDark?: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full"
      style={{
        background: onDark ? 'hsl(var(--brand-accent) / 0.15)' : 'hsl(var(--brand-accent) / 0.12)',
        border: `1px solid hsl(var(--brand-accent) / ${onDark ? 0.45 : 0.4})`,
      }}
    >
      <Zap
        size={12}
        style={{ color: onDark ? 'hsl(var(--brand-accent))' : 'hsl(var(--brand-accent-ink))' }}
      />
      <span
        className="text-[11px] uppercase tracking-[0.16em] font-bold"
        style={{ color: onDark ? 'hsl(var(--brand-accent))' : 'hsl(var(--brand-accent-ink))' }}
      >
        {category ?? 'The Lead'}
      </span>
    </div>
  );
}

/** Byline, date and reading time — the credit a lead story carries in print. */
function HeroByline({
  author,
  publishedLabel,
  readingTime,
  className,
}: {
  author?: string | null;
  publishedLabel: string | null;
  readingTime?: number | null;
  className: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 mb-7 text-[13px] ${className}`}>
      {author && <span>By {author}</span>}
      {publishedLabel && (
        <>
          <span className="opacity-40">·</span>
          <span>{publishedLabel}</span>
        </>
      )}
      {readingTime && (
        <>
          <span className="opacity-40">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {readingTime} min read
          </span>
        </>
      )}
    </div>
  );
}

/** The two buttons. Gold commits; the second is a quiet outline. */
function HeroActions({ articleId, onDark }: { articleId?: string; onDark?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-7">
      <Link
        to={articleId ? `/articles/${articleId}` : '/news'}
        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-sm transition-opacity hover:opacity-90"
        style={{
          background: 'hsl(var(--brand-accent))',
          color: 'hsl(var(--brand-accent-foreground))',
        }}
      >
        {articleId ? 'Read the full story' : 'Browse the desk'} <ArrowRight size={15} />
      </Link>
      <Link
        to="/podcast"
        className={
          onDark
            ? 'inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-sm bg-white/10 text-white border border-white/25 backdrop-blur-sm hover:bg-white/20 transition-colors'
            : 'inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-sm border border-input text-foreground hover:bg-muted/50 transition-colors'
        }
      >
        <Play size={14} /> Listen now
      </Link>
    </div>
  );
}
