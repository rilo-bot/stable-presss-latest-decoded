import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useArticleStore } from '@/stores/articleStore';
import { CATEGORIES } from '@/pages/NewsIndex';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  ChevronRight,
  Clock,
  ArrowRight,
  Search,
  Calendar,
  Newspaper,
  BarChart2,
  Mic,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ── Static fallback bulletin items ─────────────────── */

interface FallbackBulletin {
  id: string;
  category: string;
  title: string;
  summary: string;
  author: string;
  readingTime: number;
  imageUrl: string;
  publishedAt: Date;
  edition: string;
}

const FALLBACK_BULLETINS: FallbackBulletin[] = [
  {
    id: 'bl1',
    category: 'bloodstock',
    title: 'Northern Hemisphere Stallions and Their Australian Influence',
    summary:
      "A data-driven look at how Northern Hemisphere sire lines have reshaped the breeding priorities of Australia's top studs over the past decade. We examine the numbers behind the migration of European and American bloodlines into Southern Hemisphere programmes, and what the next cycle of Group One winners tells us about the direction of the thoroughbred.",
    author: 'James Whitfield',
    readingTime: 12,
    imageUrl:
      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    publishedAt: new Date('2025-06-01'),
    edition: 'Vol. 47 · Fortnightly Edition',
  },
  {
    id: 'bl2',
    category: 'trainer-profiles',
    title: 'Trainer Evelyn Cross: Twelve Group Ones and Counting',
    summary:
      'We sat down with Evelyn Cross at her Flemington stables for a two-hour conversation on patience, preparation, and the moment she knew thoroughbred training was her calling. From her first winner at Ballarat to the Group One stage — this is the unedited record of a remarkable career in the saddle of management.',
    author: 'Catherine Darragh',
    readingTime: 14,
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    publishedAt: new Date('2025-06-01'),
    edition: 'Vol. 47 · Fortnightly Edition',
  },
  {
    id: 'bl3',
    category: 'form-guide',
    title: 'Sectional Intelligence: The Case for Finishing Speed Over Early Position',
    summary:
      "Modern race timing has changed how we evaluate thoroughbred performance. In this deep-dive, our sectional analysis team makes the case that the final 400m — not gate speed — is the defining predictor of a horse's class ceiling. We examine five seasons of data across Sydney and Melbourne to build the argument.",
    author: 'Sarah Ellison',
    readingTime: 18,
    imageUrl:
      'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    publishedAt: new Date('2025-05-18'),
    edition: 'Vol. 46 · Fortnightly Edition',
  },
  {
    id: 'bl4',
    category: 'owner-stories',
    title: 'The Syndicate Model: How Group Ownership Is Democratising Racing',
    summary:
      'Racing ownership was once the preserve of pastoral families and corporation accounts. A new generation of syndicators is changing that — and the industry is better for it. We speak to four syndicate managers and a dozen members about what draws people into shared ownership and what keeps them there.',
    author: 'Rebecca Frame',
    readingTime: 11,
    imageUrl:
      'https://images.pexels.com/photos/18913040/pexels-photo-18913040.jpeg?auto=compress&cs=tinysrgb&h=350',
    publishedAt: new Date('2025-05-18'),
    edition: 'Vol. 46 · Fortnightly Edition',
  },
  {
    id: 'bl5',
    category: 'track-notes',
    title: 'The Science of Track Preparation: A Conversation With the Flemington Curator',
    summary:
      "Few people shape a race meeting more profoundly than the track curator — and few are less visible. We spent three days at Flemington with head curator Michael Hardie, following the preparation process from Monday morning to race day. What emerges is a picture of extraordinary precision in an unpredictable environment.",
    author: 'Tom McAllister',
    readingTime: 16,
    imageUrl:
      'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    publishedAt: new Date('2025-05-04'),
    edition: 'Vol. 45 · Fortnightly Edition',
  },
];

/* ── Section icon map ────────────────────────────────── */

const SECTION_ICONS: Record<string, React.ReactNode> = {
  news: <Newspaper size={13} />,
  analysis: <BarChart2 size={13} />,
  interviews: <Mic size={13} />,
};

/* ── Race Venue locations for the map ───────────────── */

const RACE_VENUES = [
  { name: 'Flemington Racecourse', location: 'Flemington, Melbourne VIC' },
  { name: 'Royal Randwick', location: 'Randwick, Sydney NSW' },
  { name: 'Eagle Farm Racecourse', location: 'Eagle Farm, Brisbane QLD' },
  { name: 'Morphettville', location: 'Morphettville, Adelaide SA' },
  { name: 'Ascot Racecourse', location: 'Ascot, Perth WA' },
];

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
  const [selectedVenueIdx, setSelectedVenueIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // CMS bulletin articles
  const bulletinArticles = useMemo(() => {
    let base = (articles ?? []).filter((a) => a.status === 'bulletin');
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

  const hasCmsArticles = bulletinArticles.length > 0;

  // Fallback items
  const fallbackItems = useMemo(() => {
    let base = FALLBACK_BULLETINS;
    if (categoryParam) base = base.filter((i) => i.category === categoryParam);
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(
        (i) => i.title.toLowerCase().includes(q) || i.author.toLowerCase().includes(q)
      );
    }
    return base;
  }, [categoryParam, search]);

  type AnyItem = (typeof bulletinArticles)[0] | FallbackBulletin;

  const source: AnyItem[] = hasCmsArticles ? bulletinArticles : fallbackItems;

  // Group by category section
  const sections = useMemo(() => {
    const allSections = ['news', 'analysis', 'interviews'] as const;
    const grouped: {
      section: string;
      cats: { catDef: (typeof CATEGORIES)[0]; items: AnyItem[] }[];
    }[] = [];
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

  const currentCatDef = categoryParam ? CATEGORIES.find((c) => c.key === categoryParam) : null;

  const setCategory = (key: string | null) => {
    if (!key) {
      setSearchParams({});
    } else {
      setSearchParams({ category: key });
    }
  };

  const selectedVenue = RACE_VENUES[selectedVenueIdx];
  const mapSearchQuery = encodeURIComponent(selectedVenue.location);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Broadsheet masthead ──────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: 'hsl(var(--primary))' }}
      >
        <img
          src="https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=400&w=940"
          alt="Print bulletin editorial"
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover opacity-10"
        />

        {/* Broadsheet column rules overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.04 }}>
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

      {/* ── Main content ─────────────────────────────── */}
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
                : 'Stories filed with the "Bulletin" status in the Newsroom CMS will appear here, organised by their editorial category.'}
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
                  Go to Newsroom CMS
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
                    {(heroItem as FallbackBulletin).edition ?? 'Current Edition'}
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
            {sections.map((group, groupIdx) => (
              <section key={group.section}>
                {/* Section header — broadsheet style */}
                <div className="flex items-center gap-4 mb-8">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
                    style={{ background: 'hsl(var(--brand-accent) / 0.1)' }}
                  >
                    <span style={{ color: 'hsl(var(--brand-accent))' }}>
                      {SECTION_ICONS[group.section]}
                    </span>
                    <span
                      className="text-[9px] uppercase tracking-[0.22em] font-bold"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      {group.section.charAt(0).toUpperCase() + group.section.slice(1)}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-border/50" />
                </div>

                {group.cats.map((catGroup, catIdx) => {
                  const { catDef, items } = catGroup;

                  return (
                    <div key={catDef.key} className="mb-12">
                      {/* Category heading */}
                      <div className="flex items-center gap-3 mb-6">
                        <div
                          className="flex-shrink-0 w-1.5 h-5 rounded-full"
                          style={{ background: 'hsl(var(--brand-accent))' }}
                        />
                        <h3 className="font-[family-name:var(--font-display)] text-lg font-bold italic text-foreground">
                          {catDef.label}
                        </h3>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] font-semibold">
                          {items.length} {items.length === 1 ? 'piece' : 'pieces'}
                        </span>
                        <div className="flex-1 h-px bg-border/40" />
                      </div>

                      {/* Broadsheet-style editorial list */}
                      <div className="space-y-5">
                        {items.map((item, itemIdx) => {
                          const isReal =
                            hasCmsArticles &&
                            (item as any).id &&
                            !(item as any).id.startsWith('bl');
                          const itemImageUrl =
                            (item as any).imageUrl ??
                            'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=400&w=600';
                          const itemKey =
                            (item as any).id ?? `item-${groupIdx}-${catIdx}-${itemIdx}`;

                          const cardContent = (
                            <div className="group flex flex-col sm:flex-row gap-0 border border-border/50 rounded-sm overflow-hidden bg-card hover:border-primary/30 transition-colors">
                              {/* Sidebar image */}
                              <div className="relative sm:w-48 md:w-56 flex-shrink-0 h-44 sm:h-auto overflow-hidden">
                                <img
                                  src={itemImageUrl}
                                  alt={item.title}
                                  crossOrigin="anonymous"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 via-transparent to-transparent sm:bg-gradient-to-r" />
                              </div>

                              {/* Body */}
                              <div className="flex flex-col justify-between p-5 flex-1 border-t sm:border-t-0 sm:border-l border-border/40">
                                <div>
                                  {/* Top rule */}
                                  <div
                                    className="w-8 h-[2px] mb-3"
                                    style={{ background: 'hsl(var(--brand-accent))' }}
                                  />

                                  <h4 className="font-[family-name:var(--font-display)] text-base md:text-lg font-bold italic text-foreground leading-snug mb-2 group-hover:opacity-85 transition-opacity line-clamp-2">
                                    {item.title}
                                  </h4>

                                  {(item as any).summary && (
                                    <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                                      {(item as any).summary}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                                    <span className="font-medium">{item.author}</span>
                                    {item.readingTime && (
                                      <>
                                        <span className="opacity-30">·</span>
                                        <span className="flex items-center gap-1">
                                          <Clock size={9} />
                                          {item.readingTime} min
                                        </span>
                                      </>
                                    )}
                                    {(item as any).edition && (
                                      <>
                                        <span className="opacity-30">·</span>
                                        <span
                                          className="text-[9px] uppercase tracking-[0.1em] font-semibold"
                                          style={{ color: 'hsl(var(--brand-accent))' }}
                                        >
                                          {(item as any).edition}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                    Read <ArrowRight size={10} />
                                  </span>
                                </div>
                              </div>
                            </div>
                          );

                          return (
                            <motion.div
                              key={itemKey}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                delay: itemIdx * 0.05 + catIdx * 0.08,
                                duration: 0.22,
                                ease: 'easeOut',
                              }}
                            >
                              {isReal ? (
                                <Link
                                  to={`/articles/${(item as any).id}`}
                                  className="block"
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
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Race Venue Map ───────────────────────────── */}
      <div className="border-t border-border/40" style={{ background: 'hsl(var(--primary) / 0.04)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">
          {/* Section header */}
          <div className="flex items-center gap-4 mb-8">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm"
              style={{ background: 'hsl(var(--brand-accent) / 0.12)' }}
            >
              <MapPin size={13} style={{ color: 'hsl(var(--brand-accent))' }} />
              <span
                className="text-[9px] uppercase tracking-[0.22em] font-bold"
                style={{ color: 'hsl(var(--brand-accent))' }}
              >
                Race Venues
              </span>
            </div>
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold hidden sm:block">
              Featured in this edition
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Venue selector */}
            <div className="lg:col-span-1 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-4">
                Select a venue to explore
              </p>
              {RACE_VENUES.map((venue, idx) => (
                <button
                  key={venue.name}
                  onClick={() => setSelectedVenueIdx(idx)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 px-4 py-3 rounded-sm border transition-all',
                    selectedVenueIdx === idx
                      ? 'border-transparent text-primary-foreground'
                      : 'border-border/50 bg-card text-foreground hover:border-primary/30 hover:bg-primary/5'
                  )}
                  style={
                    selectedVenueIdx === idx
                      ? { background: 'hsl(var(--primary))' }
                      : undefined
                  }
                  aria-label={`View map for ${venue.name}`}
                >
                  <MapPin
                    size={14}
                    className="mt-0.5 flex-shrink-0"
                    style={
                      selectedVenueIdx === idx
                        ? { color: 'hsl(var(--brand-accent))' }
                        : { color: 'hsl(var(--brand-accent))' }
                    }
                  />
                  <div>
                    <span className="block text-[12px] font-semibold leading-tight">
                      {venue.name}
                    </span>
                    <span
                      className={cn(
                        'block text-[10px] mt-0.5',
                        selectedVenueIdx === idx
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'
                      )}
                    >
                      {venue.location}
                    </span>
                  </div>
                </button>
              ))}

              {/* Open in Google Maps link */}
              <a
                href={`https://www.google.com/maps/search/${mapSearchQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.1em] border border-border/60 bg-card text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                aria-label={`Open ${selectedVenue.name} in Google Maps`}
              >
                <MapPin size={12} className="text-primary" />
                Open in Google Maps
              </a>
            </div>

            {/* Map embed */}
            <div className="lg:col-span-2">
              <div className="relative rounded-sm overflow-hidden border border-border/50 shadow-sm" style={{ height: '420px' }}>
                {/* Broadsheet accent bar */}
                <div
                  className="absolute top-0 left-0 right-0 z-10 h-[3px]"
                  style={{ background: 'hsl(var(--brand-accent))' }}
                />

                <iframe
                  key={selectedVenueIdx}
                  title={`Map of ${selectedVenue.name}`}
                  src={`https://maps.google.com/maps?q=${mapSearchQuery}&output=embed&z=15`}
                  width="100%"
                  height="100%"
                  style={{ border: 0, display: 'block' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  aria-label={`Google Map showing ${selectedVenue.name} at ${selectedVenue.location}`}
                />

                {/* Venue label overlay */}
                <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-sm backdrop-blur-sm"
                  style={{ background: 'hsl(var(--primary) / 0.92)' }}
                >
                  <MapPin size={12} style={{ color: 'hsl(var(--brand-accent))' }} />
                  <div>
                    <span className="block text-[11px] font-bold text-primary-foreground leading-tight">
                      {selectedVenue.name}
                    </span>
                    <span className="block text-[9px] text-primary-foreground/70 uppercase tracking-[0.1em]">
                      {selectedVenue.location}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attribution */}
              <p className="text-[9px] text-muted-foreground/60 mt-2 text-right tracking-wide uppercase">
                Map data © Google Maps
              </p>
            </div>
          </div>
        </div>
      </div>

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
