// AI usage meter (lib/agent/aiUsage.ts) — runs against the real ai@7 call path
// with a mock model, so an SDK upgrade that changes usage/stream shapes fails here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateText, streamText, wrapLanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { aiUsageMiddleware, setAiUsageSink, withAiUsage, estimateCostUsd, type AiUsageRecord } from '../src/lib/agent/aiUsage.js'

const usage = {
  inputTokens: { total: 1000, noCache: 800, cacheRead: 200, cacheWrite: 0 },
  outputTokens: { total: 50, text: 30, reasoning: 20 },
}

function mock() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'hello' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
      providerMetadata: { openrouter: { usage: { cost: 0.0123 } } },
    } as never,
    doStream: {
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'text-start', id: 't' })
          c.enqueue({ type: 'text-delta', id: 't', delta: 'hi' })
          c.enqueue({ type: 'text-end', id: 't' })
          c.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage })
          c.close()
        },
      }),
    } as never,
  })
}

test('generate: records tokens, provider cost and the caller attribution; strips Claude sampling', async () => {
  const records: AiUsageRecord[] = []
  setAiUsageSink((r) => void records.push(r))
  const inner = mock()
  const model = wrapLanguageModel({
    model: inner,
    middleware: aiUsageMiddleware({ modelId: 'anthropic/claude-opus-5.5', surface: 'magazine-builder', feature: 'layout' }),
  })
  // A system message array (how the operator passes its cached prompt) must still be accepted by ai@7.
  await withAiUsage({ userId: 'u1', surface: 'magazine-builder', feature: 'generate', entityId: 'mag1' }, () =>
    generateText({ model, system: [{ role: 'system', content: 'S' }], prompt: 'x', temperature: 0.9 }),
  )
  assert.equal(inner.doGenerateCalls[0].temperature, undefined, 'temperature must be stripped for Claude')
  assert.equal(records.length, 1)
  const r = records[0]
  assert.equal(r.surface, 'magazine-builder')
  assert.equal(r.feature, 'layout', 'the model role is the more specific label')
  assert.equal(r.userId, 'u1')
  assert.equal(r.entityId, 'mag1')
  assert.equal(r.inputTokens, 1000)
  assert.equal(r.cachedInputTokens, 200)
  assert.equal(r.reasoningTokens, 20)
  assert.equal(r.costUsd, 0.0123)
  assert.equal(r.costSource, 'provider')
  assert.match(r.day, /^\d{4}-\d{2}-\d{2}$/)
  setAiUsageSink(null)
})

test('stream: records once on finish, estimates cost without provider metadata; keeps GPT temperature', async () => {
  const records: AiUsageRecord[] = []
  setAiUsageSink((r) => void records.push(r))
  const inner = mock()
  const model = wrapLanguageModel({ model: inner, middleware: aiUsageMiddleware({ modelId: 'openai/gpt-5.6-sol' }) })
  const result = withAiUsage({ surface: 'story-ai', userId: 'u2' }, () => streamText({ model, prompt: 'x', temperature: 0.5 }))
  assert.equal(await result.text, 'hi')
  assert.equal(inner.doStreamCalls[0].temperature, 0.5)
  assert.equal(records.length, 1)
  assert.equal(records[0].surface, 'story-ai')
  assert.equal(records[0].costSource, 'estimate')
  assert.ok(Math.abs(records[0].costUsd - estimateCostUsd('openai/gpt-5.6-sol', records[0])!) < 1e-12)
  setAiUsageSink(null)
})

test('no sink installed: a model call never needs a database', async () => {
  setAiUsageSink(null)
  const model = wrapLanguageModel({ model: mock(), middleware: aiUsageMiddleware({ modelId: 'anthropic/claude-sonnet-5.5' }) })
  const { text } = await generateText({ model, prompt: 'x' })
  assert.equal(text, 'hello')
})
