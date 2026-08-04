import type { ReactNode } from 'react';
import {
  FileText, LayoutDashboard, CheckSquare, Shield, Send, Users, BarChart2,
  Settings, Eye, ArrowRight, BookOpen, Mic, Star, Edit, DollarSign, Image,
  File, UserCheck, CalendarClock, FolderOpen, Inbox, Layers, Newspaper, Flag,
  PenLine, Zap, SmilePlus,
} from 'lucide-react';
import type { ArticleStatus } from '@/types/article';
import type { PartyRole } from '@/types/party';
import type { MediaType } from '@/types/mediaItem';
import type { can } from '@/lib/permissions';

/* ── Role colour map (for party cards) ──────── */
export const ROLE_COLORS: Record<PartyRole, string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  trainer: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  jockey: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  breeder: 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  'bloodstock agent': 'bg-[hsl(var(--chart-5)/0.15)] text-[hsl(var(--chart-5))] border-[hsl(var(--chart-5)/0.3)]',
  'syndicate manager': 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent)/0.3)]',
  personnel: 'bg-muted text-muted-foreground border-border',
};

export const MEDIA_TYPE_ICONS: Record<MediaType, ReactNode> = {
  Article: <Newspaper size={11} />,
  Photo: <Image size={11} />,
  Video: <File size={11} />,
  'Press Release': <FileText size={11} />,
  Publication: <BookOpen size={11} />,
};

export const MEDIA_TYPE_COLORS: Record<MediaType, string> = {
  Article: 'bg-primary/10 text-primary border-primary/25',
  Photo: 'bg-[hsl(var(--chart-2)/0.15)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]',
  Video: 'bg-[hsl(var(--chart-3)/0.15)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]',
  'Press Release': 'bg-[hsl(var(--chart-4)/0.15)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.3)]',
  Publication: 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent)/0.3)]',
};


/* ── Role config REMOVED ───────────────────────────────────
 * The static `ROLES: RoleConfig[]` table (label/description/icon/colour plus
 * `allowedStatuses`), `getRoleConfig()` and `STAFF_ROLE_LABELS` all lived here.
 * Roles are database rows now:
 *   - label / colour / icon  → user.access.roles[]  (see lib/roleDisplay.tsx)
 *   - allowedStatuses        → user.access.workflowStages
 * `getRoleConfig()` in particular fell back to ROLES[0], so any role it didn't
 * recognise silently rendered as "Contributor".
 * ────────────────────────────────────────────────────────── */

/* ── Sidebar navigation ───────────────────────────────── */

/**
 * Base path for the production system. Every sidebar screen is a real route
 * under here — they used to be `activeNav` branches inside one 755-line page,
 * which meant no deep links, no back button, and no way to reach any of them
 * when the sidebar was hidden on a narrow viewport.
 *
 * `/newsroom` still redirects here (App.tsx) because staff-invite and
 * magazine-share emails already in people's inboxes point at the old path.
 */
export const PS_BASE = '/production-system';

export interface SideNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  section?: string;
  requiresPermission?: Parameters<typeof can>[0];
  editorOnly?: boolean;
  badge?: string;
  /**
   * URL segment under PS_BASE. Deliberately NOT always equal to `id`: role
   * permissions are stored in the database against the module `id`
   * (server MODULE_CATALOGUE), so ids are frozen, while two of them
   * ('media-production-system', 'racing-production-system') make for
   * unreadable URLs. RBAC keeps resolving on `id`; only the address bar
   * uses `slug`.
   */
  slug: string;
  /** Absolute route, for items that leave the sidebar's own screens. */
  href?: string;
}

/** Full path for a sidebar item. */
export function navPath(item: SideNavItem): string {
  return item.href ?? `${PS_BASE}/${item.slug}`;
}

export const SIDE_NAV: SideNavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} />, section: 'Workspace', slug: 'overview' },
  { id: 'workflow', label: 'Workflow Board', icon: <LayoutDashboard size={15} />, section: 'Workspace', slug: 'workflow' },
  { id: 'pipeline', label: 'Pipeline Map', icon: <ArrowRight size={15} />, section: 'Workspace', slug: 'pipeline' },
  { id: 'all-stories', label: 'All Stories', icon: <FileText size={15} />, section: 'Content', slug: 'all-stories' },
  { id: 'blogs', label: 'Blogs', icon: <PenLine size={15} />, section: 'Content', slug: 'blogs', requiresPermission: 'blog.create' },
  /* No `requiresPermission`: Instant's two modes need different permissions
     (content.draft.create for a story, blog.create for a post) and this row
     holds one. The screen gates each mode itself, so a blog-only author still
     gets the surface. Mirrors MODULE_CATALOGUE on the server. */
  { id: 'instant', label: 'Instant', icon: <Zap size={15} />, section: 'Content', slug: 'instant', badge: 'New' },
  // { id: 'drafts', label: 'Drafts', icon: <FileText size={15} />, section: 'Content' },
  // { id: 'review', label: 'In Review', icon: <Eye size={15} />, section: 'Content' },
  // {
  //   id: 'bulletin-templates',
  //   label: 'Magazine Studio',
  //   icon: <BookOpen size={15} />,
  //   section: 'Content',
  //   badge: 'New',
  // },

  {
    id: 'magazine-v2',
    label: 'Magazine Builder',
    icon: <Layers size={15} />,
    section: 'Content',
    slug: 'magazine-v2',
    href: `${PS_BASE}/magazine-v2`,
  },
  /* Podcast lived at /podcast/workflow inside the PUBLIC site chrome — the last
     staff surface outside the Campaign Engine, reachable only from a link in the
     account dropdown. `requiresPermission` here is decorative (the rail filters
     on the module list); the server's MODULE_CATALOGUE row is what decides which
     built-in roles get it. */
  { id: 'podcast', label: 'Podcast', icon: <Mic size={15} />, section: 'Content', slug: 'podcast', requiresPermission: 'podcast.read_all' },
  {
    id: 'editor-hub',
    label: 'Editor Hub',
    icon: <Edit size={15} />,
    section: 'Content',
    slug: 'editor-hub',
    requiresPermission: 'content.editorial_review',
    editorOnly: true,
  },
  { id: 'my-assets', label: 'My Media Assets', icon: <Image size={15} />, section: 'Content', slug: 'my-assets', requiresPermission: 'media.upload_own' },
  { id: 'compensation', label: 'My Compensation', icon: <DollarSign size={15} />, section: 'Content', slug: 'compensation', requiresPermission: 'compensation.view_own' },
  /* One naming rule across the four registers: name what the register holds.
     Horses and people are entities; media and racing entries are records. No
     "Management" — that's system-speak, not what anyone calls these screens. */
  { id: 'horses', label: 'Horses', icon: <Star size={15} />, section: 'Stables', slug: 'horses', requiresPermission: 'content.draft.create' },
  { id: 'parties', label: 'People', icon: <Users size={15} />, section: 'Stables', slug: 'people', requiresPermission: 'content.draft.create' },
  { id: 'media-production-system', label: 'Media Records', icon: <File size={15} />, section: 'Stables', slug: 'media-records', requiresPermission: 'content.draft.create' },
  { id: 'racing-production-system', label: 'Racing Records', icon: <Flag size={15} />, section: 'Stables', slug: 'racing-records', requiresPermission: 'content.draft.create' },
  { id: 'team', label: 'Team Members', icon: <Users size={15} />, section: 'Management', slug: 'team', requiresPermission: 'team.manage' },
  { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={15} />, section: 'Management', slug: 'roles', requiresPermission: 'roles.manage' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={15} />, section: 'Management', slug: 'analytics', requiresPermission: 'analytics.view' },
  /* Its own row rather than a tab inside Analytics: reader sentiment is a
     different question from production throughput, and it is the one screen an
     editor opens to decide what to commission next. Same permission — a role
     that can see the numbers can see all of them. */
  { id: 'emoji-analytics', label: 'Emoji Analytics', icon: <SmilePlus size={15} />, section: 'Management', slug: 'emoji-analytics', requiresPermission: 'analytics.view' },
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, section: 'Management', slug: 'settings', requiresPermission: 'settings.view' },
];

/**
 * Module id for a URL slug, or undefined if the slug isn't a known screen.
 *
 * `MAGAZINE_STUDIO_SLUG` / `MAGAZINE_STUDIO_MODULE` used to be special-cased here:
 * the v1 Magazine Studio was reached from Overview rather than the sidebar, so it
 * had a slug and a module id but no SIDE_NAV row. That builder is gone, and the
 * Magazine Builder has a real sidebar row, so every screen is now findable in one
 * place.
 */
export function moduleForSlug(slug: string): string | undefined {
  return SIDE_NAV.find((i) => i.slug === slug)?.id;
}

/**
 * Route for a module id. Used by the screens that used to call
 * `setActiveNav(...)` to move the user sideways (Overview's tiles, the
 * Compensation empty state, the dashboard cards).
 */
export function pathForModule(id: string): string {
  const item = SIDE_NAV.find((i) => i.id === id);
  return item ? navPath(item) : PS_BASE;
}

/* ── Editor Hub tab types ─────────────────────────────── */

export type EditorTab =
  | 'review-queue'
  | 'assignments'
  | 'scheduling'
  | 'media-library'
  | 'horse-records';

export interface EditorTabConfig {
  id: EditorTab;
  label: string;
  icon: ReactNode;
  description: string;
  permission: Parameters<typeof can>[0];
}

export const EDITOR_TABS: EditorTabConfig[] = [
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
