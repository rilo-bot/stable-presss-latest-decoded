import {
  Newspaper,
  BarChart2,
  Mic,
  Tv,
  BookOpen,
  HelpCircle,
  PenLine,
  Star,
  Mail,
} from 'lucide-react';

export interface SubItem {
  label: string;
  to: string;
  description: string;
}

export interface NavSection {
  label: string;
  to: string;
  icon: React.ReactNode;
  sub?: SubItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'News',
    to: '/news?section=news',
    icon: <Newspaper size={14} />,
    sub: [
      {
        label: 'Race Reports',
        to: '/news?category=race-reports',
        description: 'Post-race analysis and results',
      },
      {
        label: 'Industry News',
        to: '/news?category=industry-news',
        description: 'Transfers, injuries, ownership',
      },
      {
        label: 'Morning Edition',
        to: '/news?category=morning-edition',
        description: "Today's stables dispatch",
      },
    ],
  },
  {
    label: 'Analysis',
    to: '/news?section=analysis',
    icon: <BarChart2 size={14} />,
    sub: [
      {
        label: 'Form Guide',
        to: '/news?category=form-guide',
        description: 'Deep-dive speed and class ratings',
      },
      {
        label: 'Track Notes',
        to: '/news?category=track-notes',
        description: 'Going reports and configurations',
      },
      {
        label: 'Bloodstock',
        to: '/news?category=bloodstock',
        description: 'Pedigree and breeding analysis',
      },
    ],
  },
  {
    label: 'Interviews',
    to: '/news?section=interviews',
    icon: <Mic size={14} />,
    sub: [
      {
        label: 'Trainer Profiles',
        to: '/news?category=trainer-profiles',
        description: 'In-depth trainer conversations',
      },
      {
        label: 'Jockey Desk',
        to: '/news?category=jockey-desk',
        description: 'Rider perspectives and form',
      },
      {
        label: 'Owner Stories',
        to: '/news?category=owner-stories',
        description: 'The people behind the horses',
      },
    ],
  },
  {
    label: 'Horses',
    to: '/horses',
    icon: <Star size={14} />,
  },
  {
    label: 'Podcasts',
    to: '/podcast',
    icon: <Tv size={14} />,
  },
  // A "Newsletter" section sat here, pointing at /newsletter and at four
  // ?category= cuts of it. Both are gone: the page listed stories carrying a
  // `newsletter` distribution channel, and that axis was removed — a published
  // story is news. Every category cut it offered exists under /news.
  {
    label: 'Bulletins',
    to: '/bulletins',
    icon: <BookOpen size={14} />,
    // No ?category= sub-links. /bulletins is the magazine newsstand now and does
    // not read a category param — those four rows navigated to a filter that
    // silently did nothing.
    sub: [
      {
        label: 'All Editions',
        to: '/bulletins',
        description: 'Every published bulletin edition',
      },
      {
        label: 'Subscribe',
        to: '/signup',
        description: 'Get the bulletin delivered',
      },
    ],
  },
  {
    label: 'Blog',
    to: '/blog',
    icon: <PenLine size={14} />,
  },
  {
    label: 'Tipping Ring',
    to: '/tipping',
    icon: <HelpCircle size={14} />,
  },
];
