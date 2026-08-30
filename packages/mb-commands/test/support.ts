// ---------------------------------------------------------------------------
// Test fixtures. No DOM, no bundler, no environment — that is the point (FWD-02).
// ---------------------------------------------------------------------------

import { generateKeyBetween } from 'fractional-indexing';
import type { Magazine, Photo, Shape, Story, TextBox } from '@rilo/mb-schema';
import {
  A4_PORTRAIT,
  DEFAULT_LOOK_ID,
  DEFAULT_MIN_FONT_SCALE,
  createBlankMagazine,
  createStory,
} from '@rilo/mb-schema';
import {
  clearHistory,
  clearRegistry,
  configureDispatch,
  registerFoundationCommands,
} from '../src/index.js';
import { resetFoundationRegistration } from '../src/commands/index.js';
import type { CommandStore } from '../src/types.js';

/** A deterministic id factory — tests compare whole documents. */
export function idFactory(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

/** The minimum a store has to be for dispatch to work. */
export class TestStore implements CommandStore {
  public current: Magazine;
  public commits = 0;

  constructor(initial: Magazine) {
    this.current = initial;
  }

  commit(next: Magazine): void {
    this.current = next;
    this.commits += 1;
  }
}

export function blankMagazine(newId: () => string = idFactory()): Magazine {
  return createBlankMagazine({
    newId,
    now: '2026-08-30T00:00:00.000Z',
    ownerId: 'owner-1',
    title: 'Test issue',
    slug: 'test-issue',
  });
}

/** Wires dispatch to a fresh store and an empty registry and history. */
export function harness(magazine: Magazine = blankMagazine()): TestStore {
  clearRegistry();
  resetFoundationRegistration();
  clearHistory();
  registerFoundationCommands();

  const store = new TestStore(magazine);
  configureDispatch({ store, validateFully: true });
  return store;
}

export function firstPageId(magazine: Magazine): string {
  const page = magazine.spreads[0]?.pages[0];
  if (page === undefined) throw new Error('fixture has no first page');
  return page.id;
}

/**
 * A story with one paragraph.
 *
 * `createStory` deliberately makes an EMPTY story — Lane 2 adds paragraphs by
 * command — so the fixture builds the first one itself.
 */
export function makeStory(id: string, text: string): Story {
  const story = createStory(id);
  story.paragraphs.push({
    id: `${id}-p1`,
    order: generateKeyBetween(null, null),
    lookId: DEFAULT_LOOK_ID.body,
    overrides: {},
    runs: text.length === 0 ? [] : [{ text, overrides: {} }],
    listType: 'none',
  });
  return story;
}

const BOX_W = 400;
const BOX_H = 300;

export function makeTextBox(id: string, storyId: string, y = 100): Omit<TextBox, 'order'> {
  return {
    id,
    type: 'text',
    storyId,
    nextBoxId: null,
    prevBoxId: null,
    frame: { x: 100, y, w: BOX_W, h: BOX_H },
    rotation: 0,
    opacity: 1,
    locked: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    columns: { count: 1, gutter: 0 },
    verticalAlign: 'top',
    overflow: 'warn',
    minFontScale: DEFAULT_MIN_FONT_SCALE,
  };
}

export function makeShape(id: string, x = 0, y = 0): Omit<Shape, 'order'> {
  return {
    id,
    type: 'shape',
    shape: 'rect',
    cornerRadius: 0,
    fill: '#ff0000',
    stroke: null,
    textWrap: null,
    frame: { x, y, w: 200, h: 100 },
    rotation: 0,
    opacity: 1,
    locked: false,
  };
}

export function makePhoto(id: string, assetId: string): Omit<Photo, 'order'> {
  return {
    id,
    type: 'photo',
    assetId,
    fit: { mode: 'fill', sourceRect: null },
    flipH: false,
    flipV: false,
    cornerRadius: 0,
    textWrap: null,
    frame: { x: 0, y: 0, w: 300, h: 300 },
    rotation: 0,
    opacity: 1,
    locked: false,
  };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export { A4_PORTRAIT, DEFAULT_LOOK_ID };
