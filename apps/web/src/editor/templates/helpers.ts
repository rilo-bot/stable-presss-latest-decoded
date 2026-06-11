/**
 * Content builders for page blueprints (pure data — no React, so the store can
 * import blueprints without pulling in the editor component tree).
 */

import type { TextContent, ImageContent, QrContent, TextStyle, ImageFit } from '@/types/magazine';

export function text(html: string, style: TextStyle): TextContent {
  return { kind: 'text', html, style };
}

export function img(src: string, fit: ImageFit = 'cover', focal?: { x?: number; y?: number }): ImageContent {
  return { kind: 'image', src, fit, focalX: focal?.x ?? 0.5, focalY: focal?.y ?? 0.5 };
}

export function qr(targetUrl: string, fg = '#0a2342'): QrContent {
  return { kind: 'qr', targetUrl, fg, bg: '#ffffff' };
}

// Stable stock imagery — reuses the app's known-good Pexels racing photos so the
// default magazine renders cleanly; every one is swappable in the editor.
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
