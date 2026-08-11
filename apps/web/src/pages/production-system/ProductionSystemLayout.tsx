/**
 * Production system shell.
 *
 * Deliberately does NOT sit inside `AppLayout`: the public site's three header
 * rows (masthead strip, wordmark row, section nav) are website chrome, and in a
 * CMS they cost ~112px of every screen while duplicating navigation the sidebar
 * already owns. Identity, notifications and the way back to the site live in
 * the sidebar footer instead.
 *
 * Scrolling: the sidebar is `sticky top-0 h-screen` and scrolls its own nav
 * list, while the document scrolls the content. Previously the whole rail
 * scrolled away with the page body.
 *
 * The shared dialogs live here rather than in any one screen because several
 * screens open them (the article form is reachable from Overview, the Workflow
 * Board, All Stories and the Editor Hub).
 */
import { useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ArticleForm } from '@/components/ArticleForm';
import { HorseForm } from '@/components/HorseForm';
import { PartyForm } from '@/components/PartyForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { StoryStudioPanel } from '@/agent/story/StoryStudioPanel';
import { BlogStudioPanel } from '@/agent/blog/BlogStudioPanel';
import { can } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';

import { MediaFormPanel } from '../newsroom/production-systems/MediaFormPanel';
import { RacingFormPanel } from '../newsroom/production-systems/RacingFormPanel';
import { PS_BASE, SIDE_NAV, navPath } from '../newsroom/constants';
import { FileStoryButton } from '../newsroom/components/FileStoryButton';
import {
  ProductionSystemNavDrawer, ProductionSystemSidebar,
} from './components/ProductionSystemNav';
import { ProductionSystemTopBar } from './components/ProductionSystemTopBar';
import { useProductionSystemState } from './useProductionSystemState';

/**
 * Screens whose primary action is "File a Story". The registers (horses,
 * people, media, racing) have their own add buttons, and Team/Roles/Analytics/
 * Settings have nothing to do with filing copy — the old page showed the button
 * on all of them via a negated condition, so Settings offered to file a story.
 */
// SLUGS, not module ids — this is matched against the URL segment below, and
// All Stories is `id: 'stories'` at `slug: 'all-stories'`.
const STORY_SCREENS = new Set(['overview', 'workflow', 'pipeline', 'all-stories', 'editor-hub']);

/**
 * The screen a bare `/production-system` lands on: the first one this user
 * actually has. `activeNav` used to default to 'workflow' for everybody, which
 * meant a role without the Workflow Board module still opened onto it — the
 * rail entry was gone but the board rendered anyway.
 */
export function ProductionSystemIndex() {
  const modules = useAuthStore((s) => s.currentUser?.access?.modules);
  // Session not resolved yet — render nothing rather than bouncing away from a
  // screen the user may well have access to a moment from now.
  if (!modules) return null;
  const first = SIDE_NAV.find((i) => modules.includes(i.id));
  if (first) return <Navigate to={navPath(first)} replace />;

  // Staff, signed in, and their role grants no screens. This used to redirect to
  // the public site, which reads exactly like being logged out — the one thing
  // they know is untrue. Newsroom access comes with being on the team now, so
  // this state is reachable by simply not ticking a screen, and it has to
  // explain itself.
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-sm border border-border/60 bg-card p-7 text-center">
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          Nothing assigned yet
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You're on the Stable Press team, but your role doesn't include any screens yet. An
          administrator can add them from Roles &amp; Permissions.
        </p>
        <Button variant="outline" onClick={() => { window.location.href = '/'; }}>
          Go to the public site
        </Button>
      </div>
    </div>
  );
}

export default function ProductionSystemLayout() {
  const state = useProductionSystemState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const [navOpen, setNavOpen] = useState(false);

  const {
    currentUser, accentColor, visibleNav, accessModules, pendingReview,
    formOpen, editArticle, defaultStatus, deleteTarget, deleting,
    setDeleteTarget, handleFormClose, confirmDelete, ps,
  } = state;

  const handleLogout = () => {
    logout();
    toast.success('You have signed out of Stable Press.');
    navigate('/');
  };

  // Hiding a sidebar entry is not the same as closing the screen behind it.
  // Now that every screen is a real URL, a user can type or bookmark one they
  // no longer have the module for — so the check has to happen here rather than
  // relying on the entry being absent from the rail.
  //
  // Every screen is SIDE_NAV-backed now, so every screen is gated. The v1
  // Magazine Studio used to be the exception — reached from Overview, absent from
  // the rail, and deliberately absent from the server's module catalogue, so
  // resolving its slug here would have locked it for everyone.
  const slug = pathname.slice(PS_BASE.length).replace(/^\//, '').split('/')[0];
  const gatedModuleId = SIDE_NAV.find((i) => i.slug === slug)?.id;
  const blocked =
    !!accessModules && !!gatedModuleId && !accessModules.includes(gatedModuleId);

  const counts = {
    pendingReview,
    horses: ps.horses ?? [],
    safeParties: ps.safeParties,
    mediaItems: ps.mediaItems ?? [],
    racingEntries: ps.racingEntries ?? [],
  };

  const activeItem = SIDE_NAV.find(
    (i) => pathname === navPath(i) || pathname.startsWith(`${navPath(i)}/`),
  );

  if (blocked) return <Navigate to={PS_BASE} replace />;

  const title = activeItem?.label ?? 'Production System';
  const actions =
    STORY_SCREENS.has(slug) && can('stories.create') ? (
      <FileStoryButton onOpenStudio={state.handleOpenStudio} onNewInColumn={state.handleNewInColumn} />
    ) : undefined;

  return (
    <div className="flex min-h-screen bg-background">
      <ProductionSystemSidebar
        collapsed={state.sidebarCollapsed}
        setCollapsed={state.setSidebarCollapsed}
        accentColor={accentColor}
        visibleNav={visibleNav}
        currentUser={currentUser}
        onLogout={handleLogout}
        {...counts}
      />

      <ProductionSystemNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        accentColor={accentColor}
        visibleNav={visibleNav}
        currentUser={currentUser}
        onLogout={handleLogout}
        {...counts}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ProductionSystemTopBar
          title={title}
          actions={actions}
          onOpenNav={() => setNavOpen(true)}
        />

        {/* min-w-0 so wide children (stage strip, kanban grid, record tables)
            scroll inside their own containers instead of stretching the row and
            scrolling the whole page sideways. */}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          <Outlet context={state} />
        </main>
      </div>

      {/* ── Shared dialogs — opened from more than one screen ── */}

      <ArticleForm
        open={formOpen}
        onClose={handleFormClose}
        editArticle={editArticle}
        defaultStatus={defaultStatus}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this story?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  “<span className="font-semibold text-foreground">{deleteTarget.title}</span>” will be
                  removed from the workflow board. This can be restored by an administrator.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Story Studio AI drawer — writes & files a draft conversationally */}
      <StoryStudioPanel />

      {/* Blog Studio AI drawer — writes longform posts, and revises, publishes or
          deletes existing ones. Mounted here rather than on the Blogs screen so the
          conversation survives navigating between the list and a post's editor. */}
      <BlogStudioPanel />

      <HorseForm
        open={ps.horseFormOpen}
        onClose={ps.handleCloseHorseForm}
        editHorse={ps.editHorse}
      />

      <PartyForm
        open={ps.partyFormOpen}
        onOpenChange={(o) => {
          if (!o) ps.handleClosePartyForm();
          else ps.setPartyFormOpen(true);
        }}
        party={ps.editParty}
      />

      <MediaFormPanel
        mediaFormOpen={ps.mediaFormOpen}
        editMedia={ps.editMedia}
        onClose={ps.handleCloseMediaForm}
        onSaved={() => { ps.handleCloseMediaForm(); ps.fetchMediaItems(); }}
      />

      <RacingFormPanel
        racingFormOpen={ps.racingFormOpen}
        editRacing={ps.editRacing}
        onClose={ps.handleCloseRacingForm}
        onSaved={() => { ps.handleCloseRacingForm(); ps.fetchRacingEntries(); }}
      />

      {ps.salesFormOpen && (
        <SalesDataForm
          initial={ps.editSale}
          onSave={() => { ps.setSalesFormOpen(false); ps.setEditSale(undefined); ps.fetchSales(); }}
          onCancel={() => { ps.setSalesFormOpen(false); ps.setEditSale(undefined); }}
        />
      )}
      {ps.reportFormOpen && (
        <ReportsDataForm
          initial={ps.editReport}
          onSave={() => { ps.setReportFormOpen(false); ps.setEditReport(undefined); ps.fetchReports(); }}
          onCancel={() => { ps.setReportFormOpen(false); ps.setEditReport(undefined); }}
        />
      )}

      {/* A <TemplateGallery> modal sat here — the v1 builder's "New Magazine"
          starter picker, offering two fixed page-set templates. The Magazine
          Builder has its own home screen with four real starting points (blank, a
          brief, an uploaded PDF, or another edition's layout), so there is nothing
          left to overlay. */}
    </div>
  );
}
