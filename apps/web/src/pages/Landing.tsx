import { useMemo, useState, useEffect } from 'react';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { connectionResolver } from '@/lib/horseConnections';
import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { useIssueStore } from '@/stores/issueStore';
import { useBreakingNewsStore } from '@/stores/breakingNewsStore';
import { useSponsorStore } from '@/stores/sponsorStore';
import { useMetricsStore } from '@/stores/metricsStore';
import { TrendingUp, Users, BookOpen, Award } from 'lucide-react';
import { LandingHero } from './landing/LandingHero';
import { LandingFeaturedArticles } from './landing/LandingFeaturedArticles';
import { LandingBulletins } from './landing/LandingBulletins';
import { LandingSidebar } from './landing/LandingSidebar';
import { LandingPodcast } from './landing/LandingPodcast';
import { LandingFooter } from './landing/LandingFooter';

/* ── Component ────────────────────────────────────────── */

export default function Landing() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const fetchPodcastEpisodes = usePodcastStore((s) => s.fetchPodcastEpisodes);
  const fetchIssues = useIssueStore((s) => s.fetchIssues);
  const fetchBreakingNews = useBreakingNewsStore((s) => s.fetchBreakingNews);
  const fetchSponsors = useSponsorStore((s) => s.fetchSponsors);
  const fetchMetrics = useMetricsStore((s) => s.fetchMetrics);
  useEffect(() => {
    fetchHorses();
    fetchParties();
    fetchArticles();
    fetchPodcastEpisodes();
    fetchIssues();
    fetchBreakingNews();
    fetchSponsors();
    fetchMetrics();
  }, [
    fetchHorses,
    fetchParties,
    fetchArticles,
    fetchPodcastEpisodes,
    fetchIssues,
    fetchBreakingNews,
    fetchSponsors,
    fetchMetrics,
  ]);
  // === end auto fetch-on-mount ===

  const articles = useArticleStore((s) => s.articles);
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const episodes = usePodcastStore((s) => s.episodes);
  const issues = useIssueStore((s) => s.issues);
  const breakingItems = useBreakingNewsStore((s) => s.items);
  const sponsors = useSponsorStore((s) => s.sponsors);
  const metrics = useMetricsStore((s) => s.metrics);
  const horseConn = useMemo(() => connectionResolver(parties ?? []), [parties]);
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
  const featuredArticles = useMemo(() => published.slice(4, 7), [published]);

  // Live landing-page content (real data; sections fall back to empty states).
  const tickerItems = useMemo(() => breakingItems.filter((i) => i.active), [breakingItems]);
  const publishedIssues = useMemo(
    () =>
      issues
        .filter((i) => !i.unpublishedAt)
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
        .slice(0, 2),
    [issues]
  );
  const liveEpisodes = useMemo(
    () => episodes.filter((e) => e.status === 'published').slice(0, 3),
    [episodes]
  );
  const metricCards = useMemo(
    () =>
      metrics
        ? [
            { label: 'Active Members', value: metrics.activeMembers.toLocaleString(), icon: <Users size={16} /> },
            { label: 'Articles Published', value: metrics.articlesPublished.toLocaleString(), icon: <BookOpen size={16} /> },
            { label: 'Tips Placed', value: metrics.tipsPlaced.toLocaleString(), icon: <TrendingUp size={16} /> },
            { label: 'Leaderboard Leaders', value: metrics.leaderboardLeaders.toLocaleString(), icon: <Award size={16} /> },
          ]
        : [],
    [metrics]
  );

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (subscribeEmail.trim()) {
      setSubscribed(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">

      <LandingHero
        tickerItems={tickerItems}
        tickerIdx={tickerIdx}
        heroArticle={heroArticle}
        metricCards={metricCards}
      />

      {/* ── Main Content Grid ────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">

          {/* ── LEFT / CENTRE ── */}
          <div className="lg:col-span-2 space-y-12">
            <LandingFeaturedArticles
              articlesLoading={articlesLoading}
              secondaryArticles={secondaryArticles}
              featuredArticles={featuredArticles}
              horses={horses}
              horseConn={horseConn}
            />

            <LandingBulletins
              publishedIssues={publishedIssues}
              bulletinOpen={bulletinOpen}
              setBulletinOpen={setBulletinOpen}
            />
          </div>

          {/* ── RIGHT: Sidebar ── */}
          <LandingSidebar
            hasUser={!!currentUser}
            subscribed={subscribed}
            subscribeEmail={subscribeEmail}
            setSubscribeEmail={setSubscribeEmail}
            handleSubscribe={handleSubscribe}
            sidebarArticles={sidebarArticles}
            sponsors={sponsors}
            podcastSlot={<LandingPodcast liveEpisodes={liveEpisodes} />}
          />
        </div>
      </div>

      <LandingFooter hasUser={!!currentUser} sponsors={sponsors} />
    </div>
  );
}
