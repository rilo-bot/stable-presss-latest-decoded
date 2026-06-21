/**
 * Premium Back Cover blueprint (template #2) — `back-cover-px`.
 *
 * Full NAVY "OWNERS OF WINNERS" page: gold + white title, a hero horse photo,
 * a 20-row ranked table (Rank / Owner / Horse / Result / Race), a "Share the
 * Joy. Own the Journey." register-as-member QR block, a "Thank You to Our
 * Premium Partners" logo row (Noble / Dunstan / Valachi / Cambridge / Grand
 * Room), and a bottom "OWN THE DREAM. SHARE THE THRILL." title band. Same
 * region names and copy as the classic, restyled premium.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';
import { row } from '../blueprints/_shared';

const LIGHT = '#dfe6f2'; // body text on navy

// Back-cover table rows (20) — same data as the classic back cover.
const winnersRows: string[] = [
  '1 · Paddock Partners Syndicate · Imperial Gift (Gr.1) · Winner · Sistema Stakes',
  '2 · Bubble Racing Syndicate · Voyage Bubble (Gr.2) · Winner · Avondale Guineas',
  '3 · Savannah Success Syndicate · Savabeel (Gr.2) · Winner · Waikato Guineas',
  '4 · Tivaci Girls Syndicate · Miss Tivaci (Gr.1) · Winner · Tarzino Trophy',
  "5 · Ocean Racing Syndicate · Ocean Empress (LR) · Winner · Coupland's Mile",
  "6 · Mark & Sarah Thompson · Golden Path (Gr.3) · Winner · Cambridge Breeders' Stakes",
  '7 · Waikato Racing Group · Lady Of Grace (Gr.3) · Winner · Matamata Cup',
  '8 · Harrison Family Syndicate · Rising Impact (LR) · Winner · Taranaki 2YO Classic',
  '9 · Fortune Bay Racing · Shadow Dancer (LR) · Winner · South Island Sale Stakes',
  '10 · M. Wright & D. Anderson · Light The Way · Winner · Benchmark 75',
  '11 · Team Bostock · Pacific Fury · Winner · Benchmark 75',
  '12 · Corn & Nic Racing · South Island · Winner · Benchmark 65',
  '13 · The Longshot Crew · Quick Return · Winner · Benchmark 65',
  '14 · Central South Club · Bella Luce · Winner · Benchmark 65',
  '15 · Friends of Racing Syndicate · Lady Luck · Winner · Benchmark 65',
  '16 · J. Miller & Co. Syndicate · Brave Contender · 2nd · Wellington Cup',
  '17 · Dunstan Thoroughbreds · Miss Ellary · 2nd · The Oaks',
  '18 · R. & L. McLeod · Shockwave · 3rd · New Zealand Derby',
  "19 · Bluewater Syndicate · Ocean Jewel · 3rd · Manawatu Sires' Produce Stakes",
  '20 · C. & K. Partnership · Flying Finish · 3rd · Ellerslie 1200',
];

const PARTNER = { ...P.statLabel, color: NAVY, align: 'center' as const, fontSize: 8.5 };

export const backCoverPx: PageBlueprint = mkPage('back-cover-px', 'Back Cover — Owners of Winners', {
  // Masthead + hero
  masthead: text(`NZTR<span style="color:${GOLD}">O</span>F`, { ...P.displayNavy, color: WHITE, fontSize: 28, letterSpacing: 1 }),
  mastheadSub: text('NEW ZEALAND THOROUGHBRED<br>RACEHORSE OWNERS FEDERATION', { ...P.kickerWhite, fontSize: 7.5, lineHeight: 1.3 }),
  heroImg: img(STOCK.jockeyRace, 'cover'),

  // Big title
  h1a: text('OWNERS', { ...P.displayGold, fontSize: 56, color: GOLD }),
  h1b: text('OF WINNERS', { ...P.displayGold, fontSize: 56, color: WHITE }),
  sub: text('CELEBRATING OUR WINNING OWNERS THIS QUARTER — APRIL / MAY / JUNE 2025', { ...P.kickerGold, fontSize: 9 }),

  // Ranked table (20 rows)
  tableHead: text('RANK · OWNER / SYNDICATE · HORSE(S) · RESULT · RACE', { ...P.th, color: GOLD }),
  ...Object.fromEntries(winnersRows.map((r, i) => [`row${i + 1}`, row(r)])),
  note: text('*Results correct as at 30 June 2025', { ...P.caption, color: LIGHT }),

  // Share the Joy — register-as-member QR block
  shareTitle: text('SHARE THE JOY. OWN THE JOURNEY.', { ...P.subhead, color: WHITE, fontSize: 16 }),
  shareBody: text('Every winner has a team behind them. Thank you to all our owners for your passion and support.', { ...P.bodySmall, color: LIGHT }),
  registerQr: qr('https://raceowners.co.nz/join'),
  registerNote: text('REGISTER AS AN NZTROF OWNER MEMBER TODAY!', { ...P.qrLabel, color: GOLD }),

  // Premium partners logo row
  partnersTitle: text('THANK YOU TO OUR PREMIUM PARTNERS', { ...P.kickerGold, fontSize: 10 }),
  partner1: text('Noble Insurance', PARTNER),
  partner2: text('Dunstan', PARTNER),
  partner3: text('Valachi Downs', PARTNER),
  partner4: text('Cambridge Stud', PARTNER),
  partner5: text('The Grand Room', PARTNER),

  // Bottom title band
  bandIcon: icon('Horse', GOLD),
  footer: text('OWN THE DREAM. SHARE THE THRILL.', { ...P.footer, fontSize: 13, color: GOLD }),
  pageNum: text('PAGE 20', { ...P.footer, align: 'right' }),
});
