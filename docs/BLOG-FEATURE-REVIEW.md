# Blog feature review

**Date:** 2026-08-03 · **Branch:** `feature/blogs` · **Scope:** the whole Blogs feature — `routes/blogs.ts`, `lib/blog/*`, `blogStore`, the composer, and the two public pages.

Status key: **FIXED** — done in this pass. **OPEN** — left as-is, with the reason.

---

## 1. How the flow works

**Authoring.** `/production-system/blogs` (rows or cards, tabs All/Drafts/Published) → `/blogs/new` → `/blogs/:id`. The editor is a wide body column plus a 20rem settings rail. Edits are local and instant; a 1.5s debounced autosave PUTs the whole post with `baseUpdatedAt` as an optimistic-concurrency baseline, and a 409 pauses autosave and offers "Reload theirs". Publishing goes through `POST /:id/publish` and the composer adopts the returned version so the next autosave doesn't 409 against a baseline that endpoint just moved.

**Storage.** A `blogs` collection: an ordered block list plus a per-post media pool. Blocks reference `mediaId`, never a URL, so one upload can appear in several places, alt/credit is edited once, and deleting an asset can name the blocks that would break. Every write passes through `normaliseBlocks`, which drops unknown kinds, clamps every enum, sanitizes rich text and severs dangling media references, reporting a `droppedBlocks` count the client surfaces as a toast.

**Reading.** `GET /api/blogs` is paginated and projected — cards only, with a server-resolved thumbnail. `GET /api/blogs/:idOrSlug` returns one full post and resolves a retired slug to the current one. Public callers are restricted to `status: 'published'` in the `$match`; staff and anyone holding `blog.*` see drafts too. Indexes exist for all four query shapes.

**What is good and should not be undone:** the projected list (`articles` loads its whole collection and filters in JS), the single `placement.ts` module that both the composer canvas and the reader call, real optimistic concurrency, and the media-delete guard that refuses while blocks still reference an asset.

---

## 2. Critical

### C1 — The paywall was client-side only · **FIXED**

`GET /api/blogs/:slug` returned every block and the whole media pool regardless of `minTier`; `locked` in `BlogPost` merely *hid* it. A `premium` post was readable in full from the network tab, or with one `curl`.

`gateForTier` in `routes/blogs.ts` now truncates the response to the first paragraph and trims the pool to the cover for any caller whose tier does not reach `minTier`. Staff and blog-permission holders are exempt, because the composer loads through the same endpoint and needs every block. `Blog.locked` carries the server's decision to the page, which keeps its own check as a fallback.

**Note:** the same hole remains open for `/api/articles`, which has a `minTier` field and no gate. Not touched here — it is a separate surface with its own callers. See `docs/PUBLIC-SITE-REVIEW.md`.

---

## 3. High

### H1 — The 301 slug redirect never fired · **FIXED**

`authFetchRetry` returned early only on `res.ok` (200–299) or a 4xx. A 301 was neither, so it burned all three attempts on backoff and then **threw**. The `res.status === 301` branch in `blogStore.fetchOne` was unreachable, `movedTo` was never set, and the reader landed on "That post isn't here" after ~1.2s — so every link to a renamed published post died, which is the entire thing `slugHistory`, `nextSlugHistory` and the `blogs.slugHistory` index exist to prevent.

`lib/api.ts` now treats any 3xx as terminal and hands it back to the caller.

### H2 — No document title, description or robots on a public post · **PARTLY FIXED**

There was no head management anywhere in the app, so every route shared `index.html`'s one static title and `blog.seo` was stored but never rendered.

`lib/usePageMeta.ts` now sets `document.title`, `meta[name=description]` and `meta[name=robots]`, and both blog pages call it. A post's `seo.metaTitle` / `seo.metaDescription` win where set; a draft gets `noindex`.

**Still OPEN — and it is the important half.** This runs in the browser after React mounts. It fixes the tab, bookmarks, history and in-app experience. It does **not** help search engines or link unfurlers, which read the server's HTML. There are no OG/Twitter tags for the same reason — emitting them client-side would be theatre. Real SEO for `/blog` needs prerendering or SSR, which is a build-and-deploy decision, not a component change.

---

## 4. Medium

### M1 — The cover crop the author previewed was not the one readers got · **FIXED**

The rail preview and the editor's in-body `CoverSlot` both rendered the cover at `aspect-[16/9]`; the public side column forced `aspect-[4/5]`. A landscape photograph — the normal case here — was centre-cropped to portrait and the author never saw it happen. `normaliseCover` accepts a `focal` point, but there was no cover focal control anywhere in the rail, so there was no way to rescue it either.

The cover now renders at its **natural aspect** in all three places. No crop means no focal point to set, so the missing control stops mattering. Below `md` — where the layout stacks and the cover sits above the prose — it is capped with `max-h-[46vh] object-cover`, or a tall portrait would push the opening paragraph off the screen.

### M2 — Five cover treatments where one was wanted · **FIXED**

`cover.treatment` chose between `hero-full`, `hero-split`, `inset`, `side` and `none`. Two of those already rendered identically to `side`. The reader page is now one layout — image left, writing right, single column when there is no cover — and the treatment picker is gone from the rail. Stored values are **ignored, not migrated**, so no data changes and nothing breaks.

### M3 — Stale-list flash on `/blog`, draft titles included · **FIXED**

`useBlogStore.items` is one array shared by the public index and the newsroom screen. `fetchList` left the previous caller's rows in place until the new request answered, and the skeleton only rendered when `items` was empty — so arriving at `/blog` from the newsroom painted that screen's list, draft headlines and all. `fetchList` now clears `items`/`total`/`hasMore` before it asks. `loadMore` is the append path and is untouched.

### M4 — `wide` and `full-bleed` are inert on a side-cover post · **OPEN**

With the cover beside the prose the body grid resolves inside a 7/12 column, so its `wide` and `full` tracks collapse to roughly the text measure — while the composer canvas sits in a much wider column and shows them breaking out. The Size control in the block inspector therefore does nothing a reader can see on any post with a cover, which is most of them.

Left open because every fix is a real design decision, not a repair: let breakouts escape the two-column grid (they would collide with the sticky cover), narrow the composer canvas to the reader's measure (loses editing room), or drop the control. Worth deciding deliberately.

### M5 — `seo` and `publishAt` are unreachable model surface · **OPEN**

The rail has no SEO fields at all, so `blog.seo` is always `{}` and the composer faithfully round-trips an empty object. `publishAt` is worse: `isLive` resolves it at read time on both server and client and the list query carries an extra `$and` clause for it, but nothing can ever set it — `POST` hardcodes `null`, `PUT` never writes it, and there is no UI. `usePageMeta` now consumes `seo.metaTitle`/`metaDescription`/`noindex` if they ever get populated, so the fields are at least wired at the far end.

Either build the two panels or delete the fields. Carrying validated, indexed, half-consumed model surface that no author can reach is the expensive middle.

---

## 5. Low

| # | Finding | Status |
|---|---|---|
| L1 | Two global DOMPurify `afterSanitizeAttributes` hooks (`blog/sanitize.ts`, `editor/lib/sanitize.ts`) on the same singleton. Once both modules have run in a session, both hooks fire on every `sanitize` call. Benign **today** — the style allowlists are identical and the magazine allowlist has no `<a>` for the anchor branch to touch — but the day either diverges, both sanitizers silently get the intersection. | OPEN — latent, not broken; the fix is a shared hook registry |
| L2 | A draft's slug is re-derived from the title on every autosave, so a URL copied mid-draft goes stale on the next keystroke. Clearing the title strands the previous slug. | OPEN |
| L3 | `PUT /:id` is a full replace with no field-presence check — a request without `blocks` wipes the body. The composer always sends everything; `articles.ts` uses a `has()` pattern for exactly this reason. | OPEN |
| L4 | Staff see future-dated posts as live on the public index (the `publishAt` filter sits inside `if (!seeDrafts)`). Moot while `publishAt` is unsettable; wrong the day it isn't. | OPEN — resolve with M5 |
| L5 | "Draft — only visible to you" was shown to every staff viewer, not just the author. | FIXED — now "Draft — not published yet" |
| L6 | `ShareButton` silently no-ops when `navigator.clipboard` is absent (any non-secure origin). | OPEN |

---

## 6. Public page UI/UX

### `/blog`

**Was:** a bare `max-w-3xl` column with a plain foreground `<h1>` and an inline search box — the only public page in the app not wearing the shared green header band, so it read as a different website.

**FIXED:** the standard public chrome, matching `/news`, `/newsletter` and `/bulletins` — green band, `Home › The Blog` breadcrumb, display heading, standfirst, search on the right — with the simple row list kept underneath. The band spans the page; the list keeps a readable measure, because rows at 1280px put sixty words on a line and maroon the thumbnail from its headline. The result count adopted the `12 POSTS ─────` rule-and-label form `/news` uses.

Also fixed: **filter chips are individually dismissible** (they were inert labels beside one Clear that dropped everything), and **"Load more" is announced** via an `aria-live` region — it appends rows *below* the button and leaves focus on it, so a screen-reader user previously got no signal that anything happened.

**OPEN:** no tag or category browse affordance — you can only reach a filter from a post you already opened, and the index never lists what exists. No RSS/Atom feed, despite `feed` and `rss` being reserved slugs.

### `/blog/:slug`

The strongest page in the app: hairline category rule, large display headline, italic standfirst, double-ruled byline strip, sticky cover, drop cap, ◆◆◆ end mark, tags linking back to the filtered index, byline card with share.

**FIXED:** one layout (M2), the uncropped cover (M1), a mobile height cap so the lede stays near the fold, and a `Home › The Blog › Category` breadcrumb replacing the lone "← The Blog" link — which told a reader where they could go but not where they were.

**OPEN:** the read just stops at the byline card — no related or next/previous posts, no back-to-top after two thousand words. No table of contents or reading-progress indicator, though every heading already carries an `id` for one.

---

## 7. Verification

Both apps typecheck clean and the web app builds clean. **These changes have not been opened in a browser** — no dev server or seeded post was run against them.
