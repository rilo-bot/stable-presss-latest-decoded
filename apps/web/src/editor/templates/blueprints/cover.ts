import { mkPage, text, img, qr, STOCK, P, NAVY } from './_shared';

// ── 1. Cover ────────────────────────────────────────────────────────
export const cover = mkPage('cover', 'Cover', {
  tagline: text('Own the experience.<br>Share the thrill.', P.scriptGold),
  masthead: text('NZTROF', { ...P.displayNavy, fontSize: 40, letterSpacing: 1 }),
  mastheadSub: text('NEW ZEALAND THOROUGHBRED<br>RACEHORSE OWNERS FEDERATION', { ...P.kickerNavy, fontSize: 8 }),
  badge: text('ADVANCED BULLETIN  |  PROTOTYPE ISSUE', { ...P.kickerGold, fontSize: 8.5 }),
  h1: text('BE PART OF', { ...P.displayNavy, fontSize: 50 }),
  h2: text('SOMETHING', { ...P.displayGold, fontSize: 50 }),
  h3: text('EXTRAORDINARY', { ...P.displayGold, fontSize: 50 }),
  intro: text(
    'The premium owner-first publication for New Zealand thoroughbred racing. Celebrating the people, stories, friendships and moments that make racehorse ownership unforgettable.',
    { ...P.body, fontSize: 12 }
  ),
  editionBadge: text('24 PAGE OWNER EXPERIENCE EDITION', { ...P.bandLabel, fontSize: 10 }),
  insideTitle: text('INSIDE THIS ISSUE', P.kickerGold),
  inside1: text('<b>Owner stories</b><br>Real journeys and winning moments', P.bodySmall),
  inside2: text('<b>Regional roundups</b><br>QR-linked coverage for every region', P.bodySmall),
  inside3: text('<b>Young owners</b><br>The next generation coming through', P.bodySmall),
  inside4: text('<b>Women in racing</b><br>Style, leadership and participation', P.bodySmall),
  inside5: text('<b>Games &amp; prizes</b><br>QR competitions, leaderboards and giveaways', P.bodySmall),
  hero: img(STOCK.ownersCelebrate, 'cover', { y: 0.35 }),
  scanTitle: text('SCAN TO JOIN', P.kickerNavy),
  scanSub: text('or view the full digital bulletin', P.meta),
  scanUrl: text('raceowners.co.nz/join', { ...P.meta, fontWeight: 700, color: NAVY }),
  joinQr: qr('https://raceowners.co.nz/join'),
  partnersTitle: text('FOUNDING ADVERTISING PARTNERS', { ...P.kickerWhite, fontSize: 9 }),
  partner1: text('NZTAB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner2: text('NZ Bloodstock', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner3: text('David Archer Insurance', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner4: text('Cambridge Stud', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner5: text('Brighthill Farm', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner6: text('SRM Feeds', { ...P.statLabel, color: NAVY, align: 'center' }),
  footer: text('OWNER TODAY. PART OF THE JOURNEY FOREVER.', P.footer),
  pageNum: text('PAGE 1', { ...P.footer, align: 'right' }),
});
