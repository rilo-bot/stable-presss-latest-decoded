import '@/styles/theme.css';
import '@/styles/brand.css';

import { useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import { NavBar } from '@/components/NavBar';
import { AgentWidget } from '@/components/AgentWidget';
import { RequireAuth, RequireStaff, RequirePermission } from '@/rbac/guards';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import InviteAccept from '@/pages/InviteAccept';
import HorseProfiles from '@/pages/HorseProfiles';
import HorseDetail from '@/pages/HorseDetail';
import HorseEditor from '@/pages/HorseEditor';
import ArticleDetail from '@/pages/ArticleDetail';
import MagazineV2Home from '@/editor-v2/MagazineV2Home';
import MagazineEditorV2 from '@/editor-v2/MagazineEditorV2';
import TippingRing from '@/pages/TippingRing';
import PodcastHub from '@/pages/PodcastHub';
import PodcastWorkflow from '@/pages/PodcastWorkflow';
import NewsIndex from '@/pages/NewsIndex';
import BlogIndex from '@/pages/BlogIndex';
import BlogPost from '@/pages/BlogPost';
import Bulletins from '@/pages/Bulletins';
import BulletinViewer from '@/pages/BulletinViewer';
import Parties from '@/pages/Parties';
import PartyDetail from '@/pages/PartyDetail';
import ClaimsQueue from '@/pages/ClaimsQueue';
import OrgDashboard from '@/pages/OrgDashboard';
import Dashboard from '@/pages/Dashboard';
import Studio from '@/pages/Studio';
import SiteContent from '@/pages/SiteContent';

/* Production system — one layout route, one page per sidebar screen. */
import ProductionSystemLayout, { ProductionSystemIndex } from '@/pages/production-system/ProductionSystemLayout';
import NewsroomRedirect from '@/pages/production-system/NewsroomRedirect';
import OverviewScreen from '@/pages/production-system/screens/OverviewScreen';
import WorkflowBoardScreen from '@/pages/production-system/screens/WorkflowBoardScreen';
import PipelineMapScreen from '@/pages/production-system/screens/PipelineMapScreen';
import AllStoriesScreen from '@/pages/production-system/screens/AllStoriesScreen';
import BlogsScreen from '@/pages/production-system/screens/BlogsScreen';
import BlogCreateForm from '@/pages/blog-composer/BlogCreateForm';
import BlogEditorScreen from '@/pages/blog-composer/BlogEditorScreen';
import InstantScreen from '@/pages/production-system/screens/InstantScreen';
import EditorHubScreen from '@/pages/production-system/screens/EditorHubScreen';
import MyAssetsScreen from '@/pages/production-system/screens/MyAssetsScreen';
import CompensationScreen from '@/pages/production-system/screens/CompensationScreen';
import HorsesScreen from '@/pages/production-system/screens/HorsesScreen';
import PeopleScreen from '@/pages/production-system/screens/PeopleScreen';
import MediaRecordsScreen from '@/pages/production-system/screens/MediaRecordsScreen';
import RacingRecordsScreen from '@/pages/production-system/screens/RacingRecordsScreen';
import TeamScreen from '@/pages/production-system/screens/TeamScreen';
import RolesScreen from '@/pages/production-system/screens/RolesScreen';
import AnalyticsScreen from '@/pages/production-system/screens/AnalyticsScreen';
import EmojiAnalyticsScreen from '@/pages/production-system/screens/EmojiAnalyticsScreen';
import SettingsScreen from '@/pages/production-system/screens/SettingsScreen';

/* Inject Google Fonts for vintage skeuomorphic horse dashboard */
function useVintageFonts() {
  useEffect(() => {
    const id = 'stable-press-vintage-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap';
    document.head.appendChild(link);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);
}

/**
 * React Router does not reset scroll on navigation, so moving to a new route
 * (e.g. clicking the wordmark from a scrolled-down page) lands you at the old
 * scroll position — which drops the hero up under the sticky navbar. Reset to
 * the top on every path change, but leave in-page `#anchor` jumps alone.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <span className="font-[family-name:var(--font-display)] text-8xl font-bold text-primary/20 leading-none mb-6">
        404
      </span>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-2">
        Unseated at the first
      </h2>
      <div className="h-px w-16 mx-auto mb-4" style={{ background: 'hsl(var(--brand-accent))' }} />
      <p className="text-sm text-muted-foreground max-w-sm mb-8">
        The page you were seeking appears to have been scratched from the card. It may have been moved or removed entirely.
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-sm hover:bg-primary/90 transition-colors"
      >
        Return to Stable Press
      </a>
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  useVintageFonts();

  // Validate any persisted JWT against the server on load; drops a stale session.
  useEffect(() => {
    void useAuthStore.getState().verifySession();
  }, []);

  // When the signed-in identity changes (login / logout / dropped session),
  // force-reload user-scoped data with the new token. Without this the horse /
  // party / link stores keep the first (often logged-out) result and a member's
  // own unverified/draft horses never appear after login. Skips the initial run
  // (the pages load their own data on mount with the already-hydrated token).
  const authToken = useAuthStore((s) => s.token);
  const firstAuthRun = useRef(true);
  useEffect(() => {
    if (firstAuthRun.current) { firstAuthRun.current = false; return; }
    void useHorseStore.getState().fetchHorses(true);
    void usePartyStore.getState().fetchParties(true);
    void useHorsePartyLinkStore.getState().fetchHorsePartyLinks(true);
  }, [authToken]);

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Public routes with nav */}
        <Route
          path="/"
          element={
            <AppLayout>
              <Landing />
            </AppLayout>
          }
        />
        <Route
          path="/news"
          element={
            <AppLayout>
              <NewsIndex />
            </AppLayout>
          }
        />
        {/* Blog. Public; a draft 404s for everyone but its author and staff,
            which the API decides — the route itself is open. */}
        <Route
          path="/blog"
          element={
            <AppLayout>
              <BlogIndex />
            </AppLayout>
          }
        />
        <Route
          path="/blog/:slug"
          element={
            <AppLayout>
              <BlogPost />
            </AppLayout>
          }
        />
        <Route
          path="/bulletins"
          element={
            <AppLayout>
              <Bulletins />
            </AppLayout>
          }
        />
        <Route
          path="/bulletins/:id"
          element={
            <AppLayout>
              <BulletinViewer />
            </AppLayout>
          }
        />
        <Route
          path="/horses"
          element={
            <AppLayout>
              <HorseProfiles />
            </AppLayout>
          }
        />
        <Route
          path="/horses/:id"
          element={
            <AppLayout>
              <HorseDetail />
            </AppLayout>
          }
        />
        <Route
          path="/articles/:id"
          element={
            <AppLayout>
              <ArticleDetail />
            </AppLayout>
          }
        />
        <Route
          path="/tipping"
          element={
            <AppLayout>
              <TippingRing />
            </AppLayout>
          }
        />
        <Route
          path="/podcast"
          element={
            <AppLayout>
              <PodcastHub />
            </AppLayout>
          }
        />
        <Route
          path="/parties"
          element={
            <AppLayout>
              <Parties />
            </AppLayout>
          }
        />
        <Route
          path="/parties/:id"
          element={
            <AppLayout>
              <PartyDetail />
            </AppLayout>
          }
        />

        {/* Auth routes — full-screen, no nav */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Team invite link. Public by necessity — the recipient has no account
            yet. One click on the page redeems the token and signs them in; the
            token is single-use. See apps/server/src/lib/invites.ts. */}
        <Route path="/invite/:token" element={<InviteAccept />} />

        {/* Staff-only routes — readers/parties are redirected home */}
        <Route element={<RequireStaff />}>
          {/* ── Production system ──
              Every screen is a real route under /production-system, sharing one
              layout (sidebar + shared dialogs). Deliberately NOT wrapped in
              AppLayout: the public site's three header rows are website chrome,
              and the sidebar already owns navigation, identity and the way back
              to the site. */}
          <Route path="/production-system" element={<ProductionSystemLayout />}>
            <Route index element={<ProductionSystemIndex />} />
            <Route path="overview" element={<OverviewScreen />} />
            <Route path="workflow" element={<WorkflowBoardScreen />} />
            <Route path="pipeline" element={<PipelineMapScreen />} />
            <Route path="all-stories" element={<AllStoriesScreen />} />
            {/* Cards → create form → editor. All three sit INSIDE the layout
                route, so the sidebar stays put and none of them takes the page
                over. `new` before `:id` reads in the order you meet them. */}
            <Route path="blogs" element={<BlogsScreen />} />
            <Route path="blogs/new" element={<BlogCreateForm />} />
            <Route path="blogs/:id" element={<BlogEditorScreen />} />
            {/* Instant — capture (photos + voice) → AI draft → a draft story or
                post. Its own module rather than a mode of the story form: the
                whole point is that it starts from a photograph. */}
            <Route path="instant" element={<InstantScreen />} />
            <Route path="editor-hub" element={<EditorHubScreen />} />
            <Route path="my-assets" element={<MyAssetsScreen />} />
            <Route path="compensation" element={<CompensationScreen />} />
            <Route path="horses" element={<HorsesScreen />} />
            <Route path="people" element={<PeopleScreen />} />
            <Route path="media-records" element={<MediaRecordsScreen />} />
            <Route path="racing-records" element={<RacingRecordsScreen />} />
            <Route path="team" element={<TeamScreen />} />
            <Route path="roles" element={<RolesScreen />} />
            <Route path="analytics" element={<AnalyticsScreen />} />
            {/* Reader sentiment. Static sample data — the reaction feed it
                describes doesn't exist yet; the screen says so on its face. */}
            <Route path="emoji-analytics" element={<EmojiAnalyticsScreen />} />
            <Route path="settings" element={<SettingsScreen />} />
            {/* Magazine Builder — behind the MAGAZINE_V2 server flag. */}
            <Route path="magazine-v2" element={<MagazineV2Home />} />
            {/* An unrecognised sub-path would otherwise render the shell around
                an empty <main>. Send it to whichever screen the user has. */}
            <Route path="*" element={<ProductionSystemIndex />} />
          </Route>

          {/* The full-screen magazine editor — deep-linkable, no chrome at all, so
              it sits outside the layout rather than inside it. (A second editor was
              mounted at /magazine/:id for the retired v1 template builder.) */}
          <Route path="/production-system/magazine-v2/:id" element={<MagazineEditorV2 />} />

          {/* Staff-invite and magazine-share emails already in people's inboxes
              point at /newsroom, so the old path keeps resolving. */}
          <Route path="/newsroom/*" element={<NewsroomRedirect />} />

          <Route
            path="/podcast/workflow"
            element={
              <AppLayout>
                <PodcastWorkflow />
              </AppLayout>
            }
          />
          <Route
            path="/site-content"
            element={
              <AppLayout>
                <SiteContent />
              </AppLayout>
            }
          />
        </Route>

        {/* Member routes — any signed-in user */}
        <Route element={<RequireAuth />}>
          <Route
            path="/dashboard"
            element={
              <AppLayout>
                <Dashboard />
              </AppLayout>
            }
          />
          <Route
            path="/orgs/:id"
            element={
              <AppLayout>
                <OrgDashboard />
              </AppLayout>
            }
          />
          <Route
            path="/studio/:id"
            element={
              <AppLayout>
                <Studio />
              </AppLayout>
            }
          />
          <Route
            path="/studio/horse/:id"
            element={
              <AppLayout>
                <HorseEditor />
              </AppLayout>
            }
          />
        </Route>

        {/* Permission-gated admin routes. Was `RequireRole roles={['administrator']}`
            — a hardcoded slug that a superadmin-defined role could never satisfy.
            /staff is gone: it duplicated Newsroom → Team Members. */}
        <Route element={<RequirePermission permission="platform.admin" />}>
          <Route
            path="/claims"
            element={
              <AppLayout>
                <ClaimsQueue />
              </AppLayout>
            }
          />
        </Route>

        {/* 404 */}
        <Route
          path="*"
          element={
            <AppLayout>
              <NotFound />
            </AppLayout>
          }
        />
      </Routes>

      {/* AI concierge — available on every page */}
      <AgentWidget />

      <Toaster richColors position="top-right" />
    </>
  );
}
