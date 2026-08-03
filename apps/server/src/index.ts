import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db } from './lib/db.js'
import { storage } from './lib/storage.js'

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
// 2 MB JSON limit: large file bytes now go straight to S3 via presigned PUT
// (see routes/uploads.ts), so request bodies only carry metadata + the small
// compressed thumbnails that still persist inline. The Express default (100 KB)
// was silently 413-ing those; 2 MB is a comfortable headroom without inviting
// multi-MB base64 payloads back into Mongo.
//
// Exception: /api/issues + /api/magazines aggregate a whole magazine and, in
// local dev (no S3), embed inline data-URL images — so they parse their bodies
// with a larger limit at their own mount points below. /api/agent chats now
// carry inline data-URL file attachments (images/PDFs the user hands the AI), so
// they get the larger parser too. The global parser must skip all three here,
// otherwise it would 413 the large body first.
const jsonSmall = express.json({ limit: '2mb' })
// Attachments are downscaled (images) or capped (PDFs ≤ 8 MB) client-side, but
// the whole conversation — including prior turns' attachments — is re-sent each
// turn, so allow comfortable headroom. express.json only parses application/json,
// so the editor's raw /ingest and voice's raw /transcribe bodies pass through.
const jsonAgent = express.json({ limit: '30mb' })
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/issues') ||
    req.path.startsWith('/api/magazines') ||
    req.path.startsWith('/api/blogs') ||
    req.path.startsWith('/api/agent')
  )
    return next()
  return jsonSmall(req, res, next)
})

// ── Request logging ──
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    console.log(`[api] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
  })
  next()
})

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', db: 'mongodb' })
})

// --- Add your API routes below ---

// === auto-mounted routers (backend planner) ===
import { authedWriteGate, staffWriteGate, articlesWriteGate, blogsWriteGate, horseScopedWriteGate, partyScopedWriteGate, issuesGate } from './lib/rbac.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import staffRouter from './routes/staff.js'
import invitesRouter from './routes/invites.js'
import rolesRouter from './routes/roles.js'
import { seedRoles } from './lib/seedRoles.js'
import subscriptionRouter from './routes/subscription.js'
import partyClaimsRouter from './routes/partyClaims.js'
import organisationsRouter from './routes/organisations.js'
import notificationsRouter from './routes/notifications.js'
import articlesRouter from './routes/articles.js'
import blogsRouter from './routes/blogs.js'
import horsesRouter from './routes/horses.js'
import horsePartyLinksRouter from './routes/horsePartyLinks.js'
import partiesRouter from './routes/parties.js'
import podcastEpisodesRouter from './routes/podcastEpisodes.js'
import racesRouter from './routes/races.js'
import tipsRouter from './routes/tips.js'
import salesRouter from './routes/sales.js'
import reportsRouter from './routes/reports.js'
import mediaItemsRouter from './routes/mediaItems.js'
import racingEntriesRouter from './routes/racingEntries.js'
import tipperProfilesRouter from './routes/tipperProfiles.js'
import tippingRouter from './routes/tipping.js'
import uploadsRouter from './routes/uploads.js'
import issuesRouter from './routes/issues.js'
import magazinesRouter from './routes/magazines.js'
import magazinesV2Router from './routes/magazinesV2.js'
import sponsorsRouter from './routes/sponsors.js'
import breakingNewsRouter from './routes/breakingNews.js'
import metricsRouter from './routes/metrics.js'
import agentRouter from './routes/agent.js'
import agentEditorRouter from './routes/agentEditor.js'
import agentProfileRouter from './routes/agentProfile.js'
import agentStoryRouter from './routes/agentStory.js'
import agentBlogRouter from './routes/agentBlog.js'
import agentArticleRouter from './routes/agentArticle.js'
import agentVoiceRouter from './routes/agentVoice.js'
import agentComposeRouter from './routes/agentCompose.js'
import agentInstantRouter from './routes/agentInstant.js'
import newsroomRouter from './routes/newsroom.js'

// Reads stay public (the public website needs them). Writes are gated by role:
//   - articles  → editorial matrix (create / edit_own w/ author match / edit_any)
//   - horse-centric data (horses, links, sales, reports, media, racing entries)
//     → staff OR a member with an authorised relationship to the target horse
//       (horseScopedWriteGate). Members create/manage only their own horses.
//   - parties, races → staff-only (org party creation flows via /organisations)
//   - tipping (tips, tipperProfiles) → any authenticated user (readers participate)
// auth + podcastEpisodes keep their own finer-grained rules.
app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)               // secret-gated first-admin seed
app.use('/api/staff', staffRouter)               // admin-only staff grant/revoke
app.use('/api/invites', invitesRouter)           // PUBLIC: invite-link lookup (no account yet)
app.use('/api/roles', rolesRouter)               // admin-only custom roles + permission catalogue
app.use('/api/subscription', subscriptionRouter) // self-service tier (manual, no billing yet)
app.use('/api/partyClaims', partyClaimsRouter)   // self-gated (attachAccount inside)
app.use('/api/organisations', organisationsRouter) // self-gated (attachAccount inside)
app.use('/api/notifications', notificationsRouter)  // self-gated (attachAccount inside)
app.use('/api/podcastEpisodes', podcastEpisodesRouter)
app.use('/api/articles', articlesWriteGate, articlesRouter)
// Blogs — block-based posts with their own media pool. Public read (live posts
// only; the gate attaches the account optionally so staff also see drafts),
// writes gated on the `blog.*` permission axis. A post carries its whole block
// list and, in local dev with no S3, inline data-URL images, so it needs more
// headroom than the global 2 MB cap — the global parser skips this prefix above.
app.use('/api/blogs', express.json({ limit: '10mb' }), blogsWriteGate, blogsRouter)
app.use('/api/horses', horseScopedWriteGate({ collection: 'horses', idIsHorse: true, optionalGet: true }), horsesRouter)
app.use('/api/horsePartyLinks', horseScopedWriteGate({ collection: 'horsePartyLinks' }), horsePartyLinksRouter)
app.use('/api/parties', partyScopedWriteGate, partiesRouter)
app.use('/api/races', staffWriteGate, racesRouter)
app.use('/api/tips', authedWriteGate, tipsRouter)
app.use('/api/sales', horseScopedWriteGate({ collection: 'sales' }), salesRouter)
app.use('/api/reports', horseScopedWriteGate({ collection: 'reports', optionalGet: true }), reportsRouter)
app.use('/api/mediaItems', horseScopedWriteGate({ collection: 'mediaItems' }), mediaItemsRouter)
app.use('/api/racingEntries', horseScopedWriteGate({ collection: 'racingEntries' }), racingEntriesRouter)
app.use('/api/tipperProfiles', authedWriteGate, tipperProfilesRouter)
// Race resolution credits winners server-side (clients never write balances).
app.use('/api/tipping', authedWriteGate, tippingRouter)
app.use('/api/uploads', uploadsRouter)         // presigned S3 PUT URLs (auth inside)
// Published magazine issues. Public read (incl. unpublished for staff), staff
// write. A frozen issue aggregates a whole magazine's pages; in local dev its
// images are inline data URLs, so it needs more headroom than the global 2 MB
// body cap (in deployment, page images are S3 URLs and bodies stay small).
app.use('/api/issues', express.json({ limit: '30mb' }), issuesGate, issuesRouter)
// Magazine DRAFTS — staff-only, server-persisted so multiple staff can collaborate.
// Self-gated (attachAccount + staff + per-magazine access checks inside the route).
app.use('/api/magazines', express.json({ limit: '30mb' }), magazinesRouter)
// Magazine Builder v2 (free-form element model) — self-gated inside the router
// (feature flag → staff → per-magazine owner/collaborator → write rate limit).
// Behind MAGAZINE_V2; invisible (404) until enabled. Large body cap because a
// page's element payload can carry inline data-URL images in local dev. The
// global JSON parser already skips the '/api/magazines' prefix, so this mount's
// own parser is what runs. See docs/MAGAZINE-BUILDER-V2.md.
app.use('/api/magazinesV2', express.json({ limit: '30mb' }), magazinesV2Router)
// Public landing-page content: read is public, writes are staff-only.
app.use('/api/sponsors', staffWriteGate, sponsorsRouter)
app.use('/api/breakingNews', staffWriteGate, breakingNewsRouter)
// Computed site metrics — public, read-only (no writes).
app.use('/api/metrics', metricsRouter)
// Production System dashboard — staff-only, role-scoped summary + AI brief.
app.use('/api/newsroom', newsroomRouter)
// AI concierge ("the Stablehand"). Read-only tools, RBAC-scoped to the caller
// (attachAccountOptional inside the route); answers stream back to the browser.
// Editor route is mounted first (more specific path) so /editor/* resolves here.
app.use('/api/agent/editor', jsonAgent, agentEditorRouter)  // in-editor Studio Assistant (client-executed editor tools)
app.use('/api/agent/profile', jsonAgent, agentProfileRouter) // in-profile Stable Studio assistant (client-executed, staged proposals)
app.use('/api/agent/story', jsonAgent, agentStoryRouter)    // Story Studio — writes & files a story draft (client-executed tools)
// Blog Studio — writes, revises, publishes and deletes blog posts. Every tool is
// client-executed, so all writes go back through /api/blogs and its RBAC gate.
app.use('/api/agent/blog', jsonAgent, agentBlogRouter)
app.use('/api/agent/article', jsonAgent, agentArticleRouter) // Article Studio — edits one open article in place (client-executed tools)
app.use('/api/agent/voice', jsonAgent, agentVoiceRouter)    // OpenAI STT/TTS for the concierge (key stays server-side)
app.use('/api/agent/compose', jsonAgent, agentComposeRouter) // AI field-composer for form fields (✨ button)
// Instant — capture-to-draft. Staff-only + rate-limited INSIDE the router (unlike
// the older agent routes, which attach the account optionally): it is the most
// expensive model surface here and there is still no token metering.
app.use('/api/agent/instant', jsonAgent, agentInstantRouter)
app.use('/api/agent', jsonAgent, agentRouter)
// === end auto-mounted routers ===


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