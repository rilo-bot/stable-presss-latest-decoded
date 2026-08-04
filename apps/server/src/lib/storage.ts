// ---------------------------------------------------------------------------
// Object storage — S3 uploads (env-gated, mirrors db.ts).
//
// Two upload paths are supported:
//   • uploadObject() — the server streams the bytes to S3 itself (proxied).
//     The browser only ever talks to our own API, so there is NO bucket-CORS
//     requirement. This is the default the client uses.
//   • presignPutUrl() — issues a short-lived presigned PUT so the browser can
//     upload DIRECTLY to S3 (needs a bucket CORS policy). Kept for large files.
//
// When S3 is NOT configured (local dev / WebContainer preview), isConfigured()
// is false and the upload route tells the client to fall back to inline data
// URLs, so development keeps working with zero setup. Real object storage
// belongs to deployment, exactly like the MongoDB gate in db.ts.
//
// Provider-agnostic: written against the S3 API, so a custom S3_ENDPOINT also
// lets it target Cloudflare R2 / MinIO / Backblaze / Spaces unchanged.
// ---------------------------------------------------------------------------

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import type { ObjectCannedACL } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Readable } from 'node:stream'

const BUCKET = (process.env.S3_BUCKET ?? '').trim()
const REGION = (process.env.S3_REGION ?? process.env.AWS_REGION ?? '').trim()
const ACCESS_KEY_ID = (process.env.AWS_ACCESS_KEY_ID ?? '').trim()
const SECRET_ACCESS_KEY = (process.env.AWS_SECRET_ACCESS_KEY ?? '').trim()
// Optional: custom endpoint (S3-compatible providers) and CDN/public base URL.
const ENDPOINT = (process.env.S3_ENDPOINT ?? '').trim()
const PUBLIC_BASE_URL = (process.env.S3_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '')
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true'
// ACL applied to uploaded objects. Defaults to NONE, because public read comes
// from the bucket POLICY on `public/*` — never from an ACL.
//
// This used to default to 'public-read', which the bucket rejects outright: its
// Object Ownership is BucketOwnerEnforced and BlockPublicAcls is on (verified
// against the live bucket), so every PutObject carrying an ACL failed with
// AccessControlListNotSupported and was silently retried without it (see
// uploadObject). The upload still succeeded, so nothing looked broken — it just
// cost a wasted S3 round trip on every single upload.
//
// Set S3_OBJECT_ACL=public-read only for a bucket that still has ACLs ENABLED;
// the retry below keeps that case working either way.
const OBJECT_ACL = (process.env.S3_OBJECT_ACL ?? 'none').trim()
// Absolute origin of THIS API in deployment (e.g. https://my-api.onrender.com),
// used to build viewable file URLs when the bucket isn't public. Unset in local
// dev → relative '/api/...' paths, which resolve same-origin via the Vite proxy.
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? '').trim().replace(/\/$/, '')

const CONFIGURED = !!(BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY)

/**
 * Where `public/` objects are served from — DERIVED, so it works with no extra
 * configuration.
 *
 * Objects under `public/` are covered by the bucket's public-read policy, so the
 * bucket's own origin can serve them and there is nothing for this API to do.
 * Deriving the origin rather than requiring S3_PUBLIC_BASE_URL means the default
 * is the public path, and a deployment cannot silently fall back to proxying
 * every image because one env var went unset.
 *
 * Override with S3_PUBLIC_BASE_URL to put a CDN in front. Set it to `none` for a
 * bucket with NO public-read policy, which forces everything through the API
 * proxy — correct but slower, and the only safe setting there.
 */
const PROXY_ONLY = PUBLIC_BASE_URL.toLowerCase() === 'none'

function derivePublicBase(): string {
  // `none` must return early, not fall through to the derived origin below —
  // otherwise opting out of public delivery silently did nothing.
  if (PROXY_ONLY) return ''
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL
  if (!CONFIGURED) return ''
  if (ENDPOINT) {
    // S3-compatible providers (R2 / MinIO / Spaces). Path style puts the bucket
    // in the path; virtual-hosted style puts it in the hostname.
    const trimmed = ENDPOINT.replace(/\/$/, '')
    if (FORCE_PATH_STYLE) return `${trimmed}/${BUCKET}`
    return trimmed.replace(/^(https?:\/\/)/i, `$1${BUCKET}.`)
  }
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com`
}

const PUBLIC_BASE = derivePublicBase()

let _client: S3Client | null = null
function client(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: FORCE_PATH_STYLE } : {}),
  })
  return _client
}

/** True when S3 credentials + bucket are present. Routes degrade gracefully when false. */
export function isConfigured(): boolean {
  return CONFIGURED
}

/**
 * The one prefix the bucket policy grants anonymous `s3:GetObject` on. EVERY new
 * upload lands under it (see buildKey in routes/uploads.ts) — that is the project
 * rule, so use this constant rather than writing the literal at a call site.
 */
export const PUBLIC_PREFIX = 'public/'

/** True for a key the bucket will serve directly to anyone who has the URL. */
export function isPublicKey(key: string): boolean {
  return key.startsWith(PUBLIC_PREFIX)
}

/**
 * Refuse to WRITE anywhere but `public/`.
 *
 * Every upload in this product lands under `public/` — that is the rule, and this
 * is what makes it a rule rather than a habit that eleven call sites happen to
 * share. A key built without the prefix used to "work": the object stored fine and
 * publicUrl() quietly returned a proxied URL instead, so the only symptom was every
 * view of that file being served by the API forever. That is precisely how the
 * magazine image-import path drifted.
 *
 * READS are deliberately not guarded — getObject/headObject/presignGetUrl must keep
 * serving the legacy objects that were written before this rule.
 */
function assertPublicKey(key: string, op: string): void {
  if (isPublicKey(key)) return
  throw new Error(
    `[storage] refusing to ${op} outside '${PUBLIC_PREFIX}': "${key}". ` +
      `Every upload must be written under '${PUBLIC_PREFIX}' — build keys with storage.PUBLIC_PREFIX.`,
  )
}

/**
 * Browser-viewable URL we STORE for an object key.
 *
 * • Keys under `public/` get the bucket's own URL — served straight from S3 (or a
 *   CDN in front of it) with no server in the path. THIS IS THE DEFAULT: the
 *   origin is derived from the bucket and region, so no env var is required, and
 *   every new upload is written under `public/`.
 * • Anything else routes through our API, which streams the object from S3 (see
 *   GET /api/uploads/file/*). Absolute in deployment (API_PUBLIC_URL), relative in
 *   dev, where it resolves same-origin through the Vite proxy. Only LEGACY keys
 *   written before the public/-everywhere rule take this branch.
 *
 * Keep the `public/` test even though nothing new writes outside it: the legacy
 * objects are still out there, and handing out a direct bucket URL for one would
 * produce a 403 the bucket policy can never satisfy — a broken image whose cause
 * is invisible from the app.
 */
export function publicUrl(key: string): string {
  if (PUBLIC_BASE && isPublicKey(key)) return `${PUBLIC_BASE}/${key}`
  return `${API_PUBLIC_URL}/api/uploads/file/${key}`
}

/**
 * The object key behind a URL we previously handed out — the inverse of
 * publicUrl(), for callers that stored only the URL on a record and now need to
 * delete the object behind it.
 *
 * Returns null for anything that is not ours (a pasted third-party URL, a `data:`
 * fallback, a bucket that isn't this one), which is what makes it safe to call on
 * a free-text image field: a URL we don't recognise simply isn't deleted.
 */
export function keyFromUrl(url: string): string | null {
  const u = (url ?? '').trim()
  if (!u || u.startsWith('data:')) return null

  // Proxied form, absolute or relative: [origin]/api/uploads/file/<key>
  const viaApi = u.match(/\/api\/uploads\/file\/(.+)$/)
  if (viaApi?.[1]) {
    try {
      return decodeURIComponent(viaApi[1].split('?')[0]!)
    } catch {
      return null
    }
  }

  // Direct bucket/CDN form: <PUBLIC_BASE>/<key>
  if (PUBLIC_BASE && u.startsWith(`${PUBLIC_BASE}/`)) {
    const key = u.slice(PUBLIC_BASE.length + 1).split('?')[0]!
    try {
      return decodeURIComponent(key) || null
    } catch {
      return null
    }
  }
  return null
}

/** Short-lived presigned GET URL — lets the browser read a private object. */
export async function presignGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(client(), cmd, { expiresIn })
}

/**
 * Fetch an object for streaming back through our API. Serving from our own
 * origin keeps a private bucket viewable AND CORS-clean (our global CORS sends
 * Access-Control-Allow-Origin: *), so crossOrigin <img>/canvas usage works.
 */
export async function getObject(key: string): Promise<{
  body: NodeJS.ReadableStream
  contentType?: string
  contentLength?: number
}> {
  const out = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return {
    body: out.Body as NodeJS.ReadableStream,
    contentType: out.ContentType,
    contentLength: out.ContentLength,
  }
}

/**
 * Verify an object exists and read its size/type WITHOUT downloading it. Used by
 * confirm-upload to validate a presigned-PUT upload actually landed and to read
 * the real size/content-type from S3 rather than trusting the client. Throws if
 * the object is missing.
 */
export async function headObject(key: string): Promise<{ contentLength: number; contentType: string }> {
  const out = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
  return { contentLength: out.ContentLength ?? 0, contentType: out.ContentType ?? 'application/octet-stream' }
}

/**
 * Download an object's full bytes into a Buffer. Convenience over getObject()
 * for callers that need the whole file in memory rather than a stream — e.g.
 * the extraction worker, which hands the source PDF straight to MuPDF. Reuses
 * the same private-bucket-safe S3 GET.
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const out = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const stream = out.Body as Readable
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}

/**
 * Issue a short-lived presigned PUT URL the browser can upload to directly.
 * The client must PUT with the SAME Content-Type passed here.
 */
export async function presignPutUrl(opts: {
  key: string
  contentType: string
  expiresIn?: number
}): Promise<string> {
  assertPublicKey(opts.key, 'presign an upload for')
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
  })
  return getSignedUrl(client(), cmd, { expiresIn: opts.expiresIn ?? 300 })
}

/**
 * Server-side (proxied) upload: stream the bytes straight to S3. The browser
 * uploads to our own API, so this needs no bucket CORS policy.
 *
 * Whether the result is publicly readable is decided by the KEY, not by this
 * function: the bucket policy grants read on `public/*`. The ACL attempt below is
 * a leftover for buckets that still have ACLs enabled.
 */
export async function uploadObject(opts: {
  key: string
  contentType: string
  body: Buffer | Uint8Array
}): Promise<void> {
  assertPublicKey(opts.key, 'upload')
  const base = { Bucket: BUCKET, Key: opts.key, Body: opts.body, ContentType: opts.contentType }
  const acl = OBJECT_ACL && OBJECT_ACL !== 'none' ? (OBJECT_ACL as ObjectCannedACL) : undefined
  try {
    await client().send(new PutObjectCommand(acl ? { ...base, ACL: acl } : base))
  } catch (err) {
    // Bucket has ACLs disabled (Object Ownership enforced) — retry without the
    // ACL and rely on a bucket policy for public read.
    const name = (err as { name?: string; Code?: string })?.name ?? (err as { Code?: string })?.Code
    if (acl && name === 'AccessControlListNotSupported') {
      await client().send(new PutObjectCommand(base))
      return
    }
    throw err
  }
}

export interface StoredObject {
  key: string
  size: number
  lastModified: Date | null
}

/**
 * List every object under a prefix, following pagination to the end.
 *
 * ALWAYS pass a prefix. This bucket is shared with other Decoded Studios apps —
 * its policy also publishes a legacy `uploads/*` tree that nothing in this
 * codebase writes or owns — so a prefix-less listing would enumerate files that
 * are not ours to reason about, let alone delete.
 */
export async function listObjectKeys(prefix: string): Promise<StoredObject[]> {
  if (!CONFIGURED) return []
  if (!prefix) throw new Error('listObjectKeys requires a prefix — this bucket is shared.')

  const out: StoredObject[] = []
  let token: string | undefined
  do {
    const page = await client().send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of page.Contents ?? []) {
      if (!obj.Key) continue
      out.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified ?? null })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return out
}

/**
 * Delete one object. Returns true if S3 accepted the delete, false if it failed.
 *
 * NEVER THROWS, and that is deliberate: every caller is cleaning up bytes behind a
 * record change that has already been decided. A bucket hiccup must not fail the
 * user's save and leave them staring at an error for an image they successfully
 * removed — an orphaned object is the strictly better outcome, and it is the
 * outcome we had everywhere before this function existed.
 *
 * S3 DeleteObject is idempotent: deleting a key that isn't there succeeds, so a
 * double-delete (two tabs, a retry) is not an error case.
 */
export async function deleteObject(key: string): Promise<boolean> {
  if (!CONFIGURED || !key) return false
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (err) {
    console.warn('[storage] delete failed for', key, '—', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Delete the object behind a stored URL, if that URL is one of ours. A no-op for a
 * pasted third-party link or a `data:` fallback — see keyFromUrl.
 */
export async function deleteObjectByUrl(url: string): Promise<boolean> {
  const key = keyFromUrl(url)
  return key ? deleteObject(key) : false
}

export const storage = {
  isConfigured,
  presignPutUrl,
  presignGetUrl,
  getObject,
  headObject,
  downloadObject,
  publicUrl,
  uploadObject,
  listObjectKeys,
  deleteObject,
  deleteObjectByUrl,
  keyFromUrl,
  isPublicKey,
  PUBLIC_PREFIX,
}
