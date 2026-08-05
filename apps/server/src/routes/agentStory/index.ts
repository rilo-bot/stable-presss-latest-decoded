// ---------------------------------------------------------------------------
// "Story Studio" assistant route.
//   POST /api/agent/story/chat — streaming chat; writes a story draft and files
//                                it via client-executed tools (the browser renders
//                                the cards and performs the save).
//
// Same server spine as routes/agentProfile.ts (OpenRouter key stays server-side);
// the deltas are the Story Studio persona + toolset.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { attachAccountOptional } from '../../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../../lib/agent/provider.js'
import { repairToolResults } from '../../lib/agent/repairMessages.js'
import { buildStorySystemPrompt, type StoryContext } from '../../lib/agent/storyPrompt.js'
import { buildStoryTools } from '../../lib/agent/storyTools.js'

const router = Router()

router.post('/chat', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The Story Studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = req.body as { messages?: UIMessage[]; storyContext?: StoryContext }
  if (!Array.isArray(body?.messages)) {
    res.status(400).json({ error: 'messages[] is required' })
    return
  }
  if (body.messages.length > 100) {
    res.status(413).json({ error: 'This conversation is too long — please start a new story.' })
    return
  }
  // A tool call with no result poisons EVERY later turn in the conversation, not
  // just this one — close any off before the SDK sees them. See
  // lib/agent/repairMessages.ts for how a result goes missing in the first place.
  const repaired = repairToolResults(body.messages)
  if (repaired.repaired > 0) {
    console.warn(
      `[agent-story] closed ${repaired.repaired} unanswered tool call(s) so the chat could continue: ${repaired.tools.join(', ')}`,
    )
  }

  try {
    const result = streamText({
      model: getAgentModel(),
      system: buildStorySystemPrompt(req.account, body.storyContext),
      messages: await convertToModelMessages(repaired.messages),
      tools: buildStoryTools(),
      stopWhen: stepCountIs(12),
    })
    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        console.error('[agent-story] stream error:', error)
        return 'Sorry — I hit a snag just then. Please try again.'
      },
    })
  } catch (err) {
    console.error('[agent-story] error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'The Story Studio assistant hit a snag. Please try again.' })
  }
})

export default router
