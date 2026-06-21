/**
 * Horse Welfare & Rehoming (premium, template #2) — "LIFE AFTER RACING".
 *
 * Restyle of the classic `welfare` blueprint: same region names + copy, premium
 * house design with the classic page's FOREST-green accent preserved (h1a green,
 * green band + "How You Can Help" panel) alongside the navy ambulance strip.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const FOREST = '#1a3322'; // classic Horse Welfare green accent
const LIGHT = '#d7deea'; // body text on navy
const LIGHT_GREEN = '#dfe9e1'; // body text on forest green

export const welfarePx: PageBlueprint = mkPage('horse-welfare-px', 'Horse Welfare & Rehoming', {
  // Header band (forest green)
  band: text('HORSE WELFARE &amp; REHOMING', P.bandLabel),
  bandIcon: icon('Heart', GOLD),

  // Headline block — "LIFE AFTER RACING" (green accent preserved)
  h1a: text('LIFE AFTER', { ...P.displayNavy, fontSize: 40, color: FOREST }),
  h1b: text('RACING', { ...P.displayGold, fontSize: 40 }),
  sub: text('Their next chapter. Our commitment.', { ...P.scriptGold, fontSize: 22 }),
  body: text(
    "Racing gives horses a start in life. We're here to help them thrive long after the last race.",
    { ...P.body, fontSize: 11.5 }
  ),

  // Eventing hero photo + play button
  heroImg: img(STOCK.eventing, 'cover'),
  heroPlayIcon: icon('PlayCircle', WHITE),

  // Meet Henry
  henryTitle: text('MEET HENRY', { ...P.kickerNavy, fontSize: 13, color: FOREST }),
  henryBody: text(
    "After a successful racing career, Henry found a new calling in eventing. Today, he's inspiring young riders and showing just how versatile Thoroughbreds can be.",
    { ...P.bodySmall, fontSize: 10.5 }
  ),
  henryImg: img(STOCK.eventing, 'cover'),

  // 3-photo strip with sub-captions
  card1Img: img(STOCK.paddock, 'cover'),
  card1Cap: text('NEW DISCIPLINES', { ...P.kickerGold, fontSize: 9, color: FOREST }),
  card1Body: text(
    '<b>New disciplines</b> — from eventing to dressage, showjumping to pony club, so many paths are possible.',
    { ...P.bodySmall, fontSize: 9.5 }
  ),
  card2Img: img(STOCK.horseGallop, 'cover'),
  card2Cap: text('GREAT PARTNERS', { ...P.kickerGold, fontSize: 9, color: FOREST }),
  card2Body: text(
    '<b>Great partners</b> — retired racehorses make loyal, intelligent partners for riders of all ages.',
    { ...P.bodySmall, fontSize: 9.5 }
  ),
  card3Img: img(STOCK.mareFoal, 'cover'),
  card3Cap: text('FOREVER GRATEFUL', { ...P.kickerGold, fontSize: 9, color: FOREST }),
  card3Body: text(
    '<b>Forever grateful</b> — thank you to the owners, trainers and supporters who give these horses a second chance.',
    { ...P.bodySmall, fontSize: 9.5 }
  ),

  // Green "How You Can Help" panel with 3 QR rows
  helpTitle: text('HOW YOU CAN HELP', { ...P.kickerGold, fontSize: 13 }),
  help1Icon: icon('Heart', GOLD),
  help1Label: text('Sponsor a retired racehorse', { ...P.bodySmall, fontSize: 10, color: LIGHT_GREEN }),
  help1Qr: qr('https://nztrof.co.nz/welfare/sponsor'),
  help2Icon: icon('Handshake', GOLD),
  help2Label: text('Rehome and retrain a Thoroughbred', { ...P.bodySmall, fontSize: 10, color: LIGHT_GREEN }),
  help2Qr: qr('https://nztrof.co.nz/welfare/rehome'),
  help3Icon: icon('Gift', GOLD),
  help3Label: text('Donate to support welfare programmes', { ...P.bodySmall, fontSize: 10, color: LIGHT_GREEN }),
  help3Qr: qr('https://nztrof.co.nz/welfare/donate'),

  // Centred pull-quote
  quote: text(
    "They gave us their best on the track. Now it's our turn to give back.",
    { ...P.pullQuote, color: FOREST, align: 'center' }
  ),

  // Navy "proudly supporting" ambulance strip
  sponsorBand: text(
    'PROUDLY SUPPORTING HORSE WELFARE ACROSS NEW ZEALAND — Emergency response. Expert care. Every horse, every time.',
    { ...P.kickerWhite, fontSize: 9 }
  ),
  sponsorIcon: icon('Shield', GOLD),
  sponsorUrl: text('horseambulance.co.nz', { ...P.kickerGold, fontSize: 11 }),

  footer: text('SUPPORTING TODAY. SECURING TOMORROW.', P.footer),
  pageNum: text('PAGE 13', { ...P.footer, align: 'right' }),
});
