// ---------------------------------------------------------------------------
// Undo is exact.
//
// A property test, not a set of examples: fifty pseudo-random commands, then
// fifty undos, and the document has to be deep-equal to the one it started from
// — not equivalent, IDENTICAL, order keys and run structure included.
//
// That strictness is the point. Every "restore an equivalent value" shortcut
// this package could have taken fails here: a reorder that regenerates a key
// between the same neighbours, a text delete undone by inserting plain
// characters, a group resize undone by scaling by the reciprocal. Each produces
// a document that looks right and is not the one the user had.
//
// The generator is seeded, so a failure is reproducible from the seed printed
// with it rather than being a test that fails once a fortnight.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import type { Item, Magazine } from '@rilo/mb-schema';
import { validateMagazine } from '@rilo/mb-schema';
import { canUndo, clearHistory, dispatch, redo, undo } from '../src/index.js';
import type { Command } from '../src/types.js';
import {
  blankMagazine,
  clone,
  firstPageId,
  harness,
  makeShape,
  makeStory,
  makeTextBox,
} from './support.js';

/** mulberry32 — small, seeded, and good enough to shuffle command choices. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMAND_COUNT = 50;
const SEEDS = [1, 7, 42, 1337, 90210];

function pageItems(magazine: Magazine): Item[] {
  return magazine.spreads[0]?.pages[0]?.items ?? [];
}

/**
 * Builds a document with something of every kind to act on.
 *
 * Deliberately includes a nested group: group transforms are where the inverse
 * has the most to get wrong, and a flat page would never exercise them.
 */
function seedDocument(): { magazine: Magazine; store: ReturnType<typeof harness> } {
  const magazine = blankMagazine();
  const store = harness(magazine);
  const pageId = firstPageId(magazine);

  dispatch({
    type: 'item.create',
    payload: {
      pageId,
      item: makeTextBox('box-1', 'story-1'),
      afterId: null,
      beforeId: null,
      story: makeStory('story-1', 'The quick brown fox'),
    },
  });
  dispatch({
    type: 'item.create',
    payload: { pageId, item: makeShape('shape-1', 10, 20), afterId: null, beforeId: null },
  });
  dispatch({
    type: 'item.create',
    payload: { pageId, item: makeShape('shape-2', 300, 400), afterId: null, beforeId: null },
  });
  dispatch({
    type: 'item.create',
    payload: {
      pageId,
      item: {
        id: 'group-1',
        type: 'group',
        children: [
          { ...makeShape('inner-1', 700, 700), order: 'a0' },
          { ...makeShape('inner-2', 800, 900), order: 'a1' },
        ],
        frame: { x: 700, y: 700, w: 300, h: 300 },
        rotation: 0,
        opacity: 1,
        locked: false,
      },
      afterId: null,
      beforeId: null,
    },
  });

  // The setup is not what is under test — without this, "undo everything" walks
  // back past the fixture and the comparison is against a document that never
  // existed at the point it was captured.
  clearHistory();

  return { magazine, store };
}

function nextCommand(pick: () => number, magazine: Magazine): Command | null {
  const items = pageItems(magazine);
  const target = items[Math.floor(pick() * items.length)];
  if (target === undefined) return null;

  const choice = Math.floor(pick() * 8);
  const coord = Math.floor(pick() * 500);
  const size = 20 + Math.floor(pick() * 400);

  switch (choice) {
    case 0:
      return { type: 'item.move', payload: { itemId: target.id, x: coord, y: coord } };
    case 1:
      return {
        type: 'item.resize',
        payload: { itemId: target.id, frame: { x: coord, y: coord, w: size, h: size } },
      };
    case 2:
      return {
        type: 'item.rotate',
        payload: { itemId: target.id, degrees: Math.floor(pick() * 360) },
      };
    case 3:
      return {
        type: 'item.setProps',
        payload: { itemId: target.id, props: { opacity: Math.round(pick() * 100) / 100 } },
      };
    case 4: {
      const other = items[Math.floor(pick() * items.length)];
      return {
        type: 'item.reorder',
        payload: {
          itemId: target.id,
          afterId: other === undefined || other.id === target.id ? null : other.id,
          beforeId: null,
        },
      };
    }
    case 5:
      return {
        type: 'item.setLocked',
        payload: { itemId: target.id, locked: !target.locked },
      };
    case 6:
      return {
        type: 'text.insert',
        payload: {
          paragraphId: 'story-1-p1',
          offset: Math.floor(pick() * 5),
          text: 'abc',
        },
      };
    default:
      return {
        type: 'text.delete',
        payload: { paragraphId: 'story-1-p1', offset: 0, length: 1 + Math.floor(pick() * 3) },
      };
  }
}

describe('undo returns the document it started from', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: ${COMMAND_COUNT} commands, then undo them all`, () => {
      const { store } = seedDocument();
      const start = clone(store.current);

      const pick = random(seed);
      let applied = 0;

      for (let n = 0; n < COMMAND_COUNT; n += 1) {
        const command = nextCommand(pick, store.current);
        if (command === null) continue;
        if (dispatch(command).ok) applied += 1;
      }

      // A run that rejected everything would pass vacuously. The bar is a third
      // rather than a half because the generator locks things and every command
      // aimed at a locked item after that is a legitimate refusal.
      expect(applied).toBeGreaterThan(COMMAND_COUNT / 3);
      expect(validateMagazine(store.current)).toEqual([]);

      while (canUndo()) undo();

      expect(store.current).toEqual(start);
    });
  }

  it('redo replays the same document forward again', () => {
    const { store } = seedDocument();

    const pick = random(2026);
    for (let n = 0; n < COMMAND_COUNT; n += 1) {
      const command = nextCommand(pick, store.current);
      if (command !== null) dispatch(command);
    }

    const afterCommands = clone(store.current);
    let undone = 0;
    while (canUndo()) {
      undo();
      undone += 1;
    }
    for (let n = 0; n < undone; n += 1) redo();

    expect(store.current).toEqual(afterCommands);
  });

  it('a group survives move, resize and turn with no drift', () => {
    const { store } = seedDocument();
    const before = clone(pageItems(store.current).find((i) => i.id === 'group-1'));

    dispatch({ type: 'item.move', payload: { itemId: 'group-1', x: 123, y: 456 } });
    dispatch({
      type: 'item.resize',
      payload: { itemId: 'group-1', frame: { x: 123, y: 456, w: 777, h: 888 } },
    });
    dispatch({ type: 'item.rotate', payload: { itemId: 'group-1', degrees: 37 } });

    undo();
    undo();
    undo();

    expect(pageItems(store.current).find((i) => i.id === 'group-1')).toEqual(before);
  });

  it('threading survives a round trip', () => {
    const magazine = blankMagazine();
    const store = harness(magazine);
    const pageId = firstPageId(magazine);

    for (const [boxId, storyId, y] of [
      ['box-1', 'story-1', 100],
      ['box-2', 'story-2', 600],
    ] as const) {
      dispatch({
        type: 'item.create',
        payload: {
          pageId,
          item: makeTextBox(boxId, storyId, y),
          afterId: null,
          beforeId: null,
          story: makeStory(storyId, `text for ${boxId}`),
        },
      });
    }

    const before = clone(store.current);

    expect(dispatch({ type: 'text.connectBox', payload: { fromBoxId: 'box-1', toBoxId: 'box-2' } }).ok).toBe(true);
    expect(store.current.stories['story-2']).toBeUndefined();

    undo();
    expect(store.current).toEqual(before);

    redo();
    expect(store.current.stories['story-2']).toBeUndefined();
    expect(validateMagazine(store.current)).toEqual([]);
  });

  it('deleting a box from the middle of a chain repairs it, and undo puts it back', () => {
    const magazine = blankMagazine();
    const store = harness(magazine);
    const pageId = firstPageId(magazine);

    for (const [boxId, storyId, y] of [
      ['box-1', 'story-1', 100],
      ['box-2', 'story-2', 600],
      ['box-3', 'story-3', 1100],
    ] as const) {
      dispatch({
        type: 'item.create',
        payload: {
          pageId,
          item: makeTextBox(boxId, storyId, y),
          afterId: null,
          beforeId: null,
          story: makeStory(storyId, ''),
        },
      });
    }
    dispatch({ type: 'text.connectBox', payload: { fromBoxId: 'box-1', toBoxId: 'box-2' } });
    dispatch({ type: 'text.connectBox', payload: { fromBoxId: 'box-2', toBoxId: 'box-3' } });

    const threaded = clone(store.current);

    expect(dispatch({ type: 'item.delete', payload: { itemId: 'box-2' } }).ok).toBe(true);
    expect(validateMagazine(store.current)).toEqual([]);

    const remaining = pageItems(store.current);
    expect(remaining.map((i) => i.id)).toEqual(['box-1', 'box-3']);

    undo();
    expect(store.current).toEqual(threaded);
  });
});
