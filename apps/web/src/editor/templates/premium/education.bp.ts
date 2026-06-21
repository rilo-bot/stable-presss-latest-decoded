/**
 * Premium Ownership Education blueprint (template #2).
 *
 * "HOW TO BECOME AN OWNER" — a premium restyle of the classic `education` page.
 * Same region names + copy as the classic blueprint, broken into the richer
 * premium furniture: a hero photo, FIVE numbered steps (Syndicates Explained /
 * Costs Involved / Choosing the Right Trainer / Ownership Etiquette / The
 * Experience), each with its own icon + a check-list, a 5-photo strip, a navy
 * "Useful Tools to Get Started" band with 3 tool + QR items, a "Learn. Connect.
 * Experience." block, and a "New to Racing?" Ownership Starter Guide booklet
 * block with QR.
 *
 * PURE DATA — no React / JSX.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy
const ROLE_GOLD = '#8a6b1e';

const STEP_TITLE = { ...P.kickerNavy, fontSize: 11 };
const STEP_BODY = { ...P.bodySmall, fontSize: 9.5, lineHeight: 1.4 };
const CHECK = { ...P.bodySmall, fontSize: 9, lineHeight: 1.35 };

// One numbered step → icon + title + body + a two-item check-list, preserving the
// classic `stepN` copy as the step body.
function step(i: number, iconName: string, title: string, body: string, check1: string, check2: string) {
  return {
    [`step${i}Icon`]: icon(iconName, GOLD),
    [`step${i}Title`]: text(title, STEP_TITLE),
    [`step${i}`]: text(body, STEP_BODY),
    [`step${i}Check1`]: text(check1, CHECK),
    [`step${i}Check2`]: text(check2, CHECK),
  };
}

export const educationPx = mkPage('ownership-education-px', 'Ownership Education', {
  // Header band
  band: text('OWNERSHIP EDUCATION', P.bandLabel),
  bandSub: text('Knowledge today. Ownership for life.', { ...P.caption, color: GOLD }),

  // Headline + hero
  h1a: text('HOW TO', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('BECOME AN OWNER', { ...P.displayGold, fontSize: 34 }),
  sub: text('Your guide to getting involved in racing ownership.', P.scriptGold),
  body: text(
    "Racing ownership is more accessible than ever. Here's everything you need to know to get started with confidence.",
    P.bodySmall
  ),
  hero: img(STOCK.stable, 'cover'),

  // Five numbered steps, each with an icon + check-list
  ...step(
    1,
    'UsersGroup',
    'SYNDICATES EXPLAINED',
    '<b>1. Syndicates explained</b> — syndicates allow you to share the experience, costs and rewards with like-minded people.',
    '✓ Share costs and risk',
    '✓ Meet like-minded owners'
  ),
  ...step(
    2,
    'DollarSign',
    'COSTS INVOLVED',
    '<b>2. Costs involved</b> — upfront costs vary, but ownership can be more affordable than you think.',
    '✓ Plan your budget early',
    '✓ Understand ongoing fees'
  ),
  ...step(
    3,
    'Handshake',
    'CHOOSING THE RIGHT TRAINER',
    "<b>3. Choosing the right trainer</b> — a great trainer is key to your horse's success and your enjoyment.",
    '✓ Match goals and style',
    '✓ Visit the stable first'
  ),
  ...step(
    4,
    'Heart',
    'OWNERSHIP ETIQUETTE',
    '<b>4. Ownership etiquette</b> — good manners and respect make racing enjoyable for everyone.',
    '✓ Respect staff and horses',
    '✓ Celebrate every result'
  ),
  ...step(
    5,
    'Trophy',
    'THE EXPERIENCE',
    "<b>5. The experience</b> — from mornings at the stables to race-day thrills, it's a journey you'll never forget.",
    '✓ Enjoy the raceday buzz',
    '✓ Make memories for life'
  ),

  // 5-photo strip
  photoStrip: img(STOCK.crowd, 'cover'),
  strip1: img(STOCK.stable, 'cover'),
  strip2: img(STOCK.horseGallop, 'cover'),
  strip3: img(STOCK.winnersCircle, 'cover'),
  strip4: img(STOCK.champagne, 'cover'),
  strip5: img(STOCK.ownersCelebrate, 'cover'),

  // Useful Tools to Get Started (navy band) — 3 tool + QR items
  toolsTitle: text('USEFUL TOOLS TO GET STARTED', { ...P.kickerGold, fontSize: 11 }),
  tool1Icon: icon('PieChart', GOLD),
  tool1: text('Ownership calculator — estimate costs and plan your ownership journey.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  tool1Qr: qr('https://nztrof.co.nz/calculator'),
  tool2Icon: icon('BookOpen', GOLD),
  tool2: text('Trainer directory — search trainers by location and specialty.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  tool2Qr: qr('https://nztrof.co.nz/trainers'),
  tool3Icon: icon('Users', GOLD),
  tool3: text('Syndicate finder — find the right syndicate for you.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  tool3Qr: qr('https://nztrof.co.nz/syndicates'),

  // Learn. Connect. Experience.
  ctaTitle: text('LEARN. CONNECT. EXPERIENCE.', { ...P.kickerNavy, fontSize: 13 }),
  ctaBody: text(
    "Join stable visits, information evenings and ownership events across New Zealand. We're here to help you every step of the way.",
    P.bodySmall
  ),

  // New to Racing? — Ownership Starter Guide booklet block
  guideTitle: text('NEW TO RACING?', { ...P.kickerGold, fontSize: 12, color: ROLE_GOLD }),
  guideQr: qr('https://nztrof.co.nz/starter-guide'),
  guideNote: text('NEW TO RACING? Scan to access our complete Ownership Starter Guide.', { ...P.qrLabel, color: GOLD, fontSize: 9.5 }),

  footer: text("OWNERSHIP IS MORE THAN A HORSE. IT'S A COMMUNITY. WE CAN'T WAIT TO WELCOME YOU.", P.footer),
  pageNum: text('PAGE 17', { ...P.footer, align: 'right' }),
});
