import type { CatalogSurface } from './types.js'

// Operator catalog — 'profile' pack. See ./types.ts for the contract.
//
// Web side: apps/web/src/agent/profile/useStudioOperatorActions.ts, registered
// by whichever Stable Studio chat is mounted (ProfileAgentPanel, or the
// OnboardingGuide popover during onboarding). Both studio routes share it.
// Names and arg shapes here MUST match the zod schemas there.

const studioActions: CatalogSurface['actions'] = [
  {
    name: 'profile.read',
    description: 'Read the open profile: its current field values, which fields are empty, connections, and any staged suggestions.',
    args: '{}',
  },
  {
    name: 'profile.askStudio',
    description:
      "Type a request into this profile's Stable Studio assistant and send it (e.g. \"fill in the pedigree\", \"suggest a pull-quote\"); waits for the reply and returns it with changedDirectly (fields it edited) and connectionsChanged. The studio EDITS THE PROFILE DIRECTLY — those changes are saved; profile.undo reverts the last one. Ask it for one clear change at a time and check the result.",
    args: '{ prompt: string }',
  },
  {
    name: 'profile.applyProposals',
    description: "Save staged suggestions (all, or the given ids) by pressing their Apply buttons. Only needed when profile.read / askStudio report staged items — the studio normally edits directly and stages nothing. Undo can revert.",
    args: '{ ids?: string[] /* omit for all */ }',
    confirms: true,
  },
  {
    name: 'profile.discardProposals',
    description: "Throw away the studio's staged suggestions (all, or the given ids). Nothing is saved.",
    args: '{ ids?: string[] }',
  },
  {
    name: 'profile.undo',
    description: 'Undo the last change applied from the studio.',
    args: '{}',
  },
]

const studioAnchors = [
  'profile.studio-launcher',
  'profile.studio-panel',
  'profile.studio-input',
  'profile.studio-send',
  'profile.studio-stop',
  'profile.studio-close',
  'profile.studio-undo',
  'profile.studio-apply-all',
  'profile.studio-discard-all',
  'profile.proposal-apply-<id>',
  'profile.proposal-discard-<id>',
]

export const SURFACES: CatalogSurface[] = [
  {
    id: 'profile-horse-studio',
    title: 'Horse Studio',
    route: '/studio/horse/:id',
    who: 'staff, or the horse\'s owner/trainer (anyone who may manage the horse)',
    purpose:
      "The editable horse profile with its built-in Stable Studio AI assistant. To fill pedigree, racing summary, identity or connections, ask the studio (profile.askStudio) rather than typing fields yourself; it saves its edits directly (profile.undo reverts), so verify with profile.read. Find the :id with registers.searchHorses (studioPath).",
    actions: studioActions,
    anchors: studioAnchors,
  },
  {
    id: 'profile-person-studio',
    title: 'Profile Studio (person)',
    route: '/studio/:id',
    who: 'staff, or the person who claimed the profile',
    purpose:
      "The editable person profile (owner, trainer, jockey …) with the same Stable Studio assistant. Use profile.askStudio for changes (saved directly; profile.undo reverts) and profile.read to verify. Find the :id with registers.searchPeople (studioPath).",
    actions: studioActions,
    anchors: studioAnchors,
  },
]
