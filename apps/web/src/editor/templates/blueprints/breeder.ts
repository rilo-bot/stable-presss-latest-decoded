import { mkPage, text, img, qr, STOCK, P } from './_shared';

// ── 14. Breeder Feature ─────────────────────────────────────────────
export const breeder = mkPage('breeder-feature', 'Breeder Feature', {
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
