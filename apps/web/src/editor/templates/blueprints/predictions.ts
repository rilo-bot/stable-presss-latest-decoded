import { mkPage, text, img, qr, predCol, STOCK, P, WHITE, GOLD } from './_shared';

// ── 19. Predictions ─────────────────────────────────────────────────
export const predictions = mkPage('predictions', 'Predictions', {
  band: text('PREDICTIONS PAGE', P.bandLabel),
  h1a: text('THE HORSES', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('TO FOLLOW', { ...P.displayGold, fontSize: 34 }),
  sub: text('Today\'s insight. Tomorrow\'s champions.', P.scriptGold),
  intro: text('Our industry experts share the horses, yearlings and stallions they believe are the ones to watch. Keep an eye on these — the future is bright.', P.bodySmall),
  badge: text('INSIGHTS FROM THOSE WHO KNOW', { ...P.statLabel, color: WHITE, align: 'center' }),
  ...predCol('p1', 'YEARLINGS TO WATCH', STOCK.horseGallop, [
    '<b>Lot 145</b> — b. c. Proisir x Bella Luce. From a proven family. — Jarah Brady, Bloodstock Agent',
    '<b>Lot 267</b> — b. f. Savabeel x Ocean Empress. Elegant filly with a powerful pedigree. — Mark Walker, Trainer',
    '<b>Lot 312</b> — ch. c. Tavistock x Lady of Grace. A beautifully balanced colt. — Jamie Richards, Trainer',
  ]),
  ...predCol('p2', 'YOUNG HORSES TO FOLLOW', STOCK.gallop2, [
    '<b>Imperial Gift</b> (3yo g.) — impressive last-start winner, still learning. — Michael Guerin, Trainer',
    '<b>Miss Tivaci</b> (3yo f.) — smart filly with gate speed. — Tony Pike, Trainer',
    '<b>Voyage Bubble</b> (3yo c.) — big, strong colt with a turn of foot. — Lisa Latta, Bloodstock',
  ]),
  ...predCol('p3', 'STALLIONS MAKING AN IMPACT', STOCK.jockeyRace, [
    '<b>Proisir</b> — consistent results year after year. — Brent Clark, Breeder',
    '<b>Savabeel</b> — champion sire of champions. — Mark Chittick, Breeder',
    '<b>Tivaci</b> — siring speed, precocity and class. — John Thompson, Trainer',
  ]),
  partners: text('PROUDLY SUPPORTED BY OUR INDUSTRY PARTNERS — TAB · NZB · Dunstan · Valachi Downs · Bare Insurance', { ...P.kickerNavy, fontSize: 9 }),
  footer: text('GREAT RACING STARTS WITH INSIGHT. GREAT OWNERS STAY ONE STEP AHEAD.', P.footer),
  pageNum: text('PAGE 17', { ...P.footer, align: 'right' }),
});

// ── 20. Predictions Follow-up / Scoreboard ──────────────────────────
export const followup = mkPage('predictions-followup', 'Predictions Follow-up', {
  band: text('FOLLOW-UP', P.bandLabel),
  bandSub: text('We track. You win.', { ...P.caption, color: GOLD }),
  h1a: text('WHAT HAPPENED TO', { ...P.displayNavy, fontSize: 26 }),
  h1b: text('LAST ISSUE\'S PREDICTIONS?', { ...P.displayGold, fontSize: 26 }),
  sub: text('We looked ahead. Now let\'s see how we went.', P.scriptGold),
  body: text('Our panel of industry experts shared their top selections across yearlings, young horses and stallions. Here\'s how they performed.', P.bodySmall),
  scoreTitle: text('PREDICTIONS SCOREBOARD', { ...P.kickerWhite, fontSize: 9 }),
  score1: text('<b>Yearlings to Watch</b> — 12 predictions · 6 winners · 50% success', P.bodySmall),
  score2: text('<b>Young Horses to Follow</b> — 15 predictions · 7 winners · 47% success', P.bodySmall),
  score3: text('<b>Stallions Making an Impact</b> — 8 predictions · 3 winners · 38% success', P.bodySmall),
  topTitle: text('TOP PERFORMER', P.kickerGold),
  topImg: img(STOCK.jockeyRace, 'cover'),
  topBody: text('<b>Imperial Gift</b> (3yo g.) — tipster pick last issue. WINNER, Group 1 Sistema Stakes. "A class above." — Michael Guerin', P.bodySmall),
  winsTitle: text('BIGGEST WINS', P.kickerNavy),
  winsBody: text('Savabeel (3yo c.) — predicted to thrive over ground, delivered in style. Won the Group 2 Waikato Guineas.', P.bodySmall),
  blackTitle: text('BLACK TYPE HIGHLIGHTS', P.kickerNavy),
  blackBody: text('✓ Miss Tivaci — Group 1 NZ Oaks<br>✓ Voyage Bubble — Group 2 Avondale Guineas<br>✓ Tivaci — Group 1 Tarzino Trophy', P.bodySmall),
  auctionTitle: text('AUCTION STARS', P.kickerNavy),
  auctionBody: text('Lot 312 — Tavistock x Lady of Grace. Sold for $380,000 at Karaka Book 1. Strong type and pedigree updates coming through.', P.bodySmall),
  tipstersTitle: text('EXPERT TIPSTERS — HOW THEY WENT', { ...P.bandLabel, fontSize: 11 }),
  tipsters: text('Michael Guerin 6/12 (50%) · Tony Pike 8/15 (53%) · Lisa Latta 5/12 (42%) · John Buchanan 4/11 (36%) · Jamie Richards 5/12 (42%) · Brent Clark 3/8 (38%)', P.bodySmall),
  nextQr: qr('https://nztrof.co.nz/predictions/results'),
  nextNote: text('WHAT\'S NEXT? Turn to Page 17 to see our new predictions. VIEW FULL RESULTS ONLINE.', P.qrLabel),
  footer: text('GREAT INSIGHT. REAL RESULTS. THAT\'S THE POWER OF INFORMED OWNERSHIP.', P.footer),
  pageNum: text('PAGE 16', { ...P.footer, align: 'left' }),
});
