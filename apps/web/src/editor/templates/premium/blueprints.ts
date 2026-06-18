/**
 * Premium template blueprints (template #2).
 *
 * Same editable-region model as the classic blueprints, but the content/styles
 * are tuned for the premium design — notably the navy feature pages (Aeliana)
 * carry white/gold text styles so they read correctly on the dark surface.
 *
 * These live in their own module and use their OWN pageType keys (suffixed
 * `-px`) so template #1's pages and rendering are completely untouched.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy
const LIGHTER = '#aebccd'; // captions/labels on navy
const GOLD_LEAD = '#caa54a';

// ── Cover (premium) — matches the printed cover ─────────────────────
export const coverPx = mkPage('cover-px', 'Cover', {
  tagline: text('Own the experience.<br>Share the thrill.', P.scriptGold),
  masthead: text(`NZTR<span style="color:${GOLD}">O</span>F`, { ...P.displayNavy, fontSize: 40, letterSpacing: 1 }),
  mastheadSub: text('NEW ZEALAND THOROUGHBRED<br>RACEHORSE OWNERS FEDERATION', { ...P.kickerNavy, fontSize: 8 }),
  badge: text('ADVANCED BULLETIN  |  PROTOTYPE ISSUE', { ...P.kickerGold, fontSize: 8.5 }),
  h1: text('BE PART OF', { ...P.displayNavy, fontSize: 50 }),
  h2: text('SOMETHING', { ...P.displayGold, fontSize: 50 }),
  h3: text('EXTRAORDINARY', { ...P.displayGold, fontSize: 50 }),
  intro: text(
    'The premium owner-first publication for New Zealand thoroughbred racing. Celebrating the people, stories, friendships and moments that make racehorse ownership unforgettable.',
    { ...P.body, fontSize: 12 }
  ),
  editionBadge: text('20 PAGE OWNER EXPERIENCE EDITION', { ...P.bandLabel, fontSize: 10 }),
  insideTitle: text('INSIDE THIS ISSUE', P.kickerGold),
  inside1: text('<b>Owner stories</b><br>Real journeys and winning moments', P.bodySmall),
  inside2: text('<b>Regional roundups</b><br>QR-linked coverage for every region', P.bodySmall),
  inside3: text('<b>Young owners</b><br>The next generation coming through', P.bodySmall),
  inside4: text('<b>Women in racing</b><br>Style, leadership and participation', P.bodySmall),
  inside5: text('<b>Games &amp; prizes</b><br>QR competitions, leaderboards and giveaways', P.bodySmall),
  hero: img(STOCK.winnersCircle, 'cover', { y: 0.4 }),
  scanTitle: text('SCAN TO JOIN', P.kickerNavy),
  scanSub: text('or view the full digital bulletin', P.meta),
  scanUrl: text('raceowners.co.nz/join', { ...P.meta, fontWeight: 700, color: NAVY }),
  joinQr: qr('https://raceowners.co.nz/join'),
  partnersTitle: text('FOUNDING ADVERTISING PARTNERS', { ...P.kickerWhite, fontSize: 9 }),
  partner1: text('NZTAB', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner2: text('NZ Bloodstock', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner3: text('David Archer Insurance', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner4: text('Cambridge Stud', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner5: text('Brighthill Farm', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner6: text('SRM Feeds', { ...P.statLabel, color: NAVY, align: 'center' }),
  footer: text('OWNER TODAY. PART OF THE JOURNEY FOREVER.', P.footer),
  pageNum: text('PAGE 1', { ...P.footer, align: 'right' }),
});

// ── Best Headline Story — Aeliana (premium, NAVY feature page) ───────
export const headlinePx = mkPage('headline-px', 'Headline Story — Aeliana', {
  band: text('BEST HEADLINE STORY', { ...P.bandLabel, color: NAVY }),
  bandSub: text('Extraordinary stories. Real people. Real impact.', { ...P.caption, color: GOLD }),
  title: text('AELIANA', { ...P.displayNavy, fontSize: 56, letterSpacing: 1, color: WHITE }),
  subtitle: text('THE HOMEGROWN STAR<br>WHO TOOK THE WORLD BY STORM', { ...P.headlineGold, fontSize: 18 }),
  hero: img(STOCK.jockeyRace, 'cover'),
  intro: text(
    'From a Waikato farm to the world stage — Aeliana\'s story is the stuff of dreams. Bred by John Thompson and the team at Richill Farm, Aeliana was sold at the 2020 New Zealand Bloodstock Karaka Yearling Sale for NZ$210,000. What followed was nothing short of phenomenal.',
    { ...P.body, color: LIGHT }
  ),
  stat1Num: text('NZ$210,000', P.statBig),
  stat1Label: text('SOLD AT KARAKA 2020 · BY RICHILL FARM', { ...P.statLabel, color: LIGHTER }),
  stat2Num: text('A$4.24M+', P.statBig),
  stat2Label: text('CAREER EARNINGS (AND COUNTING)', { ...P.statLabel, color: LIGHTER }),
  stat3Num: text('6', P.statBig),
  stat3Label: text('GROUP 1 WINS IN AUSTRALIA', { ...P.statLabel, color: LIGHTER }),
  stat4Num: text('★', P.statBig),
  stat4Label: text('A STAR ON THE WORLD STAGE', { ...P.statLabel, color: LIGHTER }),
  journeyTitle: text('THE JOURNEY', { ...P.kickerGold, fontSize: 11 }),
  j1: text(`<b style="color:${GOLD_LEAD}">BRED WITH VISION</b> — John Thompson's commitment to breeding quality at Richill Farm produced a filly with all the right ingredients.`, { ...P.bodySmall, color: LIGHT }),
  j2: text(`<b style="color:${GOLD_LEAD}">KARAKA MOMENT</b> — offered by Richill Farm at Karaka 2020 and purchased for NZ$210,000 — the beginning of something special.`, { ...P.bodySmall, color: LIGHT }),
  j3: text(`<b style="color:${GOLD_LEAD}">RISING STAR</b> — trained by Ciaron Maher, Aeliana showed talent early, quickly rising through the grades.`, { ...P.bodySmall, color: LIGHT }),
  j4: text(`<b style="color:${GOLD_LEAD}">GROUP 1 GLORY</b> — winner of the Australian Oaks, The Tancred Stakes, The Thousand Guineas and more.`, { ...P.bodySmall, color: LIGHT }),
  j5: text(`<b style="color:${GOLD_LEAD}">AN INSPIRATION</b> — a powerful reminder of what great breeding, patience and passion can achieve.`, { ...P.bodySmall, color: LIGHT }),
  photo1: img(STOCK.winnersCircle, 'cover'),
  photo2: img(STOCK.raceFinish, 'cover'),
  quote: text('It\'s every breeder\'s dream to breed a Group 1 winner — to do it on the world stage is beyond words.', { ...P.pullQuote, color: GOLD, italic: true }),
  quoteBy: text('— John Thompson, Richill Farm', { ...P.role, color: GOLD_LEAD }),
  exploreTitle: text('EXPLORE THE AELIANA STORY', { ...P.bandLabel, fontSize: 11 }),
  qr1: qr('https://nztrof.co.nz/aeliana/replays'),
  qr1Label: text('RACE REPLAYS', { ...P.qrLabel, color: LIGHTER }),
  qr2: qr('https://nztrof.co.nz/aeliana/record'),
  qr2Label: text('FULL RACE RECORD', { ...P.qrLabel, color: LIGHTER }),
  qr3: qr('https://nztrof.co.nz/aeliana/interviews'),
  qr3Label: text('OWNER &amp; BREEDER INTERVIEWS', { ...P.qrLabel, color: LIGHTER }),
  qr4: qr('https://nztrof.co.nz/aeliana/breeding'),
  qr4Label: text('NZ BREEDING SUCCESS', { ...P.qrLabel, color: LIGHTER }),
  qr5: qr('https://nztrof.co.nz/ownership'),
  qr5Label: text('OWNERSHIP OPPORTUNITIES', { ...P.qrLabel, color: LIGHTER }),
  footer: text('GREAT HORSES. GREAT PEOPLE. GREAT STORIES.', P.footer),
  pageNum: text('PAGE 27', { ...P.footer, align: 'right' }),
});

// ── President's Update (premium, cream page with board head-shots) ──
const ROLE_GOLD = '#8a6b1e';
const member = (name: string, role: string, email: string) =>
  text(`<b>${name}</b><br><span style="color:${ROLE_GOLD}">${role}</span><br>${email}`, { ...P.bodySmall, fontSize: 9, lineHeight: 1.3 });

export const presidentPx = mkPage('president-px', "President's Update", {
  h1a: text("PRESIDENT'S", { ...P.displayNavy, fontSize: 38 }),
  h1b: text('UPDATE', { ...P.displayGold, fontSize: 38 }),
  byline: text('from Sally Blyth', P.script),
  portrait: img(STOCK.portrait3, 'cover'),
  body: text(
    "Welcome to another exciting edition of the NZTROF Bulletin.<br><br>It's wonderful to see so many of our owners enjoying success on the track and sharing in the thrill of ownership.<br><br>Whether it's your first runner or your fiftieth, the joy of seeing your horse compete never gets old.<br><br>Thank you for being part of our amazing community. Your passion and support help make racing the special sport that it is.<br><br>Enjoy the read!",
    P.body
  ),
  signoff: text('Sally', { ...P.script, fontSize: 30 }),
  name: text('Sally Blyth', P.name),
  role: text('President · Auckland Delegate · sally@beyondlimits.co.nz', P.role),
  boardTitle: text('NZTROF BOARD', { ...P.bandLabel, fontSize: 11 }),
  memberImg1: img(STOCK.portrait1, 'cover'), member1: member('Sally Blyth', 'President · Auckland Delegate', 'sally@beyondlimits.co.nz'),
  memberImg2: img(STOCK.portrait2, 'cover'), member2: member('Berri Schroder', 'Interim Editor · Waikato Delegate', 'berri.schroder@xtra.co.nz'),
  memberImg3: img(STOCK.portrait4, 'cover'), member3: member('Bernard Hickey', "Hawke's Bay Delegate", 'bernard.hickey@xtra.co.nz'),
  memberImg4: img(STOCK.portrait5, 'cover'), member4: member('Mark Verran', 'Manawatu Delegate', 'verran.mark@gmail.com'),
  memberImg5: img(STOCK.women, 'cover'), member5: member('Peter Faulkner', 'Central South Island Delegate', 'peterfaulkner@xtra.co.nz'),
  memberImg6: img(STOCK.portrait3, 'cover'), member6: member('Ian Hackett', 'Wanganui/Taranaki Delegate', 'ian.hackett@xtra.co.nz'),
  memberImg7: img(STOCK.portrait1, 'cover'), member7: member('Denise Mayhew', 'Executive Officer', 'admin@nztrof.co.nz'),
  stayTitle: text('Stay connected!', { ...P.script, color: WHITE, fontSize: 22 }),
  stayBody: text('Scan the QR code to visit our website for the latest news, race results, owner benefits and event details.', { ...P.bodySmall, color: '#dfe6f2' }),
  stayQr: qr('https://nztrof.co.nz'),
  siteLabel: text('nztrof.co.nz', { ...P.kickerGold, fontSize: 11 }),
  footer: text("PROUD TO REPRESENT NEW ZEALAND'S RACEHORSE OWNERS.", P.footer),
  pageNum: text('PAGE 2', { ...P.footer, align: 'right' }),
});

/** All premium blueprints (merged into the lookup map; NOT into the classic
 *  print-order array, so template #1's default document is unchanged). */
export const PREMIUM_BLUEPRINTS: PageBlueprint[] = [coverPx, headlinePx, presidentPx];
