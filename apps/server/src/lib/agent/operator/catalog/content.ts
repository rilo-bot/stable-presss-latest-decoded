import type { CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'content' pack: Podcast, Instant Capture, Site Content.
// See ./types.ts for the contract. Same routes as core.ts's ps-podcast /
// ps-instant / site-content surfaces (renderCatalog merges them).
//
// Web side: apps/web/src/pages/production-system/operator-content/
//   usePodcastOperatorActions.ts      (registered by screens/PodcastScreen)
//   useInstantOperatorActions.ts      (registered by pages/instant/InstantWorkspace)
//   useSiteContentOperatorActions.ts  (registered by pages/SiteContent)
// Names and arg shapes MUST match the zod schemas there. Kept terse: every
// character here is in the cached static prompt.
// ---------------------------------------------------------------------------

export const SURFACES: CatalogSurface[] = [
  {
    id: 'content-podcast',
    title: 'Podcast production',
    route: '/production-system/podcast',
    who: 'podcast.view; create needs podcast.create, workflow steps podcast.edit on your own episodes (or Everyone scope), scheduling/publishing podcast.publish',
    purpose:
      'Episode cards + a drawer per episode. Workflow: draft → audio_uploaded (needs audio) → guests_added (needs ≥1 guest) → description_written → scheduled (needs a date) → in_review → published. `episode` = id, title or "s1e3".',
    actions: [
      { name: 'podcast.list', description: 'Episodes with stage, producer, guests, channels and the next step.', args: '{ status?: string }' },
      {
        name: 'podcast.create',
        description: 'New episode dialog, fields typed; saves a draft.',
        args: '{ title: string; host?: string; season?: number; episodeNumber?: number; durationMinutes?: number; description?: string; audioUrl?: string; coverUrl?: string }',
      },
      {
        name: 'podcast.advance',
        description:
          "ONE stage forward via the drawer's Next-step button. From draft pass audioUrl (or first upload the user's file to podcast.audio); scheduling needs publishDate.",
        args: "{ episode: string; audioUrl?: string; publishDate?: string /* 'YYYY-MM-DD' */ }",
        confirms: true,
      },
      { name: 'podcast.addGuest', description: 'Add a guest on the Guests tab.', args: '{ episode: string; name: string; title?: string; bio?: string }' },
      {
        name: 'podcast.setChannels',
        description: 'Exact distribution channels (spotify, apple_podcasts, rss_feed, website, newsletter).',
        args: '{ episode: string; channels: string[] }',
      },
      { name: 'podcast.sendBack', description: 'In Review → Scheduled (Return for Revisions).', args: '{ episode: string }' },
      { name: 'podcast.publish', description: 'Approve & Publish an In Review episode (goes live).', args: '{ episode: string }', confirms: true },
      { name: 'podcast.unpublish', description: 'Take a published episode down (back to In Review).', args: '{ episode: string }', confirms: true },
    ],
    anchors: ['podcast.new', 'podcast.episode-<id>', 'podcast.filter-<status>', 'podcast.tab-<overview|guests|distribution|review>', 'podcast.audio (upload target)', 'podcast.cover (upload target)', 'podcast.create-cover'],
  },
  {
    id: 'content-instant',
    title: 'Instant Capture',
    route: '/production-system/instant',
    who: 'instant.view; filing a story needs stories.create, a blog post blogs.create',
    purpose:
      "Capture (topic, photos, voice-note facts) → AI draft → review → file as a DRAFT story or blog post. For a photo the user attached, call upload({agentId:'instant.photo-input'}) before instant.capture. Show the draft in chat and get approval before instant.file.",
    actions: [
      { name: 'instant.read', description: 'Step, mode, topic, voice note, photos and the draft under review.', args: '{}' },
      {
        name: 'instant.capture',
        description: 'Fill the capture and press Generate draft; returns the AI draft. voiceNote = facts the AI treats as certain.',
        args: "{ topic?: string; voiceNote?: string; mode?: 'story' | 'blog'; generate?: boolean }",
      },
      {
        name: 'instant.editDraft',
        description: 'Edit the draft under review (story: title/body/category/tags; blog: title/subtitle/excerpt/tags).',
        args: '{ title?: string; body?: string; category?: string; tags?: string[]; subtitle?: string; excerpt?: string }',
      },
      { name: 'instant.file', description: 'Save the reviewed draft as a DRAFT (a post opens in the composer).', args: '{}', confirms: true },
    ],
    anchors: ['instant.photo-input', 'instant.add-photos', 'instant.topic', 'instant.generate', 'instant.save'],
  },
  {
    id: 'content-site',
    title: 'Site Content',
    route: '/site-content',
    who: 'staff (admin)',
    purpose:
      "The public landing page's breaking-news ticker (every live headline shows) and sponsors strip. Changes are live at once. `headline` / `sponsor` = id or text / name.",
    actions: [
      { name: 'site.readContent', description: 'Ticker headlines (live or hidden) and sponsors.', args: '{}' },
      { name: 'site.addSponsor', description: 'Add a sponsor via the form.', args: '{ name: string; category?: string; tagline?: string; websiteUrl?: string }' },
      {
        name: 'site.editSponsor',
        description: 'Edit a sponsor in place (pencil → Save).',
        args: '{ sponsor: string; name?: string; category?: string; tagline?: string; websiteUrl?: string }',
      },
      { name: 'site.removeSponsor', description: 'Delete a sponsor.', args: '{ sponsor: string }', confirms: true },
      { name: 'site.addHeadline', description: 'Put a new headline on the live ticker; only:true hides the others.', args: '{ text: string; only?: boolean }', confirms: true },
      { name: 'site.showHeadline', description: 'Show or hide an existing headline.', args: '{ headline: string; show: boolean }', confirms: true },
      { name: 'site.removeHeadline', description: 'Delete a headline.', args: '{ headline: string }', confirms: true },
      { name: 'site.clearTicker', description: 'Hide every live headline (nothing deleted).', args: '{}', confirms: true },
    ],
  },
]
