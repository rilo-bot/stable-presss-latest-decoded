import { Newspaper, BarChart2, Mic } from 'lucide-react';

/* ── Category taxonomy ───────────────────────────────── */

export interface CategoryDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  section: 'news' | 'analysis' | 'interviews';
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  // News
  {
    key: 'race-reports',
    label: 'Race Reports',
    icon: <Newspaper size={14} />,
    section: 'news',
    description: "Post-race analysis, results, and stewards' decisions from the track.",
  },
  {
    key: 'industry-news',
    label: 'Industry News',
    icon: <Newspaper size={14} />,
    section: 'news',
    description: 'Transfers, injuries, ownership changes, and industry developments.',
  },
  {
    key: 'morning-edition',
    label: 'Morning Edition',
    icon: <Newspaper size={14} />,
    section: 'news',
    description: "Today's stables dispatch — stable reports, scratchings, and early market moves.",
  },
  // Analysis
  {
    key: 'form-guide',
    label: 'Form Guide',
    icon: <BarChart2 size={14} />,
    section: 'analysis',
    description: 'Deep-dive speed ratings, class assessments, and sectional analysis.',
  },
  {
    key: 'track-notes',
    label: 'Track Notes',
    icon: <BarChart2 size={14} />,
    section: 'analysis',
    description: 'Going reports, track configurations, and bias assessments.',
  },
  {
    key: 'bloodstock',
    label: 'Bloodstock',
    icon: <BarChart2 size={14} />,
    section: 'analysis',
    description: 'Pedigree analysis, stallion updates, and breeding trends.',
  },
  // Interviews
  {
    key: 'trainer-profiles',
    label: 'Trainer Profiles',
    icon: <Mic size={14} />,
    section: 'interviews',
    description: 'Long-form conversations with the trainers shaping the sport.',
  },
  {
    key: 'jockey-desk',
    label: 'Jockey Desk',
    icon: <Mic size={14} />,
    section: 'interviews',
    description: 'Rider perspectives, riding patterns, and form from the saddle.',
  },
  {
    key: 'owner-stories',
    label: 'Owner Stories',
    icon: <Mic size={14} />,
    section: 'interviews',
    description: 'The people behind the horses — their passion, partnerships, and ambitions.',
  },
];

export const SECTIONS = [
  {
    key: 'news',
    label: 'News',
    icon: <Newspaper size={15} />,
    description: 'Race results, industry updates, and daily dispatches from the track.',
  },
  {
    key: 'analysis',
    label: 'Analysis',
    icon: <BarChart2 size={15} />,
    description: 'Form guides, track notes, and bloodstock intelligence from our expert panel.',
  },
  {
    key: 'interviews',
    label: 'Interviews',
    icon: <Mic size={15} />,
    description: 'In-depth conversations with trainers, jockeys, and the owners who drive the sport.',
  },
] as const;

/* Removed: EDITORIAL_FEATURES — a hardcoded array of six fabricated articles
   (fake bylines, headlines, and reading times) that rendered on /news whenever
   the CMS had zero live articles. The empty state now shows only the honest
   "No dispatches have been filed" CTA in NewsIndex. Real articles come from
   useArticleStore; nothing should stand in for them. */

/* ── Helpers ─────────────────────────────────────────── */

/* `LIVE_STATUSES` / `isLive(status)` lived here, listing the three statuses that
 * counted as public: published, newsletter, bulletin. Newsletter and bulletin
 * became distribution channels rather than statuses, and then stopped being
 * either — a published story is news. So "live" is one status, and the check
 * belongs with the type: `isLive(article)` in `@/types/article`. */
