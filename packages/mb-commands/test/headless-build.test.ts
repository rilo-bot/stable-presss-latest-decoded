// ---------------------------------------------------------------------------
// FWD-02 — every change is reachable through dispatch() alone.
//
// The most important test in the codebase. It builds a real magazine with no
// DOM, no React, no bundler and no browser: a text box with a story, a photo, a
// shape, threading across two boxes, reordering, locking, and text editing down
// to run level. If the AI phase can only drive the editor through commands, this
// is the proof that commands are enough.
//
// It is also the reason the whole package takes its environment by injection. A
// single `window` or `import.meta.env` anywhere beneath dispatch() and this file
// stops running.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { validateMagazine } from '@rilo/mb-schema';
import { isTextBox } from '@rilo/mb-schema';
import { dispatch, historyDepth, redo, undo } from '../src/index.js';
import {
  blankMagazine,
  firstPageId,
  harness,
  makePhoto,
  makeShape,
  makeStory,
  makeTextBox,
} from './support.js';

describe('building a magazine with nothing but dispatch()', () => {
  it('creates, threads, edits and reorders — and the result is valid throughout', () => {
    const magazine = blankMagazine();

    // Registered on the fixture before the first dispatch. Immer freezes every
    // document it produces, so after one command this assignment throws — which
    // is the guarantee working: nothing writes a magazine except a command.
    magazine.assets['asset-1'] = {
      id: 'asset-1',
      hash: 'sha256-test',
      source: 'upload',
      mimeType: 'image/jpeg',
      intrinsic: { w: 1000, h: 800 },
      originalFilename: 'test.jpg',
      credit: null,
      storageKey: 'test/asset-1',
    };

    const store = harness(magazine);
    const pageId = firstPageId(magazine);

    // — a text box, with the story it shows, in one command ——————————
    const created = dispatch({
      type: 'item.create',
      payload: {
        pageId,
        item: makeTextBox('box-1', 'story-1'),
        afterId: null,
        beforeId: null,
        story: makeStory('story-1', 'Hello'),
      },
    });
    expect(created.ok).toBe(true);
    // The dirty list is what needs re-laying-out — the box and the page it is on.
    expect(created.ok ? created.dirty : []).toContain('box-1');
    expect(created.ok ? created.dirty : []).toContain(pageId);

    // — a shape and a photo, appended in turn ————————————————————
    expect(
      dispatch({
        type: 'item.create',
        payload: { pageId, item: makeShape('shape-1'), afterId: null, beforeId: null },
      }).ok,
    ).toBe(true);

    expect(
      dispatch({
        type: 'item.create',
        payload: {
          pageId,
          item: makePhoto('photo-1', 'asset-1'),
          afterId: 'box-1',
          beforeId: 'shape-1',
        },
      }).ok,
    ).toBe(true);

    // Named neighbours, not indices — the photo landed between the two.
    const page = store.current.spreads[0]?.pages[0];
    expect(page?.items.map((i) => i.id)).toEqual(['box-1', 'photo-1', 'shape-1']);

    // — text editing, down to run level ——————————————————————————
    expect(dispatch({ type: 'text.insert', payload: { paragraphId: 'story-1-p1', offset: 5, text: ' world' } }).ok).toBe(true);
    expect(dispatch({ type: 'text.splitParagraph', payload: { paragraphId: 'story-1-p1', offset: 5, newParagraphId: 'story-1-p2' } }).ok).toBe(true);

    const story = store.current.stories['story-1'];
    expect(story?.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))).toEqual([
      'Hello',
      ' world',
    ]);

    // — threading across two boxes (TXT-11) ————————————————————————
    expect(
      dispatch({
        type: 'item.create',
        payload: {
          pageId,
          item: makeTextBox('box-2', 'story-2', 600),
          afterId: null,
          beforeId: null,
          story: makeStory('story-2', ''),
        },
      }).ok,
    ).toBe(true);

    expect(dispatch({ type: 'text.connectBox', payload: { fromBoxId: 'box-1', toBoxId: 'box-2' } }).ok).toBe(true);

    const boxes = store.current.spreads[0]?.pages[0]?.items.filter(isTextBox) ?? [];
    expect(boxes.map((b) => [b.id, b.storyId, b.nextBoxId, b.prevBoxId])).toEqual([
      ['box-1', 'story-1', 'box-2', null],
      ['box-2', 'story-1', null, 'box-1'],
    ]);
    // The story box-2 used to show went with it.
    expect(store.current.stories['story-2']).toBeUndefined();

    // — arrange operations —————————————————————————————————————
    expect(dispatch({ type: 'item.move', payload: { itemId: 'shape-1', x: 50, y: 60 } }).ok).toBe(true);
    expect(dispatch({ type: 'item.resize', payload: { itemId: 'shape-1', frame: { x: 50, y: 60, w: 111, h: 222 } } }).ok).toBe(true);
    expect(dispatch({ type: 'item.rotate', payload: { itemId: 'shape-1', degrees: 15 } }).ok).toBe(true);
    expect(dispatch({ type: 'item.setProps', payload: { itemId: 'shape-1', props: { opacity: 0.5 } } }).ok).toBe(true);
    expect(dispatch({ type: 'item.reorder', payload: { itemId: 'shape-1', afterId: null, beforeId: 'box-1' } }).ok).toBe(true);
    expect(dispatch({ type: 'item.setLocked', payload: { itemId: 'shape-1', locked: true } }).ok).toBe(true);

    expect(store.current.spreads[0]?.pages[0]?.items[0]?.id).toBe('shape-1');
    expect(validateMagazine(store.current)).toEqual([]);
  });

  it('refuses rather than throws, and commits nothing when it does', () => {
    const magazine = blankMagazine();
    const store = harness(magazine);
    const pageId = firstPageId(magazine);

    dispatch({
      type: 'item.create',
      payload: { pageId, item: makeShape('shape-1'), afterId: null, beforeId: null },
    });
    dispatch({ type: 'item.setLocked', payload: { itemId: 'shape-1', locked: true } });

    const before = store.commits;
    const moved = dispatch({ type: 'item.move', payload: { itemId: 'shape-1', x: 999, y: 999 } });

    expect(moved).toEqual({ ok: false, reason: 'This is locked. Unlock it before changing it.' });
    expect(store.commits).toBe(before);
    expect(store.current.spreads[0]?.pages[0]?.items[0]?.frame.x).toBe(0);
  });

  it('rejects an unknown command instead of throwing — the AI phase sends data, not code', () => {
    harness();
    expect(dispatch({ type: 'item.teleport', payload: {} })).toEqual({
      ok: false,
      reason: 'There is no command called "item.teleport"',
    });
  });

  it('a rejected command records no history', () => {
    harness();
    dispatch({ type: 'item.move', payload: { itemId: 'nope', x: 1, y: 1 } });
    expect(historyDepth()).toEqual({ undo: 0, redo: 0 });
  });

  it('one drag is one undo (GL-17, LANE-1 gate 6)', () => {
    const magazine = blankMagazine();
    const store = harness(magazine);
    const pageId = firstPageId(magazine);

    dispatch({
      type: 'item.create',
      payload: { pageId, item: makeShape('shape-1'), afterId: null, beforeId: null },
    });

    const DRAG_STEPS = 40;
    for (let step = 1; step <= DRAG_STEPS; step += 1) {
      dispatch({
        type: 'item.move',
        payload: { itemId: 'shape-1', x: step, y: step },
        coalesceKey: 'drag:shape-1',
      });
    }

    expect(store.current.spreads[0]?.pages[0]?.items[0]?.frame.x).toBe(DRAG_STEPS);
    expect(historyDepth().undo).toBe(2); // the create, and the whole drag

    undo();
    expect(store.current.spreads[0]?.pages[0]?.items[0]?.frame.x).toBe(0);

    redo();
    expect(store.current.spreads[0]?.pages[0]?.items[0]?.frame.x).toBe(DRAG_STEPS);
  });
});
