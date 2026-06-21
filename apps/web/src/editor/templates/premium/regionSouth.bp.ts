import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const ROLE_GOLD = '#8a6b1e';
const LIGHT = '#d7deea'; // body text on navy

// One region block — photo + name + tagline + body + owner quote + scan QR.
function regionBlock(prefix: string, photo: string, name: string, tag: string, body: string, quote: string) {
  return {
    [`${prefix}Img`]: img(photo, 'cover'),
    [`${prefix}Name`]: text(name, { ...P.subhead, fontSize: 16 }),
    [`${prefix}Tag`]: text(tag, { ...P.scriptGold, fontSize: 18 }),
    [`${prefix}Body`]: text(body, { ...P.bodySmall, fontSize: 10.5 }),
    [`${prefix}Quote`]: text(quote, { ...P.caption, color: ROLE_GOLD }),
    [`${prefix}Qr`]: qr('https://nztrof.co.nz/regions'),
    [`${prefix}ScanLabel`]: text('SCAN TO READ FULL COVERAGE', { ...P.qrLabel, fontSize: 8 }),
  };
}

// One icon-list item on the navy right rail.
function railItem(prefix: string, name: string, label: string, body: string) {
  return {
    [`${prefix}Icon`]: icon(name, GOLD),
    [`${prefix}Label`]: text(label, { ...P.kickerGold, fontSize: 10.5 }),
    [`${prefix}Body`]: text(body, { ...P.bodySmall, fontSize: 9.5, color: LIGHT }),
  };
}

// ── Regional Roundups — South (premium) — mirror of North (Manawatu/Wellington,
//    Central South Island, Otago/Southland) with a navy right rail carrying the
//    Regional Event Calendar / Ownership Groups / Trainer Visits icon list.
export const regionSouthPx = mkPage('regional-south-px', 'Regional Roundups — South', {
  band: text('REGIONAL ROUNDUPS — SOUTH', P.bandLabel),
  bandIcon: icon('Horse', GOLD),

  h1a: text('ONE COMMUNITY.', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('ONE PASSION.', { ...P.displayGold, fontSize: 30 }),
  sub: text('Racing thrives in every corner of the South Island.', { ...P.scriptGold, fontSize: 19 }),
  intro: text(
    'From the Manawatu to Southland, our southern regions are full of dedicated owners, fantastic racing and welcoming communities.',
    { ...P.bodySmall, fontSize: 11 }
  ),

  ...regionBlock('r1', STOCK.champagne, 'MANAWATU / WELLINGTON', 'Community at the Core', 'From the Lawn at Trentham to the Central Districts racetracks, our owners are at the heart of everything we do. Recent owner functions and behind-the-scenes stable visits have been a huge hit.', '"It\'s the people, the horses and the memories we make together." — Lisa, Palmerston North owner'),
  ...regionBlock('r2', STOCK.paddock, 'CENTRAL SOUTH ISLAND', 'Big Country Spirit', 'Racing in the heart of the South Island is thriving with strong ownership groups in Canterbury, Marlborough and the West Coast. Local breeders are producing exciting prospects.', '"There\'s nothing like seeing a home-bred run out a winner." — John, Canterbury breeder'),
  ...regionBlock('r3', STOCK.crowd, 'OTAGO / SOUTHLAND', 'Southern Strength', 'From Wingatui to Riverton, owners in the deep south share a true love of racing. Recent highlights include strong results for southern-trained gallopers.', '"Down here, we might be miles from everywhere, but we\'re close in racing." — Debbie, Southland owner'),

  // Navy right rail — icon list
  railTitle: text('ACROSS THE SOUTH', { ...P.bandLabel, fontSize: 11, color: GOLD }),
  ...railItem('rail1', 'Calendar', 'REGIONAL EVENT CALENDAR', 'Race days, owner functions and stable open days right across the southern regions.'),
  ...railItem('rail2', 'UsersGroup', 'OWNERSHIP GROUPS', 'Syndicates and clubs welcoming new owners into the southern racing family.'),
  ...railItem('rail3', 'Horse', 'TRAINER VISITS', 'Get up close — behind-the-scenes mornings and stable tours with leading trainers.'),
  railQr: qr('https://nztrof.co.nz/south/events'),
  railScan: text('SCAN FOR DATES &amp; DETAILS', { ...P.qrLabel, fontSize: 8, color: WHITE }),

  footer: text('DIFFERENT REGIONS. ONE INDUSTRY. ENDLESS OPPORTUNITY.', P.footer),
  pageNum: text('PAGE 7', { ...P.footer, align: 'right' }),
});
