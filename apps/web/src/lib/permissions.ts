/**
 * Stable Press — permissions, client side.
 *
 * ONE ROW PER SCREEN, ONE COLUMN PER VERB. Every id is `<screen>.<verb>`, so
 * `can('stories.edit')` reads as the question being asked. The union below
 * MIRRORS `PermissionAction` in apps/server/src/lib/permissionCatalogue.ts and
 * must stay in step with it — the server is the one that decides.
 *
 * THERE IS NO LOCAL ROLE MATRIX. Roles are rows in a database that a superadmin
 * edits at runtime, so the client cannot know what a role grants — it can only
 * be told. Every answer comes from `currentUser.access`.
 *
 * Consequences worth knowing:
 *   - No access payload means NO permissions. Fails closed by construction.
 *   - This is a UI-affordance gate, never a security boundary. The server
 *     enforces the same permissions independently on every route.
 *   - SCOPE ('own' | 'all') decides whose records a verb reaches. `can()` answers
 *     "may they at all"; `canOn()` answers "…and on THIS record". A screen list
 *     wants `can`; an edit button on someone else's story wants `canOn`.
 *
 * Reactivity: call sites read `currentUser` from the store and so re-render when
 * the session refreshes. `useCan` subscribes explicitly and is preferred in new
 * code.
 */

import { useAuthStore } from '@/stores/authStore';
import type { UploadKind } from '@/lib/upload';

// ── Action catalogue ────────────────────────────────────────────────────────

export type PermissionAction =
  // Stories — the news pipeline
  | 'stories.view'
  | 'stories.create'
  | 'stories.edit'
  | 'stories.delete'
  | 'stories.publish'
  // Lenses over the same records. They carry `view` ONLY: every action taken
  // inside them is checked against the Stories verbs above, so that a screen
  // cannot become a way around the permission that governs the work.
  | 'workflow.view'
  | 'pipeline.view'
  | 'instant.view'
  // Blogs — a separate axis from Stories, two states (draft/published)
  | 'blogs.view'
  | 'blogs.create'
  | 'blogs.edit'
  | 'blogs.delete'
  | 'blogs.publish'
  // Magazines. NEW — magazines had no permission at all before, so every staff
  // member could build, share and delete an edition.
  | 'magazine.view'
  | 'magazine.create'
  | 'magazine.edit'
  | 'magazine.delete'
  | 'magazine.publish'
  // Podcast — was THIRTEEN ids for one section
  | 'podcast.view'
  | 'podcast.create'
  | 'podcast.edit'
  | 'podcast.delete'
  | 'podcast.publish'
  // Stables — the five registers. They used to ride on `content.draft.create`,
  // so "may start a story draft" decided who could edit the horse register.
  | 'horses.view'
  | 'horses.create'
  | 'horses.edit'
  | 'horses.delete'
  | 'people.view'
  | 'people.create'
  | 'people.edit'
  | 'people.delete'
  | 'media-records.view'
  | 'media-records.create'
  | 'media-records.edit'
  | 'media-records.delete'
  // Sale records and horse documents. Their only UI used to be a tab inside
  // Editor Hub, gated on the Horses row; now a register with its own screen.
  | 'horse-records.view'
  | 'horse-records.create'
  | 'horse-records.edit'
  | 'horse-records.delete'
  | 'racing-records.view'
  | 'racing-records.create'
  | 'racing-records.edit'
  | 'racing-records.delete'
  // Community. No `comments.create` — leaving a comment needs no grant, and
  // editing your own is ownership. Edit hides and restores; Delete removes.
  | 'comments.view'
  | 'comments.edit'
  | 'comments.delete'
  | 'emoji-analytics.view'
  // Management. Team: Create = invite, Edit = change a role, Delete = remove.
  | 'team.view'
  | 'team.create'
  | 'team.edit'
  | 'team.delete'
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  | 'analytics.view'
  | 'settings.view'
  | 'settings.edit';

/**
 * Screens with no row in the grid: Overview is the general tab, and the two
 * Personal screens only ever show your own things, so gating them would be
 * theatre. Mirrors ALWAYS_ON_MODULES on the server.
 */
export const ALWAYS_ON_MODULES = ['overview', 'my-assets', 'compensation'];

export type Scope = 'own' | 'all';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Does the signed-in user hold this permission?
 *
 * Answered ENTIRELY from `currentUser.access`, which the server resolved. There
 * is no client-side fallback: a role is a database row, so guessing locally
 * could only ever be wrong. No access payload means no permissions.
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
 * How far a screen's verbs reach. 'own' is the default and the safe one: a role
 * that has never been given a scope cannot touch anyone else's work.
 */
export function scopeFor(screen: string): Scope {
  const access = useAuthStore.getState().currentUser?.access;
  if (!access) return 'own';
  if (access.isSuperAdmin) return 'all';
  return access.scopes?.[screen] === 'all' ? 'all' : 'own';
}

/**
 * …and may they do it to THIS record?
 *
 * `owns` is passed in rather than worked out here because ownership is not one
 * thing: a story matches on byline, a blog post on its creator id. Mirrors
 * `canOn` on the server, which is the check that actually counts.
 */
export function canOn(action: PermissionAction, owns: boolean): boolean {
  if (!can(action)) return false;
  const screen = action.slice(0, action.lastIndexOf('.'));
  return scopeFor(screen) === 'all' || owns;
}

/** "…anyone's, not just my own." */
export function canAnyones(action: PermissionAction): boolean {
  return canOn(action, false);
}

/**
 * May the user open this navigation surface?
 *
 * DERIVED from `<module>.view` now — the module list on the wire is built from
 * exactly that, so the sidebar cannot disagree with the permissions the way a
 * separately-ticked module array could.
 */
export function canOpenModule(moduleId: string): boolean {
  if (ALWAYS_ON_MODULES.includes(moduleId)) return !!useAuthStore.getState().currentUser;
  const access = useAuthStore.getState().currentUser?.access;
  return access ? access.modules.includes(moduleId) : false;
}

/**
 * Kanban columns this user may see.
 *
 * Every column, for anyone who can open the board: which CARDS appear is the
 * Stories scope, and which TRANSITIONS are allowed is the verb. The per-role
 * `workflowStages` axis is gone.
 */
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

// ── Uploads ─────────────────────────────────────────────────────────────────

/**
 * What each upload KIND requires. A MIRROR of KIND_PERMISSIONS in
 * apps/server/src/routes/uploads/index.ts.
 *
 * UPLOADING IS NOT A POWER OF ITS OWN — it is part of editing the thing the file
 * belongs to. `media.upload_own` used to be a grant in its own right, which is
 * how a role holding `content.draft.edit_any` could open the Article Studio,
 * attach a hero photo, and be told it lacked permission to upload media files.
 *
 * An empty list means "any signed-in account": the identity/self-service kinds,
 * and `misc`, which is your own file drawer.
 */
const UPLOAD_KIND_PERMISSIONS: Record<UploadKind, PermissionAction[]> = {
  evidence: [],
  avatar: [],
  party: [],
  horse: [],
  misc: [],
  media: ['stories.edit'],
  blog: ['blogs.edit'],
  podcast: ['podcast.edit'],
};

/**
 * May the signed-in user upload this kind of file? Reactive, so an affordance
 * appears the moment a role gains the permission. Hide the control rather than
 * disabling it: a disabled paperclip explains nothing.
 */
export function useCanUpload(kind: UploadKind): boolean {
  return useAuthStore((s) => {
    const needed = UPLOAD_KIND_PERMISSIONS[kind];
    if (needed.length === 0) return !!s.currentUser;
    const held = s.currentUser?.access?.permissions;
    return held ? needed.some((p) => held.includes(p)) : false;
  });
}

// ── Ownership-scoped helpers ────────────────────────────────────────────────

/**
 * May the user edit this specific story? Scope 'all' wins outright; scope 'own'
 * requires the byline to match.
 */
export function canEditArticle(
  articleAuthor: string,
  currentUserDisplayName: string | null | undefined
): boolean {
  return canOn('stories.edit', !!currentUserDisplayName && articleAuthor === currentUserDisplayName);
}

/** Same question for a podcast episode, matched on its producer. */
export function canEditEpisode(
  episodeProducer: string | undefined,
  currentUserDisplayName: string | null | undefined
): boolean {
  return canOn('podcast.edit', !!currentUserDisplayName && episodeProducer === currentUserDisplayName);
}

// ── Podcast workflow helpers ─────────────────────────────────────────────────

export type EpisodeStatus =
  | 'draft'
  | 'audio_uploaded'
  | 'guests_added'
  | 'description_written'
  | 'scheduled'
  | 'in_review'
  | 'published';

/** Which statuses the role may move an episode to from here. */
export function allowedNextStatuses(currentStatus: EpisodeStatus): EpisodeStatus[] {
  const transitions: Record<EpisodeStatus, { status: EpisodeStatus; permission: PermissionAction }[]> = {
    draft: [{ status: 'audio_uploaded', permission: 'podcast.edit' }],
    audio_uploaded: [{ status: 'guests_added', permission: 'podcast.edit' }],
    guests_added: [{ status: 'description_written', permission: 'podcast.edit' }],
    description_written: [{ status: 'scheduled', permission: 'podcast.publish' }],
    scheduled: [{ status: 'in_review', permission: 'podcast.edit' }],
    in_review: [
      { status: 'published', permission: 'podcast.publish' },
      { status: 'scheduled', permission: 'podcast.publish' }, // send back
    ],
    published: [], // terminal
  };

  return transitions[currentStatus].filter((t) => can(t.permission)).map((t) => t.status);
}
