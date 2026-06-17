import '@/styles/theme.css';
import '@/styles/brand.css';

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';

import { NavBar } from '@/components/NavBar';
import { AgentWidget } from '@/components/AgentWidget';
import { RequireAuth, RequireStaff, RequireRole } from '@/rbac/guards';
import { useAuthStore } from '@/stores/authStore';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import HorseProfiles from '@/pages/HorseProfiles';
import HorseDetail from '@/pages/HorseDetail';
import HorseEditor from '@/pages/HorseEditor';
import ArticleDetail from '@/pages/ArticleDetail';
import Newsroom from '@/pages/Newsroom';
import MagazineStudio from '@/pages/MagazineStudio';
import TippingRing from '@/pages/TippingRing';
import PodcastHub from '@/pages/PodcastHub';
import PodcastWorkflow from '@/pages/PodcastWorkflow';
import NewsIndex from '@/pages/NewsIndex';
import Newsletter from '@/pages/Newsletter';
import Bulletins from '@/pages/Bulletins';
import BulletinViewer from '@/pages/BulletinViewer';
import Parties from '@/pages/Parties';
import PartyDetail from '@/pages/PartyDetail';
import ClaimsQueue from '@/pages/ClaimsQueue';
import OrgDashboard from '@/pages/OrgDashboard';
import Dashboard from '@/pages/Dashboard';
import Studio from '@/pages/Studio';
import StaffAdmin from '@/pages/StaffAdmin';
import SiteContent from '@/pages/SiteContent';

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

  return (
    <>
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
        <Route
          path="/newsletter"
          element={
            <AppLayout>
              <Newsletter />
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

        {/* Staff-only routes — readers/parties are redirected home */}
        <Route element={<RequireStaff />}>
          <Route
            path="/newsroom"
            element={
              <AppLayout>
                <Newsroom />
              </AppLayout>
            }
          />
          {/* Full-screen magazine editor — its own deep-linkable route, no nav chrome. */}
          <Route path="/newsroom/magazine/:id" element={<MagazineStudio />} />
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

        {/* Admin-only routes */}
        <Route element={<RequireRole roles={['administrator']} />}>
          <Route
            path="/claims"
            element={
              <AppLayout>
                <ClaimsQueue />
              </AppLayout>
            }
          />
          <Route
            path="/staff"
            element={
              <AppLayout>
                <StaffAdmin />
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
