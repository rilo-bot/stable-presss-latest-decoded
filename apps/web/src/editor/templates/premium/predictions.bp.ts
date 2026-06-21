/**
 * Premium Predictions blueprint (template #2).
 *
 * Mirrors the classic `predictions` page (predictions.ts) — same copy — restyled
 * premium: a hero gallop photo with an "Insights from those who know" badge, and
 * THREE columns (Yearlings to Watch / Young Horses to Follow / Stallions Making
 * an Impact). Each column lists three entries, each with a per-horse photo, name,
 * expert note and a row of 3 action QRs (watch / view / track). Closes with the
 * industry-partners logo row.
 */

import type { RegionContent } from '@/types/magazine';
import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const HORSE_NAME = { ...P.name, fontSize: 11 };
const HORSE_NOTE = { ...P.bodySmall, fontSize: 9, lineHeight: 1.35 };
const EXPERT = { ...P.caption, fontSize: 8.5, color: GOLD };
const QR_LABEL = { ...P.qrLabel, fontSize: 7, align: 'center' as const };

// One horse entry → photo + name + expert note + the 3 action-QR labels.
// (The 3 QRs themselves are shared per-column and rendered in the component.)
function horse(
  prefix: string,
  photo: string,
  name: string,
  note: string,
  expert: string
) {
  return {
    [`${prefix}Img`]: img(photo, 'cover'),
    [`${prefix}Name`]: text(name, HORSE_NAME),
    [`${prefix}Note`]: text(note, HORSE_NOTE),
    [`${prefix}Expert`]: text(expert, EXPERT),
  };
}

// One prediction column → navy header + the three horse entries + the action QRs.
function col(
  prefix: string,
  title: string,
  horses: Array<{ photo: string; name: string; note: string; expert: string }>
) {
  const out: Record<string, RegionContent> = {
    [`${prefix}Title`]: text(title, { ...P.kickerWhite, fontSize: 9.5 }),
  };
  horses.forEach((h, i) => Object.assign(out, horse(`${prefix}h${i + 1}`, h.photo, h.name, h.note, h.expert)));
  // Row of three action QRs reused beneath each horse entry.
  out[`${prefix}WatchQr`] = qr('https://nztrof.co.nz/predictions/watch');
  out[`${prefix}ViewQr`] = qr('https://nztrof.co.nz/predictions/view');
  out[`${prefix}TrackQr`] = qr('https://nztrof.co.nz/predictions/track');
  out[`${prefix}WatchLabel`] = text('WATCH', QR_LABEL);
  out[`${prefix}ViewLabel`] = text('VIEW', QR_LABEL);
  out[`${prefix}TrackLabel`] = text('TRACK', QR_LABEL);
  return out;
}

export const predictionsPx: PageBlueprint = mkPage('predictions-px', 'Predictions', {
  // Header band
  band: text('PREDICTIONS', P.bandLabel),

  // Headline block
  h1a: text('THE HORSES', { ...P.displayNavy, fontSize: 40 }),
  h1b: text('TO FOLLOW', { ...P.displayGold, fontSize: 40 }),
  sub: text("Today's insight. Tomorrow's champions.", { ...P.scriptGold, fontSize: 20 }),
  intro: text(
    'Our industry experts share the horses, yearlings and stallions they believe are the ones to watch. Keep an eye on these — the future is bright.',
    { ...P.body, fontSize: 11.5 }
  ),

  // Hero gallop photo + insights badge
  hero: img(STOCK.horseGallop, 'cover'),
  badge: text('INSIGHTS FROM THOSE WHO KNOW', { ...P.statLabel, color: WHITE, align: 'center' }),
  badgeIcon: icon('Binoculars', GOLD),

  // Columns
  ...col('p1', 'YEARLINGS TO WATCH', [
    { photo: STOCK.horseGallop, name: 'Lot 145', note: 'b. c. Proisir x Bella Luce. From a proven family.', expert: '— Jarah Brady, Bloodstock Agent' },
    { photo: STOCK.gallop2, name: 'Lot 267', note: 'b. f. Savabeel x Ocean Empress. Elegant filly with a powerful pedigree.', expert: '— Mark Walker, Trainer' },
    { photo: STOCK.gallop3, name: 'Lot 312', note: 'ch. c. Tavistock x Lady of Grace. A beautifully balanced colt.', expert: '— Jamie Richards, Trainer' },
  ]),
  ...col('p2', 'YOUNG HORSES TO FOLLOW', [
    { photo: STOCK.gallop2, name: 'Imperial Gift', note: '3yo g. — impressive last-start winner, still learning.', expert: '— Michael Guerin, Trainer' },
    { photo: STOCK.jockeyRace, name: 'Miss Tivaci', note: '3yo f. — smart filly with gate speed.', expert: '— Tony Pike, Trainer' },
    { photo: STOCK.raceFinish, name: 'Voyage Bubble', note: '3yo c. — big, strong colt with a turn of foot.', expert: '— Lisa Latta, Bloodstock' },
  ]),
  ...col('p3', 'STALLIONS MAKING AN IMPACT', [
    { photo: STOCK.jockeyRace, name: 'Proisir', note: 'Consistent results year after year.', expert: '— Brent Clark, Breeder' },
    { photo: STOCK.winnersCircle, name: 'Savabeel', note: 'Champion sire of champions.', expert: '— Mark Chittick, Breeder' },
    { photo: STOCK.stable, name: 'Tivaci', note: 'Siring speed, precocity and class.', expert: '— John Thompson, Trainer' },
  ]),

  // Industry-partners logo row
  partnersTitle: text('PROUDLY SUPPORTED BY OUR INDUSTRY PARTNERS', { ...P.kickerNavy, fontSize: 9 }),
  partner1: text('TAB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner2: text('NZB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner3: text('Dunstan', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner4: text('Valachi Downs', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner5: text('Bare Insurance', { ...P.statLabel, color: NAVY, align: 'center' }),

  footer: text('GREAT RACING STARTS WITH INSIGHT. GREAT OWNERS STAY ONE STEP AHEAD.', P.footer),
  pageNum: text('PAGE 17', { ...P.footer, align: 'right' }),
});
