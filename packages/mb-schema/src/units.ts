// ---------------------------------------------------------------------------
// The UI boundary — pixels in, millimetres and points out.
//
// The document stores pixels (ADR-002). Users never see them: "px" and "DPI"
// are jargon under GL-08, and someone laying out a newsletter thinks in the
// units a word processor and a ruler use.
//
//   position, size, margins, spacing  ->  millimetres
//   text size, outline thickness      ->  points
//
// READ AND WRITE ARE SEPARATE, DELIBERATELY.
//
//   format*  produces a string for a person to look at. It ROUNDS, so it loses
//            information. It is never a source for a write.
//   parse*   turns what a person typed back into pixels. Full precision.
//
// The distinction exists because a controlled input both renders and reads, so
// the ordinary way to wire an inspector would otherwise be a lossy round trip:
// 88.9px displays as "15.1" mm, and writing that back gives 89.17px — a drift
// of 0.27px per inspect-and-commit cycle, invisible once and obvious after a
// user nudges the same box a dozen times.
//
// A panel holds the user's TEXT as its input state and calls parse* on commit.
// It re-derives from pixels only when the selection changes.
// ---------------------------------------------------------------------------

import type { Px } from './primitives.js';

/** Page-canonical space is 150 DPI. A4 is 1240 x 1754 at this density. */
export const DPI = 150;

/** Millimetres in an inch. */
const MM_PER_INCH = 25.4;

/** Points in an inch — the definition of a point. */
const PT_PER_INCH = 72;

export const PX_PER_MM: number = DPI / MM_PER_INCH;
export const PX_PER_PT: number = DPI / PT_PER_INCH;

export function pxToMm(px: Px): number {
  return px / PX_PER_MM;
}

export function mmToPx(mm: number): Px {
  return mm * PX_PER_MM;
}

export function pxToPt(px: Px): number {
  return px / PX_PER_PT;
}

export function ptToPx(pt: number): Px {
  return pt * PX_PER_PT;
}

/** Decimal places shown for a millimetre value. Never show 47.3821. */
const MM_DECIMALS = 1;

/**
 * Decimal places shown for a point value.
 *
 * One, not zero. Half-point sizes are ordinary in body text — 10.5pt is a
 * common setting — and TXT-04 requires a list, a typed value and the
 * larger/smaller buttons to produce identical results for the same value.
 * Rounding to whole points would make typing 10.5 show 11, which fails that
 * criterion outright.
 */
const PT_DECIMALS = 1;

/** Drop a trailing `.0` so whole values read as whole values. */
function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

/**
 * A millimetre value as the user should see it.
 *
 * DISPLAY ONLY. Rounding lives here rather than in each panel so two lanes
 * cannot show the same measurement to different precision — and so there is one
 * place to point at when explaining why this must not be read back.
 */
export function formatMm(px: Px): string {
  return trimZeros(pxToMm(px).toFixed(MM_DECIMALS));
}

/** A point value as the user should see it. DISPLAY ONLY — see formatMm. */
export function formatPt(px: Px): string {
  return trimZeros(pxToPt(px).toFixed(PT_DECIMALS));
}

/**
 * What a person typed, in millimetres, as pixels.
 *
 * Returns null for anything that is not a finite number, so the caller decides
 * what to tell the user (GL-12) rather than receiving a silent zero. A blank
 * field and a typo are both "no value yet", not "move this to the origin".
 */
export function parseMm(input: string): Px | null {
  const value = Number(input.trim());
  if (input.trim() === '' || !Number.isFinite(value)) return null;
  return mmToPx(value);
}

/** What a person typed, in points, as pixels. See parseMm. */
export function parsePt(input: string): Px | null {
  const value = Number(input.trim());
  if (input.trim() === '' || !Number.isFinite(value)) return null;
  return ptToPx(value);
}
