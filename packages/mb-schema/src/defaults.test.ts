import { describe, expect, it } from 'vitest';
import {
  A4_PORTRAIT,
  DEFAULT_LOOK_ID,
  createBlankMagazine,
  type BlankMagazineOptions,
} from './defaults.js';
import { validateMagazine, validateStructure } from './validation.js';
import { pxToMm } from './units.js';

/** A deterministic id source, so two blanks are comparable. */
function counter(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function options(overrides: Partial<BlankMagazineOptions> = {}): BlankMagazineOptions {
  return {
    newId: counter(),
    now: '2026-08-30T00:00:00.000Z',
    ownerId: 'owner-1',
    title: 'Garden Club News',
    slug: 'garden-club-news',
    ...overrides,
  };
}

describe('createBlankMagazine', () => {
  it('produces a magazine with no invariant errors', () => {
    const magazine = createBlankMagazine(options());
    expect(validateStructure(magazine)).toEqual([]);
    expect(validateMagazine(magazine)).toEqual([]);
  });

  it('is one spread holding one page — the front cover', () => {
    const magazine = createBlankMagazine(options());
    expect(magazine.spreads).toHaveLength(1);
    expect(magazine.spreads[0]?.pages).toHaveLength(1);
    expect(magazine.spreads[0]?.pages[0]?.items).toEqual([]);
  });

  it('is reproducible from the same injected id source', () => {
    // The undo property test and the headless build test both deep-compare whole
    // documents, which is impossible against a random id source.
    const a = createBlankMagazine(options());
    const b = createBlankMagazine(options());
    expect(a).toEqual(b);
  });

  it('defaults to A4 portrait, and the page carries its own size', () => {
    const magazine = createBlankMagazine(options());
    const page = magazine.spreads[0]?.pages[0];
    expect(page?.width).toBe(A4_PORTRAIT.width);
    expect(page?.height).toBe(A4_PORTRAIT.height);
  });

  it('honours an explicit page size on both the setup and the page', () => {
    const a5 = { width: 877, height: 1240 };
    const magazine = createBlankMagazine(options({ pageSize: a5 }));
    expect(magazine.pageSetup.width).toBe(a5.width);
    expect(magazine.spreads[0]?.pages[0]?.width).toBe(a5.width);
  });

  it('ships the two looks TXT-13 names, at stable ids', () => {
    const magazine = createBlankMagazine(options());
    expect(magazine.looks[DEFAULT_LOOK_ID.heading]?.name).toBe('Heading');
    expect(magazine.looks[DEFAULT_LOOK_ID.body]?.name).toBe('Body text');
  });

  it('gives a sensible 15mm margin', () => {
    const magazine = createBlankMagazine(options());
    expect(pxToMm(magazine.pageSetup.margin.top)).toBeCloseTo(15, 6);
  });

  it('validates with facing pages off, where every spread holds one page', () => {
    const magazine = createBlankMagazine(options({ facingPages: false }));
    expect(validateMagazine(magazine)).toEqual([]);
  });
});
