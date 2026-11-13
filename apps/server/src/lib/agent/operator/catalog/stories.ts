import type { CatalogAction, CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'stories' pack (the Production System's editorial desk).
// See ./types.ts for the contract.
//
// The web side registers these in ProductionSystemLayout via
// apps/web/src/pages/production-system/operator/useStoryOperatorActions.ts, on
// the four screens that carry the "File a Story" button — so every story
// surface below exposes the SAME actions. Arg signatures mirror the zod schemas
// there; keep both in step.
//
// Stages, in order: draft → submitted → approved → scheduled → published.
// Legal moves: draft→submitted (Submit); submitted→approved (Approve) or
// →draft (Request changes); approved→scheduled (Schedule), →published (Publish
// now) or →submitted (Send back); scheduled→published (Publish) or →approved
// (Unschedule). Submit / send-back need stories.edit; approve / schedule /
// publish need stories.publish. Contributors only see their own stories.
// ---------------------------------------------------------------------------

const STAGE = "'draft' | 'submitted' | 'approved' | 'scheduled' | 'published'"

const STORY_ACTIONS: CatalogAction[] = [
  {
    name: 'stories.list',
    description:
      'List the stories visible to you (id, title, stage, author, category, changesRequested, scheduledFor). Filter by stage and/or search text (title, author, category). Use it to find a storyId before acting on a story by name.',
    args: `{ stage?: ${STAGE}; query?: string; limit?: number /* 1-100, default 50 */ }`,
  },
  {
    name: 'stories.open',
    description: "Open a story's reader page (/articles/:id). Leaves the Production System. storyId may also be the exact headline.",
    args: '{ storyId: string }',
  },
  {
    name: 'stories.createDraft',
    description:
      "THE way to file / write a story. You (The Stable Hand) write the text yourself — headline and the full story copy — and this types it visibly into File a Story → Write it yourself, picks the category pill, fills the byline and presses Save Draft. body is the full copy (paragraphs separated by a blank line; plain text, no markdown); summary is an optional teaser that becomes the opening paragraph (the card/news-index teaser) unless body already starts with it. category is one of: Race Reports, Industry News, Morning Edition, Form Guide, Track Notes, Bloodstock, Trainer Profiles, Jockey Desk, Owner Stories (label or slug). author defaults to the signed-in user (contributors are always their own byline). Never invent facts — ask the user for what you do not know. Returns { created: true, storyId, title, story }.",
    args: '{ title: string /* 1-300 chars */; summary?: string; body?: string; category?: string; author?: string }',
  },
  {
    name: 'stories.fileWithStudio',
    description:
      "Opens a SEPARATE AI drawer (Story Studio) on top of the screen, which then asks its own questions. Only use when the user explicitly asks for the Story Studio. Otherwise write the content yourself with stories.createDraft. Types the brief into the drawer and waits; returns { filed: true, storyId, title } once it files, or { filed: false, studioReply } — answer with stories.studioReply. newChat defaults to true.",
    args: '{ brief: string; newChat?: boolean }',
  },
  {
    name: 'stories.studioReply',
    description:
      "Only after stories.fileWithStudio: answer Story Studio's latest question in its drawer. Same return shape as stories.fileWithStudio. Never invent facts for a story.",
    args: '{ message: string }',
  },
  {
    name: 'stories.moveStage',
    description:
      "Move a story to another stage using the board's own buttons (Submit, Approve, Schedule, Publish, Request changes, Send back, Unschedule). Only legal one-step moves work. stage 'scheduled' needs scheduledFor (ISO date-time, future). note is the reason when sending back to draft. Publishing and scheduling ask the user to confirm.",
    args: `{ storyId: string; stage: ${STAGE}; scheduledFor?: string; note?: string }`,
    confirms: true,
  },
  {
    name: 'stories.edit',
    description:
      "Revise a story through the Revise the Story form, then Save Revision: headline, copy and/or category. You (The Stable Hand) write any new text yourself. body REPLACES the whole story copy (summary, if given, becomes its opening paragraph; summary alone replaces the copy too — pass the full text). Asks to confirm when the story is already published (live).",
    args: '{ storyId: string; title?: string; summary?: string; body?: string; category?: string }',
    confirms: true,
  },
  {
    name: 'stories.editBody',
    description:
      "Replace a story's full copy with new text you (The Stable Hand) wrote, typed into the Revise the Story form, then Save Revision. Same as stories.edit with only body. Asks to confirm when the story is live.",
    args: '{ storyId: string; body: string }',
    confirms: true,
  },
  {
    name: 'stories.delete',
    description: 'Delete a story from the board (an administrator can restore it). Needs stories.delete.',
    args: '{ storyId: string }',
    confirms: true,
  },
]

/** Anchors present on every story screen (top bar + shared dialogs + drawer). */
const SHARED_ANCHORS = [
  'story.file-button',
  'story.file-with-ai',
  'story.file-manual',
  'story.studio-panel',
  'story.studio-input',
  'story.studio-send',
  'story.studio-stop',
  'story.studio-new-chat',
  'story.studio-close',
  'story.title-input',
  'story.summary-input',
  'story.author-input',
  'story.category-<slug>',
  'story.category-clear',
  'story.form-discard-draft',
  'story.form-submit',
  'story.form-cancel',
  'story.delete-confirm',
  'story.delete-cancel',
]

const WHO = 'staff whose role includes this screen; filing needs stories.create'

export const SURFACES: CatalogSurface[] = [
  {
    id: 'stories-workflow',
    title: 'Workflow Board',
    route: '/production-system/workflow',
    who: `${WHO} (module workflow.view)`,
    purpose:
      'The story board: one column per stage (Draft, Submitted, Approved, Schedule Publish, Published), a card per story with its forward button and a ••• menu for other moves, edit and delete. The best screen for moving stories through the workflow.',
    actions: STORY_ACTIONS,
    anchors: [
      ...SHARED_ANCHORS,
      'story.column-<stage>',
      'story.column-<stage>.new',
      'story.card-<id>',
      'story.card-<id>.move-<stage>',
      'story.card-<id>.menu',
      'story.card-<id>.edit',
      'story.card-<id>.delete',
      'story.sendback-note',
      'story.sendback-confirm',
      'story.schedule-input',
      'story.schedule-confirm',
    ],
  },
  {
    id: 'stories-all',
    title: 'All Stories',
    route: '/production-system/all-stories',
    who: `${WHO} (module stories.view)`,
    purpose: 'A searchable table of every story you can see, with author, category, stage and an Edit link.',
    actions: STORY_ACTIONS,
    anchors: [...SHARED_ANCHORS, 'story.search-input', 'story.row-<id>.open', 'story.row-<id>.edit'],
  },
  {
    id: 'stories-overview',
    title: 'Production System Overview',
    route: '/production-system/overview',
    who: WHO,
    purpose: "The newsroom's front page: counts, the review queue and shortcuts. Story actions work here too (they use the same handlers as the board).",
    actions: STORY_ACTIONS,
    anchors: SHARED_ANCHORS,
  },
  {
    id: 'stories-pipeline',
    title: 'Pipeline Map',
    route: '/production-system/pipeline',
    who: `${WHO} (module pipeline.view)`,
    purpose: 'A read-only map of how many stories sit in each stage. Story actions work here too.',
    actions: STORY_ACTIONS,
    anchors: SHARED_ANCHORS,
  },
]
