/**
 * Page blueprints — the locked NZTROF bulletin content & house styles.
 *
 * PURE DATA (no React) so the magazine store can import `createDefaultPages`
 * without pulling in the editor component tree. Each page exposes an `ids` map
 * (semantic name → globally-unique region id) that its component imports, so
 * region ids are single-sourced and never drift.
 */

import type { MagazinePage, PageTypeKey, RegionContent, RegionKind } from '@/types/magazine';
import { text, img, qr, STOCK } from './helpers';
import { PRESET as P, NAVY, GOLD, WHITE } from './styles';

export interface PageBlueprint {
  pageType: PageTypeKey;
  label: string;
  ids: Record<string, string>;
  regionKinds: Record<string, RegionKind>;
  defaultContent: Record<string, RegionContent>;
}

function mkPage(
  pageType: PageTypeKey,
  label: string,
  regions: Record<string, RegionContent>
): PageBlueprint {
  const ids: Record<string, string> = {};
  const regionKinds: Record<string, RegionKind> = {};
  const defaultContent: Record<string, RegionContent> = {};
  for (const [name, content] of Object.entries(regions)) {
    const id = `${pageType}.${name}`;
    ids[name] = id;
    regionKinds[name] = content.kind;
    defaultContent[id] = content;
  }
  return { pageType, label, ids, regionKinds, defaultContent };
}

// Convenience for a repeated "row of text" (tables / lists).
const row = (html: string) => text(html, P.td);

export const FIRST_COVER_IMAGE = STOCK.ownersCelebrate;

// ── 1. Cover ────────────────────────────────────────────────────────
const cover = mkPage('cover', 'Cover', {
  tagline: text('Own the experience.<br>Share the thrill.', P.scriptGold),
  masthead: text('NZTROF', { ...P.displayNavy, fontSize: 40, letterSpacing: 1 }),
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
  hero: img(STOCK.ownersCelebrate, 'cover', { y: 0.35 }),
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

// ── 2. President's Update ───────────────────────────────────────────
const president = mkPage('president-update', "President's Update", {
  h1a: text("PRESIDENT'S", { ...P.displayNavy, fontSize: 38 }),
  h1b: text('UPDATE', { ...P.displayGold, fontSize: 38 }),
  byline: text('from Sally Blyth', P.script),
  portrait: img(STOCK.portrait3, 'cover'),
  body: text(
    'Welcome to another exciting edition of the NZTROF Bulletin.<br><br>It\'s wonderful to see so many of our owners enjoying success on the track and sharing in the thrill of ownership.<br><br>Whether it\'s your first runner or your fiftieth, the joy of seeing your horse compete never gets old.<br><br>Thank you for being part of our amazing community. Your passion and support help make racing the special sport that it is.<br><br>Enjoy the read!',
    P.body
  ),
  signoff: text('Sally', { ...P.script, fontSize: 30 }),
  name: text('Sally Blyth', P.name),
  role: text('President · Auckland Delegate · sally@beyondlimits.co.nz', P.role),
  boardTitle: text('NZTROF BOARD', { ...P.bandLabel, fontSize: 11 }),
  member1: text('<b>Sally Blyth</b> — President, Auckland Delegate', P.bodySmall),
  member2: text('<b>Berri Schroder</b> — Interim Editor, Waikato Delegate', P.bodySmall),
  member3: text('<b>Bernard Hickey</b> — Hawke\'s Bay Delegate', P.bodySmall),
  member4: text('<b>Mark Verran</b> — Manawatu Delegate', P.bodySmall),
  member5: text('<b>Peter Faulkner</b> — Central South Island Delegate', P.bodySmall),
  member6: text('<b>Ian Hackett</b> — Wanganui/Taranaki Delegate', P.bodySmall),
  member7: text('<b>Denise Mayhew</b> — Executive Officer', P.bodySmall),
  stayTitle: text('Stay connected!', { ...P.subhead, color: WHITE, fontSize: 15 }),
  stayBody: text('Scan the QR code to visit our website for the latest news, race results, owner benefits and event details.', { ...P.bodySmall, color: '#dfe6f2' }),
  stayQr: qr('https://nztrof.co.nz'),
  siteLabel: text('nztrof.co.nz', { ...P.kickerGold, fontSize: 10 }),
  pageNum: text('PAGE 2', { ...P.footer, align: 'left' }),
});

// ── 3. From the Editor ──────────────────────────────────────────────
const editor = mkPage('editor-letter', 'From the Editor', {
  h1a: text('FROM THE', { ...P.displayNavy, fontSize: 34 }),
  interim: text('(interim)', { ...P.caption, fontSize: 12, color: NAVY }),
  h1b: text('EDITOR', { ...P.displayGold, fontSize: 34 }),
  byline: text('by Berri Schroder', P.script),
  body: text(
    'Every issue of the Bulletin aims to bring you more than just news — we share the stories behind the silks, the people behind the passion and the moments that make ownership so rewarding.<br><br>In this edition we celebrate owner achievements, feature inspiring stories from around the country and highlight upcoming events and opportunities to get involved.<br><br>Thank you to everyone who contributes, supports and shares in the journey.<br><br>If you have a story or photos you\'d like to share, we\'d love to hear from you!',
    P.body
  ),
  signoff: text('Berri', { ...P.script, fontSize: 30 }),
  name: text('Berri Schroder · Interim Editor', P.name),
  emailQr: qr('mailto:berri.schroder@xtra.co.nz'),
  emailNote: text('Scan to email Berri', P.qrLabel),
  coverTitle: text('ON THE COVER', P.kickerGold),
  coverHeading: text('OWNERS CELEBRATE ANOTHER WIN!', { ...P.subhead, fontSize: 15 }),
  coverBody: text('A special moment of celebration after an impressive victory. There\'s nothing quite like the camaraderie and excitement of winning with your fellow owners.', P.bodySmall),
  coverImg: img(STOCK.champagne, 'cover'),
  coverQr: qr('https://raceowners.co.nz/gallery'),
  coverQrNote: text('SCAN TO VIEW THE FULL STORY AND PHOTO GALLERY', P.qrLabel),
  welcomeTitle: text('WELCOME NEW MEMBERS', P.kickerNavy),
  welcomeBody: text('A warm welcome to…<br>• The O\'Sullivan Family — Cambridge<br>• Westbury Racing Syndicate — Matamata<br>• Greenlight Racing — Auckland<br>• South Island Striders — Christchurch<br><br>We\'re thrilled to have you as part of our racing family!', P.bodySmall),
  siteTitle: text('VISIT OUR WEBSITE', P.kickerNavy),
  siteBody: text('raceowners.co.nz — your go-to place for ownership information, resources, race results and owners\' benefits.', P.bodySmall),
  siteQr: qr('https://raceowners.co.nz'),
  subs: text('SUBSCRIPTION RATES   |   Single $60 (incl. GST)   |   Double $65 (incl. GST)', P.footer),
  pageNum: text('PAGE 3', { ...P.footer, align: 'right' }),
});

// ── 4. Important Discussion ─────────────────────────────────────────
const discussion = mkPage('important-discussion', 'Important Discussion', {
  band: text('IMPORTANT DISCUSSION', P.bandLabel),
  bandSub: text('The future of racing starts with ownership.', { ...P.caption, color: GOLD }),
  h1a: text('WHY THE OWNER', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('SHOULD BE AT THE TOP OF THE TREE', { ...P.displayGold, fontSize: 30 }),
  lead: text('Ownership is the foundation of everything that makes racing possible.', P.pullQuote),
  body: text('The NZ Blueprint makes one thing clear — without owners, there is no racing industry. Owners are the investors, the believers, and the reason the sport exists. It\'s time ownership is recognised as the strategic priority it truly is.', P.body),
  treeImg: img(STOCK.tree, 'cover'),
  pyramidTitle: text('THE OWNERSHIP PYRAMID — A STRONG BASE BUILDS A STRONG INDUSTRY', { ...P.kickerNavy, fontSize: 9 }),
  tier1: text('VISIONARY OWNERS — Lead, invest, inspire', P.bodySmall),
  tier2: text('ENGAGED OWNERS — Active, informed, involved', P.bodySmall),
  tier3: text('NEW &amp; ASPIRING OWNERS — The future of our sport', P.bodySmall),
  cycleTitle: text('THE STRUCTURAL CYCLE — A CYCLE WE MUST BREAK', { ...P.kickerNavy, fontSize: 9 }),
  cycleBody: text('Weakening ownership base → smaller fields &amp; less competitiveness → weaker wagering &amp; industry revenue → the cycle reinforces itself. Unless we act together.', P.bodySmall),
  dataTitle: text('WHAT THE DATA IS TELLING US', { ...P.kickerGold, fontSize: 9 }),
  data1: text('<b>Ownership fragmentation</b> — more owners per horse, less connection', P.bodySmall),
  data2: text('<b>Ageing ownership base</b> — threatening long-term sustainability', P.bodySmall),
  data3: text('<b>Participation quality not quantity</b> — engagement is what matters', P.bodySmall),
  data4: text('<b>Data not driving outcomes</b> — it exists but isn\'t used coherently', P.bodySmall),
  quote: text('Every dollar in racing begins with an owner willing to dream.', P.pullQuoteWhite),
  changeTitle: text('WHAT MUST CHANGE', { ...P.kickerNavy, fontSize: 9 }),
  changeBody: text('✓ Ownership treated as the foundation of the industry<br>✓ Data shared across stakeholders to enable coordinated action<br>✓ NZTROF enabled to engage directly with all owners<br>✓ A unified ownership strategy with measurable targets', P.bodySmall),
  blueprintTitle: text('THE NZ MODEL — OUR BLUEPRINT', { ...P.kickerGold, fontSize: 9 }),
  blueprintBody: text('1. Establish a unified ownership data framework<br>2. Create a direct communication channel between NZTROF and all owners<br>3. Implement measurable targets for ownership growth and retention', P.bodySmall),
  qrMain: qr('https://nztrof.co.nz/blueprint'),
  qrNote: text('READ THE FULL NZ BLUEPRINT &amp; JOIN THE DISCUSSION', P.qrLabel),
  footer: text('STRONG OWNERSHIP. STRONG RACING. STRONGER FUTURE.', P.footer),
  pageNum: text('PAGE 26', { ...P.footer, align: 'right' }),
});

// ── 5. Best Headline Story — Aeliana ────────────────────────────────
const headline = mkPage('headline-story', 'Headline Story — Aeliana', {
  band: text('BEST HEADLINE STORY', P.bandLabel),
  bandSub: text('Extraordinary stories. Real people. Real impact.', { ...P.caption, color: GOLD }),
  title: text('AELIANA', { ...P.displayNavy, fontSize: 52, letterSpacing: 1 }),
  subtitle: text('THE HOMEGROWN STAR<br>WHO TOOK THE WORLD BY STORM', { ...P.headlineGold, fontSize: 18 }),
  hero: img(STOCK.jockeyRace, 'cover'),
  intro: text('From a Waikato farm to the world stage — Aeliana\'s story is the stuff of dreams. Bred by John Thompson and the team at Richill Farm, Aeliana was sold at the 2020 New Zealand Bloodstock Karaka Yearling Sale for NZ$210,000. What followed was nothing short of phenomenal.', P.body),
  stat1Num: text('NZ$210,000', P.statBig),
  stat1Label: text('SOLD AT KARAKA 2020 · BY RICHILL FARM', P.statLabel),
  stat2Num: text('A$4.24M+', P.statBig),
  stat2Label: text('CAREER EARNINGS (AND COUNTING)', P.statLabel),
  stat3Num: text('6', P.statBig),
  stat3Label: text('GROUP 1 WINS IN AUSTRALIA', P.statLabel),
  stat4Num: text('★', P.statBig),
  stat4Label: text('A STAR ON THE WORLD STAGE', P.statLabel),
  journeyTitle: text('THE JOURNEY', { ...P.kickerGold, fontSize: 11 }),
  j1: text('<b>Bred with vision</b> — John Thompson\'s commitment to breeding quality at Richill Farm produced a filly with all the right ingredients.', P.bodySmall),
  j2: text('<b>Karaka moment</b> — offered by Richill Farm at Karaka 2020 and purchased for NZ$210,000.', P.bodySmall),
  j3: text('<b>Rising star</b> — trained by Ciaron Maher, Aeliana showed talent early, quickly rising through the grades.', P.bodySmall),
  j4: text('<b>Group 1 glory</b> — winner of the Australian Oaks, The Tancred Stakes, The Thousand Guineas and more.', P.bodySmall),
  j5: text('<b>An inspiration</b> — a powerful reminder of what great breeding, patience and passion can achieve.', P.bodySmall),
  photo1: img(STOCK.winnersCircle, 'cover'),
  photo2: img(STOCK.raceFinish, 'cover'),
  quote: text('It\'s every breeder\'s dream to breed a Group 1 winner — to do it on the world stage is beyond words.', P.pullQuote),
  quoteBy: text('— John Thompson, Richill Farm', P.role),
  exploreTitle: text('EXPLORE THE AELIANA STORY', { ...P.bandLabel, fontSize: 11 }),
  qr1: qr('https://nztrof.co.nz/aeliana/replays'),
  qr1Label: text('RACE REPLAYS', P.qrLabel),
  qr2: qr('https://nztrof.co.nz/aeliana/record'),
  qr2Label: text('FULL RACE RECORD', P.qrLabel),
  qr3: qr('https://nztrof.co.nz/aeliana/interviews'),
  qr3Label: text('OWNER &amp; BREEDER INTERVIEWS', P.qrLabel),
  qr4: qr('https://nztrof.co.nz/aeliana/breeding'),
  qr4Label: text('NZ BREEDING SUCCESS', P.qrLabel),
  qr5: qr('https://nztrof.co.nz/ownership'),
  qr5Label: text('OWNERSHIP OPPORTUNITIES', P.qrLabel),
  footer: text('GREAT HORSES. GREAT PEOPLE. GREAT STORIES.', P.footer),
  pageNum: text('PAGE 27', { ...P.footer, align: 'right' }),
});

// ── 6. Young Owners ─────────────────────────────────────────────────
const young = mkPage('young-owners', 'Young Owners Feature', {
  band: text('YOUNG OWNERS FEATURE', P.bandLabel),
  h1a: text('THE NEXT', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('GENERATION', { ...P.displayGold, fontSize: 34 }),
  h1c: text('OF RACING', { ...P.displayNavy, fontSize: 34 }),
  sub: text('Passion today. Legacy tomorrow.', P.scriptGold),
  body: text('Racing has always been about community, courage and the thrill of chasing dreams. Today, a new generation of young owners and industry participants is stepping forward — bringing fresh ideas, big ambitions and an unstoppable love for the sport.', P.body),
  hero: img(STOCK.crowd, 'cover'),
  quote: text('It\'s more than owning a horse. It\'s being part of something bigger than yourself.', P.pullQuoteWhite),
  charlieTitle: text('MEET CHARLIE KING', P.kickerGold),
  charlieImg: img(STOCK.portrait1, 'cover'),
  charlieBody: text('From the green hills of Cambridge to the blueblood corridors of Kentucky, Charlie King is carving his own path. With a deep respect for tradition and an eye on the future, Charlie is passionate about building a life in racing.', P.bodySmall),
  charlieQuote: text('"Racing has given me opportunities, mentors and a future I wouldn\'t trade for anything." — Charlie King', P.caption),
  charlieQr: qr('https://nztrof.co.nz/charlie-king'),
  waveTitle: text('THE NEXT WAVE', { ...P.kickerWhite, fontSize: 9 }),
  waveBody: text('• Younger syndicate members bringing energy and ideas<br>• Friends turning into partners in the journey<br>• New voices shaping the future of our sport', { ...P.bodySmall, color: '#dfe6f2' }),
  pathTitle: text('PATHWAYS INTO OWNERSHIP', P.kickerNavy),
  path1: text('<b>Get started</b> — start small, learn the ropes and surround yourself with great people.', P.bodySmall),
  path2: text('<b>Be part of a team</b> — syndicates make ownership accessible, affordable and unforgettable.', P.bodySmall),
  path3: text('<b>Build your knowledge</b> — ask questions, visit stables, attend sales and soak up every experience.', P.bodySmall),
  guideQr: qr('https://nztrof.co.nz/starter-guide'),
  guideNote: text('YOUNG OWNERS STARTER GUIDE', P.qrLabel),
  col1Title: text('BALANCING WORK AND RACING', P.kickerNavy),
  col1Body: text('From early mornings to long hours, young owners are finding ways to chase their dreams while building their careers. Balance is the key to a sustainable passion.', P.bodySmall),
  col2Title: text('SOCIAL RACING CULTURE', P.kickerNavy),
  col2Body: text('Racing brings people together. New friendships, shared celebrations and memories that last a lifetime. The social side of racing is what keeps us coming back.', P.bodySmall),
  footer: text('OWNERSHIP. OPPORTUNITY. COMMUNITY.', P.footer),
  pageNum: text('PAGE 4', { ...P.footer, align: 'left' }),
});

// ── 7. Women in Racing ──────────────────────────────────────────────
const women = mkPage('women-in-racing', 'Women in Racing', {
  band: text('WOMEN IN RACING', { ...P.bandLabel }),
  h1a: text('STYLE.', { ...P.displayNavy, fontSize: 38 }),
  h1b: text('PASSION.', { ...P.displayNavy, fontSize: 38, color: '#7a1f2b' }),
  h1c: text('LEADERSHIP.', { ...P.displayNavy, fontSize: 38, color: '#7a1f2b' }),
  sub: text('Women powering the future of racing.', P.scriptGold),
  body: text('From the winner\'s circle to the boardroom, women are leading, inspiring and making their mark on every part of our great sport.', P.body),
  collage1: img(STOCK.women, 'cover'),
  collage2: img(STOCK.champagne, 'cover'),
  collage3: img(STOCK.crowd, 'cover'),
  col1Title: text('OWNERSHIP GROUPS', P.kickerNavy),
  col1Body: text('Strong women. Shared dreams. Lasting friendships. Together we celebrate every moment.', P.bodySmall),
  col2Title: text('FEMALE BUSINESS LEADERS', P.kickerNavy),
  col2Body: text('Balancing business, family and a passion for racing. Women leading in and beyond the industry.', P.bodySmall),
  col3Title: text('RACE-DAY STYLE', P.kickerNavy),
  col3Body: text('Elegance, colour and confidence. Our race days are a celebration of fashion and fun.', P.bodySmall),
  sponsorKicker: text('LUXURY PARTNER SPOTLIGHT', P.kickerGold),
  sponsorScript: text('Experience the finest', P.script),
  sponsorBody: text('Proudly supporting women in racing and celebrating excellence in style, passion and performance.', P.bodySmall),
  sponsorName: text('ELLERSLIE LANE — NEW ZEALAND', { ...P.kickerNavy, fontSize: 11 }),
  sponsorImg: img(STOCK.women, 'cover'),
  sponsorTag: text('Timeless elegance. Racing is more than a sport, it\'s a lifestyle. ellerslielane.co.nz', P.caption),
  voteQr: qr('https://nztrof.co.nz/raceday-style-vote'),
  voteNote: text('VOTE FOR YOUR FAVOURITE RACE-DAY STYLE', P.qrLabel),
  footer: text('WOMEN. INFLUENCE. INSPIRATION.', P.footer),
  pageNum: text('PAGE 5', { ...P.footer, align: 'right' }),
});

// Region block helper for regional roundups
function regionBlock(prefix: string, photo: string, name: string, tag: string, body: string, quote: string) {
  return {
    [`${prefix}Img`]: img(photo, 'cover'),
    [`${prefix}Name`]: text(name, { ...P.subhead, fontSize: 15 }),
    [`${prefix}Tag`]: text(tag, P.scriptGold),
    [`${prefix}Body`]: text(body, P.bodySmall),
    [`${prefix}Quote`]: text(quote, P.caption),
    [`${prefix}Qr`]: qr('https://nztrof.co.nz/regions'),
  };
}

// ── 8. Regional Roundups — North ────────────────────────────────────
const regionNorth = mkPage('regional-north', 'Regional Roundups — North', {
  band: text('REGIONAL ROUNDUPS — NORTH', P.bandLabel),
  h1a: text('STRONG REGIONS.', { ...P.displayNavy, fontSize: 26 }),
  h1b: text('STRONGER TOGETHER.', { ...P.displayGold, fontSize: 26 }),
  sub: text('Celebrating owner success across the North Island.', P.scriptGold),
  intro: text('From the Far North to Hawke\'s Bay, our northern regions continue to thrive with passionate owners, unforgettable racing and a welcoming community spirit.', P.bodySmall),
  ...regionBlock('r1', STOCK.ownersCelebrate, 'AUCKLAND / NORTHLAND', 'Pride of the North', 'Northland trainer Ken Harrison celebrated a brilliant double at Ruakaka with stable star Coastal Charm, while a new wave of syndicates continue to emerge from Auckland\'s vibrant racing community.', '"Owning a horse has connected us with the most amazing people. It\'s about so much more than raceday." — Anna & James, Auckland owners'),
  ...regionBlock('r2', STOCK.crowd, 'WAIKATO / BAY OF PLENTY', 'Growing Future Champions', 'Cambridge trainers are going from strength to strength with young talents like Lightning Rose lighting up the track. Owner events across the Bay continue to grow.', '"The Waikato racing community makes you feel part of something special." — Mark, Cambridge owner'),
  ...regionBlock('r3', STOCK.paddock, "HAWKE'S BAY", 'Heart of the Heritage', "Hawke's Bay continues to deliver top-class racing and warm hospitality. Recent highlights include the success of local bred mare Bella Nipotina.", '"We breed, race and celebrate together. That\'s what makes Hawke\'s Bay so unique." — Sarah & Tim, Hastings breeders'),
  footer: text('LOCAL PASSION. LIFELONG FRIENDSHIPS. UNFORGETTABLE MEMORIES.', P.footer),
  pageNum: text('PAGE 6', { ...P.footer, align: 'left' }),
});

// ── 9. Regional Roundups — South ────────────────────────────────────
const regionSouth = mkPage('regional-south', 'Regional Roundups — South', {
  band: text('REGIONAL ROUNDUPS — SOUTH', P.bandLabel),
  h1a: text('ONE COMMUNITY.', { ...P.displayNavy, fontSize: 26 }),
  h1b: text('ONE PASSION.', { ...P.displayGold, fontSize: 26 }),
  sub: text('Racing thrives in every corner of the South Island.', P.scriptGold),
  intro: text('From the Manawatu to Southland, our southern regions are full of dedicated owners, fantastic racing and welcoming communities.', P.bodySmall),
  ...regionBlock('r1', STOCK.champagne, 'MANAWATU / WELLINGTON', 'Community at the Core', 'From the Lawn at Trentham to the Central Districts racetracks, our owners are at the heart of everything we do. Recent owner functions and behind-the-scenes stable visits have been a huge hit.', '"It\'s the people, the horses and the memories we make together." — Lisa, Palmerston North owner'),
  ...regionBlock('r2', STOCK.paddock, 'CENTRAL SOUTH ISLAND', 'Big Country Spirit', 'Racing in the heart of the South Island is thriving with strong ownership groups in Canterbury, Marlborough and the West Coast. Local breeders are producing exciting prospects.', '"There\'s nothing like seeing a home-bred run out a winner." — John, Canterbury breeder'),
  ...regionBlock('r3', STOCK.crowd, 'OTAGO / SOUTHLAND', 'Southern Strength', 'From Wingatui to Riverton, owners in the deep south share a true love of racing. Recent highlights include strong results for southern-trained gallopers.', '"Down here, we might be miles from everywhere, but we\'re close in racing." — Debbie, Southland owner'),
  footer: text('DIFFERENT REGIONS. ONE INDUSTRY. ENDLESS OPPORTUNITY.', P.footer),
  pageNum: text('PAGE 7', { ...P.footer, align: 'right' }),
});

// ── 10. Owners Lounge ───────────────────────────────────────────────
const lounge = mkPage('owners-lounge', 'Owners Lounge', {
  band: text('OWNERS LOUNGE', P.bandLabel),
  h1a: text('THE BEST PART', { ...P.displayNavy, fontSize: 32 }),
  h1b: text('OF RACING?', { ...P.displayGold, fontSize: 32 }),
  sub: text('The people.', P.script),
  lead: text('Friendships. Shared dreams. Unforgettable days. People buy ownership because of the people.', { ...P.body, color: GOLD }),
  photo1: img(STOCK.champagne, 'cover'),
  photo1Cap: text('RACE-DAY GATHERINGS', P.qrLabel),
  photo2: img(STOCK.crowd, 'cover'),
  photo2Cap: text('OWNERS BARS', P.qrLabel),
  photo3: img(STOCK.ownersCelebrate, 'cover'),
  photo3Cap: text('FAMILY GROUPS', P.qrLabel),
  photo4: img(STOCK.women, 'cover'),
  photo4Cap: text('SYNDICATES', P.qrLabel),
  photo5: img(STOCK.raceFinish, 'cover'),
  photo5Cap: text('CELEBRATIONS', P.qrLabel),
  quote: text('Racing gives us the opportunity to create memories that last a lifetime. That\'s what makes it so special.', P.pullQuote),
  galleryQr: qr('https://nztrof.co.nz/galleries'),
  galleryNote: text('VIEW FULL RACE-DAY GALLERIES ONLINE', P.qrLabel),
  footer: text('RACING IS MORE THAN A SPORT. IT\'S A COMMUNITY BUILT ON PASSION, TRUST AND GREAT PEOPLE.', P.footer),
  pageNum: text('PAGE 8', { ...P.footer, align: 'left' }),
});

// ── 11. Karaka Sales & Syndicates ───────────────────────────────────
const karaka = mkPage('karaka-sales', 'Karaka Sales & Syndicates', {
  band: text('KARAKA SALES & SYNDICATES', P.bandLabel),
  h1a: text('THE DREAM', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('STARTS HERE', { ...P.displayGold, fontSize: 34 }),
  sub: text('Great racing begins with great pedigrees.', P.scriptGold),
  body: text('The NZB Karaka Yearling Sales are where champions are found and dreams take their first step. For many owners, it\'s the beginning of an incredible journey.', P.bodySmall),
  point1: text('<b>First-time buyers welcome</b> — our industry is built on welcoming new owners. We\'ll help you every step of the way.', P.bodySmall),
  point2: text('<b>Syndicate opportunities</b> — shared ownership. Shared excitement. Build lifelong friendships.', P.bodySmall),
  point3: text('<b>Ownership made possible</b> — there are options for every budget. Start small, dream big.', P.bodySmall),
  point4: text('<b>The thrill of the possible</b> — every great story starts somewhere. Yours could start at Karaka.', P.bodySmall),
  heroImg: img(STOCK.horseGallop, 'cover'),
  badge: text('2025 NZB CHAIRMAN\'S BROODMARE SALE RESULTS', { ...P.statLabel, color: WHITE, align: 'center' }),
  resultsTitle: text('Latest Sale Results', P.scriptGold),
  results: text('• Gross: $7,393,000<br>• Average: $112,016<br>• Median: $52,500<br>• Clearance Rate: 91%<br>• Top Price: $400,000', P.bodySmall),
  resultsNote: text('A strong result reflecting confidence in quality New Zealand breeding.', P.caption),
  resultsQr: qr('https://nzb.co.nz/results'),
  ad1Name: text('NZB — Backing New Zealand Breeding. Supporting Racing\'s Future.', { ...P.kickerWhite, fontSize: 10 }),
  ad1Img: img(STOCK.paddock, 'cover'),
  ad2Name: text('CAMBRIDGE STUD — World-Class Breeding. Champion Results.', { ...P.kickerWhite, fontSize: 10 }),
  ad2Img: img(STOCK.mareFoal, 'cover'),
  cta1: text('BROWSE CURRENT SYNDICATION OPPORTUNITIES', P.qrLabel),
  cta2: text('DISCOVER quality horses and upcoming syndicates', P.qrLabel),
  cta3: text('CONNECT with trainers and syndicate managers', P.qrLabel),
  cta4: text('JOIN — be part of something extraordinary', P.qrLabel),
  ctaQr: qr('https://nzb.co.nz/syndication'),
  footer: text('GREAT HORSES. GREAT PEOPLE. GREAT MEMORIES. YOUR JOURNEY STARTS HERE.', P.footer),
  pageNum: text('PAGE 9', { ...P.footer, align: 'right' }),
});

// ── 12. Owners Celebration Wall ─────────────────────────────────────
const celebration = mkPage('celebration-wall', 'Owners Celebration Wall', {
  band: text('★  OWNERS CELEBRATION WALL  ★', P.bandLabel),
  h1a: text('CELEBRATING OUR', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('CHAMPIONS', { ...P.displayGold, fontSize: 30 }),
  sub: text('Our owners. Our pride. Our sport.', P.scriptGold),
  body: text('Every win is a moment to remember. Every owner is part of our story. Thank you for making it possible.', P.bodySmall),
  championsImg: img(STOCK.crowd2, 'cover'),
  quarterTitle: text('BEST OWNERSHIP IMAGE OF THE QUARTER', P.kickerNavy),
  quarterImg: img(STOCK.crowd, 'cover'),
  quarterCap: text('Joy. Friendship. The thrill of victory. Moments like these are why we own racehorses.', P.caption),
  monthTitle: text('OWNERS OF THE MONTH', P.kickerNavy),
  month1Img: img(STOCK.women, 'cover'),
  month1Body: text('<b>The O\'Sullivan Syndicate</b> — a fantastic run of results and a perfect example of teamwork and passion.', P.bodySmall),
  month2Img: img(STOCK.champagne, 'cover'),
  month2Body: text('<b>Emma & James Harrison</b> — breeders, owners and race-day regulars whose dedication continues to inspire.', P.bodySmall),
  sponsorBand: text('PROUDLY SUPPORTED BY GAVELHOUSE.COM — Supporting owners. Celebrating success. Investing in the future.', { ...P.kickerWhite, fontSize: 9 }),
  eventsTitle: text('MAJOR UPCOMING OWNERSHIP EVENTS', P.kickerGold),
  event1: text('<b>MAY 24</b> — Owners\' Raceday, Ellerslie', P.bodySmall),
  event2: text('<b>JUNE 13</b> — Owners & Breeders Function, Cambridge', P.bodySmall),
  event3: text('<b>JULY 18</b> — Young Owners Networking Night, Auckland', P.bodySmall),
  event4: text('<b>AUG 30</b> — NZTROF National Owners Forum, Wellington', P.bodySmall),
  footer: text('MORE THAN A SPORT. IT\'S A COMMUNITY. IT\'S A LIFESTYLE. IT\'S OURS.', P.footer),
  pageNum: text('PAGE 10', { ...P.footer, align: 'left' }),
});

// ── 13. Our Future Together ─────────────────────────────────────────
const future = mkPage('future-together', 'Our Future. Together.', {
  h1a: text('OUR FUTURE.', { ...P.displayNavy, fontSize: 38 }),
  h1b: text('TOGETHER.', { ...P.displayGold, fontSize: 38 }),
  sub: text('The print & digital partnership powering ownership.', P.scriptGold),
  body: text('The NZTROF Bulletin and website are designed to work hand-in-hand — creating a connected ecosystem that inspires, informs and supports every owner.', P.bodySmall),
  deviceImg: img(STOCK.device, 'contain'),
  strategyTitle: text('LONG-TERM STRATEGIC DIRECTION', { ...P.kickerWhite, fontSize: 9 }),
  strategyBody: text('We are building more than a publication. We are building an ownership movement. Feeder into the NZTROF website · Social ownership ecosystem · Owner identity platform.', { ...P.bodySmall, color: '#dfe6f2' }),
  magTitle: text('THE PRINT MAGAZINE: INSPIRING OWNERSHIP', { ...P.kickerWhite, fontSize: 9 }),
  mag1: text('<b>Create aspiration</b> — showcasing success stories, lifestyle and opportunities.', { ...P.bodySmall, color: '#dfe6f2' }),
  mag2: text('<b>Create belonging</b> — building a strong community and shared identity.', { ...P.bodySmall, color: '#dfe6f2' }),
  mag3: text('<b>Create prestige</b> — a high-quality magazine owners are proud to be part of.', { ...P.bodySmall, color: '#dfe6f2' }),
  mag4: text('<b>Create retention</b> — keeping owners engaged and connected for the long term.', { ...P.bodySmall, color: '#dfe6f2' }),
  webTitle: text('THE WEBSITE: DELIVERING DEPTH & INTERACTION', P.kickerNavy),
  webBody: text('In-depth content · Interaction · Video · Registrations · Ownership opportunities · Advertising analytics · Member engagement.', P.bodySmall),
  ctaTitle: text('TOGETHER, WE GROW RACING.', { ...P.subhead, fontSize: 16 }),
  ctaBody: text('Stronger together. Racing forever. By combining the premium feel of our Bulletin with the power and reach of our website, we are creating a better future for owners, racing and the sport we love.', P.bodySmall),
  ctaQr: qr('https://nztrof.co.nz'),
  footer: text('ONE COMMUNITY. ONE PASSION. ONE FUTURE.', P.footer),
  pageNum: text('PAGE 11', { ...P.footer, align: 'right' }),
});

// ── 14. Breeder Feature ─────────────────────────────────────────────
const breeder = mkPage('breeder-feature', 'Breeder Feature', {
  band: text('BREEDER FEATURE', P.bandLabel),
  h1a: text('FROM PADDOCK', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('TO WINNER\'S CIRCLE', { ...P.displayGold, fontSize: 30 }),
  sub: text('Passion. Patience. Pride.', P.scriptGold),
  body: text('For the Harrisons, breeding has always been about heart, hard work and believing in the dream. Their journey from a single mare in the paddock to celebrating a stakes winner is a story every owner can be proud of.', P.bodySmall),
  familyImg: img(STOCK.stable, 'cover'),
  quote: text('It\'s the foal in the paddock that gives you the dreams. It\'s the winner in the ring that makes it real.', P.pullQuoteWhite),
  quoteBy: text('— Sarah Harrison', P.role),
  journeyTitle: text('OUR BREEDING JOURNEY', P.kickerNavy),
  journeyBody: text('It all started with our mare Bella Luce — a tough, honest racehorse with a heart of gold. We bred her first foal at home and from that moment, we were hooked. Years of early mornings, late nights and plenty of ups and downs have led us to where we are today.', P.bodySmall),
  mareImg: img(STOCK.mareFoal, 'cover'),
  mareCap: text('BELLA LUCE & HER 2024 FILLY BY PROISIR — THE NEXT GENERATION', P.caption),
  jockeyImg: img(STOCK.jockeyRace, 'cover'),
  jockeyCap: text('BELLA LUCE\'S SON — STAKES WINNER, WAIKATO GUINEAS', P.caption),
  effortTitle: text('A FAMILY EFFORT', P.kickerNavy),
  effortBody: text('From feeding out to foal watches and trackside cheers, everyone plays a part in our journey. The best moments are always shared together.', P.bodySmall),
  highsTitle: text('THE HIGHS MAKE IT ALL WORTH IT', P.kickerGold),
  highsBody: text('Standing in the winner\'s circle is a feeling like no other. It\'s the reward for every bit of belief, every season of patience and every family moment along the way.', P.bodySmall),
  qr: qr('https://nztrof.co.nz/breeders'),
  qrNote: text('MEET THE BREEDER AND SEE THE BLOODLINES', P.qrLabel),
  footer: text('EVERY GREAT RACE HAS A BREEDING STORY.', P.footer),
  pageNum: text('PAGE 12', { ...P.footer, align: 'left' }),
});

// ── 15. Horse Welfare & Rehoming ────────────────────────────────────
const welfare = mkPage('horse-welfare', 'Horse Welfare & Rehoming', {
  band: text('HORSE WELFARE & REHOMING', { ...P.bandLabel }),
  h1a: text('LIFE AFTER', { ...P.displayNavy, fontSize: 34, color: '#1a3322' }),
  h1b: text('RACING', { ...P.displayGold, fontSize: 34 }),
  sub: text('Their next chapter. Our commitment.', P.scriptGold),
  body: text('Racing gives horses a start in life. We\'re here to help them thrive long after the last race.', P.bodySmall),
  heroImg: img(STOCK.eventing, 'cover'),
  henryTitle: text('MEET HENRY', P.kickerNavy),
  henryBody: text('After a successful racing career, Henry found a new calling in eventing. Today, he\'s inspiring young riders and showing just how versatile Thoroughbreds can be.', P.bodySmall),
  henryImg: img(STOCK.eventing, 'cover'),
  card1Img: img(STOCK.paddock, 'cover'),
  card1Body: text('<b>New disciplines</b> — from eventing to dressage, showjumping to pony club, so many paths are possible.', P.bodySmall),
  card2Img: img(STOCK.horseGallop, 'cover'),
  card2Body: text('<b>Great partners</b> — retired racehorses make loyal, intelligent partners for riders of all ages.', P.bodySmall),
  card3Img: img(STOCK.mareFoal, 'cover'),
  card3Body: text('<b>Forever grateful</b> — thank you to the owners, trainers and supporters who give these horses a second chance.', P.bodySmall),
  quote: text('They gave us their best on the track. Now it\'s our turn to give back.', P.pullQuote),
  sponsorBand: text('PROUDLY SUPPORTING HORSE WELFARE ACROSS NEW ZEALAND — Emergency response. Expert care. Every horse, every time. horseambulance.co.nz', { ...P.kickerWhite, fontSize: 9 }),
  footer: text('SUPPORTING TODAY. SECURING TOMORROW.', P.footer),
  pageNum: text('PAGE 13', { ...P.footer, align: 'right' }),
});

// ── 16. Business & Owners ───────────────────────────────────────────
const business = mkPage('business-owners', 'Business & Owners', {
  band: text('BUSINESS & OWNERS', P.bandLabel),
  h1a: text('WHERE RACING', { ...P.displayNavy, fontSize: 28 }),
  h1b: text('AND BUSINESS', { ...P.displayGold, fontSize: 28 }),
  h1c: text('CONNECT', { ...P.displayNavy, fontSize: 28 }),
  sub: text('Strong partnerships. Stronger results.', P.scriptGold),
  body: text('Racing brings people together — on and off the track. Many of our owners are business leaders who value relationships, trust and the thrill of success.', P.bodySmall),
  heroImg: img(STOCK.crowd, 'cover'),
  col1Title: text('NETWORKING', P.kickerNavy),
  col1Body: text('Build meaningful connections in a relaxed and rewarding environment.', P.bodySmall),
  col2Title: text('CLIENT RELATIONSHIPS', P.kickerNavy),
  col2Body: text('Share experiences that strengthen trust and create lasting impressions.', P.bodySmall),
  col3Title: text('BUSINESS DEVELOPMENT', P.kickerNavy),
  col3Body: text('Racing opens doors to new opportunities, partnerships and mutual success.', P.bodySmall),
  spotlightTitle: text('OWNER BUSINESS SPOTLIGHTS', { ...P.bandLabel, fontSize: 11 }),
  spot1Img: img(STOCK.portrait1, 'cover'),
  spot1Body: text('<b>Mark O\'Sullivan</b> — O\'Sullivan Civil Engineering. Building communities both on and off the track.', P.bodySmall),
  spot2Img: img(STOCK.portrait2, 'cover'),
  spot2Body: text('<b>Sarah James</b> — James & Co Lawyers. Passionate about people, property and performance.', P.bodySmall),
  spot3Img: img(STOCK.portrait3, 'cover'),
  spot3Body: text('<b>Tom Harrison</b> — Harrison Rural Services. From the land to the track, supporting rural communities.', P.bodySmall),
  partners: text('PROUDLY SUPPORTING OWNERSHIP & BUSINESS — Noble Insurance · Chapman Tripp · Farmlands · Dunstan · Bloodstock Insurance', { ...P.kickerNavy, fontSize: 9 }),
  qr: qr('https://nztrof.co.nz/business'),
  qrNote: text('CONNECT WITH FEATURED OWNER BUSINESSES', P.qrLabel),
  footer: text('BUILDING RELATIONSHIPS TODAY. CREATING SUCCESS TOMORROW.', P.footer),
  pageNum: text('PAGE 14', { ...P.footer, align: 'left' }),
});

// Leaderboard table builder
function lbTable(prefix: string, title: string, head: string, rows: string[]) {
  const out: Record<string, RegionContent> = {
    [`${prefix}Title`]: text(title, { ...P.kickerWhite, fontSize: 9 }),
    [`${prefix}Head`]: text(head, { ...P.th, color: GOLD }),
  };
  rows.forEach((r, i) => (out[`${prefix}R${i + 1}`] = row(r)));
  return out;
}

// ── 17. Leaderboards & Competitions ─────────────────────────────────
const leaderboards = mkPage('leaderboards', 'Leaderboards & Competitions', {
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
const gamification = mkPage('gamification', 'Gamification', {
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

// Prediction column builder
function predCol(prefix: string, title: string, photo: string, items: string[]) {
  const out: Record<string, RegionContent> = {
    [`${prefix}Title`]: text(title, { ...P.kickerWhite, fontSize: 9 }),
    [`${prefix}Img`]: img(photo, 'cover'),
  };
  items.forEach((it, i) => (out[`${prefix}I${i + 1}`] = text(it, P.bodySmall)));
  out[`${prefix}Qr`] = qr('https://nztrof.co.nz/predictions');
  return out;
}

// ── 19. Predictions ─────────────────────────────────────────────────
const predictions = mkPage('predictions', 'Predictions', {
  band: text('PREDICTIONS PAGE', P.bandLabel),
  h1a: text('THE HORSES', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('TO FOLLOW', { ...P.displayGold, fontSize: 34 }),
  sub: text('Today\'s insight. Tomorrow\'s champions.', P.scriptGold),
  intro: text('Our industry experts share the horses, yearlings and stallions they believe are the ones to watch. Keep an eye on these — the future is bright.', P.bodySmall),
  badge: text('INSIGHTS FROM THOSE WHO KNOW', { ...P.statLabel, color: WHITE, align: 'center' }),
  ...predCol('p1', 'YEARLINGS TO WATCH', STOCK.horseGallop, [
    '<b>Lot 145</b> — b. c. Proisir x Bella Luce. From a proven family. — Jarah Brady, Bloodstock Agent',
    '<b>Lot 267</b> — b. f. Savabeel x Ocean Empress. Elegant filly with a powerful pedigree. — Mark Walker, Trainer',
    '<b>Lot 312</b> — ch. c. Tavistock x Lady of Grace. A beautifully balanced colt. — Jamie Richards, Trainer',
  ]),
  ...predCol('p2', 'YOUNG HORSES TO FOLLOW', STOCK.gallop2, [
    '<b>Imperial Gift</b> (3yo g.) — impressive last-start winner, still learning. — Michael Guerin, Trainer',
    '<b>Miss Tivaci</b> (3yo f.) — smart filly with gate speed. — Tony Pike, Trainer',
    '<b>Voyage Bubble</b> (3yo c.) — big, strong colt with a turn of foot. — Lisa Latta, Bloodstock',
  ]),
  ...predCol('p3', 'STALLIONS MAKING AN IMPACT', STOCK.jockeyRace, [
    '<b>Proisir</b> — consistent results year after year. — Brent Clark, Breeder',
    '<b>Savabeel</b> — champion sire of champions. — Mark Chittick, Breeder',
    '<b>Tivaci</b> — siring speed, precocity and class. — John Thompson, Trainer',
  ]),
  partners: text('PROUDLY SUPPORTED BY OUR INDUSTRY PARTNERS — TAB · NZB · Dunstan · Valachi Downs · Bare Insurance', { ...P.kickerNavy, fontSize: 9 }),
  footer: text('GREAT RACING STARTS WITH INSIGHT. GREAT OWNERS STAY ONE STEP AHEAD.', P.footer),
  pageNum: text('PAGE 17', { ...P.footer, align: 'right' }),
});

// ── 20. Predictions Follow-up / Scoreboard ──────────────────────────
const followup = mkPage('predictions-followup', 'Predictions Follow-up', {
  band: text('FOLLOW-UP', P.bandLabel),
  bandSub: text('We track. You win.', { ...P.caption, color: GOLD }),
  h1a: text('WHAT HAPPENED TO', { ...P.displayNavy, fontSize: 26 }),
  h1b: text('LAST ISSUE\'S PREDICTIONS?', { ...P.displayGold, fontSize: 26 }),
  sub: text('We looked ahead. Now let\'s see how we went.', P.scriptGold),
  body: text('Our panel of industry experts shared their top selections across yearlings, young horses and stallions. Here\'s how they performed.', P.bodySmall),
  scoreTitle: text('PREDICTIONS SCOREBOARD', { ...P.kickerWhite, fontSize: 9 }),
  score1: text('<b>Yearlings to Watch</b> — 12 predictions · 6 winners · 50% success', P.bodySmall),
  score2: text('<b>Young Horses to Follow</b> — 15 predictions · 7 winners · 47% success', P.bodySmall),
  score3: text('<b>Stallions Making an Impact</b> — 8 predictions · 3 winners · 38% success', P.bodySmall),
  topTitle: text('TOP PERFORMER', P.kickerGold),
  topImg: img(STOCK.jockeyRace, 'cover'),
  topBody: text('<b>Imperial Gift</b> (3yo g.) — tipster pick last issue. WINNER, Group 1 Sistema Stakes. "A class above." — Michael Guerin', P.bodySmall),
  winsTitle: text('BIGGEST WINS', P.kickerNavy),
  winsBody: text('Savabeel (3yo c.) — predicted to thrive over ground, delivered in style. Won the Group 2 Waikato Guineas.', P.bodySmall),
  blackTitle: text('BLACK TYPE HIGHLIGHTS', P.kickerNavy),
  blackBody: text('✓ Miss Tivaci — Group 1 NZ Oaks<br>✓ Voyage Bubble — Group 2 Avondale Guineas<br>✓ Tivaci — Group 1 Tarzino Trophy', P.bodySmall),
  auctionTitle: text('AUCTION STARS', P.kickerNavy),
  auctionBody: text('Lot 312 — Tavistock x Lady of Grace. Sold for $380,000 at Karaka Book 1. Strong type and pedigree updates coming through.', P.bodySmall),
  tipstersTitle: text('EXPERT TIPSTERS — HOW THEY WENT', { ...P.bandLabel, fontSize: 11 }),
  tipsters: text('Michael Guerin 6/12 (50%) · Tony Pike 8/15 (53%) · Lisa Latta 5/12 (42%) · John Buchanan 4/11 (36%) · Jamie Richards 5/12 (42%) · Brent Clark 3/8 (38%)', P.bodySmall),
  nextQr: qr('https://nztrof.co.nz/predictions/results'),
  nextNote: text('WHAT\'S NEXT? Turn to Page 17 to see our new predictions. VIEW FULL RESULTS ONLINE.', P.qrLabel),
  footer: text('GREAT INSIGHT. REAL RESULTS. THAT\'S THE POWER OF INFORMED OWNERSHIP.', P.footer),
  pageNum: text('PAGE 16', { ...P.footer, align: 'left' }),
});

// ── 21. Ownership Education ─────────────────────────────────────────
const education = mkPage('ownership-education', 'Ownership Education', {
  band: text('OWNERSHIP EDUCATION', P.bandLabel),
  bandSub: text('Knowledge today. Ownership for life.', { ...P.caption, color: GOLD }),
  h1a: text('HOW TO', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('BECOME AN OWNER', { ...P.displayGold, fontSize: 34 }),
  sub: text('Your guide to getting involved in racing ownership.', P.scriptGold),
  body: text('Racing ownership is more accessible than ever. Here\'s everything you need to know to get started with confidence.', P.bodySmall),
  step1: text('<b>1. Syndicates explained</b> — syndicates allow you to share the experience, costs and rewards with like-minded people.', P.bodySmall),
  step2: text('<b>2. Costs involved</b> — upfront costs vary, but ownership can be more affordable than you think.', P.bodySmall),
  step3: text('<b>3. Choosing the right trainer</b> — a great trainer is key to your horse\'s success and your enjoyment.', P.bodySmall),
  step4: text('<b>4. Ownership etiquette</b> — good manners and respect make racing enjoyable for everyone.', P.bodySmall),
  step5: text('<b>5. The experience</b> — from mornings at the stables to race-day thrills, it\'s a journey you\'ll never forget.', P.bodySmall),
  photoStrip: img(STOCK.crowd, 'cover'),
  toolsTitle: text('USEFUL TOOLS TO GET STARTED', { ...P.kickerGold, fontSize: 9 }),
  tool1: text('Ownership calculator — estimate costs and plan your ownership journey.', P.bodySmall),
  tool1Qr: qr('https://nztrof.co.nz/calculator'),
  tool2: text('Trainer directory — search trainers by location and specialty.', P.bodySmall),
  tool2Qr: qr('https://nztrof.co.nz/trainers'),
  tool3: text('Syndicate finder — find the right syndicate for you.', P.bodySmall),
  tool3Qr: qr('https://nztrof.co.nz/syndicates'),
  ctaTitle: text('LEARN. CONNECT. EXPERIENCE.', P.kickerNavy),
  ctaBody: text('Join stable visits, information evenings and ownership events across New Zealand. We\'re here to help you every step of the way.', P.bodySmall),
  guideQr: qr('https://nztrof.co.nz/starter-guide'),
  guideNote: text('NEW TO RACING? Scan to access our complete Ownership Starter Guide.', P.qrLabel),
  footer: text('OWNERSHIP IS MORE THAN A HORSE. IT\'S A COMMUNITY. WE CAN\'T WAIT TO WELCOME YOU.', P.footer),
  pageNum: text('PAGE 17', { ...P.footer, align: 'right' }),
});

// Winner card builder
function winnerCard(prefix: string, photo: string, race: string, horse: string, detail: string) {
  return {
    [`${prefix}Img`]: img(photo, 'cover'),
    [`${prefix}Race`]: text(race, { ...P.kickerGold, fontSize: 8.5 }),
    [`${prefix}Horse`]: text(horse, { ...P.name, fontSize: 14 }),
    [`${prefix}Detail`]: text(detail, P.caption),
  };
}

// ── 22. Winning Moments ─────────────────────────────────────────────
const winning = mkPage('winning-moments', 'Winning Moments', {
  band: text('WINNING MOMENTS  🏆', P.bandLabel),
  bandSub: text('The thrill. The people. The pride.', { ...P.caption, color: GOLD }),
  h1a: text('OWNERSHIP. PASSION.', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('VICTORY.', { ...P.displayGold, fontSize: 30 }),
  sub: text('Moments that stay with you forever.', P.scriptGold),
  intro: text('Congratulations to all our winning connections from the past month.', P.bodySmall),
  heroImg: img(STOCK.ownersCelebrate, 'cover'),
  ...winnerCard('w1', STOCK.winnersCircle, 'GROUP 1 VICTORY — SISTEMA STAKES', 'IMPERIAL GIFT', 'Owners: Paddock Partners Syndicate (Mgr: D. Anderson). Trainer: M. Walker · Jockey: M. Cartwright'),
  ...winnerCard('w2', STOCK.raceFinish, 'GROUP 2 VICTORY — AVONDALE GUINEAS', 'VOYAGE BUBBLE', 'Owners: Bubble Racing Syndicate (Mgr: Mrs L. Latta). Trainer: T. Pike · Jockey: O. Bosson'),
  ...winnerCard('w3', STOCK.jockeyRace, 'GROUP 3 VICTORY — WAIKATO GUINEAS', 'SAVABEEL', 'Owners: Savannah Success Syndicate. Trainer: M. Walker · Jockey: J. McDonald'),
  ...winnerCard('w4', STOCK.celebrate2, 'LISTED — COUPLAND\'S MILE', 'MISS TIVACI', 'Owners: Tivaci Girls Syndicate (Mgr: K. Fursdon). Trainer: S & E. Clotworthy · Jockey: M. Coleman'),
  ...winnerCard('w5', STOCK.crowd2, 'BENCHMARK WINNER — MATAMATA', 'OCEAN EMPRESS', 'Owners: Blue Ocean Racing (Mgr: B. Hargreaves). Trainer: S. Marsh · Jockey: W. Pinn'),
  uploadQr: qr('https://nztrof.co.nz/upload'),
  uploadNote: text('Share your winning moments with the ownership community! Upload your photos online now.', P.qrLabel),
  pageNum: text('PAGE 18', { ...P.footer, align: 'left' }),
});

// ── 23. Owners Voice ────────────────────────────────────────────────
const voice = mkPage('owners-voice', 'Community & Contentious Issues', {
  band: text('COMMUNITY & CONTENTIOUS ISSUES  💬', P.bandLabel),
  bandSub: text('Stronger together. Better racing.', { ...P.caption, color: GOLD }),
  h1a: text('THE OWNERS\'', { ...P.displayNavy, fontSize: 34 }),
  h1b: text('VOICE', { ...P.displayGold, fontSize: 34 }),
  sub: text('Your experiences. Your ideas. Our future.', P.scriptGold),
  intro: text('Racing thrives when owners feel heard. This section is your platform to share feedback, raise concerns and suggest improvements that will help shape a stronger, more rewarding ownership experience for everyone.', P.bodySmall),
  col1Title: text('OWNERSHIP EXPERIENCES', P.kickerNavy),
  col1Said: text('<b>What you said:</b> Some owners feel disconnected after joining; information can be hard to find.', P.bodySmall),
  col1Ideas: text('<b>Ideas for change:</b> Better onboarding for new owners; a centralised communication hub.', P.bodySmall),
  col2Title: text('RACEDAY TREATMENT', P.kickerNavy),
  col2Said: text('<b>What you said:</b> Access and recognition can be inconsistent; facilities vary by venue.', P.bodySmall),
  col2Ideas: text('<b>Ideas for change:</b> Consistent owner recognition across all venues; more owners\' bars.', P.bodySmall),
  col3Title: text('COMMUNICATION IMPROVEMENTS', P.kickerNavy),
  col3Said: text('<b>What you said:</b> Race information isn\'t always easy to access; updates can be slow.', P.bodySmall),
  col3Ideas: text('<b>Ideas for change:</b> Real-time updates via app and SMS; regular newsletters and video updates.', P.bodySmall),
  col4Title: text('SUGGESTIONS FOR CHANGE', P.kickerNavy),
  col4Said: text('<b>What you said:</b> More opportunities to engage with trainers; desire for affordable options.', P.bodySmall),
  col4Ideas: text('<b>Ideas for change:</b> More stable visits and owner events; growth of micro-share ownership.', P.bodySmall),
  buildTitle: text('LET\'S BUILD A BETTER FUTURE', P.kickerGold),
  buildBody: text('Your feedback helps drive meaningful change. Together, we can create a racing industry that listens, learns and leads. Stronger owners. Stronger racing.', P.bodySmall),
  boardImg: img(STOCK.crowd, 'cover'),
  sayQr: qr('https://nztrof.co.nz/have-your-say'),
  sayNote: text('HAVE YOUR SAY — scan to submit your views and help shape the future of racing ownership.', P.qrLabel),
  topics: text('RECENT TOPICS RAISED BY OWNERS — More transparency around stake distribution · Improved access to race replays · More mid-week raceday experiences · Continued focus on horse welfare · More affordable ways to get involved', { ...P.kickerNavy, fontSize: 8.5 }),
  footer: text('YOUR VOICE. YOUR COMMUNITY. YOUR RACING. TOGETHER, WE CAN MAKE A DIFFERENCE.', P.footer),
  pageNum: text('PAGE 19', { ...P.footer, align: 'right' }),
});

// Back-cover table rows (20)
const winnersRows: string[] = [
  '1 · Paddock Partners Syndicate · Imperial Gift (Gr.1) · Winner · Sistema Stakes',
  '2 · Bubble Racing Syndicate · Voyage Bubble (Gr.2) · Winner · Avondale Guineas',
  '3 · Savannah Success Syndicate · Savabeel (Gr.2) · Winner · Waikato Guineas',
  '4 · Tivaci Girls Syndicate · Miss Tivaci (Gr.1) · Winner · Tarzino Trophy',
  '5 · Ocean Racing Syndicate · Ocean Empress (LR) · Winner · Coupland\'s Mile',
  '6 · Mark & Sarah Thompson · Golden Path (Gr.3) · Winner · Cambridge Breeders\' Stakes',
  '7 · Waikato Racing Group · Lady Of Grace (Gr.3) · Winner · Matamata Cup',
  '8 · Harrison Family Syndicate · Rising Impact (LR) · Winner · Taranaki 2YO Classic',
  '9 · Fortune Bay Racing · Shadow Dancer (LR) · Winner · South Island Sale Stakes',
  '10 · M. Wright & D. Anderson · Light The Way · Winner · Benchmark 75',
  '11 · Team Bostock · Pacific Fury · Winner · Benchmark 75',
  '12 · Corn & Nic Racing · South Island · Winner · Benchmark 65',
  '13 · The Longshot Crew · Quick Return · Winner · Benchmark 65',
  '14 · Central South Club · Bella Luce · Winner · Benchmark 65',
  '15 · Friends of Racing Syndicate · Lady Luck · Winner · Benchmark 65',
  '16 · J. Miller & Co. Syndicate · Brave Contender · 2nd · Wellington Cup',
  '17 · Dunstan Thoroughbreds · Miss Ellary · 2nd · The Oaks',
  '18 · R. & L. McLeod · Shockwave · 3rd · New Zealand Derby',
  '19 · Bluewater Syndicate · Ocean Jewel · 3rd · Manawatu Sires\' Produce Stakes',
  '20 · C. & K. Partnership · Flying Finish · 3rd · Ellerslie 1200',
];

// ── 24. Back Cover ──────────────────────────────────────────────────
const backCover = mkPage('back-cover', 'Back Cover — Owners of Winners', {
  masthead: text('NZTROF', { ...P.displayGold, fontSize: 26, color: WHITE }),
  mastheadSub: text('NEW ZEALAND THOROUGHBRED RACING OWNERS FEDERATION', { ...P.kickerWhite, fontSize: 7 }),
  h1a: text('OWNERS', { ...P.displayGold, fontSize: 54, color: GOLD }),
  h1b: text('OF WINNERS', { ...P.displayGold, fontSize: 54, color: WHITE }),
  sub: text('CELEBRATING OUR WINNING OWNERS THIS QUARTER — APRIL / MAY / JUNE 2025', { ...P.kickerGold, fontSize: 9 }),
  heroImg: img(STOCK.jockeyRace, 'cover'),
  tableHead: text('RANK · OWNER / SYNDICATE · HORSE(S) · RESULT · RACE', { ...P.th, color: GOLD }),
  ...Object.fromEntries(winnersRows.map((r, i) => [`row${i + 1}`, row(r)])),
  note: text('*Results correct as at 30 June 2025', P.caption),
  shareTitle: text('SHARE THE JOY. OWN THE JOURNEY.', { ...P.subhead, color: WHITE, fontSize: 14 }),
  shareBody: text('Every winner has a team behind them. Thank you to all our owners for your passion and support.', { ...P.bodySmall, color: '#dfe6f2' }),
  registerQr: qr('https://raceowners.co.nz/join'),
  registerNote: text('REGISTER AS AN NZTROF OWNER MEMBER TODAY!', P.qrLabel),
  partners: text('THANK YOU TO OUR PREMIUM PARTNERS — Noble Insurance · Dunstan · Valachi Downs · Cambridge Stud · The Grand Room', { ...P.kickerWhite, fontSize: 8.5 }),
  footer: text('OWN THE DREAM. SHARE THE THRILL.', { ...P.footer, fontSize: 12, color: GOLD }),
  pageNum: text('PAGE 20', { ...P.footer, align: 'right' }),
});

// ── Registry of blueprints (print order) ────────────────────────────
export const BLUEPRINTS: PageBlueprint[] = [
  cover, president, editor, discussion, headline, young, women,
  regionNorth, regionSouth, lounge, karaka, celebration, future,
  breeder, welfare, business, leaderboards, gamification, predictions,
  followup, education, winning, voice, backCover,
];

/** Lookup a blueprint by its page type. */
export const BLUEPRINT_BY_TYPE: Record<string, PageBlueprint> = Object.fromEntries(
  BLUEPRINTS.map((b) => [b.pageType, b])
);

/** Build the default 24-page document for a brand-new magazine. */
export function createDefaultPages(): MagazinePage[] {
  return BLUEPRINTS.map((bp, i) => ({
    id: `${bp.pageType}-${i + 1}`,
    pageType: bp.pageType,
    label: bp.label,
    number: i + 1,
    selectedForPublish: true,
    // Deep clone so each magazine owns its content.
    content: structuredClone(bp.defaultContent),
  }));
}
