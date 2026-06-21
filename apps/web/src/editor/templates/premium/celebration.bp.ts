/**
 * Premium template — Owners Celebration Wall (template #2).
 *
 * Premium-styled version of the classic `celebration` page. Same region names
 * and copy as the classic blueprint, restyled for the premium house design:
 * gold star accents on the navy band, a navy "Best Ownership Image" panel, two
 * owner-of-the-month profiles, a GAVELHOUSE.COM sponsor strip and a row of
 * gold date chips for the upcoming events.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, icon, STOCK, P, GOLD, NAVY } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy

export const celebrationPx: PageBlueprint = mkPage('celebration-wall-px', 'Owners Celebration Wall', {
  // Header band — section label + gold star accents
  band: text('OWNERS CELEBRATION WALL', P.bandLabel),
  bandIcon: icon('Star', GOLD),

  // Headline block
  h1a: text('CELEBRATING OUR', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('CHAMPIONS', { ...P.displayGold, fontSize: 34 }),
  sub: text('Our owners. Our pride. Our sport.', { ...P.scriptGold, fontSize: 20 }),
  body: text('Every win is a moment to remember. Every owner is part of our story. Thank you for making it possible.', { ...P.body, fontSize: 11.5 }),
  championsImg: img(STOCK.crowd2, 'cover'),

  // Best ownership image of the quarter (navy panel)
  quarterTitle: text('BEST OWNERSHIP IMAGE OF THE QUARTER', { ...P.kickerGold, fontSize: 10.5 }),
  quarterImg: img(STOCK.crowd, 'cover'),
  quarterCap: text('Joy. Friendship. The thrill of victory. Moments like these are why we own racehorses.', { ...P.caption, color: LIGHT }),

  // Owners of the month — two profiles
  monthTitle: text('OWNERS OF THE MONTH', { ...P.kickerNavy, fontSize: 12 }),
  month1Img: img(STOCK.women, 'cover'),
  month1Body: text("<b>The O'Sullivan Syndicate</b> — a fantastic run of results and a perfect example of teamwork and passion.", { ...P.bodySmall, fontSize: 10.5 }),
  month2Img: img(STOCK.champagne, 'cover'),
  month2Body: text('<b>Emma &amp; James Harrison</b> — breeders, owners and race-day regulars whose dedication continues to inspire.', { ...P.bodySmall, fontSize: 10.5 }),

  // Sponsor strip
  sponsorIcon: icon('Award', GOLD),
  sponsorBand: text('PROUDLY SUPPORTED BY GAVELHOUSE.COM — Supporting owners. Celebrating success. Investing in the future.', { ...P.kickerWhite, fontSize: 9.5 }),

  // Major upcoming ownership events — date chips
  eventsTitle: text('MAJOR UPCOMING OWNERSHIP EVENTS', { ...P.kickerGold, fontSize: 12 }),
  eventsIcon: icon('Calendar', NAVY),
  event1Date: text('MAY 24', { ...P.bandLabel, color: NAVY, fontSize: 13 }),
  event1: text("Owners' Raceday, Ellerslie", { ...P.bodySmall, fontSize: 10 }),
  event2Date: text('JUNE 13', { ...P.bandLabel, color: NAVY, fontSize: 13 }),
  event2: text('Owners &amp; Breeders Function, Cambridge', { ...P.bodySmall, fontSize: 10 }),
  event3Date: text('JULY 18', { ...P.bandLabel, color: NAVY, fontSize: 13 }),
  event3: text('Young Owners Networking Night, Auckland', { ...P.bodySmall, fontSize: 10 }),
  event4Date: text('AUG 30', { ...P.bandLabel, color: NAVY, fontSize: 13 }),
  event4: text('NZTROF National Owners Forum, Wellington', { ...P.bodySmall, fontSize: 10 }),

  footer: text("MORE THAN A SPORT. IT'S A COMMUNITY. IT'S A LIFESTYLE. IT'S OURS.", P.footer),
  pageNum: text('PAGE 10', { ...P.footer, align: 'right' }),
});
