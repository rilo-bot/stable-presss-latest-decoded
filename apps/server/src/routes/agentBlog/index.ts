// ---------------------------------------------------------------------------
// "Blog Studio" assistant route.
//   POST /api/agent/blog/chat — streaming chat; writes, revises, publishes and
//                               deletes blog posts via client-executed tools (the
//                               browser performs every write against the
//                               RBAC-gated /api/blogs endpoints).
//
// Same server spine as routes/agentStory.ts (the OpenRouter key stays server-side);
// the deltas are the Blog Studio persona + toolset, and a higher step ceiling.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { attachAccount } from '../../lib/auth.js'
import { rateLimit } from '../../lib/rateLimit.js'
import { getAgentModel, isAgentConfigured } from '../../lib/agent/provider.js'
import { repairToolResults } from '../../lib/agent/repairMessages.js'
import { buildBlogSystemPrompt, type BlogContext } from '../../lib/agent/blogPrompt.js'
import { buildBlogTools } from '../../lib/agent/blogTools.js'

const router = Router()

// SIGNED IN + rate limited. This is a STAFF STUDIO — it edits content the caller
// must already be signed in to reach — yet it ran on `attachAccountOptional`, so an
// anonymous caller could spend the model key with no account to meter it against.
// Matches what agentCompose and agentInstant already do.
router.post('/chat', attachAccount, rateLimit('agent-blog', 30, 60_000), async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The Blog Studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = req.body as { messages?: UIMessage[]; blogContext?: BlogContext }
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
      `[agent-blog] closed ${repaired.repaired} unanswered tool call(s) so the chat could continue: ${repaired.tools.join(', ')}`,
    )
  }

  try {
    const result = streamText({
      model: getAgentModel(),
      system: buildBlogSystemPrompt(req.account, body.blogContext),
      messages: await convertToModelMessages(repaired.messages),
      // The account is passed so the borrowed record-lookup tools scope their
      // reads to what this reader may see; the auth header goes with it for the
      // ones that call back through our own API.
      tools: buildBlogTools(req.account, req.headers.authorization),
      // 16 rather than the Story Studio's 12. A desk conversation legitimately
      // chains more tool steps — list, open, rewrite, publish is four before the
      // model has said anything — and hitting the ceiling mid-flow reads to the
      // user as the assistant losing interest halfway through their request.
      stopWhen: stepCountIs(16),
    })
    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        console.error('[agent-blog] stream error:', error)
        return 'Sorry — I hit a snag just then. Please try again.'
      },
    })
  } catch (err) {
    console.error('[agent-blog] error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'The Blog Studio assistant hit a snag. Please try again.' })
  }
})

export default router
