import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db } from './lib/db.js'

// ── Environment validation ──
const isProd = process.env.PROD === 'true'
const hasMongoUri = !!process.env.MONGODB_URI
const hasJwtSecret = !!process.env.JWT_SECRET
const hasSendgrid = !!process.env.SENDGRID_API_KEY && !!process.env.SENDGRID_FROM_EMAIL
console.log('[server] Environment:')
console.log('  PROD (deployment tier):', isProd ? '✓ true' : '✗ false (dev/preview)')
console.log('  MONGODB_URI:', hasMongoUri ? '✓ configured' : '✗ not set (in-memory DB)')
console.log('  JWT_SECRET:', hasJwtSecret ? '✓ configured' : '✗ not set (insecure dev secret)')
console.log('  SENDGRID:', hasSendgrid ? '✓ configured (emails OTP)' : '✗ not set (dev: OTP via console + UI preview)')
if (isProd && !hasMongoUri) {
  console.warn('[server] ⚠ PROD=true but MONGODB_URI is not set — using in-memory storage')
}
if (isProd && !hasSendgrid) {
  console.warn('[server] ⚠ PROD=true but SendGrid is not configured — OTP codes will be exposed in API responses')
}

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

app.use(cors({ origin: '*' }))
app.use(express.json())

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
  res.json({ status: 'ok', db: db.isProduction() ? 'mongodb' : 'in-memory' })
})

// --- Add your API routes below ---

// === auto-mounted routers (backend planner) ===
import { authedWriteGate, staffWriteGate, articlesWriteGate, horseScopedWriteGate } from './lib/rbac.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import staffRouter from './routes/staff.js'
import subscriptionRouter from './routes/subscription.js'
import partyClaimsRouter from './routes/partyClaims.js'
import organisationsRouter from './routes/organisations.js'
import notificationsRouter from './routes/notifications.js'
import articlesRouter from './routes/articles.js'
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
app.use('/api/subscription', subscriptionRouter) // self-service tier (manual, no billing yet)
app.use('/api/partyClaims', partyClaimsRouter)   // self-gated (attachAccount inside)
app.use('/api/organisations', organisationsRouter) // self-gated (attachAccount inside)
app.use('/api/notifications', notificationsRouter)  // self-gated (attachAccount inside)
app.use('/api/podcastEpisodes', podcastEpisodesRouter)
app.use('/api/articles', articlesWriteGate, articlesRouter)
app.use('/api/horses', horseScopedWriteGate({ collection: 'horses', idIsHorse: true, optionalGet: true }), horsesRouter)
app.use('/api/horsePartyLinks', horseScopedWriteGate({ collection: 'horsePartyLinks' }), horsePartyLinksRouter)
app.use('/api/parties', staffWriteGate, partiesRouter)
app.use('/api/races', staffWriteGate, racesRouter)
app.use('/api/tips', authedWriteGate, tipsRouter)
app.use('/api/sales', horseScopedWriteGate({ collection: 'sales' }), salesRouter)
app.use('/api/reports', horseScopedWriteGate({ collection: 'reports', optionalGet: true }), reportsRouter)
app.use('/api/mediaItems', horseScopedWriteGate({ collection: 'mediaItems' }), mediaItemsRouter)
app.use('/api/racingEntries', horseScopedWriteGate({ collection: 'racingEntries' }), racingEntriesRouter)
app.use('/api/tipperProfiles', authedWriteGate, tipperProfilesRouter)
// === end auto-mounted routers ===


// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Error:', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`[server] API server running on http://localhost:${PORT}`)
  console.log(`[server] DB mode: ${db.isProduction() ? 'MongoDB' : 'In-memory'}`)
})

export { app, db }