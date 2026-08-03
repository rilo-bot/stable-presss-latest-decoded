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
import { attachAccountOptional } from '../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'
import { buildBlogSystemPrompt, type BlogContext } from '../lib/agent/blogPrompt.js'
import { buildBlogTools } from '../lib/agent/blogTools.js'

const router = Router()

router.post('/chat', attachAccountOptional, async (req, res) => {
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
  try {
    const result = streamText({
      model: getAgentModel(),
      system: buildBlogSystemPrompt(req.account, body.blogContext),
      messages: await convertToModelMessages(body.messages),
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
