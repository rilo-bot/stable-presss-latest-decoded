/**
 * The front page's masthead — the breaking ticker, the lead story, and next up.
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
 * IT IS NOW A SPREAD, NOT A SINGLE PHOTOGRAPH. One picture filling the whole first
 * screen meant a visitor's first screen carried exactly one story. The lead keeps
 * the field; two more headlines sit beside it in their own panel, so the masthead
 * reads like a front page rather than a poster. On a phone the panel stacks under
 * the lead and the section grows past `100svh` rather than hiding anything — see
 * the note on the height below.
 *
 * NOTHING IS HIDDEN AT A BREAKPOINT. That was the original defect in this file and
 * it is not being reintroduced in a smaller form: the `next up` panel stacks, it
 * does not disappear. Those two stories exist nowhere else on the page — `Latest`
 * starts after them — so hiding them would delete two stories from the mobile
 * front page.
 *
 * LOADING IS ITS OWN STATE. `articles` starts as `[]`, so for the first paint of
 * every cold load `heroArticle` was null and this file rendered its "nothing has
 * ever been published" branch — the brand line above — before swapping to the real
 * lead with a full-height layout jump. The brand line now renders in exactly one
 * situation: loading has FINISHED and there is genuinely nothing published.
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
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
// `article.category` holds the KEY the /news filters run on; this turns it into the
// label a reader should see. Without it the lead story was kickered "RACE-REPORTS".
import { categoryLabel } from '../news-index/constants';
import { HERO } from './copy';

/** One cell of the counts strip. Every value must come from a store, not a string. */
export interface HeroCount {
  label: string;
  value: string;
  icon: ReactNode;
}

interface LandingHeroProps {
  tickerItems: BreakingNewsItem[];
  /** True until the article store has either loaded or failed. Drives the skeleton. */
  articlesLoading: boolean;
  /**
   * The request for stories failed. A DIFFERENT fact from "nothing is published",
   * and it gets different copy — the brand line would claim we are a new
   * publication with nothing out yet, which is not what happened.
   */
  articlesFailed: boolean;
  heroArticle: Article | null;
  /** The two headlines beside the lead. Never also shown further down the page. */
  nextUp: Article[];
  counts: HeroCount[];
  /** For the strapline. Null when /api/metrics failed — the clause is then dropped. */
  storiesPublished: number | null;
}

/**
 * The scrim over the photograph.
 *
 * NEUTRAL dark, not the near-black GREEN (`hsl(150 36% 6%)`) this used to use.
 * Tinting the scrim green pushed the whole photograph towards the brand hue, which
 * is how a page with one picture on it still read as "all green". This lets the
 * photograph keep its own colour and only darkens enough to carry white type.
 *
 * Weighted left and stopped by 88%, so the middle of the picture is barely
 * touched. The `next up` panel carries its own glass rather than making this
 * gradient reach all the way across — a scrim dark enough to hold type at the
 * right-hand edge would flatten the whole photograph.
 */
const SCRIM_ACROSS =
  'linear-gradient(90deg, hsl(160 12% 5% / 0.93) 0%, hsl(160 12% 5% / 0.80) 32%, hsl(160 12% 5% / 0.34) 62%, transparent 88%)';
/** A short lift at the base so the date/counts line stays legible on a pale photo. */
const SCRIM_FOOT =
  'linear-gradient(0deg, hsl(160 12% 5% / 0.70) 0%, transparent 32%)';

/**
 * The masthead's height.
 *
 * `100svh` not `100vh`: on mobile the dynamic browser chrome makes `vh` taller
 * than what you can actually see, so a `100vh` hero always hides its own bottom
 * edge. `--navbar-h` is the header's measured height (NavBar.tsx publishes it from
 * a ResizeObserver), so subtracting it lands the masthead exactly in the visible
 * area instead of creating a scrollbar for a strip of nothing.
 *
 * MIN-height, not height — it was fixed before. Once the `next up` panel stacks
 * under the lead on a narrow screen the content is taller than one screen, and a
 * fixed height would clip it.
 */
const MASTHEAD_HEIGHT = {
  minHeight: 'max(480px, calc(100svh - var(--navbar-h, 92px)))',
} as const;

/** The masthead's two columns. The panel is a fixed measure; the lead takes the rest. */
const SPREAD = 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-8 lg:gap-12 items-center';

export function LandingHero({
  tickerItems,
  articlesLoading,
  articlesFailed,
  heroArticle,
  nextUp,
  counts,
  storiesPublished,
}: LandingHeroProps) {
  // Rotate through every active breaking-news item, not just the first.
  const [tickerIdx, setTickerIdx] = useState(0);
  // A 5s rotation is unreadable for anyone who reads slowly, and it moves out from
  // under the pointer of somebody about to click it. Hovering or focusing holds it.
  const [tickerHeld, setTickerHeld] = useState(false);
  useEffect(() => {
    setTickerIdx(0);
  }, [tickerItems.length]);
  useEffect(() => {
    if (tickerItems.length <= 1 || tickerHeld) return;
    const t = setInterval(() => {
      setTickerIdx((i) => (i + 1) % tickerItems.length);
    }, 5000);
    return () => clearInterval(t);
  }, [tickerItems.length, tickerHeld]);

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

  /** The date + live count line. Same content on both surfaces, different ink. */
  const straplineText = (
    <>
      {todayLabel}
      {storiesPublished !== null && storiesPublished > 0 && (
        <>
          {' · '}
          {storiesPublished.toLocaleString()} stor
          {storiesPublished === 1 ? 'y' : 'ies'} published
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
          onMouseEnter={() => setTickerHeld(true)}
          onMouseLeave={() => setTickerHeld(false)}
          onFocus={() => setTickerHeld(true)}
          onBlur={() => setTickerHeld(false)}
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
            {/* The text swaps itself out every five seconds. Without a live region
                that change is silent to a screen reader, which reads whichever
                headline happened to be up when it reached this point and never
                learns there are others. */}
            <div
              className="overflow-hidden flex-1"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Breaking news"
            >
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

      {/* ── Masthead ─────────────────────────────────────── */}
      {articlesLoading ? (
        /* ── Still loading ──
           The shape of the real masthead, on the white sheet. This branch exists
           because the alternative was showing marketing copy written for "nothing
           has ever been published" to every visitor on every cold load. */
        <MastheadSkeleton />
      ) : heroImage ? (
        /* ── The photograph is the field ── */
        <section className="relative w-full overflow-hidden" style={MASTHEAD_HEIGHT}>
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

          <div className="relative h-full px-6 md:px-10 lg:px-16 py-12 lg:py-0 flex flex-col justify-center">
            <div className={SPREAD}>
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

              <NextUp articles={nextUp} onDark />
            </div>
          </div>
        </section>
      ) : (
        /* ── No photograph: the WHITE sheet is the field ──
           Not flat green. A story with no picture is common and must not turn the
           front page into a slab of brand colour — see the note at the top. */
        <section
          className="relative w-full border-b border-border bg-background flex items-center"
          style={MASTHEAD_HEIGHT}
        >
          <div className="px-6 md:px-10 lg:px-16 py-16 md:py-24 w-full">
            <div className={SPREAD}>
              <div className="max-w-3xl">
                {/* No kicker over a failure — "The Lead" above "today's stories did
                    not load" labels a story that is not there. */}
                {!articlesFailed && <HeroKicker category={heroArticle?.category} />}

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
                ) : articlesFailed ? (
                  <>
                    {/* The request FAILED. Not the same as having published
                        nothing, so it does not borrow that copy — and it does not
                        arrive as a red "HTTP 500" toast either. */}
                    <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.08] mb-5 text-foreground">
                      {HERO.failedHeading}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
                      {HERO.failedBody}
                    </p>
                    <div className="mb-7">
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-sm border border-input text-foreground hover:bg-muted/50 transition-colors"
                      >
                        {HERO.failedCta}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Nothing published at all, and loading has finished. The
                        brand line is the one honest thing to say — there is no
                        headline to promote. This is NOT the loading state. */}
                    <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] mb-5 text-foreground">
                      {HERO.emptyHeading}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
                      {HERO.emptyBody}
                    </p>
                    <HeroActions />
                  </>
                )}

                <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  {straplineText}
                </p>
              </div>

              <NextUp articles={nextUp} />
            </div>
          </div>
        </section>
      )}

      {/* ── Live counts strip ─────────────────────────────── */}
      {counts.length > 0 && (
        <div className="bg-card border-b border-border">
          <div className="px-6 md:px-10 lg:px-16">
            <div className="flex flex-wrap items-stretch divide-x divide-border">
              {counts.map((count) => (
                <div
                  key={count.label}
                  className="flex items-center gap-3 px-4 md:px-6 py-4 flex-1 min-w-[150px]"
                >
                  <span className="text-primary opacity-80">{count.icon}</span>
                  <div>
                    <span className="block font-[family-name:var(--font-display)] text-xl font-bold tabular-nums leading-none text-foreground">
                      {count.value}
                    </span>
                    {/* 11px sentence case, was 9px uppercase at 0.1em tracking. */}
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      {count.label}
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
   Both masthead variants show the same things in the same order; only the ink
   changes. Writing them once means the photo and no-photo versions cannot drift
   apart, which is how the old file ended up with a headline in one and marketing
   copy in the other. */

/**
 * The two headlines beside the lead.
 *
 * Renders nothing when there is only one published story — an empty "Next up"
 * frame beside the lead would announce a queue that does not exist.
 */
function NextUp({ articles, onDark }: { articles: Article[]; onDark?: boolean }) {
  if (articles.length === 0) return null;

  return (
    <aside
      className={
        onDark
          ? 'rounded-sm border border-white/15 p-5 backdrop-blur-sm'
          : 'rounded-sm border border-border bg-card p-5'
      }
      /* Its own glass rather than a scrim reaching the full width — see the note
         on SCRIM_ACROSS. Neutral dark, never green-tinted. */
      style={onDark ? { background: 'hsl(160 12% 5% / 0.62)' } : undefined}
      aria-label={HERO.nextUpLabel}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className="h-[3px] w-5 flex-shrink-0 rounded-full"
          style={{ background: 'hsl(var(--brand-accent))' }}
        />
        <h2
          className="text-[11px] uppercase tracking-[0.16em] font-bold"
          style={{
            color: onDark
              ? 'hsl(var(--brand-accent))'
              : 'hsl(var(--brand-accent-ink))',
          }}
        >
          {HERO.nextUpLabel}
        </h2>
      </div>

      <ul>
        {articles.map((article, idx) => (
          <li key={article.id}>
            <Link
              to={`/articles/${article.id}`}
              className={`group block py-3.5 ${
                idx < articles.length - 1
                  ? onDark
                    ? /* /15, not /12 — Tailwind silently drops off-scale opacity
                         modifiers, so the divider would render as no border at
                         all (THEME-DIRECTION, "Gotcha"). */
                      'border-b border-white/15'
                    : 'border-b border-border/60'
                  : ''
              }`}
            >
              {article.category && (
                <span
                  className="mb-1 block text-[11px] uppercase tracking-[0.1em] font-bold"
                  style={{
                    color: onDark
                      ? 'hsl(var(--brand-accent))'
                      : 'hsl(var(--brand-accent-ink))',
                  }}
                >
                  {categoryLabel(article.category)}
                </span>
              )}
              <h3
                className={`font-[family-name:var(--font-display)] text-[15px] font-bold leading-snug line-clamp-3 transition-colors ${
                  onDark
                    ? 'text-white group-hover:text-[hsl(var(--brand-accent))]'
                    : 'text-foreground group-hover:text-primary'
                }`}
              >
                {article.title}
              </h3>
              <p
                className={`mt-1 flex flex-wrap items-center gap-x-2 text-[12px] ${
                  onDark ? 'text-white/65' : 'text-muted-foreground'
                }`}
              >
                {article.author && <span>{article.author}</span>}
                {article.readingTime && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {article.readingTime} min
                    </span>
                  </>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

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
        {categoryLabel(category) ?? 'The Lead'}
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

/**
 * The two buttons. Gold commits; the second is a quiet outline.
 *
 * Either can be switched off from Settings → Website Customisation: both point
 * into a public section, and a hero CTA that redirects straight back to the
 * homepage is worse than one button.
 */
function HeroActions({ articleId, onDark }: { articleId?: string; onDark?: boolean }) {
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  return (
    <div className="flex flex-wrap items-center gap-3 mb-7">
      {publicNav.news !== false && (
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
      )}
      {publicNav.podcast !== false && (
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
      )}
    </div>
  );
}

/**
 * The masthead while the article store is still in flight.
 *
 * Deliberately the SHAPE of the real thing — kicker, three headline lines, byline,
 * two buttons, and the panel beside it — so the swap when data lands is a fill
 * rather than a reflow. `motion-reduce:animate-none` matches SkeletonCard.tsx.
 */
function MastheadSkeleton() {
  return (
    <section
      className="relative w-full border-b border-border bg-background flex items-center"
      style={MASTHEAD_HEIGHT}
      aria-busy="true"
      aria-label="Loading the front page"
    >
      <div className="px-6 md:px-10 lg:px-16 py-16 md:py-24 w-full">
        <div className={SPREAD}>
          <div className="max-w-3xl w-full">
            <Bar className="h-7 w-32 rounded-full mb-6" />
            <Bar className="h-10 sm:h-12 lg:h-14 w-full mb-3" />
            <Bar className="h-10 sm:h-12 lg:h-14 w-11/12 mb-3" />
            <Bar className="h-10 sm:h-12 lg:h-14 w-2/3 mb-7" />
            <Bar className="h-4 w-72 max-w-full mb-7" />
            <div className="flex flex-wrap gap-3 mb-7">
              <Bar className="h-12 w-48" />
              <Bar className="h-12 w-36" />
            </div>
            <Bar className="h-3 w-60 max-w-full" />
          </div>

          <div className="rounded-sm border border-border bg-card p-5 w-full">
            <Bar className="h-3 w-24 mb-5" />
            {[0, 1].map((i) => (
              <div key={i} className="py-3.5 border-b border-border/60 last:border-b-0">
                <Bar className="h-3 w-20 mb-2" />
                <Bar className="h-4 w-full mb-1.5" />
                <Bar className="h-4 w-4/5 mb-2" />
                <Bar className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-sm bg-muted/60 motion-reduce:animate-none ${className}`} />
  );
}
