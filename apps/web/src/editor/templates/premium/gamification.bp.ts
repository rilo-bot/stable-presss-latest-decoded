/**
 * Premium Gamification blueprint (template #2).
 *
 * Mirrors the classic `gamification` page (competitions.ts) — same region names
 * and copy — restyled premium: gold "Prize Pool" list, three numbered game
 * cards (Spot the Difference / Ownership Memory / Racing Connections) each with
 * a Play Online QR, a navy "Climb the Leaderboard!" strip, a "Share your score!"
 * social block and a gamification-partners logo row.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#dfe6f2'; // body text on navy

export const gamificationPx: PageBlueprint = mkPage('gamification-px', 'Gamification', {
  // Header band
  band: text('GAMIFICATION', P.bandLabel),
  bandIcon: icon('Trophy', GOLD),

  // Headline block
  h1a: text('PLAY. WIN.', { ...P.displayNavy, fontSize: 40 }),
  h1b: text('EXPERIENCE.', { ...P.displayGold, fontSize: 40 }),
  sub: text('Fun for everyone. Prizes for our owners.', { ...P.scriptGold, fontSize: 20 }),
  body: text(
    'Get involved, test your racing knowledge and you could win incredible ownership experiences and prizes!',
    { ...P.body, fontSize: 11.5 }
  ),
  hero: img(STOCK.crowd2, 'cover'),

  // Prize pool (gold box)
  prizeTitle: text('PRIZE POOL', { ...P.kickerNavy, fontSize: 12 }),
  prize1: text('Stable visit &amp; morning tea for 4', { ...P.bodySmall, color: NAVY, fontSize: 10.5 }),
  prize2: text('Race-day hospitality experience', { ...P.bodySmall, color: NAVY, fontSize: 10.5 }),
  prize3: text('Syndicate share in a future runner', { ...P.bodySmall, color: NAVY, fontSize: 10.5 }),
  prize4: text('Signed racing memorabilia', { ...P.bodySmall, color: NAVY, fontSize: 10.5 }),
  prize5: text('And more!', { ...P.bodySmall, color: NAVY, fontSize: 10.5, fontWeight: 700 }),
  prizeIcon1: icon('Star', NAVY),
  prizeIcon2: icon('Star', NAVY),
  prizeIcon3: icon('Star', NAVY),
  prizeIcon4: icon('Star', NAVY),
  prizeIcon5: icon('Star', NAVY),

  // Game 1 — Spot the Difference
  game1Num: text('1', { ...P.statBig, fontSize: 18, color: NAVY }),
  game1Title: text('SPOT THE DIFFERENCE', { ...P.kickerNavy, fontSize: 11 }),
  game1Img: img(STOCK.horseGallop, 'cover'),
  game1Qr: qr('https://nztrof.co.nz/game/spot'),
  game1Play: text('PLAY ONLINE', { ...P.qrLabel, fontSize: 8 }),

  // Game 2 — Ownership Memory (memory grid tiles)
  game2Num: text('2', { ...P.statBig, fontSize: 18, color: NAVY }),
  game2Title: text('OWNERSHIP MEMORY', { ...P.kickerNavy, fontSize: 11 }),
  game2Img: img(STOCK.raceFinish, 'cover'),
  game2Tile1: img(STOCK.jockeyRace, 'cover'),
  game2Tile2: img(STOCK.winnersCircle, 'cover'),
  game2Tile3: img(STOCK.champagne, 'cover'),
  game2Tile4: img(STOCK.trophy, 'cover'),
  game2Qr: qr('https://nztrof.co.nz/game/memory'),
  game2Play: text('PLAY ONLINE', { ...P.qrLabel, fontSize: 8 }),

  // Game 3 — Racing Connections (horse / trainer / jockey mini-table)
  game3Num: text('3', { ...P.statBig, fontSize: 18, color: NAVY }),
  game3Title: text('RACING CONNECTIONS', { ...P.kickerNavy, fontSize: 11 }),
  game3Body: text(
    'Can you link the horse, trainer and jockey? Match them all and enter the draw to win a fantastic prize!',
    { ...P.bodySmall, fontSize: 10 }
  ),
  game3Head1: text('HORSE', { ...P.qrLabel, fontSize: 8, color: GOLD }),
  game3Head2: text('TRAINER', { ...P.qrLabel, fontSize: 8, color: GOLD }),
  game3Head3: text('JOCKEY', { ...P.qrLabel, fontSize: 8, color: GOLD }),
  game3r1c1: text('Aeliana', { ...P.bodySmall, fontSize: 9.5, color: NAVY }),
  game3r1c2: text('C. Maher', { ...P.bodySmall, fontSize: 9.5 }),
  game3r1c3: text('J. McDonald', { ...P.bodySmall, fontSize: 9.5 }),
  game3r2c1: text('Imperial Gift', { ...P.bodySmall, fontSize: 9.5, color: NAVY }),
  game3r2c2: text('M. Guerin', { ...P.bodySmall, fontSize: 9.5 }),
  game3r2c3: text('O. Bosson', { ...P.bodySmall, fontSize: 9.5 }),
  game3r3c1: text('Voyage Bubble', { ...P.bodySmall, fontSize: 9.5, color: NAVY }),
  game3r3c2: text('L. Latta', { ...P.bodySmall, fontSize: 9.5 }),
  game3r3c3: text('T. Newman', { ...P.bodySmall, fontSize: 9.5 }),
  game3Qr: qr('https://nztrof.co.nz/game/connections'),
  game3Play: text('PLAY ONLINE', { ...P.qrLabel, fontSize: 8 }),

  // Climb the leaderboard (navy strip)
  climbIcon: icon('TrendingUp', GOLD),
  climbTitle: text('CLIMB THE LEADERBOARD!', { ...P.subhead, color: WHITE, fontSize: 16 }),
  climbBody: text(
    'Top players each month go in the draw to win exclusive racing experiences. New games. New challenges. New chances to win.',
    { ...P.bodySmall, color: LIGHT, fontSize: 10.5 }
  ),

  // Share your score (social block)
  shareTitle: text('SHARE YOUR SCORE!', { ...P.kickerGold, fontSize: 12 }),
  shareNote: text('Tag us #nztrof and show off your skills on our social channels.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  shareFbIcon: icon('Facebook', WHITE),
  shareIgIcon: icon('Instagram', WHITE),
  shareYtIcon: icon('Youtube', WHITE),

  // Gamification partners logo row
  partnersTitle: text('THANK YOU TO OUR GAMIFICATION PARTNERS', { ...P.kickerNavy, fontSize: 9 }),
  partner1: text('TAB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner2: text('LoveRacing.nz', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner3: text('NZB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner4: text('Campbell Infrastructure', { ...P.statLabel, color: NAVY, align: 'center' }),

  footer: text('RACING IS BETTER WHEN WE PLAY TOGETHER.', P.footer),
  pageNum: text('PAGE 16', { ...P.footer, align: 'right' }),
});
