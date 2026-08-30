import { describe, expect, it } from 'vitest';
import { A4_PORTRAIT } from './defaults.js';
import { DPI, formatMm, formatPt, mmToPx, ptToPx, pxToMm, pxToPt } from './units.js';

describe('units', () => {
  it('uses the canonical 150 DPI page space', () => {
    expect(DPI).toBe(150);
  });

  it('round-trips millimetres', () => {
    for (const mm of [0, 1, 15, 210, 297]) {
      expect(pxToMm(mmToPx(mm))).toBeCloseTo(mm, 10);
    }
  });

  it('round-trips points', () => {
    for (const pt of [0, 6, 11, 24, 72]) {
      expect(pxToPt(ptToPx(pt))).toBeCloseTo(pt, 10);
    }
  });

  it('agrees with the real dimensions of A4', () => {
    // A4 is 210 x 297 mm. The canonical page is that page at 150 DPI, so the
    // conversion and the constant have to describe the same sheet of paper — if
    // they ever disagree, printed output is the wrong size.
    expect(pxToMm(A4_PORTRAIT.width)).toBeCloseTo(210, 0);
    expect(pxToMm(A4_PORTRAIT.height)).toBeCloseTo(297, 0);
  });

  it('converts a point to the expected pixel size', () => {
    // 72pt is one inch, which is exactly DPI pixels.
    expect(ptToPx(72)).toBeCloseTo(DPI, 10);
  });

  it('formats for display without showing spurious precision', () => {
    expect(formatMm(mmToPx(47.3821))).toBe('47.4');
    expect(formatPt(ptToPx(11.4))).toBe('11');
  });
});
