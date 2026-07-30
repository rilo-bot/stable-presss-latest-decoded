import type { ReactNode } from 'react';
import {
  FileText, LayoutDashboard, CheckSquare, Shield, Send, Users, BarChart2,
  Settings, Eye, ArrowRight, BookOpen, Mic, Star, Edit, DollarSign, Image,
  File, UserCheck, CalendarClock, FolderOpen, Inbox, Layers, Newspaper, Flag,
} from 'lucide-react';
import type { KanbanStatus } from '@/components/KanbanColumn';
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

export interface SideNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  section?: string;
  requiresPermission?: Parameters<typeof can>[0];
  editorOnly?: boolean;
  badge?: string;
  /** When set, the item navigates to this route instead of switching in-page tabs. */
  href?: string;
}

export const SIDE_NAV: SideNavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} />, section: 'Workspace' },
  { id: 'workflow', label: 'Workflow Board', icon: <LayoutDashboard size={15} />, section: 'Workspace' },
  { id: 'pipeline', label: 'Pipeline Map', icon: <ArrowRight size={15} />, section: 'Workspace' },
  { id: 'all-stories', label: 'All Stories', icon: <FileText size={15} />, section: 'Content' },
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
    href: '/newsroom/magazine-v2',
    badge: 'v2',
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
  { id: 'horses', label: 'Horses Management', icon: <Star size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'parties', label: 'People Management', icon: <Users size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'media-production-system', label: 'Media Records ', icon: <File size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'racing-production-system', label: 'Racing Data ', icon: <Flag size={15} />, section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'team', label: 'Team Members', icon: <Users size={15} />, section: 'Management', requiresPermission: 'team.manage' },
  { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={15} />, section: 'Management', requiresPermission: 'roles.manage' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={15} />, section: 'Management', requiresPermission: 'analytics.view' },
  { id: 'settings', label: 'Settings', icon: <Settings size={15} />, section: 'Management', requiresPermission: 'settings.view' },
];

/* ── Editor Hub tab types ─────────────────────────────── */

export type EditorTab =
  | 'review-queue'
  | 'assignments'
  | 'approval-routing'
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
