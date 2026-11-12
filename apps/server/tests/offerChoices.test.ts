// ---------------------------------------------------------------------------
// Answer pills (offer_choices) — both halves.
//
//   · server: lib/agent/offerChoices.ts — the tool (lenient schema, instant
//     execute), its place in the operator tool set, and the stop condition the
//     routes use so the turn ends on it.
//   · web: apps/web/src/agent/choices/choices.ts — pure helpers the choice card
//     runs on: sanitising the model's input, composing the reply a tap sends,
//     reading the picks back out of it (read-only / restored cards), when a
//     card is live, and the guard that stops the chat auto-continuing.
//
// Pure, in-memory. No database, no network, no model.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasToolCall, stepCountIs } from 'ai'
import {
  OFFER_CHOICES_TOOL,
  offerChoicesInputSchema,
  offerChoicesTool,
  countUsableQuestions,
} from '../src/lib/agent/offerChoices.js'
import {
  OFFER_CHOICES_TOOL as WEB_TOOL_NAME,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  parseChoices,
  choicesOfPart,
  isChoicesPart,
  messageChoices,
  lastStepOfferedChoices,
  choiceCardState,
  composeAnswer,
  picksFromAnswer,
  toggleChoice,
  isInstantChoice,
  type MessageLike,
} from '../../web/src/agent/choices/choices.js'

// prompt.ts / tools.ts reach lib/db.ts, which throws at import without a URI.
// The client connects lazily — an unroutable placeholder is enough.
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/offer-choices-test-never-connects'

const plan = {
  questions: [
    { id: 'title', question: 'Title', options: ['Turf & Terrace', 'The Home Straight', 'I have a name'] },
    { question: 'Audience?', options: ['Racing fans', 'Visitors and tourists'] },
    { question: 'Sections', options: ['Racing', 'Breeding', 'Sales'], multiple: true },
    { question: 'Next step', options: ['Go ahead', 'Change something'] },
  ],
}

// ── server ──────────────────────────────────────────────────────────────────

test('server and web agree on the tool name', () => {
  assert.equal(OFFER_CHOICES_TOOL, 'offer_choices')
  assert.equal(WEB_TOOL_NAME, OFFER_CHOICES_TOOL)
})

test('the schema is lenient: an over-long option or a 7th answer is not a failed call', () => {
  const long = 'x'.repeat(200)
  const r = offerChoicesInputSchema.safeParse({
    questions: [{ question: 'Pick', options: [long, 'a', 'b', 'c', 'd', 'e', 'f'] }],
  })
  assert.equal(r.success, true)
  assert.equal(offerChoicesInputSchema.safeParse({ questions: 'nope' }).success, false)
})

test('execute returns at once and says whether anything was shown', async () => {
  const exec = (offerChoicesTool as { execute: (i: unknown, o: unknown) => Promise<{ shown: boolean }> }).execute
  const opts = { toolCallId: 't', messages: [] }
  assert.equal((await exec(plan, opts)).shown, true)
  assert.equal((await exec({ questions: [{ question: 'x', options: ['  '] }] }, opts)).shown, false)
  assert.equal(countUsableQuestions(plan as never), 4)
})

test('the routes stop on offer_choices (and still on the step cap)', () => {
  const stops = [stepCountIs(30), hasToolCall(OFFER_CHOICES_TOOL)]
  const step = (...names: string[]) => ({ toolCalls: names.map((toolName) => ({ toolName })) })
  const any = (steps: unknown[]) => stops.some((s) => (s as (o: { steps: unknown[] }) => boolean)({ steps }))
  assert.equal(any([step('readScreen'), step(OFFER_CHOICES_TOOL)]), true)
  assert.equal(any([step(OFFER_CHOICES_TOOL), step('readScreen')]), false, 'only the LAST step counts')
  assert.equal(any([step('findStaff')]), false)
})

test('the operator gets offer_choices as a server tool, and its prompt teaches it', async () => {
  const { buildOperatorTools } = await import('../src/lib/agent/operator/tools.js')
  const { getStaticOperatorPrompt } = await import('../src/lib/agent/operator/prompt.js')
  const account = {
    id: 'u_test', name: 'Test', email: 't@test.local', isAdmin: true, isSuperAdmin: true,
    parties: [], orgMembers: [], permissions: new Set(), modules: new Set(), scopes: {}, workflowStages: new Set(),
  }
  const tools = buildOperatorTools(account as never, undefined) as Record<string, { execute?: unknown }>
  assert.ok(tools[OFFER_CHOICES_TOOL], 'offer_choices is in the operator tool set')
  assert.equal(typeof tools[OFFER_CHOICES_TOOL].execute, 'function', 'it runs server-side (not a client tool)')
  const prompt = getStaticOperatorPrompt()
  assert.ok(prompt.includes('offer_choices'))
  assert.ok(prompt.includes('"Go ahead" / "Change something"'))
})

test('the concierge prompt teaches it too', async () => {
  const { buildSystemPrompt } = await import('../src/lib/agent/prompt.js')
  assert.ok(buildSystemPrompt(undefined).includes('offer_choices'))
})

// ── web: parsing the model's input ──────────────────────────────────────────

test('parseChoices keeps the plan as asked', () => {
  const qs = parseChoices(plan)
  assert.equal(qs.length, 4)
  assert.deepEqual(qs[0], { id: 'title', label: 'Title', options: ['Turf & Terrace', 'The Home Straight', 'I have a name'], multiple: false })
  assert.equal(qs[1].id, 'q2')
  assert.equal(qs[2].multiple, true)
})

test('parseChoices cleans and clamps whatever the model sends', () => {
  assert.deepEqual(parseChoices(undefined), [])
  assert.deepEqual(parseChoices({ questions: 'x' }), [])
  assert.deepEqual(parseChoices({ questions: [{ question: 'Empty', options: ['', '   ', 7] }] }), [])
  const qs = parseChoices({
    questions: [
      { id: 'a', question: '  Pick   one ', options: [' Yes ', 'yes', 'No', 'A', 'B', 'C', 'D', 'E'] },
      { id: 'a', question: '', options: ['x'.repeat(300)] },
      { question: 'c', options: ['1'] },
      { question: 'd', options: ['1'] },
      { question: 'e', options: ['1'] },
    ],
  })
  assert.equal(qs.length, MAX_QUESTIONS)
  assert.equal(qs[0].label, 'Pick one')
  assert.deepEqual(qs[0].options.slice(0, 2), ['Yes', 'No'], 'trimmed + case-insensitive de-dupe')
  assert.equal(qs[0].options.length, MAX_OPTIONS)
  assert.notEqual(qs[1].id, qs[0].id, 'ids are unique')
  assert.equal(qs[1].label, 'Question 2', 'several questions all get labels')
  assert.ok(qs[1].options[0].length <= 100 && qs[1].options[0].endsWith('…'))
})

test('parts: only a fully-streamed offer_choices call yields questions', () => {
  const input = { questions: [{ question: 'Next step', options: ['Go ahead', 'Change something'] }] }
  assert.equal(isChoicesPart({ type: 'tool-offer_choices' }), true)
  assert.equal(isChoicesPart({ type: 'dynamic-tool', toolName: 'offer_choices' }), true)
  assert.equal(isChoicesPart({ type: 'tool-readScreen' }), false)
  assert.equal(choicesOfPart({ type: 'tool-offer_choices', state: 'input-streaming', input: { questions: [] } }), null)
  assert.equal(choicesOfPart({ type: 'tool-offer_choices', state: 'input-available', input })?.length, 1)
  assert.equal(choicesOfPart({ type: 'tool-offer_choices', state: 'output-available', input })?.[0].options[0], 'Go ahead')
  assert.equal(messageChoices({ role: 'assistant', parts: [{ type: 'text', text: 'Plan…' }] }), null)
})

// ── web: what a tap / Send posts, and reading it back ───────────────────────

test('one question, one answer: instant, and the reply is the bare option', () => {
  const qs = parseChoices({ questions: [{ question: 'Next step', options: ['Go ahead', 'Change something'] }] })
  assert.equal(isInstantChoice(qs), true)
  assert.equal(composeAnswer(qs, { [qs[0].id]: ['Go ahead'] }), 'Go ahead')
  assert.deepEqual(picksFromAnswer(qs, 'go ahead'), { [qs[0].id]: ['Go ahead'] })
  assert.deepEqual(picksFromAnswer(qs, 'Go ahead but call it Spring'), {}, 'a typed reply picks nothing')
})

test('several questions: one "Label: answer" line per ANSWERED question, round-trips', () => {
  const qs = parseChoices(plan)
  assert.equal(isInstantChoice(qs), false)
  let sel = {}
  sel = toggleChoice(qs, sel, 'title', 'Turf & Terrace')
  sel = toggleChoice(qs, sel, 'q3', 'Sales')
  sel = toggleChoice(qs, sel, 'q3', 'Racing')
  sel = toggleChoice(qs, sel, 'q4', 'Go ahead')
  const text = composeAnswer(qs, sel)
  // Options keep the order they were offered in; the unanswered Audience is left out;
  // "Audience?" would have lost its question mark.
  assert.equal(text, 'Title: Turf & Terrace\nSections: Racing, Sales\nNext step: Go ahead')
  assert.deepEqual(picksFromAnswer(qs, text), { title: ['Turf & Terrace'], q3: ['Racing', 'Sales'], q4: ['Go ahead'] })
  assert.equal(composeAnswer(qs, {}), '')
  assert.equal(composeAnswer(qs, toggleChoice(qs, {}, 'q2', 'Racing fans')), 'Audience: Racing fans')
})

test('toggleChoice: single answers swap and clear, multiple accumulate, unknowns are ignored', () => {
  const qs = parseChoices(plan)
  let s = toggleChoice(qs, {}, 'title', 'Turf & Terrace')
  s = toggleChoice(qs, s, 'title', 'The Home Straight')
  assert.deepEqual(s.title, ['The Home Straight'])
  assert.deepEqual(toggleChoice(qs, s, 'title', 'The Home Straight').title, [])
  let m = toggleChoice(qs, {}, 'q3', 'Racing')
  m = toggleChoice(qs, m, 'q3', 'Breeding')
  assert.deepEqual(m.q3, ['Racing', 'Breeding'])
  assert.deepEqual(toggleChoice(qs, m, 'q3', 'Racing').q3, ['Breeding'])
  assert.equal(toggleChoice(qs, m, 'q3', 'Not offered'), m)
  assert.equal(toggleChoice(qs, m, 'nope', 'Racing'), m)
})

// ── web: card lifecycle + the auto-continue guard ───────────────────────────

const choicesPart = { type: 'tool-offer_choices', state: 'output-available', input: plan, output: { shown: true } }
const ask: MessageLike = { role: 'assistant', parts: [{ type: 'step-start' }, { type: 'text', text: 'Here is the plan.' }, choicesPart] }
const user = (text: string): MessageLike => ({ role: 'user', parts: [{ type: 'text', text }] })
const jobUpdate = user('[job-update] {"ok":true}')
const isNotice = (m: MessageLike) => m.role === 'user' && (m.parts?.[0]?.text ?? '').startsWith('[job-update]')

test('a card is live until the person replies; app notices do not answer it', () => {
  assert.deepEqual(choiceCardState([user('Build a magazine'), ask], 1), { active: true })
  assert.deepEqual(choiceCardState([user('x'), ask, user('Next step: Go ahead')], 1), { active: false, answer: 'Next step: Go ahead' })
  assert.deepEqual(
    choiceCardState([user('x'), ask, jobUpdate, { role: 'assistant', parts: [{ type: 'text', text: 'Built.' }] }], 1, isNotice),
    { active: true },
  )
  // A newer card replaces an unanswered one.
  assert.deepEqual(choiceCardState([user('x'), ask, jobUpdate, ask], 1, isNotice), { active: false })
})

test('the chat must not auto-continue after a turn that ended on pills', () => {
  assert.equal(lastStepOfferedChoices([user('x'), ask]), true)
  assert.equal(lastStepOfferedChoices([user('x'), ask, user('Go ahead')]), false)
  // Choices in an EARLIER step of the message, then more tool work: not waiting.
  const later: MessageLike = {
    role: 'assistant',
    parts: [{ type: 'step-start' }, choicesPart, { type: 'step-start' }, { type: 'tool-readScreen', state: 'output-available' }],
  }
  assert.equal(lastStepOfferedChoices([later]), false)
  assert.equal(lastStepOfferedChoices([]), false)
})
