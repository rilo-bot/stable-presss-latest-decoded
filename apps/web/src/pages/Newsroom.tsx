import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom';
import { useArticleStore } from '@/stores/articleStore';
import { useAuthStore } from '@/stores/authStore';
import {
  WORKFLOW_STAGES,
} from '@/components/KanbanColumn';
import type { KanbanStatus } from '@/components/KanbanColumn';
import { ArticleForm } from '@/components/ArticleForm';
import { HorseForm } from '@/components/HorseForm';
import { PartyForm } from '@/components/PartyForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';
import { useMagazineStore } from '@/stores/magazineStore';
import { useIssueStore } from '@/stores/issueStore';
import type { Article, ArticleStatus } from '@/types/article';
import { useStaffStore } from '@/stores/staffStore';
import type { StaffRole } from '@/rbac/roles';
import { can, canEditArticle } from '@/lib/permissions';
import { AlertCircle} from 'lucide-react';
import { articleToast } from '@/components/Toast';
import { toast } from 'sonner';
import {
  getRoleConfig, SIDE_NAV,
} from './newsroom/constants';
import type { EditorTab } from './newsroom/constants';
import { OverviewView } from './newsroom/views/OverviewView';
import { WorkflowBoardView } from './newsroom/views/WorkflowBoardView';
import { PipelineMapView } from './newsroom/views/PipelineMapView';
import { AllStoriesView } from './newsroom/views/AllStoriesView';
import { TeamManagementView } from './newsroom/views/TeamManagementView';
import { MyAssetsView } from './newsroom/views/MyAssetsView';
import { CompensationView } from './newsroom/views/CompensationView';
import { AnalyticsView } from './newsroom/views/AnalyticsView';
import { SettingsView } from './newsroom/views/SettingsView';
import { EditorHubView } from './newsroom/editor-hub/EditorHubView';
import { HorseProductionSystem } from './newsroom/production-systems/HorseProductionSystem';
import { PartiesProductionSystem } from './newsroom/production-systems/PartiesProductionSystem';
import { MediaProductionSystem } from './newsroom/production-systems/MediaProductionSystem';
import { RacingProductionSystem } from './newsroom/production-systems/RacingProductionSystem';
import { MagazineStudio } from './newsroom/production-systems/MagazineStudio';
import { TemplateGallery } from '@/editor/TemplateGallery';
import type { MagazineTemplate } from '@/editor/templates/galleryTemplates';
import { MediaFormPanel } from './newsroom/production-systems/MediaFormPanel';
import { RacingFormPanel } from './newsroom/production-systems/RacingFormPanel';
import { useProductionSystems } from './newsroom/useProductionSystems';
import { NewsroomSidebar } from './newsroom/components/NewsroomSidebar';
import { NewsroomTopBar } from './newsroom/components/NewsroomTopBar';
import { NewsroomPageHeader } from './newsroom/components/NewsroomPageHeader';

/* ── Component ────────────────────────────────────────── */

export default function Newsroom() {
  const articles = useArticleStore((s) => s.articles);
  const setStatus = useArticleStore((s) => s.setStatus);
  const updateArticle = useArticleStore((s) => s.updateArticle);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Horse, party, media, racing & sales/report registers (state, filters, handlers).
  const {
    horses, parties, removeParty, horseConn,
    mediaItems, fetchMediaItems, removeMediaItem,
    racingEntries, fetchRacingEntries, removeRacingEntry,
    salesRecords, fetchSales, removeSale,
    reportRecords, fetchReports, removeReport,
    horseFormOpen, setHorseFormOpen, editHorse, setEditHorse,
    horseSearch, setHorseSearch, expandedHorseId, setExpandedHorseId,
    partyFormOpen, setPartyFormOpen, editParty, setEditParty,
    partySearch, setPartySearch, partyDeleteTarget, setPartyDeleteTarget,
    partyDeleteConfirm, setPartyDeleteConfirm,
    mediaFormOpen, setMediaFormOpen, editMedia, setEditMedia,
    mediaSearch, setMediaSearch, mediaHorseFilter, setMediaHorseFilter,
    mediaTypeFilter, setMediaTypeFilter, mediaDeleteTarget, setMediaDeleteTarget,
    mediaDeleteConfirm, setMediaDeleteConfirm,
    racingFormOpen, setRacingFormOpen, editRacing, setEditRacing,
    salesFormOpen, setSalesFormOpen, editSale, setEditSale,
    reportFormOpen, setReportFormOpen, editReport, setEditReport,
    racingSearch, setRacingSearch, racingHorseFilter, setRacingHorseFilter,
    racingDeleteTarget, setRacingDeleteTarget, racingDeleteConfirm, setRacingDeleteConfirm,
    safeParties, filteredHorses, filteredParties, filteredMediaItems, filteredRacingEntries,
    handleOpenHorseForm, handleCloseHorseForm,
    handleOpenPartyForm, handleClosePartyForm, handlePartyDelete, confirmPartyDelete,
    handleOpenMediaForm, handleCloseMediaForm, handleMediaDelete, confirmMediaDelete,
    handleOpenRacingForm, handleCloseRacingForm, handleRacingDelete, confirmRacingDelete,
  } = useProductionSystems();

  const [formOpen, setFormOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<KanbanStatus>('draft');
  const [activeColumn, setActiveColumn] = useState<KanbanStatus>('draft');
  const [activeNav, setActiveNav] = useState<string>('workflow');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('review-queue');
  const [assignDialogArticle, setAssignDialogArticle] = useState<Article | null>(null);
  const [assignNote, setAssignNote] = useState('');

  // Magazine Studio opens on its own route (/newsroom/magazine/:id); drafts are
  // server-persisted + collaborative.
  const navigate = useNavigate();
  const magazines = useMagazineStore((s) => s.summaries);
  const createMagazine = useMagazineStore((s) => s.createMagazine);
  const deleteMagazine = useMagazineStore((s) => s.deleteMagazine);
  const loadMagazine = useMagazineStore((s) => s.loadMagazine);
  const fetchMagazines = useMagazineStore((s) => s.fetchMagazines);
  const buildIssuePayload = useMagazineStore((s) => s.buildIssuePayload);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Load the newsroom's stories on mount. The store guards against duplicate
  // fetches, so this is a no-op if a public page already populated it — but it's
  // essential when the newsroom (or a story page) is the first route loaded, e.g.
  // after a hard refresh, when the in-memory store starts empty.
  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);
  useEffect(() => {
    fetchMagazines();
  }, [fetchMagazines]);
  // Published issues are server-persisted (see issueStore). The studio loads them
  // with includeUnpublished so staff can manage hidden editions too.
  const magIssues = useIssueStore((s) => s.issues);
  const fetchIssues = useIssueStore((s) => s.fetchIssues);
  const republishIssue = useIssueStore((s) => s.republish);
  const unpublishIssue = useIssueStore((s) => s.unpublish);
  const removeIssue = useIssueStore((s) => s.deleteIssue);
  useEffect(() => {
    fetchIssues({ includeUnpublished: true });
  }, [fetchIssues]);

  // Magazine edition (issue) management — wired to the server issueStore.
  const handleUpdateEdition = async (magId: string, issue: { id: string; scope: 'full' | 'selected' }) => {
    // Pull the latest draft into cache so the snapshot reflects current content.
    await loadMagazine(magId);
    const payload = buildIssuePayload(magId, issue.scope) ?? undefined;
    if (await republishIssue(issue.id, payload)) {
      toast.success(payload ? 'Edition updated from the current draft.' : 'Edition republished.');
    }
  };
  const handleUnpublishEdition = async (id: string) => {
    if (await unpublishIssue(id)) toast.success('Edition hidden from the public Bulletins page.');
  };
  const handleDeleteEdition = async (id: string) => {
    if (!window.confirm('Delete this published edition permanently? This cannot be undone.')) return;
    if (await removeIssue(id)) toast.success('Edition deleted.');
  };

  // Team management (admin) — reuses the same staff store as the /staff page.
  const teamStaff = useStaffStore((s) => s.staff);
  const teamPending = useStaffStore((s) => s.pending);
  const teamLoading = useStaffStore((s) => s.loading);
  const fetchTeam = useStaffStore((s) => s.fetchStaff);
  const grantStaff = useStaffStore((s) => s.grant);
  const revokeStaff = useStaffStore((s) => s.revoke);
  const [teamEmail, setTeamEmail] = useState('');
  const [teamRole, setTeamRole] = useState<StaffRole>('contributor');
  const [teamBusy, setTeamBusy] = useState(false);

  const userRole = currentUser?.role ?? null;
  const currentRoleConfig = getRoleConfig(userRole);

  const isContributor = userRole === 'contributor';
  const isEditor = userRole === 'editor' || userRole === 'administrator';
  const canManageTeam = can(userRole, 'team.manage');

  // Load the team roster when the Team Members tab is opened (admins only).
  useEffect(() => {
    if (activeNav === 'team' && canManageTeam) void fetchTeam();
  }, [activeNav, canManageTeam, fetchTeam]);

  const onGrantStaff = async () => {
    if (!teamEmail.trim()) return;
    setTeamBusy(true);
    const r = await grantStaff(teamEmail.trim(), teamRole);
    setTeamBusy(false);
    if (r.ok) { toast.success('Role granted.'); setTeamEmail(''); }
    else toast.error(r.error ?? 'Could not grant the role.');
  };

  const onRevokeStaff = async (userId: string, role: StaffRole) => {
    const r = await revokeStaff(userId, role);
    if (r.ok) toast.success('Role revoked.');
    else toast.error(r.error ?? 'Could not revoke the role.');
  };

  const buckets = useMemo(() => {
    const map: Record<KanbanStatus, Article[]> = {
      draft: [], submitted: [], editorial_review: [], revision: [],
      legal_review: [], compliance: [], approved: [], publisher_review: [],
      scheduled: [], published: [], newsletter: [], bulletin: [],
    };
    const visibleArticles = isContributor
      ? (articles ?? []).filter((a) => a.author === currentUser?.displayName)
      : (articles ?? []);
    for (const article of visibleArticles) {
      const s = article.status as KanbanStatus;
      if (s in map) map[s].push(article);
      else map['draft'].push(article);
    }
    return map;
  }, [articles, isContributor, currentUser?.displayName]);

  const visibleStages = WORKFLOW_STAGES.filter((col) =>
    currentRoleConfig.allowedStatuses.includes(col.status)
  );

  const visibleNav = useMemo(() =>
    SIDE_NAV.filter((item) => {
      if (!item.requiresPermission) return true;
      return can(userRole, item.requiresPermission);
    }),
    [userRole]
  );

  const handleAdvance = (articleId: string, toStatus: KanbanStatus) => {
    const article = (articles ?? []).find((a) => a.id === articleId);
    if (!article) return;
    setStatus(articleId, toStatus as ArticleStatus);
    const nextStage = WORKFLOW_STAGES.find((s) => s.status === toStatus);
    if (toStatus === 'published') {
      articleToast.published();
    } else if (toStatus === 'revision') {
      articleToast.advanced('Revision Required');
    } else {
      articleToast.advanced(nextStage?.label ?? toStatus);
    }
  };

  const handleEdit = (article: Article) => {
    if (!canEditArticle(userRole, article.author, currentUser?.displayName)) return;
    setEditArticle(article);
    setFormOpen(true);
  };

  const handleNewInColumn = (status: KanbanStatus) => {
    if (!can(userRole, 'content.draft.create')) return;
    setEditArticle(null);
    setDefaultStatus(status);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditArticle(null);
  };

  const totalStories = (articles ?? []).length;
  const myStories = isContributor
    ? (articles ?? []).filter((a) => a.author === currentUser?.displayName).length
    : totalStories;
  const pendingReview = buckets.editorial_review.length + buckets.submitted.length;
  const publishedCount = buckets.published.length + buckets.newsletter.length + buckets.bulletin.length;
  const scheduledCount = buckets.scheduled.length;

  const filteredArticles = useMemo(() => {
    const base = isContributor
      ? (articles ?? []).filter((a) => a.author === currentUser?.displayName)
      : (articles ?? []);
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        (a.category ?? '').toLowerCase().includes(q)
    );
  }, [articles, searchQuery, isContributor, currentUser?.displayName]);

  /* ── Magazine Studio panel ────────────────────────────── */

  // "New Magazine" opens the template gallery; picking one assembles its pages
  // and drops into the same builder route.
  const handleNewMagazine = () => setGalleryOpen(true);

  const handlePickTemplate = async (template: MagazineTemplate) => {
    const id = await createMagazine({
      title: template.title,
      edition: template.edition,
      pageTypes: template.pageTypes,
    });
    if (id) {
      setGalleryOpen(false);
      navigate(`/newsroom/magazine/${id}`);
    }
  };

  /* ── Main render ── */
  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-background">
      {/* ── Sidebar ── */}
      <NewsroomSidebar
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        currentRoleConfig={currentRoleConfig}
        visibleNav={visibleNav}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        pendingReview={pendingReview}
        horses={horses ?? []}
        safeParties={safeParties}
        mediaItems={mediaItems ?? []}
        racingEntries={racingEntries ?? []}
        currentUser={currentUser}
      />

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <NewsroomTopBar
          visibleNav={visibleNav}
          activeNav={activeNav}
          pendingReview={pendingReview}
          currentRoleConfig={currentRoleConfig}
          userRole={userRole}
          setActiveNav={setActiveNav}
          onOpenHorseForm={handleOpenHorseForm}
          onOpenPartyForm={handleOpenPartyForm}
          onOpenMediaForm={handleOpenMediaForm}
          onOpenRacingForm={handleOpenRacingForm}
          onNewInColumn={handleNewInColumn}
        />

        {/* Page body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
          {/* Page title — not shown for bulletin-templates (has its own header) */}
          {activeNav !== 'bulletin-templates' && (
            <NewsroomPageHeader
              activeNav={activeNav}
              visibleNav={visibleNav}
              publishedCount={publishedCount}
              pendingReview={pendingReview}
              horses={horses ?? []}
              safeParties={safeParties}
              mediaItems={mediaItems ?? []}
              racingEntries={racingEntries ?? []}
            />
          )}

          {activeNav === 'workflow' &&
            userRole !== 'editor' &&
            userRole !== 'administrator' && (
              <div
                className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-sm border text-sm"
                style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
              >
                <AlertCircle size={14} style={{ color: currentRoleConfig.color }} className="flex-shrink-0 mt-0.5" />
                <span className="text-foreground/70">
                  Viewing as <strong className="text-foreground">{currentRoleConfig.label}</strong> —
                  {isContributor
                    ? ' you can create drafts and submit stories. Only your own stories are shown.'
                    : ` access is scoped to: ${currentRoleConfig.allowedStatuses
                        .map((s) => WORKFLOW_STAGES.find((w) => w.status === s)?.label ?? s)
                        .join(', ')}.`}
                </span>
              </div>
            )}

          {activeNav === 'overview' && (
            <OverviewView
              isContributor={isContributor}
              myStories={myStories}
              totalStories={totalStories}
              currentRoleConfig={currentRoleConfig}
              userRole={userRole}
              pendingReview={pendingReview}
              setActiveNav={setActiveNav}
              setActiveColumn={setActiveColumn}
              mediaItems={mediaItems ?? []}
              racingEntries={racingEntries ?? []}
              scheduledCount={scheduledCount}
              publishedCount={publishedCount}
              buckets={buckets}
              onNewInColumn={handleNewInColumn}
              filteredArticles={filteredArticles}
              currentUserDisplayName={currentUser?.displayName}
              onEdit={handleEdit}
            />
          )}
          {activeNav === 'workflow' && (
            <WorkflowBoardView
              isContributor={isContributor}
              myStories={myStories}
              totalStories={totalStories}
              onNewInColumn={handleNewInColumn}
              visibleStages={visibleStages}
              activeColumn={activeColumn}
              setActiveColumn={setActiveColumn}
              buckets={buckets}
              userRole={userRole}
              onAdvance={handleAdvance}
              onEdit={handleEdit}
              currentUserDisplayName={currentUser?.displayName ?? null}
            />
          )}
          {activeNav === 'pipeline' && <PipelineMapView buckets={buckets} />}
          {(activeNav === 'all-stories' || activeNav === 'drafts' || activeNav === 'review') && (
            <AllStoriesView
              isContributor={isContributor}
              currentRoleConfig={currentRoleConfig}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredArticles={filteredArticles}
              onNewInColumn={handleNewInColumn}
              userRole={userRole}
              currentUserDisplayName={currentUser?.displayName}
              onEdit={handleEdit}
            />
          )}
          {activeNav === 'editor-hub' && (
            <EditorHubView
              userRole={userRole}
              editorTab={editorTab}
              setEditorTab={setEditorTab}
              articles={articles ?? []}
              buckets={buckets}
              onAdvance={handleAdvance}
              onEdit={handleEdit}
              onNewInColumn={handleNewInColumn}
              assignDialogArticle={assignDialogArticle}
              setAssignDialogArticle={setAssignDialogArticle}
              assignNote={assignNote}
              setAssignNote={setAssignNote}
              updateArticle={updateArticle}
              mediaItems={mediaItems ?? []}
              horses={horses ?? []}
              onOpenMediaForm={handleOpenMediaForm}
              onMediaDelete={handleMediaDelete}
              salesRecords={salesRecords ?? []}
              reportRecords={reportRecords ?? []}
              setEditSale={setEditSale}
              setSalesFormOpen={setSalesFormOpen}
              removeSale={removeSale}
              setEditReport={setEditReport}
              setReportFormOpen={setReportFormOpen}
              removeReport={removeReport}
            />
          )}
          {activeNav === 'my-assets' && <MyAssetsView />}
          {activeNav === 'compensation' && (
            <CompensationView
              articles={articles ?? []}
              currentUserDisplayName={currentUser?.displayName}
              setActiveNav={setActiveNav}
              onNewInColumn={handleNewInColumn}
            />
          )}
          {activeNav === 'horses' && (
            <HorseProductionSystem
              horses={horses ?? []}
              filteredHorses={filteredHorses}
              horseSearch={horseSearch}
              setHorseSearch={setHorseSearch}
              expandedHorseId={expandedHorseId}
              setExpandedHorseId={setExpandedHorseId}
              horseConn={horseConn}
              onOpenHorseForm={handleOpenHorseForm}
            />
          )}
          {activeNav === 'parties' && (
            <PartiesProductionSystem
              safeParties={safeParties}
              filteredParties={filteredParties}
              partySearch={partySearch}
              setPartySearch={setPartySearch}
              onOpenPartyForm={handleOpenPartyForm}
              onPartyDelete={handlePartyDelete}
              partyDeleteConfirm={partyDeleteConfirm}
              partyDeleteTarget={partyDeleteTarget}
              setPartyDeleteConfirm={setPartyDeleteConfirm}
              setPartyDeleteTarget={setPartyDeleteTarget}
              confirmPartyDelete={confirmPartyDelete}
            />
          )}
          {activeNav === 'media-production-system' && (
            <MediaProductionSystem
              mediaItems={mediaItems ?? []}
              horses={horses ?? []}
              filteredMediaItems={filteredMediaItems}
              mediaSearch={mediaSearch}
              setMediaSearch={setMediaSearch}
              mediaHorseFilter={mediaHorseFilter}
              setMediaHorseFilter={setMediaHorseFilter}
              mediaTypeFilter={mediaTypeFilter}
              setMediaTypeFilter={setMediaTypeFilter}
              onOpenMediaForm={handleOpenMediaForm}
              onMediaDelete={handleMediaDelete}
              mediaDeleteConfirm={mediaDeleteConfirm}
              mediaDeleteTarget={mediaDeleteTarget}
              setMediaDeleteConfirm={setMediaDeleteConfirm}
              setMediaDeleteTarget={setMediaDeleteTarget}
              confirmMediaDelete={confirmMediaDelete}
            />
          )}
          {activeNav === 'racing-production-system' && (
            <RacingProductionSystem
              racingEntries={racingEntries ?? []}
              horses={horses ?? []}
              filteredRacingEntries={filteredRacingEntries}
              racingSearch={racingSearch}
              setRacingSearch={setRacingSearch}
              racingHorseFilter={racingHorseFilter}
              setRacingHorseFilter={setRacingHorseFilter}
              onOpenRacingForm={handleOpenRacingForm}
              onRacingDelete={handleRacingDelete}
              racingDeleteConfirm={racingDeleteConfirm}
              racingDeleteTarget={racingDeleteTarget}
              setRacingDeleteConfirm={setRacingDeleteConfirm}
              setRacingDeleteTarget={setRacingDeleteTarget}
              confirmRacingDelete={confirmRacingDelete}
            />
          )}
          {activeNav === 'team' && (
            <TeamManagementView
              canManageTeam={canManageTeam}
              teamStaff={teamStaff}
              teamPending={teamPending}
              teamLoading={teamLoading}
              teamEmail={teamEmail}
              setTeamEmail={setTeamEmail}
              teamRole={teamRole}
              setTeamRole={setTeamRole}
              teamBusy={teamBusy}
              onGrantStaff={onGrantStaff}
              onRevokeStaff={onRevokeStaff}
            />
          )}
          {activeNav === 'bulletin-templates' && (
            <MagazineStudio
              magazines={magazines}
              magIssues={magIssues}
              onNewMagazine={handleNewMagazine}
              onOpenMagazine={(id) => navigate(`/newsroom/magazine/${id}`)}
              onDeleteMagazine={deleteMagazine}
              onUpdateEdition={handleUpdateEdition}
              onUnpublishEdition={handleUnpublishEdition}
              onDeleteEdition={handleDeleteEdition}
            />
          )}

          {activeNav === 'analytics' && (
            <AnalyticsView
              publishedCount={publishedCount}
              scheduledCount={scheduledCount}
              totalStories={totalStories}
              pendingReview={pendingReview}
            />
          )}

          {activeNav === 'settings' && <SettingsView />}
        </div>
      </div>

      {/* Article form dialog */}
      <ArticleForm
        open={formOpen}
        onClose={handleFormClose}
        editArticle={editArticle}
        defaultStatus={defaultStatus}
        userRole={userRole}
      />

      {/* Horse form dialog */}
      <HorseForm
        open={horseFormOpen}
        onClose={handleCloseHorseForm}
        editHorse={editHorse}
      />

      {/* Party form dialog */}
      <PartyForm
        open={partyFormOpen}
        onOpenChange={(o) => {
          if (!o) handleClosePartyForm();
          else setPartyFormOpen(true);
        }}
        party={editParty}
      />

      {/* Media form slide-over */}
      <MediaFormPanel
        mediaFormOpen={mediaFormOpen}
        editMedia={editMedia}
        onClose={handleCloseMediaForm}
        onSaved={() => { handleCloseMediaForm(); fetchMediaItems(); }}
      />

      {/* Racing form slide-over */}
      <RacingFormPanel
        racingFormOpen={racingFormOpen}
        editRacing={editRacing}
        onClose={handleCloseRacingForm}
        onSaved={() => { handleCloseRacingForm(); fetchRacingEntries(); }}
      />
      {salesFormOpen && (
        <SalesDataForm
          initial={editSale}
          onSave={() => { setSalesFormOpen(false); setEditSale(undefined); fetchSales(); }}
          onCancel={() => { setSalesFormOpen(false); setEditSale(undefined); }}
        />
      )}
      {reportFormOpen && (
        <ReportsDataForm
          initial={editReport}
          onSave={() => { setReportFormOpen(false); setEditReport(undefined); fetchReports(); }}
          onCancel={() => { setReportFormOpen(false); setEditReport(undefined); }}
        />
      )}

      {/* New-magazine template gallery */}
      {galleryOpen && (
        <TemplateGallery onPick={handlePickTemplate} onClose={() => setGalleryOpen(false)} />
      )}
    </div>
  );
}

