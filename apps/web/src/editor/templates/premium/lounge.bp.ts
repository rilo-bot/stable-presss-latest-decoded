import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea';
const ROLE_GOLD = '#8a6b1e';

// ── Owners Lounge (premium, cream page) ─────────────────────────────
// "The best part of racing? The people." — a labelled photo collage of
// race-day gatherings, owners bars, family groups, syndicates and
// celebrations, a navy pull-quote tile, and a view-galleries QR row.
const tile = (i: number, photo: string, cap: string) => ({
  [`photo${i}`]: img(photo, 'cover'),
  [`photo${i}Cap`]: text(cap, { ...P.qrLabel, color: ROLE_GOLD }),
});

export const loungePx: PageBlueprint = mkPage('owners-lounge-px', 'Owners Lounge', {
  // Header band
  band: text('OWNERS LOUNGE', P.bandLabel),
  bandIcon: icon('Users', GOLD),

  // Headline block
  h1a: text('THE BEST PART', { ...P.displayNavy, fontSize: 38 }),
  h1b: text('OF RACING?', { ...P.displayGold, fontSize: 38 }),
  sub: text('The people.', { ...P.scriptGold, fontSize: 26 }),
  lead: text(
    'Friendships. Shared dreams. Unforgettable days. People buy ownership because of the people.',
    { ...P.pullQuote, color: ROLE_GOLD, fontSize: 15 }
  ),

  // Labelled photo tiles
  ...tile(1, STOCK.champagne, 'RACE-DAY GATHERINGS'),
  ...tile(2, STOCK.crowd, 'OWNERS BARS'),
  ...tile(3, STOCK.ownersCelebrate, 'FAMILY GROUPS'),
  ...tile(4, STOCK.women, 'SYNDICATES'),
  ...tile(5, STOCK.raceFinish, 'CELEBRATIONS'),

  // Pull quote (navy tile)
  quote: text(
    "Racing gives us the opportunity to create memories that last a lifetime. That's what makes it so special.",
    { ...P.pullQuote, color: WHITE, italic: true }
  ),

  // Gallery QR row
  galleryQr: qr('https://nztrof.co.nz/galleries'),
  galleryTitle: text('RACE-DAY GALLERIES', { ...P.kickerGold, fontSize: 12 }),
  galleryNote: text('VIEW FULL RACE-DAY GALLERIES ONLINE', { ...P.bodySmall, color: LIGHT }),

  footer: text(
    "RACING IS MORE THAN A SPORT. IT'S A COMMUNITY BUILT ON PASSION, TRUST AND GREAT PEOPLE.",
    P.footer
  ),
  pageNum: text('PAGE 8', { ...P.footer, align: 'right' }),
});
