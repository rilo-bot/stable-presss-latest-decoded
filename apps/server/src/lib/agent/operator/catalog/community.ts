import type { CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'community' pack: Comments, Emoji Analytics, Analytics,
// Overview, Pipeline Map. See ./types.ts for the contract.
//
// Web side: apps/web/src/pages/production-system/operator-community/
//   useCommentsOperatorActions.ts   (CommentModerationScreen)
//   useReactionsOperatorActions.ts  (EmojiAnalyticsScreen)
//   useAnalyticsOperatorActions.ts  (AnalyticsScreen, PipelineMapScreen)
//   useOverviewOperatorActions.ts   (OverviewScreen)
// Arg signatures mirror the zod schemas there; keep both in step. core.ts has
// the same routes with no actions (renderCatalog merges them).
// ---------------------------------------------------------------------------

const PS = '/production-system'

export const SURFACES: CatalogSurface[] = [
  {
    id: 'community-comments',
    title: 'Comments (moderation)',
    route: `${PS}/comments`,
    who: 'Staff with comments.view; loading the queue and remove/restore need comments.edit, delete needs comments.delete.',
    purpose:
      'Reader comments on stories, blog posts and editions. Tabs: Reported (most-reported first, the default), Removed, Everything. Nothing is auto-hidden; there is no approve and no ban — a reported comment stays up until someone removes it.',
    actions: [
      {
        name: 'community.listComments',
        description:
          'Read the queue (switches tab visibly when filter is given; hidden = Removed): counts plus each comment id, author, text, stance, report count, removed + reason, where posted. Lists the first 60 rows (notListed = the rest).',
        args: "{ filter?: 'reported' | 'hidden' | 'all' }",
      },
      {
        name: 'community.removeComment',
        description:
          'Remove (hide) a comment: Remove → types the reason → Remove it. Reason is staff-only; readers see "removed by an editor". Reversible.',
        args: '{ id: string; reason: string }',
        confirms: true,
      },
      {
        name: 'community.restoreComment',
        description: 'Restore a removed comment (opens the Removed tab if needed).',
        args: '{ id: string }',
        confirms: true,
      },
      {
        name: 'community.deleteComment',
        description: 'Delete a comment entirely — no tombstone, cannot be restored. Prefer removeComment unless asked.',
        args: '{ id: string }',
        confirms: true,
      },
    ],
    anchors: [
      'community.filter-reported',
      'community.filter-hidden',
      'community.filter-all',
      'community.queue',
      'community.comment-<id>',
      'community.remove-<id>',
      'community.restore-<id>',
      'community.delete-<id>',
    ],
  },
  {
    id: 'community-emoji-analytics',
    title: 'Emoji Analytics',
    route: `${PS}/emoji-analytics`,
    who: 'Staff with emoji-analytics.view (the data also needs analytics.view server-side).',
    purpose:
      'Reader reactions on the seven-point emoji scale (reallyHate −5 … love +5) for stories, blogs, blog parts and bulletins. Controls: Date range (7 / 30 / 90 days / all time, by when the reaction was made), Content type, Who counts (readers vs everyone incl. staff), Rank by (score or one emoji). No views or traffic are tracked. Answer reaction questions ("most reactions this week") from readReactions, after setting range 7 for "this week".',
    actions: [
      {
        name: 'analytics.readReactions',
        description:
          'The figures on screen: range, totals (reactions, readers, score, mood, for/against %), every emoji count, on-screen leaderboard, mostReactions + highestScore (all reacted items, no minimum; type narrows them), per-type figures.',
        args: "{ top?: number; type?: 'story' | 'blog' | 'blogPart' | 'bulletin' }",
      },
      {
        name: 'analytics.setReactionFilters',
        description:
          "Click the screen's controls, wait for the report, return the same as readReactions. types [] = Everything; rankBy 'score' or an emoji key/label.",
        args: "{ range?: '7' | '30' | '90' | 'all'; types?: string[]; audience?: 'readers' | 'everyone'; rankBy?: string; top?: number }",
      },
    ],
    anchors: [
      'analytics.range-7',
      'analytics.range-30',
      'analytics.range-90',
      'analytics.range-all',
      'analytics.type-all',
      'analytics.type-<story|blog|blogPart|bulletin>',
      'analytics.audience-readers',
      'analytics.audience-everyone',
      'analytics.rank-<score|emojiKey>',
      'analytics.total-score',
      'analytics.total-reactions',
      'analytics.leaderboard',
    ],
  },
  {
    id: 'community-analytics',
    title: 'Analytics',
    route: `${PS}/analytics`,
    who: 'Staff with analytics.view.',
    purpose: 'Four story tiles: Total Published, Scheduled, Total Stories, In Pipeline (= Submitted, awaiting review). No traffic analytics.',
    actions: [
      {
        name: 'analytics.readStoryTiles',
        description: 'Read the four tiles with what each counts.',
        args: '{}',
      },
    ],
    anchors: ['analytics.tile-published', 'analytics.tile-scheduled', 'analytics.tile-total', 'analytics.tile-in-pipeline'],
  },
  {
    id: 'community-overview',
    title: 'Overview',
    route: `${PS}/overview`,
    who: 'All staff (contributors see their own stories only).',
    purpose:
      'The desk home: an AI-written brief, story figures, register ledger, Needs your attention queue links, story pipeline counts, Start-something cards (only those the role may use) and recent stories.',
    actions: [
      {
        name: 'overview.readOverview',
        description: 'Read everything on the Overview as this role sees it (brief, figures, ledger, attention items with ids, pipeline, Start cards, recent stories).',
        args: '{}',
      },
      {
        name: 'overview.startSomething',
        description: "Click a Start-something card by key or title ('instant', 'blogs', 'magazine') and open its screen.",
        args: '{ card: string }',
      },
      {
        name: 'overview.openAttention',
        description: 'Click a Needs-your-attention row (by id or label) to open that queue.',
        args: '{ item: string }',
      },
      {
        name: 'overview.refreshBrief',
        description: 'Press Refresh on the brief and return the newly written text.',
        args: '{}',
      },
    ],
    anchors: [
      'overview.brief',
      'overview.refresh-brief',
      'overview.attention',
      'overview.attention-<id>',
      'overview.pipeline',
      'overview.stage-<status>',
      'overview.start-<key>',
      'overview.recent',
    ],
  },
  {
    id: 'community-pipeline',
    title: 'Pipeline Map',
    route: `${PS}/pipeline`,
    who: 'Staff with pipeline.view.',
    purpose: 'Read-only map of the five workflow stages with how many stories sit in each.',
    actions: [
      {
        name: 'pipeline.readStages',
        description: 'Read every stage in order: status, label, story count and the moves out of it, plus the total.',
        args: '{}',
      },
    ],
    anchors: ['pipeline.map', 'pipeline.stage-<status>', 'pipeline.count-<status>'],
  },
]
