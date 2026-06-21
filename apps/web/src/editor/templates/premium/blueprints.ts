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
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

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
  stat1Icon: icon('Gavel'),
  stat1Num: text('NZ$210,000', P.statBig),
  stat1Label: text('SOLD AT KARAKA 2020 · BY RICHILL FARM', { ...P.statLabel, color: LIGHTER }),
  stat2Icon: icon('Trophy'),
  stat2Num: text('A$4.24M+', P.statBig),
  stat2Label: text('CAREER EARNINGS (AND COUNTING)', { ...P.statLabel, color: LIGHTER }),
  stat3Icon: icon('Star'),
  stat3Num: text('6', P.statBig),
  stat3Label: text('GROUP 1 WINS IN AUSTRALIA', { ...P.statLabel, color: LIGHTER }),
  stat4Icon: icon('Globe'),
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
  qr1Icon: icon('PlayCircle'),
  qr1: qr('https://nztrof.co.nz/aeliana/replays'),
  qr1Label: text('RACE REPLAYS', { ...P.qrLabel, color: LIGHTER }),
  qr2Icon: icon('BarChart3'),
  qr2: qr('https://nztrof.co.nz/aeliana/record'),
  qr2Label: text('FULL RACE RECORD', { ...P.qrLabel, color: LIGHTER }),
  qr3Icon: icon('Users'),
  qr3: qr('https://nztrof.co.nz/aeliana/interviews'),
  qr3Label: text('OWNER &amp; BREEDER INTERVIEWS', { ...P.qrLabel, color: LIGHTER }),
  qr4Icon: icon('Sprout'),
  qr4: qr('https://nztrof.co.nz/aeliana/breeding'),
  qr4Label: text('NZ BREEDING SUCCESS', { ...P.qrLabel, color: LIGHTER }),
  qr5Icon: icon('Award'),
  qr5: qr('https://nztrof.co.nz/ownership'),
  qr5Label: text('OWNERSHIP OPPORTUNITIES', { ...P.qrLabel, color: LIGHTER }),
  footer: text('GREAT HORSES. GREAT PEOPLE. GREAT STORIES.', P.footer),
  pageNum: text('PAGE 27', { ...P.footer, align: 'right' }),
});

// ── President's Update (premium, cream page with board head-shots) ──
const ROLE_GOLD = '#8a6b1e';

// One board member → head-shot + navy name + gold role + email regions, so every
// row matches the printed page (square photo, name, gold title, mail-icon email).
function boardMember(i: number, photo: string, name: string, role: string, email: string) {
  return {
    [`memberImg${i}`]: img(photo, 'cover'),
    [`memberName${i}`]: text(name, { ...P.name, fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase' }),
    [`memberRole${i}`]: text(role, { ...P.role, fontSize: 9, color: ROLE_GOLD, lineHeight: 1.2 }),
    [`memberIcon${i}`]: icon('Mail'),
    [`memberEmail${i}`]: text(email, { ...P.meta, fontSize: 8.5, color: NAVY }),
  };
}

export const presidentPx = mkPage('president-px', "President's Update", {
  h1a: text("PRESIDENT'S", { ...P.displayNavy, fontSize: 40 }),
  h1b: text('UPDATE', { ...P.displayGold, fontSize: 40 }),
  byline: text('from Sally Blyth', { ...P.pullQuote, fontWeight: 500, fontSize: 18 }),
  portrait: img(STOCK.portrait3, 'cover'),
  body: text(
    "Welcome to another exciting edition of the NZTROF Bulletin.<br><br>It's wonderful to see so many of our owners enjoying success on the track and sharing in the thrill of ownership.<br><br>Whether it's your first runner or your fiftieth, the joy of seeing your horse compete never gets old.<br><br>Thank you for being part of our amazing community. Your passion and support help make racing the special sport that it is.<br><br>Enjoy the read!",
    P.body
  ),
  signoff: text('Sally', { ...P.script, fontSize: 32 }),
  name: text('Sally Blyth', { ...P.name, fontSize: 15 }),
  role: text('President<br>Auckland Delegate', { ...P.meta, fontSize: 11, lineHeight: 1.3 }),
  emailIcon: icon('Mail'),
  email: text('sally@beyondlimits.co.nz', { ...P.meta, fontSize: 11, color: NAVY }),
  boardTitle: text('NZTROF BOARD', { ...P.bandLabel, fontSize: 12, align: 'center', color: GOLD }),
  ...boardMember(1, STOCK.portrait3, 'Sally Blyth', 'President<br>Auckland Delegate', 'sally@beyondlimits.co.nz'),
  ...boardMember(2, STOCK.portrait1, 'Berri Schroder', 'Interim Editor<br>Waikato Delegate', 'berri.schroder@xtra.co.nz'),
  ...boardMember(3, STOCK.portrait2, 'Bernard Hickey', "Hawke's Bay Delegate", 'bernard.hickey@xtra.co.nz'),
  ...boardMember(4, STOCK.portrait4, 'Mark Verran', 'Manawatu Delegate', 'verran.mark@gmail.com'),
  ...boardMember(5, STOCK.portrait5, 'Peter Faulkner', 'Central South Island Delegate', 'peterfaulkner@xtra.co.nz'),
  ...boardMember(6, STOCK.portrait1, 'Ian Hackett', 'Wanganui/Taranaki Delegate', 'ian.hackett@xtra.co.nz'),
  ...boardMember(7, STOCK.women, 'Denise Mayhew', 'Executive Officer', 'admin@nztrof.co.nz'),
  stayTitle: text('Stay connected!', { ...P.script, color: GOLD, fontSize: 22 }),
  stayBody: text('Scan the QR code to visit our website for the latest news, race results, owner benefits and event details.', { ...P.bodySmall, color: '#dfe6f2' }),
  stayQr: qr('https://nztrof.co.nz'),
  siteIcon: icon('Globe', GOLD),
  siteLabel: text('nztrof.co.nz', { ...P.kickerGold, fontSize: 12 }),
  brand: text(`NZTR<span style="color:${GOLD}">O</span>F`, { ...P.displayNavy, color: WHITE, fontSize: 26, letterSpacing: 1 }),
  brandSub: text('NEW ZEALAND THOROUGHBRED<br>RACEHORSE OWNERS FEDERATION', { ...P.kickerWhite, fontSize: 8, letterSpacing: 1.2, lineHeight: 1.3 }),
  pageNum: text('2', { ...P.meta, fontSize: 11, color: NAVY, align: 'center' }),
});

// ── From the Editor (premium, cream page) ───────────────────────────
// Letter-from-the-editor spread: title + pen, editor letter with email QR,
// welcome-new-members list, an "on the cover" rail (story + cover photo + QR),
// website + follow-us cards, and a navy subscription-rates band.
export const editorPx = mkPage('editor-px', 'From the Editor', {
  // Title block
  h1a: text('FROM THE', { ...P.displayNavy, fontSize: 34 }),
  interim: text('(interim)', { ...P.body, italic: true, fontSize: 15, lineHeight: 1 }),
  h1b: text('EDITOR', { ...P.displayGold, fontSize: 52, lineHeight: 1 }),
  byline: text('by Berri Schroder', { ...P.pullQuote, fontWeight: 500, fontSize: 18 }),
  penIcon: icon('PenTool', GOLD),

  // Editor letter
  body: text(
    'Every issue of the Bulletin aims to bring you more than just news – we share the stories behind the silks, the people behind the passion and the moments that make ownership so rewarding.<br><br>In this edition we celebrate owner achievements, feature inspiring stories from around the country and highlight upcoming events and opportunities to get involved.<br><br>Thank you to everyone who contributes, supports and shares in the journey.<br><br>If you have a story or photos you’d like to share, we’d love to hear from you!',
    { ...P.body, fontSize: 12, lineHeight: 1.7 }
  ),
  signoff: text('Berri', { ...P.script, fontSize: 30 }),
  name: text('Berri Schroder', { ...P.name, fontSize: 15 }),
  role: text('Interim Editor', { ...P.meta, fontSize: 11 }),
  emailIcon: icon('Mail'),
  email: text('berri.schroder@xtra.co.nz', { ...P.meta, fontSize: 11, color: NAVY }),
  emailQr: qr('mailto:berri.schroder@xtra.co.nz'),
  emailQrLabel: text('Scan to email<br>Berri', { ...P.script, fontSize: 15, color: ROLE_GOLD, lineHeight: 1.1 }),

  // Welcome new members
  welcomeTitle: text('WELCOME NEW MEMBERS', { ...P.kickerGold, fontSize: 13 }),
  welcomeIntro: text('A warm welcome to…', { ...P.body, italic: true, fontSize: 12, color: ROLE_GOLD }),
  member1: text(`The O’Sullivan Family – <span style="color:${ROLE_GOLD}">Cambridge</span>`, { ...P.body, fontSize: 11.5 }),
  member2: text(`Westbury Racing Syndicate – <span style="color:${ROLE_GOLD}">Matamata</span>`, { ...P.body, fontSize: 11.5 }),
  member3: text(`Greenlight Racing – <span style="color:${ROLE_GOLD}">Auckland</span>`, { ...P.body, fontSize: 11.5 }),
  member4: text(`South Island Striders – <span style="color:${ROLE_GOLD}">Christchurch</span>`, { ...P.body, fontSize: 11.5 }),
  welcomeOutro: text('We’re thrilled to have you<br>as part of our racing family!', { ...P.body, italic: true, fontSize: 12, color: ROLE_GOLD, lineHeight: 1.3 }),

  // On the cover
  coverKicker: text('ON THE COVER', { ...P.kickerGold, fontSize: 12 }),
  coverTitle: text('OWNERS CELEBRATE<br>ANOTHER WIN!', { ...P.subhead, fontSize: 16, lineHeight: 1.1 }),
  coverBody: text(
    'A special moment of celebration after an impressive victory. There’s nothing quite like the camaraderie and excitement of winning with your fellow owners.',
    { ...P.body, fontSize: 11.5 }
  ),
  coverImg: img(STOCK.ownersCelebrate, 'cover'),
  coverQr: qr('https://nztrof.co.nz/on-the-cover'),
  coverQrLabel: text('SCAN TO VIEW<br>THE FULL STORY<br>AND PHOTO GALLERY', { ...P.kickerGold, fontSize: 9, lineHeight: 1.35 }),

  // Visit our website
  webTitle: text('VISIT OUR WEBSITE', { ...P.kickerNavy, fontSize: 12 }),
  webUrl: text('RACEOWNERS.CO.NZ', { ...P.kickerGold, fontSize: 14 }),
  webBody: text('Your go-to place for ownership information, resources, race results and owners’ benefits.', { ...P.body, fontSize: 11 }),
  webQr: qr('https://raceowners.co.nz'),

  // Follow us (navy card)
  followTitle: text('FOLLOW US', { ...P.kickerGold, fontSize: 12 }),
  followBody: text('Keep up to date with the latest news, stories and race day highlights.', { ...P.bodySmall, color: '#dfe6f2' }),
  fbIcon: icon('Facebook', WHITE),
  igIcon: icon('Instagram', WHITE),
  ytIcon: icon('Youtube', WHITE),

  // Subscription band + page number
  subTitle: text('SUBSCRIPTION RATES', { ...P.kickerGold, fontSize: 12 }),
  subSingle: text('Single $60 <span style="color:#9fb2c9">(incl. GST)</span>', { ...P.meta, color: WHITE, fontSize: 11.5 }),
  subDouble: text('Double $65 <span style="color:#9fb2c9">(incl. GST)</span>', { ...P.meta, color: WHITE, fontSize: 11.5 }),
  pageNum: text('3', { ...P.meta, fontSize: 11, color: NAVY, align: 'center' }),

  // Faint horse watermark (swap for the line-art brand mark)
  watermark: img(STOCK.horseGallop, 'contain'),
});

// ── Important Discussion (premium, NAVY infographic feature page) ────
// Dense "why the owner should be at the top of the tree" blueprint page:
// headline + tree, ownership pyramid + owner-drivers, the structural cycle,
// a data row, a what-must-change checklist and the 3-step NZ model.
const D_TITLE = { ...P.kickerNavy, fontSize: 9, letterSpacing: 0.4 };
const D_DESC = { ...P.bodySmall, fontSize: 8.5, lineHeight: 1.35, color: '#33373d' };
const D_BODY = { ...P.bodySmall, fontSize: 9, lineHeight: 1.35, color: '#33373d' };

// icon + bold white title + light description (drivers, cycle & data lists)
function iconLine(prefix: string, name: string, title: string, desc: string) {
  return {
    [`${prefix}Icon`]: icon(name),
    [`${prefix}Title`]: text(title, D_TITLE),
    [`${prefix}Desc`]: text(desc, D_DESC),
  };
}
const checkLine = (i: number, body: string) => ({
  [`change${i}Icon`]: icon('CheckCircle', ROLE_GOLD),
  [`change${i}`]: text(body, D_BODY),
});
const stepLine = (i: number, title: string, sub: string) => ({
  [`step${i}Title`]: text(title, D_TITLE),
  [`step${i}Sub`]: text(sub, D_DESC),
});

export const discussionPx = mkPage('discussion-px', 'Important Discussion', {
  // Header band
  pill: text('PAGE 26', { ...P.bandLabel, color: NAVY, fontSize: 10 }),
  discussIcon: icon('MessageCircle', NAVY),
  bandLabel: text('IMPORTANT DISCUSSION', { ...P.bandLabel, color: NAVY }),
  tagline: text('The future of racing starts with ownership.', { ...P.caption, color: ROLE_GOLD, fontSize: 10 }),

  // Headline + tree
  h1a: text('WHY THE OWNER', { ...P.displayNavy, fontSize: 37, fontWeight: 900, lineHeight: 1.04 }),
  h1b: text('SHOULD BE AT THE', { ...P.displayGold, fontSize: 37, fontWeight: 900, lineHeight: 1.04 }),
  h1c: text('TOP OF THE TREE', { ...P.displayGold, fontSize: 37, fontWeight: 900, lineHeight: 1.04 }),
  lead: text('Ownership is the foundation of everything,<br>that makes racing possible.', { ...P.pullQuote, color: ROLE_GOLD, fontSize: 15 }),
  body: text(
    "The NZ Blueprint makes one thing clear – without owners, there is no racing industry. Owners are the investors, the believers, and the reason the sport exists. It's time ownership is recognised as the strategic priority it truly is.",
    { ...P.body, fontSize: 10.5, color: '#33373d', lineHeight: 1.5 }
  ),
  treeImg: img('https://images.pexels.com/photos/35302341/pexels-photo-35302341.jpeg?auto=compress&cs=tinysrgb&w=1200', 'cover'),

  // Ownership pyramid panel
  pyramidTitle: text('THE OWNERSHIP PYRAMID – A STRONG BASE BUILDS A STRONG INDUSTRY', { ...P.kickerGold, fontSize: 8.5, letterSpacing: 0.5 }),
  tier1Icon: icon('Crown'),
  tier2Icon: icon('Users'),
  tier3Icon: icon('UsersGroup'),
  tier1Name: text('VISIONARY OWNERS', { ...P.kickerGold, color: ROLE_GOLD, fontSize: 9 }),
  tier1Sub: text('Lead, invest, inspire', D_DESC),
  tier2Name: text('ENGAGED OWNERS', { ...P.kickerNavy, fontSize: 9 }),
  tier2Sub: text('Active, informed, and involved', D_DESC),
  tier3Name: text('NEW &amp; ASPIRING OWNERS', { ...P.kickerNavy, fontSize: 8, letterSpacing: 0.3 }),
  tier3Sub: text('The future of our sport', D_DESC),
  tier4Name: text('PARTICIPATION PIPELINE', { ...P.kickerNavy, fontSize: 9 }),
  tier4Sub: text('Stronger participation. Stronger industry.', D_DESC),
  driversIntro: text('A strong and sustainable industry is built from the ground up.', { ...P.bodySmall, fontSize: 9, color: NAVY, lineHeight: 1.35 }),
  ...iconLine('d1', 'DollarSign', 'OWNERS FUND THE DREAM', 'Owners fund breeding, training and the daily work behind every race.'),
  ...iconLine('d2', 'TrendingUp', 'OWNERS DRIVE INVESTMENT', 'They create demand, support jobs and grow the economy.'),
  ...iconLine('d3', 'Trophy', 'OWNERS CREATE THE PRODUCT', 'No owners – No horses. No horses – No racing.'),
  ...iconLine('d4', 'UsersGroup', 'OWNERS BUILD THE COMMUNITY', 'Owners are the heart of our raceways and our regions.'),

  // Structural cycle panel
  cycleTitle: text('THE STRUCTURAL CYCLE – A CYCLE WE MUST BREAK', { ...P.kickerGold, fontSize: 8.5, letterSpacing: 0.5 }),
  ...iconLine('c1', 'Users', 'WEAKENING OWNERSHIP BASE', 'Leads to reduced investment'),
  ...iconLine('c2', 'Horse', 'SMALLER FIELDS &amp; LESS COMPETITIVENESS', 'Reduces quality and appeal'),
  ...iconLine('c3', 'DollarSign', 'WEAKER WAGERING &amp; INDUSTRY REVENUE', 'Reduces returns to the industry'),
  ...iconLine('c4', 'RefreshCw', 'THE CYCLE REINFORCES ITSELF', 'Unless we act together'),

  // What the data is telling us
  dataTitle: text('WHAT THE DATA IS TELLING US', { ...P.kickerGold, fontSize: 10 }),
  ...iconLine('data1', 'UsersGroup', 'OWNERSHIP FRAGMENTATION', 'More owners per horse means smaller shares and less connection.'),
  ...iconLine('data2', 'User', 'AGEING OWNERSHIP BASE', 'The average owner age continues to rise, threatening long-term sustainability.'),
  ...iconLine('data3', 'BarChart3', 'PARTICIPATION QUALITY NOT QUANTITY', "It's not the number of owners that matters, it's the strength and engagement of them."),
  ...iconLine('data4', 'Database', 'DATA NOT DRIVING OUTCOMES', 'Data exists but is not shared or used coherently across the industry.'),
  dollarImg: img('https://images.pexels.com/photos/14579361/pexels-photo-14579361.jpeg?auto=compress&cs=tinysrgb&w=1200', 'cover'),
  dollarQuote: text('EVERY DOLLAR IN RACING BEGINS WITH AN OWNER WILLING TO DREAM.', { ...P.headlineGold, fontSize: 15, lineHeight: 1.12 }),

  // What must change
  changeTitle: text('WHAT MUST CHANGE', { ...P.kickerGold, fontSize: 10 }),
  ...checkLine(1, 'Ownership must be treated as the foundation of the industry.'),
  ...checkLine(2, 'Data must be shared across stakeholders to enable coordinated action.'),
  ...checkLine(3, 'NZTROF must be enabled to engage directly with all owners.'),
  ...checkLine(4, 'A unified ownership strategy must be implemented with measurable targets.'),

  // The NZ model — our blueprint
  blueprintTitle: text('THE NZ MODEL – OUR BLUEPRINT', { ...P.kickerGold, fontSize: 10 }),
  ...stepLine(1, 'ESTABLISH A UNIFIED OWNERSHIP DATA FRAMEWORK', 'One source of truth for all.'),
  ...stepLine(2, 'CREATE A DIRECT COMMUNICATION CHANNEL BETWEEN NZTROF AND ALL OWNERS', 'Stronger connection, more value.'),
  ...stepLine(3, 'IMPLEMENT MEASURABLE TARGETS FOR OWNERSHIP GROWTH AND RETENTION', 'Track it. Manage it. Grow it.'),
  qr: qr('https://nztrof.co.nz/blueprint'),
  qrNote: text('READ THE FULL NZ BLUEPRINT DOCUMENT &amp; JOIN THE DISCUSSION', { ...P.qrLabel, fontSize: 8 }),

  // Footer
  footerIcon: icon('Horse', GOLD),
  footer: text('STRONG OWNERSHIP. STRONG RACING. STRONGER FUTURE.', { ...P.footer, fontSize: 10, color: GOLD }),
});

// ── Young Owners Feature (premium, cream page) ──────────────────────
// "The next generation of racing" spread: big serif headline + hero, a navy
// pull-quote, the Charlie King profile, the next-wave list, three gold-icon
// pathways into ownership, and a starter-guide / balancing / social row.
const pathway = (i: number, iconName: string, title: string, body: string) => ({
  [`path${i}Icon`]: icon(iconName, GOLD),
  [`path${i}Title`]: text(title, { ...P.kickerNavy, fontSize: 11 }),
  [`path${i}Body`]: text(body, { ...P.bodySmall, fontSize: 10 }),
});

export const youngOwnersPx = mkPage('young-owners-px', 'Young Owners Feature', {
  // Header band
  band: text('YOUNG OWNERS FEATURE', P.bandLabel),
  bandIcon: icon('Sparkles', GOLD),

  // Headline block
  h1a: text('THE NEXT', { ...P.displayNavy, fontSize: 42 }),
  h1b: text('GENERATION', { ...P.displayGold, fontSize: 42 }),
  h1c: text('OF RACING', { ...P.displayNavy, fontSize: 42 }),
  sub: text('Passion today. Legacy tomorrow.', { ...P.scriptGold, fontSize: 20 }),
  body: text(
    'Racing has always been about community, courage and the thrill of chasing dreams. Today, a new generation of young owners and industry participants is stepping forward — bringing fresh ideas, big ambitions and an unstoppable love for the sport.',
    { ...P.body, fontSize: 11.5 }
  ),
  hero: img(STOCK.champagne, 'cover'),

  // Pull quote (navy box)
  quote: text("It's more than owning a horse. It's being part of something bigger than yourself.", { ...P.pullQuote, color: WHITE, italic: true }),

  // Meet Charlie King
  charlieTitle: text('MEET CHARLIE KING', { ...P.kickerGold, fontSize: 13 }),
  charlieImg: img(STOCK.portrait1, 'cover'),
  charlieBody: text(
    'From the green hills of Cambridge to the blueblood corridors of Kentucky, Charlie King is carving his own path. With a deep respect for tradition and an eye on the future, Charlie is passionate about building a life in racing.',
    { ...P.bodySmall, fontSize: 10 }
  ),
  charlieQuote: text('"Racing has given me opportunities, mentors and a future I wouldn\'t trade for anything." — Charlie King', { ...P.caption, color: ROLE_GOLD }),
  charlieQr: qr('https://nztrof.co.nz/charlie-king'),
  charlieScan: text('SCAN TO WATCH<br>CHARLIE\'S STORY', { ...P.kickerGold, fontSize: 9, lineHeight: 1.3 }),
  charlieScanSub: text('Video interview', { ...P.meta, fontSize: 9, italic: true }),
  charliePlayIcon: icon('Youtube', '#FF0000'),

  // The next wave (navy box)
  waveTitle: text('THE NEXT WAVE', { ...P.kickerGold, fontSize: 12 }),
  waveImg: img(STOCK.crowd2, 'cover'),
  waveBody: text(
    '• Younger syndicate members bringing energy and ideas<br><br>• Friends turning into partners in the journey<br><br>• New voices shaping the future of our sport',
    { ...P.bodySmall, fontSize: 10, color: LIGHT, lineHeight: 1.35 }
  ),
  waveOutro: text('The future is in great hands.', { ...P.pullQuote, color: GOLD_LEAD, fontSize: 13 }),

  // Pathways into ownership
  pathTitle: text('PATHWAYS INTO OWNERSHIP', { ...P.kickerNavy, fontSize: 13 }),
  ...pathway(1, 'Flag', 'GET STARTED', 'Start small, learn the ropes and surround yourself with great people.'),
  ...pathway(2, 'UsersGroup', 'BE PART OF A TEAM', 'Syndicates make ownership accessible, affordable and unforgettable.'),
  ...pathway(3, 'Trophy', 'BUILD YOUR KNOWLEDGE', 'Ask questions, visit stables, attend sales and soak up every experience.'),
  pathImg: img(STOCK.women, 'cover'),

  // Starter guide (navy box)
  guideTitle: text('YOUNG OWNERS STARTER GUIDE', { ...P.kickerGold, fontSize: 10.5 }),
  guideBody: text('New to ownership? Scan to download our step-by-step guide to get you started.', { ...P.bodySmall, fontSize: 9.5, color: LIGHT }),
  guideQr: qr('https://nztrof.co.nz/starter-guide'),

  // Balancing work and racing
  balanceTitle: text('BALANCING WORK AND RACING', { ...P.kickerNavy, fontSize: 11 }),
  balanceImg: img(STOCK.device, 'cover'),
  balanceBody: text('From early mornings to long hours, young owners are finding ways to chase their dreams while building their careers. Balance is the key to a sustainable passion.', { ...P.bodySmall, fontSize: 9.5 }),

  // Social racing culture
  socialTitle: text('SOCIAL RACING CULTURE', { ...P.kickerNavy, fontSize: 11 }),
  socialBody: text('Racing brings people together. New friendships, shared celebrations and memories that last a lifetime. The social side of racing is what keeps us coming back.', { ...P.bodySmall, fontSize: 9.5 }),

  footer: text('OWNERSHIP. OPPORTUNITY. COMMUNITY.', P.footer),
  pageNum: text('PAGE 6', { ...P.footer, align: 'right' }),
});

/** All premium blueprints (merged into the lookup map; NOT into the classic
 *  print-order array, so template #1's default document is unchanged). */
import { womenPx } from './women.bp';
import { regionNorthPx } from './regionNorth.bp';
import { regionSouthPx } from './regionSouth.bp';
import { loungePx } from './lounge.bp';
import { karakaPx } from './karaka.bp';
import { celebrationPx } from './celebration.bp';
import { futurePx } from './future.bp';
import { breederPx } from './breeder.bp';
import { welfarePx } from './welfare.bp';
import { businessPx } from './business.bp';
import { leaderboardsPx } from './leaderboards.bp';
import { gamificationPx } from './gamification.bp';
import { predictionsPx } from './predictions.bp';
import { followupPx } from './followup.bp';
import { educationPx } from './education.bp';
import { winningPx } from './winning.bp';
import { voicePx } from './voice.bp';
import { backCoverPx } from './backCover.bp';

export const PREMIUM_BLUEPRINTS: PageBlueprint[] = [
  coverPx, presidentPx, editorPx, discussionPx, headlinePx, youngOwnersPx,
  womenPx, regionNorthPx, regionSouthPx, loungePx, karakaPx, celebrationPx,
  futurePx, breederPx, welfarePx, businessPx, leaderboardsPx, gamificationPx,
  predictionsPx, followupPx, educationPx, winningPx, voicePx, backCoverPx,
];
