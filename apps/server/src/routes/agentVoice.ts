// ---------------------------------------------------------------------------
// Voice endpoints for the Stablehand (push-to-talk pipeline).
//   GET  /api/agent/voice/status     — is voice enabled on the server?
//   POST /api/agent/voice/transcribe — raw audio body → { text } (OpenAI STT)
//   POST /api/agent/voice/speak      — { text } → audio/mpeg (OpenAI TTS)
//
// The transcribed text is fed into the normal /api/agent/chat flow by the
// browser, so the agent, its RBAC-scoped tools, and the persona are all reused.
// The OpenAI key stays server-side (see lib/agent/voice.ts).
// ---------------------------------------------------------------------------

import express, { Router } from 'express'
import { attachAccountOptional } from '../lib/auth.js'
import { isVoiceConfigured, transcribeAudio, synthesizeSpeech } from '../lib/agent/voice.js'

const router = Router()

router.get('/status', (_req, res) => {
  res.json({ enabled: isVoiceConfigured() })
})

// express.raw at the route level: the global json parser ignores audio/* bodies,
// so the stream reaches here intact as a Buffer.
router.post(
  '/transcribe',
  express.raw({ type: () => true, limit: '25mb' }),
  attachAccountOptional,
  async (req, res) => {
    if (!isVoiceConfigured()) {
      res.status(503).json({ error: 'Voice is resting — OPENAI_API_KEY is not configured on the server.' })
      return
    }
    const audio = req.body as Buffer
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      res.status(400).json({ error: 'An audio body is required.' })
      return
    }
    try {
      const text = await transcribeAudio(audio, String(req.headers['content-type'] ?? 'audio/webm'))
      res.json({ text })
    } catch (err) {
      console.error('[voice] transcribe error:', err)
      res.status(502).json({ error: "Sorry — I couldn't make out that recording. Please try again." })
    }
  },
)

router.post('/speak', attachAccountOptional, async (req, res) => {
  if (!isVoiceConfigured()) {
    res.status(503).json({ error: 'Voice is resting — OPENAI_API_KEY is not configured on the server.' })
    return
  }
  const text = typeof (req.body as { text?: unknown })?.text === 'string' ? (req.body as { text: string }).text.trim() : ''
  if (!text) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  if (text.length > 4000) {
    res.status(413).json({ error: 'That reply is too long to read aloud.' })
    return
  }
  try {
    const { audio, mediaType } = await synthesizeSpeech(text)
    res.setHeader('content-type', mediaType)
    res.setHeader('content-length', String(audio.length))
    res.send(audio)
  } catch (err) {
    console.error('[voice] speak error:', err)
    res.status(502).json({ error: 'Could not synthesize speech just now.' })
  }
})

export default router
