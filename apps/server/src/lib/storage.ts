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

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
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
// ACL applied to uploaded objects so they're readable for display.
//
// Defaults to 'public-read', which THIS bucket rejects: Object Ownership is
// "bucket owner enforced", so ACLs are disabled and every PutObject carrying one
// fails with AccessControlListNotSupported and is retried without it (see
// uploadObject). That works, but it costs a wasted round trip per upload and the
// retry is silent, which is why the objects looked public and were not.
// Set S3_OBJECT_ACL=none to skip the attempt; public read comes from the bucket
// POLICY on `public/*`, not from an ACL.
const OBJECT_ACL = (process.env.S3_OBJECT_ACL ?? 'public-read').trim()
// Absolute origin of THIS API in deployment (e.g. https://my-api.onrender.com),
// used to build viewable file URLs when the bucket isn't public. Unset in local
// dev → relative '/api/...' paths, which resolve same-origin via the Vite proxy.
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL ?? '').trim().replace(/\/$/, '')

const CONFIGURED = !!(BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY)

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
 * Browser-viewable URL we STORE for an object key.
 *
 * • Keys under `public/` are covered by the bucket's public-read policy, so when
 *   S3_PUBLIC_BASE_URL is set they get the raw S3/CDN URL and are served with no
 *   server involvement at all.
 * • EVERYTHING ELSE routes through our API, which streams the object from S3
 *   (see GET /api/uploads/file/*). Absolute in deployment (API_PUBLIC_URL),
 *   relative in dev, where it resolves same-origin through the Vite proxy.
 *
 * The `public/` test is the important half. This used to hand out a direct bucket
 * URL for ANY key the moment S3_PUBLIC_BASE_URL was set — including
 * `evidence/…`, which is deliberately outside `public/` so the bucket policy
 * cannot reach it. Those URLs would 403 for everyone, including the admins who
 * are supposed to read them, and the only visible symptom would be a broken
 * image on a claim.
 */
export function publicUrl(key: string): string {
  if (PUBLIC_BASE_URL && key.startsWith('public/')) return `${PUBLIC_BASE_URL}/${key}`
  return `${API_PUBLIC_URL}/api/uploads/file/${key}`
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

export const storage = { isConfigured, presignPutUrl, presignGetUrl, getObject, headObject, downloadObject, publicUrl, uploadObject }
