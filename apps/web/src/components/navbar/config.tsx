import {
  Newspaper,
  BarChart2,
  Mic,
  Tv,
  BookOpen,
  HelpCircle,
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
  {
    label: 'Newsletter',
    to: '/newsletter',
    icon: <Mail size={14} />,
    sub: [
      {
        label: 'All Editions',
        to: '/newsletter',
        description: 'Full newsletter archive',
      },
      {
        label: 'Race Reports',
        to: '/newsletter?category=race-reports',
        description: 'Race results and analysis',
      },
      {
        label: 'Form Guide',
        to: '/newsletter?category=form-guide',
        description: 'Sectional and speed data',
      },
      {
        label: 'Trainer Profiles',
        to: '/newsletter?category=trainer-profiles',
        description: 'In-depth trainer conversations',
      },
    ],
  },
  {
    label: 'Bulletins',
    to: '/bulletins',
    icon: <BookOpen size={14} />,
    sub: [
      {
        label: 'All Editions',
        to: '/bulletins',
        description: 'Full fortnightly bulletin archive',
      },
      {
        label: 'Bloodstock',
        to: '/bulletins?category=bloodstock',
        description: 'Pedigree and breeding intelligence',
      },
      {
        label: 'Trainer Profiles',
        to: '/bulletins?category=trainer-profiles',
        description: 'Longform trainer conversations',
      },
      {
        label: 'Form Analysis',
        to: '/bulletins?category=form-guide',
        description: 'Deep sectional and class analysis',
      },
      {
        label: 'Subscribe',
        to: '/signup',
        description: 'Get the bulletin delivered',
      },
    ],
  },
  {
    label: 'Tipping Ring',
    to: '/tipping',
    icon: <HelpCircle size={14} />,
  },
];
