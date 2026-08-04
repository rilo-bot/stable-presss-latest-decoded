import { Router, raw } from 'express'
import type { NextFunction, Request, Response } from 'express'
import crypto from 'crypto'
import { attachAccount, attachAccountOptional } from '../lib/auth.js'
import { canVerifyClaims } from '../lib/rbac.js'
import { accountCanAny } from '../lib/effectiveAccess.js'
import { rateLimit } from '../lib/rateLimit.js'
import { storage } from '../lib/storage.js'
import type { PermissionAction } from '../lib/permissionCatalogue.js'

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

/**
 * WHAT EACH UPLOAD KIND REQUIRES.
 *
 * Uploading is not one power. Both endpoints below used to require nothing but a
 * valid session, which meant `media.upload_own` and `media.manage_all` restricted
 * nothing at all: any signed-in reader could mint a presigned S3 PUT URL or push
 * 500 MB of video through `/direct`. See docs/CRM-MODULES-PERMISSIONS-REVIEW.md §4.1.
 *
 * An empty array means "any signed-in account", and that is deliberate for the
 * four identity/self-service kinds — a member proving who they are, or managing a
 * horse or party they already control, is not a newsroom media action and gating
 * it on a staff permission would break the claim flow outright.
 *
 * Otherwise ANY of the listed permissions is enough. Several kinds list a second
 * permission because the primary one is not held by the roles that legitimately
 * do the work: the seeded `editor` may edit any episode but was never granted
 * `podcast.audio.upload`, and a blog-only author role would hold `blog.create`
 * without `media.upload_own`.
 */
const KIND_PERMISSIONS: Record<string, PermissionAction[]> = {
  evidence: [], // proving your OWN identity — pre-verification, by definition
  avatar: [],   // your own profile picture
  party: [],    // member self-service on a party they manage
  horse: [],    // member self-service on a horse they manage
  media: ['media.upload_own', 'media.manage_all'],
  blog: ['media.upload_own', 'blog.create'],
  podcast: ['podcast.audio.upload', 'podcast.episode.edit_any'],
  misc: ['media.upload_own'],
}

/** The requested kind, or 'misc' — which FAILS CLOSED (it needs a permission). */
function kindOf(raw: unknown): string {
  return ALLOWED_KINDS.has(String(raw)) ? String(raw) : 'misc'
}

/**
 * Gate an upload on its kind. Runs after attachAccount, so `req.account` is the
 * resolved account rather than raw token claims.
 */
function requireUploadKind(kindFrom: (req: Request) => unknown) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const kind = kindOf(kindFrom(req))
    const needed = KIND_PERMISSIONS[kind] ?? KIND_PERMISSIONS.misc!
    if (needed.length === 0 || accountCanAny(req.account, needed)) {
      next()
      return
    }
    res.status(403).json({ error: `You do not have permission to upload ${kind} files.` })
  }
}

/**
 * Kinds whose LEGACY objects sit outside `public/` and are gated by the GET route
 * below.
 *
 * ⚠️ READ THIS BEFORE ADDING A KIND HERE — it no longer makes new uploads private.
 *
 * Every new upload now lands under `public/` (see buildKey), by an explicit
 * project decision: one prefix, every asset served straight from the bucket, no
 * per-kind exceptions. The bucket policy grants anonymous `s3:GetObject` on
 * `public/*`, so a new `evidence` object IS readable by anyone who has its URL,
 * and `publicUrl()` hands out the direct bucket URL rather than a proxied one — so
 * the gate below is not even on the path a client uses.
 *
 * What this set still does, and why it stays:
 *   • It protects the evidence objects already stored OUTSIDE `public/`, which the
 *     bucket policy cannot reach and which are only readable through this API.
 *     Those are real identity documents; dropping the gate would expose them.
 *   • It keeps the proxied route honest for any key that does reach it.
 *
 * If identity documents need to be private again, this set is not the lever — the
 * lever is buildKey, which has to stop prefixing `public/` for those kinds.
 */
const PRIVATE_KINDS = new Set(['evidence'])

/**
 * Where an object lands. ALWAYS under `public/`, for every kind.
 *
 * What grants public read is the bucket POLICY on `public/*` — not an ACL, which
 * this bucket refuses outright (Object Ownership is BucketOwnerEnforced and
 * BlockPublicAcls is on). The magazine paths already wrote everything to
 * `public/magazinesV2/…` for exactly this reason; this is the same rule applied to
 * every upload in the product, so there is one prefix and no kind that quietly
 * behaves differently.
 *
 * The consequence is deliberate and worth stating plainly: `evidence` — passport
 * scans, training licences — is public-by-URL from here on. See PRIVATE_KINDS.
 *
 * Existing objects keep their old keys and keep working: the proxy route still
 * serves any key, so nothing needs migrating.
 */
function buildKey(kind: unknown, userId: string, fileName: unknown): string {
  const k = kindOf(kind)
  return `${storage.PUBLIC_PREFIX}${k}/${userId}/${crypto.randomUUID()}-${safeName(String(fileName ?? 'file'))}`
}

// Per-account ceiling. Generous enough for a magazine's worth of images in one
// sitting, low enough that a runaway client or an abusive account cannot use the
// bucket as free storage. GETs are not counted (see lib/rateLimit.ts).
const uploadLimit = rateLimit('uploads', 120, 5 * 60_000)

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
 *
 * `requireUploadKind` runs BEFORE `rawUpload` on purpose: a caller who may not
 * upload this kind is refused without the server first buffering 60 MB of body
 * it is going to discard.
 */
router.post(
  '/direct',
  attachAccount,
  uploadLimit,
  requireUploadKind((req) => req.query.kind),
  rawUpload,
  async (req, res) => {
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

    const key = buildKey(req.query.kind, req.account!.id, req.query.filename)
    try {
      await storage.uploadObject({ key, contentType, body })
      res.json({ url: storage.publicUrl(key), key })
    } catch (err) {
      console.error('[uploads] direct upload failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: 'Could not store the file.' })
    }
  },
)

/**
 * POST /api/uploads/sign
 * Body: { fileName, contentType, kind?, size? }
 * Returns: { uploadUrl, publicUrl, key } — browser PUTs the file to uploadUrl
 *          with the SAME Content-Type, then saves publicUrl on its record.
 *
 * 501 (configured:false) when S3 isn't set up, so the client falls back to an
 * inline data URL and dev keeps working with no credentials.
 */
router.post(
  '/sign',
  attachAccount,
  uploadLimit,
  requireUploadKind((req) => (req.body ?? {}).kind),
  async (req, res) => {
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

    // Same helper as /direct, so the two endpoints cannot disagree about which
    // folder a kind lands in — the folder is what the read gate below keys on.
    const key = buildKey(kind, req.account!.id, fileName)

    try {
      const uploadUrl = await storage.presignPutUrl({ key, contentType, expiresIn: 300 })
      res.json({ uploadUrl, publicUrl: storage.publicUrl(key), key })
    } catch (err) {
      console.error('[uploads] presign failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: 'Could not create upload URL.' })
    }
  },
)

/**
 * POST /api/uploads/confirm
 * Body: { key } — the key from a previous /sign response, after the browser has
 *       PUT the bytes to S3.
 * Returns: { url, key, contentType, size } read from S3 itself.
 *
 * WHY THIS EXISTS. A presigned PUT cannot enforce a size limit: the signature
 * covers the key and the Content-Type, but S3 has no content-length ceiling to
 * check against (that needs a POST policy with content-length-range, which the
 * browser upload path here does not use). So the `size` the client declares at
 * /sign is advisory, and until this endpoint existed NOTHING ever looked at what
 * actually landed — any signed-in account could PUT an object of any size, and the
 * four self-service kinds need no permission at all.
 *
 * Magazine v2 already did it this way (`headObject` after the PUT, never trust the
 * client's numbers); this brings the generic path to the same standard.
 *
 * An object that fails the check is DELETED before we answer, so a rejected upload
 * does not leave the bytes sitting in the bucket it was refused from.
 */
router.post(
  '/confirm',
  attachAccount,
  uploadLimit,
  requireUploadKind((req) => parseKey(String((req.body ?? {}).key ?? '')).kind),
  async (req, res) => {
    if (!storage.isConfigured()) {
      res.status(501).json({ error: 'Object storage is not configured on this server.', configured: false })
      return
    }

    const key = typeof req.body?.key === 'string' ? req.body.key : ''
    const { kind, ownerId } = parseKey(key)
    // The uploader is IN the key, so confirming someone else's upload is refused
    // without a database lookup. Belt and braces: /sign only ever mints keys under
    // the caller's own id, so a mismatch means a hand-rolled request.
    if (!key || !ALLOWED_KINDS.has(kind) || ownerId !== req.account!.id) {
      res.status(400).json({ error: 'Invalid upload key.' })
      return
    }

    let head: { contentLength: number; contentType: string }
    try {
      head = await storage.headObject(key)
    } catch {
      res.status(400).json({ error: 'Upload not found — please try uploading again.' })
      return
    }

    // Read the type and size off S3, not off the request. Both caps are the same
    // ones /sign and /direct apply, so the three endpoints cannot disagree.
    const maxBytes = maxBytesFor(head.contentType)
    if (maxBytes === null) {
      await storage.deleteObject(key)
      res.status(415).json({ error: `Unsupported file type: ${head.contentType || 'unknown'}` })
      return
    }
    if (head.contentLength <= 0) {
      await storage.deleteObject(key)
      res.status(400).json({ error: 'That upload is empty.' })
      return
    }
    if (head.contentLength > maxBytes) {
      await storage.deleteObject(key)
      res.status(413).json({ error: `File is too large (max ${Math.round(maxBytes / MB)} MB for this type).` })
      return
    }

    res.json({ url: storage.publicUrl(key), key, contentType: head.contentType, size: head.contentLength })
  },
)

/**
 * Keys are `[public/]<kind>/<ownerUserId>/<uuid>-<name>`, so the folder and the
 * uploader are both recoverable from the key itself — no database lookup needed
 * to decide who may read it.
 *
 * The leading `public/` is stripped first. It is a STORAGE-VISIBILITY prefix, not
 * a kind, and reading it as one would make every public object parse as kind
 * "public" owned by "blog"/"party"/… — which would quietly exempt a kind from the
 * gate the day one is added to PRIVATE_KINDS.
 */
function parseKey(key: string): { kind: string; ownerId: string } {
  const path = key.startsWith('public/') ? key.slice('public/'.length) : key
  const [kind = '', ownerId = ''] = path.split('/')
  return { kind, ownerId }
}

/**
 * GET /api/uploads/file/<key>
 * Streams the object from S3 through this API, so a fully PRIVATE bucket can
 * still serve viewable assets — no public policy and no bucket CORS needed (our
 * global CORS makes it crossOrigin-safe). Cached a day in-browser.
 *
 * The account is attached OPTIONALLY: public kinds must keep working for anonymous
 * visitors, and only a private kind consults it.
 */
router.get('/file/*', attachAccountOptional, async (req, res) => {
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

  const { kind, ownerId } = parseKey(key)
  if (PRIVATE_KINDS.has(kind)) {
    const account = req.account
    const mayRead = !!account && (account.id === ownerId || canVerifyClaims(account))
    if (!mayRead) {
      // 404, not 403: a 403 confirms that an evidence file exists at this key.
      res.status(404).json({ error: 'Not found' })
      return
    }
    // Never let a shared cache or a proxy hold someone's identity documents.
    res.setHeader('Cache-Control', 'private, no-store')
  }

  try {
    const obj = await storage.getObject(key)
    if (obj.contentType) res.setHeader('Content-Type', obj.contentType)
    if (obj.contentLength != null) res.setHeader('Content-Length', String(obj.contentLength))
    // Only public kinds get a shared-cacheable response; the private branch above
    // already set `no-store` and must not be overwritten here.
    if (!PRIVATE_KINDS.has(kind)) res.setHeader('Cache-Control', 'public, max-age=86400')
    obj.body.on('error', () => { if (!res.headersSent) res.status(502).end() })
    obj.body.pipe(res)
  } catch (err) {
    console.error('[uploads] file read failed:', err instanceof Error ? err.message : err)
    res.status(404).json({ error: 'Not found' })
  }
})

export default router
