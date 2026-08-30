import { describe, expect, it } from 'vitest';
import type { Magazine, Page, Spread } from './magazine.js';
import type { Item, Photo, Shape, TextBox } from './items.js';
import type { Story } from './text.js';
import type { AssetRef } from './assets.js';
import { A4_PORTRAIT, DEFAULT_LOOK_ID, createBlankMagazine, createPage } from './defaults.js';
import { type ValidationCode, validateMagazine, validateStructure } from './validation.js';

// ---------------------------------------------------------------------------
// Fixtures. Order keys are hand-written and lexicographically ordered — 'a0' <
// 'a1' < 'a2' — which is what `fractional-indexing` produces.
// ---------------------------------------------------------------------------

function blank(): Magazine {
  let n = 0;
  return createBlankMagazine({
    newId: () => {
      n += 1;
      return `id-${n}`;
    },
    now: '2026-08-30T00:00:00.000Z',
    ownerId: 'owner-1',
    title: 'Test',
    slug: 'test',
  });
}

function textBox(id: string, order: string, storyId: string, chain: Partial<TextBox> = {}): TextBox {
  return {
    id,
    order,
    frame: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    opacity: 1,
    locked: false,
    type: 'text',
    storyId,
    nextBoxId: null,
    prevBoxId: null,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    columns: { count: 1, gutter: 0 },
    verticalAlign: 'top',
    overflow: 'warn',
    minFontScale: 0.7,
    ...chain,
  };
}

function photo(id: string, order: string, assetId: string): Photo {
  return {
    id,
    order,
    frame: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    opacity: 1,
    locked: false,
    type: 'photo',
    assetId,
    fit: { mode: 'fill', sourceRect: null },
    flipH: false,
    flipV: false,
    cornerRadius: 0,
    textWrap: null,
  };
}

function shape(id: string, order: string): Shape {
  return {
    id,
    order,
    frame: { x: 0, y: 0, w: 100, h: 100 },
    rotation: 0,
    opacity: 1,
    locked: false,
    type: 'shape',
    shape: 'rect',
    cornerRadius: 0,
    fill: '#ff0000',
    stroke: null,
    textWrap: null,
  };
}

function story(id: string): Story {
  return {
    id,
    paragraphs: [
      {
        id: `${id}-p1`,
        order: 'a0',
        lookId: DEFAULT_LOOK_ID.body,
        overrides: {},
        runs: [{ text: 'Hello', overrides: {} }],
        listType: 'none',
      },
    ],
  };
}

function asset(id: string): AssetRef {
  return {
    id,
    hash: 'abc',
    source: 'upload',
    mimeType: 'image/jpeg',
    intrinsic: { w: 800, h: 600 },
    originalFilename: 'photo.jpg',
    credit: null,
    storageKey: 'public/magazine-builder/m/media/abc.jpg',
  };
}

/** Replace the cover page's items. */
function withItems(magazine: Magazine, items: Item[]): Magazine {
  const page = magazine.spreads[0]?.pages[0];
  if (!page) throw new Error('fixture has no cover page');
  page.items = items;
  return magazine;
}

function codes(errors: ReadonlyArray<{ code: ValidationCode }>): ValidationCode[] {
  return errors.map((e) => e.code);
}

/** An interior spread of two pages, for the invariant 11 cases. */
function interior(id: string): Spread {
  const page = (suffix: string): Page =>
    createPage({ id: `${id}-${suffix}`, width: A4_PORTRAIT.width, height: A4_PORTRAIT.height });
  return { id, pages: [page('l'), page('r')] };
}

function cover(id: string): Spread {
  return {
    id,
    pages: [createPage({ id: `${id}-p`, width: A4_PORTRAIT.width, height: A4_PORTRAIT.height })],
  };
}

// ---------------------------------------------------------------------------

describe('a valid magazine', () => {
  it('reports nothing', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    m.assets['a1'] = asset('a1');
    withItems(m, [textBox('t1', 'a0', 's1'), photo('p1', 'a1', 'a1'), shape('sh1', 'a2')]);

    expect(validateStructure(m)).toEqual([]);
    expect(validateMagazine(m)).toEqual([]);
  });
});

describe('invariant 1 — story references resolve', () => {
  it('flags a text box pointing at a story that does not exist', () => {
    const m = withItems(blank(), [textBox('t1', 'a0', 'missing')]);
    expect(codes(validateStructure(m))).toContain('story-missing');
  });
});

describe('invariant 2 — thread links are symmetric', () => {
  it('flags a dangling nextBoxId', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    withItems(m, [textBox('t1', 'a0', 's1', { nextBoxId: 'nope' })]);
    expect(codes(validateStructure(m))).toContain('thread-dangling');
  });

  it('flags a nextBoxId naming something that is not a text box', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    withItems(m, [textBox('t1', 'a0', 's1', { nextBoxId: 'sh1' }), shape('sh1', 'a1')]);
    expect(codes(validateStructure(m))).toContain('thread-not-a-textbox');
  });

  it('flags a one-sided link', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    withItems(m, [
      textBox('t1', 'a0', 's1', { nextBoxId: 't2' }),
      textBox('t2', 'a1', 's1'), // prevBoxId left null
    ]);
    expect(codes(validateStructure(m))).toContain('thread-asymmetric');
  });

  it('accepts a correctly linked pair', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    withItems(m, [
      textBox('t1', 'a0', 's1', { nextBoxId: 't2' }),
      textBox('t2', 'a1', 's1', { prevBoxId: 't1' }),
    ]);
    expect(validateStructure(m)).toEqual([]);
  });
});

describe('invariant 3 — chains are acyclic and share one story', () => {
  it('flags a cycle', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    // t1 -> t2 -> t1. Neither has a null prev, so this is also headless.
    withItems(m, [
      textBox('t1', 'a0', 's1', { nextBoxId: 't2', prevBoxId: 't2' }),
      textBox('t2', 'a1', 's1', { nextBoxId: 't1', prevBoxId: 't1' }),
    ]);
    expect(codes(validateStructure(m))).toContain('thread-headless');
  });

  it('flags boxes in one chain showing different stories', () => {
    const m = blank();
    m.stories['s1'] = story('s1');
    m.stories['s2'] = story('s2');
    withItems(m, [
      textBox('t1', 'a0', 's1', { nextBoxId: 't2' }),
      textBox('t2', 'a1', 's2', { prevBoxId: 't1' }),
    ]);
    expect(codes(validateStructure(m))).toContain('thread-story-mismatch');
  });
});

describe('invariant 5 and 6 — looks and assets resolve', () => {
  it('flags a paragraph pointing at a missing look', () => {
    const m = blank();
    const s = story('s1');
    const first = s.paragraphs[0];
    if (first) first.lookId = 'no-such-look';
    m.stories['s1'] = s;
    withItems(m, [textBox('t1', 'a0', 's1')]);
    expect(codes(validateStructure(m))).toContain('look-missing');
  });

  it('flags a photo pointing at a missing asset', () => {
    const m = withItems(blank(), [photo('p1', 'a0', 'no-such-asset')]);
    expect(codes(validateStructure(m))).toContain('asset-missing');
  });
});

describe('invariant 7 — item ids are unique, including inside groups', () => {
  it('flags a duplicate across a page and a group', () => {
    const m = withItems(blank(), [
      shape('dup', 'a0'),
      {
        id: 'g1',
        order: 'a1',
        frame: { x: 0, y: 0, w: 10, h: 10 },
        rotation: 0,
        opacity: 1,
        locked: false,
        type: 'group',
        children: [shape('dup', 'a0')],
      },
    ]);
    expect(codes(validateStructure(m))).toContain('duplicate-item-id');
  });
});

describe('invariant 10 — order keys', () => {
  it('flags a duplicate key within one collection', () => {
    const m = withItems(blank(), [shape('s1', 'a0'), shape('s2', 'a0')]);
    expect(codes(validateStructure(m))).toContain('duplicate-order-key');
  });

  it('flags an array that is not sorted by its keys', () => {
    const m = withItems(blank(), [shape('s1', 'a5'), shape('s2', 'a1')]);
    expect(codes(validateStructure(m))).toContain('collection-unsorted');
  });

  it('reaches into groups', () => {
    const m = withItems(blank(), [
      {
        id: 'g1',
        order: 'a0',
        frame: { x: 0, y: 0, w: 10, h: 10 },
        rotation: 0,
        opacity: 1,
        locked: false,
        type: 'group',
        children: [shape('c1', 'a5'), shape('c2', 'a1')],
      },
    ]);
    expect(codes(validateStructure(m))).toContain('collection-unsorted');
  });

  it('reaches into story paragraphs', () => {
    const m = blank();
    const s = story('s1');
    s.paragraphs = [
      { ...s.paragraphs[0]!, id: 'p1', order: 'a5' },
      { ...s.paragraphs[0]!, id: 'p2', order: 'a1' },
    ];
    m.stories['s1'] = s;
    withItems(m, [textBox('t1', 'a0', 's1')]);
    expect(codes(validateStructure(m))).toContain('collection-unsorted');
  });
});

describe('invariant 8 — frames are positive', () => {
  it('is a full-pass check, not a structural one', () => {
    const m = withItems(blank(), [{ ...shape('s1', 'a0'), frame: { x: 0, y: 0, w: 0, h: 10 } }]);
    expect(codes(validateStructure(m))).not.toContain('frame-not-positive');
    expect(codes(validateMagazine(m))).toContain('frame-not-positive');
  });
});

describe('invariants 9, 11, 12 — spread page counts', () => {
  it('flags a front cover holding two pages', () => {
    const m = blank();
    m.spreads = [interior('sp1'), cover('sp2')];
    expect(codes(validateMagazine(m))).toContain('cover-not-single');
  });

  it('accepts cover, interiors, back cover', () => {
    const m = blank();
    m.spreads = [cover('c1'), interior('i1'), interior('i2'), cover('c2')];
    expect(validateMagazine(m)).toEqual([]);
  });

  it('accepts a final interior spread holding one page', () => {
    const m = blank();
    m.spreads = [cover('c1'), interior('i1'), cover('odd'), cover('c2')];
    expect(validateMagazine(m)).toEqual([]);
  });

  it('flags a single-page interior that is not the last one', () => {
    const m = blank();
    m.spreads = [cover('c1'), cover('odd'), interior('i1'), cover('c2')];
    expect(codes(validateMagazine(m))).toContain('spread-page-count');
  });

  it('requires every spread to hold one page when facing pages is off', () => {
    const m = blank();
    m.pageSetup.facingPages = false;
    m.spreads = [cover('c1'), interior('i1')];
    expect(codes(validateMagazine(m))).toContain('facing-pages-off');
  });
});
