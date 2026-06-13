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
import { requireAuth } from './lib/auth.js'
import authRouter from './routes/auth.js'
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

// Reads are public (the public website needs them); any write (POST/PUT/DELETE/
// PATCH) requires a valid session. Entity routes therefore carry no per-handler
// auth — this single gate covers them uniformly. (auth + podcastEpisodes manage
// their own finer-grained rules and are mounted without it.)
function requireAuthForWrites(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.method === 'GET') {
    next()
    return
  }
  requireAuth(req, res, next)
}

app.use('/api/auth', authRouter)
app.use('/api/podcastEpisodes', podcastEpisodesRouter)
app.use('/api/articles', requireAuthForWrites, articlesRouter)
app.use('/api/horses', requireAuthForWrites, horsesRouter)
app.use('/api/horsePartyLinks', requireAuthForWrites, horsePartyLinksRouter)
app.use('/api/parties', requireAuthForWrites, partiesRouter)
app.use('/api/races', requireAuthForWrites, racesRouter)
app.use('/api/tips', requireAuthForWrites, tipsRouter)
app.use('/api/sales', requireAuthForWrites, salesRouter)
app.use('/api/reports', requireAuthForWrites, reportsRouter)
app.use('/api/mediaItems', requireAuthForWrites, mediaItemsRouter)
app.use('/api/racingEntries', requireAuthForWrites, racingEntriesRouter)
app.use('/api/tipperProfiles', requireAuthForWrites, tipperProfilesRouter)
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