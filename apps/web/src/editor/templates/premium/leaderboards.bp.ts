/**
 * Premium template — Leaderboards & Competitions blueprint (template #2).
 *
 * Premium-styled version of the classic `leaderboards` page (competitions.ts /
 * LeaderboardsPage). Same region names and copy; restyled for the premium house
 * design — racing hero photo, THREE styled leaderboard tables (navy header strip
 * + gold-rank rows), a "Get Involved!" row of icon+QR columns and a competition
 * partners logo row. Uses its own `-px` pageType so template #1 is untouched.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

// One leaderboard table → title, three-column head + five ranked rows. Each row
// is rendered as its own region so the styled premium table keeps every entry.
function lbTablePx(prefix: string, title: string, c1: string, c2: string, c3: string, rows: Array<[string, string, string]>) {
  const out: Record<string, ReturnType<typeof text>> = {
    [`${prefix}Title`]: text(title, { ...P.kickerWhite, fontSize: 9.5, color: GOLD }),
    [`${prefix}Col1`]: text(c1, { ...P.th, color: WHITE }),
    [`${prefix}Col2`]: text(c2, { ...P.th, color: WHITE }),
    [`${prefix}Col3`]: text(c3, { ...P.th, color: GOLD, align: 'right' }),
  };
  rows.forEach(([pos, name, val], i) => {
    out[`${prefix}R${i + 1}Pos`] = text(pos, { ...P.tdBold, fontSize: 11, color: GOLD });
    out[`${prefix}R${i + 1}Name`] = text(name, { ...P.td, fontSize: 10.5 });
    out[`${prefix}R${i + 1}Val`] = text(val, { ...P.tdBold, fontSize: 10.5, align: 'right' });
  });
  return out;
}

export const leaderboardsPx = mkPage('leaderboards-px', 'Leaderboards & Competitions', {
  band: text('LEADERBOARDS & COMPETITIONS', P.bandLabel),
  bandIcon: icon('Trophy', GOLD),

  // Headline + hero
  h1a: text('THE COMPETITION', { ...P.displayNavy, fontSize: 32 }),
  h1b: text('HEATS UP!', { ...P.displayGold, fontSize: 32 }),
  sub: text('Test your knowledge. Celebrate success.', { ...P.scriptGold, fontSize: 20 }),
  intro: text(
    'Join our owner competitions and see how you stack up against fellow racing enthusiasts across New Zealand.',
    { ...P.body, fontSize: 11.5 }
  ),
  heroImg: img(STOCK.jockeyRace, 'cover'),

  // Three leaderboard tables (5 ranked rows each)
  ...lbTablePx('lb1', 'TIPSTER CHAMPIONSHIP', 'POS', 'TIPSTER', 'POINTS', [
    ['1', 'RacingRyan', '1,275'],
    ['2', 'TracksideTom', '1,184'],
    ['3', 'LadyLuck', '1,050'],
    ['4', 'StraightShooter', '982'],
    ['5', 'WinningWays', '915'],
  ]),
  ...lbTablePx('lb2', 'BEST YEARLING SELECTIONS', 'POS', 'OWNER', 'PROFIT INDEX', [
    ['1', 'Paddock Partners', '142%'],
    ['2', 'Horizon Bloodstock', '128%'],
    ['3', 'South Island Syndicate', '116%'],
    ['4', 'Bay View Racing', '109%'],
    ['5', 'The Longshot Crew', '104%'],
  ]),
  ...lbTablePx('lb3', 'SOCIAL ENGAGEMENT', 'POS', 'MEMBER', 'ENGAGEMENT', [
    ['1', 'Racing with Friends', '3,250'],
    ['2', 'Harbour View Owners', '2,780'],
    ['3', 'Central South Crew', '2,460'],
    ['4', 'Waikato Racing Group', '2,150'],
    ['5', 'The Fillies Club', '1,980'],
  ]),

  // Get Involved! — three icon + QR columns
  getTitle: text('GET INVOLVED!', { ...P.kickerNavy, fontSize: 14 }),
  get1Icon: icon('Ticket', GOLD),
  get1: text('<b>Enter competitions</b> — scan to enter our tipping, selection and photo competitions.', { ...P.bodySmall, fontSize: 10 }),
  get1Qr: qr('https://nztrof.co.nz/compete'),
  get2Icon: icon('BarChart3', GOLD),
  get2: text('<b>View standings</b> — scan to see full leaderboards and live updates.', { ...P.bodySmall, fontSize: 10 }),
  get2Qr: qr('https://nztrof.co.nz/standings'),
  get3Icon: icon('Camera', GOLD),
  get3: text('<b>Share your moments</b> — tag us in your race-day photos for a chance to be featured.', { ...P.bodySmall, fontSize: 10 }),
  get3Qr: qr('https://nztrof.co.nz/share'),

  // Competition partners logo row
  partnersTitle: text('THANK YOU TO OUR COMPETITION PARTNERS', { ...P.kickerGold, fontSize: 10 }),
  partner1: text('TAB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner2: text('NZB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner3: text('RacingEdge', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner4: text('Equi-Nutrition', { ...P.statLabel, color: NAVY, align: 'center' }),

  footer: text('PLAY. COMPETE. CONNECT. BECAUSE RACING IS MORE FUN TOGETHER.', P.footer),
  pageNum: text('PAGE 15', { ...P.footer, align: 'right' }),
});
