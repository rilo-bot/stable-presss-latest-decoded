import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useArticleStore } from '@/stores/articleStore';
import { CATEGORIES } from '@/pages/NewsIndex';
import { cn } from '@/lib/utils';
import {
  Mail,
  BookOpen,
  Newspaper,
  BarChart2,
  Mic,
  ChevronRight,
  Clock,
  ArrowRight,
  Search,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ── Section icon map ───────────────────────────────── */

const SECTION_ICONS: Record<string, React.ReactNode> = {
  news: <Newspaper size={13} />,
  analysis: <BarChart2 size={13} />,
  interviews: <Mic size={13} />,
};

const SECTION_IMAGES: Record<string, string> = {
  news: 'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  analysis: 'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  interviews: 'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
};

/* ── Component ────────────────────────────────────────── */

export default function Newsletter() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);
  // === end auto fetch-on-mount ===

  const [searchParams, setSearchParams] = useSearchParams();
  const articles = useArticleStore((s) => s.articles);

  const categoryParam = searchParams.get('category') ?? null;

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // Production System articles — newsletter status ONLY (bulletin articles go to /bulletins)
  const newsletterArticles = useMemo(() => {
    let base = (articles ?? []).filter((a) => a.status === 'newsletter');
    if (categoryParam) base = base.filter((a) => (a.category ?? '') === categoryParam);
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
  }, [articles, categoryParam, search]);

  const hasCmsArticles = newsletterArticles.length > 0;

  type AnyItem = (typeof newsletterArticles)[0];

  const source: AnyItem[] = newsletterArticles;

  // Group articles by category section
  const sections = useMemo(() => {
    const grouped: {
      section: string;
      cats: { catDef: (typeof CATEGORIES)[0]; items: AnyItem[] }[];
    }[] = [];
    const allSections = ['news', 'analysis', 'interviews'] as const;
    for (const sec of allSections) {
      const cats = CATEGORIES.filter((c) => c.section === sec);
      const secItems = cats
        .map((catDef) => ({
          catDef,
          items: source.filter((item) => (item.category ?? '') === catDef.key),
        }))
        .filter((g) => g.items.length > 0);
      if (secItems.length > 0) {
        grouped.push({ section: sec, cats: secItems });
      }
    }
    return grouped;
  }, [source]);

  const heroItem = source[0] ?? null;

  const setCategory = (key: string | null) => {
    if (key) {
      setSearchParams({ category: key });
    } else {
      setSearchParams({});
    }
  };

  const currentCatDef = categoryParam ? CATEGORIES.find((c) => c.key === categoryParam) : null;

  const totalItems = source.length;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Masthead hero ───────────────────────────── */}
      <div className="relative w-full overflow-hidden bg-primary">
        <img
          src="https://images.pexels.com/photos/18913040/pexels-photo-18913040.jpeg?auto=compress&cs=tinysrgb&h=400&w=940"
          alt="Racing editorial hero"
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover opacity-10"
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary-foreground/50 mb-6">
            <Link to="/" className="hover:text-primary-foreground/80 transition-colors">Home</Link>
            <ChevronRight size={10} />
            <Link to="/news" className="hover:text-primary-foreground/80 transition-colors">Editorial</Link>
            <ChevronRight size={10} />
            <span className="text-primary-foreground/80">Newsletter</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] font-bold px-2.5 py-1 rounded-sm"
                  style={{
                    background: 'hsl(var(--brand-accent))',
                    color: 'hsl(var(--brand-accent-foreground))',
                  }}
                >
                  <Mail size={10} />
                  Stable Press
                </span>
                <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-primary-foreground/50">
                  Weekly Newsletter
                </span>
              </div>

              <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-bold text-primary-foreground leading-[1.05] mb-3">
                {currentCatDef ? currentCatDef.label : 'This Week in Racing'}
              </h1>
              <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-lg">
                Stories distributed via the Stable Press weekly email newsletter — curated racing intelligence delivered every week.
              </p>

              {/* Cross-link to Bulletins */}
              <div className="mt-4 flex items-center gap-2">
                <Link
                  to="/bulletins"
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-1.5 rounded-sm border border-primary-foreground/20 text-primary-foreground/70 hover:text-primary-foreground hover:border-primary-foreground/40 transition-colors"
                >
                  <BookOpen size={10} />
                  Fortnightly Print Bulletin
                  <ArrowRight size={10} />
                </Link>
              </div>
            </div>

            {/* Stats strip */}
            <div className="flex flex-wrap gap-6 lg:justify-end">
              {[
                { label: 'Subscribers', value: '12,840' },
                { label: 'Issues Published', value: '47' },
                { label: 'This Edition', value: `${totalItems} ${totalItems === 1 ? 'story' : 'stories'}` },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span
                    className="block font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {s.value}
                  </span>
                  <span className="block text-[9px] uppercase tracking-[0.14em] text-primary-foreground/50 mt-0.5">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Gold masthead rule ────────────────────────── */}
      <div
        className="h-[3px] w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, hsl(var(--brand-accent)) 20%, hsl(var(--brand-accent)) 80%, transparent 100%)',
        }}
      />

      {/* ── Category + search filter bar ─────────────── */}
      <div className="sticky top-[calc(var(--navbar-h,106px))] z-30 border-b border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-1 pt-3 pb-2 overflow-x-auto">
            {/* Channel badge — decorative, links to bulletin page */}
            <span
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground border-transparent"
              style={{ background: 'hsl(var(--chart-1))' }}
            >
              <Mail size={11} className="opacity-80" />
              Newsletter
            </span>

            {/* Separator */}
            <span className="flex-shrink-0 w-px h-5 bg-border/50 mx-1" />

            {/* Bulletin cross-link */}
            <Link
              to="/bulletins"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
            >
              <BookOpen size={11} className="opacity-60" />
              Print Bulletin
              <ArrowRight size={10} className="opacity-40" />
            </Link>

            {/* Search */}
            <div className="relative ml-auto flex-shrink-0 w-40 md:w-56">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <input
                type="search"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-border/50 rounded-sm bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Search newsletter articles"
              />
            </div>
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-1 pb-2.5 overflow-x-auto">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                'flex-shrink-0 px-2.5 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.08em] border transition-colors',
                !categoryParam
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              All topics
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key === categoryParam ? null : cat.key)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.08em] border transition-colors',
                  categoryParam === cat.key
                    ? 'border-transparent text-primary-foreground'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  categoryParam === cat.key
                    ? { background: 'hsl(var(--brand-accent))', borderColor: 'hsl(var(--brand-accent))' }
                    : undefined
                }
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">

        {loading ? (
          /* Skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="border border-border/40 rounded-sm overflow-hidden bg-card animate-pulse">
                <div className="h-44 bg-muted/40" />
                <div className="p-4 space-y-2">
                  <div className="h-3 bg-muted/60 rounded w-1/3" />
                  <div className="h-4 bg-muted/60 rounded w-full" />
                  <div className="h-4 bg-muted/60 rounded w-3/4" />
                  <div className="h-3 bg-muted/40 rounded w-1/4 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : sections.length === 0 ? (
          /* Empty state */
          <div className="py-20 text-center max-w-md mx-auto">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'hsl(var(--primary) / 0.1)' }}
            >
              <Mail size={24} className="text-primary" />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
              {search ? 'No articles match that search.' : 'No newsletter stories yet.'}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {search
                ? 'Try a different search term or browse a different category.'
                : 'Stories moved to the Newsletter stage in the Newsroom Production System will appear here, organised by their editorial category.'}
            </p>
            {search ? (
              <Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
                  <Link to="/newsroom">
                    Go to Newsroom Production System
                    <ArrowRight size={14} />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/bulletins">
                    <BookOpen size={14} />
                    Browse Bulletins
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-16">

            {/* ── Hero feature ── */}
            {heroItem && !categoryParam && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {(() => {
                  const catDef = CATEGORIES.find((c) => c.key === heroItem.category);
                  const heroImageUrl = (heroItem as any).imageUrl ?? SECTION_IMAGES[catDef?.section ?? 'news'];

                  const heroContent = (
                    <div className="relative rounded-sm overflow-hidden border border-border/60 group">
                      <div className="relative h-[45vh] min-h-[320px] max-h-[520px] overflow-hidden">
                        <img
                          src={heroImageUrl}
                          alt={heroItem.title}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/95 via-foreground/40 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-foreground/25 via-transparent to-transparent" />

                        {/* Badges */}
                        <div className="absolute top-5 left-5 flex items-center gap-2">
                          <span
                            className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] font-bold px-2.5 py-1"
                            style={{ background: 'hsl(var(--chart-1))', color: 'hsl(var(--primary-foreground))' }}
                          >
                            <Mail size={9} />
                            Newsletter
                          </span>
                          {catDef && (
                            <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-primary-foreground/60 px-2 py-0.5 border border-primary-foreground/20">
                              {catDef.label}
                            </span>
                          )}
                        </div>

                        {/* Headline block */}
                        <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 md:px-10 md:pb-10 max-w-4xl">
                          <span
                            className="inline-block text-[9px] uppercase tracking-[0.18em] font-bold mb-3"
                            style={{ color: 'hsl(var(--brand-accent))' }}
                          >
                            Cover Story
                          </span>
                          <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-primary-foreground leading-[1.1] mb-3 max-w-2xl group-hover:opacity-90 transition-opacity">
                            {heroItem.title}
                          </h2>
                          {(heroItem as any).summary && (
                            <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-xl mb-4 line-clamp-2">
                              {(heroItem as any).summary}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-primary-foreground/60 text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                                style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                              >
                                {heroItem.author.charAt(0)}
                              </div>
                              {heroItem.author}
                            </span>
                            {heroItem.readingTime && (
                              <>
                                <span className="opacity-30">·</span>
                                <span className="flex items-center gap-1">
                                  <Clock size={10} />
                                  {heroItem.readingTime} min read
                                </span>
                              </>
                            )}
                            {(heroItem as any).publishedAt && (
                              <>
                                <span className="opacity-30">·</span>
                                <span className="flex items-center gap-1">
                                  <Calendar size={10} />
                                  {new Date((heroItem as any).publishedAt).toLocaleDateString('en-AU', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </>
                            )}
                            <span
                              className="ml-2 flex items-center gap-1 px-3 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground"
                              style={{ background: 'hsl(var(--brand-accent))' }}
                            >
                              Read in full <ArrowRight size={10} />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  if (hasCmsArticles && (heroItem as any).id) {
                    return (
                      <Link to={`/articles/${(heroItem as any).id}`} aria-label={`Read: ${heroItem.title}`}>
                        {heroContent}
                      </Link>
                    );
                  }
                  return heroContent;
                })()}
              </motion.section>
            )}

            {/* ── Category sections ── */}
            {sections.map((group, groupIdx) => (
              <section key={group.section}>
                {/* Section header */}
                <div className="flex items-center gap-4 mb-8">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
                    style={{ background: 'hsl(var(--primary) / 0.08)' }}
                  >
                    <span className="text-primary">{SECTION_ICONS[group.section]}</span>
                    <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-primary">
                      {group.section.charAt(0).toUpperCase() + group.section.slice(1)}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border/50" />
                </div>

                {group.cats.map((catGroup) => {
                  const { catDef, items } = catGroup;
                  const isExpanded = expandedSection === catDef.key || items.length <= 3;

                  return (
                    <div key={catDef.key} className="mb-10">
                      {/* Category sub-header */}
                      <div className="flex items-center gap-3 mb-5">
                        <div
                          className="flex-shrink-0 w-1 h-4 rounded-full"
                          style={{ background: 'hsl(var(--brand-accent))' }}
                        />
                        <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
                          {catDef.label}
                        </h3>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-semibold">
                          {items.length} {items.length === 1 ? 'story' : 'stories'}
                        </span>
                        <div className="flex-1 h-px bg-border/40" />
                        <Link
                          to={`/news?category=${catDef.key}`}
                          className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          News index <ChevronRight size={10} />
                        </Link>
                      </div>

                      {/* Articles grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {(isExpanded ? items : items.slice(0, 3)).map((item, itemIdx) => {
                          const isReal = hasCmsArticles && (item as any).id && !(item as any).id.startsWith('fb');
                          const itemImageUrl = (item as any).imageUrl ?? SECTION_IMAGES[catDef.section];

                          const cardContent = (
                            <div className="group border border-border/60 rounded-sm overflow-hidden bg-card hover:border-primary/30 transition-colors h-full flex flex-col">
                              {/* Card image */}
                              <div className="relative h-40 overflow-hidden flex-shrink-0">
                                <img
                                  src={itemImageUrl}
                                  alt={item.title}
                                  crossOrigin="anonymous"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
                                <span
                                  className="absolute top-2.5 left-2.5 flex items-center gap-1 text-[8px] uppercase tracking-[0.16em] font-bold px-2 py-0.5"
                                  style={{ background: 'hsl(var(--chart-1))', color: 'hsl(var(--primary-foreground))' }}
                                >
                                  <Mail size={8} />
                                  Newsletter
                                </span>
                              </div>

                              {/* Card body */}
                              <div className="p-4 flex flex-col flex-1">
                                <span
                                  className="text-[9px] uppercase tracking-[0.14em] font-bold mb-2"
                                  style={{ color: 'hsl(var(--brand-accent))' }}
                                >
                                  {catDef.label}
                                </span>
                                <h4 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2 group-hover:opacity-[0.85] transition-opacity flex-1">
                                  {item.title}
                                </h4>
                                {(item as any).summary && (
                                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                                    {(item as any).summary}
                                  </p>
                                )}
                                <div className="flex items-center justify-between mt-auto">
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span>{item.author}</span>
                                    {item.readingTime && (
                                      <>
                                        <span>·</span>
                                        <span className="flex items-center gap-0.5">
                                          <Clock size={9} />
                                          {item.readingTime}m
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <span className="text-[9px] uppercase tracking-[0.08em] font-semibold text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    Read <ArrowRight size={9} />
                                  </span>
                                </div>
                              </div>
                            </div>
                          );

                          const itemKey = (item as any).id ?? `item-${groupIdx}-${itemIdx}`;

                          return (
                            <motion.div
                              key={itemKey}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: itemIdx * 0.04 + groupIdx * 0.05, duration: 0.22, ease: 'easeOut' }}
                            >
                              {isReal ? (
                                <Link
                                  to={`/articles/${(item as any).id}`}
                                  className="block h-full"
                                  aria-label={`Read: ${item.title}`}
                                >
                                  {cardContent}
                                </Link>
                              ) : (
                                cardContent
                              )}
                            </motion.div>
                          );
                        })}
                      </div>

                      {/* Show more */}
                      {items.length > 3 && !isExpanded && (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() => setExpandedSection(catDef.key)}
                            className="text-[11px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mx-auto"
                          >
                            Show {items.length - 3} more in {catDef.label}
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Cross-promote Bulletins ───────────────────── */}
      <div
        className="border-t border-border/50 py-10"
        style={{ background: 'hsl(var(--brand-accent) / 0.06)' }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center gap-6 justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-sm flex items-center justify-center flex-shrink-0"
              style={{ background: 'hsl(var(--brand-accent) / 0.15)' }}
            >
              <BookOpen size={22} style={{ color: 'hsl(var(--brand-accent))' }} />
            </div>
            <div>
              <p
                className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                Fortnightly Print Bulletin
              </p>
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold italic text-foreground leading-tight">
                For deeper reading, try the Print Bulletin.
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Longform pieces, in-depth trainer profiles, and bloodstock intelligence — published fortnightly.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="flex-shrink-0 text-sm font-semibold gap-1.5"
            style={{
              background: 'hsl(var(--brand-accent))',
              color: 'hsl(var(--brand-accent-foreground))',
            }}
          >
            <Link to="/bulletins">
              Browse Bulletins
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Subscribe band ─────────────────────────────── */}
      <div className="border-t border-border/50 bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <span
              className="inline-block text-[9px] uppercase tracking-[0.22em] font-bold mb-3 px-2.5 py-1"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              Subscribe
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold text-primary-foreground leading-tight mb-2">
              Receive every edition, direct to your inbox.
            </h2>
            <p className="text-sm text-primary-foreground/70 leading-relaxed">
              Weekly newsletter and fortnightly print bulletin — the definitive record of thoroughbred racing in Australia.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              asChild
              size="lg"
              className="flex-1 text-sm font-semibold"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              <Link to="/signup">Start Membership</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="flex-1 text-sm border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
            >
              <Link to="/news">Browse Editorial</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}