import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useArticleStore } from '@/stores/articleStore';
import { useIssueStore } from '@/stores/issueStore';
import { CATEGORIES } from '@/pages/NewsIndex';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  ChevronRight,
  Clock,
  ArrowRight,
  Search,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SectionGrid from '@/pages/bulletins/SectionGrid';
import VenueMap from '@/pages/bulletins/VenueMap';
import { useArticleGroups } from '@/pages/bulletins/useArticleGroups';

/* ── Component ────────────────────────────────────────── */

export default function Bulletins() {
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

  // Published magazine issues (server-persisted bulletin builder output). The
  // list endpoint already returns non-unpublished issues sorted newest-first.
  const publishedIssues = useIssueStore((s) => s.issues);
  const fetchIssues = useIssueStore((s) => s.fetchIssues);
  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // Production System bulletin articles
  const { source, hasCmsArticles, sections, heroItem } = useArticleGroups(
    articles,
    'bulletin',
    categoryParam,
    search
  );

  const currentCatDef = categoryParam ? CATEGORIES.find((c) => c.key === categoryParam) : null;

  const setCategory = (key: string | null) => {
    if (!key) {
      setSearchParams({});
    } else {
      setSearchParams({ category: key });
    }
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Broadsheet masthead ──────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: 'hsl(150 34% 9%)' }}
      >
        <img
          src="https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=400&w=940"
          alt="Print bulletin editorial"
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        {/* Dark editorial scrim — keeps copy legible over the photo */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, hsl(150 36% 7% / 0.92) 0%, hsl(150 36% 7% / 0.60) 55%, hsl(150 36% 7% / 0.28) 100%)',
          }}
        />

        {/* Broadsheet column rules overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.05 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-primary-foreground"
              style={{ left: `${(i / 6) * 100}%` }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-16">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary-foreground/50 mb-6">
            <Link to="/" className="hover:text-primary-foreground/80 transition-colors">
              Home
            </Link>
            <ChevronRight size={10} />
            <span className="text-primary-foreground/80">Print Bulletin</span>
            {currentCatDef && (
              <>
                <ChevronRight size={10} />
                <span className="text-primary-foreground/80">{currentCatDef.label}</span>
              </>
            )}
          </nav>

          {/* Masthead rule */}
          <div className="mb-6">
            <div
              className="h-[2px] w-full mb-4"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, hsl(var(--brand-accent)) 30%, hsl(var(--brand-accent)) 70%, transparent 100%)',
              }}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] font-bold px-2.5 py-1"
                    style={{
                      background: 'hsl(var(--brand-accent))',
                      color: 'hsl(var(--brand-accent-foreground))',
                    }}
                  >
                    <BookOpen size={10} />
                    Stable Press
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-primary-foreground/50">
                    Fortnightly Print Bulletin
                  </span>
                </div>

                <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-6xl font-bold text-primary-foreground leading-[1.02] mb-3 italic">
                  {currentCatDef ? currentCatDef.label : 'The Bulletin'}
                </h1>
                <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-lg">
                  {currentCatDef
                    ? currentCatDef.description
                    : 'Longform, curated thoroughbred racing intelligence — published fortnightly in print and distributed to members of the Stable Press community.'}
                </p>
              </div>

              {/* Edition stats */}
              <div className="flex flex-wrap gap-6 lg:justify-end">
                {[
                  { label: 'Print Edition', value: 'Vol. 47' },
                  { label: 'Fortnightly', value: 'Bi-Weekly' },
                  {
                    label: 'This Issue',
                    value: `${source.length} ${source.length === 1 ? 'piece' : 'pieces'}`,
                  },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <span
                      className="block font-[family-name:var(--font-display)] text-2xl font-bold italic"
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
            <div
              className="h-[2px] w-full mt-6"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, hsl(var(--brand-accent)) 30%, hsl(var(--brand-accent)) 70%, transparent 100%)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Category filter bar ──────────────────────── */}
      <div className="sticky top-[calc(var(--navbar-h,106px))] z-30 border-b border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-1 pt-3 pb-2 overflow-x-auto">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border',
                !categoryParam
                  ? 'text-primary-foreground border-transparent'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
              )}
              style={
                !categoryParam
                  ? { background: 'hsl(var(--brand-accent))', borderColor: 'hsl(var(--brand-accent))' }
                  : undefined
              }
            >
              <BookOpen size={11} />
              All Editions
            </button>

            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key === categoryParam ? null : cat.key)}
                className={cn(
                  'flex-shrink-0 px-2.5 py-1.5 rounded-sm text-[10px] font-semibold uppercase tracking-[0.08em] border transition-colors whitespace-nowrap',
                  categoryParam === cat.key
                    ? 'text-primary-foreground border-transparent'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  categoryParam === cat.key
                    ? {
                        background: 'hsl(var(--primary))',
                        borderColor: 'hsl(var(--primary))',
                      }
                    : undefined
                }
              >
                {cat.label}
              </button>
            ))}

            {/* Search */}
            <div className="relative ml-auto flex-shrink-0 w-40 md:w-52">
              <Search
                size={11}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
              />
              <input
                type="search"
                placeholder="Search bulletin…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-border/50 rounded-sm bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Search bulletin articles"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Published magazine issues (newsstand) ────── */}
      {publishedIssues.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-10 md:pt-14">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-shrink-0 w-1 h-5 rounded-full" style={{ background: 'hsl(var(--brand-accent))' }} />
            <h2 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold text-foreground">
              Bulletin Editions
            </h2>
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {publishedIssues.length} issue{publishedIssues.length !== 1 ? 's' : ''}
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {publishedIssues.map((issue) => {
              const cover = issue.coverImageUrl;
              return (
                <Link
                  key={issue.id}
                  to={`/bulletins/${issue.id}`}
                  className="group block rounded-sm overflow-hidden border border-border/60 bg-card hover:border-primary/40 transition-colors"
                >
                  <div className="aspect-[3/4] overflow-hidden bg-muted relative">
                    {cover ? (
                      <img
                        src={cover}
                        alt={issue.title}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <BookOpen size={32} />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-sm text-white" style={{ background: 'hsl(var(--brand-accent))' }}>
                      {issue.pageCount} pages
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {issue.title}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{issue.edition}</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-primary">
                      Read edition <ChevronRight size={11} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main content (legacy bulletin articles — shown when no issues yet) ── */}
      {publishedIssues.length === 0 && (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">

        {loading ? (
          /* Skeleton */
          <div className="space-y-8">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="border border-border/40 rounded-sm overflow-hidden bg-card animate-pulse flex flex-col md:flex-row"
              >
                <div className="h-56 md:h-auto md:w-80 bg-muted/40 flex-shrink-0" />
                <div className="p-6 space-y-3 flex-1">
                  <div className="h-3 bg-muted/60 rounded w-1/4" />
                  <div className="h-6 bg-muted/60 rounded w-4/5" />
                  <div className="h-6 bg-muted/40 rounded w-3/5" />
                  <div className="h-3 bg-muted/40 rounded w-full mt-2" />
                  <div className="h-3 bg-muted/40 rounded w-5/6" />
                  <div className="h-3 bg-muted/40 rounded w-3/4" />
                  <div className="h-3 bg-muted/30 rounded w-1/3 mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : source.length === 0 ? (
          /* Empty state */
          <div className="py-24 text-center max-w-md mx-auto">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'hsl(var(--brand-accent) / 0.12)' }}
            >
              <BookOpen size={32} style={{ color: 'hsl(var(--brand-accent))' }} />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold italic text-foreground mb-3">
              {search ? 'No pieces match that search.' : 'The press is set. Ink is loaded.'}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {search
                ? 'Try a different search term or browse a different category.'
                : 'Stories filed with the "Bulletin" status in the Newsroom Production System will appear here, organised by their editorial category.'}
            </p>
            {search ? (
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : (
              <Button
                asChild
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              >
                <Link to="/newsroom">
                  Go to Newsroom Production System
                  <ArrowRight size={14} />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-16">

            {/* ── Feature longform hero ── */}
            {heroItem && !categoryParam && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex items-center gap-4 mb-6">
                  <span
                    className="text-[9px] uppercase tracking-[0.22em] font-bold px-3 py-1.5"
                    style={{
                      background: 'hsl(var(--brand-accent))',
                      color: 'hsl(var(--brand-accent-foreground))',
                    }}
                  >
                    Lead Story
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                    {(heroItem as any).edition ?? 'Current Edition'}
                  </span>
                </div>

                {(() => {
                  const catDef = CATEGORIES.find((c) => c.key === heroItem.category);
                  const isReal =
                    hasCmsArticles &&
                    (heroItem as any).id &&
                    !(heroItem as any).id.startsWith('bl');
                  const heroImageUrl =
                    (heroItem as any).imageUrl ??
                    'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

                  const heroCard = (
                    <div className="group grid grid-cols-1 lg:grid-cols-2 border border-border/60 rounded-sm overflow-hidden bg-card hover:border-primary/40 transition-colors">
                      {/* Image */}
                      <div className="relative h-64 lg:h-auto overflow-hidden">
                        <img
                          src={heroImageUrl}
                          alt={heroItem.title}
                          crossOrigin="anonymous"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-foreground/30 lg:block hidden" />
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-transparent to-transparent lg:hidden" />
                        {catDef && (
                          <span
                            className="absolute top-4 left-4 text-[8px] uppercase tracking-[0.2em] font-bold px-2.5 py-1"
                            style={{
                              background: 'hsl(var(--brand-accent))',
                              color: 'hsl(var(--brand-accent-foreground))',
                            }}
                          >
                            {catDef.label}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-6 md:p-10 flex flex-col justify-center">
                        <div
                          className="w-10 h-[3px] mb-5"
                          style={{ background: 'hsl(var(--brand-accent))' }}
                        />
                        <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold italic text-foreground leading-[1.12] mb-4 group-hover:opacity-90 transition-opacity">
                          {heroItem.title}
                        </h2>
                        {(heroItem as any).summary && (
                          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 mb-6">
                            {(heroItem as any).summary}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground mt-auto">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                              style={{
                                background: 'hsl(var(--brand-accent))',
                                color: 'hsl(var(--brand-accent-foreground))',
                              }}
                            >
                              {heroItem.author.charAt(0)}
                            </div>
                            <span className="font-medium">{heroItem.author}</span>
                          </div>
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
                                {new Date((heroItem as any).publishedAt).toLocaleDateString(
                                  'en-AU',
                                  { day: 'numeric', month: 'short', year: 'numeric' }
                                )}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="mt-5">
                          <span
                            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold px-3 py-1.5"
                            style={{
                              background: 'hsl(var(--primary))',
                              color: 'hsl(var(--primary-foreground))',
                            }}
                          >
                            Read Full Piece <ArrowRight size={10} />
                          </span>
                        </div>
                      </div>
                    </div>
                  );

                  return isReal ? (
                    <Link to={`/articles/${(heroItem as any).id}`} aria-label={`Read: ${heroItem.title}`}>
                      {heroCard}
                    </Link>
                  ) : (
                    heroCard
                  );
                })()}
              </motion.section>
            )}

            {/* ── Edition sections, grouped by editorial section ── */}
            <SectionGrid variant="bulletin" sections={sections} hasCmsArticles={hasCmsArticles} />
          </div>
        )}
      </div>
      )}

      {/* ── Race Venue Map ───────────────────────────── */}
      <VenueMap />

      {/* ── Subscribe band ───────────────────────────── */}
      <div
        className="border-t border-border/50 mt-8"
        style={{ background: 'hsl(var(--primary))' }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div
              className="w-8 h-[2px] mb-4"
              style={{ background: 'hsl(var(--brand-accent))' }}
            />
            <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold italic text-primary-foreground leading-tight mb-2">
              Receive the Bulletin in print, fortnightly.
            </h2>
            <p className="text-sm text-primary-foreground/70 leading-relaxed">
              Every edition of the Stable Press print bulletin, delivered to members — longform
              intelligence for the serious thoroughbred follower.
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
              <Link to="/signup">Become a Member</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="flex-1 text-sm border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
            >
              <Link to="/newsletter">Newsletter Edition</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
