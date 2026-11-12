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
import { roleStyle, TEXT_ROLES, ptToPx } from './roleScale.js';
import { planDropCap } from './dropCap.js';
import type { GenFonts } from './templates.js';
import type { ResolvedContent } from './composeFromSolved.js';
import type { MeasureFn } from './solveLayout.js';
import type { LeafNode } from './layoutSpec.js';

/** The copy a text leaf prints: its own ornament glyph, else its resolved content. */
export function leafText(leaf: LeafNode, content: ResolvedContent): string {
  return leaf.glyph ?? content[leaf.contentRef ?? '']?.text ?? '';
}

/**
 * Height of a text leaf's copy at `fontSize` in a `boxW` column — a drop-cap paragraph
 * measured as the composer will build it (dropCap.ts), anything else as plain wrapped
 * lines. `safety` is the WRAP_SAFETY share of the width to wrap at.
 */
export function leafTextHeight(leaf: LeafNode, text: string, fontSize: number, boxW: number, fonts: GenFonts, safety = 1): number {
  const s = roleStyle(leaf.role);
  const fontFamily = (leaf.fontRef ?? s.fontRef) === 'display' ? fonts.display : fonts.body;
  const fontWeight = leaf.weightHint ?? s.fontWeight;
  const lineHeight = leaf.lineHeight ?? s.lineHeight;
  const letterSpacing = leaf.tracking;
  const textTransform = leaf.caps ? 'uppercase' : undefined;
  if (leaf.dropCap) {
    const plan = planDropCap({
      text, fontSize, lineHeight, boxW, bodyFamily: fontFamily, bodyWeight: fontWeight, capFamily: fonts.display, safety,
      ...(letterSpacing !== undefined ? { letterSpacing } : {}),
      ...(textTransform ? { textTransform } : {}),
    });
    if (plan) return plan.totalH;
  }
  return estimateTextHeight({
    text, fontSize, boxWidthPx: boxW * safety, lineHeight, fontFamily, fontWeight,
    ...(letterSpacing !== undefined ? { letterSpacing } : {}),
    ...(textTransform ? { textTransform } : {}),
  });
}

/**
 * Build the content-aware measure function to pass to `solveLayout({ measureLeaf })`.
 * `content` maps a leaf's contentRef → its copy; `fonts` is the plan's pairing.
 */
export function makeMeasureLeaf(content: ResolvedContent, fonts: GenFonts): MeasureFn {
  return ({ leaf, axis, crossLen }) => {
    if (!TEXT_ROLES.has(leaf.role)) return null; // image/shape/qr/icon → fr
    const text = leafText(leaf, content);
    if (!text.trim()) return null; // nothing to measure → fr
    const s = roleStyle(leaf.role);
    const fontFamily = (leaf.fontRef ?? s.fontRef) === 'display' ? fonts.display : fonts.body;
    const fontWeight = leaf.weightHint ?? s.fontWeight;
    // Measure at the size the composer will actually SET — the art-director's own
    // `fontPt` when it named one, the role ceiling otherwise. Measuring at the role
    // ceiling regardless would break this module's whole promise (that the box and the
    // type agree) the moment the AI asked for a different size: a leaf asking for 28pt
    // would be given the room a 46pt headline needs.
    const fontSize = leaf.fontPt !== undefined ? ptToPx(leaf.fontPt) : s.maxFontSize;
    const lineHeight = leaf.lineHeight ?? s.lineHeight;
    const letterSpacing = leaf.tracking;
    const textTransform = leaf.caps ? 'uppercase' : undefined;
    if (axis === 'col') {
      // Column track: main axis is height → the wrapped height of the copy at
      // its set size, in this track's width.
      //
      // Wrap at WRAP_SAFETY of the real width. Boxes are now hugged to this
      // measurement (balanceLayout) and generated text renders with overflow
      // hidden, so a browser that wraps one word earlier than the metrics predict
      // (kerning, sub-pixel layout, a late web font) would CLIP the last line — the
      // after-render preview of "Stars in the Making" lost "Making". Measuring a
      // touch narrow only adds a line when a line is borderline, instead of padding
      // every box (which would bring the dead bands back).
      //
      // A drop-cap paragraph is measured as the composer builds it: three short lines
      // beside the cap, then the rest full width (dropCap.ts).
      return leafTextHeight(leaf, text, fontSize, crossLen, fonts, WRAP_SAFETY);
    }
    // Row track: main axis is width → the single-line width of the copy at its set
    // size (a short label/kicker/figure hugging its text). Tracking widens every gap,
    // so it has to be added back: the metrics measure glyphs, not letter-spacing.
    const run = measureRunWidthPx(textTransform ? text.toUpperCase() : text, fontFamily, fontWeight, fontSize);
    const width = letterSpacing ? run + Math.max(0, text.length - 1) * letterSpacing : run;
    // Same reasoning as WRAP_SAFETY: a hugged single-line label must not wrap.
    return width / WRAP_SAFETY;
  };
}

/** Measure text as if its box were this fraction of its real width — a margin
 *  against the browser wrapping a borderline line earlier than the metrics. */
export const WRAP_SAFETY = 0.97;

/**
 * Stand-in copy of a typical length per role, for the solve that happens BEFORE any copy
 * exists (the drafting pre-solve that measures each slot's character budget).
 *
 * Without it that solve had no measurer, so every `sizing:'content'` track fell back to a
 * weight share: a kicker, a headline and a deck each took a quarter of the page, the body
 * column got the last quarter, and the copywriter was told the body "holds about 300
 * characters" on a page whose finished body column holds 1,400. Prose roles get no
 * stand-in on purpose — they are the flexible tracks, and their budget is whatever the
 * display copy leaves them.
 */
const DRAFT_STAND_IN: Record<string, string> = {
  headline: 'The Season That Changed Everything',
  figure: '4.8%',
  kicker: 'Owner stories',
  subhead: 'One sentence of standfirst that sets up the story and tells the reader why it matters now.',
  byline: 'Words by Aroha Smith',
  caption: 'A caption names who and where in a single line under the photograph.',
  label: 'Group 1 wins this season',
  entry: 'Short title: a one-line description of the item in the list.',
  pullquote: 'You learn more from one wet morning on the gallops than from a whole season of watching.',
};

/** A measurer for the pre-copy solve: display roles at a typical length, prose flexible. */
export function draftingMeasure(fonts: GenFonts): MeasureFn {
  return (args) => {
    if (args.leaf.role === 'body') return null;
    const stand = args.leaf.glyph ?? DRAFT_STAND_IN[args.leaf.role];
    if (!stand) return null;
    return makeMeasureLeaf({ [args.leaf.contentRef ?? '']: { text: stand } }, fonts)(args);
  };
}
