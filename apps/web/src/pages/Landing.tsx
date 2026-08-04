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
import { useBlogStore } from '@/stores/blogStore';
import { isStaff } from '@/rbac/can';
import { TrendingUp, Users, BookOpen, Award } from 'lucide-react';
import { usePageMeta } from '@/lib/usePageMeta';
// The same category taxonomy /news filters on, so the front page's
// "Analysis & Interviews" section and that page's section tabs agree.
import { CATEGORIES } from './news-index/constants';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import type { PublicNavKey } from '@/types/siteSettings';
import { LandingHero } from './landing/LandingHero';
import { LandingFeaturedArticles } from './landing/LandingFeaturedArticles';
import { LandingBlog } from './landing/LandingBlog';
import { LandingDirectory } from './landing/LandingDirectory';
import { LandingBulletins } from './landing/LandingBulletins';
import { LandingSidebar } from './landing/LandingSidebar';
import { LandingPodcast } from './landing/LandingPodcast';
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
  const fetchLatestBlogs = useBlogStore((s) => s.fetchLatest);
  useEffect(() => {
    fetchHorses();
    fetchParties();
    fetchArticles();
    fetchPodcastEpisodes();
    fetchIssues();
    fetchBreakingNews();
    fetchSponsors();
    fetchMetrics();
    fetchLatestBlogs(3);
  }, [
    fetchHorses,
    fetchParties,
    fetchArticles,
    fetchPodcastEpisodes,
    fetchIssues,
    fetchBreakingNews,
    fetchSponsors,
    fetchMetrics,
    fetchLatestBlogs,
  ]);
  // === end auto fetch-on-mount ===

  // The front page was one of fifteen public routes sharing index.html's single
  // static title, so every tab, bookmark and history entry read the same thing.
  usePageMeta({
    title: 'The Thoroughbred Racing Record',
    description:
      'Stable Press — race reports, form analysis, interviews, horse profiles and the industry directory for Australian and New Zealand thoroughbred racing.',
  });

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
  // Its own slice, not the `items` array /blog and the newsroom share — see the
  // note on `latest` in stores/blogStore.ts.
  const latestBlogs = useBlogStore((s) => s.latest);
  const horseConn = useMemo(() => connectionResolver(parties ?? []), [parties]);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [subscribeEmail, setSubscribeEmail] = useState('');

  const published = useMemo(
    () => (articles ?? []).filter(isLive),
    [articles]
  );

  /* Non-overlapping selections, so a story is never shown twice on one page.
   *
   * The lead and "Latest" are pure recency, which is what those two claim to be.
   * "Analysis & Interviews" is the one that has to SELECT, because its heading
   * names a section: it was `published.slice(4, 7)` — the fifth, sixth and seventh
   * newest stories regardless of category — under a heading promising analysis and
   * interviews, beside a link to /news?section=analysis that really does filter.
   *
   * The section axis is the CATEGORIES table /news itself filters on, so the front
   * page and the section page now agree about what belongs where.
   */
  const heroArticle = published[0] ?? null;
  const secondaryArticles = useMemo(() => published.slice(1, 4), [published]);

  /** Category keys belonging to the analysis and interviews sections. */
  const featureCategoryKeys = useMemo(
    () =>
      new Set(
        CATEGORIES.filter((c) => c.section === 'analysis' || c.section === 'interviews').map(
          (c) => c.key,
        ),
      ),
    [],
  );

  const featuredArticles = useMemo(() => {
    const alreadyShown = new Set([heroArticle?.id, ...secondaryArticles.map((a) => a.id)]);
    return published
      .filter((a) => !alreadyShown.has(a.id) && featureCategoryKeys.has(a.category ?? ''))
      .slice(0, 3);
  }, [published, heroArticle, secondaryArticles, featureCategoryKeys]);

  // Everything not already on the page, for the rail. Computed from what was
  // actually used rather than a fixed `slice(7, 12)`, which skipped stories
  // whenever the sections above it showed fewer than seven between them.
  const sidebarArticles = useMemo(() => {
    const alreadyShown = new Set([
      heroArticle?.id,
      ...secondaryArticles.map((a) => a.id),
      ...featuredArticles.map((a) => a.id),
    ]);
    return published.filter((a) => !alreadyShown.has(a.id)).slice(0, 5);
  }, [published, heroArticle, secondaryArticles, featuredArticles]);

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

  /* THE THREE TIPPING SECTIONS ARE GONE FROM THIS PAGE.
   *
   * "On the Card" (the next races), "Top of the Ring" (the leaderboard) and "Your
   * Tipping Record" all lived here, alongside a Tipping Ring CTA card in the
   * sidebar — four of the page's blocks for a feature that is not launching with
   * the site. The ring still works and /tipping is still linked from the footer;
   * it is simply not advertised on the front page yet.
   *
   * Nothing was deleted: LandingRaces.tsx and LandingLeaderboard.tsx are untouched
   * and the stores still expose everything they need. Re-adding the sections is
   * three lines here plus the nav entry in navbar/config.tsx.
   *
   * `fetchRaces` therefore no longer runs on mount — it was three of this page's
   * eleven requests (races, tips, tipper profiles) for data nothing now renders.
   */

  // Labels say exactly what the four counts in routes/metrics.ts measure.
  //
  // "Active Members" was the label on `count(users)` — every row in the users
  // collection, including staff and accounts created and never used again. There
  // is no activity predicate anywhere in that query, so the word "Active" was
  // doing work the data does not support. Same for "Leaderboard Tippers", which
  // counts tipper PROFILES, including profiles that have never placed a tip.
  const metricCards = useMemo(
    () =>
      metrics
        ? [
            { label: 'Registered members', value: metrics.activeMembers.toLocaleString(), icon: <Users size={16} /> },
            { label: 'Stories published', value: metrics.articlesPublished.toLocaleString(), icon: <BookOpen size={16} /> },
            { label: 'Tips placed', value: metrics.tipsPlaced.toLocaleString(), icon: <TrendingUp size={16} /> },
            { label: 'Tipping profiles', value: metrics.leaderboardLeaders.toLocaleString(), icon: <Award size={16} /> },
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

  // Website Customisation — the same six switches the navbar reads.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  const shows = (key: PublicNavKey) => publicNav[key] !== false;

  return (
    <div className="min-h-screen bg-background">

      <LandingHero
        tickerItems={tickerItems}
        heroArticle={heroArticle}
        metricCards={metricCards}
        metrics={metrics}
      />

      {/* ── Main Content Grid ────────────────────────────── */}
      {/* Edge to edge — the `max-w-7xl mx-auto` cap is gone, matching the header. */}
      <div className="px-6 md:px-10 lg:px-16 py-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">

          {/* ── LEFT / CENTRE ── */}
          <div className="lg:col-span-2 space-y-12">
            <LandingFeaturedArticles
              articlesLoading={articlesLoading}
              secondaryArticles={secondaryArticles}
              featuredArticles={featuredArticles}
              horses={horses}
              horseConn={horseConn}
              isStaff={isStaff(currentUser)}
            />

            {/* Each block below is one public section, so each goes with its
                Website Customisation switch. Leaving a block up for a section an
                admin has switched off would fill the front page with links that
                redirect straight back to it. (LandingFeaturedArticles above holds
                two sections — News and Horses — and reads the switches itself.) */}

            {/* NEW. /blog had no presence on the front page at all — it existed
                only as a nav item, so a reader arriving at the front door could not
                learn the longform writing was there. */}
            {shows('blog') && <LandingBlog posts={latestBlogs} />}

            {shows('bulletins') && <LandingBulletins publishedIssues={publishedIssues} />}

            {/* NEW, and the front page's way into /parties — which was a public
                route in no navigation menu on either breakpoint. */}
            {shows('directory') && <LandingDirectory parties={parties ?? []} />}
          </div>

          {/* ── RIGHT: Sidebar ── */}
          <LandingSidebar
            hasUser={!!currentUser}
            subscribeEmail={subscribeEmail}
            setSubscribeEmail={setSubscribeEmail}
            handleSubscribe={handleSubscribe}
            sidebarArticles={sidebarArticles}
            sponsors={sponsors}
            podcastSlot={shows('podcast') ? <LandingPodcast liveEpisodes={liveEpisodes} /> : null}
          />
        </div>
      </div>

      <LandingFooter hasUser={!!currentUser} isStaff={isStaff(currentUser)} sponsors={sponsors} />
    </div>
  );
}
