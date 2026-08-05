// ---------------------------------------------------------------------------
// "Article Studio" assistant route.
//   POST /api/agent/article/chat — streaming chat; edits ONE open article in
//                                  place via client-executed tools (the browser
//                                  performs the saves through the gated
//                                  /api/articles/:id endpoint).
//
// Same server spine as routes/agentStory.ts (OpenRouter key stays server-side);
// the deltas are the Article Studio persona + toolset + per-turn ArticleContext.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { attachAccountOptional } from '../../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../../lib/agent/provider.js'
import { repairToolResults } from '../../lib/agent/repairMessages.js'
import { buildArticleSystemPrompt, type ArticleContext } from '../../lib/agent/articlePrompt.js'
import { buildArticleTools } from '../../lib/agent/articleTools.js'

const router = Router()

router.post('/chat', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The Article Studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = req.body as { messages?: UIMessage[]; articleContext?: ArticleContext }
  if (!Array.isArray(body?.messages)) {
    res.status(400).json({ error: 'messages[] is required' })
    return
  }
  if (body.messages.length > 100) {
    res.status(413).json({ error: 'This conversation is too long — please start a new chat.' })
    return
  }
  // A tool call with no result poisons EVERY later turn in the conversation, not
  // just this one — close any off before the SDK sees them. See
  // lib/agent/repairMessages.ts for how a result goes missing in the first place.
  const repaired = repairToolResults(body.messages)
  if (repaired.repaired > 0) {
    console.warn(
      `[agent-article] closed ${repaired.repaired} unanswered tool call(s) so the chat could continue: ${repaired.tools.join(', ')}`,
    )
  }

  try {
    const result = streamText({
      model: getAgentModel(),
      system: buildArticleSystemPrompt(req.account, body.articleContext),
      messages: await convertToModelMessages(repaired.messages),
      tools: buildArticleTools(),
      stopWhen: stepCountIs(10),
    })
    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        console.error('[agent-article] stream error:', error)
        return 'Sorry — I hit a snag just then. Please try again.'
      },
    })
  } catch (err) {
    console.error('[agent-article] error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'The Article Studio assistant hit a snag. Please try again.' })
  }
})

export default router
