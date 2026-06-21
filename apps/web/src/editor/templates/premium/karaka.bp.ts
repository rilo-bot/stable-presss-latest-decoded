import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea';
const ROLE_GOLD = '#8a6b1e';

// ── Karaka Sales & Syndicates (premium, cream page) ─────────────────
// "The dream starts here." — a gold-icon feature list, a circular sale-results
// badge over a hero horse photo, a Latest Sale Results stat list, NZB +
// Cambridge Stud sponsor blocks and a browse-syndication QR row.
const feature = (i: number, iconName: string, title: string, body: string) => ({
  [`point${i}Icon`]: icon(iconName, GOLD),
  [`point${i}Title`]: text(title, { ...P.kickerNavy, fontSize: 11 }),
  [`point${i}Body`]: text(body, { ...P.bodySmall, fontSize: 10 }),
});

export const karakaPx: PageBlueprint = mkPage('karaka-sales-px', 'Karaka Sales & Syndicates', {
  // Header band
  band: text('KARAKA SALES & SYNDICATES', P.bandLabel),
  bandIcon: icon('ShoppingBag', GOLD),

  // Headline block
  h1a: text('THE DREAM', { ...P.displayNavy, fontSize: 40 }),
  h1b: text('STARTS HERE', { ...P.displayGold, fontSize: 40 }),
  sub: text('Great racing begins with great pedigrees.', { ...P.scriptGold, fontSize: 22 }),
  body: text(
    "The NZB Karaka Yearling Sales are where champions are found and dreams take their first step. For many owners, it's the beginning of an incredible journey.",
    { ...P.body, fontSize: 11.5 }
  ),

  // Gold-icon feature list
  ...feature(1, 'Flag', 'FIRST-TIME BUYERS WELCOME', "Our industry is built on welcoming new owners. We'll help you every step of the way."),
  ...feature(2, 'UsersGroup', 'SYNDICATE OPPORTUNITIES', 'Shared ownership. Shared excitement. Build lifelong friendships.'),
  ...feature(3, 'Scale', 'OWNERSHIP MADE POSSIBLE', 'There are options for every budget. Start small, dream big.'),
  ...feature(4, 'Sparkles', 'THE THRILL OF THE POSSIBLE', 'Every great story starts somewhere. Yours could start at Karaka.'),

  // Hero photo + circular results badge
  heroImg: img(STOCK.horseGallop, 'cover'),
  badge: text("2025 NZB CHAIRMAN'S BROODMARE SALE RESULTS", { ...P.statLabel, color: WHITE, align: 'center', fontSize: 8.5, lineHeight: 1.25 }),

  // Latest Sale Results stat list
  resultsTitle: text('Latest Sale Results', { ...P.scriptGold, fontSize: 20 }),
  results: text(
    '• Gross: $7,393,000<br>• Average: $112,016<br>• Median: $52,500<br>• Clearance Rate: 91%<br>• Top Price: $400,000',
    { ...P.bodySmall, fontSize: 10.5 }
  ),
  resultsNote: text('A strong result reflecting confidence in quality New Zealand breeding.', P.caption),
  resultsQr: qr('https://nzb.co.nz/results'),

  // Sponsor blocks
  ad1Name: text("NZB — Backing New Zealand Breeding. Supporting Racing's Future.", { ...P.kickerWhite, fontSize: 10 }),
  ad1Img: img(STOCK.paddock, 'cover'),
  ad2Name: text('CAMBRIDGE STUD — World-Class Breeding. Champion Results.', { ...P.kickerWhite, fontSize: 10 }),
  ad2Img: img(STOCK.mareFoal, 'cover'),

  // Browse-syndication QR row
  ctaTitle: text('YOUR PATHWAY INTO OWNERSHIP', { ...P.kickerGold, fontSize: 11 }),
  cta1: text('BROWSE CURRENT SYNDICATION OPPORTUNITIES', { ...P.qrLabel, color: ROLE_GOLD }),
  cta2: text('DISCOVER quality horses and upcoming syndicates', { ...P.qrLabel, color: ROLE_GOLD }),
  cta3: text('CONNECT with trainers and syndicate managers', { ...P.qrLabel, color: ROLE_GOLD }),
  cta4: text('JOIN — be part of something extraordinary', { ...P.qrLabel, color: ROLE_GOLD }),
  ctaQr: qr('https://nzb.co.nz/syndication'),

  footer: text('GREAT HORSES. GREAT PEOPLE. GREAT MEMORIES. YOUR JOURNEY STARTS HERE.', P.footer),
  pageNum: text('PAGE 9', { ...P.footer, align: 'right' }),
});
