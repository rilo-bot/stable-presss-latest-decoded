import { useMemo, useState, useEffect } from 'react';
import { isLive } from '@/types/article';
import { useNavigate } from 'react-router-dom';
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
import { useTippingStore } from '@/stores/tippingStore';
import { isStaff } from '@/rbac/can';
import { TrendingUp, Users, BookOpen, Award } from 'lucide-react';
import { LandingHero } from './landing/LandingHero';
import { LandingFeaturedArticles } from './landing/LandingFeaturedArticles';
import { LandingBulletins } from './landing/LandingBulletins';
import { LandingSidebar } from './landing/LandingSidebar';
import { LandingPodcast } from './landing/LandingPodcast';
import { LandingRaces } from './landing/LandingRaces';
import { LandingLeaderboard } from './landing/LandingLeaderboard';
import { LandingFooter } from './landing/LandingFooter';

/* ── Component ────────────────────────────────────────── */

export default function Landing() {
  const navigate = useNavigate();

  // === auto fetch-on-mount (backend planner) ===
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const fetchPodcastEpisodes = usePodcastStore((s) => s.fetchPodcastEpisodes);
  const fetchIssues = useIssueStore((s) => s.fetchIssues);
  const fetchBreakingNews = useBreakingNewsStore((s) => s.fetchBreakingNews);
  const fetchSponsors = useSponsorStore((s) => s.fetchSponsors);
  const fetchMetrics = useMetricsStore((s) => s.fetchMetrics);
  const fetchRaces = useTippingStore((s) => s.fetchRaces);
  useEffect(() => {
    fetchHorses();
    fetchParties();
    fetchArticles();
    fetchPodcastEpisodes();
    fetchIssues();
    fetchBreakingNews();
    fetchSponsors();
    fetchMetrics();
    fetchRaces();
  }, [
    fetchHorses,
    fetchParties,
    fetchArticles,
    fetchPodcastEpisodes,
    fetchIssues,
    fetchBreakingNews,
    fetchSponsors,
    fetchMetrics,
    fetchRaces,
  ]);
  // === end auto fetch-on-mount ===

  const articles = useArticleStore((s) => s.articles);
  // Real loading state — drives the skeleton until articles actually arrive.
  const articlesLoading = useArticleStore((s) => !s.loaded && !s.error);
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const episodes = usePodcastStore((s) => s.episodes);
  const issues = useIssueStore((s) => s.issues);
  const breakingItems = useBreakingNewsStore((s) => s.items);
  const sponsors = useSponsorStore((s) => s.sponsors);
  const metrics = useMetricsStore((s) => s.metrics);
  const races = useTippingStore((s) => s.races);
  const tipperProfiles = useTippingStore((s) => s.profiles);
  const horseConn = useMemo(() => connectionResolver(parties ?? []), [parties]);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [subscribeEmail, setSubscribeEmail] = useState('');

  const published = useMemo(
    () => (articles ?? []).filter(isLive),
    [articles]
  );

  // Non-overlapping slices so a story is never shown twice on one page.
  const heroArticle = published[0] ?? null;
  const secondaryArticles = useMemo(() => published.slice(1, 4), [published]);
  const featuredArticles = useMemo(() => published.slice(4, 7), [published]);
  const sidebarArticles = useMemo(() => published.slice(7, 12), [published]);

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

  // Next races still open for (or awaiting) tipping, soonest first.
  const upcomingRaces = useMemo(
    () =>
      races
        .filter((r) => r.status === 'open' || r.status === 'upcoming')
        .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1))
        .slice(0, 3),
    [races]
  );

  // Live tipping leaderboard, richest balance first.
  const leaderboard = useMemo(
    () => [...tipperProfiles].sort((a, b) => b.coinBalance - a.coinBalance).slice(0, 5),
    [tipperProfiles]
  );

  // The signed-in member's own tipping record (real, or null if they've never tipped).
  const myTipping = useMemo(() => {
    if (!currentUser) return null;
    const ranked = [...tipperProfiles].sort((a, b) => b.coinBalance - a.coinBalance);
    const idx = ranked.findIndex((p) => p.userId === currentUser.id);
    if (idx === -1) return null;
    return { profile: ranked[idx], rank: idx + 1, total: ranked.length };
  }, [currentUser, tipperProfiles]);

  const metricCards = useMemo(
    () =>
      metrics
        ? [
            { label: 'Active Members', value: metrics.activeMembers.toLocaleString(), icon: <Users size={16} /> },
            { label: 'Articles Published', value: metrics.articlesPublished.toLocaleString(), icon: <BookOpen size={16} /> },
            { label: 'Tips Placed', value: metrics.tipsPlaced.toLocaleString(), icon: <TrendingUp size={16} /> },
            { label: 'Leaderboard Tippers', value: metrics.leaderboardLeaders.toLocaleString(), icon: <Award size={16} /> },
          ]
        : [],
    [metrics]
  );

  // Honest subscribe: there is no anonymous email-capture store, so route the
  // visitor into real signup with their email carried across (prefilled there).
  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const email = subscribeEmail.trim();
    navigate(email ? `/signup?email=${encodeURIComponent(email)}` : '/signup');
  };

  return (
    <div className="min-h-screen bg-background">

      <LandingHero
        tickerItems={tickerItems}
        heroArticle={heroArticle}
        metricCards={metricCards}
        metrics={metrics}
      />

      {/* ── On the Card: live upcoming races ─────────────── */}
      <LandingRaces races={upcomingRaces} />

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

            <LandingLeaderboard leaders={leaderboard} />

            <LandingBulletins publishedIssues={publishedIssues} />
          </div>

          {/* ── RIGHT: Sidebar ── */}
          <LandingSidebar
            hasUser={!!currentUser}
            subscribeEmail={subscribeEmail}
            setSubscribeEmail={setSubscribeEmail}
            handleSubscribe={handleSubscribe}
            sidebarArticles={sidebarArticles}
            sponsors={sponsors}
            myTipping={myTipping}
            podcastSlot={<LandingPodcast liveEpisodes={liveEpisodes} />}
          />
        </div>
      </div>

      <LandingFooter hasUser={!!currentUser} isStaff={isStaff(currentUser)} sponsors={sponsors} />
    </div>
  );
}
