/**
 * Stable Press — Role Permission System
 *
 * `can(action)` is the gate every UI affordance goes through.
 *
 * THERE IS NO LOCAL ROLE MATRIX. Roles are rows in a database that a superadmin
 * edits at runtime, so the client cannot know what a role grants — it can only
 * be told. Every answer comes from `currentUser.access`, which the server
 * resolves as the union across every role the user holds.
 *
 * Consequences worth knowing:
 *   - `can()` takes only an action. It used to take a role as well, which was
 *     the single highest-ranked one — so a user holding podcast_producer +
 *     editor silently lost every producer-only permission.
 *   - No access payload means NO permissions. Fails closed by construction.
 *   - This is a UI-affordance gate, never a security boundary. The server
 *     enforces the same permissions independently on every route.
 *
 * Reactivity: call sites read `currentUser` from the store and so re-render
 * when the session refreshes. `useCan` subscribes explicitly and is preferred
 * in new code.
 */

import { useAuthStore } from '@/stores/authStore';

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

  // Platform access — replace the old hardcoded role-family tests.
  | 'newsroom.access'               // Reach newsroom tooling (was: holds any staff role)
  | 'platform.admin'                // Platform-wide override (was: is administrator)
  | 'roles.manage'                  // Create roles, set permissions, assign them

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
  | 'podcast.episode.delete'        // Delete a draft or unpublished episode
  | 'podcast.read_all';             // See unpublished episodes, not just live ones

// The local role→permission matrix that used to live here is GONE. Roles are
// rows in the database now, so the only correct answer comes from the server-
// resolved set on the session (see authStore.ResolvedAccess).


// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Does the signed-in user hold this permission?
 *
 * Answered ENTIRELY from `currentUser.access`, the set the server resolved by
 * unioning every role the user holds. There is no client-side fallback: a role
 * is a database row, so guessing locally could only ever be wrong. No access
 * payload means no permissions — fail closed.
 */
export function can(action: PermissionAction): boolean {
  const access = useAuthStore.getState().currentUser?.access;
  return access ? access.permissions.includes(action) : false;
}

/** Reactive form of `can()` — subscribes, so the UI updates when a role changes. */
export function useCan(action: PermissionAction): boolean {
  return useAuthStore((s) => s.currentUser?.access?.permissions.includes(action) ?? false);
}

/**
 * May the user open this navigation surface? Modules are the coarse axis a
 * superadmin ticks per role; actions are the fine one. Fails closed.
 */
export function canOpenModule(moduleId: string): boolean {
  const access = useAuthStore.getState().currentUser?.access;
  return access ? access.modules.includes(moduleId) : false;
}

/** Kanban columns this user may see — the third axis, was `allowedStatuses`. */
export function visibleWorkflowStages(): string[] {
  return useAuthStore.getState().currentUser?.access?.workflowStages ?? [];
}

/** Unrestricted access. For badges only — enforcement is always server-side. */
export function isSuperAdmin(): boolean {
  return useAuthStore.getState().currentUser?.access?.isSuperAdmin === true;
}

/** True if ALL the given permissions are held. */
export function canAll(actions: PermissionAction[]): boolean {
  return actions.every(can);
}

/** True if ANY of the given permissions are held. */
export function canAny(actions: PermissionAction[]): boolean {
  return actions.some(can);
}

// ── Ownership-scoped helpers ────────────────────────────────────────────────

/**
 * Can the user edit this specific article? `edit_any` wins outright; otherwise
 * `edit_own` requires the byline to match.
 */
export function canEditArticle(
  articleAuthor: string,
  currentUserDisplayName: string | null | undefined
): boolean {
  if (can('content.draft.edit_any')) return true;
  if (can('content.draft.edit_own')) {
    return articleAuthor === currentUserDisplayName;
  }
  return false;
}

/**
 * Returns true if the current user can edit a specific podcast episode.
 * Podcast producers can edit their own; editors/admins can edit any.
 */
export function canEditEpisode(
  episodeProducer: string | undefined,
  currentUserDisplayName: string | null | undefined
): boolean {
  if (can('podcast.episode.edit_any')) return true;
  if (can('podcast.episode.edit_own')) {
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

export function allowedNextStatuses(currentStatus: EpisodeStatus): EpisodeStatus[] {

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
    .filter((t) => can(t.permission))
    .map((t) => t.status);
}
