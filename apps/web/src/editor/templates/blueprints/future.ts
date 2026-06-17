import { mkPage, text, img, qr, STOCK, P } from './_shared';

// ── 13. Our Future Together ─────────────────────────────────────────
export const future = mkPage('future-together', 'Our Future. Together.', {
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
