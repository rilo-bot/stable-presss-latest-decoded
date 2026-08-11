# Frontend review — stability & optimization (public web pages)

**Date:** 2026-08-05 · **Branch:** `feature/blogs` · **Scope:** `apps/web` — the public
web pages first, as asked. Campaign Engine screens and the AI studios are only
covered here where they affect what a public visitor downloads.

## How this was measured

Not a read-through. Every number below came from one of three places:

1. `vite build` on the current tree.
2. A real Chromium run over 11 routes against the **dev** server (`/`, `/news`,
   `/blog`, `/bulletins`, `/horses`, `/parties`, `/podcast`, `/tipping`, `/login`,
   `/signup`, a 404), capturing console output, every request, and
   `PerformanceNavigationTiming` / `PerformanceResourceTiming`.
3. The same run against the **production build** served from `dist/`, with `/api`
   proxied to the real Express app.

Where a dev number and a prod number disagree, both are reported — the difference
is itself a finding twice below. The test database was empty, so payload sizes for
list responses are floor values, not typical ones.

Production numbers, per route:

| Route | Transfer | FCP | DOM nodes | API calls | Tab title |
|---|---|---|---|---|---|
| `/` | 635 KB | 444 ms | 317 | **11** | The Thoroughbred Racing Record |
| `/news` | 635 KB | 384 ms | 222 | 3 | `Stable Press` |
| `/blog` | 635 KB | 364 ms | 102 | 3 | The Blog |
| `/bulletins` | 635 KB | 384 ms | 119 | 3 | `Stable Press` |
| `/horses` | 635 KB | 372 ms | 87 | 4 | `Stable Press` |
| `/parties` | 635 KB | 384 ms | 96 | 3 | `Stable Press` |
| `/podcast` | 635 KB | 340 ms | 99 | 3 | `Stable Press` |
| `/tipping` | 635 KB | 392 ms | 112 | 5 | `Stable Press` |
| `/login` | 565 KB | 372 ms | 57 | 2 | `Stable Press` |
| `/signup` | 565 KB | 364 ms | 106 | 2 | `Stable Press` |
| 404 | 635 KB | 332 ms | 69 | 2 | `Stable Press` |

FCP is fast because this is localhost with a warm cache and an empty database.
The transfer column is the one that travels.

---

## Optimization

### O1 — Critical. One 2 MB chunk: the login page ships the whole Campaign Engine

`vite build` output:

```
dist/assets/index-FeH4FQqG.js   2,051.29 kB │ gzip: 545.48 kB
(!) Some chunks are larger than 500 kB after minification.
```

There is **no code splitting at all** — `React.lazy` appears zero times in
`apps/web/src`, and all 60+ route components are static imports at the top of
[App.tsx](apps/web/src/App.tsx#L18-L67). So every visitor to every route downloads
every screen.

Staff-only code sitting in that single public chunk:

| Tree | LOC |
|---|---|
| `pages/newsroom` | 5,788 |
| `pages/production-system` | 5,507 |
| `agent` (5 AI studios) | 5,181 |
| `editor-v2` (magazine editor) | 4,813 |
| `pages/blog-composer` | 4,015 |
| `pages/instant` | 1,712 |
| `pages/podcast-workflow` | 1,682 |
| **Total** | **28,698** of 64,104 LOC in `src` |

~45% of the frontend is code no anonymous visitor can reach. Measured
consequence: **`/login` transfers 565 KB** to render an email field and a button,
including `RolesPermissionsView.tsx` (1,226 LOC of RBAC checkboxes) and the
magazine editor.

**Fix.** Lazy-load at the three seams that already exist in the router:

- the entire `RequireStaff` subtree (`/production-system/*`, `/site-content`),
- `MagazineEditorV2` at `/production-system/magazine-v2/:id`,
- the `agent/` studio panels and `AgentWidget`'s panel (see O7).

The route structure is already grouped correctly, so this is `React.lazy` +
one `<Suspense>` per group, not a refactor. Add `build.rollupOptions.output.manualChunks`
to split `react`/`react-dom`/`framer-motion` into a long-cached vendor chunk.

### O2 — High. Public list endpoints read whole collections

Every public list route does an unbounded `find()` and returns the full
collection, with no filter, limit, or projection:

- [horses.ts:28](apps/server/src/routes/horses.ts#L28) — `db.collection('horses').find()`, then filters visibility **in JS**, and separately reads all of `horsePartyLinks` to do it
- [parties.ts:15](apps/server/src/routes/parties.ts#L15)
- [podcastEpisodes.ts:65](apps/server/src/routes/podcastEpisodes.ts#L65) — reads all, then `filter(e => e.status === 'published')` in JS
- [sponsors.ts:29](apps/server/src/routes/sponsors.ts#L29), [breakingNews.ts:30](apps/server/src/routes/breakingNews.ts#L30) — read all, then sort in JS

The landing page needs about six horses and a handful of directory entries.
This is fine at today's row counts and gets worse linearly, with no signal
when it does.

Two endpoints in this repo already do it properly and are the model to copy:
[blogs.ts:287-371](apps/server/src/routes/blogs.ts#L287-L371) (server-side
`page`/`limit`/`skip`, projection, first-paragraph teaser only) and
[issues.ts:68](apps/server/src/routes/issues.ts#L68), which switched to
`aggregate()` specifically so it stopped shipping ~41 KB of embedded pages per
issue to a public route. The comment there describes this exact class of bug.

### O3 — High. Fonts load in three serialized waves, with no preconnect

[index.html](apps/web/index.html) has no `preconnect` or `dns-prefetch` to
`fonts.googleapis.com` / `fonts.gstatic.com`. Then:

1. [theme.css:1](apps/web/src/styles/theme.css#L1) and
   [theme.css:6](apps/web/src/styles/theme.css#L6) are two
   `@import url('https://fonts.googleapis.com/...')` at the top of the stylesheet,
   covering 8 families across many weights. Verified these survive the build —
   `dist/assets/index-*.css` still opens with the remote `@import`. A remote
   `@import` inside a render-blocking `<link>` can only be discovered *after* that
   stylesheet has downloaded and parsed, so it is an extra blocking round trip.
   Twice.
2. [App.tsx:70-85](apps/web/src/App.tsx#L70-L85) (`useVintageFonts`) injects a
   **third** Google Fonts `<link>` from JavaScript, so it cannot even start until
   the 545 KB bundle has downloaded, parsed and executed.

**Fix.** Move all three into `index.html` as `preconnect` + a single
`<link rel="stylesheet">`, delete the JS injection, and trim the weight list to
what is actually used. The `useVintageFonts` cleanup also removes the `<link>` on
unmount, which thrashes in StrictMode dev for no benefit.

### O4 — Medium. The landing page fires 11 parallel requests on mount

Verified against the production build:

```
/api/horses  /api/parties  /api/podcastEpisodes  /api/issues  /api/breakingNews
/api/sponsors  /api/metrics  /api/articles  /api/blogs  /api/site-settings
/api/agent/voice/status
```

Nine come from one `useEffect` in [Landing.tsx:47-67](apps/web/src/pages/Landing.tsx#L47-L67).
Combined with O2, the front page pulls most of the database to render one screen
of cards. A composite `/api/landing` — or just `?limit=` on the existing routes —
collapses this to one or two requests.

### O5 — Medium. Images are eager and mostly undimensioned

Across `apps/web/src`: **67 `<img>` tags, 11 with `loading="lazy"`, 4 with
`decoding`.** The below-the-fold card grids on `/news`, `/horses`, `/parties`,
`/blog` and the landing strips are all eager, so they compete with the hero for
bandwidth. Almost none carry `width`/`height`, making every card a CLS source
(the hero at [LandingHero.tsx:180-181](apps/web/src/pages/landing/LandingHero.tsx#L180-L181)
does, correctly).

### O6 — Medium. Eight of eleven public routes have no tab title

[usePageMeta](apps/web/src/lib/usePageMeta.ts) exists and is good, but is called
from only three pages — `Landing`, `BlogIndex`, `BlogPost`. Verified in the
browser: `/news`, `/bulletins`, `/horses`, `/parties`, `/podcast`, `/tipping`,
`/login`, `/signup` and the 404 page all show the bare string `Stable Press` in
the tab, in history, and in any bookmark. The hook's own docstring says every
route used to share one static title; the fix was applied to a third of them.

(Scope note, from that same docstring: this is client-side, so it is tab/history
only and not SEO. SSR/prerender is tracked separately in `docs/BLOG-FEATURE-REVIEW.md`.)

### O7 — Medium. `AgentWidget` is mounted on every page, for everyone

[AgentWidget](apps/web/src/components/AgentWidget.tsx) is rendered unconditionally
in [App.tsx:454](apps/web/src/App.tsx#L454), including for anonymous visitors on
the front page. It pulls `@ai-sdk/react`, `ai`, `framer-motion`, `react-markdown` +
`remark-gfm`, the voice hook and the attachment stack into the initial chunk, and
calls `useChat` and `useVoiceChat` unconditionally at the top of the component
before anything is opened.

The collapsed launcher also runs **three** `repeat: Infinity` framer-motion
animations at all times — the pulsing ring, the galloping horse, and the sparkle
badge ([AgentWidget.tsx:320-356](apps/web/src/components/AgentWidget.tsx#L320-L356)).
`useReducedMotion` gates them, which is the right call for the people who ask;
everyone else gets three permanent animation loops on every page.

**Fix.** Keep the launcher as static markup; `React.lazy` the panel and its
dependency tree behind the first open.

### O8 — Low. No component memoization on the list pages

`React.memo` appears **0** times and `useCallback` **7** times across 164
component files, so a state change on a list page re-renders every card. This
matters less than it sounds — `useMemo` is used well (147 sites, and the
derivations in `Landing.tsx` and `NewsIndex.tsx` are carefully and correctly
memoized) — but `ArticleCard` / `HorseCard` / the party rows are where it would
pay once lists are long.

---

## Stability

### S1 — High. `crossOrigin="anonymous"` on ~50 images, `onError` on 4

Adding `crossOrigin` makes the image a CORS request, which means **an image host
that omits `Access-Control-Allow-Origin` fails the image entirely** rather than
merely tainting the canvas. There are ~50 such `<img>` tags and only 4 `onError`
handlers in the whole app.

The codebase already understands this precisely —
[ImageUploader.tsx:186-191](apps/web/src/components/horse-form/ImageUploader.tsx#L186-L191)
names "a host that sends no CORS headers (the `crossOrigin` below makes the fetch
a CORS request)" and handles it, as does `HorseCard`. The pattern just was not
carried to the other ~46 sites.

Worst case is the front page: the full-screen hero at
[LandingHero.tsx:176-184](apps/web/src/pages/landing/LandingHero.tsx#L176-L184) sets
`crossOrigin` with no `onError`, so a CORS-less lead image gives a broken
full-viewport hero above two scrim overlays.

**Fix.** Either drop `crossOrigin` everywhere it is not feeding a canvas/PDF
export, or wrap the reader-facing `<img>` sites in the fallback `HorseCard`
already uses. The first is preferable — most of these are plain display images.

### S2 — High. No request cancellation anywhere in the app

`AbortController` appears **zero** times in `apps/web/src`. Only 9 files use even
a `cancelled` boolean guard. Nothing passes a `signal` to `authFetch`/`authFetchRetry`
— [lib/api.ts](apps/web/src/lib/api.ts) doesn't thread one through.

Three consequences, in rising order of visibility:

- `setState` after unmount on every page navigated away from mid-load.
- Last-write-wins races: on `/blog/:slug` and `/horses/:id`, clicking through
  records faster than the network settles can land an earlier response on top of
  a later one, showing the wrong record with the right URL.
- `authFetchRetry` makes this worse by design — a cold-start 5xx keeps a doomed
  request alive across 400 ms and 800 ms backoffs, well past the navigation.

Threading a `signal` through `authFetch` and aborting in the effect cleanup is the
whole fix; the call sites are already shaped for it.

### S3 — Medium. The hero's `fetchPriority` hint is silently dropped

[LandingHero.tsx:182](apps/web/src/pages/landing/LandingHero.tsx#L182) sets
`fetchPriority="high"` on the LCP image. React 18 does not map camelCase
`fetchPriority` to the `fetchpriority` attribute — that landed in React 19, and
this app is on `react@^18.3.1`. Captured from the dev console on `/`:

```
Warning: React does not recognize the `fetchPriority` prop on a DOM element.
If you intentionally want it to appear in the DOM as a custom attribute, spell it
as lowercase `fetchpriority` instead.
```

So the one deliberate LCP optimization on the front page does nothing, and in
production the warning is stripped so there is no sign of it. Fix is to write
`fetchpriority="high"` lowercase.

### S4 — Medium. The `firstAuthRun` guard does not survive double-invocation

[App.tsx:155-162](apps/web/src/App.tsx#L155-L162) guards a force-refetch of
horses / parties / links behind `firstAuthRun`, a ref meant to skip the initial
run. Refs persist across StrictMode's simulated remount but the effect re-runs, so
the second pass sees `false` and fires.

Verified: in dev, **every** route — including `/login`, `/signup` and the 404 —
issues `/api/horses`, `/api/parties` and `/api/horsePartyLinks` with `force=true`.
Three full-collection reads (see O2) per navigation. The production build does
not, since StrictMode double-invocation is dev-only, so this is a local-dev cost
rather than a shipped bug — but it is a fragile guard, and it makes every local
page load misleadingly heavy.

Comparing the two runs also shows the `x2` on `/api/agent/voice/status` and
`/api/blogs` is the same artifact — both are single in production.

### S5 — Medium. Store failures stack one toast each

Each store's catch block ends in its own `toast.error(message)` (e.g.
[horseStore.ts:40](apps/web/src/stores/horseStore.ts#L40)). The landing page fires
nine store fetches in parallel, so one API outage or Render cold start produces
up to nine stacked red toasts describing the same event. The retry and
`loaded`-flag logic in these stores is otherwise careful and correct — it is only
the reporting that needs to be deduplicated or moved into the page's own error
state.

### S6 — Low. `isVoiceEnabled()` has no in-flight dedupe

[voiceClient.ts:22-32](apps/web/src/agent/voice/voiceClient.ts#L22-L32) caches
`voiceEnabledCache` only *after* the `await`, so concurrent callers all miss and
each issue a request. Caching the promise instead of the result fixes it. Also
worth questioning: this is an unauthenticated request on every page load for
every visitor, to decide whether to show a mic button inside a closed widget.

---

## Not a problem

Recorded so these do not get re-reviewed:

- **Store design.** In-flight dedupe, a `loaded` flag, `force` override, error
  state left in a retryable condition, transient-only retry with correct 3xx
  handling in `authFetchRetry`. This is well built.
- **Memoization of derived data.** The non-overlapping article selection in
  `Landing.tsx` and the section/category filtering in `NewsIndex.tsx` are
  correctly memoized with honest dependency arrays.
- **XSS sinks.** Both `dangerouslySetInnerHTML` sites sanitize
  (`sanitizeBlogHtml`, `sanitizeRichText`).
- **`100svh` hero sizing** and the `--navbar-h` ResizeObserver — the reasoning in
  the comment is right and `svh` is the correct unit.
- **`pages/newsroom/` is not dead code.** The production-system screens are thin
  adapters over it (15 import sites). The directory name is now misleading, but
  nothing there is orphaned.

---

## Suggested order

1. **O1** — route-level `React.lazy` at the `RequireStaff` / magazine / studios
   seams. Biggest single win, lowest risk, no behaviour change.
2. **S3** + **O3** — one-character `fetchpriority` fix, then fonts into
   `index.html` with `preconnect`. Both cheap, both on the LCP path.
3. **S1** — decide `crossOrigin` policy once and apply it uniformly. Currently a
   broken front page waits on one misconfigured image host.
4. **S2** — thread an `AbortController` through `authFetch`.
5. **O2** + **O4** — `limit`/projection on the public list endpoints, following
   the `blogs.ts` pattern.
6. **O5**, **O6**, **O7**, **S5** — lazy/dimensioned images, `usePageMeta` on the
   remaining routes, lazy agent panel, toast dedupe.
7. **S4**, **S6**, **O8** — dev-experience and long-list polish.
