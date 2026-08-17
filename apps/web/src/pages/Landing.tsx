import { useMemo, useState, useEffect } from 'react';
import { isLive } from '@/types/article';
import { useNavigate } from 'react-router-dom';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { usePeopleStore } from '@/stores/peopleStore';
import { connectionResolver } from '@/lib/horseConnections';
import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { useIssueStore } from '@/stores/issueStore';
import { useBreakingNewsStore } from '@/stores/breakingNewsStore';
import { useSponsorStore } from '@/stores/sponsorStore';
import { useMetricsStore } from '@/stores/metricsStore';
import { useBlogStore } from '@/stores/blogStore';
import { isAdmin } from '@/rbac/can';
import { BookOpen, Newspaper, Radio, Star, Users } from 'lucide-react';
import { usePageMeta } from '@/lib/usePageMeta';
// The same category taxonomy /news filters on, so the front page's
// "Analysis & Interviews" section and that page's section tabs agree.
import { CATEGORIES } from './news-index/constants';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import type { PublicNavKey } from '@/types/siteSettings';
import { LandingHero, type HeroCount } from './landing/LandingHero';
import { LandingManifesto } from './landing/LandingManifesto';
import { LandingFeaturedArticles, LandingStables } from './landing/LandingFeaturedArticles';
import { LandingSections } from './landing/LandingSections';
import { LandingBlog } from './landing/LandingBlog';
import { LandingDirectory } from './landing/LandingDirectory';
import { LandingBulletins } from './landing/LandingBulletins';
import { LandingSidebar } from './landing/LandingSidebar';
import { LandingPodcast } from './landing/LandingPodcast';
import { LandingDesk } from './landing/LandingDesk';
import { LandingMembership } from './landing/LandingMembership';
import { LandingSponsors } from './landing/LandingSponsors';
import { LandingFooter } from './landing/LandingFooter';
import { useRegister } from '@/lib/register';

/* ── Component ────────────────────────────────────────── */

export default function Landing() {
  const navigate = useNavigate();

  // === auto fetch-on-mount (backend planner) ===
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  /**
   * THE DIRECTORY NEEDED THIS AND NOBODY CALLED IT.
   *
   * `useRegister()` joins two stores — `people` (who someone is) and `parties`
   * (one edge per role × horse). This page fetched only the edges, so `people`
   * stayed `[]`, the join produced nothing, and `LandingDirectory` — which returns
   * null when it has nobody to show — rendered NOTHING on every visit. A whole
   * section of the front page was dead, silently, because the block that would
   * have complained about being empty had made itself invisible instead.
   *
   * `fetchPeople` is only reachable through `useLoadRegister()`, which this page
   * does not use (it fetches on mount with everything else). Called directly here.
   */
  const fetchPeople = usePeopleStore((s) => s.fetchPeople);
  /** Raw edges — a horse's connections come from these, not the joined register. */
  const partyEdges = usePartyStore((s) => s.parties);
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
    fetchPeople();
    // Silent: a reader cannot act on "HTTP 500", and the masthead says something
    // honest in the space instead. See the note on fetchArticles in articleStore.ts.
    fetchArticles({ silent: true });
    fetchPodcastEpisodes();
    fetchIssues();
    fetchBreakingNews();
    fetchSponsors();
    fetchMetrics();
    fetchLatestBlogs(3);
  }, [
    fetchHorses,
    fetchParties,
    fetchPeople,
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
  // Real loading state — drives the masthead skeleton and the story grid until
  // articles actually arrive. It reaches the HERO now: it used to stop at the
  // "Latest" grid, so the masthead spent every cold load showing the copy written
  // for "nothing has ever been published". See the note in LandingHero.tsx.
  const articlesLoading = useArticleStore((s) => !s.loaded && !s.error);
  /** Loading finished and the request failed — a different fact, and different copy. */
  const articlesFailed = useArticleStore((s) => !s.loaded && !!s.error);
  const horses = useHorseStore((s) => s.horses);
  const parties = useRegister();
  const episodes = usePodcastStore((s) => s.episodes);
  const issues = useIssueStore((s) => s.issues);
  const breakingItems = useBreakingNewsStore((s) => s.items);
  const sponsors = useSponsorStore((s) => s.sponsors);
  const metrics = useMetricsStore((s) => s.metrics);
  // Its own slice, not the `items` array /blog and the newsroom share — see the
  // note on `latest` in stores/blogStore.ts.
  const latestBlogs = useBlogStore((s) => s.latest);
  const horseConn = useMemo(() => connectionResolver(partyEdges), [partyEdges]);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [subscribeEmail, setSubscribeEmail] = useState('');

  const published = useMemo(
    () => (articles ?? []).filter(isLive),
    [articles]
  );

  /* Non-overlapping selections, so a story is never shown twice on one page.
   *
   * The lead, "Next up" and "Latest" are pure recency, which is what those three
   * claim to be. "Analysis & Interviews" is the one that has to SELECT, because its
   * heading names a section: it was `published.slice(4, 7)` — the fifth, sixth and
   * seventh newest stories regardless of category — under a heading promising
   * analysis and interviews, beside a link to /news?section=analysis that really
   * does filter.
   *
   * The section axis is the CATEGORIES table /news itself filters on, so the front
   * page and the section page now agree about what belongs where.
   *
   * THE MASTHEAD TOOK TWO STORIES. `nextUp` is the pair beside the lead, so
   * "Latest" starts at index 3 rather than 1. Those two appear nowhere else — which
   * is also why LandingHero must not hide its panel at any breakpoint.
   */
  const heroArticle = published[0] ?? null;
  const nextUp = useMemo(() => published.slice(1, 3), [published]);

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

  /**
   * "ANALYSIS & INTERVIEWS" IS PICKED BEFORE "LATEST", and the order matters.
   *
   * It used to be the other way round, and that worked only because "Latest" showed
   * three stories. At six it starves this block: the masthead takes three and Latest
   * takes six, so on a site with twelve published stories the section whose heading
   * NAMES a category was choosing from the three nobody else had used — and rendered
   * its "will be featured here" placeholder while five analysis pieces sat in the
   * grid above it under a heading that says nothing about category.
   *
   * A block that names a section gets first refusal on that section. "Latest" then
   * takes the newest of whatever is left, which is still exactly what its heading
   * claims — it does not promise the newest stories on the site, it promises the
   * newest ones here.
   */
  const featuredArticles = useMemo(() => {
    const inMasthead = new Set([heroArticle?.id, ...nextUp.map((a) => a.id)]);
    return published
      .filter((a) => !inMasthead.has(a.id) && featureCategoryKeys.has(a.category ?? ''))
      .slice(0, 4);
  }, [published, heroArticle, nextUp, featureCategoryKeys]);

  /** Six, in two rows of three — the newest of what the blocks above did not take. */
  const latestArticles = useMemo(() => {
    const alreadyShown = new Set([
      heroArticle?.id,
      ...nextUp.map((a) => a.id),
      ...featuredArticles.map((a) => a.id),
    ]);
    return published.filter((a) => !alreadyShown.has(a.id)).slice(0, 6);
  }, [published, heroArticle, nextUp, featuredArticles]);

  // Everything not already on the page, for the rail. Computed from what was
  // actually used rather than a fixed `slice(7, 12)`, which skipped stories
  // whenever the sections above it showed fewer than seven between them.
  const sidebarArticles = useMemo(() => {
    const alreadyShown = new Set([
      heroArticle?.id,
      ...nextUp.map((a) => a.id),
      ...featuredArticles.map((a) => a.id),
      ...latestArticles.map((a) => a.id),
    ]);
    return published.filter((a) => !alreadyShown.has(a.id)).slice(0, 5);
  }, [published, heroArticle, nextUp, featuredArticles, latestArticles]);

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

  // Website Customisation — the same six switches the navbar reads.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  const shows = (key: PublicNavKey) => publicNav[key] !== false;

  /**
   * The counts strip.
   *
   * TWO OF THE FOUR USED TO BE TIPPING. "Tips placed" and "Tipping profiles" were
   * half the numbers on the front page, for the one feature deliberately taken off
   * it — and "Tipping profiles" counted profiles that had never placed a tip.
   *
   * The five below describe the five things this page actually shows, each one
   * counted the same way the section that displays it counts. No server change was
   * needed: every figure comes from a store this page already fetches. They are
   * exact for as long as those endpoints stay unpaginated — the day /api/articles
   * gets a `limit`, `published.length` becomes "the first page of stories" and this
   * strip has to move to a server count.
   *
   * A count of zero is dropped rather than shown as "0", and a count for a section
   * an admin has switched off is dropped too: the strip must not advertise a
   * surface a reader cannot reach.
   */
  const storiesPublished = metrics?.articlesPublished ?? (articlesLoading ? null : published.length);

  const counts = useMemo<HeroCount[]>(() => {
    const listedInRegister = parties.filter((p) => p.roles.length > 0).length;
    const publishedEpisodes = episodes.filter((e) => e.status === 'published').length;
    const publishedBulletins = issues.filter((i) => !i.unpublishedAt).length;

    const candidates: Array<HeroCount & { section: PublicNavKey; count: number }> = [
      {
        section: 'news',
        count: storiesPublished ?? 0,
        label: 'Stories published',
        value: (storiesPublished ?? 0).toLocaleString(),
        icon: <BookOpen size={16} />,
      },
      {
        section: 'horses',
        count: horses.length,
        label: 'Horse profiles',
        value: horses.length.toLocaleString(),
        icon: <Star size={16} />,
      },
      {
        // The same predicate LandingDirectory renders on, so the number and the
        // cards below it cannot disagree about who is in the register.
        section: 'directory',
        count: listedInRegister,
        label: 'In the register',
        value: listedInRegister.toLocaleString(),
        icon: <Users size={16} />,
      },
      {
        section: 'podcast',
        count: publishedEpisodes,
        label: 'Podcast episodes',
        value: publishedEpisodes.toLocaleString(),
        icon: <Radio size={16} />,
      },
      {
        section: 'bulletins',
        count: publishedBulletins,
        label: 'Bulletins published',
        value: publishedBulletins.toLocaleString(),
        icon: <Newspaper size={16} />,
      },
    ];

    return candidates
      .filter((c) => c.count > 0 && publicNav[c.section] !== false)
      .map(({ label, value, icon }) => ({ label, value, icon }));
  }, [storiesPublished, horses, parties, episodes, issues, publicNav]);

  // Honest subscribe: there is no anonymous email-capture store, so route the
  // visitor into real signup with their email carried across (prefilled there).
  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const email = subscribeEmail.trim();
    navigate(email ? `/signup?email=${encodeURIComponent(email)}` : '/signup');
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── 1–3 · Ticker, masthead spread, counts ────────── */}
      <LandingHero
        tickerItems={tickerItems}
        articlesLoading={articlesLoading}
        articlesFailed={articlesFailed}
        heroArticle={heroArticle}
        nextUp={nextUp}
        counts={counts}
        storiesPublished={storiesPublished}
      />

      {/* ── 4 · What Stable Press is ──────────────────────
          The page went from a photograph straight to a list of headlines and never
          said what it was. Static copy, but every line of it checkable — see the
          rule at the top of landing/copy.ts. */}
      <LandingManifesto />

      {/* ── 5–6 · The newsroom, with the rail ─────────────
          Edge to edge — the `max-w-7xl mx-auto` cap is gone, matching the header. */}
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">

          {/* ── LEFT / CENTRE ── */}
          <div className="lg:col-span-2 space-y-12">
            <LandingFeaturedArticles
              articlesLoading={articlesLoading}
              latestArticles={latestArticles}
              featuredArticles={featuredArticles}
              isAdmin={isAdmin(currentUser)}
            />
          </div>

          {/* ── RIGHT: Sidebar ──
              Two blocks, from four. The podcast card and the sponsor list left the
              rail for full-width bands of their own — see LandingPodcast.tsx and
              LandingSponsors.tsx. */}
          <LandingSidebar
            hasUser={!!currentUser}
            subscribeEmail={subscribeEmail}
            setSubscribeEmail={setSubscribeEmail}
            handleSubscribe={handleSubscribe}
            sidebarArticles={sidebarArticles}
          />
        </div>
      </div>

      {/* ── 7 · What's inside ─────────────────────────────
          Descriptions come from PUBLIC_NAV_SECTIONS, filtered by the same switches
          as the nav — so this band always describes the site that is running. */}
      <LandingSections />

      {/* ── 8–11 · The rest of the paper, full width ──────
          These four were columns in the 2/3 grid above, which gave a four-across
          directory two-across and a bulletin cover a third of the page. Each block
          below is one public section, so each goes with its Website Customisation
          switch: leaving a block up for a section an admin has switched off would
          fill the front page with links that redirect straight back to it. */}
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20 space-y-14 md:space-y-16">
        {/* /blog had no presence on the front page at all — it existed only as a
            nav item, so a reader arriving at the front door could not learn the
            longform writing was there. */}
        {shows('blog') && <LandingBlog posts={latestBlogs} />}

        {shows('horses') && (
          <LandingStables horses={horses} horseConn={horseConn} isAdmin={isAdmin(currentUser)} />
        )}

        {/* The front page's way into /parties — which was a public route in no
            navigation menu on either breakpoint. */}
        {shows('directory') && <LandingDirectory parties={parties ?? []} />}

        {shows('bulletins') && <LandingBulletins publishedIssues={publishedIssues} />}
      </div>

      {/* ── 12 · The podcast ──────────────────────────────
          Promoted out of the rail, where it was a 19rem card under two other
          blocks, into the site's one audio band. */}
      {shows('podcast') && <LandingPodcast liveEpisodes={liveEpisodes} />}

      {/* ── 13 · How the desk works ───────────────────────
          The five real ARTICLE_STATUSES. The "why trust us" block that needs no
          invented evidence to be one. */}
      <LandingDesk />

      {/* ── 14 · What an account gets you, and the FAQ ────
          Replaces the sidebar's list of things that were not true. Deliberately
          carries NO call to action — the band below it is the ask. */}
      <LandingMembership hasUser={!!currentUser} />

      {/* ── 15 · Partners ────────────────────────────────
          The one sponsor surface on the page; the footer's duplicate bar is gone. */}
      <LandingSponsors sponsors={sponsors} />

      {/* ── 16–17 · The ask, and the footer ─────────────── */}
      <LandingFooter hasUser={!!currentUser} isAdmin={isAdmin(currentUser)} />
    </div>
  );
}
