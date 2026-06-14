import { useState, useMemo, useEffect } from 'react'
import { useArticleStore } from '@/stores/articleStore';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { connectionResolver } from '@/lib/horseConnections';
import { useMediaStore } from '@/stores/mediaStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import {
  KanbanColumn,
  WORKFLOW_STAGES,
} from '@/components/KanbanColumn';
import type { KanbanStatus } from '@/components/KanbanColumn';
import { ArticleForm } from '@/components/ArticleForm';
import { HorseForm } from '@/components/HorseForm';
import { PartyForm } from '@/components/PartyForm';
import { HorsePartyLinkPanel } from '@/components/HorsePartyLinkPanel';
import { EmptyState } from '@/components/EmptyState';
import { MediaDataForm } from '@/components/MediaDataForm';
import { RacingDataForm } from '@/components/RacingDataForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';
import { useSaleStore } from '@/stores/saleStore';
import { useReportStore } from '@/stores/reportStore';
import type { Sale } from '@/types/sale';
import type { HorseReport } from '@/types/horseReport';
import { MagazineEditor } from '@/editor/MagazineEditor';
import { useMagazineStore } from '@/stores/magazineStore';
import type { Article, ArticleStatus } from '@/types/article';
import type { Horse } from '@/types/horse';
import type { Party, PartyRole } from '@/types/party';
import { PARTY_ROLE_LABELS } from '@/types/party';
import type { MediaItem, MediaType } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';
import type { UserRole } from '@/stores/authStore';
import { can, canEditArticle } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import {Plus, LayoutDashboard, FileText, CheckSquare, Shield, Send, Users, BarChart2, Settings, Bell, Search, ChevronDown, AlertCircle, Clock, TrendingUp, Eye, Filter, PenLine, ChevronRight, ArrowRight, Scale, BookOpen, Mic, TrendingDown, CheckCircle, AlertTriangle, Star, DollarSign, Upload, Lock, Image, Edit, UserCheck, CalendarClock, FolderOpen, Inbox, RotateCcw, ChevronLeft, Check, X, Layers, Trash, User, Building2, MapPin, Globe, CalendarDays, Link, File, Newspaper, Flag} from 'lucide-react';
import { articleToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Role colour map (for party cards) ──────── */
const ROLE_COLORS: Record<PartyRole, string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  trainer: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  jockey: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  breeder: 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  'bloodstock agent': 'bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5)/0.3)]',
  'syndicate manager': 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent)/0.3)]',
  personnel: 'bg-muted text-muted-foreground border-border',
};

const MEDIA_TYPE_ICONS: Record<MediaType, React.ReactNode> = {
  Article: <Newspaper size={11} />,
  Photo: <Image size={11} />,
  Video: <File size={11} />,
  'Press Release': <FileText size={11} />,
  Publication: <BookOpen size={11} />,
};

const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  Article: 'bg-primary/10 text-primary border-primary/25',
  Photo: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  Video: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  'Press Release': 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  Publication: 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent)/0.3)]',
};

/* ── Role definitions ─────────────────────────────────── */

interface RoleConfig {
  id: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  allowedStatuses: KanbanStatus[];
  color: string;
}

const ROLES: RoleConfig[] = [
  {
    id: 'contributor',
    label: 'Contributor',
    description: 'Draft & submit stories',
    icon: <FileText size={14} />,
    allowedStatuses: ['draft', 'submitted', 'revision'],
    color: 'hsl(var(--chart-1))',
  },
  {
    id: 'editor',
    label: 'Editor',
    description: 'Full editorial control',
    icon: <CheckSquare size={14} />,
    allowedStatuses: [
      'draft', 'submitted', 'editorial_review', 'revision',
      'legal_review', 'compliance', 'approved', 'publisher_review',
      'scheduled', 'published', 'newsletter', 'bulletin',
    ],
    color: 'hsl(var(--primary))',
  },
  {
    id: 'legal_reviewer',
    label: 'Legal Reviewer',
    description: 'Review & clear content',
    icon: <Shield size={14} />,
    allowedStatuses: ['legal_review', 'compliance', 'approved'],
    color: 'hsl(var(--chart-3))',
  },
  {
    id: 'podcast_producer',
    label: 'Podcast Producer',
    description: 'Manage podcast content',
    icon: <Mic size={14} />,
    allowedStatuses: ['approved', 'publisher_review', 'scheduled', 'published', 'newsletter'],
    color: 'hsl(var(--chart-2))',
  },
  {
    id: 'publisher',
    label: 'Publisher',
    description: 'Approve & schedule',
    icon: <Send size={14} />,
    allowedStatuses: [
      'publisher_review', 'scheduled', 'published', 'newsletter', 'bulletin',
    ],
    color: 'hsl(var(--brand-accent))',
  },
  {
    id: 'administrator',
    label: 'Administrator',
    description: 'Full platform access',
    icon: <Star size={14} />,
    allowedStatuses: [
      'draft', 'submitted', 'editorial_review', 'revision',
      'legal_review', 'compliance', 'approved', 'publisher_review',
      'scheduled', 'published', 'newsletter', 'bulletin',
    ],
    color: 'hsl(var(--primary))',
  },
];

function getRoleConfig(role: UserRole | undefined | null): RoleConfig {
  return ROLES.find((r) => r.id === role) ?? ROLES[0];
}

/* ── Sidebar navigation ───────────────────────────────── */

interface SideNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  section?: string;
  requiresPermission?: Parameters<typeof can>[1];
  editorOnly?: boolean;
  badge?: string;
}

const SIDE_NAV: SideNavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} />, section: 'Workspace' },
  { id: 'workflow', label: 'Workflow Board', icon: <LayoutDashboard size={15} />, section: 'Workspace' },
  { id: 'pipeline', label: 'Pipeline Map', icon: <ArrowRight size={15} />, section: 'Workspace' },
  { id: 'all-stories', label: 'All Stories', icon: <FileText size={15} />, section: 'Content' },
  { id: 'drafts', label: 'Drafts', icon: <FileText size={15} />, section: 'Content' },
  { id: 'review', label: 'In Review', icon: <Eye size={15} />, section: 'Content' },
  {
    id: 'bulletin-templates',
    label: 'Magazine Studio',
    icon: <BookOpen size={15} />,
    section: 'Content',
    badge: 'New',
  },
  {
    id: 'editor-hub',
    label: 'Editor Hub',
    icon: <Edit size={15} />,
    section: 'Content',
    requiresPermission: 'content.editorial_review',
    editorOnly: true,
  },
  { id: 'my-assets', label: 'My Media Assets', icon: <Image size={15} />, section: 'Content', requiresPermission: 'media.upload_own' },
  { id: 'compensation', label: 'My Compensation', icon: <DollarSign size={15} />, section: 'Content', requiresPermission: 'compensation.view_own' },
  { id: 'horses', label: 'Thoroughbred CRM', icon: <Star size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'parties', label: 'Parties CRM', icon: <Users size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'media-crm', label: 'Media Records CRM', icon: <File size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'racing-crm', label: 'Racing Data CRM', icon: <Flag size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'team', label: 'Team Members', icon: <Users size={15} />, section: 'Management', requiresPermission: 'team.view' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={15} />, section: 'Management', requiresPermission: 'analytics.view' },
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, section: 'Management', requiresPermission: 'settings.view' },
];

/* ── Editor Hub tab types ─────────────────────────────── */

type EditorTab =
  | 'review-queue'
  | 'assignments'
  | 'approval-routing'
  | 'scheduling'
  | 'media-library'
  | 'horse-records';

interface EditorTabConfig {
  id: EditorTab;
  label: string;
  icon: React.ReactNode;
  description: string;
  permission: Parameters<typeof can>[1];
}

const EDITOR_TABS: EditorTabConfig[] = [
  {
    id: 'review-queue',
    label: 'Review Queue',
    icon: <Inbox size={14} />,
    description: 'Editorial review of submitted drafts',
    permission: 'content.editorial_review',
  },
  {
    id: 'assignments',
    label: 'Assignments',
    icon: <UserCheck size={14} />,
    description: 'Content assignment & modification',
    permission: 'content.draft.edit_any',
  },
  {
    id: 'approval-routing',
    label: 'Approval Routing',
    icon: <Layers size={14} />,
    description: 'Approval workflow routing',
    permission: 'content.approve',
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: <CalendarClock size={14} />,
    description: 'Scheduled publishing capabilities',
    permission: 'content.schedule',
  },
  {
    id: 'media-library',
    label: 'Media Library',
    icon: <FolderOpen size={14} />,
    description: 'Full media asset management',
    permission: 'media.manage_all',
  },
  {
    id: 'horse-records',
    label: 'Horse Records',
    icon: <File size={14} />,
    description: 'Sales & document records for horse profiles',
    permission: 'media.manage_all',
  },
];

/* ── Component ────────────────────────────────────────── */

export default function Newsroom() {
  // === auto fetch-on-mount ===
  const fetchParties = usePartyStore((s) => s.fetchParties);
  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  const articles = useArticleStore((s) => s.articles);
  const setStatus = useArticleStore((s) => s.setStatus);
  const currentUser = useAuthStore((s) => s.currentUser);
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const removeParty = usePartyStore((s) => s.removeParty);
  const horseConn = useMemo(() => connectionResolver(parties ?? []), [parties]);

  // Media store
  const mediaItems = useMediaStore((s) => s.items);
  const fetchMediaItems = useMediaStore((s) => s.fetchItems);
  const removeMediaItem = useMediaStore((s) => s.removeItem);

  useEffect(() => { fetchMediaItems(); }, [fetchMediaItems]);

  // Racing store
  const racingEntries = useRacingEntryStore((s) => s.entries);
  const fetchRacingEntries = useRacingEntryStore((s) => s.fetchEntries);
  const removeRacingEntry = useRacingEntryStore((s) => s.removeEntry);

  const salesRecords = useSaleStore((s) => s.sales);
  const fetchSales = useSaleStore((s) => s.fetchSales);
  const removeSale = useSaleStore((s) => s.removeSale);
  const reportRecords = useReportStore((s) => s.reports);
  const fetchReports = useReportStore((s) => s.fetchReports);
  const removeReport = useReportStore((s) => s.removeReport);
  useEffect(() => { fetchSales(); fetchReports(); }, [fetchSales, fetchReports]);

  useEffect(() => { fetchRacingEntries(); }, [fetchRacingEntries]);

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

  // Magazine Studio state
  const [editorMagId, setEditorMagId] = useState<string | null>(null);
  const magazines = useMagazineStore((s) => s.magazines);
  const magIssues = useMagazineStore((s) => s.issues);
  const createMagazine = useMagazineStore((s) => s.createMagazine);
  const deleteMagazine = useMagazineStore((s) => s.deleteMagazine);

  // Horse CRM state
  const [horseFormOpen, setHorseFormOpen] = useState(false);
  const [editHorse, setEditHorse] = useState<Horse | null>(null);
  const [horseSearch, setHorseSearch] = useState('');
  const [expandedHorseId, setExpandedHorseId] = useState<string | null>(null);

  // Parties CRM state
  const [partyFormOpen, setPartyFormOpen] = useState(false);
  const [editParty, setEditParty] = useState<Party | undefined>(undefined);
  const [partySearch, setPartySearch] = useState('');
  const [partyDeleteTarget, setPartyDeleteTarget] = useState<Party | null>(null);
  const [partyDeleteConfirm, setPartyDeleteConfirm] = useState(false);

  // Media CRM state
  const [mediaFormOpen, setMediaFormOpen] = useState(false);
  const [editMedia, setEditMedia] = useState<MediaItem | undefined>(undefined);
  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaHorseFilter, setMediaHorseFilter] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | ''>('');
  const [mediaDeleteTarget, setMediaDeleteTarget] = useState<MediaItem | null>(null);
  const [mediaDeleteConfirm, setMediaDeleteConfirm] = useState(false);

  // Racing CRM state
  const [racingFormOpen, setRacingFormOpen] = useState(false);
  const [editRacing, setEditRacing] = useState<RacingEntry | undefined>(undefined);
  const [salesFormOpen, setSalesFormOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | undefined>(undefined);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [editReport, setEditReport] = useState<HorseReport | undefined>(undefined);
  const [racingSearch, setRacingSearch] = useState('');
  const [racingHorseFilter, setRacingHorseFilter] = useState('');
  const [racingDeleteTarget, setRacingDeleteTarget] = useState<RacingEntry | null>(null);
  const [racingDeleteConfirm, setRacingDeleteConfirm] = useState(false);

  const userRole = currentUser?.role ?? null;
  const currentRoleConfig = getRoleConfig(userRole);

  const isContributor = userRole === 'contributor';
  const isEditor = userRole === 'editor' || userRole === 'administrator';

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

  const filteredHorses = useMemo(() => {
    const q = horseSearch.toLowerCase().trim();
    if (!q) return horses ?? [];
    return (horses ?? []).filter((h) => {
      const c = horseConn(h);
      return (
        h.name?.toLowerCase().includes(q) ||
        c.trainer.toLowerCase().includes(q) ||
        c.jockey.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q) ||
        h.country?.toLowerCase().includes(q)
      );
    });
  }, [horses, horseSearch, horseConn]);

  const safeParties = parties ?? [];

  const filteredParties = useMemo(() => {
    const q = partySearch.toLowerCase().trim();
    if (!q) return safeParties;
    return safeParties.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.profession?.toLowerCase().includes(q) ||
        p.base_location?.toLowerCase().includes(q) ||
        (p.roles ?? []).some((r) => r.toLowerCase().includes(q))
    );
  }, [safeParties, partySearch]);

  // Filtered media items
  const filteredMediaItems = useMemo(() => {
    let result = mediaItems ?? [];
    if (mediaHorseFilter) {
      result = result.filter((m) => m.horse_id === mediaHorseFilter);
    }
    if (mediaTypeFilter) {
      result = result.filter((m) => m.media_type === mediaTypeFilter);
    }
    const q = mediaSearch.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (m) =>
          m.title?.toLowerCase().includes(q) ||
          m.subject?.toLowerCase().includes(q) ||
          m.source_publication?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [mediaItems, mediaHorseFilter, mediaTypeFilter, mediaSearch]);

  // Filtered racing entries
  const filteredRacingEntries = useMemo(() => {
    let result = racingEntries ?? [];
    if (racingHorseFilter) {
      result = result.filter((r) => r.horse_id === racingHorseFilter);
    }
    const q = racingSearch.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (r) =>
          r.race_name?.toLowerCase().includes(q) ||
          r.venue?.toLowerCase().includes(q) ||
          r.subject?.toLowerCase().includes(q) ||
          r.country?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [racingEntries, racingHorseFilter, racingSearch]);

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

  const handleOpenHorseForm = (horse?: Horse) => {
    setEditHorse(horse ?? null);
    setHorseFormOpen(true);
  };

  const handleCloseHorseForm = () => {
    setHorseFormOpen(false);
    setEditHorse(null);
  };

  const handleOpenPartyForm = (party?: Party) => {
    setEditParty(party);
    setPartyFormOpen(true);
  };

  const handleClosePartyForm = () => {
    setPartyFormOpen(false);
    setEditParty(undefined);
  };

  const handlePartyDelete = (party: Party) => {
    setPartyDeleteTarget(party);
    setPartyDeleteConfirm(true);
  };

  const confirmPartyDelete = () => {
    if (!partyDeleteTarget) return;
    removeParty(partyDeleteTarget.id);
    toast.success(`${partyDeleteTarget.name} has been removed.`);
    setPartyDeleteTarget(null);
    setPartyDeleteConfirm(false);
  };

  // Media handlers
  const handleOpenMediaForm = (item?: MediaItem) => {
    setEditMedia(item);
    setMediaFormOpen(true);
  };

  const handleCloseMediaForm = () => {
    setMediaFormOpen(false);
    setEditMedia(undefined);
  };

  const handleMediaDelete = (item: MediaItem) => {
    setMediaDeleteTarget(item);
    setMediaDeleteConfirm(true);
  };

  const confirmMediaDelete = () => {
    if (!mediaDeleteTarget) return;
    removeMediaItem(mediaDeleteTarget.id);
    setMediaDeleteTarget(null);
    setMediaDeleteConfirm(false);
  };

  // Racing handlers
  const handleOpenRacingForm = (entry?: RacingEntry) => {
    setEditRacing(entry);
    setRacingFormOpen(true);
  };

  const handleCloseRacingForm = () => {
    setRacingFormOpen(false);
    setEditRacing(undefined);
  };

  const handleRacingDelete = (entry: RacingEntry) => {
    setRacingDeleteTarget(entry);
    setRacingDeleteConfirm(true);
  };

  const confirmRacingDelete = () => {
    if (!racingDeleteTarget) return;
    removeRacingEntry(racingDeleteTarget.id);
    setRacingDeleteTarget(null);
    setRacingDeleteConfirm(false);
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

  const handleNewMagazine = () => {
    const id = createMagazine();
    setEditorMagId(id);
  };

  function renderBulletinTemplates() {
    const issueCountFor = (magId: string) =>
      magIssues.filter((i) => i.magazineId === magId && !i.unpublishedAt).length;

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
              Bulletin Magazine Builder
            </p>
            <p className="text-sm text-muted-foreground">
              {magazines.length === 0
                ? 'Design a full multi-page bulletin magazine, then publish it to the public Bulletins page.'
                : `${magazines.length} magazine${magazines.length !== 1 ? 's' : ''} in your studio`}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
            onClick={handleNewMagazine}
          >
            <Plus size={13} />
            New Magazine
          </Button>
        </div>

        {magazines.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            heading="Start your first bulletin magazine."
            description="Open the full-screen studio to edit a 20-page NZTROF-style magazine — headlines, copy, photos and QR codes are all editable in place. Publish the full edition or selected pages to the public Bulletins page."
            ctaLabel="Create a Magazine"
            onCta={handleNewMagazine}
            size="lg"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {magazines.map((mag) => {
              const issues = issueCountFor(mag.id);
              return (
                <div
                  key={mag.id}
                  className="border border-border/60 rounded-sm bg-card overflow-hidden flex flex-col"
                >
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                    <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground line-clamp-1">
                      {mag.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{mag.edition}</p>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FileText size={11} /> {mag.pages.length} pages
                    </span>
                    {issues > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CheckCircle size={11} /> {issues} published
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex items-center gap-2 px-4 py-3 border-t border-border/40">
                    <Button
                      size="sm"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs flex-1"
                      onClick={() => setEditorMagId(mag.id)}
                    >
                      <Edit size={12} /> Open
                    </Button>
                    <button
                      onClick={() => deleteMagazine(mag.id)}
                      className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors px-2"
                      aria-label={`Delete ${mag.title}`}
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Magazines you publish appear on the public <strong className="text-foreground">Bulletins</strong> page as
            readable editions. Edit text, swap photos (device or Unsplash) and set QR links live — changes save automatically.
          </p>
        </div>
      </div>
    );
  }

  /* ── Horse CRM ─────────────────────────────────────── */

  function renderHorseCRM() {
    const safeHorses = horses ?? [];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
              Stable Press CRM
            </p>
            <p className="text-sm text-muted-foreground">
              {safeHorses.length === 0
                ? 'No thoroughbreds on record yet.'
                : `${safeHorses.length} thoroughbred${safeHorses.length !== 1 ? 's' : ''} in the stables`}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
            onClick={() => handleOpenHorseForm()}
          >
            <Plus size={13} />
            Add Thoroughbred
          </Button>
        </div>

        {safeHorses.length > 0 && (
          <div className="relative max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search by name, trainer, owner…"
              value={horseSearch}
              onChange={(e) => setHorseSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search horses"
            />
          </div>
        )}

        {safeHorses.length === 0 ? (
          <EmptyState
            icon={Plus}
            heading="The stables await their first resident."
            description="No thoroughbred profiles have been entered yet. Add the first horse to begin building the stable record — profiles will appear on the public Thoroughbred hub."
            ctaLabel="Add a Thoroughbred"
            onCta={() => handleOpenHorseForm()}
            size="lg"
          />
        ) : filteredHorses.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm font-semibold text-foreground mb-1">No horses match that search</p>
            <button
              onClick={() => setHorseSearch('')}
              className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                Thoroughbred Records
              </p>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {filteredHorses.length} {filteredHorses.length === 1 ? 'profile' : 'profiles'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Horse', 'Colour / Age', 'Owner', 'Trainer', 'Jockey', 'Country', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHorses.map((horse, idx) => {
                    const isExpanded = expandedHorseId === horse.id;
                    return (
                      <>
                        <tr
                          key={horse.id}
                          className={cn(
                            'border-b border-border/30 hover:bg-muted/10 transition-colors',
                            isExpanded ? 'bg-primary/5 border-primary/20' : idx % 2 === 0 ? 'bg-card' : 'bg-background'
                          )}
                        >
                          <td className="px-4 py-3 max-w-[160px]">
                            <span className="text-xs font-semibold text-foreground block line-clamp-1">
                              {horse.name}
                            </span>
                            {horse.pullQuote && (
                              <span className="text-[10px] text-muted-foreground italic line-clamp-1 block">
                                {horse.pullQuote}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {horse.colour && (
                                <span
                                  className="text-[9px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 rounded-sm w-fit"
                                  style={{
                                    background: 'hsl(var(--brand-accent) / 0.12)',
                                    color: 'hsl(var(--brand-accent))',
                                  }}
                                >
                                  {horse.colour}
                                </span>
                              )}
                              {horse.age && (
                                <span className="text-[10px] text-muted-foreground">{horse.age}yo</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground line-clamp-1">{horseConn(horse).owner || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{horseConn(horse).trainer || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{horseConn(horse).jockey || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            {horse.country ? (
                              <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm">
                                {horse.country}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleOpenHorseForm(horse)}
                                className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                                aria-label={`Edit ${horse.name}`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setExpandedHorseId((prev) =>
                                    prev === horse.id ? null : horse.id
                                  )
                                }
                                className={cn(
                                  'flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] font-semibold transition-colors',
                                  isExpanded
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-primary'
                                )}
                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} party links for ${horse.name}`}
                                aria-expanded={isExpanded}
                              >
                                <Link size={10} />
                                Parties
                                <ChevronDown
                                  size={10}
                                  className={cn('transition-transform', isExpanded && 'rotate-180')}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${horse.id}-links`} className="border-b border-primary/20">
                            <td colSpan={7} className="bg-primary/3 px-0 py-0">
                              <div className="px-6 py-5 border-l-4 border-primary/30 bg-primary/[0.03]">
                                <div className="flex items-center gap-2 mb-4">
                                  <Link size={13} className="text-primary flex-shrink-0" />
                                  <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary">
                                    Party Connections — {horse.name}
                                  </span>
                                  <button
                                    onClick={() => setExpandedHorseId(null)}
                                    className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Collapse"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                                <HorsePartyLinkPanel
                                  horseId={horse.id}
                                  horseName={horse.name}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {safeHorses.length > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
            <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Profiles added here appear on the public <strong className="text-foreground">Thoroughbred Profiles</strong> page.
              Click <strong className="text-foreground">Parties</strong> on any row to manage party connections — owners, trainers, jockeys, and more.
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ── Parties CRM ───────────────────────────────────── */

  function renderPartiesCRM() {
    const currentYear = new Date().getFullYear();
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
              Stable Press CRM
            </p>
            <p className="text-sm text-muted-foreground">
              {safeParties.length === 0
                ? 'No parties on record yet.'
                : `${safeParties.length} ${safeParties.length === 1 ? 'party' : 'parties'} registered`}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
            onClick={() => handleOpenPartyForm()}
          >
            <Plus size={13} />
            Add Party
          </Button>
        </div>

        {safeParties.length > 0 && (
          <div className="relative max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search by name, role, location…"
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search parties"
            />
          </div>
        )}

        {safeParties.length === 0 ? (
          <EmptyState
            icon={Users}
            heading="No parties registered yet."
            description="Add owners, trainers, jockeys and other racing connections to build your industry directory. Parties can be linked to thoroughbred profiles and editorial coverage."
            ctaLabel="Add Your First Party"
            onCta={() => handleOpenPartyForm()}
            size="lg"
          />
        ) : filteredParties.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm font-semibold text-foreground mb-1">No parties match that search</p>
            <button
              onClick={() => setPartySearch('')}
              className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                Party Records
              </p>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {filteredParties.length} {filteredParties.length === 1 ? 'party' : 'parties'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Party', 'Type', 'Roles', 'Location', 'Since', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParties.map((party, idx) => {
                    const yearsActive = party.started_year ? currentYear - party.started_year : null;
                    return (
                      <tr
                        key={party.id}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/10 transition-colors',
                          idx % 2 === 0 ? 'bg-card' : 'bg-background'
                        )}
                      >
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex items-center gap-2.5">
                            {party.photo ? (
                              <img
                                src={party.photo}
                                alt={party.name}
                                crossOrigin="anonymous"
                                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-border/40"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
                                {party.party_type === 'person'
                                  ? <User size={12} className="text-primary" />
                                  : <Building2 size={12} className="text-primary" />}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-foreground block line-clamp-1">
                                {party.name}
                              </span>
                              {party.profession && (
                                <span className="text-[10px] text-muted-foreground truncate block">
                                  {party.profession}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-full border',
                              party.party_type === 'person'
                                ? 'bg-primary/10 text-primary border-primary/25'
                                : 'bg-[hsl(var(--brand-accent)/0.12)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent)/0.3)]'
                            )}
                          >
                            {party.party_type === 'person' ? 'Individual' : 'Org'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {(party.roles ?? []).slice(0, 2).map((role) => (
                              <span
                                key={role}
                                className={cn(
                                  'text-[8px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded-full border',
                                  ROLE_COLORS[role]
                                )}
                              >
                                {PARTY_ROLE_LABELS[role]}
                              </span>
                            ))}
                            {(party.roles ?? []).length > 2 && (
                              <span className="text-[8px] text-muted-foreground font-semibold">
                                +{(party.roles ?? []).length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {party.base_location ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin size={10} className="flex-shrink-0 text-primary/50" />
                              <span className="truncate max-w-[120px]">{party.base_location}</span>
                            </div>
                          ) : party.country_of_birth ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Globe size={10} className="flex-shrink-0 text-primary/50" />
                              <span className="truncate max-w-[120px]">{party.country_of_birth}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {party.started_year ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays size={10} className="flex-shrink-0 text-primary/50" />
                              <span>{party.started_year}</span>
                              {yearsActive !== null && yearsActive > 0 && (
                                <span className="text-primary font-semibold">·{yearsActive}y</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleOpenPartyForm(party)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                              aria-label={`Edit ${party.name}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handlePartyDelete(party)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                              aria-label={`Remove ${party.name}`}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {partyDeleteConfirm && partyDeleteTarget && (
          <div className="border border-destructive/30 rounded-sm bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-foreground">
              Remove{' '}
              <span className="font-semibold">{partyDeleteTarget.name}</span>
              {' '}from Stable Press? This cannot be undone.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => { setPartyDeleteConfirm(false); setPartyDeleteTarget(null); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={confirmPartyDelete}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        {safeParties.length > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
            <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Parties added here can be linked to thoroughbreds via the <strong className="text-foreground">Thoroughbred CRM</strong>.
              Each record can be associated with thoroughbred profiles and editorial coverage across the platform.
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ── Media CRM ─────────────────────────────────────── */

  function renderMediaCRM() {
    const safeMedia = mediaItems ?? [];
    const safeHorses = horses ?? [];

    const mediaTypeCounts: Partial<Record<MediaType, number>> = {};
    for (const m of safeMedia) {
      mediaTypeCounts[m.media_type] = (mediaTypeCounts[m.media_type] ?? 0) + 1;
    }

    return (
      <div className="space-y-5">
        {/* Header strip */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
              Stable Press CRM
            </p>
            <p className="text-sm text-muted-foreground">
              {safeMedia.length === 0
                ? 'No media records on file yet.'
                : `${safeMedia.length} media record${safeMedia.length !== 1 ? 's' : ''} across all horses`}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
            onClick={() => handleOpenMediaForm()}
          >
            <Plus size={13} />
            Add Media Record
          </Button>
        </div>

        {/* Stat pills */}
        {safeMedia.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(Object.entries(mediaTypeCounts) as [MediaType, number][]).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setMediaTypeFilter(mediaTypeFilter === type ? '' : type)}
                className={cn(
                  'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border transition-colors',
                  mediaTypeFilter === type
                    ? MEDIA_TYPE_COLORS[type]
                    : 'border-border/50 text-muted-foreground hover:text-foreground bg-card'
                )}
              >
                {MEDIA_TYPE_ICONS[type]}
                {type}
                <span className="tabular-nums font-bold">{count}</span>
              </button>
            ))}
            {mediaTypeFilter && (
              <button
                onClick={() => setMediaTypeFilter('')}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <X size={10} /> Clear filter
              </button>
            )}
          </div>
        )}

        {/* Search + Horse filter row */}
        {safeMedia.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder="Search title, subject, publication…"
                value={mediaSearch}
                onChange={(e) => setMediaSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Search media records"
              />
            </div>
            <select
              value={mediaHorseFilter}
              onChange={(e) => setMediaHorseFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              aria-label="Filter by horse"
            >
              <option value="">All Horses</option>
              {safeHorses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Empty state */}
        {safeMedia.length === 0 ? (
          <EmptyState
            icon={File}
            heading="No media records on file yet."
            description="Add articles, photos, videos, press releases, and publications linked to your thoroughbreds. Media records surface on horse profiles and across all featured parties."
            ctaLabel="Add Your First Media Record"
            onCta={() => handleOpenMediaForm()}
            size="lg"
          />
        ) : filteredMediaItems.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm font-semibold text-foreground mb-1">No media records match your filters</p>
            <button
              onClick={() => { setMediaSearch(''); setMediaHorseFilter(''); setMediaTypeFilter(''); }}
              className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          /* Media table */
          <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                Media Records
              </p>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {filteredMediaItems.length} {filteredMediaItems.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Title', 'Type', 'Horse', 'Source', 'Published', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMediaItems.map((item, idx) => {
                    const horse = safeHorses.find((h) => h.id === item.horse_id);
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/10 transition-colors',
                          idx % 2 === 0 ? 'bg-card' : 'bg-background'
                        )}
                      >
                        {/* Title + subject */}
                        <td className="px-4 py-3 max-w-[220px]">
                          <span className="text-xs font-semibold text-foreground block line-clamp-1">
                            {item.title}
                          </span>
                          {item.subject && (
                            <span className="text-[10px] text-muted-foreground line-clamp-1 block italic mt-0.5">
                              {item.subject}
                            </span>
                          )}
                          {(item.url || item.file_name) && (
                            <span className="text-[9px] text-primary/70 mt-0.5 block truncate">
                              {item.url ? '🔗 URL' : '📎 File'}: {item.url ?? item.file_name}
                            </span>
                          )}
                        </td>

                        {/* Type badge */}
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] font-bold px-2 py-0.5 rounded-full border',
                              MEDIA_TYPE_COLORS[item.media_type]
                            )}
                          >
                            {MEDIA_TYPE_ICONS[item.media_type]}
                            {item.media_type}
                          </span>
                        </td>

                        {/* Horse */}
                        <td className="px-4 py-3">
                          {horse ? (
                            <span className="text-xs text-foreground font-medium">{horse.name}</span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Source publication */}
                        <td className="px-4 py-3">
                          {item.source_publication ? (
                            <span className="text-[10px] text-muted-foreground truncate block max-w-[120px]">
                              {item.source_publication}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Published date */}
                        <td className="px-4 py-3">
                          {item.published_date ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays size={10} className="text-primary/50 flex-shrink-0" />
                              <span>
                                {new Date(item.published_date).toLocaleDateString('en-AU', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleOpenMediaForm(item)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                              aria-label={`Edit ${item.title}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleMediaDelete(item)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                              aria-label={`Remove ${item.title}`}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {mediaDeleteConfirm && mediaDeleteTarget && (
          <div className="border border-destructive/30 rounded-sm bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-foreground">
              Remove{' '}
              <span className="font-semibold">{mediaDeleteTarget.title}</span>
              {' '}from Stable Press? This cannot be undone.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => { setMediaDeleteConfirm(false); setMediaDeleteTarget(null); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={confirmMediaDelete}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        {/* Info note */}
        {safeMedia.length > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
            <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Media records added here are linked to their horse and surface on the <strong className="text-foreground">Thoroughbred Profile</strong> page.
              Featured parties will also see the media item on their own records.
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ── Racing Data CRM ────────────────────────────────── */

  function renderRacingCRM() {
    const safeEntries = racingEntries ?? [];
    const safeHorses = horses ?? [];

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
              Stable Press CRM
            </p>
            <p className="text-sm text-muted-foreground">
              {safeEntries.length === 0
                ? 'No racing records on file yet.'
                : `${safeEntries.length} racing record${safeEntries.length !== 1 ? 's' : ''} across all horses`}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
            onClick={() => handleOpenRacingForm()}
          >
            <Plus size={13} />
            Add Racing Record
          </Button>
        </div>

        {/* Search + Horse filter */}
        {safeEntries.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder="Search race, venue, subject…"
                value={racingSearch}
                onChange={(e) => setRacingSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Search racing records"
              />
            </div>
            <select
              value={racingHorseFilter}
              onChange={(e) => setRacingHorseFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              aria-label="Filter by horse"
            >
              <option value="">All Horses</option>
              {safeHorses.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Empty state */}
        {safeEntries.length === 0 ? (
          <EmptyState
            icon={Flag}
            heading="No racing records on file yet."
            description="Add race entries, results, and performance records for your thoroughbreds. Racing data surfaces on horse profiles and can be linked to jockeys and trainers."
            ctaLabel="Add Your First Racing Record"
            onCta={() => handleOpenRacingForm()}
            size="lg"
          />
        ) : filteredRacingEntries.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Search size={24} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-sm font-semibold text-foreground mb-1">No racing records match your filters</p>
            <button
              onClick={() => { setRacingSearch(''); setRacingHorseFilter(''); }}
              className="text-xs text-primary hover:text-primary/80 transition-colors mt-2"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                Racing Records
              </p>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {filteredRacingEntries.length} {filteredRacingEntries.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Horse', 'Race', 'Venue', 'Date', 'Status', 'Position', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRacingEntries.map((entry, idx) => {
                    const horse = safeHorses.find((h) => h.id === entry.horse_id);
                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/10 transition-colors',
                          idx % 2 === 0 ? 'bg-card' : 'bg-background'
                        )}
                      >
                        {/* Horse */}
                        <td className="px-4 py-3 max-w-[140px]">
                          {horse ? (
                            <span className="text-xs font-semibold text-foreground block line-clamp-1">{horse.name}</span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Race name + subject */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-xs font-semibold text-foreground block line-clamp-1">{entry.race_name}</span>
                          {entry.subject && (
                            <span className="text-[10px] text-muted-foreground italic block line-clamp-1 mt-0.5">{entry.subject}</span>
                          )}
                          {entry.class_grade && (
                            <span
                              className="text-[9px] uppercase tracking-[0.08em] font-bold px-1.5 py-0.5 rounded-sm mt-0.5 inline-block"
                              style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
                            >
                              {entry.class_grade}
                            </span>
                          )}
                        </td>

                        {/* Venue */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">{entry.venue}</span>
                            {entry.country && (
                              <span className="text-[9px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">{entry.country}</span>
                            )}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3">
                          {entry.race_date ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays size={10} className="text-primary/50 flex-shrink-0" />
                              <span>
                                {new Date(entry.race_date).toLocaleDateString('en-AU', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <RacingStatusBadge status={entry.status} />
                        </td>

                        {/* Finish position */}
                        <td className="px-4 py-3">
                          {entry.finish_position !== undefined && entry.finish_position !== null ? (
                            <span
                              className="text-sm font-bold tabular-nums"
                              style={{ color: entry.finish_position === 1 ? 'hsl(var(--brand-accent))' : 'hsl(var(--foreground))' }}
                            >
                              {entry.finish_position === 1 ? '🥇' : ''} {entry.finish_position}
                              {entry.margin ? <span className="text-[10px] text-muted-foreground ml-1 font-normal">({entry.margin})</span> : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleOpenRacingForm(entry)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                              aria-label={`Edit ${entry.race_name}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleRacingDelete(entry)}
                              className="text-[10px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                              aria-label={`Remove ${entry.race_name}`}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {racingDeleteConfirm && racingDeleteTarget && (
          <div className="border border-destructive/30 rounded-sm bg-destructive/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-foreground">
              Remove{' '}
              <span className="font-semibold">{racingDeleteTarget.race_name}</span>
              {' '}from Stable Press? This cannot be undone.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => { setRacingDeleteConfirm(false); setRacingDeleteTarget(null); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="text-xs"
                onClick={confirmRacingDelete}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        {/* Info note */}
        {safeEntries.length > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
            <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Racing records added here surface on each <strong className="text-foreground">Thoroughbred Profile</strong>.
              Records with linked jockeys and trainers will also appear on their party profiles.
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ── Media CRM form slide-over ─────────────────────── */

  function renderMediaFormPanel() {
    if (!mediaFormOpen) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex"
        role="dialog"
        aria-modal="true"
        aria-label={editMedia ? 'Edit Media Record' : 'Add Media Record'}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
          onClick={handleCloseMediaForm}
        />
        {/* Drawer panel */}
        <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto bg-card border-l border-border/60 shadow-2xl flex flex-col">
          {/* Panel header */}
          <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between border-b-2"
            style={{ borderBottomColor: 'hsl(var(--brand-accent))' }}
          >
            <div className="flex items-center gap-2.5">
              <File size={15} style={{ color: 'hsl(var(--brand-accent))' }} />
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold opacity-70">
                  Media Records CRM
                </p>
                <p className="font-[family-name:var(--font-display)] text-sm font-bold">
                  {editMedia ? 'Edit Media Record' : 'Add New Media Record'}
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseMediaForm}
              className="p-1.5 rounded-sm border border-primary-foreground/20 hover:border-primary-foreground/50 transition-colors"
              aria-label="Close form"
            >
              <X size={14} />
            </button>
          </div>

          {/* The form */}
          <div className="flex-1 overflow-y-auto">
            <MediaDataForm
              initial={editMedia}
              onSave={(_id) => {
                handleCloseMediaForm();
                fetchMediaItems();
              }}
              onCancel={handleCloseMediaForm}
              compact
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── Horse Records (Sales & Documents) tab ─────────── */

  function horseName(id: string) {
    const h = horses.find((x) => x.id === id);
    return h ? (h.isUnnamed ? 'Un-Named' : h.name) : id;
  }

  function renderHorseRecords() {
    return (
      <div className="space-y-8">
        {/* Sales */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground">Sales Records</p>
              <p className="text-xs text-muted-foreground/70">Auction & transfer history — surfaces on the horse's Sales Data module.</p>
            </div>
            <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditSale(undefined); setSalesFormOpen(true); }}>
              <Plus size={13} /> Add Sale
            </Button>
          </div>
          {salesRecords.length === 0 ? (
            <EmptyState icon={DollarSign} heading="No sale records yet." description="Add auction or transfer records and they will appear on the matching horse profile." ctaLabel="Add Sale" onCta={() => { setEditSale(undefined); setSalesFormOpen(true); }} />
          ) : (
            <div className="border border-border/60 rounded-sm overflow-hidden bg-card divide-y divide-border/50">
              {salesRecords.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{horseName(s.horse_id)} — {s.venue}{s.lot ? ` · ${s.lot}` : ''}</p>
                    <p className="text-[11px] text-muted-foreground">{s.sale_type} · {s.sale_date}{s.price ? ` · ${s.currency === 'NZD' ? 'NZ$' : '$'}${s.price.toLocaleString('en-AU')}` : ''}</p>
                  </div>
                  <button className="text-xs text-primary hover:underline" onClick={() => { setEditSale(s); setSalesFormOpen(true); }}>Edit</button>
                  <button className="text-xs text-destructive hover:underline" onClick={() => removeSale(s.id)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reports / Forms */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground">Reports / Forms</p>
              <p className="text-xs text-muted-foreground/70">Registration, passport, vet & other documents. Restricted docs show to members only.</p>
            </div>
            <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditReport(undefined); setReportFormOpen(true); }}>
              <Plus size={13} /> Add Document
            </Button>
          </div>
          {reportRecords.length === 0 ? (
            <EmptyState icon={File} heading="No documents yet." description="Add registration, passport, or veterinary documents for a horse." ctaLabel="Add Document" onCta={() => { setEditReport(undefined); setReportFormOpen(true); }} />
          ) : (
            <div className="border border-border/60 rounded-sm overflow-hidden bg-card divide-y divide-border/50">
              {reportRecords.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{horseName(r.horse_id)} — {r.title}</p>
                    <p className="text-[11px] text-muted-foreground">{r.doc_type} · {r.visibility === 'restricted' ? 'Restricted' : 'Public'}{r.issued_date ? ` · ${r.issued_date}` : ''}</p>
                  </div>
                  <button className="text-xs text-primary hover:underline" onClick={() => { setEditReport(r); setReportFormOpen(true); }}>Edit</button>
                  <button className="text-xs text-destructive hover:underline" onClick={() => removeReport(r.id)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Racing CRM form slide-over ────────────────────── */

  function renderRacingFormPanel() {
    if (!racingFormOpen) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex"
        role="dialog"
        aria-modal="true"
        aria-label={editRacing ? 'Edit Racing Record' : 'Add Racing Record'}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
          onClick={handleCloseRacingForm}
        />
        {/* Drawer panel */}
        <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto bg-card border-l border-border/60 shadow-2xl flex flex-col">
          {/* The form — uses its own themed header/footer */}
          <div className="flex-1 overflow-y-auto">
            <RacingDataForm
              initial={editRacing}
              onSave={() => {
                handleCloseRacingForm();
                fetchRacingEntries();
              }}
              onCancel={handleCloseRacingForm}
              compact
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── Contributor: My Media Assets ── */

  function renderMyAssets() {
    return (
      <div className="space-y-6">
        <div
          className="border-2 border-dashed border-border/60 rounded-sm p-8 flex flex-col items-center justify-center gap-4 hover:border-primary/40 transition-colors cursor-pointer bg-card"
          onClick={() => {}}
          role="button"
          tabIndex={0}
          aria-label="Upload media asset"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload size={20} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-1">
              Upload a media file
            </p>
            <p className="text-xs text-muted-foreground">
              Images, graphics, and supporting media for your stories. Files live here and can be referenced in your drafts.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled>
            <Upload size={12} />
            Choose File
          </Button>
          <p className="text-[10px] text-muted-foreground/50 italic">
            Media asset storage connects to your storage provider in production.
          </p>
        </div>

        <div className="border border-border/60 rounded-sm p-6 bg-card">
          <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-4">
            Your Uploaded Assets
          </p>
          <EmptyState
            icon={Image}
            heading="No assets uploaded yet."
            description="Upload photos, graphics, and supporting images here. They will be available to attach to your drafts and submissions."
            ctaLabel="Upload Your First Asset"
            onCta={() => {}}
          />
        </div>
      </div>
    );
  }

  /* ── Contributor: My Compensation ── */

  function renderCompensation() {
    const myPublished = (articles ?? []).filter(
      (a) =>
        a.author === currentUser?.displayName &&
        (a.status === 'published' || a.status === 'newsletter' || a.status === 'bulletin')
    );

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Stories Published',
              value: myPublished.length,
              sub: 'Your work in print',
              color: 'hsl(var(--primary))',
            },
            {
              label: 'Stories Filed',
              value: (articles ?? []).filter((a) => a.author === currentUser?.displayName).length,
              sub: 'Total in the system',
              color: 'hsl(var(--chart-1))',
            },
            {
              label: 'Pending Payment',
              value: '—',
              sub: 'Connects to payroll in production',
              color: 'hsl(var(--muted-foreground))',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-4 border border-border/60 rounded-sm bg-card"
            >
              <span
                className="block font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums mb-1"
                style={{ color: stat.color }}
              >
                {stat.value}
              </span>
              <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                {stat.label}
              </span>
              <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                {stat.sub}
              </span>
            </div>
          ))}
        </div>

        <div className="border border-border/60 rounded-sm bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Payout History
            </p>
            <span className="text-[10px] text-muted-foreground/60 italic">
              Personal — only visible to you
            </span>
          </div>

          {myPublished.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={DollarSign}
                heading="No published stories yet."
                description="Your compensation record will populate here once your first story is published. Keep writing — the press is waiting."
                ctaLabel="File a Story"
                onCta={() => {
                  setActiveNav('workflow');
                  handleNewInColumn('draft');
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Story', 'Status', 'Published', 'Rate'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myPublished.map((article, idx) => (
                    <tr
                      key={article.id}
                      className={cn(
                        'border-b border-border/30',
                        idx % 2 === 0 ? 'bg-card' : 'bg-background'
                      )}
                    >
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-xs font-medium text-foreground line-clamp-1 block">
                          {article.title}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm bg-primary text-primary-foreground">
                          Published
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {article.publishedAt
                            ? new Date(article.publishedAt).toLocaleDateString('en-AU', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground italic">
                          Connects to payroll
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
          <Lock size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your compensation data is private and visible only to you and the Administrator.
            Payment processing connects to your payroll provider in production.
          </p>
        </div>
      </div>
    );
  }

  /* ── Editor Hub ────────────────────────────────────────── */

  function renderEditorReviewQueue() {
    const submitted = buckets.submitted;
    const inReview = buckets.editorial_review;
    const inRevision = buckets.revision;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Awaiting Review',
              value: submitted.length,
              color: 'hsl(var(--chart-1))',
              icon: <Inbox size={14} />,
              urgent: submitted.length > 0,
            },
            {
              label: 'In Editorial Review',
              value: inReview.length,
              color: 'hsl(var(--chart-2))',
              icon: <Eye size={14} />,
              urgent: false,
            },
            {
              label: 'Sent for Revision',
              value: inRevision.length,
              color: '#e8a020',
              icon: <RotateCcw size={14} />,
              urgent: false,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={cn(
                'p-3 rounded-sm border',
                stat.urgent ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-card'
              )}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span style={{ color: stat.color }}>{stat.icon}</span>
                {stat.urgent && (
                  <span
                    className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold"
                    style={{
                      background: 'hsl(var(--brand-accent))',
                      color: 'hsl(var(--brand-accent-foreground))',
                    }}
                  >
                    Action
                  </span>
                )}
              </div>
              <span
                className="block font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums"
                style={{ color: stat.color }}
              >
                {stat.value}
              </span>
              <span className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground mt-0.5">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox size={13} className="text-primary" />
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-foreground">
                Submitted — Awaiting Editorial Review
              </p>
              {submitted.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tabular-nums">
                  {submitted.length}
                </span>
              )}
            </div>
          </div>

          {submitted.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={Inbox}
                heading="The queue is clear — no stories waiting for review."
                description="Submitted stories from contributors will appear here. Once a story lands, you can pull it into editorial review or send it back for revision."
                ctaLabel="File a Story"
                onCta={() => handleNewInColumn('draft')}
              />
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {submitted.map((article) => (
                <EditorReviewRow
                  key={article.id}
                  article={article}
                  onPullToReview={() => handleAdvance(article.id, 'editorial_review')}
                  onSendRevision={() => handleAdvance(article.id, 'revision')}
                  onEdit={() => handleEdit(article)}
                  actionLabel="Pull to Review"
                  actionColor="hsl(var(--chart-2))"
                />
              ))}
            </div>
          )}
        </div>

        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center gap-2">
            <Eye size={13} className="text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              In Editorial Review
            </p>
            {inReview.length > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                {inReview.length}
              </span>
            )}
          </div>

          {inReview.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[11px] text-muted-foreground italic font-[family-name:var(--font-display)]">
                No stories currently under editorial review.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {inReview.map((article) => (
                <EditorReviewRow
                  key={article.id}
                  article={article}
                  onPullToReview={() => handleAdvance(article.id, 'legal_review')}
                  onSendRevision={() => handleAdvance(article.id, 'revision')}
                  onEdit={() => handleEdit(article)}
                  actionLabel="Clear — Send to Legal"
                  actionColor="hsl(var(--chart-3))"
                />
              ))}
            </div>
          )}
        </div>

        {inRevision.length > 0 && (
          <div className="border border-dashed border-border/60 rounded-sm overflow-hidden bg-card">
            <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center gap-2">
              <RotateCcw size={13} style={{ color: '#e8a020' }} />
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: '#e8a020' }}>
                Sent Back for Revision
              </p>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                style={{ background: 'rgba(232,160,32,0.15)', color: '#e8a020' }}
              >
                {inRevision.length}
              </span>
            </div>
            <div className="divide-y divide-border/40">
              {inRevision.map((article) => (
                <EditorReviewRow
                  key={article.id}
                  article={article}
                  onPullToReview={() => handleAdvance(article.id, 'editorial_review')}
                  onSendRevision={() => {}}
                  onEdit={() => handleEdit(article)}
                  actionLabel="Re-pull to Review"
                  actionColor="#e8a020"
                  hideRevision
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderEditorAssignments() {
    const allArticles = articles ?? [];
    const assignable = allArticles.filter(
      (a) => a.status === 'draft' || a.status === 'revision' || a.status === 'editorial_review'
    );

    return (
      <div className="space-y-5">
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
        >
          <UserCheck size={15} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">Content Assignment & Modification</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              As Editor, you can claim stories in draft, editorial review, or revision — edit them directly, reassign notes, or push them forward in the workflow.
            </p>
          </div>
        </div>

        {assignDialogArticle && (
          <div className="border border-primary/30 rounded-sm bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">
                Assignment Note — <span className="font-normal text-muted-foreground">{assignDialogArticle.title}</span>
              </p>
              <button
                onClick={() => { setAssignDialogArticle(null); setAssignNote(''); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close assignment note"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              className="w-full px-3 py-2 text-xs border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Add an editorial note or assignment instruction for this story…"
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              aria-label="Assignment note"
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => { setAssignDialogArticle(null); setAssignNote(''); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                onClick={() => {
                  toast.success('Assignment note saved. Story flagged for action.');
                  setAssignDialogArticle(null);
                  setAssignNote('');
                }}
              >
                <Check size={12} />
                Save Note
              </Button>
            </div>
          </div>
        )}

        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Stories You Can Assign or Modify
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {assignable.length} {assignable.length === 1 ? 'story' : 'stories'}
            </span>
          </div>

          {assignable.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={UserCheck}
                heading="No stories available for assignment right now."
                description="Stories in Draft, Revision, and Editorial Review stages will appear here."
                ctaLabel="File a Story"
                onCta={() => handleNewInColumn('draft')}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Story', 'Author', 'Stage', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignable.map((article, idx) => (
                    <tr
                      key={article.id}
                      className={cn(
                        'border-b border-border/30 hover:bg-muted/10 transition-colors',
                        idx % 2 === 0 ? 'bg-card' : 'bg-background'
                      )}
                    >
                      <td className="px-4 py-3 max-w-[240px]">
                        <span className="text-xs font-medium text-foreground line-clamp-1 block">
                          {article.title}
                        </span>
                        {article.category && (
                          <span className="text-[10px] text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm mt-0.5 inline-block">
                            {article.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{article.author}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={article.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleEdit(article)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setAssignDialogArticle(article); setAssignNote(''); }}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Note
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderEditorApprovalRouting() {
    const toRoute = (articles ?? []).filter(
      (a) =>
        a.status === 'editorial_review' ||
        a.status === 'approved' ||
        a.status === 'legal_review' ||
        a.status === 'compliance'
    );

    type RouteAction = {
      label: string;
      toStatus: KanbanStatus;
      color: string;
      icon: React.ReactNode;
    };

    const routeActions = (article: Article): RouteAction[] => {
      if (article.status === 'editorial_review') {
        return [
          { label: 'Route → Legal Review', toStatus: 'legal_review', color: 'hsl(var(--chart-3))', icon: <Scale size={11} /> },
          { label: 'Send Back for Revision', toStatus: 'revision', color: '#e8a020', icon: <RotateCcw size={11} /> },
        ];
      }
      if (article.status === 'legal_review') {
        return [{ label: 'Route → Compliance', toStatus: 'compliance', color: 'hsl(var(--chart-4))', icon: <CheckCircle size={11} /> }];
      }
      if (article.status === 'compliance') {
        return [{ label: 'Route → Approved', toStatus: 'approved', color: '#5da854', icon: <CheckCircle size={11} /> }];
      }
      if (article.status === 'approved') {
        return [{ label: 'Route → Publisher', toStatus: 'publisher_review', color: 'hsl(var(--brand-accent))', icon: <BookOpen size={11} /> }];
      }
      return [];
    };

    return (
      <div className="space-y-5">
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
        >
          <Layers size={15} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">Approval Workflow Routing</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Stories that have passed editorial review need routing to the next stage — Legal, Compliance, Approved, or back for Revision.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.1em]">Routing path:</span>
          {[
            { label: 'Editorial Review', color: 'hsl(var(--chart-2))' },
            { label: 'Legal Review', color: 'hsl(var(--chart-3))' },
            { label: 'Compliance', color: 'hsl(var(--chart-4))' },
            { label: 'Approved', color: '#5da854' },
            { label: 'Publisher', color: 'hsl(var(--brand-accent))' },
          ].map((step, idx, arr) => (
            <span key={step.label} className="flex items-center gap-1.5">
              <span
                className="px-2 py-0.5 rounded-sm font-semibold"
                style={{ background: `${step.color}18`, color: step.color }}
              >
                {step.label}
              </span>
              {idx < arr.length - 1 && <ChevronRight size={10} className="text-border" />}
            </span>
          ))}
        </div>

        {toRoute.length === 0 ? (
          <EmptyState
            icon={Layers}
            heading="All stories are properly routed."
            description="When stories reach Editorial Review, Legal, Compliance, or Approved stages they will appear here for routing."
            ctaLabel="Go to Review Queue"
            onCta={() => setEditorTab('review-queue')}
          />
        ) : (
          <div className="space-y-3">
            {toRoute.map((article) => {
              const actions = routeActions(article);
              return (
                <div
                  key={article.id}
                  className="border border-border/60 rounded-sm bg-card p-4"
                  style={{ boxShadow: 'inset 3px 0 0 hsl(var(--chart-2))' }}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground line-clamp-1">{article.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {article.author} · {article.category ?? 'General'}
                      </p>
                      <div className="mt-1.5">
                        <StatusBadge status={article.status} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 flex-shrink-0">
                      {actions.map((action) => (
                        <button
                          key={action.toStatus}
                          onClick={() => handleAdvance(article.id, action.toStatus)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[10px] uppercase tracking-[0.08em] font-semibold transition-colors hover:opacity-80"
                          style={{
                            borderColor: `${action.color}40`,
                            background: `${action.color}10`,
                            color: action.color,
                          }}
                        >
                          {action.icon}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderEditorScheduling() {
    const schedulable = (articles ?? []).filter(
      (a) => a.status === 'approved' || a.status === 'publisher_review'
    );
    const alreadyScheduled = buckets.scheduled;

    return (
      <div className="space-y-5">
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
        >
          <CalendarClock size={15} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground mb-0.5">Scheduled Publishing</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Approved and Publisher-reviewed stories can be queued for publication.
            </p>
          </div>
        </div>

        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-primary/5 flex items-center gap-2">
            <Clock size={13} className="text-primary" />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-foreground">Currently Scheduled</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tabular-nums">
              {alreadyScheduled.length}
            </span>
          </div>
          {alreadyScheduled.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[11px] text-muted-foreground italic font-[family-name:var(--font-display)]">
                Nothing queued yet. Schedule approved stories below.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {alreadyScheduled.map((article) => (
                <div key={article.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{article.title}</p>
                    <p className="text-[10px] text-muted-foreground">{article.author}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm bg-primary/10 text-primary">
                      Scheduled
                    </span>
                    <button
                      onClick={() => handleAdvance(article.id, 'published')}
                      className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      Publish Now →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center gap-2">
            <CheckCircle size={13} className="text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Ready to Schedule</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
              {schedulable.length}
            </span>
          </div>
          {schedulable.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={CalendarClock}
                heading="Nothing ready to schedule yet."
                description="Stories that have passed approval and publisher review will appear here."
                ctaLabel="Go to Approval Routing"
                onCta={() => setEditorTab('approval-routing')}
              />
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {schedulable.map((article) => (
                <div key={article.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{article.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {article.author} · <StatusBadge status={article.status} />
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const toStatus: KanbanStatus =
                        article.status === 'publisher_review' ? 'scheduled' : 'publisher_review';
                      handleAdvance(article.id, toStatus);
                    }}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-primary/30 bg-primary/8 text-primary text-[10px] uppercase tracking-[0.08em] font-semibold hover:bg-primary/15 transition-colors"
                  >
                    <CalendarClock size={11} />
                    {article.status === 'publisher_review' ? 'Schedule →' : 'Route to Publisher →'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderEditorMediaLibrary() {
    const allArticles = articles ?? [];
    const publishedWithMedia = allArticles.filter(
      (a) => a.status === 'published' || a.status === 'newsletter' || a.status === 'bulletin'
    );

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="border-2 border-dashed border-primary/30 rounded-sm p-6 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Upload media asset"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
            onClick={() => toast.success('Media asset storage connects to your provider in production.')}
          >
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Upload size={18} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-0.5">Upload Media</p>
              <p className="text-[11px] text-muted-foreground">Add images, graphics, and audio for any story.</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <Upload size={11} />Choose Files
            </Button>
          </div>

          <div className="border border-border/60 rounded-sm p-5 bg-card space-y-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Library Stats</p>
            {[
              { label: 'Total Published Stories', value: publishedWithMedia.length },
              { label: 'Media Records (CRM)', value: (mediaItems ?? []).length },
              { label: 'Storage Used', value: '—' },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
                <span className="text-[11px] font-bold tabular-nums text-primary">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen size={13} className="text-muted-foreground" />
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">All Story Media</p>
            </div>
            <p className="text-[10px] text-muted-foreground italic">Editor view — full access</p>
          </div>
          {allArticles.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={FolderOpen}
                heading="No stories in the system yet."
                description="Media assets are tied to stories. Once stories are filed and published, their media will appear here."
                ctaLabel="File a Story"
                onCta={() => handleNewInColumn('draft')}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {['Story', 'Author', 'Stage', 'Assets', 'Manage'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allArticles.slice(0, 20).map((article, idx) => (
                    <tr key={article.id} className={cn('border-b border-border/30 hover:bg-muted/10 transition-colors', idx % 2 === 0 ? 'bg-card' : 'bg-background')}>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-xs font-medium text-foreground line-clamp-1 block">{article.title}</span>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{article.author}</span></td>
                      <td className="px-4 py-3"><StatusBadge status={article.status} /></td>
                      <td className="px-4 py-3"><span className="text-[10px] text-muted-foreground italic">—</span></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toast.success('Media management connects to your storage provider in production.')}
                          className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderEditorHub() {
    const availableTabs = EDITOR_TABS.filter((t) => can(userRole, t.permission));
    const activeTab = availableTabs.find((t) => t.id === editorTab)?.id ?? availableTabs[0]?.id;

    return (
      <div className="space-y-5">
        {userRole === 'administrator' && (
          <div
            className="flex items-center gap-2.5 px-3 py-2 rounded-sm border text-[11px] font-medium"
            style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.06)', color: 'hsl(var(--primary))' }}
          >
            <Star size={13} />
            Viewing Editor Hub as Administrator — full editorial access granted.
          </div>
        )}

        <div className="flex flex-wrap gap-1 border-b border-border/50 pb-0">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setEditorTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-[0.1em] font-semibold border-b-2 transition-all -mb-px',
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
              )}
              aria-selected={activeTab === tab.id}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {availableTabs.find((t) => t.id === activeTab) && (
          <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
            {availableTabs.find((t) => t.id === activeTab)?.description}
          </p>
        )}

        <div>
          {activeTab === 'review-queue' && renderEditorReviewQueue()}
          {activeTab === 'assignments' && renderEditorAssignments()}
          {activeTab === 'approval-routing' && renderEditorApprovalRouting()}
          {activeTab === 'scheduling' && renderEditorScheduling()}
          {activeTab === 'media-library' && renderEditorMediaLibrary()}
          {activeTab === 'horse-records' && renderHorseRecords()}
        </div>
      </div>
    );
  }

  /* ── Pipeline map view ── */

  function renderPipelineMap() {
    const stages = [
      { key: 'contributor', label: 'Contributor', steps: ['Create Draft', 'Submit For Review'], color: 'hsl(var(--chart-1))', icon: <FileText size={15} /> },
      { key: 'editorial', label: 'Editor Review', steps: ['Editorial Review'], color: 'hsl(var(--chart-2))', icon: <Eye size={15} />, branch: true },
      { key: 'revision', label: 'Revision (if needed)', steps: ['Contributor Updates', 'Re-submit'], color: '#e8a020', icon: <AlertTriangle size={15} />, isBranch: true },
      { key: 'legal', label: 'Legal & Compliance', steps: ['Legal Review', 'Compliance Check'], color: 'hsl(var(--chart-3))', icon: <Scale size={15} /> },
      { key: 'approval', label: 'Approval', steps: ['Approved'], color: '#5da854', icon: <CheckCircle size={15} /> },
      { key: 'publisher', label: 'Publisher Review', steps: ['Publisher Review', 'Schedule Publish'], color: 'hsl(var(--brand-accent))', icon: <BookOpen size={15} /> },
      { key: 'distribution', label: 'Distribution', steps: ['Published', 'Website + App', 'Newsletter + Podcast', 'Bulletin Inclusion'], color: 'hsl(var(--primary))', icon: <TrendingDown size={15} /> },
    ];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">Editorial Pipeline</h3>
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">Full Workflow Map</span>
        </div>

        <div className="relative">
          <div className="space-y-3">
            {stages.map((stage, idx) => (
              <div key={stage.key} className="relative">
                {stage.isBranch && (
                  <div className="hidden md:flex items-center gap-2 mb-2 ml-4">
                    <div className="h-px w-8 bg-[#e8a020]/40" />
                    <span className="text-[9px] text-muted-foreground italic">Revision path — returns to Editorial Review</span>
                  </div>
                )}
                <div
                  className={cn(
                    'flex items-stretch gap-0 rounded-sm border overflow-hidden transition-all',
                    stage.isBranch ? 'border-dashed border-border/50 opacity-90' : 'border-border/60'
                  )}
                  style={{ boxShadow: `inset 3px 0 0 ${stage.color}` }}
                >
                  <div
                    className="flex items-center gap-2.5 px-4 py-3 min-w-[180px] border-r border-border/40"
                    style={{ background: `${stage.color}10` }}
                  >
                    <span style={{ color: stage.color }}>{stage.icon}</span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: stage.color }}>
                        {stage.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 bg-card">
                    {stage.steps.map((step, stepIdx) => (
                      <div key={step} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border/60 bg-background">
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-primary-foreground flex-shrink-0"
                            style={{ background: stage.color }}
                          >
                            {idx * 3 + stepIdx + 1}
                          </span>
                          <span className="text-[11px] font-medium text-foreground whitespace-nowrap">{step}</span>
                        </div>
                        {stepIdx < stage.steps.length - 1 && (
                          <ChevronRight size={10} className="text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center px-3 border-l border-border/40 bg-muted/20">
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: stage.color }}>
                      {stage.key === 'contributor'
                        ? buckets.draft.length + buckets.submitted.length
                        : stage.key === 'editorial'
                        ? buckets.editorial_review.length
                        : stage.key === 'revision'
                        ? buckets.revision.length
                        : stage.key === 'legal'
                        ? buckets.legal_review.length + buckets.compliance.length
                        : stage.key === 'approval'
                        ? buckets.approved.length
                        : stage.key === 'publisher'
                        ? buckets.publisher_review.length + buckets.scheduled.length
                        : buckets.published.length + buckets.newsletter.length + buckets.bulletin.length}
                    </span>
                  </div>
                </div>
                {idx < stages.length - 1 && !stages[idx + 1].isBranch && (
                  <div className="flex justify-center my-1">
                    <ChevronRight size={14} className="text-border rotate-90" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Overview view ── */

  function renderOverview() {
    const displayTotal = isContributor ? myStories : totalStories;
    return (
      <div className="space-y-8">
        {isContributor && (
          <div
            className="flex items-start gap-2.5 px-4 py-3 rounded-sm border text-xs"
            style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
          >
            <AlertCircle size={14} style={{ color: currentRoleConfig.color }} className="flex-shrink-0 mt-0.5" />
            <span className="text-foreground/70">
              You are viewing your own stories only. Editors and administrators can see the full newsroom.
            </span>
          </div>
        )}

        {can(userRole, 'content.editorial_review') && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
            style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.05)' }}
          >
            <div className="flex items-center gap-2">
              <Edit size={14} className="text-primary" />
              <span className="text-xs font-semibold text-foreground">Editor Hub</span>
              {pendingReview > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                >
                  {pendingReview} awaiting action
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => setActiveNav('editor-hub')}
            >
              Open Editor Hub
              <ChevronRight size={11} />
            </Button>
          </div>
        )}

        {/* Bulletin Templates shortcut */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
          style={{ borderColor: 'hsl(var(--brand-accent) / 0.3)', background: 'hsl(var(--brand-accent) / 0.05)' }}
        >
          <div className="flex items-center gap-2">
            <BookOpen size={14} style={{ color: 'hsl(var(--brand-accent))' }} />
            <span className="text-xs font-semibold text-foreground">Bulletin Templates</span>
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-[0.1em]"
              style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
            >
              New
            </span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              — 9 templates ready to use
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5"
            style={{ borderColor: 'hsl(var(--brand-accent) / 0.4)', color: 'hsl(var(--brand-accent))' }}
            onClick={() => setActiveNav('bulletin-templates')}
          >
            Open Studio
            <ArrowRight size={11} />
          </Button>
        </div>

        {/* Media Records shortcut */}
        {can(userRole, 'content.draft.create') && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
            style={{ borderColor: 'hsl(var(--chart-3) / 0.3)', background: 'hsl(var(--chart-3) / 0.05)' }}
          >
            <div className="flex items-center gap-2">
              <File size={14} style={{ color: 'hsl(var(--chart-3))' }} />
              <span className="text-xs font-semibold text-foreground">Media Records CRM</span>
              {(mediaItems ?? []).length > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'hsl(var(--chart-3) / 0.15)', color: 'hsl(var(--chart-3))' }}
                >
                  {(mediaItems ?? []).length} records
                </span>
              )}
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                — articles, photos, videos &amp; press releases
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              style={{ borderColor: 'hsl(var(--chart-3) / 0.4)', color: 'hsl(var(--chart-3))' }}
              onClick={() => setActiveNav('media-crm')}
            >
              Manage Media
              <ArrowRight size={11} />
            </Button>
          </div>
        )}

        {/* Racing Data shortcut */}
        {can(userRole, 'content.draft.create') && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-sm border"
            style={{ borderColor: 'hsl(var(--chart-1) / 0.3)', background: 'hsl(var(--chart-1) / 0.05)' }}
          >
            <div className="flex items-center gap-2">
              <Flag size={14} style={{ color: 'hsl(var(--chart-1))' }} />
              <span className="text-xs font-semibold text-foreground">Racing Data CRM</span>
              {(racingEntries ?? []).length > 0 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'hsl(var(--chart-1) / 0.15)', color: 'hsl(var(--chart-1))' }}
                >
                  {(racingEntries ?? []).length} records
                </span>
              )}
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                — race entries, results &amp; performance
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              style={{ borderColor: 'hsl(var(--chart-1) / 0.4)', color: 'hsl(var(--chart-1))' }}
              onClick={() => setActiveNav('racing-crm')}
            >
              Manage Racing
              <ArrowRight size={11} />
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: isContributor ? 'My Stories' : 'Total Stories',
              value: displayTotal,
              icon: <FileText size={16} />,
              delta: isContributor ? 'Stories you have filed' : 'In the system',
            },
            {
              label: 'Awaiting Action',
              value: pendingReview,
              icon: <Eye size={16} />,
              delta: 'Editorial + Submitted',
              alert: pendingReview > 0,
            },
            {
              label: 'Scheduled',
              value: scheduledCount,
              icon: <Clock size={16} />,
              delta: 'Ready to publish',
            },
            {
              label: 'In Print',
              value: publishedCount,
              icon: <TrendingUp size={16} />,
              delta: 'Published & distributed',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={cn(
                'p-4 rounded-sm border',
                stat.alert
                  ? 'border-[hsl(var(--brand-accent)/0.5)] bg-[hsl(var(--brand-accent)/0.05)]'
                  : 'border-border/60 bg-card'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn('opacity-50', stat.alert && 'text-[hsl(var(--brand-accent))]')}>{stat.icon}</span>
                {stat.alert && (
                  <span
                    className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold"
                    style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                  >
                    Action
                  </span>
                )}
              </div>
              <span
                className="block font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums"
                style={{ color: stat.alert ? 'hsl(var(--brand-accent))' : 'hsl(var(--primary))' }}
              >
                {stat.value}
              </span>
              <span className="block text-[10px] text-muted-foreground mt-1 uppercase tracking-[0.08em]">{stat.label}</span>
              <span className="block text-[10px] text-muted-foreground/60 mt-0.5">{stat.delta}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">Pipeline Status</h3>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {WORKFLOW_STAGES.filter((s) =>
              isContributor ? currentRoleConfig.allowedStatuses.includes(s.status) : true
            ).map((stage) => (
              <button
                key={stage.status}
                onClick={() => { setActiveNav('workflow'); setActiveColumn(stage.status); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-sm border border-border/60 bg-card hover:border-primary/30 transition-colors text-center"
              >
                <span style={{ color: stage.accent }}>{stage.icon}</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: stage.accent }}>
                  {buckets[stage.status].length}
                </span>
                <span className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground leading-tight">
                  {stage.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {displayTotal === 0 && (
          <EmptyState
            icon={PenLine}
            heading="No stories in the queue. The press is ready when you are."
            description="File your first story to begin building the newsroom record."
            ctaLabel="File a Story"
            onCta={() => handleNewInColumn('draft')}
          />
        )}

        {displayTotal > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-foreground">
                {isContributor ? 'My Recent Stories' : 'Recent Activity'}
              </h3>
              <div className="flex-1 h-px bg-border/50" />
            </div>
            <div className="border border-border/60 rounded-sm overflow-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/40">
                    {['Story', 'Author', 'Category', 'Stage'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredArticles.slice(0, 10).map((article, idx) => {
                    const editable = canEditArticle(userRole, article.author, currentUser?.displayName);
                    return (
                      <tr
                        key={article.id}
                        className={cn(
                          'border-b border-border/30 transition-colors',
                          editable ? 'hover:bg-muted/20 cursor-pointer' : 'opacity-70',
                          idx % 2 === 0 ? 'bg-card' : 'bg-background'
                        )}
                        onClick={() => editable && handleEdit(article)}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-xs text-foreground line-clamp-1">{article.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{article.author}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] text-muted-foreground border border-border/50 px-2 py-0.5 rounded-sm">
                            {article.category ?? 'General'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={article.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── All Stories table ── */

  function renderAllStories() {
    return (
      <div className="space-y-4">
        {isContributor && (
          <div
            className="flex items-start gap-2.5 px-4 py-3 rounded-sm border text-xs"
            style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
          >
            <AlertCircle size={14} style={{ color: currentRoleConfig.color }} className="flex-shrink-0 mt-0.5" />
            <span className="text-foreground/70">
              Showing your stories only. Submit a story to move it into the editorial queue.
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search stories, authors, categories…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-input rounded-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search stories"
            />
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" aria-label="Filter stories">
            <Filter size={12} />
            Filter
          </Button>
        </div>

        {filteredArticles.length === 0 ? (
          <EmptyState
            icon={PenLine}
            heading="No stories in the queue. The press is ready when you are."
            description="File your first dispatch to begin the newsroom record."
            ctaLabel="File a Story"
            onCta={() => handleNewInColumn('draft')}
          />
        ) : (
          <div className="border border-border/60 rounded-sm overflow-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border/40">
                  {['Story', 'Author', 'Category', 'Stage', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((article, idx) => {
                  const editable = canEditArticle(userRole, article.author, currentUser?.displayName);
                  return (
                    <tr key={article.id} className={cn('border-b border-border/30 transition-colors', idx % 2 === 0 ? 'bg-card' : 'bg-background')}>
                      <td className="px-4 py-3 max-w-[240px]">
                        <span className="font-medium text-xs text-foreground line-clamp-1 block">{article.title}</span>
                        {article.readingTime && (
                          <span className="text-[10px] text-muted-foreground">{article.readingTime} min read</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{article.author}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-muted-foreground border border-border/50 px-2 py-0.5 rounded-sm whitespace-nowrap">
                          {article.category ?? 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={article.status} /></td>
                      <td className="px-4 py-3">
                        {editable ? (
                          <button
                            onClick={() => handleEdit(article)}
                            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                            <Lock size={10} />
                            Read-only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ── Workflow Board ── */

  function renderWorkflowBoard() {
    const displayCount = isContributor ? myStories : totalStories;
    return (
      <div className="space-y-5">
        {displayCount === 0 && (
          <EmptyState
            icon={PenLine}
            heading="No stories in the queue. The press is ready when you are."
            description="File your first dispatch to begin the newsroom record. The board will fill as your team starts writing."
            ctaLabel="File Your First Story"
            onCta={() => handleNewInColumn('draft')}
            className="mb-6"
          />
        )}

        <div className="flex md:hidden gap-1.5 overflow-x-auto pb-1">
          {visibleStages.map((col) => (
            <button
              key={col.status}
              onClick={() => setActiveColumn(col.status)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] font-semibold rounded-sm border transition-colors',
                activeColumn === col.status
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {col.label}
              <span className="ml-1.5 tabular-nums font-bold">({buckets[col.status].length})</span>
            </button>
          ))}
        </div>

        <div className="hidden md:block">
          <WorkflowFlowBar
            buckets={buckets}
            onStageClick={(s) => setActiveColumn(s)}
            activeColumn={activeColumn}
            visibleStages={visibleStages}
          />
        </div>

        <div
          className={cn(
            'hidden md:grid gap-3',
            visibleStages.length >= 6
              ? 'grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
              : visibleStages.length === 5
              ? 'grid-cols-3 lg:grid-cols-5'
              : visibleStages.length === 4
              ? 'grid-cols-2 lg:grid-cols-4'
              : visibleStages.length === 3
              ? 'grid-cols-3'
              : 'grid-cols-2'
          )}
        >
          {visibleStages.map((col) => {
            const canAdd = can(userRole, 'content.draft.create') && col.status === 'draft';
            return (
              <div key={col.status} className="flex flex-col gap-2">
                <KanbanColumn
                  status={col.status}
                  label={col.label}
                  articles={buckets[col.status]}
                  isActiveColumn={col.status === activeColumn}
                  onAdvance={handleAdvance}
                  onEdit={handleEdit}
                  currentUserDisplayName={currentUser?.displayName ?? null}
                  userRole={userRole}
                />
                {canAdd && (
                  <button
                    onClick={() => handleNewInColumn(col.status)}
                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-sm border border-dashed border-border/60 text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    aria-label={`Add story to ${col.label}`}
                  >
                    <Plus size={11} />
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="md:hidden">
          {visibleStages
            .filter((col) => col.status === activeColumn)
            .map((col) => (
              <div key={col.status} className="flex flex-col gap-3">
                <KanbanColumn
                  status={col.status}
                  label={col.label}
                  articles={buckets[col.status]}
                  isActiveColumn
                  onAdvance={handleAdvance}
                  onEdit={handleEdit}
                  currentUserDisplayName={currentUser?.displayName ?? null}
                  userRole={userRole}
                />
                {can(userRole, 'content.draft.create') && col.status === 'draft' && (
                  <button
                    onClick={() => handleNewInColumn(col.status)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-sm border border-dashed border-border/60 text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    <Plus size={11} />
                    Add to {col.label}
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    );
  }

  /* ── Team ── */

  function renderTeam() {
    return (
      <EmptyState
        icon={Users}
        heading="Your team roster is waiting to be built."
        description="Team member management connects to your authentication records in production. Invite contributors, editors, legal reviewers, and publishers to populate this view."
        ctaLabel="File a Story"
        onCta={() => { setActiveNav('workflow'); handleNewInColumn('draft'); }}
      />
    );
  }

  /* ── Main render ── */
  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-background">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border/60 bg-card transition-all duration-200',
          sidebarCollapsed ? 'w-14' : 'w-56'
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
          {!sidebarCollapsed && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground">CMS</p>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">Newsroom</p>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Toggle sidebar"
          >
            <Filter size={14} />
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-b border-border/40">
            <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mb-1.5">Your Role</p>
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm border text-xs font-semibold"
              style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
            >
              <span style={{ color: currentRoleConfig.color }}>{currentRoleConfig.icon}</span>
              <span style={{ color: currentRoleConfig.color }}>{currentRoleConfig.label}</span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5 leading-snug">{currentRoleConfig.description}</p>
          </div>
        )}

        <nav className="flex-1 py-2 overflow-y-auto">
          {['Workspace', 'Content', 'Stables', 'Management'].map((section) => {
            const items = visibleNav.filter((i) => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-1">
                {!sidebarCollapsed && (
                  <p className="px-4 py-1.5 text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50">
                    {section}
                  </p>
                )}
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveNav(item.id);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors rounded-sm mx-1',
                      sidebarCollapsed && 'justify-center',
                      activeNav === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-label={item.label}
                  >
                    <span className={cn('flex-shrink-0', activeNav === item.id ? 'text-primary' : 'text-muted-foreground')}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                    {!sidebarCollapsed && item.badge && (
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-[0.1em] flex-shrink-0"
                        style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {!sidebarCollapsed && item.id === 'editor-hub' && pendingReview > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                        {pendingReview}
                      </span>
                    )}
                    {!sidebarCollapsed && item.id === 'horses' && (horses ?? []).length > 0 && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'hsl(var(--brand-accent) / 0.15)', color: 'hsl(var(--brand-accent))' }}
                      >
                        {(horses ?? []).length}
                      </span>
                    )}
                    {!sidebarCollapsed && item.id === 'parties' && safeParties.length > 0 && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                      >
                        {safeParties.length}
                      </span>
                    )}
                    {!sidebarCollapsed && item.id === 'media-crm' && (mediaItems ?? []).length > 0 && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'hsl(var(--chart-3) / 0.15)', color: 'hsl(var(--chart-3))' }}
                      >
                        {(mediaItems ?? []).length}
                      </span>
                    )}
                    {!sidebarCollapsed && item.id === 'racing-crm' && (racingEntries ?? []).length > 0 && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'hsl(var(--chart-1) / 0.15)', color: 'hsl(var(--chart-1))' }}
                      >
                        {(racingEntries ?? []).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {!sidebarCollapsed && currentUser && (
          <div className="border-t border-border/40 px-3 py-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground flex-shrink-0"
                style={{ background: currentRoleConfig.color }}
              >
                {currentUser.displayName.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{currentUser.displayName}</p>
                <p className="text-[9px] text-muted-foreground capitalize">{currentRoleConfig.label}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3.5 border-b border-border/40 bg-card">
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
              <span>Newsroom</span>
              <span>/</span>
              <span className="text-foreground font-medium capitalize">
                {visibleNav.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Notifications"
              >
                <Bell size={15} />
              </button>
              {pendingReview > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[7px] font-bold flex items-center justify-center"
                  style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                >
                  {pendingReview}
                </span>
              )}
            </div>

            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
              style={{ background: `${currentRoleConfig.color}18`, color: currentRoleConfig.color }}
            >
              {currentRoleConfig.icon}
              {currentRoleConfig.label}
            </div>

            {/* Quick action buttons per active tab */}
            {activeNav === 'horses' && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
                onClick={() => handleOpenHorseForm()}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Add Thoroughbred</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}

            {activeNav === 'parties' && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
                onClick={() => handleOpenPartyForm()}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Add Party</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}

            {activeNav === 'media-crm' && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
                onClick={() => handleOpenMediaForm()}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Add Media Record</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}

            {activeNav === 'racing-crm' && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
                onClick={() => handleOpenRacingForm()}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Add Racing Record</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}

            {activeNav === 'bulletin-templates' && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5"
                onClick={() => setActiveNav('workflow')}
              >
                Back to Workflow
              </Button>
            )}

            {activeNav !== 'horses' && activeNav !== 'parties' && activeNav !== 'media-crm' && activeNav !== 'racing-crm' && activeNav !== 'bulletin-templates' && can(userRole, 'content.draft.create') && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs"
                onClick={() => handleNewInColumn('draft')}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">File a Story</span>
                <span className="sm:hidden">New</span>
              </Button>
            )}
          </div>
        </div>

        {/* Page body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
          {/* Page title — not shown for bulletin-templates (has its own header) */}
          {activeNav !== 'bulletin-templates' && (
            <div className="mb-6">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                  {visibleNav.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}
                </h1>
                {publishedCount > 0 && (activeNav === 'workflow' || activeNav === 'overview') && (
                  <span className="flex items-baseline gap-1">
                    <span
                      className="font-[family-name:var(--font-display)] text-lg font-bold tabular-nums"
                      style={{ color: 'hsl(var(--brand-accent))' }}
                    >
                      {publishedCount}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">in print</span>
                  </span>
                )}
                {activeNav === 'editor-hub' && pendingReview > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
                  >
                    {pendingReview} stories need attention
                  </span>
                )}
                {activeNav === 'horses' && (horses ?? []).length > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
                  >
                    {(horses ?? []).length} in the stables
                  </span>
                )}
                {activeNav === 'parties' && safeParties.length > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
                  >
                    {safeParties.length} {safeParties.length === 1 ? 'party' : 'parties'} registered
                  </span>
                )}
                {activeNav === 'media-crm' && (mediaItems ?? []).length > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--chart-3) / 0.12)', color: 'hsl(var(--chart-3))' }}
                  >
                    {(mediaItems ?? []).length} media {(mediaItems ?? []).length === 1 ? 'record' : 'records'}
                  </span>
                )}
                {activeNav === 'racing-crm' && (racingEntries ?? []).length > 0 && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--chart-1) / 0.12)', color: 'hsl(var(--chart-1))' }}
                  >
                    {(racingEntries ?? []).length} racing {(racingEntries ?? []).length === 1 ? 'record' : 'records'}
                  </span>
                )}
              </div>
              <div className="mt-2 h-px bg-border/50" />
            </div>
          )}

          {activeNav === 'workflow' &&
            userRole !== 'editor' &&
            userRole !== 'administrator' && (
              <div
                className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-sm border text-xs"
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

          {activeNav === 'overview' && renderOverview()}
          {activeNav === 'workflow' && renderWorkflowBoard()}
          {activeNav === 'pipeline' && renderPipelineMap()}
          {(activeNav === 'all-stories' || activeNav === 'drafts' || activeNav === 'review') && renderAllStories()}
          {activeNav === 'editor-hub' && renderEditorHub()}
          {activeNav === 'my-assets' && renderMyAssets()}
          {activeNav === 'compensation' && renderCompensation()}
          {activeNav === 'horses' && renderHorseCRM()}
          {activeNav === 'parties' && renderPartiesCRM()}
          {activeNav === 'media-crm' && renderMediaCRM()}
          {activeNav === 'racing-crm' && renderRacingCRM()}
          {activeNav === 'team' && renderTeam()}
          {activeNav === 'bulletin-templates' && renderBulletinTemplates()}

          {activeNav === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Published', value: publishedCount, color: 'hsl(var(--primary))' },
                  { label: 'Scheduled', value: scheduledCount, color: 'hsl(var(--chart-1))' },
                  { label: 'Total Stories', value: totalStories, color: 'hsl(var(--brand-accent))' },
                  { label: 'In Pipeline', value: pendingReview, color: 'hsl(var(--chart-3))' },
                ].map((s) => (
                  <div key={s.label} className="p-4 border border-border/60 rounded-sm bg-card text-center">
                    <span className="block font-[family-name:var(--font-display)] text-3xl font-bold" style={{ color: s.color }}>
                      {s.value}
                    </span>
                    <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mt-1">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="border border-border/60 rounded-sm p-5 bg-card">
                <p className="text-sm text-muted-foreground text-center py-8 font-[family-name:var(--font-display)] italic">
                  Full analytics dashboard — connects to your analytics provider in production.
                </p>
              </div>
            </div>
          )}

          {activeNav === 'settings' && (
            <div className="max-w-lg space-y-5">
              {[
                { label: 'Publication Name', value: 'Stable Press', desc: 'Displayed across all editorial output' },
                { label: 'Default Category', value: 'Race Report', desc: 'Applied to new stories without a category' },
                { label: 'Legal Review Required', value: 'Yes', desc: 'All stories pass through legal before scheduling' },
                { label: 'Workflow Stages', value: '12', desc: 'From Draft through Bulletin Inclusion' },
              ].map((setting) => (
                <div key={setting.label} className="p-4 border border-border/60 rounded-sm bg-card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">{setting.label}</span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-sm"
                      style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
                    >
                      {setting.value}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{setting.desc}</p>
                </div>
              ))}
            </div>
          )}
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
      {renderMediaFormPanel()}

      {/* Racing form slide-over */}
      {renderRacingFormPanel()}
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

      {/* Full-screen Magazine Studio editor */}
      {editorMagId && (
        <MagazineEditor magazineId={editorMagId} onClose={() => setEditorMagId(null)} />
      )}
    </div>
  );
}

/* ── Editor Review Row ─────────────────────────────────── */

interface EditorReviewRowProps {
  article: Article;
  onPullToReview: () => void;
  onSendRevision: () => void;
  onEdit: () => void;
  actionLabel: string;
  actionColor: string;
  hideRevision?: boolean;
}

function EditorReviewRow({
  article,
  onPullToReview,
  onSendRevision,
  onEdit,
  actionLabel,
  actionColor,
  hideRevision = false,
}: EditorReviewRowProps) {
  return (
    <div className="px-4 py-3.5 flex items-start justify-between gap-4 hover:bg-muted/10 transition-colors flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground line-clamp-1">{article.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">{article.author}</span>
          {article.category && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[10px] text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-sm">
                {article.category}
              </span>
            </>
          )}
          {article.readingTime && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock size={9} />
                {article.readingTime}m
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button
          onClick={onEdit}
          className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-sm border border-border/50 hover:border-border"
        >
          Edit
        </button>
        {!hideRevision && (
          <button
            onClick={onSendRevision}
            className="text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-1 rounded-sm border transition-colors"
            style={{ color: '#e8a020', borderColor: 'rgba(232,160,32,0.3)', background: 'rgba(232,160,32,0.06)' }}
          >
            Send for Revision
          </button>
        )}
        <button
          onClick={onPullToReview}
          className="text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-1 rounded-sm border transition-colors"
          style={{ color: actionColor, borderColor: `${actionColor}40`, background: `${actionColor}10` }}
        >
          {actionLabel} →
        </button>
      </div>
    </div>
  );
}

/* ── Workflow flow bar ─────────────────────────────────── */

interface WorkflowFlowBarProps {
  buckets: Record<KanbanStatus, Article[]>;
  onStageClick: (status: KanbanStatus) => void;
  activeColumn: KanbanStatus;
  visibleStages: typeof WORKFLOW_STAGES;
}

function WorkflowFlowBar({ buckets, onStageClick, activeColumn, visibleStages }: WorkflowFlowBarProps) {
  return (
    <div className="relative">
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {visibleStages.map((stage, idx) => {
          const count = buckets[stage.status].length;
          const isActive = stage.status === activeColumn;
          const isRevision = stage.status === 'revision';
          return (
            <div key={stage.status} className="flex items-center">
              <button
                onClick={() => onStageClick(stage.status)}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-sm border transition-all min-w-[80px] text-center',
                  isActive
                    ? 'border-primary/40 bg-primary/8'
                    : isRevision
                    ? 'border-dashed border-border/50 bg-muted/20'
                    : 'border-border/40 bg-card hover:border-primary/25 hover:bg-muted/30'
                )}
                style={{
                  borderTopColor: isActive ? stage.accent : undefined,
                  borderTopWidth: isActive ? '2px' : undefined,
                }}
                aria-label={`Go to ${stage.label} column`}
              >
                <span style={{ color: isActive ? stage.accent : 'hsl(var(--muted-foreground))' }}>
                  {stage.icon}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{ color: isActive ? stage.accent : 'hsl(var(--foreground))' }}
                >
                  {count}
                </span>
                <span
                  className="text-[8px] uppercase tracking-[0.08em] leading-tight text-center"
                  style={{ color: isActive ? stage.accent : 'hsl(var(--muted-foreground))' }}
                >
                  {stage.label.replace(' ', '\n')}
                </span>
              </button>
              {idx < visibleStages.length - 1 && (
                <div className="flex items-center px-0.5">
                  <ChevronRight size={10} className="text-border flex-shrink-0" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Status badge ─────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; style?: React.CSSProperties }> = {
    draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
    submitted: { label: 'Submitted', className: 'bg-primary/10 text-primary' },
    editorial_review: { label: 'Editorial Review', className: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))]' },
    revision: { label: 'Revision', className: '', style: { background: 'rgba(232,160,32,0.15)', color: '#e8a020' } },
    legal_review: { label: 'Legal Review', className: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))]' },
    compliance: { label: 'Compliance', className: 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))]' },
    approved: { label: 'Approved', className: '', style: { background: 'rgba(93,168,84,0.15)', color: '#5da854' } },
    publisher_review: { label: 'Publisher Review', className: 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))]' },
    scheduled: { label: 'Scheduled', className: 'bg-primary/10 text-primary' },
    published: { label: 'Published', className: 'bg-primary text-primary-foreground' },
    newsletter: { label: 'Newsletter', className: 'bg-[hsl(var(--chart-1)/0.15)] text-[hsl(var(--chart-1))]' },
    bulletin: { label: 'Bulletin', className: 'bg-primary/20 text-primary' },
    archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
  };
  const c = config[status] ?? config['draft'];
  return (
    <span
      className={cn('text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap', c.className)}
      style={c.style}
    >
      {c.label}
    </span>
  );
}

/* ── Racing status badge ──────────────────────────────── */

function RacingStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string }> = {
    Entered:   { bg: 'hsl(var(--primary) / 0.12)', text: 'hsl(var(--primary))' },
    Accepted:  { bg: 'rgba(93,168,84,0.15)', text: '#5da854' },
    Scratched: { bg: 'hsl(var(--destructive) / 0.12)', text: 'hsl(var(--destructive))' },
    Declared:  { bg: 'hsl(var(--chart-2) / 0.15)', text: 'hsl(var(--chart-2))' },
    Finished:  { bg: 'hsl(var(--brand-accent) / 0.15)', text: 'hsl(var(--brand-accent))' },
  };
  const c = configs[status] ?? configs['Entered'];
  return (
    <span
      className="text-[9px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}
