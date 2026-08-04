// ---------------------------------------------------------------------------
// Document ingest for the Magazine Builder composer.
//
//   POST /api/agent/editor/ingest — read ONE uploaded PDF / image / text file and
//                                   return a compact digest the generator can
//                                   design and write from.
//
// The path keeps its `/editor` prefix because the browser already calls it there
// (agent/attachments/documentUpload.ts) and it is the only endpoint left on this
// router. Three others lived here — `/chat`, `/compose` and `/suggestions` — and
// they were the v1 template builder's Studio Assistant: a streaming chat driving
// client-executed named-region edit tools, a bulk region-fill pass, and page-aware
// suggestion chips. All three went with that builder; the Magazine Builder has its
// own page agent (lib/magazineV2/agent.ts) and its own generation pipeline.
// ---------------------------------------------------------------------------

import { Router, raw } from 'express'
import { attachAccount } from '../lib/auth.js'
import { canAccessNewsroom } from '../lib/rbac.js'
import { isAgentConfigured } from '../lib/agent/provider.js'
import { ingestDocument, ingestKind } from '../lib/agent/documentIngest.js'

const router = Router()

// The in-editor assistant only backs the staff-gated magazine studio, so every
// route here requires a signed-in STAFF account. (Without this the LLM/OCR
// endpoint would be an open, unauthenticated OCR/LLM proxy.)
router.use(attachAccount)
router.use((req, res, next) => {
  if (!canAccessNewsroom(req.account)) {
    res.status(403).json({ error: 'Staff access required.' })
    return
  }
  next()
})

// POST /api/agent/editor/ingest?filename=  — analyse an uploaded PDF/image/text
// file ONCE into a compact digest the agent can place from. Body: raw file bytes;
// Content-Type header = the file's type. Same proxied pattern as /api/uploads.
const MB = 1024 * 1024
const rawDoc = raw({ type: () => true, limit: '50mb' })
router.post('/ingest', rawDoc, async (req, res) => {
  if (!isAgentConfigured()) {
    res.status(503).json({ error: 'The studio assistant is resting — OPENROUTER_API_KEY is not configured on the server.' })
    return
  }
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0]!.trim()
  const name = String(req.query.filename ?? 'document')
  const kind = ingestKind(contentType)
  if (!kind) {
    res.status(415).json({ error: `I can read PDFs, Word docs, images and text files — "${contentType || 'that type'}" isn't supported yet.` })
    return
  }
  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: 'The file came through empty — please try again.' })
    return
  }
  const cap = kind === 'image' ? 20 * MB : 50 * MB
  if (body.length > cap) {
    res.status(413).json({ error: `That file is a bit big (max ${Math.round(cap / MB)} MB) — try a smaller one.` })
    return
  }
  // Optional cap on scanned-PDF OCR pages — callers building a short preview pass
  // a small number so the read finishes in seconds rather than OCR'ing every page.
  const mp = Number(req.query.maxPages)
  const maxOcrPages = Number.isInteger(mp) && mp > 0 ? mp : undefined
  try {
    const { digest, fullText } = await ingestDocument({ bytes: body, contentType, name, maxOcrPages })
    res.json({ digest, fullText })
  } catch (err) {
    console.error('[agent-editor] ingest error:', err)
    const msg = err instanceof Error ? err.message : ''
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError' || /timed?\s*out/i.test(msg))) {
      // ingestDocument crafts user-facing timeout messages (e.g. the image one);
      // pass those through instead of always answering with the PDF advice.
      res.status(504).json({
        error: msg.startsWith('Reading that image timed out')
          ? msg
          : 'Reading that document took too long — it may be very long or image-heavy. Try a smaller or text-based file.',
      })
      return
    }
    // A transient upstream/provider failure (e.g. every OCR page call errored) is
    // retryable and NOT the file's fault — pass its "try again" message through as
    // a 502 rather than a 422 that wrongly blames the document.
    if ((err as { retryable?: boolean } | null)?.retryable) {
      res.status(502).json({ error: msg || 'That failed just now — please try again in a moment.' })
      return
    }
    // ingestDocument throws friendly, user-facing messages for known cases; pass
    // those straight through (422) rather than masking them with the generic line.
    // ("couldn't read that" covers the Word-document and image messages.)
    const friendly = /image-based|couldn't read any|couldn't read that|no pages|looks empty|Unsupported file type/i.test(msg)
    res.status(friendly ? 422 : 500).json({
      error: friendly
        ? msg
        : "I couldn't read that document just now — try a different file, or paste the key details and I'll place them.",
    })
  }
})

export default router
