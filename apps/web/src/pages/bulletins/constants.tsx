import { Newspaper, BarChart2, Mic } from 'lucide-react';

/* ── Section icon map ────────────────────────────────── */

export const SECTION_ICONS: Record<string, React.ReactNode> = {
  news: <Newspaper size={13} />,
  analysis: <BarChart2 size={13} />,
  interviews: <Mic size={13} />,
};

/* ── Section fallback imagery ────────────────────────── */

export const SECTION_IMAGES: Record<string, string> = {
  news: 'https://images.pexels.com/photos/12995066/pexels-photo-12995066.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  analysis: 'https://images.pexels.com/photos/27305774/pexels-photo-27305774.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  interviews: 'https://images.pexels.com/photos/7882582/pexels-photo-7882582.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
};

/* ── Race Venue locations for the map ───────────────── */

export const RACE_VENUES = [
  { name: 'Flemington Racecourse', location: 'Flemington, Melbourne VIC' },
  { name: 'Royal Randwick', location: 'Randwick, Sydney NSW' },
  { name: 'Eagle Farm Racecourse', location: 'Eagle Farm, Brisbane QLD' },
  { name: 'Morphettville', location: 'Morphettville, Adelaide SA' },
  { name: 'Ascot Racecourse', location: 'Ascot, Perth WA' },
];
