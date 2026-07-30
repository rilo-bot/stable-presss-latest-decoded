/**
 * Every piece of state, derived value and handler the production system's
 * screens share. This is the body of the old 755-line `Newsroom.tsx` with the
 * JSX removed — the layout route calls it once and hands the result to its
 * children through the router's Outlet context, so the screens themselves are
 * now small, independently-routed pages.
 *
 * Kept as one hook rather than split per-screen on purpose: the modal dialogs
 * (article form, delete confirm, horse/party/media/racing forms) are rendered
 * once by the layout and opened from several different screens, so their state
 * has to outlive any single route.
 */
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { articleToast } from '@/components/Toast';
import { can, canEditArticle } from '@/lib/permissions';
import { roleColor, roleSummary } from '@/lib/roleDisplay';
import { WORKFLOW_STAGES, findMove } from '@/lib/workflow';
import type { Move } from '@/lib/workflow';
import { useArticleStore } from '@/stores/articleStore';
import { useAuthStore } from '@/stores/authStore';
import { useIssueStore } from '@/stores/issueStore';
import { useMagazineStore } from '@/stores/magazineStore';
import { useStaffStore } from '@/stores/staffStore';
import { useStoryStudioUi } from '@/stores/storyStudioUiStore';
import { ARTICLE_STATUSES } from '@/types/article';
import type { Article, ArticleStatus } from '@/types/article';

import { PS_BASE, SIDE_NAV, pathForModule } from '../newsroom/constants';
import type { EditorTab } from '../newsroom/constants';
import { useProductionSystems } from '../newsroom/useProductionSystems';

export function useProductionSystemState() {
  const navigate = useNavigate();

  const articles = useArticleStore((s) => s.articles);
  const setStatus = useArticleStore((s) => s.setStatus);
  const updateArticle = useArticleStore((s) => s.updateArticle);
  const removeArticle = useArticleStore((s) => s.removeArticle);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Horse, party, media, racing & sales/report registers (state, filters, handlers).
  const ps = useProductionSystems();

  const [formOpen, setFormOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<ArticleStatus>('draft');
  const [activeColumn, setActiveColumn] = useState<ArticleStatus>('draft');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('review-queue');
  const [assignDialogArticle, setAssignDialogArticle] = useState<Article | null>(null);
  const [assignNote, setAssignNote] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Magazines / published editions.
  const magazines = useMagazineStore((s) => s.summaries);
  const createMagazine = useMagazineStore((s) => s.createMagazine);
  const deleteMagazine = useMagazineStore((s) => s.deleteMagazine);
  const loadMagazine = useMagazineStore((s) => s.loadMagazine);
  const fetchMagazines = useMagazineStore((s) => s.fetchMagazines);
  const buildIssuePayload = useMagazineStore((s) => s.buildIssuePayload);

  // Load the newsroom's stories on mount. The store guards against duplicate
  // fetches, so this is a no-op if a public page already populated it — but it's
  // essential when the production system (or a story page) is the first route
  // loaded, e.g. after a hard refresh, when the in-memory store starts empty.
  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);
  useEffect(() => {
    fetchMagazines();
  }, [fetchMagazines]);

  const magIssues = useIssueStore((s) => s.issues);
  const fetchIssues = useIssueStore((s) => s.fetchIssues);
  const republishIssue = useIssueStore((s) => s.republish);
  const unpublishIssue = useIssueStore((s) => s.unpublish);
  const removeIssue = useIssueStore((s) => s.deleteIssue);
  useEffect(() => {
    fetchIssues({ includeUnpublished: true });
  }, [fetchIssues]);

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

  // Team management. Role grant/revoke goes through the roles API (slugs); this
  // store keeps the roster and the invite-by-email flow.
  const teamStaff = useStaffStore((s) => s.staff);
  const teamPending = useStaffStore((s) => s.pending);
  const teamLoading = useStaffStore((s) => s.loading);
  const fetchTeam = useStaffStore((s) => s.fetchStaff);
  const inviteStaff = useStaffStore((s) => s.invite);
  const cancelInvite = useStaffStore((s) => s.cancelInvite);
  const [teamEmail, setTeamEmail] = useState('');
  // A role SLUG. Empty until the roles load — TeamManagementView picks a default.
  const [teamRole, setTeamRole] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);

  // Role presentation comes from the server — the user may hold several, so
  // there is no single "current role". The first is used for chrome that only
  // has room for one; `roleSummary` names them all.
  const assignedRoles = currentUser?.access?.roles ?? [];
  const primaryRole = assignedRoles[0];
  const roleLabel = assignedRoles.length ? roleSummary(assignedRoles) : 'No role assigned';
  const accentColor = roleColor(primaryRole);

  // Behavioural branches are permissions, not role-name equality.
  // `isContributor` means "can only touch their own drafts".
  const isContributor = !can('content.draft.edit_any');
  const isEditor = can('content.editorial_review');
  const canManageTeam = can('team.manage');
  // Distinct from team.manage: /api/roles enforces roles.manage, so the console
  // must ask for the same thing the server does.
  const canManageRoles = can('roles.manage');

  const onGrantStaff = async () => {
    if (!teamEmail.trim() || !teamRole) return;
    setTeamBusy(true);
    const email = teamEmail.trim();
    const r = await inviteStaff(email, teamRole);
    setTeamBusy(false);

    if (!r.ok) {
      // A saved-but-unsent invite is not a plain failure — the row exists and
      // can be resent, so say that rather than inviting a duplicate attempt.
      if (r.applied) toast.warning(r.error ?? 'Invite saved, but the email failed.');
      else toast.error(r.error ?? 'Could not send the invite.');
      return;
    }

    setTeamEmail('');
    if (!r.emailed) {
      toast.warning(
        r.applied === 'immediate'
          ? 'Role granted, but no email was sent (email is not configured).'
          : 'Invite saved, but no email was sent (email is not configured).',
      );
    } else {
      toast.success(
        r.applied === 'immediate'
          ? `${email} already had an account — the role is active now.`
          : `Invitation emailed to ${email}.`,
      );
    }
  };

  const onCancelInvite = async (inviteId: string) => {
    const r = await cancelInvite(inviteId);
    if (r.ok) toast.success('Invite cancelled.');
    else toast.error(r.error ?? 'Could not cancel the invite.');
  };

  const buckets = useMemo(() => {
    const map = Object.fromEntries(
      ARTICLE_STATUSES.map((s) => [s, [] as Article[]]),
    ) as Record<ArticleStatus, Article[]>;
    const visibleArticles = isContributor
      ? (articles ?? []).filter((a) => a.author === currentUser?.displayName)
      : (articles ?? []);
    for (const article of visibleArticles) {
      // An unrecognised status falls into Draft so the story is at least
      // reachable. The migration should mean this never fires — see
      // apps/server/scripts/migrate-article-status.ts.
      if (map[article.status]) map[article.status].push(article);
      else map.draft.push(article);
    }
    return map;
  }, [articles, isContributor, currentUser?.displayName]);

  // Kanban visibility is the third role axis, ticked per role by a superadmin.
  const stageIds = currentUser?.access?.workflowStages ?? [];
  const visibleStages = WORKFLOW_STAGES.filter((col) => stageIds.includes(col.status));

  // Navigation is driven by the server-resolved MODULE list. Fails closed: no
  // access payload means no sidebar, rather than the full one.
  const accessModules = currentUser?.access?.modules;
  const visibleNav = useMemo(
    () => SIDE_NAV.filter((item) => (accessModules ?? []).includes(item.id)),
    [accessModules],
  );

  /**
   * Move a story through the workflow.
   *
   * The server is the authority: it re-checks that the move is legal from where
   * the story actually is and that the caller holds the move's permission, and
   * the store surfaces its refusal. This function is the optimistic half.
   */
  const handleMove = (article: Article, move: Move, note?: string) => {
    const sendingBack = move.back && move.to === 'draft';
    if (sendingBack) {
      void updateArticle(article.id, {
        status: move.to,
        changesRequested: true,
        changesRequestedNote: note ?? '',
      });
      articleToast.advanced('Draft — changes requested');
      return;
    }

    void setStatus(article.id, move.to);
    if (move.to === 'published') articleToast.published();
    else articleToast.advanced(WORKFLOW_STAGES.find((s) => s.status === move.to)?.label ?? move.to);
  };

  /**
   * Move by id and destination, for callers that only hold those (the Editor
   * Hub's queues). Resolves the move so the same legality and permission rules
   * apply as from the board; an illegal destination is refused here rather than
   * being sent for the server to reject.
   */
  const handleAdvanceTo = (articleId: string, toStatus: ArticleStatus) => {
    const article = (articles ?? []).find((a) => a.id === articleId);
    if (!article) return;
    const move = findMove(article.status, toStatus);
    if (!move) {
      toast.error(`A story cannot go from ${article.status} to ${toStatus}.`);
      return;
    }
    if (!can(move.permission)) {
      toast.error(`You cannot ${move.label.toLowerCase()} this story.`);
      return;
    }
    handleMove(article, move);
  };

  const handleEdit = (article: Article) => {
    if (!canEditArticle(article.author, currentUser?.displayName)) return;
    setEditArticle(article);
    setFormOpen(true);
  };

  const handleDelete = (article: Article) => {
    if (!canEditArticle(article.author, currentUser?.displayName)) return;
    setDeleteTarget(article);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await removeArticle(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    toast.success('Story deleted.');
  };

  const handleNewInColumn = (status: ArticleStatus) => {
    if (!can('content.draft.create')) return;
    setEditArticle(null);
    setDefaultStatus(status);
    setFormOpen(true);
  };

  // Open the Story Studio AI drawer (same gate as filing a story manually).
  const handleOpenStudio = () => {
    if (!can('content.draft.create')) return;
    useStoryStudioUi.getState().setOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditArticle(null);
  };

  /**
   * Sideways navigation between screens. Replaces the `setActiveNav` prop the
   * views used to be handed — they now change the URL, so the move is
   * back-buttonable and shareable like any other page change.
   */
  const goToModule = (id: string) => navigate(pathForModule(id));

  const totalStories = (articles ?? []).length;
  const myStories = isContributor
    ? (articles ?? []).filter((a) => a.author === currentUser?.displayName).length
    : totalStories;
  // One review queue now — the editorial/legal/compliance/publisher gates that
  // used to be counted alongside Submitted are gone.
  const pendingReview = buckets.submitted.length;
  // "Published" is one status; newsletter and bulletin are channels of it.
  const publishedCount = buckets.published.length;
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
        (a.category ?? '').toLowerCase().includes(q),
    );
  }, [articles, searchQuery, isContributor, currentUser?.displayName]);

  // "New Magazine" opens the template gallery; picking one assembles its pages
  // and drops into the same builder route.
  const handleNewMagazine = () => setGalleryOpen(true);

  return {
    // identity / capability
    currentUser, roleLabel, accentColor, isContributor, isEditor,
    canManageTeam, canManageRoles, visibleNav, accessModules,
    // articles
    articles, buckets, filteredArticles, visibleStages,
    totalStories, myStories, pendingReview, publishedCount, scheduledCount,
    updateArticle,
    // article dialogs + handlers
    formOpen, editArticle, defaultStatus, deleteTarget, deleting,
    setDeleteTarget, handleFormClose, confirmDelete,
    handleMove, handleAdvanceTo, handleEdit, handleDelete, handleNewInColumn, handleOpenStudio,
    // per-screen ui state that must survive a route change
    activeColumn, setActiveColumn, searchQuery, setSearchQuery,
    sidebarCollapsed, setSidebarCollapsed,
    editorTab, setEditorTab,
    assignDialogArticle, setAssignDialogArticle, assignNote, setAssignNote,
    // magazines
    magazines, magIssues, galleryOpen, setGalleryOpen,
    createMagazine, deleteMagazine, handleNewMagazine,
    handleUpdateEdition, handleUnpublishEdition, handleDeleteEdition,
    // team
    teamStaff, teamPending, teamLoading, fetchTeam,
    teamEmail, setTeamEmail, teamRole, setTeamRole, teamBusy,
    onGrantStaff, onCancelInvite,
    // navigation
    goToModule, psBase: PS_BASE,
    // registers
    ps,
  };
}

export type ProductionSystemState = ReturnType<typeof useProductionSystemState>;
