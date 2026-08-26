// ---------------------------------------------------------------------------
// Job liveness — the decision both watchdogs make.
//
// The bug this replaces: liveness was judged from START TIME, which cannot tell
// "working for an hour" from "dead for an hour". Since healStuckIssue runs on
// GET /issues/:id — the endpoint the studio polls to display reading progress —
// watching a long document read was what killed it.
//
// Two properties matter more than any threshold:
//   1. A job that keeps reporting is NEVER presumed dead, however long it runs.
//   2. A job that never reported keeps its long grace, so adding heartbeats
//      cannot make an existing long job (generation) newly reapable.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  jobIsPresumedDead,
  isBeating,
  lastSignOfLife,
  silentForMs,
  NO_BEAT_MS,
  NO_BEAT_GRACE_MS,
} from '../../src/lib/magazineV2/jobHealth.js';

const NOW = Date.parse('2026-08-26T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;

// ── the property that fixes the bug ─────────────────────────────────────────

test('a job that keeps beating is never presumed dead, however long it has run', () => {
  // Six hours of reading, still reporting: alive. Under the old start-time rule
  // this was reaped at 45 minutes, by the studio polling for its progress.
  const job = { startedAt: ago(6 * 60 * MIN), lastBeatAt: ago(20_000) };
  assert.equal(jobIsPresumedDead(job, NOW), false);
});

test('a beating job that goes quiet is caught in minutes, not in an hour', () => {
  const quiet = { startedAt: ago(90 * MIN), lastBeatAt: ago(NO_BEAT_MS + MIN) };
  assert.equal(jobIsPresumedDead(quiet, NOW), true);
  // Faster than the old 45-minute rule: a real death is now caught in ~5 minutes.
  assert.ok(NO_BEAT_MS < NO_BEAT_GRACE_MS);
});

test('a beat just inside the window still counts as alive', () => {
  const job = { startedAt: ago(120 * MIN), lastBeatAt: ago(NO_BEAT_MS - 1_000) };
  assert.equal(jobIsPresumedDead(job, NOW), false);
});

// ── the regression this nearly shipped ──────────────────────────────────────

test('a job that never beat keeps the LONG grace', () => {
  // Generation does not beat internally and legitimately runs ~30 minutes. An
  // earlier draft beat once for every job at claim time, which would have handed
  // generation a lastBeatAt and reaped it after five minutes. A job earns the
  // strict rule by actually reporting, never by merely existing.
  const generating = { startedAt: ago(30 * MIN) };
  assert.equal(isBeating(generating), false);
  assert.equal(jobIsPresumedDead(generating, NOW), false, '30-minute generation must not be reaped');

  const reallyDead = { startedAt: ago(NO_BEAT_GRACE_MS + MIN) };
  assert.equal(jobIsPresumedDead(reallyDead, NOW), true);
});

test('the two rules do not cross over', () => {
  // A silence of 10 minutes: dead for a beating job, alive for a non-beating one.
  const silence = 10 * MIN;
  assert.equal(jobIsPresumedDead({ startedAt: ago(silence), lastBeatAt: ago(silence) }, NOW), true);
  assert.equal(jobIsPresumedDead({ startedAt: ago(silence) }, NOW), false);
});

// ── refusing to judge ───────────────────────────────────────────────────────

test('a job with no usable timestamp is never presumed dead', () => {
  // Refusing to judge is right: the cost of a false kill is a user's work
  // discarded mid-flight, against the cost of one stuck row surviving a sweep.
  for (const job of [{}, { startedAt: '' }, { startedAt: 'not a date' }, { lastBeatAt: null }]) {
    assert.equal(jobIsPresumedDead(job as Record<string, unknown>, NOW), false);
    assert.equal(lastSignOfLife(job as Record<string, unknown>), null);
    assert.equal(silentForMs(job as Record<string, unknown>, NOW), null);
  }
});

test('an unparseable beat falls back to start time rather than being trusted', () => {
  const job = { startedAt: ago(2 * MIN), lastBeatAt: 'garbage' };
  assert.equal(isBeating(job), false, 'a garbage beat is not a beat');
  assert.equal(lastSignOfLife(job), NOW - 2 * MIN);
  assert.equal(jobIsPresumedDead(job, NOW), false);
});

// ── evidence precedence ─────────────────────────────────────────────────────

test('the freshest evidence wins, in the documented order', () => {
  assert.equal(lastSignOfLife({ lastBeatAt: ago(MIN), startedAt: ago(60 * MIN) }), NOW - MIN);
  assert.equal(lastSignOfLife({ startedAt: ago(5 * MIN), updatedAt: ago(MIN) }), NOW - 5 * MIN);
  assert.equal(lastSignOfLife({ createdAt: ago(3 * MIN) }), NOW - 3 * MIN);
});

test('callers may tighten or loosen either threshold', () => {
  const job = { startedAt: ago(20 * MIN), lastBeatAt: ago(7 * MIN) };
  assert.equal(jobIsPresumedDead(job, NOW), true); // default 5 min
  assert.equal(jobIsPresumedDead(job, NOW, { noBeatMs: 10 * MIN }), false);

  const noBeat = { startedAt: ago(50 * MIN) };
  assert.equal(jobIsPresumedDead(noBeat, NOW), true); // default 45 min grace
  assert.equal(jobIsPresumedDead(noBeat, NOW, { graceMs: 90 * MIN }), false);
});

test('silentForMs reports the gap, floored at zero', () => {
  assert.equal(silentForMs({ lastBeatAt: ago(3 * MIN) }, NOW), 3 * MIN);
  // A clock skew that puts the beat in the future must not produce a negative.
  assert.equal(silentForMs({ lastBeatAt: new Date(NOW + 5_000).toISOString() }, NOW), 0);
});
