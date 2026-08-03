import { Router, raw } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../lib/auth.js'
import { storage } from '../lib/storage.js'

const router = Router()

// ── Allow-list of acceptable content types, grouped so we can size-cap per kind.
const IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
])
const DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
])
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/webm'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

const MB = 1024 * 1024
function maxBytesFor(contentType: string): number | null {
  if (IMAGE_TYPES.has(contentType)) return 15 * MB
  if (DOC_TYPES.has(contentType)) return 25 * MB
  if (AUDIO_TYPES.has(contentType)) return 250 * MB
  if (VIDEO_TYPES.has(contentType)) return 500 * MB
  return null // not allowed
}

/** Normalise an arbitrary filename into a safe, short, lowercase-extension slug. */
function safeName(name: string): string {
  const base = (name || 'file').split(/[\\/]/).pop() || 'file'
  const dot = base.lastIndexOf('.')
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'file'
  const ext = (dot > 0 ? base.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase().slice(0, 8)
  return ext ? `${stem}.${ext}` : stem
}

const ALLOWED_KINDS = new Set(['party', 'horse', 'media', 'evidence', 'avatar', 'podcast', 'blog', 'misc'])

function buildKey(kind: unknown, userId: string, fileName: unknown): string {
  const folder = ALLOWED_KINDS.has(String(kind)) ? String(kind) : 'misc'
  return `${folder}/${userId}/${crypto.randomUUID()}-${safeName(String(fileName ?? 'file'))}`
}

// Raw body parser for the proxied upload. 60 MB covers images, docs and short
// audio/video; larger media should use the presigned /sign path + bucket CORS.
const rawUpload = raw({ type: () => true, limit: '60mb' })

/**
 * POST /api/uploads/direct?kind=&filename=
 * Body: raw file bytes; Content-Type header = the file's type.
 * Returns: { url, key } — the server streams the bytes to S3 (no bucket CORS
 *          needed because the browser only talks to this API).
 *
 * 501 (configured:false) when S3 isn't set up, so the client falls back to an
 * inline data URL and dev keeps working with no credentials.
 */
router.post('/direct', requireAuth, rawUpload, async (req, res) => {
  if (!storage.isConfigured()) {
    res.status(501).json({ error: 'Object storage is not configured on this server.', configured: false })
    return
  }

  const contentType = String(req.headers['content-type'] ?? '').split(';')[0]!.trim()
  const maxBytes = maxBytesFor(contentType)
  if (maxBytes === null) {
    res.status(415).json({ error: `Unsupported file type: ${contentType || 'unknown'}` })
    return
  }

  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: 'Empty upload body.' })
    return
  }
  if (body.length > maxBytes) {
    res.status(413).json({ error: `File is too large (max ${Math.round(maxBytes / MB)} MB for this type).` })
    return
  }

  const key = buildKey(req.query.kind, req.user!.sub, req.query.filename)
  try {
    await storage.uploadObject({ key, contentType, body })
    res.json({ url: storage.publicUrl(key), key })
  } catch (err) {
    console.error('[uploads] direct upload failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Could not store the file.' })
  }
})

/**
 * POST /api/uploads/sign
 * Body: { fileName, contentType, kind?, size? }
 * Returns: { uploadUrl, publicUrl, key } — browser PUTs the file to uploadUrl
 *          with the SAME Content-Type, then saves publicUrl on its record.
 *
 * 501 (configured:false) when S3 isn't set up, so the client falls back to an
 * inline data URL and dev keeps working with no credentials.
 */
router.post('/sign', requireAuth, async (req, res) => {
  if (!storage.isConfigured()) {
    res.status(501).json({ error: 'Object storage is not configured on this server.', configured: false })
    return
  }

  const { fileName, contentType, kind, size } = (req.body ?? {}) as {
    fileName?: string; contentType?: string; kind?: string; size?: number
  }

  if (!contentType || typeof contentType !== 'string') {
    res.status(400).json({ error: 'contentType is required' })
    return
  }
  const maxBytes = maxBytesFor(contentType)
  if (maxBytes === null) {
    res.status(415).json({ error: `Unsupported file type: ${contentType}` })
    return
  }
  if (typeof size === 'number' && size > maxBytes) {
    res.status(413).json({ error: `File is too large (max ${Math.round(maxBytes / MB)} MB for this type).` })
    return
  }

  const folder = ALLOWED_KINDS.has(String(kind)) ? String(kind) : 'misc'
  const userId = req.user!.sub
  const key = `${folder}/${userId}/${crypto.randomUUID()}-${safeName(String(fileName ?? 'file'))}`

  try {
    const uploadUrl = await storage.presignPutUrl({ key, contentType, expiresIn: 300 })
    res.json({ uploadUrl, publicUrl: storage.publicUrl(key), key })
  } catch (err) {
    console.error('[uploads] presign failed:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Could not create upload URL.' })
  }
})

/**
 * GET /api/uploads/file/<key>
 * Public (so it works in <img> tags). Streams the object from S3 through this
 * API, so a fully PRIVATE bucket can still serve viewable assets — no public
 * policy and no bucket CORS needed (our global CORS makes it crossOrigin-safe).
 * Keys are UUID-prefixed and effectively unguessable. Cached a day in-browser.
 */
router.get('/file/*', async (req, res) => {
  if (!storage.isConfigured()) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  // Router-relative URL is '/file/<key>' (key may contain '/'); robust across
  // Express 4/5 wildcard-param differences.
  const key = decodeURIComponent((req.url.replace(/^\/file\//, '').split('?')[0]) ?? '')
  if (!key) {
    res.status(400).json({ error: 'Missing key' })
    return
  }
  try {
    const obj = await storage.getObject(key)
    if (obj.contentType) res.setHeader('Content-Type', obj.contentType)
    if (obj.contentLength != null) res.setHeader('Content-Length', String(obj.contentLength))
    res.setHeader('Cache-Control', 'public, max-age=86400')
    obj.body.on('error', () => { if (!res.headersSent) res.status(502).end() })
    obj.body.pipe(res)
  } catch (err) {
    console.error('[uploads] file read failed:', err instanceof Error ? err.message : err)
    res.status(404).json({ error: 'Not found' })
  }
})

export default router
