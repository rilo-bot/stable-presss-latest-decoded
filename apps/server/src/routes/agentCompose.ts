// ---------------------------------------------------------------------------
// POST /api/agent/compose — the AI field-composer behind the ✨ button on form
// fields. Given a field label, the entity kind, the facts the form already holds,
// and an optional typed/dictated brief, Claude writes that ONE field's text.
//
// Same server spine as routes/agent.ts (OpenRouter key stays server-side). It is
// a prose helper, not a data tool: the prompt forbids inventing racing facts,
// names, numbers or IDs that weren't supplied (the no-fake-data policy).
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { generateText } from 'ai'
import { attachAccountOptional } from '../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'

const router = Router()

interface ComposeBody {
  field?: { key?: string; label?: string }
  entityKind?: string
  context?: Record<string, unknown>
  instruction?: string
  currentValue?: string
}

router.post('/', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The writing assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = (req.body ?? {}) as ComposeBody
  const label = typeof body.field?.label === 'string' ? body.field.label.trim() : ''
  if (!label) {
    res.status(400).json({ error: 'field.label is required' })
    return
  }
  const entityKind = typeof body.entityKind === 'string' ? body.entityKind : 'record'
  const instruction = (typeof body.instruction === 'string' ? body.instruction : '').slice(0, 2000)
  const currentValue = (typeof body.currentValue === 'string' ? body.currentValue : '').slice(0, 4000)
  // Keep the context blob bounded so a huge form can't blow the prompt.
  let contextJson = '{}'
  try {
    contextJson = JSON.stringify(body.context ?? {}).slice(0, 6000)
  } catch {
    contextJson = '{}'
  }

  const system = [
    `You write a single field value for the Stable Press thoroughbred-racing CRM. Write ONLY the "${label}" field for this ${entityKind}.`,
    'Use ONLY the facts given in CONTEXT and the user brief. Do NOT invent or guess racing facts, names, dates, numbers, records, prices, ratings, or registration/microchip numbers that are not provided.',
    'If there is not enough to say something specific, write a brief, honest, usable line in the right voice rather than fabricating details.',
    'House style: clear, professional, warm and concise. Match the length to the field — a summary or lead is 2–3 sentences; a pull-quote is one short sentence; notes / a bio / pedigree notes are a short paragraph; a profession line is one phrase.',
    'Return ONLY the field text itself — no preamble, no surrounding quotation marks, no markdown, no field label.',
  ].join('\n')

  const prompt = [
    `ENTITY KIND: ${entityKind}`,
    `FIELD: ${label}`,
    `CONTEXT (known facts):\n${contextJson}`,
    `CURRENT VALUE (may be empty — improve/rewrite if present):\n${currentValue || '(empty)'}`,
    `USER BRIEF (optional steer, may be empty):\n${instruction || '(none — compose from the context)'}`,
    '',
    `Write the ${label} now.`,
  ].join('\n')

  try {
    const { text } = await generateText({ model: getAgentModel(), system, prompt })
    // Strip a stray wrapping pair of quotes the model sometimes adds.
    const clean = text.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
    res.json({ text: clean })
  } catch (err) {
    console.error('[agent-compose] error:', err)
    res.status(502).json({ error: "I couldn't draft that just now — please try again." })
  }
})

export default router
