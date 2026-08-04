import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Clock, Mail, PenLine, Star } from 'lucide-react';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleSkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Horse } from '@/types/horse';
import type { HorseConnections } from '@/lib/horseConnections';

interface LandingFeaturedArticlesProps {
  articlesLoading: boolean;
  secondaryArticles: Article[];
  featuredArticles: Article[];
  horses: Horse[];
  horseConn: (horse: Horse) => HorseConnections;
}

export function LandingFeaturedArticles({
  articlesLoading,
  secondaryArticles,
  featuredArticles,
  horses,
  horseConn,
}: LandingFeaturedArticlesProps) {
  return (
    <>
      {/* ── Latest Dispatches ─── */}
      <section>
        <div className="flex items-center gap-4 mb-7">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground whitespace-nowrap">
            Latest Dispatches
          </h2>
          <div className="flex-1 h-px bg-border/50" />
          <Link
            to="/news"
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            All stories <ChevronRight size={11} />
          </Link>
        </div>

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
          <EmptyState
            icon={PenLine}
            heading="The press stands ready. No dispatches have been filed."
            description="Published stories will appear here. Head to the newsroom to file your first dispatch."
            ctaLabel="Go to Newsroom"
            ctaHref="/production-system"
          />
        )}
      </section>

      {/* ── Featured Analysis ─── */}
      <section>
        <div className="flex items-center gap-4 mb-7">
          <div
            className="flex-shrink-0 w-1 h-5 rounded-full"
            style={{ background: 'hsl(var(--brand-accent))' }}
          />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
            Featured Analysis &amp; Interviews
          </h2>
          <div className="flex-1 h-px bg-border/50" />
          {/* Was a /newsletter link. That page listed stories on a
              `newsletter` distribution channel; the axis is gone, so this points at
              the section these featured pieces actually live in. */}
          <Link
            to="/news?section=analysis"
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            All analysis <ArrowRight size={11} />
          </Link>
        </div>

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
                      <span
                        className="text-[9px] uppercase tracking-[0.14em] font-bold"
                        style={{ color: 'hsl(var(--brand-accent))' }}
                      >
                        {article.category}
                      </span>
                    </div>
                  )}
                  <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground leading-snug group-hover:opacity-[0.85] transition-opacity mb-1.5 line-clamp-2">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{article.author}</span>
                    {article.readingTime && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
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

      {/* ── Horse profiles strip ─── */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground whitespace-nowrap">
            Form the Stables
          </h2>
          <div className="flex-1 h-px bg-border/50" />
          <Link
            to="/horses"
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            All profiles <ChevronRight size={11} />
          </Link>
        </div>

        <div className="space-y-0">
          {(horses ?? []).length === 0 ? (
            <div className="py-10 text-center border border-dashed border-border/60 rounded-sm">
              <p className="font-[family-name:var(--font-display)] text-sm text-muted-foreground italic">
                The stables await their first thoroughbred.
              </p>
              <Link
                to="/horses"
                className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Add a profile <ArrowRight size={11} />
              </Link>
            </div>
          ) : (
            (horses ?? []).slice(0, 4).map((horse, idx) => (
              <Link
                key={horse.id}
                to={`/horses/${horse.id}`}
                className="group flex items-center gap-5 py-3.5 border-b border-border/40 hover:bg-muted/20 transition-colors -mx-2 px-2 rounded-sm"
              >
                <span
                  className="flex-shrink-0 w-7 font-[family-name:var(--font-display)] text-base font-bold tabular-nums"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-tight">
                    {horse.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Trainer: {horseConn(horse).trainer || '—'} · Jockey: {horseConn(horse).jockey || '—'}
                  </p>
                </div>
                {horse.colour && (
                  <span className="hidden sm:block text-[9px] uppercase tracking-[0.1em] text-muted-foreground border border-border/60 px-2 py-0.5 rounded-sm flex-shrink-0">
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
    </>
  );
}
