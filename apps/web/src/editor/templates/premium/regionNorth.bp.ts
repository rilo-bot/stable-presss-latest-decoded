import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const ROLE_GOLD = '#8a6b1e';

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

// ── Regional Roundups — North (premium) — navy band w/ horse accent icon, a
//    headline + intro, and three region blocks (Auckland/Northland, Waikato/BOP,
//    Hawke's Bay) each with photo, name, tagline, body, owner quote and a QR.
export const regionNorthPx = mkPage('regional-north-px', 'Regional Roundups — North', {
  band: text('REGIONAL ROUNDUPS — NORTH', P.bandLabel),
  bandIcon: icon('Horse', GOLD),

  h1a: text('STRONG REGIONS.', { ...P.displayNavy, fontSize: 30 }),
  h1b: text('STRONGER TOGETHER.', { ...P.displayGold, fontSize: 30 }),
  sub: text('Celebrating owner success across the North Island.', { ...P.scriptGold, fontSize: 19 }),
  intro: text(
    "From the Far North to Hawke's Bay, our northern regions continue to thrive with passionate owners, unforgettable racing and a welcoming community spirit.",
    { ...P.bodySmall, fontSize: 11 }
  ),

  ...regionBlock('r1', STOCK.ownersCelebrate, 'AUCKLAND / NORTHLAND', 'Pride of the North', "Northland trainer Ken Harrison celebrated a brilliant double at Ruakaka with stable star Coastal Charm, while a new wave of syndicates continue to emerge from Auckland's vibrant racing community.", '"Owning a horse has connected us with the most amazing people. It\'s about so much more than raceday." — Anna & James, Auckland owners'),
  ...regionBlock('r2', STOCK.crowd, 'WAIKATO / BAY OF PLENTY', 'Growing Future Champions', 'Cambridge trainers are going from strength to strength with young talents like Lightning Rose lighting up the track. Owner events across the Bay continue to grow.', '"The Waikato racing community makes you feel part of something special." — Mark, Cambridge owner'),
  ...regionBlock('r3', STOCK.paddock, "HAWKE'S BAY", 'Heart of the Heritage', "Hawke's Bay continues to deliver top-class racing and warm hospitality. Recent highlights include the success of local bred mare Bella Nipotina.", '"We breed, race and celebrate together. That\'s what makes Hawke\'s Bay so unique." — Sarah & Tim, Hastings breeders'),

  footer: text('LOCAL PASSION. LIFELONG FRIENDSHIPS. UNFORGETTABLE MEMORIES.', P.footer),
  pageNum: text('PAGE 6', { ...P.footer, align: 'right' }),
});
