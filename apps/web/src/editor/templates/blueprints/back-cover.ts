import { mkPage, text, img, qr, row, STOCK, P, GOLD, WHITE } from './_shared';

// Back-cover table rows (20)
const winnersRows: string[] = [
  '1 · Paddock Partners Syndicate · Imperial Gift (Gr.1) · Winner · Sistema Stakes',
  '2 · Bubble Racing Syndicate · Voyage Bubble (Gr.2) · Winner · Avondale Guineas',
  '3 · Savannah Success Syndicate · Savabeel (Gr.2) · Winner · Waikato Guineas',
  '4 · Tivaci Girls Syndicate · Miss Tivaci (Gr.1) · Winner · Tarzino Trophy',
  '5 · Ocean Racing Syndicate · Ocean Empress (LR) · Winner · Coupland\'s Mile',
  '6 · Mark & Sarah Thompson · Golden Path (Gr.3) · Winner · Cambridge Breeders\' Stakes',
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
  '19 · Bluewater Syndicate · Ocean Jewel · 3rd · Manawatu Sires\' Produce Stakes',
  '20 · C. & K. Partnership · Flying Finish · 3rd · Ellerslie 1200',
];

// ── 24. Back Cover ──────────────────────────────────────────────────
export const backCover = mkPage('back-cover', 'Back Cover — Owners of Winners', {
  masthead: text('NZTROF', { ...P.displayGold, fontSize: 26, color: WHITE }),
  mastheadSub: text('NEW ZEALAND THOROUGHBRED RACEHORSE OWNERS FEDERATION', { ...P.kickerWhite, fontSize: 7 }),
  h1a: text('OWNERS', { ...P.displayGold, fontSize: 54, color: GOLD }),
  h1b: text('OF WINNERS', { ...P.displayGold, fontSize: 54, color: WHITE }),
  sub: text('CELEBRATING OUR WINNING OWNERS THIS QUARTER — APRIL / MAY / JUNE 2025', { ...P.kickerGold, fontSize: 9 }),
  heroImg: img(STOCK.jockeyRace, 'cover'),
  tableHead: text('RANK · OWNER / SYNDICATE · HORSE(S) · RESULT · RACE', { ...P.th, color: GOLD }),
  ...Object.fromEntries(winnersRows.map((r, i) => [`row${i + 1}`, row(r)])),
  note: text('*Results correct as at 30 June 2025', P.caption),
  shareTitle: text('SHARE THE JOY. OWN THE JOURNEY.', { ...P.subhead, color: WHITE, fontSize: 14 }),
  shareBody: text('Every winner has a team behind them. Thank you to all our owners for your passion and support.', { ...P.bodySmall, color: '#dfe6f2' }),
  registerQr: qr('https://raceowners.co.nz/join'),
  registerNote: text('REGISTER AS AN NZTROF OWNER MEMBER TODAY!', P.qrLabel),
  partners: text('THANK YOU TO OUR PREMIUM PARTNERS — Noble Insurance · Dunstan · Valachi Downs · Cambridge Stud · The Grand Room', { ...P.kickerWhite, fontSize: 8.5 }),
  footer: text('OWN THE DREAM. SHARE THE THRILL.', { ...P.footer, fontSize: 12, color: GOLD }),
  pageNum: text('PAGE 20', { ...P.footer, align: 'right' }),
});
