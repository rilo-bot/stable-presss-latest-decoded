// ---------------------------------------------------------------------------
// In-editor "Studio Assistant" routes.
//   POST /api/agent/editor/chat        — streaming chat; reads/edits the open
//                                        draft via client-executed tools.
//   POST /api/agent/editor/suggestions — 3 page-aware suggestion chips (JSON).
//
// Same server spine as routes/agent.ts (OpenRouter key stays server-side); the
// only deltas are the editor persona + the editor toolset.
// ---------------------------------------------------------------------------

import { Router, raw } from 'express'
import { streamText, generateObject, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'
import { z } from 'zod'
import { attachAccountOptional } from '../lib/auth.js'
import { getAgentModel, isAgentConfigured } from '../lib/agent/provider.js'
import { buildEditorSystemPrompt, type EditorContext } from '../lib/agent/editorPrompt.js'
import { buildEditorTools } from '../lib/agent/editorTools.js'
import { ingestDocument, ingestKind } from '../lib/agent/documentIngest.js'
import { composeFromDocuments, type ComposeSource } from '../lib/agent/composeFill.js'
import type { CatalogPage } from '../lib/agent/composeGroups.js'

const router = Router()

// POST /api/agent/editor/ingest?filename=  — analyse an uploaded PDF/image/text
// file ONCE into a compact digest the agent can place from. Body: raw file bytes;
// Content-Type header = the file's type. Same proxied pattern as /api/uploads.
const MB = 1024 * 1024
const rawDoc = raw({ type: () => true, limit: '26mb' })
router.post('/ingest', attachAccountOptional, rawDoc, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0]!.trim()
  const name = String(req.query.filename ?? 'document')
  const kind = ingestKind(contentType)
  if (!kind) {
    res.status(415).json({ error: `I can read PDFs, images and text files — "${contentType || 'that type'}" isn't supported yet.` })
    return
  }
  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: 'The file came through empty — please try again.' })
    return
  }
  const cap = kind === 'image' ? 15 * MB : 25 * MB
  if (body.length > cap) {
    res.status(413).json({ error: `That file is a bit big (max ${Math.round(cap / MB)} MB) — try a smaller one.` })
    return
  }
  try {
    const { digest, fullText } = await ingestDocument({ bytes: body, contentType, name })
    res.json({ digest, fullText })
  } catch (err) {
    console.error('[agent-editor] ingest error:', err)
    const msg = err instanceof Error ? err.message : ''
    if (err instanceof Error && (err.name === 'TimeoutError' || /timed out/i.test(msg))) {
      res.status(504).json({
        error: 'Reading that document took too long — it may be very long or image-heavy. Try a shorter or text-based PDF.',
      })
      return
    }
    // ingestDocument throws friendly, user-facing messages for known cases; pass
    // those straight through (422) rather than masking them with the generic line.
    const friendly = /image-based|couldn't read any|no pages|looks empty|Unsupported file type/i.test(msg)
    res.status(friendly ? 422 : 500).json({
      error: friendly
        ? msg
        : "I couldn't read that document just now — try a different file, or paste the key details and I'll place them.",
    })
  }
})

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

// POST /api/agent/editor/compose — bulk "fill the bulletin from this document".
// Given the document text + the open magazine's region catalog, returns a
// validated fill plan covering as many pages/regions as the doc supports. The
// client re-validates against the live draft and stages it per page for review.
router.post('/compose', attachAccountOptional, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const body = req.body as { userPrompt?: string; sources?: ComposeSource[]; pages?: CatalogPage[] }
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s) => s && typeof s.text === 'string' && s.text.trim().length > 0)
    : []
  const pages = Array.isArray(body?.pages) ? body.pages : []
  if (sources.length === 0) {
    res.status(400).json({ error: 'No document text to work from — upload a document first.' })
    return
  }
  if (pages.length === 0) {
    res.status(400).json({ error: 'No editable pages to fill.' })
    return
  }
  try {
    const result = await composeFromDocuments({ userPrompt: String(body.userPrompt ?? ''), sources, pages })
    res.json(result)
  } catch (err) {
    console.error('[agent-editor] compose error:', err)
    res.status(500).json({ error: "I couldn't compose the layout just now — please try again." })
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
