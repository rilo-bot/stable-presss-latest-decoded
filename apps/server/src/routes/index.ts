
import express, { Router } from 'express'

import {
  adminGate,
  authedWriteGate,
  articlesWriteGate,
  blogsWriteGate,
  horseScopedWriteGate,
  partyScopedWriteGate,
  personScopedWriteGate,
} from '../lib/rbac.js'

// ── Identity & access ──
import authRouter from './auth/index.js'
import adminRouter from './admin/index.js'
import staffRouter from './staff/index.js'
import invitesRouter from './invites/index.js'
import rolesRouter from './roles/index.js'
// ── Register & relationships ──
import organisationsRouter from './organisations/index.js'
import notificationsRouter from './notifications/index.js'
import horsesRouter from './horses/index.js'
import partiesRouter from './parties/index.js'
import peopleRouter from './people/index.js'
import racesRouter from './races/index.js'
import salesRouter from './sales/index.js'
import reportsRouter from './reports/index.js'
import mediaItemsRouter from './mediaItems/index.js'
import racingEntriesRouter from './racingEntries/index.js'
// ── Editorial & publishing ──
import articlesRouter from './articles/index.js'
import blogsRouter from './blogs/index.js'
import podcastEpisodesRouter from './podcastEpisodes/index.js'
import issuesRouter from './issues/index.js'
import magazinesV2Router from './magazinesV2/index.js'
import newsroomRouter from './newsroom/index.js'
// ── Tipping ──
import tipsRouter from './tips/index.js'
import tipperProfilesRouter from './tipperProfiles/index.js'
import tippingRouter from './tipping/index.js'
// ── Public site & engagement ──
import sponsorsRouter from './sponsors/index.js'
import breakingNewsRouter from './breakingNews/index.js'
import siteSettingsRouter from './siteSettings/index.js'
import metricsRouter from './metrics/index.js'
import reactionsRouter from './reactions/index.js'
import commentsRouter from './comments/index.js'
import analyticsRouter from './analytics/index.js'
// ── Infrastructure ──
import uploadsRouter from './uploads/index.js'
// ── AI ──
import agentRouter from './agent/index.js'
import agentEditorRouter from './agentEditor/index.js'
import agentProfileRouter from './agentProfile/index.js'
import agentStoryRouter from './agentStory/index.js'
import agentBlogRouter from './agentBlog/index.js'
import agentArticleRouter from './agentArticle/index.js'
import agentVoiceRouter from './agentVoice/index.js'
import agentComposeRouter from './agentCompose/index.js'
import agentInstantRouter from './agentInstant/index.js'

const router = Router()

// ── Body parsers ────────────────────────────────────────────────────────────
// 2 MB default: large file bytes go straight to S3 via presigned PUT (see
// routes/uploads.ts), so request bodies only carry metadata plus the small
// compressed thumbnails that still persist inline. Express's own default
// (100 KB) was silently 413-ing those.
const jsonSmall = express.json({ limit: '2mb' })
// A blog post carries its whole block list, and in local dev with no S3 its
// images are inline data URLs.
const jsonBlogs = express.json({ limit: '10mb' })
// A frozen issue / v2 magazine page aggregates a whole magazine; same data-URL
// caveat in local dev (in deployment these are S3 URLs and bodies stay small).
const jsonMagazine = express.json({ limit: '30mb' })
// Attachments are downscaled (images) or capped (PDFs ≤ 8 MB) client-side, but
// the WHOLE conversation — including prior turns' attachments — is re-sent every
// turn, so allow comfortable headroom. express.json only parses application/json,
// so agentVoice's raw audio and agentEditor's raw file bodies pass through here
// untouched and are parsed by those routes' own express.raw().
const jsonAgent = express.json({ limit: '30mb' })

// ═══ Phase 1 — mounts needing a body limit above the 2 MB default ═══════════
// These MUST precede the default parser below; see the header comment.

// Published magazine issues. Public read (incl. unpublished for staff), staff write.
router.use('/issues', jsonMagazine, adminGate({ attachOnRead: true }), issuesRouter)
// Magazine Builder v2 (free-form element model) — self-gated inside the router
// (feature flag → staff → per-magazine owner/collaborator → write rate limit).
// Behind MAGAZINE_V2; invisible (404) until enabled. See docs/MAGAZINE-BUILDER-V2.md.
router.use('/magazinesV2', jsonMagazine, magazinesV2Router)
// Blogs — block-based posts with their own media pool. Public read (live posts
// only; the gate attaches the account optionally so staff also see drafts),
// writes gated on the `blog.*` permission axis.
router.use('/blogs', jsonBlogs, blogsWriteGate, blogsRouter)

// AI concierge ("the Stablehand") and the studios. Read-only tools, RBAC-scoped
// to the caller; answers stream back to the browser. ORDER MATTERS: every
// specific `/agent/<name>` mount must precede the bare `/agent` catch-all,
// otherwise agentRouter would swallow them.
router.use('/agent/editor', jsonAgent, agentEditorRouter)   // magazine composer document ingest (staff-gated inside)
router.use('/agent/profile', jsonAgent, agentProfileRouter) // in-profile Stable Studio assistant (client-executed, staged proposals)
router.use('/agent/story', jsonAgent, agentStoryRouter)     // Story Studio — writes & files a story draft (client-executed tools)
// Blog Studio — writes, revises, publishes and deletes blog posts. Every tool is
// client-executed, so all writes go back through /api/blogs and its RBAC gate.
router.use('/agent/blog', jsonAgent, agentBlogRouter)
router.use('/agent/article', jsonAgent, agentArticleRouter) // Article Studio — edits one open article in place (client-executed tools)
router.use('/agent/voice', jsonAgent, agentVoiceRouter)     // OpenAI STT/TTS for the concierge (key stays server-side)
// AI field-composer for form fields (✨ button). Signed-in + rate limited INSIDE
// the router — it was reachable anonymously, which spent the model key for free.
router.use('/agent/compose', jsonAgent, agentComposeRouter)
// Instant — capture-to-draft. Staff-only + rate-limited INSIDE the router (unlike
// the older agent routes, which attach the account optionally): it is the most
// expensive model surface here and there is still no token metering.
router.use('/agent/instant', jsonAgent, agentInstantRouter)
router.use('/agent', jsonAgent, agentRouter)

// ═══ Phase 2 — the default parser for every remaining mount ════════════════
router.use(jsonSmall)

// ═══ Phase 3 — everything else ══════════════════════════════════════════════

// Health check.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', db: 'mongodb' })
})

// ── Identity & access ──
router.use('/auth', authRouter)
router.use('/admin', adminRouter)               // secret-gated first-admin seed
router.use('/staff', staffRouter)               // admin-only staff grant/revoke
router.use('/invites', invitesRouter)           // PUBLIC: invite-link lookup (no account yet)
router.use('/roles', rolesRouter)               // admin-only custom roles + permission catalogue

// ── Register & relationships ── (self-gated routers attach the account inside)
router.use('/organisations', organisationsRouter)
router.use('/notifications', notificationsRouter)
router.use('/horses', horseScopedWriteGate({ collection: 'horses', idIsHorse: true, optionalGet: true }), horsesRouter)
// ONE mount. `/parties` was mounted TWICE — the same router imported under two
// names, the FIRST without a gate — so `partyScopedWriteGate` never ran and
// DELETE /api/parties/:id was reachable unauthenticated.
// `people` is the profile, `parties` the edge. Both are admin-to-create: the
// register is shared, so someone who needs an identity CLAIMS an edge rather
// than minting a rival one. Editing differs, hence two gates — you may edit the
// person you have claimed, and the edges you have claimed.
router.use('/people', personScopedWriteGate, peopleRouter)
router.use('/parties', partyScopedWriteGate, partiesRouter)
router.use('/races', adminGate(), racesRouter)
router.use('/sales', horseScopedWriteGate({ collection: 'sales' }), salesRouter)
router.use('/reports', horseScopedWriteGate({ collection: 'reports', optionalGet: true }), reportsRouter)
router.use('/mediaItems', horseScopedWriteGate({ collection: 'mediaItems' }), mediaItemsRouter)
router.use('/racingEntries', horseScopedWriteGate({ collection: 'racingEntries' }), racingEntriesRouter)

// ── Editorial & publishing ──
router.use('/articles', articlesWriteGate, articlesRouter)
router.use('/podcastEpisodes', podcastEpisodesRouter)
// Production System dashboard — staff-only, role-scoped summary + AI brief.
router.use('/newsroom', newsroomRouter)

// ── Tipping ──
router.use('/tips', authedWriteGate, tipsRouter)
router.use('/tipperProfiles', authedWriteGate, tipperProfilesRouter)
// Race resolution credits winners server-side (clients never write balances).
router.use('/tipping', authedWriteGate, tippingRouter)

// ── Public site & engagement ──
// Public landing-page content: read is public, writes are staff-only.
router.use('/sponsors', adminGate(), sponsorsRouter)
router.use('/breakingNews', adminGate(), breakingNewsRouter)
// Website customisation — which of the six public sections the site shows.
// Read is public (the navbar renders it for signed-out readers); the write gates
// itself on `settings.manage` inside the router, so no gate is applied here.
router.use('/site-settings', siteSettingsRouter)
// Computed site metrics — public, read-only (no writes).
router.use('/metrics', metricsRouter)
// Reader reactions on blogs, blog parts, stories and bulletin issues. Self-gated
// inside the router: counts are public, writes need an account and are rate
// limited, and "reactable = readable" is re-derived from the target's own record
// rather than trusted from the client. See docs/REACTIONS-PLAN.md.
router.use('/reactions', reactionsRouter)
// Reader comments on the same three surfaces (stories, blog posts, editions —
// NOT blog parts; see COMMENT_TARGET_TYPES for why the discussion is about the
// piece). Self-gated the same way, and the visibility gate is `assertReactable`
// itself rather than a copy of it: commentable = reactable = readable. The
// moderation endpoints inside enforce `comments.moderate`. See docs/COMMENTS-PLAN.md.
router.use('/comments', commentsRouter)
// Staff analytics over those reactions — self-gated on `analytics.view` inside
// the router, which is what makes that permission server-enforced rather than a
// sidebar rule the browser observes.
router.use('/analytics', analyticsRouter)

// ── Infrastructure ──
router.use('/uploads', uploadsRouter)           // presigned S3 PUT URLs (auth inside)

export default router
