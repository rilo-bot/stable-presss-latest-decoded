import {
  Newspaper,
  Tv,
  BookOpen,
  PenLine,
  Star,
  Users,
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

/**
 * SIX sections, one per destination.
 *
 * There were eight, and three of them — News, Analysis and Interviews — were the
 * SAME PAGE. Each loaded /news with a different `?section=`, so one page occupied
 * three of the eight tab slots and the nav implied three surfaces that do not
 * exist. They are now the three groups inside `News ▾`, which is what a dropdown
 * is for, and each group heads its own categories.
 *
 * Also changed:
 *   + Directory  /parties was PUBLIC and in no menu at all, desktop or mobile —
 *                reachable only by typing the URL.
 *   − Tipping    the ring is not launching with the site. The route still works;
 *                it is simply no longer advertised. Restore this entry to bring
 *                it back — nothing else was removed.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    // Stories: filed through the five-stage desk, categorised, dated. The blog is
    // a separate surface below — see the standfirsts on both pages.
    label: 'News',
    to: '/news',
    icon: <Newspaper size={14} />,
    sub: [
      {
        label: 'All News',
        to: '/news?section=news',
        description: 'Race reports, industry news, dispatches',
      },
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
      {
        label: 'Analysis',
        to: '/news?section=analysis',
        description: 'Form guides, track notes, bloodstock',
      },
      {
        label: 'Interviews',
        to: '/news?section=interviews',
        description: 'Trainers, jockeys and owners',
      },
    ],
  },
  {
    label: 'Blog',
    to: '/blog',
    icon: <PenLine size={14} />,
  },
  {
    label: 'Horses',
    to: '/horses',
    icon: <Star size={14} />,
  },
  {
    label: 'Directory',
    to: '/parties',
    icon: <Users size={14} />,
  },
  {
    label: 'Podcast',
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
  // "Blog" moved up to sit beside News — the two editorial surfaces belong next to
  // each other, not with Blog at the far end past Bulletins.
  //
  // "Tipping Ring" was here. /tipping still works and is still linked from the
  // footer; it is out of the nav and off the landing page until the ring launches.
];
