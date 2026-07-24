// ---------------------------------------------------------------------------
// Magazine Builder v2 — content-aware leaf sizing (the solver's measure hook).
//
// solveLayout is pure geometry: by default every track is sized by fr-weight.
// This module builds the optional `measureLeaf` function it accepts, which lets
// a leaf marked sizing:'content' claim exactly the space its TEXT needs — so a
// headline row is as tall as its (wrapped) words and the remaining height flows
// to the body column, instead of the designer guessing fractions.
//
// The size returned is measured at the role's CEILING font size (roleScale), in
// the leaf's own cross-axis width, using the same measured metrics the composer
// fits against (fontMetrics/layout). Because the box is sized to the copy at max
// size, composeFromSolved's fitFontSize then keeps that size rather than
// shrinking — the box and the type always agree, so content-sized text does not
// overflow. Non-text leaves and empty copy return null → weight-based sizing.
//
// Pure + server-safe: arithmetic over measured metrics, no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { estimateTextHeight } from './layout.js';
import { measureRunWidthPx } from './fontMetrics.js';
import { roleStyle, TEXT_ROLES } from './roleScale.js';
import type { GenFonts } from './templates.js';
import type { ResolvedContent } from './composeFromSolved.js';
import type { MeasureFn } from './solveLayout.js';

/**
 * Build the content-aware measure function to pass to `solveLayout({ measureLeaf })`.
 * `content` maps a leaf's contentRef → its copy; `fonts` is the plan's pairing.
 */
export function makeMeasureLeaf(content: ResolvedContent, fonts: GenFonts): MeasureFn {
  return ({ leaf, axis, crossLen }) => {
    if (!TEXT_ROLES.has(leaf.role)) return null; // image/shape/qr/icon → fr
    const text = content[leaf.contentRef ?? '']?.text ?? '';
    if (!text.trim()) return null; // nothing to measure → fr
    const s = roleStyle(leaf.role);
    const fontFamily = (leaf.fontRef ?? s.fontRef) === 'display' ? fonts.display : fonts.body;
    const fontWeight = leaf.weightHint ?? s.fontWeight;
    if (axis === 'col') {
      // Column track: main axis is height → the wrapped height of the copy at
      // its ceiling size, in this track's width.
      return estimateTextHeight({ text, fontSize: s.maxFontSize, boxWidthPx: crossLen, lineHeight: s.lineHeight, fontFamily, fontWeight });
    }
    // Row track: main axis is width → the single-line width of the copy at its
    // ceiling size (a short label/kicker/figure hugging its text).
    return measureRunWidthPx(text, fontFamily, fontWeight, s.maxFontSize);
  };
}
