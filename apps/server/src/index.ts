import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db } from './lib/db.js'
import { storage } from './lib/storage.js'
import { seedRoles } from './lib/seedRoles.js'
// Every route mount — and every body-parser limit and RBAC gate that goes with
// it — lives in routes/index.ts. This file is app setup only.
import apiRouter from './routes/index.js'

// ── Environment validation ──
const isProd = process.env.PROD === 'true'
const hasMongoUri = !!process.env.MONGODB_URI
const hasJwtSecret = !!process.env.JWT_SECRET
const hasResend = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL
const hasSmtp = !!process.env.SMTP_HOST && !!(process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL)
const hasEmail = hasResend || hasSmtp
const emailLabel = [hasResend ? 'Resend' : '', hasSmtp ? 'SMTP fallback' : ''].filter(Boolean).join(' + ')
console.log('[server] Environment:')
console.log('  PROD (deployment tier):', isProd ? '✓ true' : '✗ false (dev/preview)')
console.log('  MONGODB_URI:', hasMongoUri ? '✓ configured' : '✗ not set (server will refuse to start)')
console.log('  JWT_SECRET:', hasJwtSecret ? '✓ configured' : '✗ not set (insecure dev secret)')
console.log('  EMAIL:', hasEmail ? `✓ ${emailLabel}` : '✗ not set (dev: OTP via console + UI preview)')
console.log('  S3 UPLOADS:', storage.isConfigured() ? '✓ configured (presigned PUT)' : '✗ not set (uploads fall back to inline data URLs)')
if (isProd && !hasEmail) {
  console.warn('[server] ⚠ PROD=true but no email provider (Resend/SMTP) is configured — OTP codes will be exposed in API responses')
}

// ── Crash guards ──
// Express 4 does NOT forward rejections from async route handlers to the error
// middleware, so a transient failure (e.g. a momentary DNS/network blip reaching
// MongoDB Atlas) surfaces as an unhandled rejection and Node would otherwise kill
// the whole API process. Log and stay up — that request already got a 500; one
// blip must not take the server down and require a manual restart.
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection (server kept alive):', reason instanceof Error ? reason.stack ?? reason.message : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception (server kept alive):', err.stack ?? err.message)
})

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

app.use(cors({ origin: '*' }))

// ── Request logging ──
// The path is captured HERE, not read inside the `finish` handler. Express
// rewrites `req.url` (and therefore `req.path`) to be relative to whichever
// router is currently handling the request, and `finish` fires while that is
// still true — so reading it late logged `/blogs/abc` instead of
// `/api/blogs/abc`. `originalUrl` is never rewritten; the query string is
// dropped so ids and tokens don't end up in the logs.
app.use((req, res, next) => {
  const start = Date.now()
  const path = req.originalUrl.split('?')[0]
  res.on('finish', () => {
    console.log(`[api] ${req.method} ${path} → ${res.statusCode} (${Date.now() - start}ms)`)
  })
  next()
})

// ── API routes ──
app.use('/api', apiRouter)

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Error:', err.message)
  // body-parser throws PayloadTooLargeError (status 413, type 'entity.too.large')
  // when an upload exceeds a mount's limit. Surface that as a clear, user-facing
  // 413 instead of masking it as a generic 500 — otherwise the client just sees
  // an opaque "Internal server error" for a file that's simply too big.
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode
  if (status === 413) {
    res.status(413).json({
      error: 'That file is too large — the upload limit is 50 MB. Please upload a smaller or compressed file.',
    })
    return
  }
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`[server] API server running on http://localhost:${PORT}`)
  console.log('[server] DB mode: MongoDB')
  // Insert-only seed of the `roles` collection (superadmin, administrator,
  // editor, contributor).
  // Idempotent and never overwrites an edited role, so it is safe on every boot.
  // Deliberately not called from db.ts — that would import-cycle through
  // ensureIndexes. Failures are logged, never fatal.
  void seedRoles().catch((err) => {
    console.error('[rbac] role seed failed (server still running):', err instanceof Error ? err.message : err)
  })
})

export { app, db }