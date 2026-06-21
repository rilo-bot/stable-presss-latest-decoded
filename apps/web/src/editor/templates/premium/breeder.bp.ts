/**
 * Breeder Feature (premium, template #2) — "FROM PADDOCK TO WINNER'S CIRCLE".
 *
 * Restyle of the classic `breeder` blueprint: same region names + copy, premium
 * house design (gold rules, navy pull-quote, trophy-icon footer block + QR).
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const GOLD_DEEP = '#8a6b1e';
const LIGHT = '#d7deea'; // body/quote text on navy

export const breederPx: PageBlueprint = mkPage('breeder-feature-px', 'Breeder Feature', {
  // Header band
  band: text('BREEDER FEATURE', P.bandLabel),
  bandIcon: icon('Sprout', GOLD),

  // Headline block
  h1a: text('FROM PADDOCK', { ...P.displayNavy, fontSize: 38 }),
  h1b: text("TO WINNER'S CIRCLE", { ...P.displayGold, fontSize: 38 }),
  sub: text('Passion. Patience. Pride.', { ...P.scriptGold, fontSize: 22 }),
  body: text(
    'For the Harrisons, breeding has always been about heart, hard work and believing in the dream. Their journey from a single mare in the paddock to celebrating a stakes winner is a story every owner can be proud of.',
    { ...P.body, fontSize: 11.5 }
  ),
  familyImg: img(STOCK.stable, 'cover'),

  // Navy pull-quote
  quote: text(
    "It's the foal in the paddock that gives you the dreams. It's the winner in the ring that makes it real.",
    { ...P.pullQuote, color: WHITE, italic: true }
  ),
  quoteBy: text('— Sarah Harrison', { ...P.role, color: GOLD }),

  // Our breeding journey
  journeyTitle: text('OUR BREEDING JOURNEY', { ...P.kickerNavy, fontSize: 13 }),
  journeyBody: text(
    'It all started with our mare Bella Luce — a tough, honest racehorse with a heart of gold. We bred her first foal at home and from that moment, we were hooked. Years of early mornings, late nights and plenty of ups and downs have led us to where we are today.',
    { ...P.bodySmall, fontSize: 10.5 }
  ),
  mareImg: img(STOCK.mareFoal, 'cover'),
  mareCap: text('BELLA LUCE &amp; HER 2024 FILLY BY PROISIR — THE NEXT GENERATION', P.caption),

  // Stakes-winner photo + caption
  jockeyImg: img(STOCK.jockeyRace, 'cover'),
  jockeyCap: text("BELLA LUCE'S SON — STAKES WINNER, WAIKATO GUINEAS", P.caption),

  // A family effort
  effortTitle: text('A FAMILY EFFORT', { ...P.kickerNavy, fontSize: 13 }),
  effortBody: text(
    'From feeding out to foal watches and trackside cheers, everyone plays a part in our journey. The best moments are always shared together.',
    { ...P.bodySmall, fontSize: 10.5 }
  ),

  // Trophy-icon "the highs make it all worth it" footer block + meet-the-breeder QR
  highsIcon: icon('Trophy', GOLD),
  highsTitle: text('THE HIGHS MAKE IT ALL WORTH IT', { ...P.kickerGold, fontSize: 13 }),
  highsBody: text(
    "Standing in the winner's circle is a feeling like no other. It's the reward for every bit of belief, every season of patience and every family moment along the way.",
    { ...P.bodySmall, fontSize: 10.5, color: LIGHT }
  ),
  qr: qr('https://nztrof.co.nz/breeders'),
  qrNote: text('MEET THE BREEDER AND SEE THE BLOODLINES', { ...P.qrLabel, color: GOLD_DEEP }),

  footer: text('EVERY GREAT RACE HAS A BREEDING STORY.', P.footer),
  pageNum: text('PAGE 12', { ...P.footer, align: 'right' }),
});
