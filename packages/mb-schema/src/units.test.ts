import { describe, expect, it } from 'vitest';
import { A4_PORTRAIT } from './defaults.js';
import {
  DPI,
  formatMm,
  formatPt,
  mmToPx,
  parseMm,
  parsePt,
  ptToPx,
  pxToMm,
  pxToPt,
} from './units.js';

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
    expect(formatPt(ptToPx(11.44))).toBe('11.4');
  });
});

describe('units — read and write are separate (QA-09)', () => {
  it('parses what a person typed, at full precision', () => {
    // 10.5pt is an ordinary body size. TXT-04 requires the typed route and the
    // list route to produce identical results, so half points must survive.
    expect(parsePt('10.5')).toBeCloseTo(ptToPx(10.5), 10);
    expect(parseMm('15')).toBeCloseTo(mmToPx(15), 10);
  });

  it('shows half points rather than rounding them away', () => {
    expect(formatPt(ptToPx(10.5))).toBe('10.5');
    expect(formatPt(ptToPx(12))).toBe('12');
  });

  it('returns null for a blank or unparseable field, never a silent zero', () => {
    // A blank field and a typo both mean "no value yet", not "move to the
    // origin". The caller decides what to tell the user (GL-12).
    expect(parseMm('')).toBeNull();
    expect(parseMm('   ')).toBeNull();
    expect(parseMm('abc')).toBeNull();
    expect(parsePt('12mm')).toBeNull();
  });

  it('round-trips a typed value without drift', () => {
    const typed = '15.1';
    const px = parseMm(typed);
    expect(px).not.toBeNull();
    expect(formatMm(px ?? 0)).toBe(typed);
  });
});
