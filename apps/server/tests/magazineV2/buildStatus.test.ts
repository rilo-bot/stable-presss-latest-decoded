// ---------------------------------------------------------------------------
// buildStatus — the waiting-screen facts (apps/web/src/editor-v2/buildStatus.ts).
//
// Pure module, so it is tested here with everything else even though it lives
// in the web app. Pins the 2026-08-17 fix pair:
//   · the ADD-PAGES run now keeps pagesProcessed/pagesTotal honest (the worker
//     sets them at the start and bumps per composed page), so `isAdding` must
//     NOT force the indeterminate state any more — the real counter shows.
//     (The old `countable = !isAdding && …` made this file's counts unreachable
//     on any run the editor labelled as adding — and the editor mislabelled the
//     INITIAL build as adding too, so users never saw "3 of 10 pages built".)
//   · the stale-counter guard stays: counts left over from the PREVIOUS run
//     (done >= total while still processing) must never draw a full bar.
// ---------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatus } from '../../../web/src/editor-v2/buildStatus.js';

const composing = (done: number, total: number) => ({
  status: 'processing',
  stage: 'Designing pages',
  pagesProcessed: done,
  pagesTotal: total,
});

test('initial build with real counts is countable and says so', () => {
  const st = buildStatus(composing(3, 10), false);
  assert.equal(st.headline, '3 of 10 pages built');
  assert.deepEqual(st.count, { done: 3, total: 10 });
  assert.equal(st.fraction, 0.3);
});

test('an ADD run with real counts shows the real counter — isAdding no longer forces indeterminate', () => {
  // The worker sets pagesTotal=existing+new and pagesProcessed=existing at the
  // start of an add run, then bumps per page: 8 existing, 4 requested, 2 done.
  const st = buildStatus(composing(10, 12), true);
  assert.equal(st.headline, '10 of 12 pages built');
  assert.deepEqual(st.count, { done: 10, total: 12 });
  assert.ok(st.fraction !== null && Math.abs(st.fraction - 10 / 12) < 1e-9);
});

test('an ADD run with the PREVIOUS run’s stale counts stays indeterminate with the adding wording', () => {
  // The window between the route flipping to 'processing' and the worker
  // resetting the counters: the document still says a finished "8 of 8".
  const st = buildStatus(composing(8, 8), true);
  assert.equal(st.headline, 'Adding your new pages');
  assert.equal(st.count, null);
  assert.equal(st.fraction, null);
});

test('a stale full counter on a NON-add run is also never a full bar', () => {
  const st = buildStatus(composing(8, 8), false);
  assert.equal(st.count, null);
  assert.equal(st.fraction, null);
  assert.equal(st.headline, 'Building your pages');
});

test('planning has no counter and says planning', () => {
  const st = buildStatus({ status: 'processing', stage: 'Designing the issue', pagesProcessed: 0, pagesTotal: 0 }, false);
  assert.equal(st.headline, 'Planning your issue');
  assert.equal(st.count, null);
});

test('digitizing counts read as pages read', () => {
  const st = buildStatus({ status: 'processing', stage: 'Digitizing pages', pagesProcessed: 2, pagesTotal: 6 }, false);
  assert.equal(st.headline, '2 of 6 pages read');
  assert.deepEqual(st.count, { done: 2, total: 6 });
});
