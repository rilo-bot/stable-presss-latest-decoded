/**
 * Text-style presets for the NZTROF bulletin design.
 *
 * These encode the magazine's "house style" — the exact fonts / sizes / colours
 * the design ships with — so every text region starts pre-styled and the
 * inspector shows the real current values when an element is selected.
 */

import type { TextStyle } from '@/types/magazine';

// ── Brand colours (hex) ─────────────────────────────────────────────
export const NAVY = '#0a2342';
export const NAVY_SOFT = '#13315c';
export const GOLD = '#c5972f';
export const GOLD_SOFT = '#caa54a';
export const GOLD_DEEP = '#8a6b1e';
export const CREAM = '#f6f1e6';
export const INK = '#2b2b2b';
export const INK_SOFT = '#4a4a4a';
export const WHITE = '#ffffff';
export const MAROON = '#5a2a3a';
export const FOREST = '#1a3322';

const BASE: TextStyle = {
  fontFamily: 'source-sans',
  fontSize: 13,
  fontWeight: 400,
  italic: false,
  underline: false,
  color: INK,
  align: 'left',
  lineHeight: 1.45,
  letterSpacing: 0,
  textTransform: 'none',
};

export function st(overrides: Partial<TextStyle>): TextStyle {
  return { ...BASE, ...overrides };
}

// ── Named presets ───────────────────────────────────────────────────
export const PRESET = {
  /** Big serif headline, navy. */
  displayNavy: st({ fontFamily: 'playfair', fontSize: 44, fontWeight: 800, color: NAVY, lineHeight: 1.02 }),
  /** Big serif headline, gold (second line). */
  displayGold: st({ fontFamily: 'playfair', fontSize: 44, fontWeight: 800, color: GOLD, lineHeight: 1.02 }),
  /** Section headline. */
  headlineNavy: st({ fontFamily: 'playfair', fontSize: 30, fontWeight: 700, color: NAVY, lineHeight: 1.06 }),
  headlineGold: st({ fontFamily: 'playfair', fontSize: 30, fontWeight: 700, color: GOLD, lineHeight: 1.06 }),
  headlineWhite: st({ fontFamily: 'playfair', fontSize: 30, fontWeight: 700, color: WHITE, lineHeight: 1.06 }),
  subhead: st({ fontFamily: 'playfair', fontSize: 18, fontWeight: 700, color: NAVY, lineHeight: 1.15 }),
  /** Gold uppercase kicker / eyebrow. */
  kickerGold: st({ fontFamily: 'oswald', fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1.4, textTransform: 'uppercase' }),
  kickerWhite: st({ fontFamily: 'oswald', fontSize: 11, fontWeight: 700, color: WHITE, letterSpacing: 1.4, textTransform: 'uppercase' }),
  kickerNavy: st({ fontFamily: 'oswald', fontSize: 11, fontWeight: 700, color: NAVY, letterSpacing: 1.4, textTransform: 'uppercase' }),
  /** Section band label (on navy). */
  bandLabel: st({ fontFamily: 'oswald', fontSize: 12, fontWeight: 600, color: WHITE, letterSpacing: 1.6, textTransform: 'uppercase' }),
  /** Body copy. */
  body: st({ fontFamily: 'pt-serif', fontSize: 12.5, color: INK, lineHeight: 1.5 }),
  bodySmall: st({ fontFamily: 'pt-serif', fontSize: 11, color: INK_SOFT, lineHeight: 1.45 }),
  bodySans: st({ fontFamily: 'source-sans', fontSize: 12, color: INK, lineHeight: 1.45 }),
  /** Script signature / accent. */
  script: st({ fontFamily: 'dancing-script', fontSize: 26, fontWeight: 600, color: NAVY }),
  scriptGold: st({ fontFamily: 'dancing-script', fontSize: 22, fontWeight: 600, color: GOLD_DEEP }),
  /** Pull quote. */
  pullQuote: st({ fontFamily: 'playfair', fontSize: 17, fontWeight: 600, italic: true, color: NAVY, lineHeight: 1.3 }),
  pullQuoteWhite: st({ fontFamily: 'playfair', fontSize: 17, fontWeight: 600, italic: true, color: WHITE, lineHeight: 1.3 }),
  /** Stat figures. */
  statBig: st({ fontFamily: 'playfair', fontSize: 24, fontWeight: 800, color: GOLD }),
  statLabel: st({ fontFamily: 'oswald', fontSize: 9, fontWeight: 600, color: NAVY, letterSpacing: 1, textTransform: 'uppercase' }),
  /** Names / bylines. */
  name: st({ fontFamily: 'oswald', fontSize: 13, fontWeight: 600, color: NAVY, letterSpacing: 0.4 }),
  role: st({ fontFamily: 'source-sans', fontSize: 10.5, color: GOLD_DEEP, fontWeight: 600 }),
  meta: st({ fontFamily: 'source-sans', fontSize: 10, color: INK_SOFT }),
  caption: st({ fontFamily: 'source-sans', fontSize: 9.5, italic: true, color: INK_SOFT }),
  /** Footer band text (on navy). */
  footer: st({ fontFamily: 'oswald', fontSize: 9.5, fontWeight: 500, color: GOLD_SOFT, letterSpacing: 1.2, textTransform: 'uppercase' }),
  /** QR helper caption. */
  qrLabel: st({ fontFamily: 'oswald', fontSize: 8.5, fontWeight: 600, color: NAVY, letterSpacing: 0.8, textTransform: 'uppercase' }),
  /** Table cells. */
  th: st({ fontFamily: 'oswald', fontSize: 9, fontWeight: 600, color: WHITE, letterSpacing: 0.8, textTransform: 'uppercase' }),
  td: st({ fontFamily: 'source-sans', fontSize: 10.5, color: INK }),
  tdBold: st({ fontFamily: 'source-sans', fontSize: 10.5, color: NAVY, fontWeight: 700 }),
};
