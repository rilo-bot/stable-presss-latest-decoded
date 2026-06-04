import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db } from './lib/db.js'

// ── Environment validation ──
const isProd = process.env.PROD === 'true'
const hasMongoUri = !!process.env.MONGODB_URI
console.log('[server] Environment:')
console.log('  PROD (deployment tier):', isProd ? '✓ true' : '✗ false (dev/preview)')
console.log('  MONGODB_URI:', hasMongoUri ? '✓ configured' : '✗ not set (in-memory DB)')
if (isProd && !hasMongoUri) {
  console.warn('[server] ⚠ PROD=true but MONGODB_URI is not set — using in-memory storage')
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
import articlesRouter from './routes/articles.js'
import horsesRouter from './routes/horses.js'
import horsePartyLinksRouter from './routes/horsePartyLinks.js'
import partiesRouter from './routes/parties.js'
import podcastEpisodesRouter from './routes/podcastEpisodes.js'
import racesRouter from './routes/races.js'
import tipsRouter from './routes/tips.js'
app.use('/api/articles', articlesRouter)
app.use('/api/horses', horsesRouter)
app.use('/api/horsePartyLinks', horsePartyLinksRouter)
app.use('/api/parties', partiesRouter)
app.use('/api/podcastEpisodes', podcastEpisodesRouter)
app.use('/api/races', racesRouter)
app.use('/api/tips', tipsRouter)
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