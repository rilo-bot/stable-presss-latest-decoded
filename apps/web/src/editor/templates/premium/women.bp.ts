import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const MAROON = '#7a1f2b'; // headline passion/leadership accent
const MAROON_BAND = '#5a2a3a'; // section band
const ROLE_GOLD = '#8a6b1e';

// ── Women in Racing (premium) — maroon-accent headline, 3-photo collage hero,
//    three feature columns, luxury partner spotlight, and a race-day-style vote QR.
export const womenPx = mkPage('women-in-racing-px', 'Women in Racing', {
  band: text('WOMEN IN RACING', P.bandLabel),
  bandIcon: icon('Heart', GOLD),

  // Headline block — STYLE. PASSION. LEADERSHIP. (maroon accents)
  h1a: text('STYLE.', { ...P.displayNavy, fontSize: 42 }),
  h1b: text('PASSION.', { ...P.displayNavy, fontSize: 42, color: MAROON }),
  h1c: text('LEADERSHIP.', { ...P.displayNavy, fontSize: 42, color: MAROON }),
  sub: text('Women powering the future of racing.', { ...P.scriptGold, fontSize: 20 }),
  body: text(
    "From the winner's circle to the boardroom, women are leading, inspiring and making their mark on every part of our great sport.",
    { ...P.body, fontSize: 12 }
  ),

  // 3-photo collage hero
  collage1: img(STOCK.women, 'cover'),
  collage2: img(STOCK.champagne, 'cover'),
  collage3: img(STOCK.crowd, 'cover'),

  // Three feature columns
  col1Icon: icon('UsersGroup', GOLD),
  col1Title: text('OWNERSHIP GROUPS', { ...P.kickerNavy, fontSize: 12 }),
  col1Body: text('Strong women. Shared dreams. Lasting friendships. Together we celebrate every moment.', { ...P.bodySmall, fontSize: 10.5 }),
  col2Icon: icon('Briefcase', GOLD),
  col2Title: text('FEMALE BUSINESS LEADERS', { ...P.kickerNavy, fontSize: 12 }),
  col2Body: text('Balancing business, family and a passion for racing. Women leading in and beyond the industry.', { ...P.bodySmall, fontSize: 10.5 }),
  col3Icon: icon('Sparkles', GOLD),
  col3Title: text('RACE-DAY STYLE', { ...P.kickerNavy, fontSize: 12 }),
  col3Body: text('Elegance, colour and confidence. Our race days are a celebration of fashion and fun.', { ...P.bodySmall, fontSize: 10.5 }),

  // Luxury partner spotlight
  sponsorKicker: text('LUXURY PARTNER SPOTLIGHT', { ...P.kickerGold, fontSize: 12 }),
  sponsorScript: text('Experience the finest', { ...P.script, fontSize: 28 }),
  sponsorBody: text('Proudly supporting women in racing and celebrating excellence in style, passion and performance.', { ...P.bodySmall, fontSize: 11 }),
  sponsorName: text('ELLERSLIE LANE — NEW ZEALAND', { ...P.kickerNavy, fontSize: 12 }),
  sponsorImg: img(STOCK.women, 'cover'),
  sponsorTag: text("Timeless elegance. Racing is more than a sport, it's a lifestyle. ellerslielane.co.nz", { ...P.caption, color: ROLE_GOLD }),

  // Race-day-style vote
  voteIcon: icon('Award', GOLD),
  voteQr: qr('https://nztrof.co.nz/raceday-style-vote'),
  voteNote: text('VOTE FOR YOUR FAVOURITE RACE-DAY STYLE', { ...P.kickerGold, fontSize: 10.5 }),

  footer: text('WOMEN. INFLUENCE. INSPIRATION.', P.footer),
  pageNum: text('PAGE 5', { ...P.footer, align: 'right' }),
});
