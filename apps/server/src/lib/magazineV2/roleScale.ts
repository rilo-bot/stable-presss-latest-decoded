// ---------------------------------------------------------------------------
// Magazine Builder v2 — the editorial TYPE SCALE (design tokens).
//
// One source of truth for how each leaf role is typeset: its ceiling/floor font
// size, weight, line-height, font pairing slot, alignment and colour token. Used
// by BOTH composeFromSolved (to build the actual text element) and measureLeaf
// (to size a content-driven box to the text it must hold) — so the box a leaf is
// given and the type poured into it always agree.
//
// Font sizes here are CEILINGS at the canonical page scale; fitFontSize only ever
// shrinks from them, so they are never forced to overflow.
//
// These are now DEFAULTS, not the law: a leaf may name its own `fontPt` and the
// art-director's number wins (see composeFromSolved). This table is what a role
// gets when nobody decided — which keeps every existing spec, seed and template
// rendering exactly as before.
//
// Pure data — no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { TextRole } from './model.js';
import { PAGE_DPI } from './config.js';
import type { ColorRef, FontRef, TextAlignToken } from './layoutSpec.js';

/**
 * Points ↔ page pixels. The page is rendered at 150 DPI, so 1pt (1/72 in) is
 * 150/72 ≈ 2.083px and `pt = px × 0.48`. Every size the art-director names is in
 * POINTS, because that is the only unit in which "too small to read on paper" means
 * anything — a 14px body looks reasonable in a code review and prints at 6.7pt.
 */
export const ptToPx = (pt: number): number => (pt * PAGE_DPI) / 72;
export const pxToPt = (px: number): number => (px * 72) / PAGE_DPI;

export interface RoleStyle {
  maxFontSize: number;
  minFontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  lineHeight: number;
  fontRef: FontRef;
  align: TextAlignToken;
  colorRef: ColorRef;
  textRole: TextRole; // the element model's text role this DSL role maps to
}

export const ROLE_SCALE: Record<string, RoleStyle> = {
  headline:  { maxFontSize: 96, minFontSize: 40, fontWeight: 800, lineHeight: 1.05, fontRef: 'display', align: 'left',   colorRef: 'text', textRole: 'headline' },
  figure:    { maxFontSize: 88, minFontSize: 34, fontWeight: 800, lineHeight: 1.0,  fontRef: 'display', align: 'left',   colorRef: 'text', textRole: 'headline' },
  pullquote: { maxFontSize: 60, minFontSize: 28, fontWeight: 700, lineHeight: 1.22, fontRef: 'display', align: 'center', colorRef: 'text', textRole: 'pullquote' },
  subhead:   { maxFontSize: 34, minFontSize: 18, fontWeight: 400, lineHeight: 1.3,  fontRef: 'body',    align: 'left',   colorRef: 'text', textRole: 'subhead' },
  entry:     { maxFontSize: 30, minFontSize: 16, fontWeight: 500, lineHeight: 1.3,  fontRef: 'body',    align: 'left',   colorRef: 'text', textRole: 'body' },
  kicker:    { maxFontSize: 26, minFontSize: 14, fontWeight: 700, lineHeight: 1.2,  fontRef: 'body',    align: 'left',   colorRef: 'accent', textRole: 'subhead' },
  label:     { maxFontSize: 26, minFontSize: 14, fontWeight: 500, lineHeight: 1.25, fontRef: 'body',    align: 'left',   colorRef: 'text', textRole: 'caption' },
  byline:    { maxFontSize: 22, minFontSize: 13, fontWeight: 700, lineHeight: 1.2,  fontRef: 'body',    align: 'left',   colorRef: 'primary', textRole: 'byline' },
  body:      { maxFontSize: 24, minFontSize: 14, fontWeight: 400, lineHeight: 1.5,  fontRef: 'body',    align: 'left',   colorRef: 'text', textRole: 'body' },
  caption:   { maxFontSize: 19, minFontSize: 12, fontWeight: 400, lineHeight: 1.3,  fontRef: 'body',    align: 'left',   colorRef: 'secondary', textRole: 'caption' },
};

/** Which leaf roles are text (have a type-scale entry). */
export const TEXT_ROLES = new Set(Object.keys(ROLE_SCALE));

/** The style for a role, defaulting to `body` for any non-text/unknown role. */
export function roleStyle(role: string): RoleStyle {
  return ROLE_SCALE[role] ?? ROLE_SCALE.body!;
}
