/**
 * The newsroom blocks — "Latest" and "Analysis & Interviews" — and, separately,
 * the horse strip.
 *
 * THIS FILE USED TO EXPORT ALL THREE AS ONE COMPONENT, which forced them to share a
 * position on the page. They no longer do: the two story blocks sit in the 2/3
 * column beside the rail, while the horses run full width further down with the
 * blog, the directory and the bulletins. Splitting the export is what let that
 * happen — Landing.tsx could not have placed one half of a fragment.
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Clock, ImageOff, PenLine } from 'lucide-react';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleSkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Horse } from '@/types/horse';
import type { HorseConnections } from '@/lib/horseConnections';
import { SectionHead } from './SectionHead';
// The stored value is the filter KEY, not a label — see categoryLabel's own note.
import { categoryLabel } from '../news-index/constants';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';

interface LandingFeaturedArticlesProps {
  articlesLoading: boolean;
  /** The newest stories after the lead and the masthead's "next up" pair. */
  latestArticles: Article[];
  featuredArticles: Article[];
  /** Staff see newsroom CTAs in empty states; readers get reader-facing ones. */
  isAdmin: boolean;
}

export function LandingFeaturedArticles({
  articlesLoading,
  latestArticles,
  featuredArticles,
  isAdmin,
}: LandingFeaturedArticlesProps) {
  // Both story blocks belong to News — "Analysis & Interviews" is a `?section=`
  // cut of /news, not a surface of its own — so one switch governs the pair, and
  // it is read here rather than passed down.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  if (publicNav.news === false) return null;

  return (
    <>
      {/* ── Latest ───
          SIX, in two rows of three. It was three, which left the whole left-hand
          two-thirds of the page carrying one row of stories under a masthead. The
          selection is still pure recency, which is what the heading claims. */}
      <section>
        <SectionHead title="Latest" to="/news" linkLabel="All stories" />

        {articlesLoading ? (
          /* Skeleton grid — six, matching what will land. */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ArticleSkeletonCard key={i} />
            ))}
          </div>
        ) : latestArticles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {latestArticles.map((article, i) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.03,
                  duration: 0.18,
                  ease: 'easeOut',
                }}
              >
                <ArticleCard article={article} variant="default" />
              </motion.div>
            ))}
          </div>
        ) : (
          /* Two audiences, two empty states. This told every anonymous visitor to
             "head to the newsroom and file your first dispatch" and pointed them at
             /production-system — a RequireAdmin route that bounces them straight
             home. A reader is told the truth and offered somewhere to go that
             exists for them.

             Note this can now be reached with stories on the page: the masthead
             takes the newest three, so a site with exactly three published stories
             shows them all up there and nothing here. The reader copy holds either
             way — it does not claim there are none, only that there are none here. */
          <EmptyState
            icon={PenLine}
            heading={
              isAdmin
                ? 'The press stands ready. No further dispatches have been filed.'
                : 'No further stories yet.'
            }
            description={
              isAdmin
                ? 'Published stories will appear here. Head to the newsroom to file your next dispatch.'
                : 'The desk is still working. The blog and the podcast are already open.'
            }
            ctaLabel={isAdmin ? 'Go to Newsroom' : 'Read the blog'}
            ctaHref={isAdmin ? '/production-system' : '/blog'}
          />
        )}
      </section>

      {/* ── Analysis & Interviews ───
          THE LABEL IS TRUE. This said "Featured Analysis & Interviews" over
          `published.slice(4,7)` — the fifth, sixth and seventh newest stories,
          whatever their category — beside an "All analysis" link to
          /news?section=analysis, which DOES filter. So the teaser and its
          destination disagreed about what the section was. Landing.tsx selects on
          the real section axis; see `featuredArticles` there. Four rows now, was
          three. */}
      <section>
        {/* A plain `&`, not `&amp;` — this is a string prop, not markup, so the
            entity would render literally. */}
        <SectionHead
          title="Analysis & Interviews"
          to="/news?section=analysis"
          linkLabel="All analysis"
        />

        {featuredArticles.length > 0 ? (
          <div className="space-y-0">
            {featuredArticles.map((article, idx) => (
              <Link
                key={article.id}
                to={`/articles/${article.id}`}
                className={cn(
                  'group grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 py-5 transition-colors hover:bg-muted/30 -mx-3 px-3 rounded-sm',
                  idx < featuredArticles.length - 1 && 'border-b border-border/40'
                )}
                aria-label={`Read analysis: ${article.title}`}
              >
                {article.imageUrl && (
                  <div className="w-full sm:w-28 h-20 flex-shrink-0 overflow-hidden rounded-sm">
                    <img
                      src={article.imageUrl}
                      alt={article.title}
                      crossOrigin="anonymous"
                      /* Below the fold, unlike the masthead's photograph. */
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  {article.category && (
                    <div className="flex items-center gap-2 mb-1.5">
                      {/* 11px, and gold as INK. `--brand-accent` is a fill colour —
                          2.06:1 as text on this surface. */}
                      <span
                        className="text-[11px] uppercase tracking-[0.1em] font-bold"
                        style={{ color: 'hsl(var(--brand-accent-ink))' }}
                      >
                        {categoryLabel(article.category)}
                      </span>
                    </div>
                  )}
                  <h3 className="font-[family-name:var(--font-display)] text-base md:text-lg font-bold text-foreground leading-snug group-hover:text-primary transition-colors mb-1.5 line-clamp-2">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span>{article.author}</span>
                    {article.readingTime && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {article.readingTime} min read
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/70 italic py-6">
            Published analysis and interviews will be featured here.
          </p>
        )}
      </section>
    </>
  );
}

/* ── The horse strip ─────────────────────────────────────────────────────────── */

interface LandingStablesProps {
  horses: Horse[];
  horseConn: (horse: Horse) => HorseConnections;
  isAdmin: boolean;
}

/**
 * "From the Stables" — four horses, with their photographs.
 *
 * WAS FOUR TEXT ROWS. In a third-of-the-page column a name over "Trainer: — ·
 * Jockey: —" was all that fitted. Full width it can carry the photograph, which is
 * the point of a horse profile.
 *
 * "Form the Stables" → "From the Stables". The old name read as a promise of FORM —
 * ratings, recent runs — which these cards do not carry. (It may also simply have
 * been a typo for "From".)
 *
 * NO STAND-IN PHOTOGRAPH. `HorseCard` established the rule and the wording: a horse
 * with no picture gets an empty frame that says so, because a grid of photo-less
 * horses sharing one stock thoroughbred is a lie the reader cannot detect. The rule
 * is reused here; the component is not, deliberately — `HorseCard` carries eight
 * pieces of 9–10px text and sets "View Profile" in `--brand-accent` as ink (2.06:1),
 * and importing it would walk both of those back onto a page measured clean of them.
 *
 * NO `01 02 03 04` ORDINALS either. Each row used to be numbered in gold display
 * type, which reads as a ranking — on a racing site. These are `horses.slice(0, 4)`
 * in whatever order the API returned them: not a top four, not rated, not ordered by
 * anything at all. The numbering asserted a fact the data does not contain.
 */
export function LandingStables({ horses, horseConn, isAdmin }: LandingStablesProps) {
  const shown = (horses ?? []).slice(0, 4);

  return (
    <section>
      <SectionHead title="From the Stables" to="/horses" linkLabel="All profiles" />

      {shown.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-border/60 rounded-sm">
          <p className="font-[family-name:var(--font-display)] text-sm text-muted-foreground italic">
            The stables await their first thoroughbred.
          </p>
          {/* "Add a profile" is an editor's action; a reader cannot add one. */}
          {isAdmin && (
            <Link
              to="/horses"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Add a profile <ArrowRight size={12} />
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {shown.map((horse) => {
            const conn = horseConn(horse);
            const image = horse.imageUrl?.trim() ? horse.imageUrl : null;
            return (
              <li key={horse.id}>
                <Link
                  to={`/horses/${horse.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-primary/40"
                >
                  <div className="relative h-40 overflow-hidden bg-muted/40">
                    {image ? (
                      <img
                        src={image}
                        alt={`${horse.name} — thoroughbred racehorse`}
                        crossOrigin="anonymous"
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
                      />
                    ) : (
                      <span
                        className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground/40"
                        aria-hidden="true"
                      >
                        <ImageOff size={22} strokeWidth={1.5} />
                        <span className="text-[11px] tracking-[0.06em]">
                          No photograph on record
                        </span>
                      </span>
                    )}
                    {horse.colour && (
                      <span
                        className="absolute bottom-2.5 left-3 rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] backdrop-blur-sm"
                        style={{
                          background: 'hsl(var(--brand-accent) / 0.85)',
                          color: 'hsl(var(--primary-foreground))',
                        }}
                      >
                        {horse.colour}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-[family-name:var(--font-display)] text-lg font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
                      {horse.name}
                    </h3>
                    <div className="mt-2 h-px bg-border/60" />
                    <dl className="mt-2.5 space-y-1.5">
                      <div className="flex gap-2 text-[13px]">
                        <dt className="w-14 flex-shrink-0 text-muted-foreground">Trainer</dt>
                        <dd className="min-w-0 truncate text-foreground">{conn.trainer || '—'}</dd>
                      </div>
                      <div className="flex gap-2 text-[13px]">
                        <dt className="w-14 flex-shrink-0 text-muted-foreground">Jockey</dt>
                        <dd className="min-w-0 truncate text-foreground">{conn.jockey || '—'}</dd>
                      </div>
                    </dl>
                    <span className="mt-auto flex items-center justify-end gap-1 pt-3 text-[12px] font-semibold text-primary">
                      View profile <ChevronRight size={13} />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
