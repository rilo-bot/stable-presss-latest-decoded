# Stable Press — Public Website Review

**Date:** 2026-08-03
**Branch:** `feature/blogs` @ `366126f` (includes uncommitted working-tree changes)
**Scope:** every public route in `apps/web/src` — the 17 reader-facing pages, their sub-components, the stores behind them, and the server endpoints they call. Staff routes (`/production-system/*`, `/site-content`, `/claims`) and member routes (`/dashboard`, `/orgs/:id`, `/studio/*`) are out of scope except where a public page links into them.
**Method:** static read of every public page file end-to-end (5,732 lines of page code + 1,679 lines of landing/news/bulletin sub-components + 8 stores + 12 server route files), cross-checked against the API handlers that serve each page. **The app was not run in a browser** — nothing here rests on a rendered screenshot.

---

## Verdict

**The fake-data problem is solved.** Every list on the public site reads a real API. The fixtures removed in `docs/FAKE-DATA-REMOVED.md` (fabricated articles, Vol. 47, placeholder ABN, invented follower/subscriber counts) are genuinely gone, the code carries honest comments where they stood, and the empty states are truthful. Nothing on the public site invents a *record*.

What remains is three separate problems that got conflated under "fake data":

1. **One real data-exposure hole.** `GET /api/articles` is public and unfiltered — the entire editorial pipeline, drafts included, with full body text. Every other collection filters server-side. Articles are the outlier.
2. **Hardcoded decoration presented as content.** 12 hotlinked Pexels photos, five invented racecourses labelled "Featured in this edition", two widgets that look like maps but plot nothing, and a fabricated bio + fabricated pull-quote on every article.
3. **Real bugs, found while reading.** Articles are never sorted by date anywhere on the site. `/news` shows "no dispatches have been filed" *while it is loading*. `/parties` is public and ships Add/Edit/Delete controls.

Grades: **Data integrity B− · Data exposure D · Editorial honesty C+ · Correctness C**

**Nothing in this document has been fixed.**

---

## Page inventory

| Route | Page | Data source | Assessment |
|---|---|---|---|
| `/` | `pages/Landing.tsx` | 9 stores: articles, horses, parties, podcast, issues, breakingNews, sponsors, metrics, races/tippers | Real. Correct loading state. Hero unsorted (**H1**) |
| `/news` | `pages/NewsIndex.tsx` | `/api/articles`, filtered + searched client-side | Real. Unsorted (**H1**), inverted loading state (**H2**) |
| `/blog` | `pages/BlogIndex.tsx` | `/api/blogs` — server-paginated, server-sorted, server-filtered | **Reference implementation.** Nothing wrong found |
| `/blog/:slug` | `pages/BlogPost.tsx` | `/api/blogs/:idOrSlug` + `BlogRenderer` | Real. Slug history honoured, drafts 404 correctly. Paywall client-side only (**C3**) |
| `/newsletter` | `pages/Newsletter.tsx` | articles where `isLiveOn(a,'newsletter')` | Real data, fabricated chrome (**M2**, **M4**), dead link guard (**H4**) |
| `/bulletins` | `pages/Bulletins.tsx` | `/api/issues` + bulletin-channel articles | Real data, invented venues (**H6**), articles vanish once an issue exists (**H5**) |
| `/bulletins/:id` | `pages/BulletinViewer.tsx` | `/api/issues/:id`, real page renderer, server-rendered PDF | Real. Well built — same renderer as the editor, no drift |
| `/horses` | `pages/HorseProfiles.tsx` | `/api/horses` + localStorage follows | Real. Stock-photo fallback (**M1**), staff CTA (**H7**) |
| `/horses/:id` | `pages/HorseDetail.tsx` → `HorseProfile mode="view"` | horses, links, racing/media/sales/reports | Real. Empty fields render blank, no invention |
| `/articles/:id` | `pages/ArticleDetail.tsx` | article from store | Renders unpublished drafts to anyone (**C2**), fabricated byline + quote (**H8**, **H9**), two dead buttons (**L1**) |
| `/tipping` | `pages/TippingRing.tsx` | `/api/races`, `/api/tips`, `/api/tipperProfiles` | Real, server-authoritative payouts. "Run Race" open to all readers (**M6**), map is decorative (**H10**) |
| `/podcast` | `pages/PodcastHub.tsx` | `/api/podcastEpisodes` — **server**-filtered to published | Real. Wrong publication name in the copy (**M5**) |
| `/parties` | `pages/Parties.tsx` | `/api/parties` (provisional hidden server-side) | Real, but ships write UI publicly (**H3**); map plots nothing (**H11**) |
| `/parties/:id` | `pages/PartyDetail.tsx` → `PartyProfile mode="view"` | parties, links | Real |
| `/login` `/signup` | `pages/Login.tsx` `pages/Signup.tsx` | real OTP auth, real claim/org creation | Real. Marketing bullets overpromise (**M2**) |
| `/invite/:token` | `pages/InviteAccept.tsx` | `/api/invites` — public by necessity, OTP still required | Real |
| `/__preview/premium` | `pages/__PremiumPreview.tsx` | template blueprints | **Temp QA route, marked for deletion in its own header comment, still live and public** (**M7**) |
| `*` | `App.tsx` `NotFound` | — | Fine |

Shared public chrome: `components/NavBar.tsx` (+ `navbar/*`), `components/AgentWidget.tsx` (the AI concierge, mounted on every route including public ones — see `docs/AI-AGENTS-AUDIT.md` for the guest-reachability finding), `pages/landing/LandingFooter.tsx`.

---

## CRITICAL

### C1. `GET /api/articles` is public and returns the entire editorial pipeline

[`apps/server/src/routes/articles.ts:59-62`](../apps/server/src/routes/articles.ts#L59-L62):

```js
router.get('/', async (req, res) => {
  const items = await db.collection('articles').find();
  res.json(items.filter((d) => !d.deletedAt).map(project));
});
```

No status filter. No account check. An anonymous caller receives every `draft`, `submitted`, `approved` and `scheduled` article — with the **full body text** (`summary` is the body; `ArticleDetail` runs `splitIntoParagraphs(article.summary)`), the author, and the internal `changesRequestedNote`. The public site hides them only with a browser-side `.filter(isLive)` in `Landing.tsx:82`, `NewsIndex.tsx:48-51` and `useArticleGroups.ts:41`.

Every comparable endpoint gets this right, which is what makes articles the outlier:

- `/api/blogs` — forces `match.status = 'published'` and a `publishAt <= now` clause into the aggregation `$match`, deliberately *in the query* so pagination totals stay honest ([`blogs.ts:220-238`](../apps/server/src/routes/blogs.ts#L220-L238))
- `/api/issues` — filters `unpublishedAt` unless `canAccessNewsroom` ([`issues.ts:86-93`](../apps/server/src/routes/issues.ts#L86-L93))
- `/api/podcastEpisodes` — filters to `status === 'published'` unless `podcast.read_all` ([`podcastEpisodes.ts:43-48`](../apps/server/src/routes/podcastEpisodes.ts#L43-L48))
- `/api/horses` and `/api/parties` — hide `verificationStatus: 'unverified'` from non-staff, with a carve-out for the viewer's own records

**Consequence:** the unpublished newsroom pipeline is one `curl` away. Embargoed stories, spiked drafts, and editorial notes are all in a public payload.

**Fix:** filter by status server-side for non-staff (`canAccessNewsroom`), mirroring the blogs handler. The client-side `isLive` filters can stay as belt-and-braces.

---

### C2. `/articles/:id` renders unpublished drafts to anonymous visitors

`ArticleDetail` never gates on `isLive`. It looks the article up by id from the store and renders the body regardless of status, adding a courteous banner:

- [`ArticleDetail.tsx:196`](../apps/web/src/pages/ArticleDetail.tsx#L196) — `const live = isLive(article)`
- [`ArticleDetail.tsx:503-508`](../apps/web/src/pages/ArticleDetail.tsx#L503-L508) — `{!live && (…STATUS_LABELS[article.status]…)}` — a notice, not a gate
- Body renders unconditionally at [`:532`](../apps/web/src/pages/ArticleDetail.tsx#L532) onward

`STATUS_LABELS` in `article-detail/helpers.ts` even supplies reader-facing copy for the internal states: *"Draft — not yet published"*, *"Submitted — awaiting approval"*, *"Approved — cleared to run"*.

Compare `/blog/:slug`, which does this correctly — the server 404s an unpublished post for non-staff, and the comment explains why a 403 would be worse ("*a 403 would confirm that a post with that slug exists*").

**Consequence:** anyone holding an article id reads the draft. Combined with **C1**, which hands out every id, there is no barrier at all.

**Fix:** 404 non-live articles for non-staff at the API, and have `ArticleDetail` treat a non-live article as not-found unless the viewer is staff or its author.

---

### C3. The paywall is decoration — premium content ships in the payload

`Paywall` hides content after it has already been delivered to the browser:

- [`ArticleDetail.tsx:554-556`](../apps/web/src/pages/ArticleDetail.tsx#L554-L556) — renders paragraph 1 as a teaser, then swaps in `<Paywall>` in place of the rest
- [`BlogPost.tsx:219-227`](../apps/web/src/pages/BlogPost.tsx#L219-L227) — `blocks.filter(b => b.kind === 'paragraph').slice(0, 1)` in the browser

Neither endpoint checks `minTier`. `GET /api/blogs/:idOrSlug` returns `{ ...project(doc) }` — the complete block array and media pool. `GET /api/articles` returns the complete `summary`. `minTier` appears in `blogs.ts` exactly once ([`:207`](../apps/server/src/routes/blogs.ts#L207)) and only on the **write** path, to sanitise what an author sets.

**Consequence:** every premium article and blog post is readable in devtools, or by anyone who calls the API directly. The gate is cosmetic.

**Fix:** enforce `canViewContent(account.subscriptionTier, doc.minTier)` server-side and truncate the payload there. The client `Paywall` then renders against content that genuinely isn't present.

---

## HIGH

### H1. Articles are never sorted by date — anywhere on the site

There is no `sort` on the article path, client or server:

- [`articles.ts:60`](../apps/server/src/routes/articles.ts#L60) — bare `.find()`, no sort
- [`Landing.tsx:81-90`](../apps/web/src/pages/Landing.tsx#L81-L90) — `published = articles.filter(isLive)`, then `published[0]` becomes the **hero / "Cover Story"**, `slice(1,4)` the "Latest Dispatches", `slice(4,7)` "Featured Analysis", `slice(7,12)` the sidebar
- [`NewsIndex.tsx:69-87`](../apps/web/src/pages/NewsIndex.tsx#L69-L87) — `filteredArticles` is filter + search only
- `news-index/ArticleGrid.tsx` — renders the arrays as given
- `bulletins/useArticleGroups.ts:75` — `heroItem = source[0]`, the "Lead Story" on `/bulletins` and the "Cover Story" on `/newsletter`

So every "latest" surface on the site is in Mongo insertion order. The newest story appears wherever it happens to fall. `/blog` sorts server-side (`$sort: { _sortAt: -1 }`) and is unaffected — which is why the contrast is stark.

**Consequence:** on a publication, the front page lead is arbitrary. Publishing a story does not surface it.

**Fix:** sort `publishedAt` descending at the API, matching the blogs handler. Consider a `?limit` while there.

---

### H2. `/news` shows "no dispatches have been filed" while it is loading

[`NewsIndex.tsx:282-315`](../apps/web/src/pages/NewsIndex.tsx#L282-L315) orders its branches:

```jsx
{liveArticles.length === 0 && !search ? ( /* "The press stands ready…" CTA */ )
  : loading ? ( /* skeleton */ )
  : filteredArticles.length === 0 ? ( /* EmptyState */ )
  : ( <ArticleGrid … /> )}
```

`loading` is a cosmetic `setTimeout(…, 500)` ([`:42-45`](../apps/web/src/pages/NewsIndex.tsx#L42-L45)) unrelated to the fetch. During the first 500 ms — exactly while the request is in flight — `liveArticles.length === 0`, so the **first** branch wins and a visitor reads *"The press stands ready. No dispatches have been filed."* The skeleton branch is only reachable if articles arrive in under 500 ms. On a slow connection or a failed fetch, the "nothing published" CTA is the final state.

The same decoupled-timer pattern is in `Newsletter.tsx:39-42` (600 ms), `Bulletins.tsx:47-50` (600 ms), `HorseProfiles.tsx:31-34` (600 ms) and `TippingRing.tsx:92-95` (500 ms) — cosmetic rather than wrong in those four, since they check `loading` first.

`Landing.tsx:66` does it correctly: `articlesLoading = !s.loaded && !s.error`.

**Fix:** derive `loading` from the store (`!loaded && !error`) and test it before the empty branches. Add an error state — a failed fetch currently reads as "we have published nothing".

---

### H3. `/parties` is a public route that ships Add / Edit / Delete controls

The route sits in the public block of [`App.tsx:257-264`](../apps/web/src/App.tsx#L257-L264) — no `RequireAuth`, no `RequireStaff`. The page renders, to everyone:

- an **"Add Party"** button in the header ([`Parties.tsx:338-341`](../apps/web/src/pages/Parties.tsx#L338-L341)) and a second one in the empty state ([`:398-401`](../apps/web/src/pages/Parties.tsx#L398-L401))
- per-card **Edit** and **Delete** buttons on hover ([`:55-70`](../apps/web/src/pages/Parties.tsx#L55-L70))
- a delete confirmation dialog reading *"This will permanently remove **X** from Stable Press. This action cannot be undone."* ([`:147-151`](../apps/web/src/pages/Parties.tsx#L147-L151))

The server rejects all of it — `partyScopedWriteGate` guards `/api/parties` writes, so nothing is destroyed. This is a UX and trust bug, not a breach: an anonymous visitor is offered destructive controls that fail with a toast.

**Fix:** gate the write affordances on `canManageParty` / `isStaff`, as the horse profile already does (`editable = canManageHorse(...)`).

---

### H4. Dead `isReal` guards silently strip links from real articles

Leftovers from the deleted fixture arrays. Three sites still suppress the `<Link>` wrapper when an id has a magic prefix:

- [`bulletins/SectionGrid.tsx:85`](../apps/web/src/pages/bulletins/SectionGrid.tsx#L85) — `!(item as any).id.startsWith('bl')`
- [`bulletins/SectionGrid.tsx:248`](../apps/web/src/pages/bulletins/SectionGrid.tsx#L248) — `!(item as any).id.startsWith('fb')`
- [`Bulletins.tsx:398-401`](../apps/web/src/pages/Bulletins.tsx#L398-L401) — same `'bl'` check on the hero

The fixtures those prefixes identified no longer exist. But Mongo ObjectIds are hex, and **`fb` is valid hex** — so a real article whose id begins `fb` (~1 in 256) renders as an unclickable card on `/newsletter`. `bl` is not valid hex, so the two `'bl'` guards are merely dead code.

**Fix:** delete all three. Every item reaching these components is now a real article.

---

### H5. Bulletin-channel articles disappear the moment any issue is published

[`Bulletins.tsx:313`](../apps/web/src/pages/Bulletins.tsx#L313) wraps the entire article section — hero, section grid, skeleton and empty state — in `{publishedIssues.length === 0 && ( … )}`. The comment calls it "legacy bulletin articles — shown when no issues yet".

**Consequence:** publish one magazine issue and every story filed to the `bulletin` channel vanishes from `/bulletins`. The `/news` page still band-lists them under "Print Bulletin" with a "Full bulletin →" link to a page that no longer shows them. Editors filing to the bulletin channel have no idea their work is hidden.

**Fix:** decide whether the bulletin channel and magazine issues coexist. If they do, render both sections unconditionally.

---

### H6. `RACE_VENUES` — five invented racecourses labelled "Featured in this edition"

[`bulletins/constants.tsx:21-27`](../apps/web/src/pages/bulletins/constants.tsx#L21-L27):

```ts
export const RACE_VENUES = [
  { name: 'Flemington Racecourse', location: 'Flemington, Melbourne VIC' },
  { name: 'Royal Randwick',        location: 'Randwick, Sydney NSW' },
  { name: 'Eagle Farm Racecourse', location: 'Eagle Farm, Brisbane QLD' },
  { name: 'Morphettville',         location: 'Morphettville, Adelaide SA' },
  { name: 'Ascot Racecourse',      location: 'Ascot, Perth WA' },
];
```

`bulletins/VenueMap.tsx` renders them on `/bulletins` under a "Race Venues" header with the sub-label **"Featured in this edition"** ([`VenueMap.tsx:34-36`](../apps/web/src/pages/bulletins/VenueMap.tsx#L34-L36)) and the prompt "Select a venue to explore". Nothing connects any of them to any edition, article or race. The real `Race` documents in `/api/races` carry `venue`, `lat` and `lng` and are never consulted here.

**This is the last outright fabricated dataset on the public site.**

**Fix:** delete the section, or drive it from the venues actually referenced by the edition's stories / open races.

---

### H7. Public empty states send readers to staff-only routes

Every content-empty state makes a staff destination its **primary** CTA — which is the first thing a brand-new visitor sees:

| Page | CTA | Target | Guard |
|---|---|---|---|
| `/news` [`:296-301`](../apps/web/src/pages/NewsIndex.tsx#L296-L301) | "Go to Newsroom Production System" | `/production-system` | `RequireStaff` |
| `/newsletter` [`:273-278`](../apps/web/src/pages/Newsletter.tsx#L273-L278) | "Go to Newsroom Production System" | `/production-system` | `RequireStaff` |
| `/bulletins` [`:359-367`](../apps/web/src/pages/Bulletins.tsx#L359-L367) | "Go to Newsroom Production System" | `/production-system` | `RequireStaff` |
| `/horses` [`:158-165`](../apps/web/src/pages/HorseProfiles.tsx#L158-L165) | "Go to Newsroom" | `/production-system` | `RequireStaff` |
| `/` [`LandingFeaturedArticles.tsx:69-75`](../apps/web/src/pages/landing/LandingFeaturedArticles.tsx#L69-L75) | "Go to Newsroom" | `/production-system` | `RequireStaff` |
| `/podcast` [`:171-177`](../apps/web/src/pages/PodcastHub.tsx#L171-L177) | "Go to Podcast Workflow" | `/podcast/workflow` | `RequireStaff` |

Plus [`LandingFeaturedArticles.tsx:178-183`](../apps/web/src/pages/landing/LandingFeaturedArticles.tsx#L178-L183) — "Add a profile" → `/horses`, a page with no add affordance.

A logged-out reader who clicks any of these is redirected home by the guard.

**Fix:** branch the CTA on `isStaff(currentUser)`. Show readers something they can act on ("Browse the blog", "Enter the Tipping Ring") and keep the newsroom link for staff.

---

### H8. Every article byline carries a fabricated job title and bio

`ArticleDetail` hardcodes the same identity for every author, whoever they are:

- [`:370-372`](../apps/web/src/pages/ArticleDetail.tsx#L370-L372) — the byline row prints **"Staff Correspondent"** under the name, unconditionally
- [`:656-659`](../apps/web/src/pages/ArticleDetail.tsx#L656-L659) — the author card prints: *"Staff Correspondent, Stable Press. Covering the thoroughbred racing circuit with a focus on form analysis and paddock intelligence."*

A guest contributor, a trainer writing a column, or an owner is described to readers as Stable Press staff with an invented beat.

`/blog` handles this correctly and shows the fix: `BlogPost.tsx:251-263` renders the author-note block **only if** `current.author.bio` exists, and links the byline to the author's real party profile when `author.partyId` is set.

**Fix:** drop both hardcoded strings. Add a real author/bio source (the existing `parties` collection already models people), and render the block only when populated.

---

### H9. Body prose is rendered as a direct quotation

[`ArticleDetail.tsx:560-577`](../apps/web/src/pages/ArticleDetail.tsx#L560-L577) takes **paragraph 2 of the article body**, wraps it in quote marks, and attributes it to the author with an em-dash:

```jsx
{paragraphs.length >= 3 && (
  <div className="my-8 pl-5 border-l-[3px] …">
    <p …>"{paragraphs[1]}"</p>
    <p …>— {article.author}</p>
  </div>
)}
```

`paragraphs` comes from `splitIntoParagraphs(article.summary)`, which — absent double newlines — groups the body into arbitrary chunks of three sentences ([`article-detail/helpers.ts:12-24`](../apps/web/src/pages/article-detail/helpers.ts#L12-L24)). The result is narrative third-person prose presented to readers as words the author said, inside quotation marks, with an attribution line.

Of everything in this document, this is the one item I would call an editorial-integrity problem rather than a cosmetic one: it manufactures a quote that was never uttered, and it does so on every article with three or more paragraphs.

**Fix:** delete the pull-quote block. If pull-quotes are wanted, add a real `pullQuote` field (the `Horse` model already has one) and render it only when an editor sets it.

---

### H10. The Tipping Ring "map" is a blurred single map tile

`components/RaceMap.tsx` is presented as a map — `<MapPin>` header, "Race Venues" title, venue tabs, coordinates in monospace. What it renders is:

- **one** OpenStreetMap tile, computed for the selected venue's lat/lng ([`:38-49`](../apps/web/src/components/RaceMap.tsx#L38-L49)), drawn at `opacity-30 blur-sm scale-110` with `imageRendering: 'pixelated'`
- a CSS grid overlay whose own comment reads `Grid overlay for map aesthetic` ([`:151-159`](../apps/web/src/components/RaceMap.tsx#L151-L159))
- a centred card with the venue name and a "View on Google Maps" link

The source comments are candid — `this is just a decorative background`, `no API key required`. The component is honest internally and misleading on screen.

**Fix:** either render a real embed (the `/bulletins` `VenueMap` already uses a working `maps.google.com/…&output=embed` iframe, no key needed) or restyle this as the venue-list-with-link that it actually is.

---

### H11. The Parties map plots nothing, and the copy claims it does

[`Parties.tsx:224-234`](../apps/web/src/pages/Parties.tsx#L224-L234) embeds a Google Maps iframe hardcoded to a generic search:

```
https://maps.google.com/maps?q=thoroughbred+racing&t=m&z=3&ie=UTF8&iwloc=B&output=embed
```

No party is passed to it. It is badged **"Racing Connections — Worldwide"** ([`:218-220`](../apps/web/src/pages/Parties.tsx#L218-L220)) and captioned *"Track where your owners, trainers, jockeys and breeders are based across the globe."* ([`:239-241`](../apps/web/src/pages/Parties.tsx#L239-L241)).

Parties **do** carry `base_location` — the card renders it — so the data to fulfil the claim exists and is unused.

**Fix:** plot the parties' `base_location` values, or delete the section. Do not keep the caption without the capability.

---

## MEDIUM

### M1. Twelve hotlinked Pexels photos stand in as editorial imagery

| File | Line | Renders as |
|---|---|---|
| `pages/landing/LandingHero.tsx` | [24](../apps/web/src/pages/landing/LandingHero.tsx#L24) | the homepage hero when the lead story has no image |
| `pages/article-detail/helpers.ts` | [28](../apps/web/src/pages/article-detail/helpers.ts#L28) | `DEFAULT_HERO` — full-bleed hero on every imageless article |
| `components/HorseCard.tsx` | [8](../apps/web/src/components/HorseCard.tsx#L8) | a generic horse for **any** horse without a photo, incl. via `onError` |
| `pages/bulletins/constants.tsx` | [14-16](../apps/web/src/pages/bulletins/constants.tsx#L14-L16) | `SECTION_IMAGES` — news / analysis / interviews card art |
| `pages/bulletins/SectionGrid.tsx` | [88](../apps/web/src/pages/bulletins/SectionGrid.tsx#L88) | inline fallback on every bulletin list item |
| `pages/Bulletins.tsx` | [79](../apps/web/src/pages/Bulletins.tsx#L79), [404](../apps/web/src/pages/Bulletins.tsx#L404) | the `/bulletins` masthead and the lead-story fallback |
| `pages/Newsletter.tsx` | [70](../apps/web/src/pages/Newsletter.tsx#L70) | the `/newsletter` masthead |

Two further URLs live in `editor/templates/*` (magazine blueprint defaults) and are out of scope here.

Three problems: the same handful of stock horses recur across unrelated stories; there is no attribution or license record; and they are third-party hotlinks on the critical render path, so pexels.com availability is a dependency of your homepage rendering.

**Fix:** self-host a small set of deliberately generic, attributed fallbacks — or render no image and let the layout close up, which the blog cards already do (`{post.thumbnailUrl && …}`).

### M2. Membership and delivery promises with no system behind them

`/api/subscription` is annotated "manual, no billing yet" in `index.ts:142`, and there is no email-capture or sending anywhere in the codebase. Meanwhile:

- [`LandingSidebar.tsx:68-74`](../apps/web/src/pages/landing/LandingSidebar.tsx#L68-L74) — a ticked benefit list: "Unlimited editorial access", "Fortnightly print bulletin", "Tipping ring entry", "Podcast early access", "Horse profile deep dives", under a **"Start Membership"** button
- [`Newsletter.tsx:466-471`](../apps/web/src/pages/Newsletter.tsx#L466-L471) — "Receive every edition, direct to your inbox" → the button goes to `/signup`
- [`Newsletter.tsx:107`](../apps/web/src/pages/Newsletter.tsx#L107) — "curated racing intelligence delivered every week"
- [`Bulletins.tsx:528-533`](../apps/web/src/pages/Bulletins.tsx#L528-L533) — "Receive the Bulletin in print, fortnightly… delivered to members"
- [`Signup.tsx:271-281`](../apps/web/src/pages/Signup.tsx#L271-L281) — "Longform race reports from our correspondents at every major track"

The landing subscribe form is the honest exception and shows the right instinct — it routes to `/signup?email=…` with a comment explaining that there is no anonymous capture store ([`Landing.tsx:145-151`](../apps/web/src/pages/Landing.tsx#L145-L151)).

**Fix:** trim the claims to what exists today, or build the capture. Either is fine; the gap is not.

### M3. A stat tile that restates its own label

[`Bulletins.tsx:161-166`](../apps/web/src/pages/Bulletins.tsx#L161-L166):

```js
{ label: 'Fortnightly', value: 'Bi-Weekly' },
{ label: 'This Issue',  value: `${source.length} pieces` },   // real
```

The first tile renders "Bi-Weekly" above the caption "Fortnightly" in the same visual slot as the real count beside it. The surrounding comment correctly notes that the fabricated "Vol. 47" was removed — this leftover is the same category of thing: a cadence *asserted* in a slot reserved for *measured* values.

**Fix:** drop the tile, or make it a real figure (issues published this year, days since last edition).

### M4. "Cover Story" / "Lead Story" is just `source[0]`

`bulletins/useArticleGroups.ts:75` sets `heroItem = source[0]`. `/newsletter` badges it **"Cover Story"** ([`Newsletter.tsx:332-337`](../apps/web/src/pages/Newsletter.tsx#L332-L337)) and `/bulletins` badges it **"Lead Story"** ([`Bulletins.tsx:382-389`](../apps/web/src/pages/Bulletins.tsx#L382-L389)). `Landing.tsx:87` does the same for the homepage "Cover Story" chip. Combined with **H1** (no sort), the lead is not merely uncurated — it is arbitrary.

**Fix:** add a real `featured` flag editors can set, or at minimum label it honestly once sorting lands ("Latest").

### M5. Publication and show names contradict each other on the public site

- [`PodcastHub.tsx:211-215`](../apps/web/src/pages/PodcastHub.tsx#L211-L215) — "A weekly long-form audio programme from the editors of **The Gallop Racing Journal**." Wrong publication entirely, plus an unsupported cadence claim.
- The show is **"The Gallop Podcast"** on `/podcast` ([`:69`](../apps/web/src/pages/PodcastHub.tsx#L69)) but **"The Stable Press Podcast"** in the landing sidebar ([`LandingPodcast.tsx:24`](../apps/web/src/pages/landing/LandingPodcast.tsx#L24)) and the article sidebar ([`article-detail/Sidebar.tsx:169`](../apps/web/src/pages/article-detail/Sidebar.tsx#L169)).
- [`NavBar.tsx:286`](../apps/web/src/components/NavBar.tsx#L286) — the wordmark sub-line reads **"NZTROF Ownership"**, while the copy throughout says "Australian thoroughbred racing", the venues are Australian (**H6**), dates format `en-AU`, and the contact address is `.com.au`.
- [`LandingSidebar.tsx:275`](../apps/web/src/pages/landing/LandingSidebar.tsx#L275) — `press@stablepress.com.au` is hardcoded; worth confirming the mailbox exists before it collects enquiries.
- [`PodcastHub.tsx:220-222`](../apps/web/src/pages/PodcastHub.tsx#L220-L222) — an unattributed epigraph presented as a house quote.

`LandingFooter.tsx:187-188` shows the right treatment for exactly this class of problem — the placeholder ABN was removed with a comment saying to add the real one when registered, rather than shipping a fabricated identifier.

### M6. Any signed-in reader can settle any open race for everyone

[`RaceCard.tsx:164-173`](../apps/web/src/components/RaceCard.tsx#L164-L173) shows a **"Run Race"** button on every open race to any authenticated user — the client comment calls it a "demo feature". It posts to `/api/tipping/resolve`, which is mounted behind `authedWriteGate` (any signed-in user), picks a winner, settles every tip on the race and credits winners' balances.

The server comment says this is deliberate: *"Any signed-in user may trigger a resolution (the play-money 'Run Race'), but cannot influence the payout maths."* The payout logic is genuinely server-authoritative and sound.

Recording it because it is live on a public page: a brand-new reader can resolve a race the whole leaderboard is riding on, and the outcome is irreversible. Reasonable for play money in development; worth a deliberate decision before launch.

### M7. `/__preview/premium` is a temp QA route, still public

`pages/__PremiumPreview.tsx:1-2` — *"TEMPORARY preview route (no auth) so the premium pages can be screenshot for visual QA… Delete this file + its route when done."* Registered unguarded at [`App.tsx:281`](../apps/web/src/App.tsx#L281) with its own "TEMP preview route for visual QA — remove" comment. It renders five premium magazine page templates with their default blueprint content.

**Fix:** delete the file and the route, as both comments instruct.

### M8. Landing metric labels overstate what they count

[`metrics.ts:18-32`](../apps/server/src/routes/metrics.ts#L18-L32) computes four counts live from real collections — the mechanism is honest. The labels are not quite:

- **"Active Members"** = `users.length`, every user document — staff, test accounts, and anyone who ever signed up. Nothing about activity.
- **"Leaderboard Tippers"** = `tipperProfiles.length`, i.e. every profile ever created, including those with zero tips (`getOrCreateProfile` creates one on first visit to `/tipping`).

These render in the hero strip and again in the hero sub-line ([`LandingHero.tsx:166-172`](../apps/web/src/pages/landing/LandingHero.tsx#L166-L172)).

**Fix:** either rename the labels ("Registered Members", "Tipping Profiles") or add the filters the current names imply.

---

## LOW

### L1. Two dead buttons on `/articles/:id`

- **Bookmark / "Save"** ([`ArticleDetail.tsx:480-486`](../apps/web/src/pages/ArticleDetail.tsx#L480-L486)) — no `onClick` at all. Clicking does nothing, silently.
- **Share** ([`:487-498`](../apps/web/src/pages/ArticleDetail.tsx#L487-L498)) — `if (navigator.share)` with no `else`. Silently does nothing on desktop Chrome and Firefox, i.e. most readers.

A `followStore` already exists for horses and could back "Save"; `navigator.clipboard.writeText` is the standard Share fallback.

### L2. Article tags look interactive and are not

[`ArticleDetail.tsx:620-627`](../apps/web/src/pages/ArticleDetail.tsx#L620-L627) — the "Filed under" tag chips carry `cursor-pointer` and a hover border transition, with no handler. `/blog` gets this right: its tags are real `<Link to={/blog?tag=…}>` and `/blog` reads the `tag` param.

### L3. `/news` search and filtering are entirely client-side over the full corpus

`NewsIndex` pulls **every** article into the browser and filters in JS. `BlogIndex`'s header comment calls this out explicitly as the thing it does differently ("*Server-paginated, unlike /news, which pulls every article into the browser*"). Fine at current volume; it will not hold. Fixing **C1** is the natural moment to add pagination.

### L4. `/api/tips` returns every tip with every `userId`

[`tips.ts:24-27`](../apps/server/src/routes/tips.ts#L24-L27) — a bare public listing. `TippingRing` needs it to show the viewer their own tips, but it exposes who backed what across all users. Low harm for play money; trivially scoped to `req.account.id` for non-staff.

### L5. Unpublished-status copy is written for readers

`article-detail/helpers.ts:3-9` supplies reader-facing sentences for internal workflow states ("Submitted — awaiting approval", "Approved — cleared to run"). Once **C2** is fixed these become unreachable on the public page and should move to the newsroom, where they belong.

### L6. `crossOrigin="anonymous"` on every `<img>`

Applied uniformly across the public pages (a requirement of the magazine PDF rasterisation path). Harmless for Pexels and S3, which send CORS headers — but any future image host that does not will fail to render with no fallback. Worth knowing when the fallbacks in **M1** are replaced.

---

## What is genuinely well built

Worth recording so it does not get refactored away:

- **`/blog` is the reference implementation.** Server-side pagination, server-side sort, server-side draft filtering, escaped regex on search, `publishAt` filtered *in the query* so the `$count` cannot disagree with the rows, slug history honoured with a 301 so old links survive a retitle, 404-not-403 on unpublished so a slug's existence is not confirmed. The comments explain *why* in each case. Every fix above has a working precedent in `blogs.ts` or `BlogPost.tsx`.
- **`/bulletins/:id`** renders published issues through the exact same page components as the editor, and the PDF is produced by printing that same route in headless Chromium — so there is zero renderer drift between screen, editor and print.
- **Empty states are honest everywhere.** No page invents content to fill a gap. `LandingLeaderboard` and `LandingRaces` return `null` rather than render an empty shell; `LandingSidebar` prints "No sponsors listed yet"; the removed-fixture comments in `news-index/constants.tsx:103-107` and `followStore.ts:1-11` explain exactly what was deleted and why nothing should replace it.
- **`followStore`** deliberately refuses to show a follower count because there is no backend for one — the reasoning is in the file header. That is the standard the rest of this document is measured against.
- **Horse and party public profiles** are fully real: empty fields render blank, unverified records are hidden server-side, and edit chrome is gated on `canManageHorse` — which is precisely what `/parties` (**H3**) fails to do.
- **Tipping payouts** are server-authoritative: the winner is drawn from implied probability and balances are credited on the server, which is why `/api/tipperProfiles` writes are owner-only.

---

## Suggested sequence

**First — close the exposure (C1, C2, C3).** One server-side status filter and one `minTier` check. Small, self-contained, and `blogs.ts` is the template. Nothing else should ship before this.

**Second — the correctness pair (H1, H2).** Sort articles by `publishedAt` at the API; derive `loading` from the store and test it before the empty branches. Together these are what make the site read as a functioning publication.

**Third — the public-surface fixes (H3, H4, H5, H7).** Gate the party write UI, delete the three dead `isReal` guards, decide the bulletin-channel/issue coexistence question, branch the empty-state CTAs on `isStaff`.

**Fourth — delete the decoration (H6, H10, H11, M7).** `RACE_VENUES` and its map, the fake `RaceMap`, the unplotted Parties map, the temp preview route. All four are removals, not builds.

**Fifth — editorial honesty (H8, H9, M1, M2, M3, M5).** Drop the fabricated pull-quote and per-author bio, reconcile the podcast/publication naming and NZTROF-vs-AU, trim the membership claims to what exists, replace or attribute the stock photography.

`H9` (fabricated quotations) is a one-line deletion and sits in the last group only because it is not a data or security issue. If the site is going in front of anyone in the industry before then, pull it forward.
