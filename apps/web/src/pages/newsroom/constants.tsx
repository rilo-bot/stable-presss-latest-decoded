import type { ReactNode } from 'react';
import {
  FileText, LayoutDashboard, CheckSquare, Shield, Send, Users, BarChart2,
  Settings, Eye, ArrowRight, BookOpen, Mic, Star, Edit, DollarSign, Image,
  File, UserCheck, CalendarClock, FolderOpen, Inbox, Layers, Newspaper, Flag,
  PenLine, Zap, SmilePlus, MessageSquare,
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
   * URL segment under PS_BASE. Usually equal to `id` now — the ids ARE the
   * permission prefixes (`<id>.view` opens this row), so they were renamed to
   * read well in both places. `slug` survives for the two rows whose URL and id
   * still differ.
   */
  slug: string;
  /** Absolute route, for items that leave the sidebar's own screens. */
  href?: string;
}

/** Full path for a sidebar item. */
export function navPath(item: SideNavItem): string {
  return item.href ?? `${PS_BASE}/${item.slug}`;
}

/**
 * THE SIDEBAR IS THE PERMISSION GRID.
 *
 * One row per screen, and `requiresPermission` is always that row's own
 * `<id>.view` — which is also the row the Roles console draws. There is no
 * separate module list to keep in step any more: the server derives
 * `access.modules` from exactly these `.view` ids, so a nav entry and the
 * permission that opens it cannot disagree.
 *
 * SIX SECTIONS, and the grouping is the product's, not the code's:
 *   Workspace  Overview — the general tab, no permission, everyone lands here
 *   Stories    the news pipeline and the three lenses onto it. Only this — a
 *              story moves through five stages, which is what these are for
 *   Content    the other things the newsroom makes: blogs, instant captures,
 *              magazine editions, podcast episodes
 *   Stables    the four registers
 *   Community  reader-facing signal — moderation and sentiment
 *   Management the admin desk
 *   Personal   your own things. No permission: they only ever show YOUR files
 *              and YOUR payouts, so gating them would be theatre.
 *
 * `section` is DERIVED into the rail's group order (ProductionSystemNav) and
 * into the Roles console's row groups (via the server's SCREEN_CATALOGUE), so
 * the order here is the order in both places.
 *
 * Ids match the server's SCREEN_CATALOGUE, including the two renamed for
 * readability ('media-production-system' → 'media-records',
 * 'racing-production-system' → 'racing-records'); the migration rewrites stored
 * role rows, and `slug` still carries any URL that differs.
 */
export const SIDE_NAV: SideNavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} />, section: 'Workspace', slug: 'overview' },

  // ── Stories ───────────────────────────────────────────────────────────────
  { id: 'stories', label: 'All Stories', icon: <FileText size={15} />, section: 'Stories', slug: 'all-stories', requiresPermission: 'stories.view' },
  { id: 'workflow', label: 'Workflow Board', icon: <LayoutDashboard size={15} />, section: 'Stories', slug: 'workflow', requiresPermission: 'workflow.view' },
  { id: 'pipeline', label: 'Pipeline Map', icon: <ArrowRight size={15} />, section: 'Stories', slug: 'pipeline', requiresPermission: 'pipeline.view' },
  {
    id: 'editor-hub',
    label: 'Editor Hub',
    icon: <Edit size={15} />,
    section: 'Stories',
    slug: 'editor-hub',
    requiresPermission: 'editor-hub.view',
    editorOnly: true,
  },
  // ── Content ───────────────────────────────────────────────────────────────
  /* The other things the newsroom makes. Apart from Stories because a story
     moves through a five-stage pipeline and these do not: a post is draft or
     live, an edition is built and shared, an episode is produced. */
  { id: 'blogs', label: 'Blogs', icon: <PenLine size={15} />, section: 'Content', slug: 'blogs', requiresPermission: 'blogs.view' },
  /* Instant is a LENS: it opens with its own view, but saving is checked against
     Stories Create or Blogs Create depending on where the capture is filed. The
     screen must not become a way around the permission that governs the work. */
  { id: 'instant', label: 'Instant Capture', icon: <Zap size={15} />, section: 'Content', slug: 'instant', requiresPermission: 'instant.view', badge: 'New' },
  {
    id: 'magazine',
    label: 'Magazine Builder',
    icon: <Layers size={15} />,
    section: 'Content',
    slug: 'magazine-v2',
    href: `${PS_BASE}/magazine-v2`,
    requiresPermission: 'magazine.view',
  },
  /* Podcast lived at /podcast/workflow inside the PUBLIC site chrome — the last
     staff surface outside the Campaign Engine, reachable only from a link in the
     account dropdown. */
  { id: 'podcast', label: 'Podcast', icon: <Mic size={15} />, section: 'Content', slug: 'podcast', requiresPermission: 'podcast.view' },

  // ── Stables ───────────────────────────────────────────────────────────────
  /* One naming rule across the four registers: name what the register holds.
     Horses and people are entities; media and racing entries are records. No
     "Management" — that's system-speak, not what anyone calls these screens. */
  { id: 'horses', label: 'Horses', icon: <Star size={15} />, section: 'Stables', slug: 'horses', requiresPermission: 'horses.view' },
  { id: 'people', label: 'People', icon: <Users size={15} />, section: 'Stables', slug: 'people', requiresPermission: 'people.view' },
  { id: 'media-records', label: 'Media Records', icon: <File size={15} />, section: 'Stables', slug: 'media-records', requiresPermission: 'media-records.view' },
  { id: 'racing-records', label: 'Racing Records', icon: <Flag size={15} />, section: 'Stables', slug: 'racing-records', requiresPermission: 'racing-records.view' },

  // ── Community ─────────────────────────────────────────────────────────────
  /* Moderation and sentiment together: both are the readers talking back, and an
     editor works them in the same sitting. */
  { id: 'comments', label: 'Comments', icon: <MessageSquare size={15} />, section: 'Community', slug: 'comments', requiresPermission: 'comments.view' },
  { id: 'emoji-analytics', label: 'Emoji Analytics', icon: <SmilePlus size={15} />, section: 'Community', slug: 'emoji-analytics', requiresPermission: 'emoji-analytics.view' },

  // ── Management ────────────────────────────────────────────────────────────
  { id: 'team', label: 'Team Members', icon: <Users size={15} />, section: 'Management', slug: 'team', requiresPermission: 'team.view' },
  { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={15} />, section: 'Management', slug: 'roles', requiresPermission: 'roles.view' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={15} />, section: 'Management', slug: 'analytics', requiresPermission: 'analytics.view' },
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, section: 'Management', slug: 'settings', requiresPermission: 'settings.view' },

  // ── Personal ──────────────────────────────────────────────────────────────
  { id: 'my-assets', label: 'My Media Assets', icon: <Image size={15} />, section: 'Personal', slug: 'my-assets' },
  { id: 'compensation', label: 'My Compensation', icon: <DollarSign size={15} />, section: 'Personal', slug: 'compensation' },
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
    permission: 'stories.edit',
  },
  {
    id: 'assignments',
    label: 'Assignments',
    icon: <UserCheck size={14} />,
    description: 'Content assignment & modification',
    permission: 'stories.edit',
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: <CalendarClock size={14} />,
    description: 'Scheduled publishing capabilities',
    permission: 'stories.publish',
  },
  {
    id: 'media-library',
    label: 'Media Library',
    icon: <FolderOpen size={14} />,
    description: 'Full media asset management',
    permission: 'media-records.edit',
  },
  {
    id: 'horse-records',
    label: 'Horse Records',
    icon: <File size={14} />,
    description: 'Sales & document records for horse profiles',
    permission: 'media-records.edit',
  },
];
