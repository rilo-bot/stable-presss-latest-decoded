import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useArticleStore } from '@/stores/articleStore';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleSkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import {
  Newspaper,
  BarChart2,
  Mic,
  ChevronRight,
  Search,
  PenLine,
  Clock,
  ArrowRight,
  Mail,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ── Category taxonomy ───────────────────────────────── */

interface CategoryDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  section: 'news' | 'analysis' | 'interviews';
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  // News
  {
    key: 'race-reports',
    label: 'Race Reports',
    icon: <Newspaper size={14} />,
    section: 'news',
    description: "Post-race analysis, results, and stewards' decisions from the track.",
  },
  {
    key: 'industry-news',
    label: 'Industry News',
    icon: <Newspaper size={14} />,
    section: 'news',
    description: 'Transfers, injuries, ownership changes, and industry developments.',
  },
  {
    key: 'morning-edition',
    label: 'Morning Edition',
    icon: <Newspaper size={14} />,
    section: 'news',
    description: "Today's stables dispatch — stable reports, scratchings, and early market moves.",
  },
  // Analysis
  {
    key: 'form-guide',
    label: 'Form Guide',
    icon: <BarChart2 size={14} />,
    section: 'analysis',
    description: 'Deep-dive speed ratings, class assessments, and sectional analysis.',
  },
  {
    key: 'track-notes',
    label: 'Track Notes',
    icon: <BarChart2 size={14} />,
    section: 'analysis',
    description: 'Going reports, track configurations, and bias assessments.',
  },
  {
    key: 'bloodstock',
    label: 'Bloodstock',
    icon: <BarChart2 size={14} />,
    section: 'analysis',
    description: 'Pedigree analysis, stallion updates, and breeding trends.',
  },
  // Interviews
  {
    key: 'trainer-profiles',
    label: 'Trainer Profiles',
    icon: <Mic size={14} />,
    section: 'interviews',
    description: 'Long-form conversations with the trainers shaping the sport.',
  },
  {
    key: 'jockey-desk',
    label: 'Jockey Desk',
    icon: <Mic size={14} />,
    section: 'interviews',
    description: 'Rider perspectives, riding patterns, and form from the saddle.',
  },
  {
    key: 'owner-stories',
    label: 'Owner Stories',
    icon: <Mic size={14} />,
    section: 'interviews',
    description: 'The people behind the horses — their passion, partnerships, and ambitions.',
  },
];

const SECTIONS = [
  {
    key: 'news',
    label: 'News',
    icon: <Newspaper size={15} />,
    description: 'Race results, industry updates, and daily dispatches from the track.',
  },
  {
    key: 'analysis',
    label: 'Analysis',
    icon: <BarChart2 size={15} />,
    description: 'Form guides, track notes, and bloodstock intelligence from our expert panel.',
  },
  {
    key: 'interviews',
    label: 'Interviews',
    icon: <Mic size={15} />,
    description: 'In-depth conversations with trainers, jockeys, and the owners who drive the sport.',
  },
] as const;

/* ── Static featured editorial (shown when no articles yet) ── */

const EDITORIAL_FEATURES = [
  {
    id: 'ef1',
    section: 'Analysis',
    title: 'The Flemington Straight: Why the 1000m Bias Has Shifted',
    author: 'Sarah Ellison',
    time: '10 min read',
    category: 'form-guide',
    imageUrl:
      'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef2',
    section: 'Interview',
    title: 'Trainer Evelyn Cross: Twelve Group Ones and Counting',
    author: 'Catherine Darragh',
    time: '8 min read',
    category: 'trainer-profiles',
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef3',
    section: 'Bloodstock',
    title: 'Northern Hemisphere Stallions and Their Australian Influence',
    author: 'James Whitfield',
    time: '12 min read',
    category: 'bloodstock',
    imageUrl:
      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef4',
    section: 'Race Report',
    title: 'Sovereign Streak Wins Flemington Feature in Dominant Fashion',
    author: 'Tom McAllister',
    time: '6 min read',
    category: 'race-reports',
    imageUrl:
      'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef5',
    section: 'Jockey Desk',
    title: 'The Art of the Hold-up Ride: Luke Dittman on Patience and Precision',
    author: 'Rebecca Frame',
    time: '9 min read',
    category: 'jockey-desk',
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef6',
    section: 'Morning Edition',
    title: "Saturday's Stable Reports: Randwick Scratching and Market Movers",
    author: 'Editorial Desk',
    time: '4 min read',
    category: 'morning-edition',
    imageUrl:
      'https://images.pexels.com/photos/18913040/pexels-photo-18913040.jpeg?auto=compress&cs=tinysrgb&h=350',
  },
];

/* ── Helpers ─────────────────────────────────────────── */

/** Articles that are visible on the public index */
const LIVE_STATUSES = ['published', 'newsletter', 'bulletin'] as const;

function isLive(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}

/* ── Component ────────────────────────────────────────── */

export default function NewsIndex() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);
  // === end auto fetch-on-mount ===

  const [searchParams, setSearchParams] = useSearchParams();
  const articles = useArticleStore((s) => s.articles);

  const categoryParam = searchParams.get('category') ?? null;
  const sectionParam = searchParams.get('section') ?? null;

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  // All live articles (published + newsletter + bulletin)
  const liveArticles = useMemo(
    () => (articles ?? []).filter((a) => isLive(a.status)),
    [articles]
  );

  // Derive the active section from the category param
  const activeSection = useMemo(() => {
    if (sectionParam) return sectionParam;
    if (categoryParam) {
      const cat = CATEGORIES.find((c) => c.key === categoryParam);
      return cat?.section ?? null;
    }
    return null;
  }, [categoryParam, sectionParam]);

  const activeCategory = categoryParam;

  // Filter live articles by category and search
  const filteredArticles = useMemo(() => {
    let base = liveArticles;
    if (activeCategory) {
      base = base.filter((a) => (a.category ?? '') === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          (a.category ?? '').toLowerCase().includes(q)
      );
    }
    return base;
  }, [liveArticles, activeCategory, search]);

  // Editorial features filtered by section/category for the showcase
  const showcaseFeatures = useMemo(() => {
    if (activeCategory) {
      return EDITORIAL_FEATURES.filter((f) => f.category === activeCategory);
    }
    if (activeSection) {
      const catKeys = CATEGORIES.filter((c) => c.section === activeSection).map((c) => c.key);
      return EDITORIAL_FEATURES.filter((f) => catKeys.includes(f.category));
    }
    return EDITORIAL_FEATURES;
  }, [activeCategory, activeSection]);

  const currentCategoryDef = activeCategory
    ? CATEGORIES.find((c) => c.key === activeCategory)
    : null;

  const currentSectionDef = activeSection
    ? SECTIONS.find((s) => s.key === activeSection)
    : null;

  const setCategory = (key: string | null) => {
    setSearch('');
    if (!key) {
      setSearchParams({});
    } else {
      setSearchParams({ category: key });
    }
  };

  const setSection = (key: string | null) => {
    setSearch('');
    if (!key) {
      setSearchParams({});
    } else {
      setSearchParams({ section: key });
    }
  };

  const pageTitle = currentCategoryDef?.label ?? currentSectionDef?.label ?? 'All Editorial';
  const pageDesc =
    currentCategoryDef?.description ??
    currentSectionDef?.description ??
    'The full Stable Press editorial record — race reports, analysis, interviews, and paddock intelligence from the thoroughbred racing world.';

  // Channel split for when no filters applied
  const newsletterArticles = useMemo(
    () => filteredArticles.filter((a) => a.status === 'newsletter'),
    [filteredArticles]
  );
  const bulletinArticles = useMemo(
    () => filteredArticles.filter((a) => a.status === 'bulletin'),
    [filteredArticles]
  );
  const publishedOnly = useMemo(
    () => filteredArticles.filter((a) => a.status === 'published'),
    [filteredArticles]
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ── Page Header Band ─────────────────────────── */}
      <div className="bg-primary text-primary-foreground border-b border-primary/80">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary-foreground/50 mb-4">
            <Link to="/" className="hover:text-primary-foreground/80 transition-colors">
              Home
            </Link>
            <ChevronRight size={10} />
            {currentCategoryDef && currentSectionDef ? (
              <>
                <button
                  onClick={() => setSection(currentSectionDef.key)}
                  className="hover:text-primary-foreground/80 transition-colors capitalize"
                >
                  {currentSectionDef.label}
                </button>
                <ChevronRight size={10} />
                <span className="text-primary-foreground/80">{currentCategoryDef.label}</span>
              </>
            ) : currentSectionDef ? (
              <span className="text-primary-foreground/80 capitalize">{currentSectionDef.label}</span>
            ) : (
              <span className="text-primary-foreground/80">All Editorial</span>
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-end gap-5 justify-between">
            <div>
              {currentSectionDef && (
                <div className="flex items-center gap-2 mb-2 text-primary-foreground/60">
                  <span style={{ color: 'hsl(var(--brand-accent))' }}>{currentSectionDef.icon}</span>
                  <span
                    className="text-[9px] uppercase tracking-[0.2em] font-bold"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {currentSectionDef.label}
                  </span>
                </div>
              )}
              <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-primary-foreground leading-tight mb-2">
                {pageTitle}
              </h1>
              <p className="text-sm text-primary-foreground/65 max-w-2xl leading-relaxed">
                {pageDesc}
              </p>
            </div>

            {/* Search */}
            <div className="relative md:w-72 flex-shrink-0">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-foreground/40 pointer-events-none"
              />
              <input
                type="search"
                placeholder="Search articles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-primary-foreground/20 rounded-sm bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary-foreground/30"
                aria-label="Search articles"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section + Category pills ──────────────────── */}
      <div className="sticky top-[calc(var(--navbar-h,106px))] z-30 border-b border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* Top row: section pills */}
          <div className="flex items-center gap-1 pt-3 pb-2 overflow-x-auto">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border',
                !activeSection && !activeCategory
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              All
            </button>
            {SECTIONS.map((sec) => (
              <button
                key={sec.key}
                onClick={() => setSection(sec.key)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border',
                  activeSection === sec.key && !activeCategory
                    ? 'bg-primary text-primary-foreground border-primary'
                    : activeSection === sec.key
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <span className="opacity-60">{sec.icon}</span>
                {sec.label}
              </button>
            ))}

            {/* Newsletter shortcut */}
            <Link
              to="/newsletter"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border border-border/60 text-muted-foreground hover:text-foreground hover:border-border ml-auto"
            >
              <Mail size={13} />
              Newsletter
            </Link>
          </div>

          {/* Second row: category sub-pills (shown when a section is active) */}
          {activeSection && (
            <div className="flex items-center gap-1 pb-2.5 overflow-x-auto">
              {CATEGORIES.filter((c) => c.section === activeSection).map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors border',
                    activeCategory === cat.key
                      ? 'border-transparent text-primary-foreground'
                      : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border bg-transparent'
                  )}
                  style={
                    activeCategory === cat.key
                      ? { background: 'hsl(var(--brand-accent))', borderColor: 'hsl(var(--brand-accent))' }
                      : undefined
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main body ─────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">

        {/* When no user-published articles, show editorial showcase + CTA */}
        {liveArticles.length === 0 && !search ? (
          <div className="space-y-12">
            {/* Showcase grid — static editorial items */}
            <section>
              <div className="flex items-center gap-4 mb-7">
                <div
                  className="flex-shrink-0 w-1 h-5 rounded-full"
                  style={{ background: 'hsl(var(--brand-accent))' }}
                />
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                  {currentCategoryDef?.label ?? currentSectionDef?.label ?? 'Featured Editorial'}
                </h2>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground italic">
                  Editorial showcase
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(showcaseFeatures.length > 0 ? showcaseFeatures : EDITORIAL_FEATURES).map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.2, ease: 'easeOut' }}
                  >
                    <Link
                      to="/news"
                      className="group block border border-border/60 rounded-sm overflow-hidden bg-card hover:border-primary/30 transition-colors"
                      aria-label={`Read: ${item.title}`}
                    >
                      <div className="relative h-44 overflow-hidden">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-transparent to-transparent" />
                        <span
                          className="absolute top-3 left-3 text-[8px] uppercase tracking-[0.18em] font-bold px-2 py-0.5"
                          style={{
                            background: 'hsl(var(--brand-accent))',
                            color: 'hsl(var(--brand-accent-foreground))',
                          }}
                        >
                          {item.section}
                        </span>
                      </div>
                      <div className="p-4">
                        <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2 group-hover:opacity-[0.85] transition-opacity">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>{item.author}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock size={9} />
                            {item.time}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* CTA prompt */}
            <div className="border border-dashed border-primary/30 rounded-sm p-8 text-center bg-primary/5">
              <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-4">
                <PenLine size={20} className="text-primary" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground mb-2">
                The press stands ready. No dispatches have been filed.
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
                Published stories from the Newsroom will appear here. Head to the Newsroom Production System to file your first dispatch.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
                  <Link to="/newsroom">
                    Go to Newsroom Production System
                    <ArrowRight size={14} />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Return to Home</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : loading ? (
          /* Skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ArticleSkeletonCard key={i} />
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          /* Empty search/filter result */
          <EmptyState
            icon={Search}
            heading={
              search
                ? 'No articles match that search.'
                : `No ${pageTitle} articles published yet.`
            }
            description={
              search
                ? 'Try a different search term or browse a different section.'
                : 'Stories published under this category will appear here once filed and approved through the Newsroom.'
            }
            ctaLabel={search ? 'Clear Search' : 'View All Editorial'}
            onCta={() => {
              if (search) {
                setSearch('');
              } else {
                setCategory(null);
              }
            }}
          />
        ) : (
          /* Article grid */
          <div className="space-y-12">
            {/* Result count */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                {filteredArticles.length} {filteredArticles.length === 1 ? 'story' : 'stories'}
              </span>
              <div className="flex-1 h-px bg-border/40" />
              {(activeCategory || activeSection || search) && (
                <button
                  onClick={() => { setCategory(null); setSearch(''); }}
                  className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Newsletter channel band — shown when there are newsletter articles */}
            {newsletterArticles.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="flex items-center gap-2 px-3 py-1 rounded-sm"
                    style={{ background: 'hsl(var(--chart-1) / 0.12)' }}
                  >
                    <Mail size={12} style={{ color: 'hsl(var(--chart-1))' }} />
                    <span
                      className="text-[9px] uppercase tracking-[0.18em] font-bold"
                      style={{ color: 'hsl(var(--chart-1))' }}
                    >
                      Newsletter
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border/40" />
                  <Link
                    to="/newsletter"
                    className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Full newsletter <ChevronRight size={10} />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {newsletterArticles.map((article, idx) => (
                    <motion.div
                      key={article.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
                    >
                      <ArticleCard article={article} variant="default" />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Bulletin channel band — links to /bulletins */}
            {bulletinArticles.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="flex items-center gap-2 px-3 py-1 rounded-sm"
                    style={{ background: 'hsl(var(--brand-accent) / 0.12)' }}
                  >
                    <BookOpen size={12} style={{ color: 'hsl(var(--brand-accent))' }} />
                    <span
                      className="text-[9px] uppercase tracking-[0.18em] font-bold"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      Print Bulletin
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border/40" />
                  <Link
                    to="/bulletins"
                    className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Full bulletin <ChevronRight size={10} />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {bulletinArticles.map((article, idx) => (
                    <motion.div
                      key={article.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
                    >
                      <ArticleCard article={article} variant="default" />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Published articles */}
            {publishedOnly.length > 0 && (
              <section>
                {(newsletterArticles.length > 0 || bulletinArticles.length > 0) && (
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-sm bg-primary/10">
                      <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-primary">
                        Published
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {publishedOnly.map((article, idx) => (
                    <motion.div
                      key={article.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.18, ease: 'easeOut' }}
                    >
                      <ArticleCard article={article} variant="default" />
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* ── Browse sections strip ─────────────────────── */}
      {!activeSection && !activeCategory && (
        <div className="border-t border-border/50 bg-muted/30 py-10 mt-4">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground mb-6">
              Browse by section
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SECTIONS.map((sec) => {
                const cats = CATEGORIES.filter((c) => c.section === sec.key);
                return (
                  <div
                    key={sec.key}
                    className="border border-border/60 rounded-sm bg-card overflow-hidden hover:border-primary/30 transition-colors"
                  >
                    <button
                      onClick={() => setSection(sec.key)}
                      className="w-full text-left px-5 py-4 border-b border-border/40 hover:bg-muted/30 transition-colors flex items-center gap-2"
                    >
                      <span className="text-primary">{sec.icon}</span>
                      <span className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
                        {sec.label}
                      </span>
                      <ChevronRight size={13} className="ml-auto text-muted-foreground" />
                    </button>
                    <div className="divide-y divide-border/40">
                      {cats.map((cat) => (
                        <button
                          key={cat.key}
                          onClick={() => setCategory(cat.key)}
                          className="w-full text-left px-5 py-3 hover:bg-muted/20 transition-colors flex items-center justify-between group"
                        >
                          <div>
                            <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              {cat.label}
                            </span>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 leading-relaxed">
                              {cat.description}
                            </p>
                          </div>
                          <ChevronRight
                            size={11}
                            className="flex-shrink-0 ml-2 text-muted-foreground group-hover:text-primary transition-colors"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}