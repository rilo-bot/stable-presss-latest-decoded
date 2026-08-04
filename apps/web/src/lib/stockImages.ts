/**
 * Known-good Pexels racing photographs, by role.
 *
 * Split out of the v1 magazine builder's `editor/templates/helpers.ts` when that
 * builder was removed — the rest of that file built v1 region content and went
 * with it. These URLs survive because the Article and Profile Studio assistants
 * offer them as image suggestions (`suggestImageOptions`), which has nothing to do
 * with magazines.
 *
 * Every one is a real, stable Pexels id. Nothing here is generated or guessed.
 */

/** Pexels CDN URL for a photo id, at the width the app renders. */
const px = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;

export const STOCK = {
  ownersCelebrate: px(1996333),
  raceFinish: px(1995842),
  horseGallop: px(1571939),
  jockeyRace: px(1128428),
  portrait1: px(1181346),
  portrait2: px(1181671),
  portrait3: px(1183266),
  mareFoal: px(1559386),
  paddock: px(1639729),
  crowd: px(11341144),
  champagne: px(1059180),
  tree: px(11341108),
  eventing: px(2123375),
  device: px(27305774),
  women: px(7882582),
  // extra distinct racing/people frames for variety
  gallop2: px(3280908),
  gallop3: px(2123375),
  crowd2: px(18913040),
  celebrate2: px(11341116),
  field: px(635499),
  portrait4: px(5454159),
  portrait5: px(6640385),
  winnersCircle: px(12995066),
  stable: px(14132978),
  trophy: px(20157010),
};
