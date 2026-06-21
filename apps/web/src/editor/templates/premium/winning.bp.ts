/**
 * Premium Winning Moments blueprint (template #2) — `winning-moments-px`.
 *
 * Premium restyle of the classic `winning` page: hero winners photo, SIX winner
 * cards (Group 1 Sistema / Group 2 Avondale / Group 3 Waikato / Listed Coupland's
 * / Benchmark Matamata) each with photo + race label + horse + owners/trainer/
 * jockey detail, plus a "share your winning moments" upload QR strip. Same region
 * names and copy as the classic, restyled for the premium house design.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';
import { winnerCard } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy

export const winningPx: PageBlueprint = mkPage('winning-moments-px', 'Winning Moments', {
  // Header band
  band: text('WINNING MOMENTS', P.bandLabel),
  bandSub: text('The thrill. The people. The pride.', { ...P.caption, color: GOLD }),
  bandIcon: icon('Trophy', GOLD),

  // Headline block
  h1a: text('OWNERSHIP. PASSION.', { ...P.displayNavy, fontSize: 32 }),
  h1b: text('VICTORY.', { ...P.displayGold, fontSize: 32 }),
  sub: text('Moments that stay with you forever.', P.scriptGold),
  intro: text('Congratulations to all our winning connections from the past month.', { ...P.body, fontSize: 12 }),
  heroImg: img(STOCK.ownersCelebrate, 'cover'),

  // Six winner cards (photo + race label + horse + owners/trainer/jockey)
  ...winnerCard('w1', STOCK.winnersCircle, 'GROUP 1 VICTORY — SISTEMA STAKES', 'IMPERIAL GIFT', 'Owners: Paddock Partners Syndicate (Mgr: D. Anderson). Trainer: M. Walker · Jockey: M. Cartwright'),
  ...winnerCard('w2', STOCK.raceFinish, 'GROUP 2 VICTORY — AVONDALE GUINEAS', 'VOYAGE BUBBLE', 'Owners: Bubble Racing Syndicate (Mgr: Mrs L. Latta). Trainer: T. Pike · Jockey: O. Bosson'),
  ...winnerCard('w3', STOCK.jockeyRace, 'GROUP 3 VICTORY — WAIKATO GUINEAS', 'SAVABEEL', 'Owners: Savannah Success Syndicate. Trainer: M. Walker · Jockey: J. McDonald'),
  ...winnerCard('w4', STOCK.celebrate2, "LISTED — COUPLAND'S MILE", 'MISS TIVACI', 'Owners: Tivaci Girls Syndicate (Mgr: K. Fursdon). Trainer: S & E. Clotworthy · Jockey: M. Coleman'),
  ...winnerCard('w5', STOCK.crowd2, 'BENCHMARK WINNER — MATAMATA', 'OCEAN EMPRESS', 'Owners: Blue Ocean Racing (Mgr: B. Hargreaves). Trainer: S. Marsh · Jockey: W. Pinn'),

  // Share your winning moments — upload QR strip
  uploadIcon: icon('Camera', GOLD),
  uploadTitle: text('SHARE YOUR WINNING MOMENTS', { ...P.kickerGold, fontSize: 12, color: WHITE }),
  uploadQr: qr('https://nztrof.co.nz/upload'),
  uploadNote: text('Share your winning moments with the ownership community! Upload your photos online now.', { ...P.bodySmall, color: LIGHT }),

  footer: text('EVERY WINNER HAS A TEAM BEHIND THEM.', P.footer),
  pageNum: text('PAGE 18', { ...P.footer, align: 'right' }),
});
