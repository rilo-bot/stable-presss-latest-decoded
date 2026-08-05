
/** The roles a fresh install is seeded with, besides `superadmin`. Nothing */
export type SeedRoleName = 'contributor' | 'editor' | 'administrator'

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
  | 'platform.admin'
  | 'roles.manage'
  // Team & admin
  | 'team.view'
  | 'team.manage'
  | 'settings.view'
  // Re-added with the endpoint that enforces it: PUT /api/site-settings/public-nav.
  // See the RESERVED block below for why it was gone.
  | 'settings.manage'
  | 'analytics.view'
  // Reader comments. ONE permission, not a create/edit/delete axis: leaving a
  // comment needs no permission at all (any signed-in reader may), and an author
  // editing or deleting their own is ownership rather than a grant. The only
  // grantable power is acting on OTHER people's comments — hide, restore, remove
  // — which is a single editorial job. See docs/COMMENTS-PLAN.md §6.
  | 'comments.moderate'
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
  // Platform access.
  //
  // There is no 'newsroom.access' here, and no equivalent. Opening the admin app
  // is `isAdmin` — the account CATEGORY, the presence of an `admins` row — not a
  // grantable permission. A role only decides what an admin finds INSIDE.
  //
  // 'claims.verify' is gone too. It guarded a verification step that no longer
  // exists: a `parties` row is claimed or unclaimed, and claiming it is immediate.
  // Leaving a permission in the catalogue that nothing enforces is exactly what
  // `npm run check:permissions` exists to catch.
  { id: 'platform.admin', label: 'Platform administration', resource: 'Platform Access', short: 'Administration', description: 'Manage every organisation, override ownership, read private records.' },
  { id: 'roles.manage', label: 'Manage roles', resource: 'Platform Access', short: 'Manage roles', description: 'Create roles, set their permissions, and assign them.' },

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
  { id: 'content.schedule', label: 'Schedule publication', resource: 'Publishing', short: 'Schedule', description: 'Set a future publish date.' },
  { id: 'content.publish', label: 'Publish', resource: 'Publishing', short: 'Publish', description: 'Push a story live.' },

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
  // The Settings screen is no longer static text: Website Customisation writes
  { id: 'settings.manage', label: 'Change website settings', resource: 'Team & Settings', short: 'Change settings', description: 'Show or hide public sections of the website (News, Blog, Horses, Directory, Podcast, Bulletins).' },
  { id: 'analytics.view', label: 'View analytics', resource: 'Team & Settings', short: 'Analytics', description: 'Open the analytics dashboard.' },
  // Its own resource row rather than one more checkbox under Team & Settings:
  // working a comment queue is a shift somebody takes, and it is the one power
  // here that acts on words a reader wrote in public.
  { id: 'comments.moderate', label: 'Moderate reader comments', resource: 'Comments', short: 'Moderate', description: "Hide, restore or remove other people's comments on stories, blog posts and editions." },
]

// ── RESERVED ids — removed from the catalogue, not forgotten ────────────────

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
  // Podcast production. `podcast.read_all` rather than one of the producing
  // powers: this row decides which BUILT-IN roles get the surface (see
  // builtinModulesFor) and "can see episodes that aren't live" is the honest
  // prerequisite for opening the screen at all — it is what GET / keys on. The
  // screen needs any of four powers to do anything, and a module row holds one,
  // so it gates the rest itself. Same posture as `instant`.
  { id: 'podcast', label: 'Podcast', section: 'Content', requiresPermission: 'podcast.read_all' },
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
  // The comment queue. In `Content` rather than `Management` because it is a desk
  // somebody works through, next to the stories and posts the comments are on —
  // not a report an editor reads once a week. Role rows written before this
  // module existed need scripts/grant-comments-module.ts (seedRoles is
  // insert-only), and the API must be RESTARTED after this line ships or
  // roleRegistry strips the id out of every role on every request.
  { id: 'comment-moderation', label: 'Comments', section: 'Content', requiresPermission: 'comments.moderate' },
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

/** Resolve a role's `workflowStages` to current ids. */
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

export const BUILTIN_ROLE_PERMISSIONS: Record<SeedRoleName, PermissionAction[]> = {
  // `newsroom.access` is absent from every role here: holding a staff role IS
  // newsroom access now, so listing it would be a no-op that `projectRole` strips.
  contributor: [
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
    'content.draft.create',
    'content.draft.edit_own',
    'content.draft.edit_any',
    'content.submit',
    'content.editorial_review',
    'content.send_revision',
    'content.approve',
    'content.schedule',
    'content.publish',
    'blog.create',
    'blog.edit_own',
    'blog.edit_any',
    'blog.publish',
    'blog.delete',
    'media.upload_own',
    'media.manage_all',
    'team.view',
    'analytics.view',
    // The comment desk belongs to the editor. A contributor writes; deciding what
    // stays up under someone else's byline is an editorial call, so it does NOT
    // go in the contributor list.
    'comments.moderate',
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

export const BUILTIN_ROLE_LABELS: Record<SeedRoleName, string> = {
  contributor: 'Contributor',
  editor: 'Editor',
  administrator: 'Administrator',
}

/**
 * Modules a built-in role sees — derived from the module's `requiresPermission`
 * so this exactly reproduces today's sidebar filtering. Custom roles do NOT go
 * through here; they carry an explicit, admin-ticked module list.
 */
export function builtinModulesFor(role: SeedRoleName): string[] {
  const held = new Set<string>(BUILTIN_ROLE_PERMISSIONS[role])
  return MODULE_CATALOGUE.filter((m) => !m.requiresPermission || held.has(m.requiresPermission)).map(
    (m) => m.id,
  )
}
