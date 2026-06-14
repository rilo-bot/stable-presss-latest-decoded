// ---------------------------------------------------------------------------
// Object storage — S3 presigned uploads (env-gated, mirrors db.ts).
//
// When AWS S3 is configured (bucket + region + credentials), the server issues
// short-lived presigned PUT URLs so the browser uploads bytes DIRECTLY to S3.
// The server never touches the file body — it only signs and returns the URL.
//
// When S3 is NOT configured (local dev / WebContainer preview), isConfigured()
// is false and the upload route tells the client to fall back to inline data
// URLs, so development keeps working with zero setup. Real object storage
// belongs to deployment, exactly like the MongoDB gate in db.ts.
//
// Provider-agnostic: written against the S3 API, so a custom S3_ENDPOINT also
// lets it target Cloudflare R2 / MinIO / Backblaze / Spaces unchanged.
// ---------------------------------------------------------------------------

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = (process.env.S3_BUCKET ?? '').trim()
const REGION = (process.env.S3_REGION ?? process.env.AWS_REGION ?? '').trim()
const ACCESS_KEY_ID = (process.env.AWS_ACCESS_KEY_ID ?? '').trim()
const SECRET_ACCESS_KEY = (process.env.AWS_SECRET_ACCESS_KEY ?? '').trim()
// Optional: custom endpoint (S3-compatible providers) and CDN/public base URL.
const ENDPOINT = (process.env.S3_ENDPOINT ?? '').trim()
const PUBLIC_BASE_URL = (process.env.S3_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, '')
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true'

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

/** Public, browser-readable URL for a stored object key. */
export function publicUrl(key: string): string {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/${key}`
  if (ENDPOINT) return `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/${key}`
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
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

export const storage = { isConfigured, presignPutUrl, publicUrl }
