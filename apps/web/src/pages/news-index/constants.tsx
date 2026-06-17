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

/* ── Static featured editorial (shown when no articles yet) ── */

export const EDITORIAL_FEATURES = [
  {
    id: 'ef1',
    section: 'Analysis',
    title: 'The Flemington Straight: Why the 1000m Bias Has Shifted',
    author: 'Sarah Ellison',
    time: '10 min read',
    category: 'form-guide',
    imageUrl:
      'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef2',
    section: 'Interview',
    title: 'Trainer Evelyn Cross: Twelve Group Ones and Counting',
    author: 'Catherine Darragh',
    time: '8 min read',
    category: 'trainer-profiles',
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef3',
    section: 'Bloodstock',
    title: 'Northern Hemisphere Stallions and Their Australian Influence',
    author: 'James Whitfield',
    time: '12 min read',
    category: 'bloodstock',
    imageUrl:
      'https://images.pexels.com/photos/11341144/pexels-photo-11341144.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef4',
    section: 'Race Report',
    title: 'Sovereign Streak Wins Flemington Feature in Dominant Fashion',
    author: 'Tom McAllister',
    time: '6 min read',
    category: 'race-reports',
    imageUrl:
      'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef5',
    section: 'Jockey Desk',
    title: 'The Art of the Hold-up Ride: Luke Dittman on Patience and Precision',
    author: 'Rebecca Frame',
    time: '9 min read',
    category: 'jockey-desk',
    imageUrl:
      'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  },
  {
    id: 'ef6',
    section: 'Morning Edition',
    title: "Saturday's Stable Reports: Randwick Scratching and Market Movers",
    author: 'Editorial Desk',
    time: '4 min read',
    category: 'morning-edition',
    imageUrl:
      'https://images.pexels.com/photos/18913040/pexels-photo-18913040.jpeg?auto=compress&cs=tinysrgb&h=350',
  },
];

/* ── Helpers ─────────────────────────────────────────── */

/** Articles that are visible on the public index */
export const LIVE_STATUSES = ['published', 'newsletter', 'bulletin'] as const;

export function isLive(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status);
}
