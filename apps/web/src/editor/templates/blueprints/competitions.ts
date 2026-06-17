import { mkPage, text, img, qr, lbTable, STOCK, P, WHITE } from './_shared';

// ── 17. Leaderboards & Competitions ─────────────────────────────────
export const leaderboards = mkPage('leaderboards', 'Leaderboards & Competitions', {
  band: text('LEADERBOARDS & COMPETITIONS', P.bandLabel),
  h1a: text('THE COMPETITION', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('HEATS UP!', { ...P.displayGold, fontSize: 30 }),
  sub: text('Test your knowledge. Celebrate success.', P.scriptGold),
  intro: text('Join our owner competitions and see how you stack up against fellow racing enthusiasts across New Zealand.', P.bodySmall),
  ...lbTable('lb1', 'TIPSTER CHAMPIONSHIP', 'POS · TIPSTER · POINTS', [
    '1 · RacingRyan · 1,275', '2 · TracksideTom · 1,184', '3 · LadyLuck · 1,050', '4 · StraightShooter · 982', '5 · WinningWays · 915',
  ]),
  ...lbTable('lb2', 'BEST YEARLING SELECTIONS', 'POS · OWNER · PROFIT INDEX', [
    '1 · Paddock Partners · 142%', '2 · Horizon Bloodstock · 128%', '3 · South Island Syndicate · 116%', '4 · Bay View Racing · 109%', '5 · The Longshot Crew · 104%',
  ]),
  ...lbTable('lb3', 'SOCIAL ENGAGEMENT', 'POS · MEMBER · ENGAGEMENT', [
    '1 · Racing with Friends · 3,250', '2 · Harbour View Owners · 2,780', '3 · Central South Crew · 2,460', '4 · Waikato Racing Group · 2,150', '5 · The Fillies Club · 1,980',
  ]),
  get1: text('<b>Enter competitions</b> — scan to enter our tipping, selection and photo competitions.', P.bodySmall),
  get1Qr: qr('https://nztrof.co.nz/compete'),
  get2: text('<b>View standings</b> — scan to see full leaderboards and live updates.', P.bodySmall),
  get2Qr: qr('https://nztrof.co.nz/standings'),
  get3: text('<b>Share your moments</b> — tag us in your race-day photos for a chance to be featured.', P.bodySmall),
  get3Qr: qr('https://nztrof.co.nz/share'),
  partners: text('THANK YOU TO OUR COMPETITION PARTNERS — TAB · NZB · RacingEdge · Equi-Nutrition', { ...P.kickerNavy, fontSize: 9 }),
  footer: text('PLAY. COMPETE. CONNECT. BECAUSE RACING IS MORE FUN TOGETHER.', P.footer),
  pageNum: text('PAGE 15', { ...P.footer, align: 'right' }),
});

// ── 18. Gamification ────────────────────────────────────────────────
export const gamification = mkPage('gamification', 'Gamification', {
  band: text('GAMIFICATION PAGE', P.bandLabel),
  h1a: text('PLAY. WIN.', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('EXPERIENCE.', { ...P.displayGold, fontSize: 34 }),
  sub: text('Fun for everyone. Prizes for our owners.', P.scriptGold),
  body: text('Get involved, test your racing knowledge and you could win incredible ownership experiences and prizes!', P.bodySmall),
  prizeTitle: text('PRIZE POOL', P.kickerGold),
  prizes: text('★ Stable visit & morning tea for 4<br>★ Race-day hospitality experience<br>★ Syndicate share in a future runner<br>★ Signed racing memorabilia<br>★ And more!', P.bodySmall),
  game1Title: text('1 · SPOT THE DIFFERENCE', P.kickerNavy),
  game1Img: img(STOCK.horseGallop, 'cover'),
  game1Qr: qr('https://nztrof.co.nz/game/spot'),
  game2Title: text('2 · OWNERSHIP MEMORY', P.kickerNavy),
  game2Img: img(STOCK.raceFinish, 'cover'),
  game2Qr: qr('https://nztrof.co.nz/game/memory'),
  game3Title: text('3 · RACING CONNECTIONS', P.kickerNavy),
  game3Body: text('Can you link the horse, trainer and jockey? Match them all and enter the draw to win a fantastic prize!', P.bodySmall),
  game3Qr: qr('https://nztrof.co.nz/game/connections'),
  climbTitle: text('CLIMB THE LEADERBOARD!', { ...P.subhead, color: WHITE, fontSize: 15 }),
  climbBody: text('Top players each month go in the draw to win exclusive racing experiences. New games. New challenges. New chances to win.', { ...P.bodySmall, color: '#dfe6f2' }),
  shareNote: text('SHARE YOUR SCORE! Tag us #nztrof and show off your skills on our social channels.', P.qrLabel),
  partners: text('THANK YOU TO OUR GAMIFICATION PARTNERS — TAB · LoveRacing.nz · NZB · Campbell Infrastructure', { ...P.kickerNavy, fontSize: 9 }),
  footer: text('RACING IS BETTER WHEN WE PLAY TOGETHER.', P.footer),
  pageNum: text('PAGE 16', { ...P.footer, align: 'left' }),
});
