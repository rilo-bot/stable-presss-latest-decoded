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
 * Kinds that are NOT public, and who may read them.
 *
 * `evidence` is a member's proof of identity — a passport scan, a training
 * licence, a stable invoice. It was served to anyone who had the URL, on the
 * reasoning that a UUID-prefixed key is unguessable (docs/AUTH-RBAC-REVIEW.md H7).
 * Unguessable is not private: the URL is stored on the claim, travels through
 * notification emails, and appears in any admin's browser history and in the
 * referrer of anything they open next.
 *
 * Everything else is public — party photos, horse images and blog media are
 * rendered in `<img>` tags on the public website, and requiring a token there
 * would simply break the site.
 *
 * This drives BOTH ends: which prefix a new object is written under (buildKey)
 * and who may read one back (the GET route). Adding a kind here is therefore
 * enough to make it private for everything uploaded from then on.
 */
const PRIVATE_KINDS = new Set(['evidence'])

/**
 * Where an object lands, and therefore whether the bucket will serve it.
 *
 * The bucket has ACLs DISABLED, so the `public-read` ACL the uploader asks for is
 * rejected and silently dropped (see storage.uploadObject). What actually grants
 * public read is the bucket POLICY, which covers `public/*` and nothing else.
 * That convention already existed — every magazine image is written to
 * `public/magazinesV2/…` for exactly this reason — but the generic upload route
 * never joined it, so party, horse, blog and media files sat outside `public/`
 * and could only ever be read back through this API.
 *
 * So: public kinds go under `public/<kind>/<userId>/…` and are directly
 * fetchable; PRIVATE_KINDS deliberately stay outside it, where the bucket policy
 * cannot reach them and the read gate below is the only way in.
 *
 * Existing objects keep their old keys and keep working — the proxy still serves
 * anything, so nothing needs migrating.
 */
function buildKey(kind: unknown, userId: string, fileName: unknown): string {
  const k = kindOf(kind)
  const tail = `${k}/${userId}/${crypto.randomUUID()}-${safeName(String(fileName ?? 'file'))}`
  return PRIVATE_KINDS.has(k) ? tail : `public/${tail}`
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
