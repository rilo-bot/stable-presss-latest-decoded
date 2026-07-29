// ---------------------------------------------------------------------------
// THE permission catalogue — single source of truth for actions + modules.
//
// Before this file the matrix lived in three hand-mirrored copies (web
// lib/permissions.ts, server lib/permissions.ts, CONTENT_PERMS in rbac.ts) and
// had already drifted. Everything now derives from here; the web app fetches it
// over `GET /api/roles/catalogue` so the admin UI can render permission
// checkboxes without a redeploy when actions are added.
//
// Two axes an admin can tick:
//   ACTIONS  — capability ("may publish", "may approve an episode")
//   MODULES  — navigation surface ("can open the Analytics screen")
//
// See RBAC.md §4.4.
// ---------------------------------------------------------------------------

import type { StaffRole } from './identity.js'

// ── Actions ─────────────────────────────────────────────────────────────────

export type PermissionAction =
  // Content
  | 'content.draft.create'
  | 'content.draft.edit_own'
  | 'content.draft.edit_any'
  | 'content.submit'
  | 'content.editorial_review'
  | 'content.send_revision'
  | 'content.legal_review'
  | 'content.compliance'
  | 'content.approve'
  | 'content.publisher_review'
  | 'content.schedule'
  | 'content.publish'
  | 'content.newsletter'
  | 'content.bulletin'
  // Media
  | 'media.upload_own'
  | 'media.manage_all'
  // Compensation
  | 'compensation.view_own'
  | 'compensation.view_all'
  | 'compensation.manage'
  // Workflow board
  | 'workflow.view_all_columns'
  | 'workflow.view_own_columns'
  // Team & admin
  | 'team.view'
  | 'team.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'analytics.view'
  // Podcast
  | 'podcast.manage'
  | 'podcast.episode.create'
  | 'podcast.episode.edit_own'
  | 'podcast.episode.edit_any'
  | 'podcast.audio.upload'
  | 'podcast.guests.manage'
  | 'podcast.episode.schedule'
  | 'podcast.episode.submit_review'
  | 'podcast.episode.approve'
  | 'podcast.episode.publish'
  | 'podcast.distribution.manage'
  | 'podcast.episode.delete'
  | 'podcast.read_all'

export interface PermissionMeta {
  id: PermissionAction
  label: string
  group: string
  description: string
}

/** Every grantable action, grouped the way the admin checkbox UI renders them. */
export const PERMISSION_CATALOGUE: PermissionMeta[] = [
  // Content
  { id: 'content.draft.create', label: 'Create drafts', group: 'Content', description: 'Start a new story draft.' },
  { id: 'content.draft.edit_own', label: 'Edit own drafts', group: 'Content', description: 'Edit stories they authored.' },
  { id: 'content.draft.edit_any', label: 'Edit any story', group: 'Content', description: 'Edit stories written by anyone.' },
  { id: 'content.submit', label: 'Submit for review', group: 'Content', description: 'Push a draft into the editorial queue.' },
  { id: 'content.editorial_review', label: 'Editorial review', group: 'Content', description: 'Move stories in and out of editorial review.' },
  { id: 'content.send_revision', label: 'Send back for revision', group: 'Content', description: 'Return a story to its author.' },
  { id: 'content.legal_review', label: 'Legal review', group: 'Content', description: 'Move stories through legal review.' },
  { id: 'content.compliance', label: 'Compliance', group: 'Content', description: 'Move stories into the compliance stage.' },
  { id: 'content.approve', label: 'Approve content', group: 'Content', description: 'Approve a story for publication.' },
  { id: 'content.publisher_review', label: 'Publisher review', group: 'Content', description: 'Run the publisher review stage.' },
  { id: 'content.schedule', label: 'Schedule publication', group: 'Content', description: 'Set a future publish date.' },
  { id: 'content.publish', label: 'Publish', group: 'Content', description: 'Push a story live.' },
  { id: 'content.newsletter', label: 'Send to newsletter', group: 'Content', description: 'Distribute a story via newsletter.' },
  { id: 'content.bulletin', label: 'Add to bulletin', group: 'Content', description: 'Include a story in a bulletin issue.' },

  // Media
  { id: 'media.upload_own', label: 'Upload own media', group: 'Media', description: 'Upload and manage personal media assets.' },
  { id: 'media.manage_all', label: 'Manage all media', group: 'Media', description: 'Manage the full shared media library.' },

  // Compensation
  { id: 'compensation.view_own', label: 'View own payouts', group: 'Compensation', description: 'See their own payout history.' },
  { id: 'compensation.view_all', label: 'View all payouts', group: 'Compensation', description: "See every contributor's payouts." },
  { id: 'compensation.manage', label: 'Manage payouts', group: 'Compensation', description: 'Edit and approve payouts.' },

  // Workflow
  { id: 'workflow.view_all_columns', label: 'See all board columns', group: 'Workflow', description: 'View every Kanban column.' },
  { id: 'workflow.view_own_columns', label: 'See own board columns', group: 'Workflow', description: 'View only role-scoped columns.' },

  // Team & admin
  { id: 'team.view', label: 'View team', group: 'Team & Admin', description: 'See the staff roster.' },
  { id: 'team.manage', label: 'Manage team & roles', group: 'Team & Admin', description: 'Invite staff, create roles, assign permissions.' },
  { id: 'settings.view', label: 'View settings', group: 'Team & Admin', description: 'Open newsroom settings.' },
  { id: 'settings.manage', label: 'Edit settings', group: 'Team & Admin', description: 'Change newsroom settings.' },
  { id: 'analytics.view', label: 'View analytics', group: 'Team & Admin', description: 'Open the analytics dashboard.' },

  // Podcast
  { id: 'podcast.manage', label: 'Manage podcast', group: 'Podcast', description: 'Broad podcast management.' },
  { id: 'podcast.episode.create', label: 'Create episodes', group: 'Podcast', description: 'Start a new episode draft.' },
  { id: 'podcast.episode.edit_own', label: 'Edit own episodes', group: 'Podcast', description: 'Edit episodes they produced.' },
  { id: 'podcast.episode.edit_any', label: 'Edit any episode', group: 'Podcast', description: 'Edit episodes produced by anyone.' },
  { id: 'podcast.audio.upload', label: 'Upload audio', group: 'Podcast', description: 'Attach audio files to an episode.' },
  { id: 'podcast.guests.manage', label: 'Manage guests', group: 'Podcast', description: 'Add and remove episode guests.' },
  { id: 'podcast.episode.schedule', label: 'Schedule episodes', group: 'Podcast', description: 'Set an episode publish date.' },
  { id: 'podcast.episode.submit_review', label: 'Submit episode for review', group: 'Podcast', description: 'Send an episode for approval.' },
  { id: 'podcast.episode.approve', label: 'Approve episodes', group: 'Podcast', description: 'Approve or return an episode.' },
  { id: 'podcast.episode.publish', label: 'Publish episodes', group: 'Podcast', description: 'Push an episode live.' },
  { id: 'podcast.distribution.manage', label: 'Manage distribution', group: 'Podcast', description: 'Toggle per-episode distribution channels.' },
  { id: 'podcast.episode.delete', label: 'Delete episodes', group: 'Podcast', description: 'Delete a draft or unpublished episode.' },
  { id: 'podcast.read_all', label: 'See unpublished episodes', group: 'Podcast', description: 'View drafts, not just published episodes.' },
]

const ACTION_IDS = new Set<string>(PERMISSION_CATALOGUE.map((p) => p.id))

export function isPermissionAction(v: unknown): v is PermissionAction {
  return typeof v === 'string' && ACTION_IDS.has(v)
}

// ── Modules (navigation surfaces) ───────────────────────────────────────────

export interface ModuleMeta {
  id: string
  label: string
  section: string
  /**
   * The action the built-in matrix uses to decide visibility. `undefined` means
   * every staff member sees it today. Custom roles ignore this and use their own
   * explicit module list — it exists so built-in roles keep their exact current
   * navigation without a second hand-maintained table.
   */
  requiresPermission?: PermissionAction
}

/** Mirrors SIDE_NAV + EDITOR_TABS in apps/web/src/pages/newsroom/constants.tsx. */
export const MODULE_CATALOGUE: ModuleMeta[] = [
  { id: 'overview', label: 'Overview', section: 'Workspace' },
  { id: 'workflow', label: 'Workflow Board', section: 'Workspace' },
  { id: 'pipeline', label: 'Pipeline Map', section: 'Workspace' },
  { id: 'all-stories', label: 'All Stories', section: 'Content' },
  { id: 'magazine-v2', label: 'Magazine Builder', section: 'Content' },
  { id: 'editor-hub', label: 'Editor Hub', section: 'Content', requiresPermission: 'content.editorial_review' },
  { id: 'my-assets', label: 'My Media Assets', section: 'Content', requiresPermission: 'media.upload_own' },
  { id: 'compensation', label: 'My Compensation', section: 'Content', requiresPermission: 'compensation.view_own' },
  { id: 'horses', label: 'Horses Management', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'parties', label: 'People Management', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'media-production-system', label: 'Media Records', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'racing-production-system', label: 'Racing Data', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'team', label: 'Team Members', section: 'Management', requiresPermission: 'team.manage' },
  { id: 'roles', label: 'Roles & Permissions', section: 'Management', requiresPermission: 'team.manage' },
  { id: 'analytics', label: 'Analytics', section: 'Management', requiresPermission: 'analytics.view' },
  { id: 'settings', label: 'Settings', section: 'Management', requiresPermission: 'settings.view' },

  // Editor Hub tabs — gated the same way, one level down.
  { id: 'review-queue', label: 'Review Queue', section: 'Editor Hub', requiresPermission: 'content.editorial_review' },
  { id: 'assignments', label: 'Assignments', section: 'Editor Hub', requiresPermission: 'content.draft.edit_any' },
  { id: 'approval-routing', label: 'Approval Routing', section: 'Editor Hub', requiresPermission: 'content.approve' },
  { id: 'scheduling', label: 'Scheduling', section: 'Editor Hub', requiresPermission: 'content.schedule' },
  { id: 'media-library', label: 'Media Library', section: 'Editor Hub', requiresPermission: 'media.manage_all' },
  { id: 'horse-records', label: 'Horse Records', section: 'Editor Hub', requiresPermission: 'media.manage_all' },
]

const MODULE_IDS = new Set<string>(MODULE_CATALOGUE.map((m) => m.id))

export function isModuleId(v: unknown): v is string {
  return typeof v === 'string' && MODULE_IDS.has(v)
}

// ── Built-in role matrix ────────────────────────────────────────────────────
//
// The merge of what web lib/permissions.ts and server lib/permissions.ts each
// held. `podcast.read_all` came only from the server copy; everything else came
// from the web copy, which was the fuller of the two.

export const BUILTIN_ROLE_PERMISSIONS: Record<StaffRole, PermissionAction[]> = {
  contributor: [
    'content.draft.create',
    'content.draft.edit_own',
    'content.submit',
    'media.upload_own',
    'compensation.view_own',
    'workflow.view_own_columns',
  ],

  editor: [
    'content.draft.create',
    'content.draft.edit_own',
    'content.draft.edit_any',
    'content.submit',
    'content.editorial_review',
    'content.send_revision',
    'content.legal_review',
    'content.compliance',
    'content.approve',
    'content.publisher_review',
    'content.schedule',
    'content.publish',
    'content.newsletter',
    'content.bulletin',
    'media.upload_own',
    'media.manage_all',
    'compensation.view_all',
    'workflow.view_all_columns',
    'team.view',
    'analytics.view',
    'settings.view',
    'podcast.episode.edit_any',
    'podcast.episode.approve',
    'podcast.episode.publish',
    'podcast.distribution.manage',
    'podcast.read_all',
  ],

  legal_reviewer: [
    'content.draft.edit_any',
    'content.legal_review',
    'content.compliance',
    'content.approve',
    'media.upload_own',
    'workflow.view_own_columns',
    'analytics.view',
  ],

  podcast_producer: [
    'podcast.manage',
    'podcast.episode.create',
    'podcast.episode.edit_own',
    'podcast.audio.upload',
    'podcast.guests.manage',
    'podcast.episode.schedule',
    'podcast.episode.submit_review',
    'podcast.distribution.manage',
    'podcast.episode.delete',
    'podcast.read_all',
    'media.upload_own',
    'media.manage_all',
    'workflow.view_own_columns',
    'analytics.view',
  ],

  publisher: [
    'content.draft.edit_any',
    'content.approve',
    'content.publisher_review',
    'content.schedule',
    'content.publish',
    'content.newsletter',
    'content.bulletin',
    'media.manage_all',
    'compensation.view_all',
    'compensation.manage',
    'workflow.view_all_columns',
    'team.view',
    'analytics.view',
    'settings.view',
    'settings.manage',
    'podcast.episode.approve',
    'podcast.episode.publish',
    'podcast.distribution.manage',
    'podcast.read_all',
  ],

  // Administrator holds everything, always. Derived rather than listed so a new
  // action can never be accidentally withheld from admins.
  administrator: PERMISSION_CATALOGUE.map((p) => p.id),
}

export const BUILTIN_ROLE_LABELS: Record<StaffRole, string> = {
  contributor: 'Contributor',
  editor: 'Editor',
  legal_reviewer: 'Legal Reviewer',
  podcast_producer: 'Podcast Producer',
  publisher: 'Publisher',
  administrator: 'Administrator',
}

/**
 * Modules a built-in role sees — derived from the module's `requiresPermission`
 * so this exactly reproduces today's sidebar filtering. Custom roles do NOT go
 * through here; they carry an explicit, admin-ticked module list.
 */
export function builtinModulesFor(role: StaffRole): string[] {
  const held = new Set<string>(BUILTIN_ROLE_PERMISSIONS[role])
  return MODULE_CATALOGUE.filter((m) => !m.requiresPermission || held.has(m.requiresPermission)).map(
    (m) => m.id,
  )
}
