// ---------------------------------------------------------------------------
// In-editor "Studio Assistant" routes.
//   POST /api/agent/editor/chat        — streaming chat; reads/edits the open
//                                        draft via client-executed tools.
//   POST /api/agent/editor/suggestions — 3 page-aware suggestion chips (JSON).
//
// Same server spine as routes/agent.ts (OpenRouter key stays server-side); the
// only deltas are the editor persona + the editor toolset.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { streamText, generateObject, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { z } from 'zod'
import { attachAccountOptional } from '../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'
import { buildEditorSystemPrompt, type EditorContext } from '../lib/agent/editorPrompt.js'
import { buildEditorTools } from '../lib/agent/editorTools.js'

const router = Router()

router.post('/chat', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = req.body as { messages?: UIMessage[]; editorContext?: EditorContext }
  if (!Array.isArray(body?.messages)) {
    res.status(400).json({ error: 'messages[] is required' })
    return
  }
  if (body.messages.length > 100) {
    res.status(413).json({ error: 'This conversation is too long — please start a new chat.' })
    return
  }
  try {
    const result = streamText({
      model: getAgentModel(),
      system: buildEditorSystemPrompt(req.account, body.editorContext),
      messages: await convertToModelMessages(body.messages),
      tools: buildEditorTools(req.account),
      stopWhen: stepCountIs(8),
    })
    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        console.error('[agent-editor] stream error:', error)
        return 'Sorry — I hit a snag just then. Please try again.'
      },
    })
  } catch (err) {
    console.error('[agent-editor] error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'The studio assistant hit a snag. Please try again.' })
  }
})

const SUGGESTIONS_SCHEMA = z.object({
  suggestions: z
    .array(
      z.object({
        label: z.string().describe('Short chip label, max ~5 words.'),
        prompt: z.string().describe('The full instruction to send when the chip is clicked.'),
        regionId: z.string().optional().describe('The region this targets, if any.'),
      }),
    )
    .describe('Exactly three, most useful first.'),
})

router.post('/suggestions', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ suggestions: [] })
    return
  }
  const ctx = (req.body as { editorContext?: EditorContext })?.editorContext
  if (!ctx?.currentPage) {
    res.json({ suggestions: [] })
    return
  }
  try {
    const { object } = await generateObject({
      model: getAgentModel(),
      schema: SUGGESTIONS_SCHEMA,
      system:
        'You suggest exactly 3 concrete, page-aware next actions for an editor working on a fixed-layout magazine page. ' +
        'Prefer filling empty high-impact regions (headline, hero, lead) first. Each suggestion: a short chip label and a ' +
        'full instruction prompt that names the target region id. Use ONLY region ids present in the context. Be specific.',
      prompt: `Current page context:\n${JSON.stringify(ctx.currentPage)}\n\nReturn 3 suggestions.`,
    })
    res.json({ suggestions: object.suggestions.slice(0, 3) })
  } catch (err) {
    console.error('[agent-editor] suggestions error:', err)
    res.json({ suggestions: [] }) // client falls back to heuristics
  }
})

export default router
