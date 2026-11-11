// Stablehand Activity — the pure query-shaping helpers (no database).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampInt, datesBetween, isRunId, isoTimestamp, windowStart } from '../src/lib/agent/operator/activityParams.js'

test('clampInt: defaults on junk, clamps out-of-range', () => {
  assert.equal(clampInt(undefined, 7, 1, 90), 7)
  assert.equal(clampInt('abc', 7, 1, 90), 7)
  assert.equal(clampInt('', 7, 1, 90), 7)
  assert.equal(clampInt('0', 7, 1, 90), 1)
  assert.equal(clampInt('500', 7, 1, 90), 90)
  assert.equal(clampInt('30.9', 7, 1, 90), 30)
  assert.equal(clampInt(['30'], 7, 1, 90), 7)
})

test('isoTimestamp: only real dates reach a query', () => {
  assert.equal(isoTimestamp('2026-11-10T08:00:00.000Z'), '2026-11-10T08:00:00.000Z')
  assert.equal(isoTimestamp({ $gt: '' }), null)
  assert.equal(isoTimestamp('not a date'), null)
})

test('windowStart + datesBetween: a 30-day window is 30 UTC dates ending today', () => {
  const now = new Date('2026-11-11T15:00:00Z')
  const from = windowStart(30, now)
  assert.equal(from, '2026-10-13')
  const dates = datesBetween(from, '2026-11-11')
  assert.equal(dates.length, 30)
  assert.equal(dates[dates.length - 1], '2026-11-11')
})

test('isRunId matches what runs.ts accepts', () => {
  assert.ok(isRunId('srv-6f1c2a4e-0d7b-4a51-9a8c-3c1f2b9e7d10'))
  assert.ok(!isRunId('$where'))
  assert.ok(!isRunId('abc'))
})
