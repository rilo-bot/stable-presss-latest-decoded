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

/**
 * The roles a fresh install is seeded with, besides `superadmin`. Nothing
 * authorizes against this type — it exists so the seed data below stays
 * exhaustively typed. A superadmin may edit these or add their own at runtime.
 *
 * Deliberately NOT seeded: legal_reviewer, podcast_producer and publisher.
 * Every permission they used to hold still exists in the catalogue below, so a
 * superadmin can build any of them from the Roles & Permissions console — they
 * just aren't there out of the box.
 */
export type SeedRoleSlug = 'contributor' | 'editor' | 'administrator'

// ── Actions ─────────────────────────────────────────────────────────────────

export type PermissionAction =
  // Content
  | 'content.draft.create'
  | 'content.draft.edit_own'
  | 'content.draft.edit_any'
  | 'content.submit'
  | 'content.editorial_review'
  | 'content.send_revision'
  | 'content.approve'
  | 'content.schedule'
  | 'content.publish'
  | 'content.newsletter'
  | 'content.bulletin'
  // Blogs — a separate axis from Stories on purpose. Publishing a blog is a
  // different power from publishing a news story, and keeping them apart is
  // what lets blogging be opened to member/guest authors later as a role
  // change rather than a code change. See docs/BLOG-SYSTEM-PLAN.md §4.2.
  | 'blog.create'
  | 'blog.edit_own'
  | 'blog.edit_any'
  | 'blog.publish'
  | 'blog.delete'
  // Media
  | 'media.upload_own'
  | 'media.manage_all'
  // Compensation
  | 'compensation.view_own'
  // Platform access
  | 'newsroom.access'
  | 'platform.admin'
  | 'roles.manage'
  | 'claims.verify'
  // Team & admin
  | 'team.view'
  | 'team.manage'
  | 'settings.view'
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
  /** Full sentence-case name. Used in tooltips and audit copy. */
  label: string
  /**
   * The RESOURCE this action operates on — one row in the admin permission
   * grid. Rows are rendered in first-seen order, so the order of this array is
   * the order of the screen.
   */
  resource: string
  /**
   * The action alone, with the resource stripped out ("Create", not "Create
   * drafts"). This is the checkbox caption; the row already says what it acts
   * on, so repeating it just makes the grid unreadable.
   */
  short: string
  description: string
}

/**
 * Every grantable action, ordered as the admin grid renders it: one row per
 * resource, one checkbox per action within it.
 */
export const PERMISSION_CATALOGUE: PermissionMeta[] = [
  // Platform access — these three replace the old hardcoded role-family tests.
  // `newsroom.access` is what `isStaff()` used to mean; `platform.admin` is what
  // `isAdmin()` used to mean. First row because they gate everything below.
  { id: 'newsroom.access', label: 'Access the newsroom', resource: 'Platform Access', short: 'Newsroom', description: 'Sign in to newsroom tooling and see unverified/private records.' },
  { id: 'platform.admin', label: 'Platform administration', resource: 'Platform Access', short: 'Administration', description: 'Verify claims, manage every organisation, override ownership.' },
  { id: 'roles.manage', label: 'Manage roles', resource: 'Platform Access', short: 'Manage roles', description: 'Create roles, set their permissions, and assign them.' },
  // Split OUT of platform.admin. Verifying a racing identity is a records job;
  // it used to require the permission that ALSO grants "manage every
  // organisation, override any ownership", so there was no way to staff the
  // verification queue without handing over the platform.
  { id: 'claims.verify', label: 'Verify party claims', resource: 'Platform Access', short: 'Verify claims', description: 'Approve or reject claims on a racing identity (owner, trainer, jockey…).' },

  // Stories
  { id: 'content.draft.create', label: 'Create drafts', resource: 'Stories', short: 'Create', description: 'Start a new story draft.' },
  { id: 'content.draft.edit_own', label: 'Edit own drafts', resource: 'Stories', short: 'Edit own', description: 'Edit stories they authored.' },
  { id: 'content.draft.edit_any', label: 'Edit any story', resource: 'Stories', short: 'Edit any', description: 'Edit stories written by anyone.' },
  { id: 'content.submit', label: 'Submit for review', resource: 'Stories', short: 'Submit', description: 'Push a draft into the editorial queue.' },

  // Editorial
  { id: 'content.editorial_review', label: 'Editorial review', resource: 'Editorial', short: 'Review', description: 'Move stories in and out of editorial review.' },
  { id: 'content.send_revision', label: 'Send back for revision', resource: 'Editorial', short: 'Send back', description: 'Return a story to its author.' },
  { id: 'content.approve', label: 'Approve content', resource: 'Editorial', short: 'Approve', description: 'Approve a story for publication.' },

  // Publishing.
  //
  // `content.legal_review`, `content.compliance` and `content.publisher_review`
  // were removed here. They were the per-department gates of the retired
  // twelve-status workflow: grantable in the Roles console, listed under a
  // "Legal & Compliance" heading, and checked by absolutely nothing — approval
  // has been one step (`content.approve`) since the five stages landed. Roles
  // still holding the retired ids simply no longer match a catalogue entry.
  { id: 'content.schedule', label: 'Schedule publication', resource: 'Publishing', short: 'Schedule', description: 'Set a future publish date.' },
  { id: 'content.publish', label: 'Publish', resource: 'Publishing', short: 'Publish', description: 'Push a story live.' },
  { id: 'content.newsletter', label: 'Send to newsletter', resource: 'Publishing', short: 'Newsletter', description: 'Distribute a story via newsletter.' },
  { id: 'content.bulletin', label: 'Add to bulletin', resource: 'Publishing', short: 'Bulletin', description: 'Include a story in a bulletin issue.' },

  // Blogs — two states (draft/published), so there is no submit/approve/schedule
  // row here the way Stories has one.
  { id: 'blog.create', label: 'Create blog posts', resource: 'Blogs', short: 'Create', description: 'Start a new blog post.' },
  { id: 'blog.edit_own', label: 'Edit own blog posts', resource: 'Blogs', short: 'Edit own', description: 'Edit blog posts they authored.' },
  { id: 'blog.edit_any', label: 'Edit any blog post', resource: 'Blogs', short: 'Edit any', description: 'Edit blog posts written by anyone.' },
  { id: 'blog.publish', label: 'Publish blog posts', resource: 'Blogs', short: 'Publish', description: 'Put a blog post live, or take it back down.' },
  { id: 'blog.delete', label: 'Delete blog posts', resource: 'Blogs', short: 'Delete', description: 'Delete a blog post.' },

  // Media
  { id: 'media.upload_own', label: 'Upload own media', resource: 'Media', short: 'Upload own', description: 'Upload and manage personal media assets.' },
  { id: 'media.manage_all', label: 'Manage all media', resource: 'Media', short: 'Manage all', description: 'Manage the full shared media library.' },

  // Workflow board — DELIBERATELY EMPTY.
  //
  // `workflow.view_all_columns` and `workflow.view_own_columns` lived here and
  // were checked by nothing: which columns a role sees is the `workflowStages`
  // axis, which is real per-role config with its own checkbox column in the
  // Roles console. The two permissions were the pre-dynamic-RBAC vestige of the
  // same idea, so they offered an admin a choice that could not take effect.
  // Removed rather than wired — wiring them would create a second source of
  // truth for column visibility. Role rows still holding the ids simply no
  // longer match a catalogue entry (see scripts/sync-role-catalogue.ts).

  // Podcast
  { id: 'podcast.manage', label: 'Manage podcast', resource: 'Podcast', short: 'Manage', description: 'Broad podcast management.' },
  { id: 'podcast.episode.create', label: 'Create episodes', resource: 'Podcast', short: 'Create', description: 'Start a new episode draft.' },
  { id: 'podcast.episode.edit_own', label: 'Edit own episodes', resource: 'Podcast', short: 'Edit own', description: 'Edit episodes they produced.' },
  { id: 'podcast.episode.edit_any', label: 'Edit any episode', resource: 'Podcast', short: 'Edit any', description: 'Edit episodes produced by anyone.' },
  { id: 'podcast.audio.upload', label: 'Upload audio', resource: 'Podcast', short: 'Upload audio', description: 'Attach audio files to an episode.' },
  { id: 'podcast.guests.manage', label: 'Manage guests', resource: 'Podcast', short: 'Guests', description: 'Add and remove episode guests.' },
  { id: 'podcast.episode.schedule', label: 'Schedule episodes', resource: 'Podcast', short: 'Schedule', description: 'Set an episode publish date.' },
  { id: 'podcast.episode.submit_review', label: 'Submit episode for review', resource: 'Podcast', short: 'Submit', description: 'Send an episode for approval.' },
  { id: 'podcast.episode.approve', label: 'Approve episodes', resource: 'Podcast', short: 'Approve', description: 'Approve or return an episode.' },
  { id: 'podcast.episode.publish', label: 'Publish episodes', resource: 'Podcast', short: 'Publish', description: 'Push an episode live.' },
  { id: 'podcast.distribution.manage', label: 'Manage distribution', resource: 'Podcast', short: 'Distribution', description: 'Toggle per-episode distribution channels.' },
  { id: 'podcast.episode.delete', label: 'Delete episodes', resource: 'Podcast', short: 'Delete', description: 'Delete a draft or unpublished episode.' },
  { id: 'podcast.read_all', label: 'See unpublished episodes', resource: 'Podcast', short: 'See drafts', description: 'View drafts, not just published episodes.' },

  // Compensation
  { id: 'compensation.view_own', label: 'View own payouts', resource: 'Compensation', short: 'View own', description: 'See their own payout history.' },

  // Team & settings
  { id: 'team.view', label: 'View team', resource: 'Team & Settings', short: 'View team', description: 'See the staff roster.' },
  { id: 'team.manage', label: 'Manage team & roles', resource: 'Team & Settings', short: 'Manage team', description: 'Invite staff, create roles, assign permissions.' },
  { id: 'settings.view', label: 'View settings', resource: 'Team & Settings', short: 'View settings', description: 'Open newsroom settings.' },
  { id: 'analytics.view', label: 'View analytics', resource: 'Team & Settings', short: 'Analytics', description: 'Open the analytics dashboard.' },
]

// ── RESERVED ids — removed from the catalogue, not forgotten ────────────────
//
// These were grantable checkboxes that no code path consulted, in either the
// server or the browser. A permission that cannot be enforced is worse than a
// missing one: an administrator ticks it, believes they have restricted payout
// editing or settings changes, and nothing whatsoever has changed.
//
//   compensation.view_all   no all-contributors view exists
//   compensation.manage     no payouts endpoint; the screen reads from `articles`
//   settings.manage         no settings endpoint; the screen is static text
//   workflow.view_all_columns   superseded by the `workflowStages` axis
//   workflow.view_own_columns   superseded by the `workflowStages` axis
//
// RE-ADD any of these in the same commit as the endpoint that enforces it — never
// ahead of it. scripts/check-permission-enforcement.ts fails the build if a
// catalogue id is referenced nowhere, which is what keeps this list from growing
// back. See docs/CRM-MODULES-PERMISSIONS-REVIEW.md §4.3–4.4.

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
  { id: 'blogs', label: 'Blogs', section: 'Content', requiresPermission: 'blog.create' },
  // Instant carries NO requiresPermission on purpose: its two modes need
  // different permissions (content.draft.create for a story, blog.create for a
  // post) and a module row holds only one. The screen gates each mode itself, so
  // a blog-only author still gets the surface. See docs/INSTANT-CAPTURE-PLAN.md §5.1.
  { id: 'instant', label: 'Instant Capture', section: 'Content' },
  { id: 'magazine-v2', label: 'Magazine Builder', section: 'Content' },
  { id: 'editor-hub', label: 'Editor Hub', section: 'Content', requiresPermission: 'content.editorial_review' },
  { id: 'my-assets', label: 'My Media Assets', section: 'Content', requiresPermission: 'media.upload_own' },
  { id: 'compensation', label: 'My Compensation', section: 'Content', requiresPermission: 'compensation.view_own' },
  { id: 'horses', label: 'Horses Management', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'parties', label: 'People Management', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'media-production-system', label: 'Media Records', section: 'Stables', requiresPermission: 'content.draft.create' },
  { id: 'racing-production-system', label: 'Racing Data', section: 'Stables', requiresPermission: 'content.draft.create' },
  // team.view, NOT team.manage. Gating the surface on `manage` made `team.view`
  // ("See the staff roster") a permission that granted nothing at all: the
  // seeded editor role holds it and still had no Team screen. The screen is now
  // readable with `team.view` and its write controls are gated on `team.manage`
  // — both here and in routes/staff.ts, which applies the same split.
  { id: 'team', label: 'Team Members', section: 'Management', requiresPermission: 'team.view' },
  // roles.manage, NOT team.manage — /api/roles enforces roles.manage, so gating
  // the surface on anything looser shows a console whose every call 403s.
  { id: 'roles', label: 'Roles & Permissions', section: 'Management', requiresPermission: 'roles.manage' },
  { id: 'analytics', label: 'Analytics', section: 'Management', requiresPermission: 'analytics.view' },
  // Reader sentiment — same permission as Analytics; see SIDE_NAV for why it is a
  // row of its own. Role rows written before this module existed need
  // scripts/grant-emoji-analytics-module.ts (seedRoles is insert-only).
  { id: 'emoji-analytics', label: 'Emoji Analytics', section: 'Management', requiresPermission: 'analytics.view' },
  { id: 'settings', label: 'Settings', section: 'Management', requiresPermission: 'settings.view' },

  // Editor Hub tabs — gated the same way, one level down.
  { id: 'review-queue', label: 'Review Queue', section: 'Editor Hub', requiresPermission: 'content.editorial_review' },
  { id: 'assignments', label: 'Assignments', section: 'Editor Hub', requiresPermission: 'content.draft.edit_any' },
  { id: 'scheduling', label: 'Scheduling', section: 'Editor Hub', requiresPermission: 'content.schedule' },
  { id: 'media-library', label: 'Media Library', section: 'Editor Hub', requiresPermission: 'media.manage_all' },
  { id: 'horse-records', label: 'Horse Records', section: 'Editor Hub', requiresPermission: 'media.manage_all' },
]

const MODULE_IDS = new Set<string>(MODULE_CATALOGUE.map((m) => m.id))

export function isModuleId(v: unknown): v is string {
  return typeof v === 'string' && MODULE_IDS.has(v)
}

// ── Workflow stages (the third checkbox axis) ───────────────────────────────
//
// Which Kanban columns a role sees. This was `RoleConfig.allowedStatuses`, a
// static per-role array in apps/web/src/pages/newsroom/constants.tsx — real
// per-role config with nowhere to live once roles are DB-defined.
// Mirrors WORKFLOW_STAGES in apps/web/src/components/KanbanColumn.tsx.

export interface WorkflowStageMeta {
  id: string
  label: string
}

/**
 * Five stages, matching ARTICLE_STATUSES in lib/workflow.ts.
 *
 * Was twelve. The four per-department review gates (editorial_review,
 * legal_review, compliance, publisher_review) collapsed into one approval step;
 * `revision` became a `changesRequested` flag on a Draft; and newsletter/bulletin
 * were never workflow stages at all — they were distribution, and now live in
 * the article's `channels`.
 *
 * Roles store stage ids in `workflowStages`. Retired ids are REMAPPED on read by
 * `normaliseWorkflowStages` rather than by a migration — see the note there.
 */
export const WORKFLOW_STAGE_CATALOGUE: WorkflowStageMeta[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
  { id: 'scheduled', label: 'Schedule Publish' },
  { id: 'published', label: 'Published' },
]

const STAGE_IDS = new Set<string>(WORKFLOW_STAGE_CATALOGUE.map((s) => s.id))

export function isWorkflowStage(v: unknown): v is string {
  return typeof v === 'string' && STAGE_IDS.has(v)
}

export const ALL_WORKFLOW_STAGES: string[] = WORKFLOW_STAGE_CATALOGUE.map((s) => s.id)

/**
 * Retired stage id → the surviving stage that absorbed it.
 *
 * The four review gates became one approval step, `revision` became a flag on a
 * Draft, and newsletter/bulletin turned out to be distribution rather than
 * stages at all.
 */
const RETIRED_STAGES: Record<string, string> = {
  editorial_review: 'submitted',
  legal_review: 'submitted',
  compliance: 'submitted',
  publisher_review: 'approved',
  revision: 'draft',
  newsletter: 'published',
  bulletin: 'published',
  archived: 'published',
}

/**
 * Resolve a role's `workflowStages` to current ids.
 *
 * Retired ids are REMAPPED, not dropped. Dropping them is what the reader here
 * used to do (`.filter(isWorkflowStage)`), and for a role whose stages were ALL
 * retired — the seeded `legal_reviewer`, for instance — that left an empty list,
 * which the board turns into a kanban with no columns at all: a staff member with
 * stories to work on looking at a blank screen.
 *
 * Done on read rather than by a migration script so there is nothing to remember
 * to run, and nothing that behaves differently depending on whether someone did.
 */
export function normaliseWorkflowStages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const id = isWorkflowStage(entry) ? entry : RETIRED_STAGES[entry]
    if (id) out.add(id)
  }
  return WORKFLOW_STAGE_CATALOGUE.filter((s) => out.has(s.id)).map((s) => s.id)
}

// ── Built-in role matrix ────────────────────────────────────────────────────
//
// The merge of what web lib/permissions.ts and server lib/permissions.ts each
// held. `podcast.read_all` came only from the server copy; everything else came
// from the web copy, which was the fuller of the two.

export const BUILTIN_ROLE_PERMISSIONS: Record<SeedRoleSlug, PermissionAction[]> = {
  contributor: [
    'newsroom.access',
    'content.draft.create',
    'content.draft.edit_own',
    'content.submit',
    // Blogs: may write, may not put live. Mirrors the story posture.
    'blog.create',
    'blog.edit_own',
    'media.upload_own',
    'compensation.view_own',
  ],

  editor: [
    'newsroom.access',
    'content.draft.create',
    'content.draft.edit_own',
    'content.draft.edit_any',
    'content.submit',
    'content.editorial_review',
    'content.send_revision',
    'content.approve',
    'content.schedule',
    'content.publish',
    'content.newsletter',
    'content.bulletin',
    'blog.create',
    'blog.edit_own',
    'blog.edit_any',
    'blog.publish',
    'blog.delete',
    'media.upload_own',
    'media.manage_all',
    'team.view',
    'analytics.view',
    'settings.view',
    'podcast.episode.edit_any',
    'podcast.episode.approve',
    'podcast.episode.publish',
    'podcast.distribution.manage',
    'podcast.read_all',
  ],

  // Administrator holds everything, always. Derived rather than listed so a new
  // action can never be accidentally withheld from admins.
  administrator: PERMISSION_CATALOGUE.map((p) => p.id),
}

export const BUILTIN_ROLE_LABELS: Record<SeedRoleSlug, string> = {
  contributor: 'Contributor',
  editor: 'Editor',
  administrator: 'Administrator',
}

/**
 * Modules a built-in role sees — derived from the module's `requiresPermission`
 * so this exactly reproduces today's sidebar filtering. Custom roles do NOT go
 * through here; they carry an explicit, admin-ticked module list.
 */
export function builtinModulesFor(role: SeedRoleSlug): string[] {
  const held = new Set<string>(BUILTIN_ROLE_PERMISSIONS[role])
  return MODULE_CATALOGUE.filter((m) => !m.requiresPermission || held.has(m.requiresPermission)).map(
    (m) => m.id,
  )
}
