import { mkPage, text, regionBlock, STOCK, P } from './_shared';

// ── 8. Regional Roundups — North ────────────────────────────────────
export const regionNorth = mkPage('regional-north', 'Regional Roundups — North', {
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
export const regionSouth = mkPage('regional-south', 'Regional Roundups — South', {
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
