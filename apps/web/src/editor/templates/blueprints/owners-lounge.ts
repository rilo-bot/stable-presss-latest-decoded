import { mkPage, text, img, qr, STOCK, P, GOLD } from './_shared';

// ── 10. Owners Lounge ───────────────────────────────────────────────
export const lounge = mkPage('owners-lounge', 'Owners Lounge', {
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
