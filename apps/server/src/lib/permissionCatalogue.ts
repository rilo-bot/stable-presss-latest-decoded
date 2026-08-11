// THE PERMISSION MODEL — one row per screen, one column per verb.
//
// Every id is `<screen>.<verb>`, so knowing the screen and the verb is enough to
// know the id. There is nothing to memorise and nothing to look up.
//
//   view · create · edit · delete          + publish, only where something goes live
//
// A screen declares which verbs it SUPPORTS. Pipeline Map is a picture of work
// that already exists, so it supports `view` and nothing else — and the console
// renders the other columns as a dash rather than an unticked box, because an
// admin should never be offered a decision that cannot take effect.
//
// WHAT THIS REPLACED (see docs/RBAC-SIMPLIFICATION-PLAN.md):
//   38 permissions + 24 modules + 5 workflow stages = 67 decisions per role,
//   across three lists that could contradict each other — a role could hold
//   `content.publish` with the `workflow` module unticked and own a power it had
//   no screen to use. Now there is ONE list, and the sidebar IS that list.
//
// TWO RULES HOLD THE MODEL TOGETHER:
//
//   1. THE LENS RULE. Workflow Board, Pipeline Map, Editor Hub and Instant
//      Capture show records that belong to ANOTHER screen. They support `view`
//      only, and every action taken inside them is enforced with the OWNING
//      screen's verb — Instant Capture's save checks `stories.create` or
//      `blogs.create`. Without this a lens is a bypass: `instant.create` would
//      mint stories for someone who holds no `stories.create`.
//
//   2. ANY VERB IMPLIES VIEW. You cannot act on a screen you cannot open, so
//      `normalisePermissions` adds the `view` of any screen the role can act on.
//      The console shows this by ticking and locking the View box.
//
// Ownership is NOT a second set of ids. `edit_own` / `edit_any` pairs were six
// ids for three decisions; there is now one Edit id plus a per-screen SCOPE
// ('own' | 'all') on the role. See `RoleScopes` below and `canOn` in
// effectiveAccess.ts.

/** The roles a fresh install is seeded with, besides `superadmin`. */
export type SeedRoleName = 'contributor' | 'editor' | 'administrator'

// ── Verbs ───────────────────────────────────────────────────────────────────

export const VERBS = ['view', 'create', 'edit', 'delete', 'publish'] as const
export type Verb = (typeof VERBS)[number]

/** Verbs that act on an EXISTING record, so scope can narrow them to your own. */
export const SCOPED_VERBS: Verb[] = ['view', 'edit', 'delete']

/** How wide a screen's scoped verbs reach. Defaults to the safer 'own'. */
export type Scope = 'own' | 'all'
export type RoleScopes = Record<string, Scope>

// ── Actions ─────────────────────────────────────────────────────────────────
//
// Listed explicitly rather than built as a template-literal type: a computed
// `${Screen}.${Verb}` would also admit `pipeline.delete`, which does not exist.

export type PermissionAction =
  // Stories
  | 'stories.view'
  | 'stories.create'
  | 'stories.edit'
  | 'stories.delete'
  | 'stories.publish'
  | 'workflow.view'
  | 'pipeline.view'
  | 'editor-hub.view'
  | 'blogs.view'
  | 'blogs.create'
  | 'blogs.edit'
  | 'blogs.delete'
  | 'blogs.publish'
  | 'instant.view'
  | 'magazine.view'
  | 'magazine.create'
  | 'magazine.edit'
  | 'magazine.delete'
  | 'magazine.publish'
  | 'podcast.view'
  | 'podcast.create'
  | 'podcast.edit'
  | 'podcast.delete'
  | 'podcast.publish'
  // Stables
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
  | 'racing-records.view'
  | 'racing-records.create'
  | 'racing-records.edit'
  | 'racing-records.delete'
  // Community
  | 'comments.view'
  | 'comments.edit'
  | 'comments.delete'
  | 'emoji-analytics.view'
  // Management
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
  | 'settings.edit'

// ── Screens ─────────────────────────────────────────────────────────────────

export interface ScreenMeta {
  /** Permission prefix AND the module id the console/sidebar key off. */
  id: string
  label: string
  /** Sidebar section. Rows render grouped by this, in the order below. */
  section: string
  /** Which columns this row shows. Anything absent renders as a dash. */
  verbs: Verb[]
  /** Records here have an author, so the scope control applies. */
  scoped?: boolean
  /**
   * This screen is a LENS over another screen's records (rule 1 above). The
   * value names the screen whose verbs its actions must be checked against —
   * documentation for the reader and the enforcement rule for the router.
   */
  lensOver?: string
  /** One line for the console. */
  description: string
}

/**
 * The eighteen screens, in sidebar order. This array IS the sidebar and IS the
 * permission grid; apps/web/src/pages/newsroom/constants.tsx mirrors it —
 * including `section`, which orders both the rail and the grid's row groups.
 *
 * Overview, My Media Assets and My Compensation are deliberately ABSENT. They
 * only ever show your own things, so gating them would be theatre — every staff
 * member gets them. See `ALWAYS_ON_MODULES`.
 */
export const SCREEN_CATALOGUE: ScreenMeta[] = [
  // ── Stories ───────────────────────────────────────────────────────────────
  // The news pipeline and the three lenses onto it. Nothing else lives here:
  // a story moves through five stages, which is what these screens are for.
  {
    id: 'stories',
    label: 'All Stories',
    section: 'Stories',
    verbs: ['view', 'create', 'edit', 'delete', 'publish'],
    scoped: true,
    description: 'News stories, from first draft to published.',
  },
  {
    id: 'workflow',
    label: 'Workflow Board',
    section: 'Stories',
    verbs: ['view'],
    lensOver: 'stories',
    description: 'The kanban view of stories. Moving a card enforces the Stories verbs.',
  },
  {
    id: 'pipeline',
    label: 'Pipeline Map',
    section: 'Stories',
    verbs: ['view'],
    lensOver: 'stories',
    description: 'A read-only map of where work sits.',
  },
  {
    id: 'editor-hub',
    label: 'Editor Hub',
    section: 'Stories',
    verbs: ['view'],
    lensOver: 'stories',
    description: 'The review queue, assignments and scheduling, in one place.',
  },
  // ── Content ───────────────────────────────────────────────────────────────
  // The other things the newsroom makes. Separate from Stories because a story
  // moves through a five-stage pipeline and these do not — a post is draft or
  // live, an edition is built and shared, an episode is produced.
  {
    id: 'blogs',
    label: 'Blogs',
    section: 'Content',
    verbs: ['view', 'create', 'edit', 'delete', 'publish'],
    scoped: true,
    description: 'Blog posts — two states, draft and published.',
  },
  {
    id: 'instant',
    label: 'Instant Capture',
    section: 'Content',
    verbs: ['view'],
    lensOver: 'stories',
    description: 'Photo + voice capture. Saving enforces Stories or Blogs Create.',
  },
  {
    id: 'magazine',
    label: 'Magazine Builder',
    section: 'Content',
    verbs: ['view', 'create', 'edit', 'delete', 'publish'],
    scoped: true,
    description: 'Build and share magazine editions.',
  },
  {
    id: 'podcast',
    label: 'Podcast',
    section: 'Content',
    verbs: ['view', 'create', 'edit', 'delete', 'publish'],
    scoped: true,
    description: 'Episodes, guests, audio and distribution.',
  },

  // ── Stables ───────────────────────────────────────────────────────────────
  {
    id: 'horses',
    label: 'Horses',
    section: 'Stables',
    verbs: ['view', 'create', 'edit', 'delete'],
    description: 'The horse register.',
  },
  {
    id: 'people',
    label: 'People',
    section: 'Stables',
    verbs: ['view', 'create', 'edit', 'delete'],
    description: 'The people register — owners, trainers, jockeys.',
  },
  {
    id: 'media-records',
    label: 'Media Records',
    section: 'Stables',
    verbs: ['view', 'create', 'edit', 'delete'],
    description: 'The shared media library.',
  },
  {
    id: 'racing-records',
    label: 'Racing Records',
    section: 'Stables',
    verbs: ['view', 'create', 'edit', 'delete'],
    description: 'Meetings, races and results.',
  },

  // ── Community ─────────────────────────────────────────────────────────────
  {
    id: 'comments',
    label: 'Comments',
    section: 'Community',
    // No Create: leaving a comment needs no grant, and editing your own is
    // ownership. The grantable job is acting on OTHER people's words — Edit
    // hides and restores, Delete removes.
    verbs: ['view', 'edit', 'delete'],
    description: "The moderation queue for readers' comments.",
  },
  {
    id: 'emoji-analytics',
    label: 'Emoji Analytics',
    section: 'Community',
    verbs: ['view'],
    description: 'Reader sentiment from the reaction bars.',
  },

  // ── Management ────────────────────────────────────────────────────────────
  {
    id: 'team',
    label: 'Team Members',
    section: 'Management',
    // Create = invite, Edit = change someone's role, Delete = remove from staff.
    verbs: ['view', 'create', 'edit', 'delete'],
    description: 'The staff roster and invitations.',
  },
  {
    id: 'roles',
    label: 'Roles & Permissions',
    section: 'Management',
    verbs: ['view', 'create', 'edit', 'delete'],
    description: 'Define what each role may do. The most dangerous row here.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    section: 'Management',
    verbs: ['view'],
    description: 'Production and audience numbers.',
  },
  {
    id: 'settings',
    label: 'Settings',
    section: 'Management',
    verbs: ['view', 'edit'],
    description: 'Newsroom and public-website settings.',
  },
]

/**
 * Screens every staff member gets, with no row in the grid: Overview is the
 * general tab, and the two Personal screens only ever show your own things.
 */
export const ALWAYS_ON_MODULES = ['overview', 'my-assets', 'compensation'] as const

export const SCREEN_BY_ID = new Map(SCREEN_CATALOGUE.map((s) => [s.id, s]))

export function isScreenId(v: unknown): v is string {
  return typeof v === 'string' && SCREEN_BY_ID.has(v)
}

/** Screens whose records have an author — the scope control applies to these. */
export const SCOPED_SCREENS: string[] = SCREEN_CATALOGUE.filter((s) => s.scoped).map((s) => s.id)

export function screenSupports(screenId: string, verb: Verb): boolean {
  return SCREEN_BY_ID.get(screenId)?.verbs.includes(verb) === true
}

export function permissionId(screenId: string, verb: Verb): PermissionAction {
  return `${screenId}.${verb}` as PermissionAction
}

// ── The flat catalogue (derived) ────────────────────────────────────────────

export interface PermissionMeta {
  id: PermissionAction
  /** Full sentence-case name, for tooltips and audit copy. */
  label: string
  /** The screen this acts on — one row of the grid. */
  resource: string
  /** The column caption. The row already says what it acts on. */
  short: string
  description: string
}

const VERB_LABEL: Record<Verb, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  publish: 'Publish',
}

const VERB_SENTENCE: Record<Verb, (label: string) => string> = {
  view: (l) => `Open ${l} and read what is there.`,
  create: (l) => `Add something new in ${l}.`,
  edit: (l) => `Change existing records in ${l}.`,
  delete: (l) => `Remove records from ${l}.`,
  publish: (l) => `Put ${l} content live, or take it back down.`,
}

/** Every grantable action, in grid order: screen by screen, verb by verb. */
export const PERMISSION_CATALOGUE: PermissionMeta[] = SCREEN_CATALOGUE.flatMap((screen) =>
  screen.verbs.map((verb) => ({
    id: permissionId(screen.id, verb),
    label: `${VERB_LABEL[verb]} — ${screen.label}`,
    resource: screen.label,
    short: VERB_LABEL[verb],
    description: VERB_SENTENCE[verb](screen.label),
  })),
)

const ACTION_IDS = new Set<string>(PERMISSION_CATALOGUE.map((p) => p.id))

export function isPermissionAction(v: unknown): v is PermissionAction {
  return typeof v === 'string' && ACTION_IDS.has(v)
}

// ── Legacy ids ──────────────────────────────────────────────────────────────

/**
 * Old id → the new ids it becomes, applied when a role is READ.
 *
 * `scripts/migrate-permissions.ts` rewrites the stored rows; this exists so the
 * app is correct the moment it deploys, before the migration has run, and so a
 * role row written by an older process cannot silently lose access. Remove both
 * this map and the migration once prod has been migrated (P6).
 *
 * Three old ids resolve to NOTHING on purpose:
 *   media.upload_own      an upload is part of editing what it attaches to
 *   compensation.view_own seeing your own payouts is not a grant
 *   platform.admin        that is `role.isSuper`, which short-circuits already
 */
export const LEGACY_PERMISSION_ALIASES: Record<string, PermissionAction[]> = {
  'content.draft.create': ['stories.create'],
  'content.draft.edit_own': ['stories.edit'],
  'content.draft.edit_any': ['stories.edit'],
  'content.submit': ['stories.edit'],
  'content.editorial_review': ['stories.edit', 'editor-hub.view'],
  'content.send_revision': ['stories.edit'],
  'content.approve': ['stories.publish'],
  'content.schedule': ['stories.publish'],
  'content.publish': ['stories.publish'],
  'blog.create': ['blogs.create', 'blogs.view'],
  'blog.edit_own': ['blogs.edit'],
  'blog.edit_any': ['blogs.edit'],
  'blog.publish': ['blogs.publish'],
  'blog.delete': ['blogs.delete'],
  'media.upload_own': [],
  'media.manage_all': ['media-records.edit'],
  'compensation.view_own': [],
  'platform.admin': [],
  'roles.manage': ['roles.view', 'roles.create', 'roles.edit', 'roles.delete'],
  'team.manage': ['team.view', 'team.create', 'team.edit', 'team.delete'],
  'settings.manage': ['settings.edit'],
  'analytics.view': ['analytics.view', 'emoji-analytics.view'],
  'comments.moderate': ['comments.view', 'comments.edit', 'comments.delete'],
  'podcast.manage': ['podcast.edit'],
  'podcast.episode.create': ['podcast.create'],
  'podcast.episode.edit_own': ['podcast.edit'],
  'podcast.episode.edit_any': ['podcast.edit'],
  'podcast.audio.upload': ['podcast.edit'],
  'podcast.guests.manage': ['podcast.edit'],
  'podcast.episode.schedule': ['podcast.publish'],
  'podcast.episode.submit_review': ['podcast.edit'],
  'podcast.episode.approve': ['podcast.publish'],
  'podcast.episode.publish': ['podcast.publish'],
  'podcast.distribution.manage': ['podcast.edit'],
  'podcast.episode.delete': ['podcast.delete'],
  'podcast.read_all': ['podcast.view'],
}

/**
 * The scope an OLD role implied. `edit_any` meant everyone's work; `edit_own`
 * meant your own. A role holding neither keeps the default 'own'.
 */
export const LEGACY_SCOPE_ALL: Record<string, string> = {
  'content.draft.edit_any': 'stories',
  'blog.edit_any': 'blogs',
  'podcast.episode.edit_any': 'podcast',
  'podcast.read_all': 'podcast',
}

/**
 * Resolve a stored permission array: map legacy ids, drop unknown ones, and
 * apply rule 2 (any verb implies that screen's `view`).
 */
export function normalisePermissions(raw: unknown): PermissionAction[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<PermissionAction>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    if (isPermissionAction(entry)) {
      out.add(entry)
      continue
    }
    for (const mapped of LEGACY_PERMISSION_ALIASES[entry] ?? []) out.add(mapped)
  }
  // Rule 2: any verb implies view.
  for (const id of [...out]) {
    const screenId = id.slice(0, id.lastIndexOf('.'))
    const view = permissionId(screenId, 'view')
    if (isPermissionAction(view)) out.add(view)
  }
  return PERMISSION_CATALOGUE.filter((p) => out.has(p.id)).map((p) => p.id)
}

/** Resolve a stored scope map, keeping only screens that have scoped records. */
export function normaliseScopes(raw: unknown, permissions: readonly string[] = []): RoleScopes {
  const out: RoleScopes = {}
  if (raw && typeof raw === 'object') {
    for (const [screenId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (SCOPED_SCREENS.includes(screenId) && (value === 'own' || value === 'all')) {
        out[screenId] = value
      }
    }
  }
  // A role row written before scopes existed carries its intent in its old
  // permission ids — `content.draft.edit_any` meant "everyone's".
  for (const [legacyId, screenId] of Object.entries(LEGACY_SCOPE_ALL)) {
    if (!out[screenId] && permissions.includes(legacyId)) out[screenId] = 'all'
  }
  return out
}

// ── Modules (the sidebar), DERIVED ──────────────────────────────────────────
//
// There is no module axis on a role any more: a nav entry appears when the role
// holds that screen's `view`. These two helpers keep the wire payload's
// `modules` array — which the web sidebar already reads — working unchanged.

export interface ModuleMeta {
  id: string
  label: string
  section: string
}

/** Mirrors SIDE_NAV in apps/web/src/pages/newsroom/constants.tsx. */
export const MODULE_CATALOGUE: ModuleMeta[] = [
  { id: 'overview', label: 'Overview', section: 'Workspace' },
  ...SCREEN_CATALOGUE.map((s) => ({ id: s.id, label: s.label, section: s.section })),
  { id: 'my-assets', label: 'My Media Assets', section: 'Personal' },
  { id: 'compensation', label: 'My Compensation', section: 'Personal' },
]

const MODULE_IDS = new Set<string>(MODULE_CATALOGUE.map((m) => m.id))

export function isModuleId(v: unknown): v is string {
  return typeof v === 'string' && MODULE_IDS.has(v)
}

/** Every module a permission set opens: the always-on ones, plus each `.view`. */
export function modulesForPermissions(permissions: Iterable<string>): string[] {
  const out = new Set<string>(ALWAYS_ON_MODULES)
  for (const id of permissions) {
    if (id.endsWith('.view')) out.add(id.slice(0, -'.view'.length))
  }
  return MODULE_CATALOGUE.filter((m) => out.has(m.id)).map((m) => m.id)
}

// ── Workflow stages ─────────────────────────────────────────────────────────
//
// Still the five states a story moves through — but no longer a per-role axis.
// The board shows every column to anyone holding `workflow.view`; which CARDS
// appear is the Stories scope, and which TRANSITIONS are allowed is
// `stories.edit` / `stories.publish`.

export interface WorkflowStageMeta {
  id: string
  label: string
}

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

// ── Built-in roles ──────────────────────────────────────────────────────────

export const BUILTIN_ROLE_PERMISSIONS: Record<SeedRoleName, PermissionAction[]> = {
  // Writes, and sees the desk. Cannot put anything live, cannot delete, and
  // scope keeps every scoped verb on their OWN work.
  contributor: normalisePermissions([
    'stories.view',
    'stories.create',
    'stories.edit',
    'workflow.view',
    'pipeline.view',
    'blogs.view',
    'blogs.create',
    'blogs.edit',
    'instant.view',
    'horses.view',
    'people.view',
    'media-records.view',
    'racing-records.view',
  ]),

  // Runs the desk: everyone's work, plus publishing, deleting and the queues.
  editor: normalisePermissions([
    'stories.view',
    'stories.create',
    'stories.edit',
    'stories.delete',
    'stories.publish',
    'workflow.view',
    'pipeline.view',
    'editor-hub.view',
    'blogs.view',
    'blogs.create',
    'blogs.edit',
    'blogs.delete',
    'blogs.publish',
    'instant.view',
    'magazine.view',
    'magazine.create',
    'magazine.edit',
    'magazine.publish',
    'podcast.view',
    'podcast.create',
    'podcast.edit',
    'podcast.publish',
    'horses.view',
    'horses.create',
    'horses.edit',
    'people.view',
    'people.create',
    'people.edit',
    'media-records.view',
    'media-records.create',
    'media-records.edit',
    'racing-records.view',
    'racing-records.create',
    'racing-records.edit',
    // The comment desk belongs to the editor. A contributor writes; deciding
    // what stays up under someone else's byline is an editorial call.
    'comments.view',
    'comments.edit',
    'comments.delete',
    'emoji-analytics.view',
    'analytics.view',
    'team.view',
    'settings.view',
  ]),

  // Everything, always. Derived so a new action can never be withheld by
  // forgetting to add it here.
  administrator: PERMISSION_CATALOGUE.map((p) => p.id),
}

export const BUILTIN_ROLE_SCOPES: Record<SeedRoleName, RoleScopes> = {
  contributor: { stories: 'own', blogs: 'own', magazine: 'own', podcast: 'own' },
  editor: { stories: 'all', blogs: 'all', magazine: 'all', podcast: 'all' },
  administrator: { stories: 'all', blogs: 'all', magazine: 'all', podcast: 'all' },
}

export const BUILTIN_ROLE_LABELS: Record<SeedRoleName, string> = {
  contributor: 'Contributor',
  editor: 'Editor',
  administrator: 'Administrator',
}

/** The sidebar a built-in role gets — derived, like every other role's. */
export function builtinModulesFor(role: SeedRoleName): string[] {
  return modulesForPermissions(BUILTIN_ROLE_PERMISSIONS[role])
}