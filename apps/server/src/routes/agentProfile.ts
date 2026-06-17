// ---------------------------------------------------------------------------
// In-profile "Stable Studio" assistant route.
//   POST /api/agent/profile/chat — streaming chat; reads/proposes edits to the
//                                   open horse/party profile via client-executed
//                                   tools (proposals are staged in the browser).
//
// Same server spine as routes/agent.ts (OpenRouter key stays server-side); the
// deltas are the profile persona + the profile toolset.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { attachAccountOptional } from '../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'
import { buildProfileSystemPrompt, type ProfileContext } from '../lib/agent/profilePrompt.js'
import { buildProfileTools } from '../lib/agent/profileTools.js'

const router = Router()

router.post('/chat', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = req.body as { messages?: UIMessage[]; profileContext?: ProfileContext }
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
      system: buildProfileSystemPrompt(req.account, body.profileContext),
      messages: await convertToModelMessages(body.messages),
      tools: buildProfileTools(),
      stopWhen: stepCountIs(8),
    })
    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        console.error('[agent-profile] stream error:', error)
        return 'Sorry — I hit a snag just then. Please try again.'
      },
    })
  } catch (err) {
    console.error('[agent-profile] error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'The studio assistant hit a snag. Please try again.' })
  }
})

export default router
