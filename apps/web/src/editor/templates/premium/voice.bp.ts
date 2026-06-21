/**
 * Premium Owners' Voice blueprint (template #2) — `owners-voice-px`.
 *
 * Premium restyle of the classic `voice` page: hero photo, FOUR feature columns
 * (Ownership Experiences / Raceday Treatment / Communication Improvements /
 * Suggestions for Change) each with a gold icon + "What You Said" list + "Ideas
 * for Change" list, a "Let's Build a Better Future" block with a boardroom photo,
 * a "Have Your Say" QR, and a "Recent Topics Raised by Owners" icon row. Same
 * region names and copy as the classic, restyled premium.
 */

import type { PageBlueprint } from '../blueprints/_shared';
import { mkPage, text, img, qr, icon, STOCK, P, GOLD, NAVY, WHITE } from '../blueprints/_shared';

const LIGHT = '#d7deea'; // body text on navy

const SAID = { ...P.bodySmall, fontSize: 10 };
const IDEAS = { ...P.bodySmall, fontSize: 10 };

export const voicePx: PageBlueprint = mkPage('owners-voice-px', "Owners' Voice", {
  // Header band
  band: text('COMMUNITY & CONTENTIOUS ISSUES', P.bandLabel),
  bandSub: text('Stronger together. Better racing.', { ...P.caption, color: GOLD }),
  bandIcon: icon('MessageCircle', GOLD),

  // Headline block
  h1a: text("THE OWNERS'", { ...P.displayNavy, fontSize: 36 }),
  h1b: text('VOICE', { ...P.displayGold, fontSize: 36 }),
  sub: text('Your experiences. Your ideas. Our future.', P.scriptGold),
  heroImg: img(STOCK.crowd2, 'cover'),
  intro: text('Racing thrives when owners feel heard. This section is your platform to share feedback, raise concerns and suggest improvements that will help shape a stronger, more rewarding ownership experience for everyone.', { ...P.body, fontSize: 11.5 }),

  // Four feature columns — gold icon + What You Said + Ideas for Change
  col1Icon: icon('Heart', GOLD),
  col1Title: text('OWNERSHIP EXPERIENCES', { ...P.kickerNavy, fontSize: 11 }),
  col1Said: text('<b>What you said:</b> Some owners feel disconnected after joining; information can be hard to find.', SAID),
  col1Ideas: text('<b>Ideas for change:</b> Better onboarding for new owners; a centralised communication hub.', IDEAS),
  col2Icon: icon('Award', GOLD),
  col2Title: text('RACEDAY TREATMENT', { ...P.kickerNavy, fontSize: 11 }),
  col2Said: text('<b>What you said:</b> Access and recognition can be inconsistent; facilities vary by venue.', SAID),
  col2Ideas: text("<b>Ideas for change:</b> Consistent owner recognition across all venues; more owners' bars.", IDEAS),
  col3Icon: icon('Send', GOLD),
  col3Title: text('COMMUNICATION IMPROVEMENTS', { ...P.kickerNavy, fontSize: 11 }),
  col3Said: text("<b>What you said:</b> Race information isn't always easy to access; updates can be slow.", SAID),
  col3Ideas: text('<b>Ideas for change:</b> Real-time updates via app and SMS; regular newsletters and video updates.', IDEAS),
  col4Icon: icon('RefreshCw', GOLD),
  col4Title: text('SUGGESTIONS FOR CHANGE', { ...P.kickerNavy, fontSize: 11 }),
  col4Said: text('<b>What you said:</b> More opportunities to engage with trainers; desire for affordable options.', SAID),
  col4Ideas: text('<b>Ideas for change:</b> More stable visits and owner events; growth of micro-share ownership.', IDEAS),

  // Let's build a better future + boardroom photo + Have Your Say QR
  buildTitle: text("LET'S BUILD A BETTER FUTURE", { ...P.kickerGold, fontSize: 13, color: WHITE }),
  buildBody: text('Your feedback helps drive meaningful change. Together, we can create a racing industry that listens, learns and leads. Stronger owners. Stronger racing.', { ...P.bodySmall, fontSize: 10.5, color: LIGHT }),
  boardImg: img(STOCK.crowd, 'cover'),
  sayQr: qr('https://nztrof.co.nz/have-your-say'),
  sayNote: text('HAVE YOUR SAY — scan to submit your views and help shape the future of racing ownership.', { ...P.qrLabel, color: WHITE }),

  // Recent topics raised by owners — icon row
  topicsTitle: text('RECENT TOPICS RAISED BY OWNERS', { ...P.kickerGold, fontSize: 11 }),
  topic1Icon: icon('DollarSign', NAVY),
  topic1: text('More transparency around stake distribution', { ...P.kickerNavy, fontSize: 8.5 }),
  topic2Icon: icon('PlayCircle', NAVY),
  topic2: text('Improved access to race replays', { ...P.kickerNavy, fontSize: 8.5 }),
  topic3Icon: icon('Calendar', NAVY),
  topic3: text('More mid-week raceday experiences', { ...P.kickerNavy, fontSize: 8.5 }),
  topic4Icon: icon('Heart', NAVY),
  topic4: text('Continued focus on horse welfare', { ...P.kickerNavy, fontSize: 8.5 }),
  topic5Icon: icon('UsersGroup', NAVY),
  topic5: text('More affordable ways to get involved', { ...P.kickerNavy, fontSize: 8.5 }),

  footer: text('YOUR VOICE. YOUR COMMUNITY. YOUR RACING. TOGETHER, WE CAN MAKE A DIFFERENCE.', P.footer),
  pageNum: text('PAGE 19', { ...P.footer, align: 'right' }),
});
