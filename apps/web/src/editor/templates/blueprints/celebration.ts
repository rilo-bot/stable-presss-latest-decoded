import { mkPage, text, img, STOCK, P } from './_shared';

// ── 12. Owners Celebration Wall ─────────────────────────────────────
export const celebration = mkPage('celebration-wall', 'Owners Celebration Wall', {
  band: text('★  OWNERS CELEBRATION WALL  ★', P.bandLabel),
  h1a: text('CELEBRATING OUR', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('CHAMPIONS', { ...P.displayGold, fontSize: 30 }),
  sub: text('Our owners. Our pride. Our sport.', P.scriptGold),
  body: text('Every win is a moment to remember. Every owner is part of our story. Thank you for making it possible.', P.bodySmall),
  championsImg: img(STOCK.crowd2, 'cover'),
  quarterTitle: text('BEST OWNERSHIP IMAGE OF THE QUARTER', P.kickerNavy),
  quarterImg: img(STOCK.crowd, 'cover'),
  quarterCap: text('Joy. Friendship. The thrill of victory. Moments like these are why we own racehorses.', P.caption),
  monthTitle: text('OWNERS OF THE MONTH', P.kickerNavy),
  month1Img: img(STOCK.women, 'cover'),
  month1Body: text('<b>The O\'Sullivan Syndicate</b> — a fantastic run of results and a perfect example of teamwork and passion.', P.bodySmall),
  month2Img: img(STOCK.champagne, 'cover'),
  month2Body: text('<b>Emma & James Harrison</b> — breeders, owners and race-day regulars whose dedication continues to inspire.', P.bodySmall),
  sponsorBand: text('PROUDLY SUPPORTED BY GAVELHOUSE.COM — Supporting owners. Celebrating success. Investing in the future.', { ...P.kickerWhite, fontSize: 9 }),
  eventsTitle: text('MAJOR UPCOMING OWNERSHIP EVENTS', P.kickerGold),
  event1: text('<b>MAY 24</b> — Owners\' Raceday, Ellerslie', P.bodySmall),
  event2: text('<b>JUNE 13</b> — Owners & Breeders Function, Cambridge', P.bodySmall),
  event3: text('<b>JULY 18</b> — Young Owners Networking Night, Auckland', P.bodySmall),
  event4: text('<b>AUG 30</b> — NZTROF National Owners Forum, Wellington', P.bodySmall),
  footer: text('MORE THAN A SPORT. IT\'S A COMMUNITY. IT\'S A LIFESTYLE. IT\'S OURS.', P.footer),
  pageNum: text('PAGE 10', { ...P.footer, align: 'left' }),
});
