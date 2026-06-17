import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Play, Zap } from 'lucide-react';
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

// Editorial fallback when no lead article carries its own image.
const FALLBACK_HERO =
  'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

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

  const heroImage = heroArticle?.imageUrl || FALLBACK_HERO;
  const activeTicker = tickerItems[Math.min(tickerIdx, tickerItems.length - 1)];

  return (
    <>
      {/* ── Breaking News Ticker ─────────────────────────── */}
      {tickerItems.length > 0 && (
        <div
          className="border-b border-border/40 overflow-hidden"
          style={{ background: 'hsl(var(--brand-accent) / 0.08)' }}
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-1.5 flex items-center gap-4">
            <span
              className="flex-shrink-0 text-[9px] uppercase tracking-[0.18em] font-bold px-2 py-0.5 rounded-sm"
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
                  className="text-[11px] text-foreground/80 font-medium whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  {activeTicker.text}
                </motion.p>
              </AnimatePresence>
            </div>
            {tickerItems.length > 1 && (
              <span className="flex-shrink-0 text-[9px] tabular-nums text-foreground/40 font-semibold">
                {tickerIdx + 1}/{tickerItems.length}
              </span>
            )}
            <Zap size={12} className="flex-shrink-0 opacity-40" />
          </div>
        </div>
      )}

      {/* ── Hero Banner ─────────────────────────────────── */}
      <section className="relative w-full overflow-hidden">
        <div className="relative min-h-[600px] h-[80vh] max-h-[840px]">
          <img
            src={heroImage}
            alt={heroArticle?.title ?? 'Thoroughbred horses racing — dramatic action at the track'}
            crossOrigin="anonymous"
            width={1880}
            height={1300}
            fetchPriority="high"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Editorial dark scrims (left-weighted for legible copy) */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, hsl(150 36% 6% / 0.94) 0%, hsl(150 36% 6% / 0.72) 45%, hsl(150 36% 6% / 0.20) 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(0deg, hsl(150 36% 6% / 0.85) 0%, transparent 45%)',
            }}
          />

          <div className="relative h-full max-w-7xl mx-auto px-6 md:px-8 flex flex-col justify-center">
            <div className="max-w-2xl">
              {/* Eyebrow */}
              <div
                className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full"
                style={{
                  background: 'hsl(var(--brand-accent) / 0.15)',
                  border: '1px solid hsl(var(--brand-accent) / 0.45)',
                }}
              >
                <Zap size={11} style={{ color: 'hsl(var(--brand-accent))' }} />
                <span
                  className="text-[10px] uppercase tracking-[0.22em] font-bold"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  The Racing Record
                </span>
              </div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-[3.75rem] font-bold text-white leading-[1.05] mb-5"
              >
                The premium voice of{' '}
                <span style={{ color: 'hsl(var(--brand-accent))' }}>thoroughbred</span>{' '}
                racing
              </motion.h1>

              <p className="text-base md:text-lg text-white/75 leading-relaxed max-w-xl mb-8">
                Breaking news, expert analysis, exclusive interviews, and in-depth
                features from the world&rsquo;s greatest racetracks.
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-8">
                <Link
                  to={heroArticle ? `/articles/${heroArticle.id}` : '/news'}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Read Latest <ArrowRight size={15} />
                </Link>
                <Link
                  to="/podcast"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-sm bg-white/10 text-white border border-white/25 backdrop-blur-sm hover:bg-white/20 transition-colors"
                >
                  <Play size={14} /> Listen Now
                </Link>
              </div>

              {metrics && (metrics.activeMembers > 0 || metrics.articlesPublished > 0) && (
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/55 font-medium">
                  {metrics.activeMembers.toLocaleString()} member{metrics.activeMembers === 1 ? '' : 's'}
                  {' · '}
                  {metrics.articlesPublished.toLocaleString()} stor{metrics.articlesPublished === 1 ? 'y' : 'ies'} published
                </p>
              )}
            </div>
          </div>

          {/* Featured cover story chip — keeps dynamic content, desktop only */}
          {heroArticle && (
            <Link
              to={`/articles/${heroArticle.id}`}
              className="hidden lg:flex absolute bottom-8 right-8 max-w-[19rem] flex-col gap-2 p-4 rounded-sm backdrop-blur-md group transition-colors"
              style={{
                background: 'hsl(150 36% 6% / 0.55)',
                border: '1px solid hsl(0 0% 100% / 0.14)',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] uppercase tracking-[0.18em] font-bold px-2 py-0.5"
                  style={{
                    background: 'hsl(var(--brand-accent))',
                    color: 'hsl(var(--brand-accent-foreground))',
                  }}
                >
                  Cover Story
                </span>
                <span className="text-[9px] uppercase tracking-[0.12em] font-semibold text-white/55">
                  {heroArticle.category ?? 'Feature'}
                </span>
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-white leading-snug line-clamp-2 group-hover:text-[hsl(var(--brand-accent))] transition-colors">
                {heroArticle.title}
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-white/60">
                Read in full <ArrowRight size={11} />
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* ── Edition & Member Metrics Banner ─────────────── */}
      {metricCards.length > 0 && (
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex flex-wrap items-stretch divide-x divide-border">
            {metricCards.map((metric) => (
              <div
                key={metric.label}
                className="flex items-center gap-3 px-4 md:px-6 py-4 flex-1 min-w-[130px]"
              >
                <span className="text-primary opacity-80">{metric.icon}</span>
                <div>
                  <span className="block font-[family-name:var(--font-display)] text-xl font-bold tabular-nums leading-none text-foreground">
                    {metric.value}
                  </span>
                  <span className="block text-[9px] uppercase tracking-[0.1em] text-muted-foreground mt-1">
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
