// ---------------------------------------------------------------------------
// POST /api/agent/chat — the Stablehand assistant.
//
// attachAccountOptional loads the live account when a token is present (so the
// tools scope every read to the caller's role) but never rejects, so guests get
// a helpful public-data assistant too. The model + tool calls run server-side
// via the Vercel AI SDK; the response is streamed back to the browser.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { attachAccountOptional } from '../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'
import { buildSystemPrompt, type PageContext } from '../lib/agent/prompt.js'
import { buildTools } from '../lib/agent/tools.js'
import { rateLimit } from '../lib/rateLimit.js'

const router = Router()

// The assistant runs the model + up to 6 tool steps server-side per call, so it
// is expensive. Cap it per caller (keyed by account, else IP) to stop a runaway
// client or an abusive loop from hammering the model. attachAccountOptional runs
// first so signed-in users are keyed by account, not a shared proxy IP.
router.post('/chat', attachAccountOptional, rateLimit('agent-chat', 20, 60_000), async (req, res) => {
  if (!isAgentConfigured()) {
    res
      .status(503)
      .json({ error: 'The assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }

  const body = req.body as { messages?: UIMessage[]; pageContext?: PageContext }
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
      system: buildSystemPrompt(req.account, body.pageContext),
      messages: await convertToModelMessages(body.messages),
      // Forward the caller's Bearer token so ACTION tools proxy to our own gated
      // endpoints AS this user — the route enforces RBAC, not the agent.
      tools: buildTools(req.account, req.headers.authorization),
      // Let the model read a few tools then answer (tool → result → answer loops).
      stopWhen: stepCountIs(6),
    })

    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        console.error('[agent] stream error:', error)
        return 'Sorry — I hit a snag just then. Please try asking again.'
      },
    })
  } catch (err) {
    console.error('[agent] error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'The assistant hit a snag. Please try again.' })
    }
  }
})

export default router
