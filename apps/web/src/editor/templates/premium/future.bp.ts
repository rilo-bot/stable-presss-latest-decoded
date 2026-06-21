/**
 * Premium template — Our Future. Together. (template #2).
 *
 * Premium-styled version of the classic `future` page. Same region names and
 * copy as the classic blueprint, restyled for the premium house design: a
 * laptop/phone device hero image, two header cards (Long-Term Strategic
 * Direction; The Print Magazine) with outline-icon features each, a navy
 * "THE WEBSITE" band with seven outline-icon feature columns, and a
 * "Together, we grow racing" footer block with QR.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy

export const futurePx: PageBlueprint = mkPage('future-together-px', 'Our Future Together', {
  // Headline block
  h1a: text('OUR FUTURE.', { ...P.displayNavy, fontSize: 42 }),
  h1b: text('TOGETHER.', { ...P.displayGold, fontSize: 42 }),
  sub: text('The print & digital partnership powering ownership.', { ...P.scriptGold, fontSize: 20 }),
  body: text('The NZTROF Bulletin and website are designed to work hand-in-hand — creating a connected ecosystem that inspires, informs and supports every owner.', { ...P.body, fontSize: 11.5 }),
  deviceImg: img(STOCK.device, 'cover'),

  // Long-term strategic direction (navy card) — three outline-icon features
  strategyTitle: text('LONG-TERM STRATEGIC DIRECTION', { ...P.kickerGold, fontSize: 10.5 }),
  strategyBody: text('We are building more than a publication. We are building an ownership movement.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  strat1Icon: icon('Globe', GOLD),
  strat1: text('Feeder into the NZTROF website', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  strat2Icon: icon('Share2', GOLD),
  strat2: text('Social ownership ecosystem', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  strat3Icon: icon('User', GOLD),
  strat3: text('Owner identity platform', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),

  // The print magazine (navy card) — four outline-icon features
  magTitle: text('THE PRINT MAGAZINE: INSPIRING OWNERSHIP', { ...P.kickerGold, fontSize: 10.5 }),
  mag1Icon: icon('Sparkles', GOLD),
  mag1: text('<b>Create aspiration</b> — showcasing success stories, lifestyle and opportunities.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  mag2Icon: icon('Heart', GOLD),
  mag2: text('<b>Create belonging</b> — building a strong community and shared identity.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  mag3Icon: icon('Award', GOLD),
  mag3: text('<b>Create prestige</b> — a high-quality magazine owners are proud to be part of.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),
  mag4Icon: icon('RefreshCw', GOLD),
  mag4: text('<b>Create retention</b> — keeping owners engaged and connected for the long term.', { ...P.bodySmall, color: LIGHT, fontSize: 10 }),

  // The website band — seven outline-icon feature columns
  webTitle: text('THE WEBSITE: DELIVERING DEPTH &amp; INTERACTION', P.bandLabel),
  web1Icon: icon('BookOpen', GOLD),
  web1: text('In-depth content', { ...P.kickerNavy, fontSize: 9, align: 'center' }),
  web2Icon: icon('MessageCircle', GOLD),
  web2: text('Interaction', { ...P.kickerNavy, fontSize: 9, align: 'center' }),
  web3Icon: icon('PlayCircle', GOLD),
  web3: text('Video', { ...P.kickerNavy, fontSize: 9, align: 'center' }),
  web4Icon: icon('Mail', GOLD),
  web4: text('Registrations', { ...P.kickerNavy, fontSize: 9, align: 'center' }),
  web5Icon: icon('Trophy', GOLD),
  web5: text('Ownership opportunities', { ...P.kickerNavy, fontSize: 9, align: 'center' }),
  web6Icon: icon('BarChart3', GOLD),
  web6: text('Advertising analytics', { ...P.kickerNavy, fontSize: 9, align: 'center' }),
  web7Icon: icon('Users', GOLD),
  web7: text('Member engagement', { ...P.kickerNavy, fontSize: 9, align: 'center' }),

  // Together, we grow racing — footer block with QR
  ctaTitle: text('TOGETHER, WE GROW RACING.', { ...P.subhead, fontSize: 18, color: GOLD }),
  ctaBody: text('Stronger together. Racing forever. By combining the premium feel of our Bulletin with the power and reach of our website, we are creating a better future for owners, racing and the sport we love.', { ...P.bodySmall, fontSize: 10.5, color: LIGHT }),
  ctaQr: qr('https://nztrof.co.nz'),

  footer: text('ONE COMMUNITY. ONE PASSION. ONE FUTURE.', P.footer),
  pageNum: text('PAGE 11', { ...P.footer, align: 'right' }),
});
