import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Clock, PenLine, Star } from 'lucide-react';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleSkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Horse } from '@/types/horse';
import type { HorseConnections } from '@/lib/horseConnections';
import { SectionHead } from './SectionHead';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';

interface LandingFeaturedArticlesProps {
  articlesLoading: boolean;
  secondaryArticles: Article[];
  featuredArticles: Article[];
  horses: Horse[];
  horseConn: (horse: Horse) => HorseConnections;
  /** Staff see newsroom CTAs in empty states; readers get reader-facing ones. */
  isAdmin: boolean;
}

export function LandingFeaturedArticles({
  articlesLoading,
  secondaryArticles,
  featuredArticles,
  horses,
  horseConn,
  isAdmin,
}: LandingFeaturedArticlesProps) {
  // TWO sections in one component — News and Horses — so the switches are read
  // here rather than passed down: Landing.tsx cannot drop one half of a fragment.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);

  return (
    <>
      {/* ── Latest ───
          Was "Latest Dispatches". Accurate either way — these ARE
          `published.slice(1,4)`, the newest stories after the lead. */}
      {/* Both story blocks belong to News — "Analysis & Interviews" is a
          `?section=` cut of /news, not a surface of its own — so one switch
          governs the pair. */}
      {publicNav.news !== false && (
      <>
      <section>
        <SectionHead title="Latest" to="/news" linkLabel="All stories" />

        {articlesLoading ? (
          /* Skeleton grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <ArticleSkeletonCard key={i} />
            ))}
          </div>
        ) : secondaryArticles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {secondaryArticles.map((article, i) => (
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
             exists for them. */
          <EmptyState
            icon={PenLine}
            heading={
              isAdmin
                ? 'The press stands ready. No dispatches have been filed.'
                : 'No stories have been published yet.'
            }
            description={
              isAdmin
                ? 'Published stories will appear here. Head to the newsroom to file your first dispatch.'
                : 'The desk is still working on the first edition. The blog and the podcast are already open.'
            }
            ctaLabel={isAdmin ? 'Go to Newsroom' : 'Read the blog'}
            ctaHref={isAdmin ? '/production-system' : '/blog'}
          />
        )}
      </section>

      {/* ── Analysis & Interviews ───
          THE LABEL IS NOW TRUE. This said "Featured Analysis & Interviews" over
          `published.slice(4,7)` — the fifth, sixth and seventh newest stories,
          whatever their category. Nothing was featured and nothing was filtered, and
          the "All analysis" link beside it went to /news?section=analysis, which
          DOES filter — so the teaser and its destination disagreed about what the
          section was. Landing.tsx now selects on the real section axis; see
          `featuredArticles` there. */}
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
                        {article.category}
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
      )}

      {/* ── Horse profiles strip ───
          "Form the Stables" → "From the Stables". The old name read as a promise of
          FORM — ratings, recent runs — which these rows do not carry; they show a
          name and its trainer and jockey. (It may also simply have been a typo for
          "From".) */}
      {publicNav.horses !== false && (
      <section>
        <SectionHead title="From the Stables" to="/horses" linkLabel="All profiles" />

        <div className="space-y-0">
          {(horses ?? []).length === 0 ? (
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
            /* No `01 02 03 04` ordinals.
               Each row used to be numbered in gold display type, which reads as a
               ranking — a form table, on a racing site. These are `horses.slice(0,4)`
               in whatever order the API returned them: not a top four, not rated,
               not ordered by anything at all. The numbering was asserting a fact the
               data does not contain. */
            (horses ?? []).slice(0, 4).map((horse) => (
              <Link
                key={horse.id}
                to={`/horses/${horse.id}`}
                className="group flex items-center gap-4 py-3.5 border-b border-border/40 hover:bg-muted/20 transition-colors -mx-2 px-2 rounded-sm"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-[family-name:var(--font-display)] text-[15px] font-bold text-foreground leading-tight">
                    {horse.name}
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Trainer: {horseConn(horse).trainer || '—'} · Jockey: {horseConn(horse).jockey || '—'}
                  </p>
                </div>
                {horse.colour && (
                  <span className="hidden sm:block text-[11px] text-muted-foreground border border-border/60 px-2 py-0.5 rounded-sm flex-shrink-0">
                    {horse.colour}
                  </span>
                )}
                <Star
                  size={12}
                  className="flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors"
                />
                <ChevronRight
                  size={13}
                  className="flex-shrink-0 text-muted-foreground group-hover:text-foreground transition-colors"
                />
              </Link>
            ))
          )}
        </div>
      </section>
      )}
    </>
  );
}
