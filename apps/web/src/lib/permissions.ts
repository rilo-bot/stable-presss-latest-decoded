/**
 * Stable Press — Role Permission System
 *
 * Single source of truth for what each role is allowed to do.
 * Import `can(role, action)` anywhere in the UI to gate features.
 */

import type { UserRole } from '@/stores/authStore';

// ── Action catalogue ────────────────────────────────────────────────────────

export type PermissionAction =
  // Content
  | 'content.draft.create'          // Create a new draft
  | 'content.draft.edit_own'        // Edit own drafts only
  | 'content.draft.edit_any'        // Edit any article
  | 'content.submit'                // Submit draft → editorial queue
  | 'content.editorial_review'      // Move into / out of editorial review
  | 'content.send_revision'         // Send article back for revision
  | 'content.legal_review'          // Move into / out of legal review
  | 'content.compliance'            // Move into compliance stage
  | 'content.approve'               // Approve content
  | 'content.publisher_review'      // Publisher review stage
  | 'content.schedule'              // Schedule for publication
  | 'content.publish'               // Publish content
  | 'content.newsletter'            // Distribute via newsletter
  | 'content.bulletin'              // Add to bulletin

  // Media
  | 'media.upload_own'              // Upload / manage personal media assets
  | 'media.manage_all'              // Manage all media assets

  // Compensation
  | 'compensation.view_own'         // View own payout history
  | 'compensation.view_all'         // View all contributors' payouts
  | 'compensation.manage'           // Edit/approve payouts

  // Workflow board visibility
  | 'workflow.view_all_columns'     // See every Kanban column
  | 'workflow.view_own_columns'     // See only role-scoped columns

  // Team & admin
  | 'team.view'                     // View team member list
  | 'team.manage'                   // Invite / remove team members
  | 'settings.view'                 // View newsroom settings
  | 'settings.manage'               // Edit newsroom settings
  | 'analytics.view'                // View analytics dashboard

  // ── Podcast workflow permissions ──────────────────────────────────────────
  | 'podcast.manage'                // Broad podcast management (admin shorthand)
  | 'podcast.episode.create'        // Create a new episode draft
  | 'podcast.episode.edit_own'      // Edit own episode drafts
  | 'podcast.episode.edit_any'      // Edit any episode (editors / admins)
  | 'podcast.audio.upload'          // Upload / attach audio file to episode
  | 'podcast.guests.manage'         // Add / remove guests on an episode
  | 'podcast.episode.schedule'      // Set a publish date (move → Scheduled)
  | 'podcast.episode.submit_review' // Submit episode for approval
  | 'podcast.episode.approve'       // Approve an episode (move → Published)
  | 'podcast.episode.publish'       // Publish episode & push to channels
  | 'podcast.distribution.manage'   // Toggle distribution channels per episode
  | 'podcast.episode.delete';       // Delete a draft or unpublished episode

// ── Permission matrix ───────────────────────────────────────────────────────

const PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  contributor: [
    'content.draft.create',
    'content.draft.edit_own',
    'content.submit',
    'media.upload_own',
    'compensation.view_own',
    'workflow.view_own_columns',
  ],

  editor: [
    // Article workflow
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
    // Media
    'media.upload_own',
    'media.manage_all',
    // Compensation & access
    'compensation.view_all',
    'workflow.view_all_columns',
    'team.view',
    'analytics.view',
    'settings.view',
    // Podcast — editors can approve & oversee
    'podcast.episode.edit_any',
    'podcast.episode.approve',
    'podcast.episode.publish',
    'podcast.distribution.manage',
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
    // Podcast — full production workflow
    'podcast.manage',
    'podcast.episode.create',
    'podcast.episode.edit_own',
    'podcast.audio.upload',
    'podcast.guests.manage',
    'podcast.episode.schedule',
    'podcast.episode.submit_review',
    'podcast.distribution.manage',
    'podcast.episode.delete',
    // Media for audio & cover art
    'media.upload_own',
    'media.manage_all',
    // Visibility
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
    // Podcast — publish authority
    'podcast.episode.approve',
    'podcast.episode.publish',
    'podcast.distribution.manage',
  ],

  administrator: [
    // Article workflow — all
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
    // Media — all
    'media.upload_own',
    'media.manage_all',
    // Compensation — all
    'compensation.view_own',
    'compensation.view_all',
    'compensation.manage',
    // Team & settings — all
    'workflow.view_all_columns',
    'team.view',
    'team.manage',
    'analytics.view',
    'settings.view',
    'settings.manage',
    // Podcast — all
    'podcast.manage',
    'podcast.episode.create',
    'podcast.episode.edit_own',
    'podcast.episode.edit_any',
    'podcast.audio.upload',
    'podcast.guests.manage',
    'podcast.episode.schedule',
    'podcast.episode.submit_review',
    'podcast.episode.approve',
    'podcast.episode.publish',
    'podcast.distribution.manage',
    'podcast.episode.delete',
  ],
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 * Safely handles null/undefined role by returning false.
 */
export function can(
  role: UserRole | null | undefined,
  action: PermissionAction
): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(action) ?? false;
}

/**
 * Check multiple permissions — returns true if ALL are satisfied.
 */
export function canAll(
  role: UserRole | null | undefined,
  actions: PermissionAction[]
): boolean {
  return actions.every((a) => can(role, a));
}

/**
 * Check multiple permissions — returns true if ANY is satisfied.
 */
export function canAny(
  role: UserRole | null | undefined,
  actions: PermissionAction[]
): boolean {
  return actions.some((a) => can(role, a));
}

/**
 * Human-readable permission summary for a role.
 */
export function getRolePermissionSummary(role: UserRole): {
  canCreate: boolean;
  canEditAny: boolean;
  canPublish: boolean;
  canManageTeam: boolean;
  canViewCompensation: boolean;
  canManageMedia: boolean;
  canManagePodcast: boolean;
  canProducePodcast: boolean;
  canApprovePodcast: boolean;
} {
  return {
    canCreate: can(role, 'content.draft.create'),
    canEditAny: can(role, 'content.draft.edit_any'),
    canPublish: can(role, 'content.publish'),
    canManageTeam: can(role, 'team.manage'),
    canViewCompensation: canAny(role, ['compensation.view_own', 'compensation.view_all']),
    canManageMedia: can(role, 'media.manage_all'),
    canManagePodcast: can(role, 'podcast.manage'),
    canProducePodcast: can(role, 'podcast.episode.create'),
    canApprovePodcast: can(role, 'podcast.episode.approve'),
  };
}

// ── Contributor-specific helpers ────────────────────────────────────────────

/**
 * Returns true if the current user can edit a specific article.
 * Contributors can only edit their own; editors/admins/publishers can edit any.
 */
export function canEditArticle(
  role: UserRole | null | undefined,
  articleAuthor: string,
  currentUserDisplayName: string | null | undefined
): boolean {
  if (!role) return false;
  if (can(role, 'content.draft.edit_any')) return true;
  if (can(role, 'content.draft.edit_own')) {
    return articleAuthor === currentUserDisplayName;
  }
  return false;
}

/**
 * Returns true if the current user can edit a specific podcast episode.
 * Podcast producers can edit their own; editors/admins can edit any.
 */
export function canEditEpisode(
  role: UserRole | null | undefined,
  episodeProducer: string | undefined,
  currentUserDisplayName: string | null | undefined
): boolean {
  if (!role) return false;
  if (can(role, 'podcast.episode.edit_any')) return true;
  if (can(role, 'podcast.episode.edit_own')) {
    return episodeProducer === currentUserDisplayName;
  }
  return false;
}

// ── Podcast workflow helpers ─────────────────────────────────────────────────

/**
 * Returns the allowed next statuses the role can move an episode to.
 */
export type EpisodeStatus =
  | 'draft'
  | 'audio_uploaded'
  | 'guests_added'
  | 'description_written'
  | 'scheduled'
  | 'in_review'
  | 'published';

export function allowedNextStatuses(
  role: UserRole | null | undefined,
  currentStatus: EpisodeStatus
): EpisodeStatus[] {
  if (!role) return [];

  const transitions: Record<EpisodeStatus, { status: EpisodeStatus; permission: PermissionAction }[]> = {
    draft: [
      { status: 'audio_uploaded', permission: 'podcast.audio.upload' },
    ],
    audio_uploaded: [
      { status: 'guests_added', permission: 'podcast.guests.manage' },
    ],
    guests_added: [
      { status: 'description_written', permission: 'podcast.episode.edit_own' },
    ],
    description_written: [
      { status: 'scheduled', permission: 'podcast.episode.schedule' },
    ],
    scheduled: [
      { status: 'in_review', permission: 'podcast.episode.submit_review' },
    ],
    in_review: [
      { status: 'published', permission: 'podcast.episode.approve' },
      { status: 'scheduled', permission: 'podcast.episode.approve' }, // send back
    ],
    published: [], // terminal
  };

  return transitions[currentStatus]
    .filter((t) => can(role, t.permission))
    .map((t) => t.status);
}
