import type { CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'settings' pack. See ./types.ts for the contract.
//
// Web side: apps/web/src/pages/production-system/operator/
// useSettingsOperatorActions.ts, registered by the Website Customisation card
// in apps/web/src/pages/newsroom/views/SettingsView.tsx. Arg signatures mirror
// the zod schemas there; keep both in step. core.ts's 'ps-settings' surface is
// the same route (renderCatalog merges them).
//
// Section keys (labels in brackets): news (News), blog (Blog), horses (Horses),
// directory (Directory), podcast (Podcast), bulletins (Bulletins). Hiding a
// section removes it from the public navbar and redirects its pages home; it
// does NOT unpublish anything. At least one must stay visible.
// ---------------------------------------------------------------------------

export const SURFACES: CatalogSurface[] = [
  {
    id: 'settings-screen',
    title: 'Settings',
    route: '/production-system/settings',
    who: 'staff with settings.view; changing website sections needs settings.edit',
    purpose:
      "Website Customisation: six checkboxes (News, Blog, Horses, Directory, Podcast, Bulletins) deciding which public sections the live site shows, saved with 'Save changes'. Below it, four READ-ONLY Publication facts (Publication Name, Default Category, Approval Steps, Workflow Stages) — they describe the built-in workflow and cannot be edited anywhere in the UI; say so if asked to change them.",
    actions: [
      {
        name: 'settings.read',
        description:
          'Read the screen: each website section (key, label, path, visible on the live site), whether you may edit, and the read-only Publication facts.',
        args: '{}',
      },
      {
        name: 'settings.setSections',
        description:
          "Show or hide public website sections: ticks / unticks the section checkboxes visibly, then presses Save changes. Either visible (the COMPLETE list that should be shown; everything else is hidden) or hide / show lists (others unchanged). Sections by key or label (news, blog, horses, directory, podcast, bulletins). Always asks the user to confirm (it changes the live site). Returns the saved state.",
        args: '{ visible?: string[]; hide?: string[]; show?: string[] }',
        confirms: true,
      },
    ],
    anchors: [
      'settings.section-news',
      'settings.section-blog',
      'settings.section-horses',
      'settings.section-directory',
      'settings.section-podcast',
      'settings.section-bulletins',
      'settings.save',
      'settings.discard',
      'settings.publication-name',
      'settings.default-category',
      'settings.approval-steps',
      'settings.workflow-stages',
    ],
  },
]
