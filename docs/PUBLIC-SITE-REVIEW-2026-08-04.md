# Stable Press — Public Website Review & Landing Page Plan

**Date:** 2026-08-04
**Scope:** every route a visitor can reach without a staff role — the 17 public URLs, the data behind them, and what on them is not real.
**Supersedes:** `docs/PUBLIC-SITE-REVIEW.md` (2026-08-03) for status. That review's three Criticals are now **fixed**; this one re-verifies each finding and adds the landing-page work the user asked for.

---

## 1. Verdict

The **plumbing is now honest**. Since the last review the public API stopped leaking the pipeline, the paywall became a server decision, sorting became real, and loading states stopped lying on `/news`, `/blog` and the landing hero. That was the dangerous half and it is done.

What is left is **presentation**, and it splits three ways:

1. **The site is hard to read.** 170 sub-12px text sites across 15 public files, 136 uppercase treatments, 49 wide-tracking sites — and **79 places where gold is used as text at 2.06:1 contrast**, when the codebase already ships `--brand-accent-ink` for exactly that job and the public site uses it **zero** times.
2. **The landing page has no hierarchy.** 13 content blocks, 6 separate join/subscribe CTAs, and 4 sections whose editorial-sounding titles are just recency slices of the same array.
3. **Fake data has moved from the data layer to the imagery and the labels.** No fabricated articles remain, but there is a stock horse standing in for every photo-less horse, five invented "featured" racecourses, a map that claims to plot our people and plots nothing, and the podcast is called three different things.

Grades: **Data integrity B** · **Readability D+** · **Consistency C−** · **Landing page D**

---

## 2. Page inventory — 17 public URLs

| # | URL | File | Chrome | Page meta | Real data shown |
|---|-----|------|--------|-----------|-----------------|
| 1 | `/` | `Landing.tsx` + 8 in `landing/` | own hero | ✗ | articles, horses, parties, races, tippers, episodes, issues, breaking news, sponsors, metrics |
| 2 | `/news` | `NewsIndex.tsx` | green band | ✗ | published articles (client-filtered) |
| 3 | `/blog` | `BlogIndex.tsx` | green band | ✓ | published posts (server-paginated) |
| 4 | `/blog/:slug` | `BlogPost.tsx` | own | ✓ | one post + parts + reactions |
| 5 | `/bulletins` | `Bulletins.tsx` | own masthead | ✗ | published issues |
| 6 | `/bulletins/:id` | `BulletinViewer.tsx` | own | ✗ | one frozen issue |
| 7 | `/horses` | `HorseProfiles.tsx` | **none** | ✗ | horses + connections + follows |
| 8 | `/horses/:id` | `HorseDetail.tsx` → profile | own dossier | ✗ | one horse dossier |
| 9 | `/articles/:id` | `ArticleDetail.tsx` | own hero | ✗ | one story, tier-gated |
| 10 | `/tipping` | `TippingRing.tsx` | green band | ✗ | races, tips, tipper profiles |
| 11 | `/podcast` | `PodcastHub.tsx` | green band | ✗ | published episodes |
| 12 | `/parties` | `Parties.tsx` | **none** | ✗ | all parties |
| 13 | `/parties/:id` | `PartyDetail.tsx` → profile | own dossier | ✗ | one party dossier |
| 14 | `/login` | `Login.tsx` | no nav | ✗ | — |
| 15 | `/signup` | `signup/` | no nav | ✗ | — |
| 16 | `/invite/:token` | `InviteAccept.tsx` | no nav | ✗ | invite lookup |
| 17 | `/production-system` | *staff-gated*, but **linked from 4 public empty states** | — | — | — |

**Four chrome patterns for 13 content pages.** `/news`, `/blog`, `/tipping`, `/podcast` wear the green band. `/bulletins` has a bespoke broadsheet masthead. `/horses` and `/parties` have **no band at all** — a bare container with a local `<h1>`, so they read as a different website. And `/parties` is **in no navigation menu**, desktop or mobile: a public page reachable only by typing the URL.

**Page titles:** only `/blog` and `/blog/:slug` call `usePageMeta`. The other 15 URLs share one static `index.html` title, so every tab, bookmark and history entry says the same thing.

---

## 3. The data map — what is real

Genuinely live, computed from collections, and degrading to honest empty states:

- **Articles** — `GET /api/articles` filters to `status: 'published'`, projects a 13-field whitelist, and cuts premium bodies to teasers server-side. Sorted by `publishedAt` server-side.
- **Blogs** — server-paginated card projections, `status: 'published'` pinned client-side so a signed-in staffer never leaks drafts onto a public index.
- **Issues / bulletins** — `pageCount` and edition counts are `reduce`s over real published issues.
- **Podcast** — episode count, total hours, season breakdown and host counts all derived from published episodes; each tile hidden when its input is empty.
- **Races / tipping** — server-authoritative race resolution, weighted by implied probability; payouts computed server-side.
- **Breaking news / sponsors** — staff-managed collections, `GET` public, and both render **nothing** when empty rather than a placeholder shell. Correct.
- **Metrics** — four `count()` calls, not four full-collection fetches.

Three things are worth calling out as *good* because they were the previous review's Criticals: the `PUBLIC_FIELDS` whitelist, `gateArticleForTier`, and the `article.locked || !canViewPremium(...)` double gate on `/articles/:id` where **either** signal shows the paywall.

---

## 4. Fake data register

### F1 — Every photo-less horse is pictured as the same stock horse — HIGH
`components/HorseCard.tsx:7` hotlinks one Pexels photo as `FALLBACK_IMAGE`, and `:19` substitutes it whenever `horse.imageUrl` is blank, with `alt={horse.name}`. On `/horses` a reader sees a grid of distinct thoroughbreds that are all the same anonymous animal, each captioned with a different name. On a site whose whole claim is record accuracy this is the worst-placed fake on the site. Show the empty frame the card already has for its icon state.

### F2 — Five invented racecourses labelled "Featured in this edition" — HIGH
`pages/bulletins/constants.tsx:21` hardcodes Flemington, Randwick, Eagle Farm, Morphettville and Ascot. `VenueMap.tsx` renders them under the heading **"Race Venues"** with the sub-label **"Featured in this edition"** — on a page whose actual content is whatever issues exist. Nothing connects the list to any issue. Either drive it from the venues named in the issue, or delete the section.

### F3 — The Parties map claims to plot our people and plots nothing — HIGH
`Parties.tsx:178-255`. An iframe with `src=maps.google.com/maps?q=thoroughbred+racing&z=3`, badged **"Racing Connections — Worldwide"**, footed with *"Track where your owners, trainers, jockeys and breeders are based across the globe."* It is a generic Google search embed. `party.base_location` is right there on the card three lines above and is never used. Delete the section or geocode `base_location`.

### F4 — Four landing sections are recency slices wearing curated names — HIGH
`Landing.tsx:87-90`:
```
heroArticle        = published[0]        → "Cover Story"
secondaryArticles  = published.slice(1,4) → "Latest Dispatches"
featuredArticles   = published.slice(4,7) → "Featured Analysis & Interviews"
sidebarArticles    = published.slice(7,12) → "Also in this edition"
```
"Featured Analysis & Interviews" is articles 5–7 by date with no category filter at all — and its "All analysis" link goes to `/news?section=analysis`, which *does* filter, so the destination and the teaser disagree. "Also in this edition" invokes an edition concept that does not exist for articles. Either filter by category to match the label, or rename the sections to what they are (see §6).

### F5 — The podcast has three names — MEDIUM
- `LandingPodcast.tsx:24` — "The Stable Press Podcast"
- `PodcastHub.tsx:70` — "The Gallop Podcast"
- `PodcastHub.tsx:212` — *"from the editors of **The Gallop Racing Journal**"* ← a different publication entirely, and "**weekly**", which nothing schedules.

The `/bulletins` and landing copy were already scrubbed of unschedulable cadences ("fortnightly", "Vol. 47"); this one was missed. Pick one name, drop "weekly".

### F6 — Landing metric labels overstate what they count — MEDIUM
`metrics.ts:23` counts **all users**; `Landing.tsx:136` labels it **"Active Members"**. There is no activity signal in the query — a staff account created and never used counts. `leaderboardLeaders` counts tipper profiles and is labelled "Leaderboard Tippers", which is closer but still counts profiles that have placed zero tips. Rename to "Registered members" / "Tippers", or add the predicate the label promises.

### F7 — `totalWon` is coins, labelled "Races Won" — MEDIUM
`types/tip.ts` — `totalWon` is credited in `tipping.ts` as `+= payout`, i.e. **coins**. `TippingRing.tsx:181` labels it **"Races Won"**, so a member who won one race at 12/1 reads "Races Won: 6000". The landing (`LandingSidebar.tsx:298` "Total won", `LandingLeaderboard.tsx:69` "won") gets it right — only `/tipping` is wrong.

### F8 — Twelve hotlinked Pexels photos as editorial imagery — MEDIUM
`LandingHero.tsx:23`, `article-detail/helpers.ts:29`, `bulletins/constants.tsx:13` (×3), `Bulletins.tsx:49` (inline, not even a constant), `HorseCard.tsx:7`. These are third-party CDN hotlinks in the critical render path of the two highest-traffic pages, and they present stock photography as this publication's own. Landing's is the least harmful (a generic racing scene behind a headline); `Bulletins.tsx:49`'s inline URL is the sloppiest.

### F9 — Public empty states send readers into the staff newsroom — MEDIUM
Four public pages tell an anonymous visitor to go file copy:
- `LandingFeaturedArticles.tsx:71-74` — *"Head to the newsroom to file your first dispatch"* → `/production-system`
- `NewsIndex.tsx:289-296` — *"Go to Newsroom Production System"*
- `HorseProfiles.tsx:161-163` — *"Go to Newsroom"*
- `PodcastHub.tsx:168-177` — *"Go to Podcast Workflow"*

Every one is a `RequireStaff` route that bounces them home. Gate the CTA on `isStaff(currentUser)` and give readers a reader-facing fallback.

**Cleared since the last review:** `EDITORIAL_FEATURES` (six fabricated articles), the fabricated bylines/job titles on `/articles/:id`, "Vol. 47", the placeholder ABN, "fortnightly"/"bi-weekly", and the `/__preview/premium` QA route — all confirmed gone.

---

## 5. Everything else, by severity

### Readability & consistency

**R1 — Gold as text, 79 times, at 2.06:1 — HIGH.** `styles/theme.css:117-123` splits gold into a fill token and an ink token *and says so in the comment*: `--brand-accent` is "FILL / RULES ONLY … as text on a light surface this is 2.06:1; use `--brand-accent-ink` instead." The public site uses `--brand-accent` as a text colour **56 times via inline style + 23 times via `text-[hsl(...)]`** and uses `--brand-accent-ink` **zero times**. All five `-ink` call sites are inside the staff newsroom. Every eyebrow, category label, section kicker, coin balance and stat number on the public site is currently below the WCAG floor. This is the single biggest readability win and it is a mechanical find-and-replace, limited to text-role usages.

**R2 — 170 sub-12px text sites — HIGH.** Across the 15 public files: `text-[8px]` ×2, `text-[9px]` ×50, `text-[10px]` ×79, `text-[11px]` ×39. On the landing page alone: 27 × 9px, 26 × 10px, 8 × 11px. 9px uppercase at `tracking-[0.2em]` is a decorative texture, not text — and it is carrying real information (categories, dates, reading times, stat labels, sponsor names).

**R3 — 136 uppercase + 49 wide-tracking treatments — MEDIUM.** Uppercase is the default rather than the exception, which removes it as a signal. When the eyebrow, the section kicker, the "all stories" link, the stat label, the footer heading and the sponsor category are all 9–10px uppercase gold, nothing is emphasised.

**R4 — Section headers follow two different patterns on one page — MEDIUM.** On the landing page, "Featured Analysis", "Top of the Ring", "On the Card" and "Print Bulletins" carry a gold `w-1 h-5` bar; "Latest Dispatches" and "Form the Stables" do not. Some have an "All X →" right-link, some don't. Same page, same visual level, two rules.

**R5 — `/horses` and `/parties` wear no page chrome — MEDIUM.** No green band, no breadcrumb, no standfirst — while `/news`, `/blog`, `/tipping` and `/podcast` all have one. `/blog`'s header comment states the band exists precisely so pages don't "read as a different website"; these two never got it.

**R6 — Four dead mobile menu links — LOW.** `components/navbar/MobileMenu.tsx:151-154` still lists `/bulletins?category=bloodstock|trainer-profiles|form-guide|owner-stories`. `config.tsx:111-113` removed exactly these from the desktop menu with the note that they "navigated to a filter that silently did nothing" — and `Bulletins.tsx` reads no category param. Mobile was missed.

### Correctness

**R7 — Any member can set their own coin balance and top the public leaderboard — HIGH.** `routes/tipperProfiles.ts:66-71` spreads `{...req.body}` into the update and deletes only `totalWon`. **`coinBalance` survives** — and `coinBalance` is exactly what the landing leaderboard sorts by (`Landing.tsx:119`). `PUT /api/tipperProfiles/<own id>` with `{coinBalance: 999999}` puts you at the top of the front page. Whitelist the self-service PUT to `displayName` and a *debit-only* balance change, or move the debit server-side next to the credit.

**R8 — `POST /api/tips` trusts a client-supplied `userId` — HIGH.** `routes/tips.ts:29-48` requires `body.userId` and then `{...body}` straight into Mongo. `authedWriteGate` proves *someone* is signed in; nothing checks it is *this* user. Any member can place tips in anyone else's name, with any `wager`, `odds`, `payout` and `result`. Force `userId = req.account.id` and whitelist the rest.

**R9 — `GET /api/tips` returns every tip ever placed, to anyone — MEDIUM.** `index.ts:159` uses `authedWriteGate` (GET passes through) and the handler returns the whole collection unprojected: every `userId`, wager and result. The **landing page fetches it anonymously** (`fetchRaces` → `/api/tips`) and displays none of it. Scope the GET to the caller, or drop the call from the landing page — the leaderboard only needs `/api/tipperProfiles`.

**R10 — `/parties` ships Add / Edit / Delete to anonymous visitors — MEDIUM.** `Parties.tsx:338` renders "Add Party" unconditionally; `:56-69` puts Edit and Delete buttons on every card on hover. No `can(...)` check anywhere in the file. The server refuses the write (`partyScopedWriteGate`), so this is a UX and trust failure rather than a breach — a visitor gets a confirm dialog reading *"This will permanently remove X from Stable Press. This action cannot be undone."* and then a silent 403.

**R11 — Two more fake loading timers — MEDIUM.** `HorseProfiles.tsx:31-34` (`setTimeout(…, 600)`) and `TippingRing.tsx:92-95` (`setTimeout(…, 500)`) still gate their skeletons on a fixed delay with no relation to whether the data arrived. This is the exact bug fixed on `/news` and the landing hero, whose comments call it out by name. Consequence on `/horses`: if the fetch takes longer than 600ms the reader gets *"The stables await their first resident"* on a populated database. Both stores expose `!loaded && !error`.

**R12 — The landing page makes 11 requests and pulls unbounded collections — MEDIUM.** `Landing.tsx:41-61` fires 9 fetchers; `fetchRaces` is 3 requests, so 11 in total. It downloads **every** article, horse, party, tip and tipper profile to render 12 articles, 4 horses, 3 races, 5 tippers, 3 episodes and 2 issues. `/api/articles` has no pagination. `/news` compounds it — full corpus into the browser, filtered and searched in JS.

**R13 — `canEditArticle` compares display-name strings — LOW.** `lib/permissions.ts:161` — `articleAuthor === currentUserDisplayName`. Two members with the same display name can edit each other's stories; a member who renames themselves loses access to their own. Compare `createdByUserId`.

**R14 — `splitIntoParagraphs` invents paragraph breaks — LOW.** `article-detail/helpers.ts:16-23` — when a body has no blank lines it regex-splits on sentence terminators and groups by threes. Every article without deliberate paragraphing gets machine-imposed structure, and the regex breaks on "Mr.", "3.5f", and decimal odds.

---

## 6. The landing page — the plan

### What is actually wrong

The page renders **13 content blocks** in this order:

```
breaking ticker → 80vh hero → 4-stat metric bar → On the Card (races)
├─ LEFT (2/3)                          ├─ RIGHT (1/3)
│  Latest Dispatches (3 cards)         │  Membership CTA + email form
│  Featured Analysis (3 rows)          │  Podcast promo
│  Form the Stables (4 rows)           │  Also in this edition (5 rows)
│  Top of the Ring (5 rows)            │  The Editorial Desk card
│  Print Bulletins (2 + subscribe)     │  Tipping Ring CTA
│                                      │  Sponsors
│                                      │  Your Tipping Record
└─ full-width subscription band → 4-column footer + sponsor bar
```

Three concrete problems:

1. **Six competing join CTAs.** Sidebar membership form, Editorial Desk card, Tipping Ring card, Bulletins subscribe prompt, full-width subscription band, footer "Membership Plans". Every one is styled as a primary action. A visitor scrolling this page is asked to subscribe six times and told what the publication *is* zero times below the hero.
2. **Nothing tells you what to read.** Five left-column sections at identical visual weight (all `text-xl font-bold`), each holding 3–5 items, none more prominent than another. The hero is the only hierarchy on the page and it ends at 80vh.
3. **The hero spends 80vh of viewport on stock photography and marketing copy.** *"The premium voice of thoroughbred racing / Breaking news, expert analysis, exclusive interviews…"* — generic positioning copy, over a Pexels photo when the lead story has no image. The actual lead story is a 19rem chip in the bottom-right corner, **desktop only** (`hidden lg:flex`). On mobile the lead story headline does not appear above the fold at all.

### The fix, in four steps

**Step 1 — Readability pass (mechanical, ~2 hours, clears R1–R3).**
- Replace `--brand-accent` with `--brand-accent-ink` at all 31 landing text sites (leave fills, rules, borders and the on-green usages alone — gold on the green primary surface is 5.19:1 and fine).
- Raise the floor: `9px → 11px`, `10px → 11px`, drop `tracking-[0.2em]` to `0.08em` on anything at 11px. Kill the two `8px` sites.
- Keep uppercase for **one** role only — the section kicker. Sentence-case the metric labels, sponsor categories, dates and reading times.

**Step 2 — Hero earns its viewport.**
- Cut `min-h-[600px] h-[80vh]` to `h-[60vh] max-h-[560px]`.
- Put the **lead story's headline** in the hero at all breakpoints, not marketing copy in the hero and the headline in a desktop-only corner chip. Positioning copy moves to a one-line standfirst under the wordmark.
- Keep `FALLBACK_HERO` only when there is no lead story at all; when the lead story has no image, use the green primary surface rather than a stock photo of someone else's horse.

**Step 3 — One layout rule, one CTA.**
- **One** section-header component: gold bar + `text-xl` display heading + hairline + optional "All X →". Apply to all five left sections and both sidebar lists. Deletes R4.
- **One** join CTA: keep the sidebar membership form (it is the only one that captures an email) and the full-width band above the footer (it is the only one that gets a full-width moment). Delete the Editorial Desk card, the Tipping Ring card and the Bulletins subscribe prompt — their destinations are already in the nav and the footer.
- Reclaimed sidebar space goes to "Also in this edition", which is the only sidebar block a reader wants.

**Step 4 — Honest section names (fixes F4).**
Either filter to match the label, or label to match the content. Recommended, because it needs no editorial taxonomy work:

| now | becomes |
|---|---|
| Latest Dispatches | **Latest** — `published.slice(1,4)` ✓ already accurate |
| Featured Analysis & Interviews | **More from the desk**, *or* filter to `section === 'analysis'` and keep the name |
| Also in this edition | **Also today** |
| Form the Stables | **From the stables** — 4 horses, arbitrary order; add "recently updated" ordering or drop the ordinal `01–04` numbering, which implies a ranking that does not exist |

**Then (separate, larger):** add `usePageMeta` to the other 15 public routes, give `/horses` and `/parties` the green band, and paginate `/api/articles` so the landing page stops downloading the whole archive.

---

## 7. Suggested sequence

| Order | Work | Clears | Effort |
|---|---|---|---|
| 1 | Landing Step 1 — gold-ink + type floor | R1–R3 on `/` | 2h |
| 2 | Landing Steps 2–4 — hero, one CTA, one header, honest names | F4, R4, landing D→B | 1 day |
| 3 | Whitelist `tipperProfiles` PUT + pin `tips.userId` server-side | R7, R8 | 2h |
| 4 | Delete F1 stock horse, F2 venue list, F3 parties map | F1–F3 | 2h |
| 5 | Gate the 4 newsroom CTAs on `isStaff`; drop `/api/tips` from landing | F9, R9 | 2h |
| 6 | Real loading states on `/horses` + `/tipping`; permission-gate `/parties` controls | R10, R11 | 3h |
| 7 | Roll the type/gold pass across the other 12 public pages | R1–R3 site-wide | 1 day |
| 8 | `usePageMeta` ×15; green band on `/horses` + `/parties`; podcast naming | R5, F5 | 1 day |
| 9 | Paginate `/api/articles`; server-side `/news` filtering | R12 | 2 days |

Steps 1–2 are the user's stated priority and are independent of everything else.

---

## 8. What is genuinely well built

- The `PUBLIC_FIELDS` whitelist on `/api/articles` — a whitelist, so a field added later is withheld by default.
- The `article.locked || !canViewPremium(...)` paywall gate, where **either** signal shows the wall so a truncated body can never render as whole.
- `/blog` as the reference public page: server pagination, `usePageMeta`, per-filter dismiss chips, `aria-live` on "load more", `status: 'published'` pinned client-side against staff draft leakage.
- Read-time reconciliation in `articles.ts` with `updateOneIf` for atomicity — scheduled publishing that works without a cron nobody runs.
- Server-authoritative race resolution with payouts computed server-side.
- Breaking news, sponsors, races, leaderboard and podcast stats all render **nothing** when empty instead of a placeholder shell — and the code comments say why, naming the fabrications they replaced.
