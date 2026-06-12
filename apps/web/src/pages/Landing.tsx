import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { useAuthStore } from '@/stores/authStore';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleSkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import {ArrowRight, ChevronRight, Phone, Play, LoaderCircle, TrendingUp, Users, BookOpen, Star, Award, Zap, Clock, Check, PenLine, Mail} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ── Static data ──────────────────────────────────────── */

const BREAKING_TICKER = [
  'RACE 7 FLEMINGTON — Sovereign Streak wins by 2½L in dominant fashion',
  'STABLE TRANSFER — Golden Accord moves to Gai Waterhouse Racing',
  'SCRATCHING — Midnight Phantom withdrawn, Rosehill R4',
  'WEIGHTS — Australian Guineas nominations close Friday 5pm AEST',
  'BLOODSTOCK — Lord Riviera sells at Magic Millions for $2.4M',
];

const PODCAST_EPISODES = [
  {
    id: 'ep-48',
    number: 48,
    title: 'The Weight of the Draw: How Post Positions Change Everything',
    duration: '52 min',
    guest: 'Harold Quince, Trainer',
    date: 'Jun 8',
  },
  {
    id: 'ep-47',
    number: 47,
    title: 'Form Reading in the Modern Era: Beyond the Speed Map',
    duration: '44 min',
    guest: 'Dr. Lena Farrow, Racing Analyst',
    date: 'Jun 1',
  },
  {
    id: 'ep-46',
    number: 46,
    title: 'Breeding for Distance: The Science Behind a Stayer',
    duration: '61 min',
    guest: 'William Ashby, Bloodstock Agent',
    date: 'May 25',
  },
];

const BULLETIN_EDITIONS = [
  {
    id: 'b-14',
    edition: 'Vol. XIV — Issue 23',
    date: 'June 2025',
    headline: 'Cup Season Preview: The Field That Will Define a Generation',
    teaser:
      'Our panel of nine analysts have spoken. Inside: full field assessments, track bias reports, and the dark horses the market has overlooked.',
    pageCount: 48,
    category: 'form-guide',
  },
  {
    id: 'b-13',
    edition: 'Vol. XIV — Issue 22',
    date: 'May 2025',
    headline: 'The Autumn Carnival Debrief',
    teaser:
      'Connections, controversies, and the standout performers who shaped the season.',
    pageCount: 52,
    category: 'bloodstock',
  },
];

const SPONSORS = [
  {
    id: 's1',
    name: 'Tattersalls Bloodstock',
    category: 'Principal Partner',
    tagline: "Australia's premier thoroughbred auction house",
  },
  {
    id: 's2',
    name: 'Champion Sires Registry',
    category: 'Breeding Partner',
    tagline: 'Where bloodlines are documented and preserved',
  },
  {
    id: 's3',
    name: 'TrackMaster Systems',
    category: 'Technology Partner',
    tagline: 'Advanced race-day data and handicapping tools',
  },
];

const MEMBER_METRICS = [
  {
    label: 'Active Members',
    value: '12,840',
    icon: <Users size={16} />,
    delta: '+284 this month',
  },
  {
    label: 'Articles Published',
    value: '3,291',
    icon: <BookOpen size={16} />,
    delta: '+18 this week',
  },
  {
    label: 'Tips Placed',
    value: '94,572',
    icon: <TrendingUp size={16} />,
    delta: 'Across all meets',
  },
  {
    label: 'Leaderboard Leaders',
    value: '250',
    icon: <Award size={16} />,
    delta: 'Global tippers',
  },
];

const FEATURED_ANALYSIS = [
  {
    id: 'fa1',
    category: 'Analysis',
    categoryKey: 'form-guide',
    title: 'The Flemington Straight: Why the 1000m Bias Has Shifted',
    author: 'Sarah Ellison',
    time: '10 min read',
    imageUrl:
      'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'fa2',
    category: 'Interview',
    categoryKey: 'trainer-profiles',
    title: 'Trainer Evelyn Cross: Twelve Group Ones and Counting',
    author: 'Catherine Darragh',
    time: '8 min read',
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'fa3',
    category: 'Bloodstock',
    categoryKey: 'bloodstock',
    title: 'Northern Hemisphere Stallions and Their Australian Influence',
    author: 'James Whitfield',
    time: '12 min read',
    imageUrl:
      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
];

/* ── Component ────────────────────────────────────────── */

export default function Landing() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  useEffect(() => {
    fetchHorses();
  }, [fetchHorses]);
  // === end auto fetch-on-mount ===

  const articles = useArticleStore((s) => s.articles);
  const horses = useHorseStore((s) => s.horses);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [tickerIdx] = useState(0);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState<string | null>(null);
  const [articlesLoading, setArticlesLoading] = useState(true);

  // Brief skeleton on mount so the shimmer is visible
  useEffect(() => {
    const t = setTimeout(() => setArticlesLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  const published = useMemo(
    () => (articles ?? []).filter((a) => a.status === 'published' || a.status === 'newsletter' || a.status === 'bulletin'),
    [articles]
  );

  const heroArticle = published[0] ?? null;
  const secondaryArticles = useMemo(() => published.slice(1, 4), [published]);
  const sidebarArticles = useMemo(() => published.slice(0, 5), [published]);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribeEmail.trim()) {
      setSubscribed(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Breaking News Ticker ─────────────────────────── */}
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
            <p className="text-[11px] text-foreground/80 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
              {BREAKING_TICKER[tickerIdx]}
            </p>
          </div>
          <Zap size={12} className="flex-shrink-0 opacity-40" />
        </div>
      </div>

      {/* ── Hero Banner ─────────────────────────────────── */}
      <section className="relative w-full overflow-hidden">
        <div className="relative min-h-[600px] h-[80vh] max-h-[840px]">
          <img
            src="https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
            alt="Thoroughbred horses racing — dramatic action at the track"
            crossOrigin="anonymous"
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

              <p className="text-[11px] uppercase tracking-[0.16em] text-white/45 font-medium">
                Trusted by 12,000+ racing enthusiasts · Published since 2018
              </p>
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
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex flex-wrap items-stretch divide-x divide-border">
            {MEMBER_METRICS.map((metric) => (
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

      {/* ── Main Content Grid ────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">

          {/* ── LEFT / CENTRE ── */}
          <div className="lg:col-span-2 space-y-12">

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
                  ctaHref="/newsroom"
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
                <Link
                  to="/newsletter"
                  className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  Newsletter <Mail size={11} />
                </Link>
              </div>

              <div className="space-y-0">
                {FEATURED_ANALYSIS.map((item, idx) => (
                  <Link
                    key={item.id}
                    to={`/news?category=${item.categoryKey}`}
                    className={cn(
                      'group grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 py-5 transition-colors hover:bg-muted/30 -mx-3 px-3 rounded-sm',
                      idx < FEATURED_ANALYSIS.length - 1 && 'border-b border-border/40'
                    )}
                    aria-label={`Read analysis: ${item.title}`}
                  >
                    <div className="w-full sm:w-28 h-20 flex-shrink-0 overflow-hidden rounded-sm">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-[9px] uppercase tracking-[0.14em] font-bold"
                          style={{ color: 'hsl(var(--brand-accent))' }}
                        >
                          {item.category}
                        </span>
                      </div>
                      <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground leading-snug group-hover:opacity-[0.85] transition-opacity mb-1.5 line-clamp-2">
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
                ))}
              </div>
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
                          Trainer: {horse.trainer} · Jockey: {horse.jockey}
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

            {/* ── Print Bulletin Preview ─── */}
            <section id="bulletins">
              <div className="flex items-center gap-4 mb-6">
                <div
                  className="flex-shrink-0 w-1 h-5 rounded-full"
                  style={{ background: 'hsl(var(--brand-accent))' }}
                />
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                  Print Bulletins
                </h2>
                <div className="flex-1 h-px bg-border/50" />
                <Link
                  to="/bulletins"
                  className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  All bulletins <ChevronRight size={11} />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {BULLETIN_EDITIONS.map((bulletin) => (
                  <div
                    key={bulletin.id}
                    className="relative border border-border/60 rounded-sm overflow-hidden group cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() =>
                      setBulletinOpen(
                        bulletinOpen === bulletin.id ? null : bulletin.id
                      )
                    }
                  >
                    {/* Cover */}
                    <div className="relative h-48 bg-primary overflow-hidden">
                      <img
                        src="https://images.pexels.com/photos/18913040/pexels-photo-18913040.jpeg?auto=compress&cs=tinysrgb&h=350"
                        alt="Print bulletin cover"
                        crossOrigin="anonymous"
                        className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity"
                      />
                      <div className="relative z-10 p-5 h-full flex flex-col justify-between">
                        <div>
                          <div
                            className="inline-block text-[8px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 mb-2"
                            style={{
                              background: 'hsl(var(--brand-accent))',
                              color: 'hsl(var(--brand-accent-foreground))',
                            }}
                          >
                            Print Edition
                          </div>
                          <p className="text-[9px] uppercase tracking-[0.12em] text-primary-foreground/50">
                            {bulletin.edition}
                          </p>
                        </div>
                        <div>
                          <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-primary-foreground leading-snug line-clamp-2">
                            {bulletin.headline}
                          </h3>
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-muted-foreground">
                          {bulletin.date}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {bulletin.pageCount} pages
                        </span>
                      </div>
                      {bulletinOpen === bulletin.id ? (
                        <div>
                          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                            {bulletin.teaser}
                          </p>
                          <Button
                            size="sm"
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link to={`/bulletins?category=${bulletin.category}`}>
                              Read Full Bulletin
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <button className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                          Preview edition <ChevronRight size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Newsletter/Subscription prompt */}
              <div
                className="mt-5 border border-dashed rounded-sm p-4 flex flex-col sm:flex-row items-center gap-4"
                style={{ borderColor: 'hsl(var(--brand-accent) / 0.4)' }}
              >
                <Mail
                  size={20}
                  style={{ color: 'hsl(var(--brand-accent))' }}
                  className="flex-shrink-0"
                />
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-sm font-semibold text-foreground">
                    Newsletter &amp; Print Bulletin — delivered to subscribers.
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Weekly editorial dispatches and the fortnightly print bulletin, organised by category.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="text-xs"
                  >
                    <Link to="/newsletter">Browse Newsletter</Link>
                  </Button>
                  <Button
                    size="sm"
                    asChild
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                  >
                    <Link to="/bulletins">Browse Bulletins</Link>
                  </Button>
                </div>
              </div>
            </section>
          </div>

          {/* ── RIGHT: Sidebar ── */}
          <aside className="lg:col-span-1 space-y-8">

            {/* Subscription CTA */}
            {!currentUser && (
              <div
                className="rounded-sm overflow-hidden border"
                style={{ borderColor: 'hsl(var(--brand-accent) / 0.3)' }}
              >
                <div
                  className="px-5 py-4"
                  style={{ background: 'hsl(var(--brand-accent) / 0.07)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Star size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
                    <span
                      className="text-[9px] uppercase tracking-[0.2em] font-bold"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      Membership
                    </span>
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground leading-snug mb-1">
                    Join Stable Press
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    Full access to every article, the print bulletin, tipping
                    competitions, and the podcast archive.
                  </p>
                  <ul className="space-y-1.5 mb-4">
                    {[
                      'Unlimited editorial access',
                      'Fortnightly print bulletin',
                      'Tipping ring entry',
                      'Podcast early access',
                      'Horse profile deep dives',
                    ].map((benefit) => (
                      <li
                        key={benefit}
                        className="flex items-center gap-2 text-xs text-foreground/80"
                      >
                        <Check size={11} style={{ color: 'hsl(var(--brand-accent))' }} />
                        {benefit}
                      </li>
                    ))}
                  </ul>

                  {subscribed ? (
                    <div className="flex items-center gap-2 py-2 px-3 rounded-sm bg-primary/10 border border-primary/20">
                      <Check size={14} className="text-primary" />
                      <span className="text-xs font-medium text-primary">
                        You are on the list
                      </span>
                    </div>
                  ) : (
                    <form onSubmit={handleSubscribe} className="space-y-2">
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={subscribeEmail}
                        onChange={(e) => setSubscribeEmail(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs border border-input rounded-sm bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        aria-label="Email address for membership"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
                      >
                        Start Membership
                      </Button>
                    </form>
                  )}
                </div>
                <div className="px-5 py-2 border-t border-border/40 flex items-center justify-center gap-1">
                  <span className="text-[9px] text-muted-foreground">
                    Already a member?
                  </span>
                  <Link
                    to="/login"
                    className="text-[9px] font-semibold text-primary hover:underline"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            )}

            {/* Podcast Promo */}
            <div className="bg-primary rounded-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <LoaderCircle
                    size={13}
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  />
                  <span
                    className="text-[9px] uppercase tracking-[0.2em] font-bold"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    The Stable Press Podcast
                  </span>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-primary-foreground leading-snug mb-3">
                  On the Air
                </h3>
                <div className="h-px w-full bg-primary-foreground/10 mb-4" />
                <div className="space-y-0">
                  {PODCAST_EPISODES.map((ep, idx) => (
                    <Link
                      key={ep.id}
                      to="/podcast"
                      className={cn(
                        'group block py-3 hover:bg-primary-foreground/5 transition-colors -mx-1 px-1 rounded-sm',
                        idx < PODCAST_EPISODES.length - 1 &&
                          'border-b border-primary-foreground/10'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center border"
                          style={{ borderColor: 'hsl(var(--brand-accent) / 0.6)' }}
                        >
                          <Play
                            size={10}
                            style={{ color: 'hsl(var(--brand-accent))' }}
                          />
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-[9px] uppercase tracking-[0.1em] mb-0.5 font-semibold"
                            style={{ color: 'hsl(var(--brand-accent))' }}
                          >
                            Ep. {ep.number} · {ep.duration} · {ep.date}
                          </p>
                          <h4 className="text-[11px] font-semibold text-primary-foreground leading-snug line-clamp-2 group-hover:opacity-80 transition-opacity">
                            {ep.title}
                          </h4>
                          <p className="text-[10px] text-primary-foreground/50 mt-0.5">
                            {ep.guest}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="border-t border-primary-foreground/10 px-5 py-2.5">
                <Link
                  to="/podcast"
                  className="flex items-center justify-between text-[10px] text-primary-foreground/50 hover:text-primary-foreground transition-colors uppercase tracking-[0.1em] font-semibold"
                >
                  <span>All episodes</span>
                  <ArrowRight size={11} />
                </Link>
              </div>
            </div>

            {/* Also in this edition */}
            {sidebarArticles.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground whitespace-nowrap">
                    Also in this edition
                  </h3>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div>
                  {sidebarArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      variant="compact"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Newsletter quick-access */}
            <div
              className="border rounded-sm p-5"
              style={{
                borderColor: 'hsl(var(--chart-1) / 0.35)',
                background: 'hsl(var(--chart-1) / 0.04)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Mail
                  size={14}
                  style={{ color: 'hsl(var(--chart-1))' }}
                />
                <span
                  className="text-[9px] uppercase tracking-[0.2em] font-bold"
                  style={{ color: 'hsl(var(--chart-1))' }}
                >
                  This Week's Newsletter
                </span>
              </div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-1.5 leading-snug">
                Every story, sorted by category — read it your way.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Race Reports, Form Guides, Trainer Profiles, and Bloodstock analysis — all in one beautifully laid out reading experience.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  asChild
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
                >
                  <Link to="/newsletter">Read Newsletter</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="text-xs"
                >
                  <Link to="/bulletins">Bulletins</Link>
                </Button>
              </div>
            </div>

            {/* Tipping Ring CTA */}
            <div
              className="border rounded-sm p-5"
              style={{
                borderColor: 'hsl(var(--brand-accent) / 0.35)',
                background: 'hsl(var(--brand-accent) / 0.04)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp
                  size={14}
                  style={{ color: 'hsl(var(--brand-accent))' }}
                />
                <span
                  className="text-[9px] uppercase tracking-[0.2em] font-bold"
                  style={{ color: 'hsl(var(--brand-accent))' }}
                >
                  Tipping Ring
                </span>
              </div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-1.5 leading-snug">
                Back your selections against the field.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Track your tipping record, follow the global leaderboard, and
                earn your stripes as a form student.
              </p>
              <Button
                size="sm"
                asChild
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
              >
                <Link to="/tipping">Enter the Ring</Link>
              </Button>
            </div>

            {/* Sponsors */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground whitespace-nowrap">
                  Partners &amp; Sponsors
                </h3>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <div className="space-y-3">
                {SPONSORS.map((sponsor, idx) => (
                  <div
                    key={sponsor.id}
                    className={cn(
                      'flex items-start gap-3 pb-3',
                      idx < SPONSORS.length - 1 && 'border-b border-border/40'
                    )}
                  >
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-sm flex items-center justify-center text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        background: 'hsl(var(--brand-accent) / 0.12)',
                        color: 'hsl(var(--brand-accent))',
                      }}
                    >
                      {sponsor.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="text-[8px] uppercase tracking-[0.14em] font-bold"
                          style={{ color: 'hsl(var(--brand-accent))' }}
                        >
                          {sponsor.category}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-foreground">
                        {sponsor.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {sponsor.tagline}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] text-muted-foreground uppercase tracking-[0.1em] text-center">
                Sponsor enquiries:{' '}
                <span className="text-foreground">press@stablepress.com.au</span>
              </p>
            </div>

            {/* Member Engagement */}
            {currentUser && (
              <div className="border border-primary/20 rounded-sm p-5 bg-primary/5">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-primary" />
                  <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-primary">
                    Your Activity
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Reads this week', value: '—' },
                    { label: 'Tips placed', value: '—' },
                    { label: 'Rank', value: '—' },
                    { label: 'Streak', value: '—' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="text-center py-2 rounded-sm bg-background"
                    >
                      <span className="block font-[family-name:var(--font-display)] text-lg font-bold text-primary">
                        {stat.value}
                      </span>
                      <span className="block text-[9px] text-muted-foreground mt-0.5">
                        {stat.label}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/tipping"
                  className="mt-3 block text-center text-[10px] uppercase tracking-[0.1em] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  View your full record <ArrowRight size={10} className="inline" />
                </Link>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ── Full-width Subscription Band ────────────────── */}
      {!currentUser && (
        <section className="bg-primary text-primary-foreground py-14 px-4 md:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <span
              className="inline-block text-[9px] uppercase tracking-[0.22em] font-bold mb-4 px-3 py-1 rounded-full"
              style={{
                background: 'hsl(var(--brand-accent))',
                color: 'hsl(var(--brand-accent-foreground))',
              }}
            >
              Premium Membership
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold text-primary-foreground mb-4 leading-tight">
              The racing record that serious turf followers trust.
            </h2>
            <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-xl mx-auto mb-8">
              Join 12,840 members who rely on Stable Press for premium editorial,
              paddock intelligence, and the deepest horse profiles in Australian
              thoroughbred racing.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                asChild
                className="text-sm font-semibold px-8"
                style={{
                  background: 'hsl(var(--brand-accent))',
                  color: 'hsl(var(--brand-accent-foreground))',
                }}
              >
                <Link to="/signup">Start Your Membership</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="text-sm border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
              >
                <Link to="/newsletter">Browse the Newsletter</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border/60 bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div>
              <h4 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground mb-1">
                Stable Press
              </h4>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
                Thoroughbred Racing Record
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Prestige racing journalism, horse profiles, tipping competitions,
                and expert analysis — curated for the serious turf follower.
              </p>
            </div>
            {/* Sections */}
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                Sections
              </h4>
              <ul className="space-y-2">
                {[
                  { to: '/news', label: 'News & Race Reports' },
                  { to: '/news?section=analysis', label: 'Analysis & Form' },
                  { to: '/news?section=interviews', label: 'Interviews' },
                  { to: '/horses', label: 'Horse Profiles' },
                  { to: '/podcast', label: 'Podcast Hub' },
                  { to: '/newsletter', label: 'Newsletter' },
                  { to: '/bulletins', label: 'Print Bulletins' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* Community */}
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                Community
              </h4>
              <ul className="space-y-2">
                {[
                  { to: '/tipping', label: 'Tipping Ring' },
                  { to: '/tipping', label: 'Leaderboard' },
                  { to: '/newsletter', label: 'Newsletter' },
                  { to: '/bulletins', label: 'Print Bulletins' },
                  { to: '/newsroom', label: 'CMS Newsroom' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* Account */}
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                Account
              </h4>
              <ul className="space-y-2">
                {[
                  { to: '/login', label: 'Sign In' },
                  { to: '/signup', label: 'Create Account' },
                  { to: '/signup', label: 'Membership Plans' },
                  { to: '/newsroom', label: 'Newsroom' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sponsor bar */}
          <div className="py-4 border-t border-b border-border/40 mb-6">
            <div className="flex flex-wrap items-center justify-center gap-6">
              <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                Proudly Supported By
              </span>
              {SPONSORS.map((s) => (
                <span
                  key={s.id}
                  className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[10px] text-muted-foreground">
              © {new Date().getFullYear()} Stable Press Pty Ltd. All rights
              reserved. ABN 00 000 000 000.
            </p>
            <p
              className="text-[10px] italic font-[family-name:var(--font-display)]"
              style={{ color: 'hsl(var(--brand-accent))' }}
            >
              The form is everything. The rest is conversation.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}