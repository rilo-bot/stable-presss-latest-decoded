/**
 * Premium Predictions Follow-up blueprint (template #2).
 *
 * "WHAT HAPPENED TO LAST ISSUE'S PREDICTIONS?" — a premium restyle of the classic
 * `followup` page. Same region names + copy as the classic blueprint, broken into
 * the richer premium furniture: a hero photo, a Predictions Scoreboard table
 * (one row per category with predictions / winners / black-type / G1 / % success
 * + a circular success-rate badge), a navy Top Performer panel, the Biggest Wins /
 * Black Type / Auction Stars columns, an Expert Tipsters head-shot row (6 tipsters
 * each with a score + %), and a What's Next? QR block.
 *
 * PURE DATA — no React / JSX.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy
const LIGHTER = '#aebccd'; // captions / labels on navy
const ROLE_GOLD = '#8a6b1e';
const GOLD_LEAD = '#caa54a';

// One scoreboard row → category / predictions / winners / black-type / G1 / %
// + a circular success-rate badge value. Splits the classic `scoreN` line into
// editable cells so it reads as a real table on the premium page.
function scoreRow(i: number, cat: string, preds: string, winners: string, black: string, g1: string, pct: string) {
  return {
    [`score${i}Cat`]: text(cat, { ...P.tdBold, fontSize: 11 }),
    [`score${i}Preds`]: text(preds, { ...P.td, align: 'center' }),
    [`score${i}Winners`]: text(winners, { ...P.td, align: 'center' }),
    [`score${i}Black`]: text(black, { ...P.td, align: 'center' }),
    [`score${i}G1`]: text(g1, { ...P.td, align: 'center' }),
    [`score${i}Pct`]: text(pct, { ...P.statBig, fontSize: 17, color: WHITE, align: 'center' }),
  };
}

// One tipster head-shot column → photo + name + score + %.
function tipster(i: number, photo: string, name: string, score: string, pct: string) {
  return {
    [`tip${i}Img`]: img(photo, 'cover'),
    [`tip${i}Name`]: text(name, { ...P.name, fontSize: 9.5, align: 'center', letterSpacing: 0.2 }),
    [`tip${i}Score`]: text(score, { ...P.bodySmall, fontSize: 9, align: 'center' }),
    [`tip${i}Pct`]: text(pct, { ...P.kickerGold, fontSize: 11, color: ROLE_GOLD, align: 'center' }),
  };
}

export const followupPx = mkPage('predictions-followup-px', 'Predictions Follow-up', {
  // Header band
  band: text('FOLLOW-UP', P.bandLabel),
  bandSub: text('We track. You win.', { ...P.caption, color: GOLD }),

  // Headline + hero
  h1a: text('WHAT HAPPENED TO', { ...P.displayNavy, fontSize: 28 }),
  h1b: text("LAST ISSUE'S PREDICTIONS?", { ...P.displayGold, fontSize: 28 }),
  sub: text("We looked ahead. Now let's see how we went.", P.scriptGold),
  body: text(
    "Our panel of industry experts shared their top selections across yearlings, young horses and stallions. Here's how they performed.",
    P.bodySmall
  ),
  hero: img(STOCK.raceFinish, 'cover'),

  // Predictions Scoreboard table
  scoreTitle: text('PREDICTIONS SCOREBOARD', { ...P.kickerGold, fontSize: 11 }),
  scoreHeadCat: text('CATEGORY', { ...P.th, color: GOLD }),
  scoreHeadPreds: text('PREDICTIONS', { ...P.th, color: GOLD, align: 'center' }),
  scoreHeadWinners: text('WINNERS', { ...P.th, color: GOLD, align: 'center' }),
  scoreHeadBlack: text('BLACK TYPE', { ...P.th, color: GOLD, align: 'center' }),
  scoreHeadG1: text('GROUP 1', { ...P.th, color: GOLD, align: 'center' }),
  scoreHeadPct: text('% SUCCESS', { ...P.th, color: GOLD, align: 'center' }),
  ...scoreRow(1, 'Yearlings to Watch', '12', '6', '3', '1', '50%'),
  ...scoreRow(2, 'Young Horses to Follow', '15', '7', '4', '2', '47%'),
  ...scoreRow(3, 'Stallions Making an Impact', '8', '3', '2', '1', '38%'),

  // Top Performer (navy panel)
  topTitle: text('TOP PERFORMER', { ...P.kickerGold, fontSize: 12 }),
  topImg: img(STOCK.jockeyRace, 'cover'),
  topBody: text(
    '<b>Imperial Gift</b> (3yo g.) — tipster pick last issue. WINNER, Group 1 Sistema Stakes.',
    { ...P.bodySmall, color: LIGHT }
  ),
  topQuote: text('"A class above." — Michael Guerin', { ...P.pullQuote, fontSize: 13, color: GOLD, italic: true }),

  // Biggest Wins / Black Type Highlights / Auction Stars columns
  winsIcon: icon('Trophy'),
  winsTitle: text('BIGGEST WINS', { ...P.kickerNavy, fontSize: 11 }),
  winsBody: text(
    'Savabeel (3yo c.) — predicted to thrive over ground, delivered in style. Won the Group 2 Waikato Guineas.',
    P.bodySmall
  ),
  blackIcon: icon('Award'),
  blackTitle: text('BLACK TYPE HIGHLIGHTS', { ...P.kickerNavy, fontSize: 11 }),
  blackBody: text(
    '✓ Miss Tivaci — Group 1 NZ Oaks<br>✓ Voyage Bubble — Group 2 Avondale Guineas<br>✓ Tivaci — Group 1 Tarzino Trophy',
    P.bodySmall
  ),
  auctionIcon: icon('Medal'),
  auctionTitle: text('AUCTION STARS', { ...P.kickerNavy, fontSize: 11 }),
  auctionBody: text(
    'Lot 312 — Tavistock x Lady of Grace. Sold for $380,000 at Karaka Book 1. Strong type and pedigree updates coming through.',
    P.bodySmall
  ),

  // Expert Tipsters — how they went (6 head-shots, each name / score / %)
  tipstersTitle: text('EXPERT TIPSTERS — HOW THEY WENT', { ...P.bandLabel, fontSize: 11, color: GOLD }),
  ...tipster(1, STOCK.portrait1, 'Michael Guerin', '6/12', '50%'),
  ...tipster(2, STOCK.portrait2, 'Tony Pike', '8/15', '53%'),
  ...tipster(3, STOCK.women, 'Lisa Latta', '5/12', '42%'),
  ...tipster(4, STOCK.portrait3, 'John Buchanan', '4/11', '36%'),
  ...tipster(5, STOCK.portrait4, 'Jamie Richards', '5/12', '42%'),
  ...tipster(6, STOCK.portrait5, 'Brent Clark', '3/8', '38%'),

  // What's Next? QR block
  nextQr: qr('https://nztrof.co.nz/predictions/results'),
  nextNote: text("WHAT'S NEXT? Turn to Page 17 to see our new predictions. VIEW FULL RESULTS ONLINE.", { ...P.qrLabel, color: GOLD, fontSize: 9.5 }),

  footer: text("GREAT INSIGHT. REAL RESULTS. THAT'S THE POWER OF INFORMED OWNERSHIP.", P.footer),
  pageNum: text('PAGE 16', { ...P.footer, align: 'right' }),
});
