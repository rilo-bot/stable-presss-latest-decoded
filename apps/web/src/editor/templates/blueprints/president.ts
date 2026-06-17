import { mkPage, text, img, qr, STOCK, P, NAVY, GOLD, WHITE } from './_shared';

// ── 2. President's Update ───────────────────────────────────────────
export const president = mkPage('president-update', "President's Update", {
  h1a: text("PRESIDENT'S", { ...P.displayNavy, fontSize: 38 }),
  h1b: text('UPDATE', { ...P.displayGold, fontSize: 38 }),
  byline: text('from Sally Blyth', P.script),
  portrait: img(STOCK.portrait3, 'cover'),
  body: text(
    'Welcome to another exciting edition of the NZTROF Bulletin.<br><br>It\'s wonderful to see so many of our owners enjoying success on the track and sharing in the thrill of ownership.<br><br>Whether it\'s your first runner or your fiftieth, the joy of seeing your horse compete never gets old.<br><br>Thank you for being part of our amazing community. Your passion and support help make racing the special sport that it is.<br><br>Enjoy the read!',
    P.body
  ),
  signoff: text('Sally', { ...P.script, fontSize: 30 }),
  name: text('Sally Blyth', P.name),
  role: text('President · Auckland Delegate · sally@beyondlimits.co.nz', P.role),
  boardTitle: text('NZTROF BOARD', { ...P.bandLabel, fontSize: 11 }),
  member1: text('<b>Sally Blyth</b> — President, Auckland Delegate', P.bodySmall),
  member2: text('<b>Berri Schroder</b> — Interim Editor, Waikato Delegate', P.bodySmall),
  member3: text('<b>Bernard Hickey</b> — Hawke\'s Bay Delegate', P.bodySmall),
  member4: text('<b>Mark Verran</b> — Manawatu Delegate', P.bodySmall),
  member5: text('<b>Peter Faulkner</b> — Central South Island Delegate', P.bodySmall),
  member6: text('<b>Ian Hackett</b> — Wanganui/Taranaki Delegate', P.bodySmall),
  member7: text('<b>Denise Mayhew</b> — Executive Officer', P.bodySmall),
  stayTitle: text('Stay connected!', { ...P.subhead, color: WHITE, fontSize: 15 }),
  stayBody: text('Scan the QR code to visit our website for the latest news, race results, owner benefits and event details.', { ...P.bodySmall, color: '#dfe6f2' }),
  stayQr: qr('https://nztrof.co.nz'),
  siteLabel: text('nztrof.co.nz', { ...P.kickerGold, fontSize: 10 }),
  footer: text("PROUD TO REPRESENT NEW ZEALAND'S RACEHORSE OWNERS.", P.footer),
  pageNum: text('PAGE 2', { ...P.footer, align: 'right' }),
});

// ── 3. From the Editor ──────────────────────────────────────────────
export const editor = mkPage('editor-letter', 'From the Editor', {
  h1a: text('FROM THE', { ...P.displayNavy, fontSize: 34 }),
  interim: text('(interim)', { ...P.caption, fontSize: 12, color: NAVY }),
  h1b: text('EDITOR', { ...P.displayGold, fontSize: 34 }),
  byline: text('by Berri Schroder', P.script),
  body: text(
    'Every issue of the Bulletin aims to bring you more than just news — we share the stories behind the silks, the people behind the passion and the moments that make ownership so rewarding.<br><br>In this edition we celebrate owner achievements, feature inspiring stories from around the country and highlight upcoming events and opportunities to get involved.<br><br>Thank you to everyone who contributes, supports and shares in the journey.<br><br>If you have a story or photos you\'d like to share, we\'d love to hear from you!',
    P.body
  ),
  signoff: text('Berri', { ...P.script, fontSize: 30 }),
  name: text('Berri Schroder · Interim Editor', P.name),
  emailQr: qr('mailto:berri.schroder@xtra.co.nz'),
  emailNote: text('Scan to email Berri', P.qrLabel),
  coverTitle: text('ON THE COVER', P.kickerGold),
  coverHeading: text('OWNERS CELEBRATE ANOTHER WIN!', { ...P.subhead, fontSize: 15 }),
  coverBody: text('A special moment of celebration after an impressive victory. There\'s nothing quite like the camaraderie and excitement of winning with your fellow owners.', P.bodySmall),
  coverImg: img(STOCK.champagne, 'cover'),
  coverQr: qr('https://raceowners.co.nz/gallery'),
  coverQrNote: text('SCAN TO VIEW THE FULL STORY AND PHOTO GALLERY', P.qrLabel),
  welcomeTitle: text('WELCOME NEW MEMBERS', P.kickerNavy),
  welcomeBody: text('A warm welcome to…<br>• The O\'Sullivan Family — Cambridge<br>• Westbury Racing Syndicate — Matamata<br>• Greenlight Racing — Auckland<br>• South Island Striders — Christchurch<br><br>We\'re thrilled to have you as part of our racing family!', P.bodySmall),
  siteTitle: text('VISIT OUR WEBSITE', P.kickerNavy),
  siteBody: text('raceowners.co.nz — your go-to place for ownership information, resources, race results and owners\' benefits.', P.bodySmall),
  siteQr: qr('https://raceowners.co.nz'),
  subs: text('SUBSCRIPTION RATES   |   Single $60 (incl. GST)   |   Double $65 (incl. GST)', P.footer),
  footer: text('STORIES BEHIND THE SILKS. PASSION BEHIND THE SPORT.', P.footer),
  pageNum: text('PAGE 3', { ...P.footer, align: 'right' }),
});
