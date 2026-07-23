# Stable Press — Project Overview

> Architecture, feature, data-model and user-journey reference.
> Companion document: [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md) — the full issues/bugs register.
> Last reviewed: 2026-07-23.

---

## 1. What it is

A full-stack **horse-racing publication platform**. It combines a public magazine/news
website with a staff newsroom, member self-service, a role-based access system, a
fixed-layout magazine builder, a play-money tipping ring, and a suite of AI "Studio"
assistants.

## 2. Tech stack

| Layer | Stack |
|---|---|
| Web (`apps/web`) | React 18, Vite, TypeScript, Zustand, Tailwind, React Router 6, Radix UI, framer-motion, react-markdown, sonner |
| Server (`apps/server`) | Node + Express 4, TypeScript, MongoDB driver (with in-memory fallback), JSON Web Tokens |
| AI | Vercel AI SDK (`ai`) via OpenRouter provider (chat), OpenAI (voice STT/TTS) |
| Storage | AWS S3 presigned PUT (prod) / inline data URLs (dev) |
| Email | SendGrid (OTP) |
| PDF | Puppeteer (headless Chromium) + pdf-lib |
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |

**Build health (2026-07-23):** both apps `tsc --noEmit` clean; only 2 `TODO` markers in
the tree; `deploy.secrets.ps1` correctly gitignored and never committed to history.

## 3. Architecture notes

- **Single render path.** Magazine templates render both the editable editor host and the
  read-only public view, so a published issue is pixel-identical to the editor.
- **Live-role RBAC.** Most server gates load the *live* account per request
  (`attachAccount`), so role/tier changes take effect without re-issuing the 7-day JWT.
  (Exception: podcast routes read the stale token role — see findings M/#.)
- **AI tools proxy through REST gates.** Studio tools are declared without `execute`; the
  model streams tool calls to the browser, which runs them through the same RBAC-gated REST
  API a human hits. The LLM can never write anything the signed-in user couldn't.
- **Server-side HTML sanitization** on all magazine/issue write paths (`sanitizeHtml.ts`,
  DOMPurify allowlist).
- **Persistence abstraction** (`lib/db.ts`): uniform `collection(name)` API over MongoDB
  (when `PROD=true && MONGODB_URI`) or an in-memory `Map` (dev/WebContainer). All deletes
  are soft (`deletedAt` stamp).

## 4. Feature surfaces

| Area | Route(s) | Access | Purpose |
|---|---|---|---|
| Landing | `/` | public | Hero, featured articles, breaking-news ticker, sponsors, metrics |
| News index | `/news` | public | Filter live articles by section/category/search |
| Article detail | `/articles/:id` | public (premium gated) | Read a story; premium paywall teaser |
| Bulletins | `/bulletins`, `/bulletins/:id` | public | Published magazine issues (newsstand) + bulletin articles; PDF export |
| Newsletter | `/newsletter` | public | Newsletter surface |
| Horse profiles | `/horses`, `/horses/:id` | public | Horse directory + rich profile |
| Parties | `/parties`, `/parties/:id` | public | People directory + profile |
| Tipping ring | `/tipping` | public / member to play | Play-money race tipping + leaderboard |
| Podcast | `/podcast` | public | Published episodes |
| Newsroom | `/newsroom` | staff | Kanban story workflow, editor hub, analytics |
| Magazine studio | `/newsroom/magazine/:id` | staff | Fixed-layout magazine builder |
| Podcast workflow | `/podcast/workflow` | staff | Episode production pipeline |
| Site content | `/site-content` | staff | Sponsors / breaking news / landing content |
| Dashboard | `/dashboard` | member | Tier switch, racing-role claim, "My Stable", orgs |
| Org dashboard | `/orgs/:id` | member | Members, managed parties, scoped horses, claim queue |
| Studio (profile AI) | `/studio/:id`, `/studio/horse/:id` | member | AI-assisted profile editing |
| Claims queue | `/claims` | admin | Verify party claims |
| Staff admin | `/staff` | admin | Grant/revoke staff roles |

## 5. Data model

### Central hub — `Horse` (`horses`)
Identity, pedigree (3 generations of ancestor name strings), stud-book registry, racing
summary. People are linked **two ways**:
- **Legacy denormalized arrays** on the horse: `ownerIds`, `trainerIds`, `jockeyIds`,
  `breederIds`, `bloodstockAgentIds`, `syndicateManagerIds`, `personnelIds` (arrays of Party ids).
- **Normalized dated join rows** in `horsePartyLinks`.
The web layer synthesizes read-only links from the legacy arrays (prefix `legacy:`) and
folds them into the same UI as real join rows.

### People & orgs
- **`Party`** (`parties`) — an individual person (never an org). `roles[]`, verification
  status, `createdByUserId` for member self-registration.
- **`Organisation`** (`organisations`) — separate collection; members with `org_owner |
  org_manager | org_member` roles; can own "managed parties".
- **`HorsePartyLink`** (`horsePartyLinks`) — M:N join: `{horse_id, party_id,
  relationship_type, start_date, end_date?}`. "Current" derived from empty `end_date`.

### Horse-scoped children (one horse → many)
- **`HorseReport`** (`reports`) — documents; `public | restricted` visibility.
- **`Sale`** (`sales`) — sale history; optional `buyer_party_id`.
- **`RacingEntry`** (`racingEntries`) — race records; optional `jockey_id`, `trainer_id`.
- **`MediaItem`** (`mediaItems`) — press/media; optional `featured_party_ids[]`, `linked_article_id`.

### Editorial / content
- **`Article`** (`articles`) — Kanban workflow status; `minTier` (premium gating);
  `linkedHorseIds[]`; `author` (display-name string). Body lives in `summary`.
- **`Magazine`** (`magazines`) — editable, server-persisted, collaborative *draft*.
  Pages carry a `pageType` + a flat `regionId → RegionContent` map (no JSX).
- **`PublishedIssue`** (`issues`) — frozen, self-contained snapshot of selected magazine
  pages; publicly readable; images by URL (S3 prod / inline dev).
- **`PodcastEpisode`** (`podcastEpisodes`) — status pipeline; `relatedArticleIds[]`.
- **`BreakingNewsItem`** (`breakingNews`), **`Sponsor`** (`sponsors`).

### Tipping (play-money)
- **`Race`** (`races`) — embeds `entrants[]` (`{horseId, odds}`); status `upcoming | open |
  closed | resolved`.
- **`Tip`** (`tips`) — `{userId, raceId, horseId, wager, odds, payout?, result?}`.
- **`TipperProfile`** (`tipperProfiles`) — 1:1 with user; `coinBalance`, `totalWon`,
  `totalWagered`, `tipsPlaced`. Race resolution settles tips and credits balances
  server-side.

### Identity (two orthogonal axes)
- **Access axis:** `roles[]` (reader + staff roles + verified party roles) +
  `orgMemberships[]` (scoped) + `partyClaims[]`.
- **Entitlement axis:** `subscriptionTier` (`free < standard < premium`) — gates premium
  *content only*.
- **Session:** passwordless OTP → 7-day Bearer JWT `{sub, email, role}` (no cookies).

## 6. User journeys

### Signup / login
`POST /api/auth/request-otp` → `verify-otp` issues JWT. Signup always creates a
`['reader']` / `free` account (role is never self-selected). Pending staff grants apply on
first sign-in.

### Party claim
`POST /api/partyClaims` creates a `pending` claim.
- **Self-registered** (new party): claimant mints their own party and gets provisional
  write access immediately.
- **Claiming a pre-existing party:** view-only until verified.
Verified by an **admin** or by an **org owner/manager** of the party's managing org.

### Organisation
`POST /api/organisations` → creator becomes `org_owner`; owner/manager add members and
managed parties; org-scoped claim-verification queue.

### Staff
Admin-only `/api/staff` grant/revoke (incl. `administrator`), with a last-admin revoke
guard. First admin seeded via `SETUP_SECRET`-gated `/api/admin/seed`.

### Content publishing
Staff file an article in the Newsroom → Kanban workflow (draft → submitted →
editorial/legal/compliance → approved → publisher_review → scheduled →
published/newsletter/bulletin → archived). Public surfaces filter to "live" statuses
client-side. Premium articles show a first-paragraph teaser + paywall.

### Magazine builder → bulletin
Build a fixed-layout magazine in Magazine Studio (no save button — debounced per-page
PATCH persists; module-level undo/redo snapshots). Owner selects pages and **publishes** →
a frozen `PublishedIssue` readable at `/bulletins/:id`, exportable to PDF (headless
Chromium renders the public route). Owner/collaborator model: owner edits everything;
collaborators edit assigned pages.

### Tipping
Any signed-in user gets a `TipperProfile` with a starting balance, places tips on race
entrants, and "Run Race" resolves server-side (winner weighted by implied probability),
settling tips and crediting winners onto the public leaderboard.

### AI Studios
Six assistant surfaces (concierge "Stablehand", Article Studio, Profile/"Stable" Studio,
Story Studio, Editor/Magazine Studio, ✨ field Compose). Read tools mirror REST GET
scoping; write tools proxy the gated REST API as the signed-in user; profile/onboarding
and article editing use **direct-apply + Undo** (no staged proposals).
