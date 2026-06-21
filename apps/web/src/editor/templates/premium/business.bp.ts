/**
 * Premium template — Business & Owners blueprint (template #2).
 *
 * Premium-styled version of the classic `business` page (welfare.ts /
 * BusinessPage). Same region names and copy; restyled for the premium house
 * design — gold line-icons on the three features, a navy "Owner Business
 * Spotlights" band with profile photos + quotes, a sponsor logo row and a
 * QR connect strip. Uses its own `-px` pageType so template #1 is untouched.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy
const GOLD_LEAD = '#caa54a';
const ROLE_GOLD = '#8a6b1e';

// One owner spotlight → square photo, name, company, body + quote regions.
function spotlight(i: number, photo: string, name: string, company: string, body: string, quote: string) {
  return {
    [`spot${i}Img`]: img(photo, 'cover'),
    [`spot${i}Name`]: text(name, { ...P.name, fontSize: 12, color: WHITE }),
    [`spot${i}Company`]: text(company, { ...P.role, fontSize: 9.5, color: GOLD_LEAD }),
    [`spot${i}Body`]: text(body, { ...P.bodySmall, fontSize: 9.5, color: LIGHT }),
    [`spot${i}Quote`]: text(quote, { ...P.caption, color: GOLD_LEAD }),
  };
}

export const businessPx = mkPage('business-owners-px', 'Business & Owners', {
  band: text('BUSINESS & OWNERS', P.bandLabel),
  bandIcon: icon('Briefcase', GOLD),

  // Headline block
  h1a: text('WHERE RACING', { ...P.displayNavy, fontSize: 32 }),
  h1b: text('AND BUSINESS', { ...P.displayGold, fontSize: 32 }),
  h1c: text('CONNECT', { ...P.displayNavy, fontSize: 32 }),
  sub: text('Strong partnerships. Stronger results.', { ...P.scriptGold, fontSize: 20 }),
  body: text(
    'Racing brings people together — on and off the track. Many of our owners are business leaders who value relationships, trust and the thrill of success.',
    { ...P.body, fontSize: 11.5 }
  ),
  heroImg: img(STOCK.crowd, 'cover'),

  // Three gold-icon features
  col1Icon: icon('UsersGroup', GOLD),
  col1Title: text('NETWORKING', { ...P.kickerNavy, fontSize: 12 }),
  col1Body: text('Build meaningful connections in a relaxed and rewarding environment.', { ...P.bodySmall, fontSize: 10 }),
  col2Icon: icon('Handshake', GOLD),
  col2Title: text('CLIENT RELATIONSHIPS', { ...P.kickerNavy, fontSize: 12 }),
  col2Body: text('Share experiences that strengthen trust and create lasting impressions.', { ...P.bodySmall, fontSize: 10 }),
  col3Icon: icon('TrendingUp', GOLD),
  col3Title: text('BUSINESS DEVELOPMENT', { ...P.kickerNavy, fontSize: 12 }),
  col3Body: text('Racing opens doors to new opportunities, partnerships and mutual success.', { ...P.bodySmall, fontSize: 10 }),

  // Owner Business Spotlights (navy band)
  spotlightTitle: text('OWNER BUSINESS SPOTLIGHTS', { ...P.bandLabel, fontSize: 12, color: GOLD }),
  ...spotlight(1, STOCK.portrait1, "Mark O'Sullivan", "O'Sullivan Civil Engineering", 'Building communities both on and off the track.', '"Racing is where relationships and results meet."'),
  ...spotlight(2, STOCK.portrait2, 'Sarah James', 'James & Co Lawyers', 'Passionate about people, property and performance.', '"The track teaches you patience pays off."'),
  ...spotlight(3, STOCK.portrait3, 'Tom Harrison', 'Harrison Rural Services', 'From the land to the track, supporting rural communities.', '"Backing horses and backing our region go together."'),

  // Sponsor logo row
  partnersTitle: text('PROUDLY SUPPORTING OWNERSHIP & BUSINESS', { ...P.kickerGold, fontSize: 10 }),
  partner1: text('Noble Insurance', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner2: text('Chapman Tripp', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner3: text('Farmlands', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner4: text('Dunstan', { ...P.statLabel, color: NAVY, align: 'center' }),
  partner5: text('Bloodstock Insurance', { ...P.statLabel, color: NAVY, align: 'center' }),

  // Connect QR strip
  qr: qr('https://nztrof.co.nz/business'),
  qrNote: text('CONNECT WITH FEATURED OWNER BUSINESSES', { ...P.kickerNavy, fontSize: 11, color: ROLE_GOLD }),

  footer: text('BUILDING RELATIONSHIPS TODAY. CREATING SUCCESS TOMORROW.', P.footer),
  pageNum: text('PAGE 14', { ...P.footer, align: 'right' }),
});
