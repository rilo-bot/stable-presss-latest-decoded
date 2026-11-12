// AI Activity — the pure halves: query params, pipelines and result shaping
// (lib/agent/aiActivityQuery.ts), the route attribution middleware
// (lib/agent/aiUsageRoute.ts) and the voice cost estimates (voiceUsage.ts).
// No database, no network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_SURFACES,
  currentAiUsage,
  recordAiUsage,
  setAiUsageSink,
  withAiUsage,
  type AiUsageRecord,
} from '../src/lib/agent/aiUsage.js'
import {
  SESSION_KEY,
  anonymousName,
  detailPipeline,
  isSessionId,
  isUserId,
  parseSurface,
  sessionCallsPipeline,
  sessionsPipeline,
  shapeCall,
  shapeDetail,
  shapeSession,
  shapeSurfaces,
  surfacesPipeline,
  usageMatch,
} from '../src/lib/agent/aiActivityQuery.js'
import { aiSurface, entityFrom, magazineIdFromPath, usageHint } from '../src/lib/agent/aiUsageRoute.js'
import { speechCostUsd, transcriptionUsage } from '../src/lib/agent/voiceUsage.js'

// ── params ──────────────────────────────────────────────────────────────────

test('parseSurface: only known surfaces reach a query', () => {
  assert.equal(parseSurface('magazine-builder'), 'magazine-builder')
  assert.equal(parseSurface('stable-hand'), 'stable-hand')
  assert.equal(parseSurface('nope'), null)
  assert.equal(parseSurface({ $ne: null }), null)
  assert.equal(parseSurface(['story-ai']), null)
})

test('isSessionId / isUserId: run ids, job ids and srv-uuids pass; operators and junk do not', () => {
  assert.ok(isSessionId('run_abc123'))
  assert.ok(isSessionId('srv-6f1c2a9e-0d1b-4c39-9a51-2f3e4d5c6b7a'))
  assert.ok(isSessionId('65f1a2b3c4d5e6f7a8b9c0d1'))
  assert.ok(!isSessionId({ $gt: '' }))
  assert.ok(!isSessionId('a/b'))
  assert.ok(!isSessionId('x'.repeat(101)))
  assert.ok(isUserId('65f1a2b3c4d5e6f7a8b9c0d1'))
  assert.ok(!isUserId({ $ne: null }))
  assert.ok(!isUserId('a b'))
})

// ── pipelines ───────────────────────────────────────────────────────────────

test('usageMatch: soft-delete filter + window always; user and surface only when given', () => {
  assert.deepEqual(usageMatch({ from: '2026-11-01' }), {
    deletedAt: null,
    createdAt: { $gte: '2026-11-01T00:00:00.000Z' },
  })
  assert.deepEqual(usageMatch({ from: '2026-11-01', userId: 'u1', surface: 'story-ai' }), {
    deletedAt: null,
    createdAt: { $gte: '2026-11-01T00:00:00.000Z' },
    userId: 'u1',
    surface: 'story-ai',
  })
})

test('pipelines open with the given $match', () => {
  const match = usageMatch({ from: '2026-11-01', userId: 'u1' })
  for (const p of [surfacesPipeline(match), detailPipeline(match), sessionsPipeline(match, { limit: 10 })]) {
    assert.deepEqual(p[0], { $match: match })
  }
})

test('sessionsPipeline: the cursor applies AFTER grouping, so a session never splits', () => {
  const match = usageMatch({ from: '2026-11-01' })
  const first = sessionsPipeline(match, { limit: 25 })
  assert.equal(first.some((s) => '$match' in s && (s.$match as Record<string, unknown>).lastUsedAt), false)
  const next = sessionsPipeline(match, { limit: 25, before: '2026-11-10T08:00:00.000Z' })
  const groupAt = next.findIndex((s) => '$group' in s)
  const cursorAt = next.findIndex((s) => '$match' in s && (s.$match as Record<string, unknown>).lastUsedAt)
  assert.ok(groupAt > 0 && cursorAt > groupAt)
  assert.deepEqual(next[cursorAt], { $match: { lastUsedAt: { $lt: '2026-11-10T08:00:00.000Z' } } })
  assert.deepEqual(next[next.length - 1], { $limit: 25 })
  assert.deepEqual((next[groupAt] as { $group: { _id: unknown } }).$group._id, SESSION_KEY)
})

test('sessionCallsPipeline: pinned to the user and surface when given, capped', () => {
  const p = sessionCallsPipeline({ sessionId: 'run_123456', userId: 'u1', surface: 'stable-hand' })
  assert.deepEqual(p[0], { $match: { deletedAt: null, sessionId: 'run_123456', userId: 'u1', surface: 'stable-hand' } })
  assert.deepEqual(p[1], { $sort: { createdAt: 1 } })
  const open = sessionCallsPipeline({ sessionId: 'run_123456' })
  assert.deepEqual(open[0], { $match: { deletedAt: null, sessionId: 'run_123456' } })
})

// ── shaping ─────────────────────────────────────────────────────────────────

test('shapeSurfaces: every known surface, zero rows included, days filled, unknown → other', () => {
  const facet = {
    bySurface: [
      { _id: 'magazine-builder', calls: 10, costUsd: 1.5, inputTokens: 1000, outputTokens: 200, errors: 1, users: 2, lastUsedAt: '2026-11-12T10:00:00.000Z' },
      { _id: 'legacy-thing', calls: 1, costUsd: 0.1 },
    ],
    sessions: [{ _id: 'magazine-builder', n: 3 }],
    byDay: [
      { _id: { surface: 'magazine-builder', day: '2026-11-12' }, calls: 6, costUsd: 1 },
      { _id: { surface: 'magazine-builder', day: '2026-11-11' }, calls: 4, costUsd: 0.5 },
      { _id: { surface: 'magazine-builder', day: '2026-01-01' }, calls: 99, costUsd: 99 }, // outside the window
    ],
  }
  const report = shapeSurfaces(facet, '2026-11-10', '2026-11-12')
  assert.equal(report.surfaces.length, AI_SURFACES.length)
  assert.deepEqual(report.surfaces.map((s) => s.surface), [...AI_SURFACES])
  const mag = report.surfaces.find((s) => s.surface === 'magazine-builder')!
  assert.equal(mag.calls, 10)
  assert.equal(mag.sessions, 3)
  assert.equal(mag.users, 2)
  assert.equal(mag.errors, 1)
  assert.equal(mag.lastUsedAt, '2026-11-12T10:00:00.000Z')
  assert.deepEqual(mag.days.map((d) => [d.date, d.calls]), [
    ['2026-11-10', 0],
    ['2026-11-11', 4],
    ['2026-11-12', 6],
  ])
  const story = report.surfaces.find((s) => s.surface === 'story-ai')!
  assert.equal(story.calls, 0)
  assert.equal(story.lastUsedAt, null)
  assert.equal(story.days.length, 3)
  assert.equal(report.surfaces.find((s) => s.surface === 'other')!.calls, 1)
  assert.equal(report.totals.calls, 11)
  assert.equal(report.totals.sessions, 3)
  assert.ok(Math.abs(report.totals.costUsd - 1.6) < 1e-9)
})

test('shapeSurfaces: an empty facet is a page of zeros, not an error', () => {
  const report = shapeSurfaces(undefined, '2026-11-12', '2026-11-12')
  assert.equal(report.totals.calls, 0)
  assert.ok(report.surfaces.every((s) => s.calls === 0 && s.days.length === 1))
})

test('shapeDetail: totals, a filled day series, breakdowns and name fallbacks', () => {
  const facet = {
    totals: [{ _id: null, calls: 5, costUsd: 0.5, inputTokens: 100, outputTokens: 20, users: 2, estimated: 1 }],
    sessionCount: [{ n: 2 }],
    byDay: [{ _id: '2026-11-12', calls: 5, costUsd: 0.5, inputTokens: 100 }],
    byFeature: [{ _id: 'planner', calls: 2, costUsd: 0.4 }, { _id: '', calls: 3, costUsd: 0.1 }],
    byModel: [{ _id: 'anthropic/claude-opus-5.5', calls: 5, costUsd: 0.5 }],
    byUser: [
      { _id: 'u1', calls: 3, costUsd: 0.3, userName: 'Stored Name' },
      { _id: 'u2', calls: 1, costUsd: 0.1 },
      { _id: 'gone', calls: 1, costUsd: 0.1 },
      { _id: '', calls: 1, costUsd: 0 },
    ],
  }
  const names = new Map([['u2', 'Live Name']])
  const d = shapeDetail(facet, '2026-11-11', '2026-11-12', names, anonymousName('concierge'))
  assert.equal(d.totals.calls, 5)
  assert.equal(d.totals.sessions, 2)
  assert.equal(d.totals.users, 2)
  assert.equal(d.totals.estimated, 1)
  assert.deepEqual(d.days.map((x) => [x.date, x.calls]), [['2026-11-11', 0], ['2026-11-12', 5]])
  assert.deepEqual(d.byFeature.map((r) => r.key), ['planner', ''])
  assert.equal(d.byModel[0]!.key, 'anthropic/claude-opus-5.5')
  assert.deepEqual(d.byUser.map((u) => u.userName), ['Stored Name', 'Live Name', 'Former staff member', 'Signed-out visitor'])
})

test('shapeSession: a real session vs a lone call; titles; errors only when a call failed', () => {
  const names = new Map([['u1', 'Ada']])
  const titles = new Map([['magazine:m1', 'Spring Carnival']])
  const session = shapeSession(
    {
      sessionId: 'job123',
      userId: 'u1',
      surface: 'magazine-builder',
      calls: 40,
      costUsd: 2,
      errors: 0,
      error: 'stale message',
      features: ['planner', 'copy', null, 'copy'],
      models: ['a', 'b'],
      entityType: 'magazine',
      entityId: 'm1',
      callId: 'c1',
      startedAt: '2026-11-12T09:00:00.000Z',
      lastUsedAt: '2026-11-12T09:10:00.000Z',
    },
    names,
    titles,
    anonymousName('magazine-builder'),
  )
  assert.equal(session.sessionId, 'job123')
  assert.equal(session.callId, null)
  assert.equal(session.userName, 'Ada')
  assert.equal(session.entityTitle, 'Spring Carnival')
  assert.deepEqual(session.features, ['planner', 'copy'])
  assert.equal(session.error, '')

  const lone = shapeSession(
    { sessionId: null, callId: 'c9', userId: '', surface: 'compose', calls: 1, errors: 1, error: 'boom' },
    names,
    titles,
    anonymousName('compose'),
  )
  assert.equal(lone.sessionId, null)
  assert.equal(lone.callId, 'c9')
  assert.equal(lone.userName, 'Unattributed')
  assert.equal(lone.error, 'boom')
})

test('shapeCall: defaults for missing fields; ok unless explicitly false', () => {
  const c = shapeCall({ _id: 'x', createdAt: '2026-11-12T00:00:00.000Z', model: 'm', surface: 'voice' })
  assert.equal(c.id, 'x')
  assert.equal(c.kind, 'text')
  assert.equal(c.costSource, 'unknown')
  assert.equal(c.ok, true)
  assert.equal(shapeCall({ ok: false, error: 'e' }).ok, false)
})

// ── route attribution ───────────────────────────────────────────────────────

test('usageHint / entityFrom: only well-formed hints label a record', () => {
  assert.deepEqual(usageHint({ surface: 'magazine-builder', entityType: 'magazine', entityId: 'm1' }), {
    surface: 'magazine-builder',
    entityType: 'magazine',
    entityId: 'm1',
  })
  assert.deepEqual(usageHint({ surface: 'admin', entityType: 'Magazine!', entityId: { $ne: 1 } }), {})
  assert.deepEqual(usageHint(undefined), {})
  assert.deepEqual(entityFrom('horse', 'h1'), { entityType: 'horse', entityId: 'h1' })
  assert.deepEqual(entityFrom('horse', ''), {})
  assert.deepEqual(entityFrom(undefined, 'h1'), {})
})

test('magazineIdFromPath: the id under /issues, never an action word', () => {
  assert.equal(magazineIdFromPath('/issues/65f1a2b3c4d5e6f7a8b9c0d1/pages/p1/agent'), '65f1a2b3c4d5e6f7a8b9c0d1')
  assert.equal(magazineIdFromPath('/issues/abc123'), 'abc123')
  assert.equal(magazineIdFromPath('/issues/generate'), undefined)
  assert.equal(magazineIdFromPath('/issues/blank'), undefined)
  assert.equal(magazineIdFromPath('/issues'), undefined)
  assert.equal(magazineIdFromPath('/other/abc'), undefined)
})

test('aiSurface: the rest of the request runs inside the attribution (caller + extras + hint)', async () => {
  const req = {
    account: { id: 'u1', name: 'Ada', email: 'a@x' },
    query: { surface: 'magazine-builder', entityId: 'm1', entityType: 'magazine' },
    body: {},
  }
  let seen: Record<string, unknown> | null = null
  await new Promise<void>((resolve) => {
    aiSurface('documents', { feature: 'document-read', acceptHint: true })(req as never, {} as never, () => {
      // An await inside the handler keeps the context — that is what a stream relies on.
      void Promise.resolve().then(() => {
        seen = { ...currentAiUsage() }
        resolve()
      })
    })
  })
  assert.deepEqual(seen, {
    surface: 'magazine-builder',
    feature: 'document-read',
    userId: 'u1',
    userName: 'Ada',
    entityType: 'magazine',
    entityId: 'm1',
  })
  // Without acceptHint the query is ignored.
  let plain: Record<string, unknown> | null = null
  aiSurface('voice')(req as never, {} as never, () => {
    plain = { ...currentAiUsage() }
  })
  assert.equal(plain!.surface, 'voice')
  assert.equal(plain!.entityId, undefined)
  // And nothing leaks outside.
  assert.equal(currentAiUsage().surface, undefined)
})

// ── voice ───────────────────────────────────────────────────────────────────

test('transcriptionUsage: tokens priced per model, duration for whisper, unknown otherwise', () => {
  const t = transcriptionUsage('gpt-4o-mini-transcribe', { type: 'tokens', input_tokens: 1000, output_tokens: 100 })
  assert.equal(t.inputTokens, 1000)
  assert.equal(t.outputTokens, 100)
  assert.ok(Math.abs(t.costUsd! - (1000 * 3 + 100 * 5) / 1e6) < 1e-12)
  const w = transcriptionUsage('whisper-1', { type: 'duration', seconds: 30 })
  assert.ok(Math.abs(w.costUsd! - 0.003) < 1e-12)
  assert.equal(transcriptionUsage('gpt-4o-mini-transcribe', undefined).costUsd, undefined)
  assert.equal(transcriptionUsage('some-other', { input_tokens: 5 }).costUsd, undefined)
})

test('speechCostUsd: per-character estimate; unknown model → undefined', () => {
  assert.ok(Math.abs(speechCostUsd('gpt-4o-mini-tts', 900)! - 0.01503) < 1e-6)
  assert.equal(speechCostUsd('tts-1', 1_000_000), 15)
  assert.equal(speechCostUsd('tts-1-hd', 1_000_000), 30)
  assert.equal(speechCostUsd('mystery', 10), undefined)
})

test('recordAiUsage: a caller-supplied estimate is labelled estimate, not provider', () => {
  const records: AiUsageRecord[] = []
  setAiUsageSink((r) => void records.push(r))
  try {
    withAiUsage({ surface: 'voice', userId: 'u1', feature: 'read-aloud' }, () =>
      recordAiUsage({
        model: 'openai/gpt-4o-mini-tts',
        kind: 'speech',
        inputTokens: 10,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        costUsd: 0.001,
        costSource: 'estimate',
        durationMs: 5,
        ok: true,
      }),
    )
  } finally {
    setAiUsageSink(null)
  }
  assert.equal(records.length, 1)
  assert.equal(records[0]!.costSource, 'estimate')
  assert.equal(records[0]!.surface, 'voice')
  assert.equal(records[0]!.feature, 'read-aloud')
  assert.equal(records[0]!.userId, 'u1')
})
