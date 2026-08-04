// ---------------------------------------------------------------------------
// How the role editor is ORGANISED: by the sidebar, screen by screen.
//
// The editor used to be three flat axes — 5 module rows, 9 action rows, 1 stage
// row — which put "Magazine Builder" (a screen) and "Publish" (an action on a
// different screen) in visually identical rows with nothing connecting them. The
// result was a trap you could fall into in thirty seconds: tick Magazine Builder,
// save, and the role cannot open the Campaign Engine at all, because entry is
// gated on the `newsroom.access` ACTION sitting in an unrelated row further down.
//
// So the shape here mirrors what an admin already has a mental model of — the
// sidebar — and hangs each screen's actions underneath it. "Give them the
// magazine builder" is now one row, and the prerequisite is stated rather than
// left to be discovered.
//
// THAT TRAP IS NOW GONE AT THE ROOT, not patched here. `newsroom.access` used to
// be the grantable checkbox that gated entry; it has been removed from the
// catalogue entirely. Being on the team IS Campaign Engine access — anyone added
// from the Production System can open it, and the role decides only what they find
// inside (`isStaffIdentity` in apps/server/src/lib/identity.ts). So there is no
// prerequisite for this layout to teach, and no way to build a role that cannot
// sign in.
//
// COMPLETENESS. Nothing here is allowed to swallow a catalogue entry. Any
// permission or module the layout does not mention is collected into a trailing
// "Not yet grouped" section by `unmappedIds()`, so adding to
// permissionCatalogue.ts still surfaces in the console — it just wants a home in
// this file to read well.
// ---------------------------------------------------------------------------

/** Permissions that hand over control of the platform, flagged wherever shown. */
export const DANGEROUS_PERMISSIONS = new Set([
  'platform.admin',
  'roles.manage',
  'team.manage',
  'claims.verify',
]);

export interface ScreenSpec {
  /** Module id — the screen's own toggle. Omit for an actions-only row. */
  module?: string;
  /** Heading for a row that has no module of its own (e.g. Podcast). */
  label?: string;
  /** Sub-screens toggled beneath this one — the Editor Hub's tabs. */
  tabs?: string[];
  /** Permission ids belonging to this screen. */
  actions?: string[];
  /** Render the workflow-stage checkboxes under this screen. */
  stages?: boolean;
  /** One line under the screen name, for a dependency worth stating. */
  note?: string;
}

export interface SectionSpec {
  title: string;
  note?: string;
  screens: ScreenSpec[];
  /** True for the top block, which is prerequisites rather than screens. */
  isAccess?: boolean;
}

/**
 * Sections follow MODULE_CATALOGUE's own `section` values so this reads in the
 * same order as the rail: Workspace, Content, Stables, Management.
 */
export const ROLE_LAYOUT: SectionSpec[] = [
  {
    title: 'Platform',
    isAccess: true,
    note:
      'Everyone on the team can open the Campaign Engine — that comes with being staff, not from a checkbox. These two are platform-wide powers on top of it.',
    screens: [{ actions: ['platform.admin', 'claims.verify'] }],
  },

  {
    title: 'Workspace',
    screens: [
      { module: 'overview' },
      {
        module: 'workflow',
        stages: true,
        actions: [
          'content.submit',
          'content.editorial_review',
          'content.send_revision',
          'content.approve',
          'content.schedule',
          'content.publish',
        ],
      },
      { module: 'pipeline' },
    ],
  },

  {
    title: 'Content',
    screens: [
      {
        module: 'all-stories',
        actions: ['content.draft.create', 'content.draft.edit_own', 'content.draft.edit_any'],
      },
      {
        module: 'blogs',
        actions: ['blog.create', 'blog.edit_own', 'blog.edit_any', 'blog.publish', 'blog.delete'],
      },
      {
        module: 'instant',
        note:
          'Two modes: story capture needs “Create” under All Stories, post capture needs “Create” under Blogs.',
      },
      {
        module: 'magazine-v2',
        note:
          'Has no permissions of its own yet — anyone who can open it can build an edition and publish it to the public Bulletins page.',
      },
      {
        module: 'podcast',
        actions: [
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
          'podcast.read_all',
        ],
        note:
          'Producing an episode takes several of these in sequence: upload audio → guests → schedule → submit → approve → publish. “Approve” and “Publish” are separate powers, and the publish step checks Publish.',
      },
      {
        module: 'editor-hub',
        actions: ['content.editorial_review'],
        tabs: ['review-queue', 'assignments', 'scheduling', 'media-library', 'horse-records'],
      },
      { module: 'my-assets', actions: ['media.upload_own'] },
      { module: 'compensation', actions: ['compensation.view_own'] },
    ],
  },

  {
    title: 'Stables',
    note: 'All four registers also need “Create” under All Stories to appear in the sidebar.',
    screens: [
      { module: 'horses' },
      { module: 'parties' },
      { module: 'media-production-system' },
      { module: 'racing-production-system' },
    ],
  },

  {
    title: 'Management',
    screens: [
      { module: 'team', actions: ['team.view', 'team.manage'] },
      { module: 'roles', actions: ['roles.manage'] },
      { module: 'analytics', actions: ['analytics.view'] },
      { module: 'emoji-analytics', note: 'Uses the same Analytics permission as the screen above.' },
      { module: 'settings', actions: ['settings.view'] },
    ],
  },

  {
    title: 'Outside the Campaign Engine',
    note: 'This has no screen in the sidebar of its own.',
    // Podcast used to live here — it was a standalone page at /podcast/workflow.
    // It is a Content screen now, so it moved up with a module of its own.
    screens: [{ label: 'Shared media library', actions: ['media.manage_all'] }],
  },
];

/** Every permission id the layout places somewhere. */
const MAPPED_ACTIONS = new Set(
  ROLE_LAYOUT.flatMap((s) => s.screens.flatMap((sc) => sc.actions ?? [])),
);

/** Every module id the layout places somewhere. */
const MAPPED_MODULES = new Set(
  ROLE_LAYOUT.flatMap((s) =>
    s.screens.flatMap((sc) => [...(sc.module ? [sc.module] : []), ...(sc.tabs ?? [])]),
  ),
);

/**
 * Catalogue ids this file forgot. Rendered in a trailing section rather than
 * dropped — a permission that silently vanishes from the console is how an
 * admin ends up unable to grant something that exists.
 */
export function unmappedIds(
  permissionIds: string[],
  moduleIds: string[],
): { actions: string[]; modules: string[] } {
  return {
    actions: permissionIds.filter((id) => !MAPPED_ACTIONS.has(id)),
    modules: moduleIds.filter((id) => !MAPPED_MODULES.has(id)),
  };
}

/**
 * A role that grants no screens. Still valid — the holder is staff and can sign
 * in — but they will land on a Campaign Engine with an empty sidebar, so the
 * console says so rather than letting an admin discover it from the person who
 * cannot find anything.
 */
export function grantsNoScreens(modules: string[]): boolean {
  return modules.length === 0;
}
