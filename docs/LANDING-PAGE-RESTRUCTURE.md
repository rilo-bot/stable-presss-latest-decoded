# Landing Page Restructure — Phase 1 (design) → Phase 2 (real data)

**Date:** 2026-08-17
**Branch:** `day-work`
**Predecessor:** [landing + navbar rebuild, 2026-08-04](../README.md) — see the memory note
`landing-navbar-rebuild`. Its locked decisions are **carried forward, not re-litigated**.
**Trigger:** the front page shows real data well, but it never says what Stable Press *is*.
A first-time visitor gets one photograph filling the whole first screen, then eleven rows of
"headline + meta". Too short, one rhythm, no identity.

---

## 1. What is on the page today

Eight blocks plus a four-block rail. Every one of them is real data — that part is sound.

| # | Block | Data | File |
|---|---|---|---|
| 1 | Breaking ticker | real | `LandingHero.tsx` |
| 2 | Hero — lead story, full-bleed photo `100svh − navbar` | real | `LandingHero.tsx` |
| 3 | Counts strip (4) | real | `LandingHero.tsx` |
| 4 | Latest (3 cards) | real | `LandingFeaturedArticles.tsx` |
| 5 | Analysis & Interviews (3 rows) | real | `LandingFeaturedArticles.tsx` |
| 6 | From the Blog (3 rows) | real | `LandingBlog.tsx` |
| 7 | Print Bulletins (2) | real | `LandingBulletins.tsx` |
| 8 | From the Stables (4 rows) + The Directory (4 cards) | real | `LandingFeaturedArticles.tsx`, `LandingDirectory.tsx` |
| R | Rail: membership form · podcast card · Also today · sponsors | mixed | `LandingSidebar.tsx`, `LandingPodcast.tsx` |
| F | Membership band + footer | static | `LandingFooter.tsx` |

**Diagnosis.** The missing thing is not data — it is that *nothing on the page addresses a
stranger*. There is no statement of what the paper covers, no map of the six sections, no
account of how the journalism is made. And structurally the page has **one tempo**: after the
hero, every block is the same 2/3-column list of headlines. Length and rhythm are the same
problem.

---

## 2. Defects found in the review (fixed as part of this work)

| # | Sev | Defect | Where |
|---|---|---|---|
| D1 | High | **Marketing hero flashes on every cold load.** `articles` starts `[]`, so `heroArticle` is null on first paint and the *"nothing published at all"* branch renders "The premium voice of thoroughbred racing" — then swaps to the photo hero with a full-height layout jump. `articlesLoading` reaches the Latest grid but never the hero. | `LandingHero.tsx:258`, `Landing.tsx:229` |
| D2 | High | **Half the counts strip advertises tipping** — "Tips placed" and "Tipping profiles" are 2 of the 4 front-page numbers for the feature deliberately taken off this page. | `Landing.tsx:186` |
| D3 | High | **Fabricated membership claims** — "Tipping ring entry" (unlaunched) and "Fortnightly print bulletin" (no cadence exists anywhere). | `LandingSidebar.tsx:79` |
| D4 | Med | **Bulletin cover invisible** — the real cover image is painted at `opacity-20` over `bg-primary`. A print magazine's cover, at 20%, behind green. | `LandingBulletins.tsx:31` |
| D5 | Med | **Duplicate footer links** — "Tipping Ring" and "Leaderboard" both → `/tipping`; "Print Bulletins" listed under both *Sections* and *Community*. | `LandingFooter.tsx:120` |
| D6 | Med | **A failed `/api/articles` toasts a red error** at anonymous visitors on the front page. Metrics correctly stay silent; articles do not. | `articleStore.ts:86` |
| D7 | Low | Ticker has no `aria-live` and no pause-on-hover — content changes under a screen reader with no announcement, and a 5s rotation is unreadable for slow readers. | `LandingHero.tsx:140` |
| D8 | Low | Analysis thumbnails miss `loading="lazy"` (blog and directory images have it). | `LandingFeaturedArticles.tsx:128` |
| D9 | Low | `press@stablepress.com.au` hardcoded — **verify it resolves** or it is the placeholder-ABN problem again. Not code; a question for the client. | `LandingSidebar.tsx:216` |
| D10 | Note | `/api/articles` still unpaginated — the front page downloads every published story to show 12. Out of scope here, carried in Phase 2. | `routes/articles` |

---

## 3. Decisions locked by the client, 2026-08-17

1. **Hero becomes a masthead spread** — lead story over its photo on the left, two "next up"
   headlines stacked right. Same height, three stories on the first screen instead of one.
2. **Four static blocks are added**: *What we are* (manifesto), *What's inside* (six section
   cards), *How the desk works*, *Membership: what you get + FAQ*.
3. **Honest copy only.** Every static string must be **true today**. No invented quotes,
   reader numbers, awards, partner logos or team photos — and no "SAMPLE" placeholder blocks
   either. A data-shaped block that has no data is simply not built until Phase 2 has it.
4. **All static strings live in one file**, `landing/copy.ts`, so Phase 2 can swap any block
   to live data or to an admin-editable field without hunting through JSX. No server work in
   Phase 1.

Carried forward unchanged from the 2026-08-04 rebuild: edge-to-edge (**no `max-w-*`
container**), `/news` and `/blog` stay separate surfaces, tipping stays unadvertised,
two nav rows, Campaign Engine keeps its position, and **green is never a content background** —
green is the frame, a photograph or the white sheet is the field.

---

## 4. The new structure

Seventeen blocks, and the point is the **alternation**: full-width chrome bands (cream, or green
as a frame) interleaved with the editorial grid. That is what makes the page read long-and-
composed rather than as a longer list.

```
┌──────────────────────────────────────────────────────────────┐
│  1  BREAKING ▸ ticker                            [real]      │
├───────────────────────────────────┬──────────────────────────┤
│  2  MASTHEAD SPREAD               │  NEXT UP                 │
│     photo is the field            │  ▪ headline 2            │
│     THE LEAD HEADLINE, BIG        │  ▪ headline 3            │  [real]
├───────────────────────────────────┴──────────────────────────┤
│  3  counts strip · stories · horses · people · episodes      │  [real]
├──────────────────────────────────────────────────────────────┤
│  4  WHAT STABLE PRESS IS      ▏ REPORT ▏ ANALYSE ▏ RECORD    │  [static]
├─────────────────────────────────────────────┬────────────────┤
│  5  LATEST — 6 cards, two rows              │  Membership    │
│                                             │  form          │
│  6  ANALYSIS & INTERVIEWS — 4 rows          │                │  [real]
│                                             │  Also today    │
├─────────────────────────────────────────────┴────────────────┤
│  7  WHAT'S INSIDE — six section cards, one per public section │  [static copy,
│     News │ Blog │ Horses │ Directory │ Podcast │ Bulletins    │   real links]
├──────────────────────────────────────────────────────────────┤
│  8  FROM THE BLOG — 3 rows                                   │  [real]
│  9  FROM THE STABLES — 4 photo cards (was 4 text rows)       │  [real]
│ 10  THE DIRECTORY — 4 cards                                  │  [real]
│ 11  PRINT BULLETINS — 2 covers, at full strength             │  [real]
├──────────────────────────────────────────────────────────────┤
│ 12  THE PODCAST — full-width green band, 3 episodes          │  [real]
├──────────────────────────────────────────────────────────────┤
│ 13  HOW THE DESK WORKS — the five stages, filed → published  │  [static]
├──────────────────────────────────────────────────────────────┤
│ 14  WHAT YOU GET + FAQ                                       │  [static]
├──────────────────────────────────────────────────────────────┤
│ 15  MEMBERSHIP BAND — green, one CTA                         │  [static]
│ 16  PROUDLY SUPPORTED BY — sponsor band                      │  [real]
│ 17  FOOTER                                                   │
└──────────────────────────────────────────────────────────────┘
```

### Block notes

**2 · Masthead spread.** The photo stays the field at full bleed (D1's fix is a *skeleton*
masthead while `articlesLoading`, never the brand-line fallback). The brand line survives in
exactly one case it is honest for: **nothing published at all, and loading finished.** The two
"next up" headlines come from `secondaryArticles`, so `Latest` shifts to `published.slice(3, 9)`
and no story appears twice — the existing non-overlap discipline in `Landing.tsx` is preserved
and extended.

**3 · Counts strip, made honest.** Drop the two tipping counts (D2). The replacements are
derived from stores the page already fetches — **no server change**:

| Count | Source | Honest because |
|---|---|---|
| Stories published | `metrics.articlesPublished` | already server-counted |
| Horse profiles | `horses.length` | `/api/horses` returns the full register |
| In the directory | `parties.length` | same |
| Podcast episodes | `episodes.filter(published).length` | filtered here, not claimed |
| Bulletins published | `issues.filter(!unpublishedAt).length` | same |

Each renders only when its section is switched on and its count is > 0. `metrics` failing stays
silent (already correct). Caveat recorded: these are exact only while those endpoints are
unpaginated — see D10.

**4 · What Stable Press is.** Full-width, `--card` field, gold hairline above. Left: a
three-sentence statement of what the paper covers. Right: three pillars — **Report** (every
meeting we attend), **Analyse** (form, track notes, bloodstock), **Record** (the horse register
and the directory of who is behind each horse). Each pillar's line names a section that exists
and links to it. Nothing here is a claim about audience size, awards or history.

**7 · What's inside.** Six cards. The copy is **not invented** — it is
`PUBLIC_NAV_SECTIONS[].description` from `types/siteSettings.ts`, already written and already
the text an admin reads on the switch. Cards are filtered by the same `publicNav` switches, so
a section an admin turned off gets no card. Phase 2 drops a live count onto each card.

**9 · From the Stables.** The 4 text rows become 4 photo cards reusing `HorseCard`'s honest
empty frame ("No photograph on record") — no stand-in horse. Still no ordinals: these are
`horses.slice(0, 4)` in API order and numbering them would assert a ranking the data does not
contain.

**11 · Print Bulletins.** Cover becomes the field at full strength under a neutral scrim, the
same rule the hero follows (D4). Green stays as the card's frame, not its picture.

**12 · The Podcast band.** Promoted out of the narrow rail into a full-width green band — green
as *chrome* is allowed and this is the one audio product on the site. Three episodes across,
gold-on-green kickers (a legitimate 5.19:1 fill, per THEME-DIRECTION).

**13 · How the desk works.** The five-stage pipeline — true today, per the `story-workflow-5-stages`
decision. Five numbered steps, one line each. Editorial standards told as process, which is the
one "trust us" block that needs no fabricated evidence.

**14 · What you get + FAQ.** Replaces D3's fabricated benefit list. Only what an account
actually does today, plus four FAQ rows (what it costs, what tipping is and that it is not open
yet, whether the bulletin is posted, how to pitch). Saying "the tipping ring is not open yet" is
better copy than promising entry to it.

**16 · Sponsor band.** Sponsors leave the rail for a full-width band above the footer. The
footer's own sponsor bar is then **removed** — one sponsor surface, not two.

**Rail** drops from four blocks to two (membership form, Also today). The rail existed to hold
things that had nowhere else to go; three of them now have somewhere better.

---

## 5. Files

**New**

| File | Purpose |
|---|---|
| `apps/web/src/pages/landing/copy.ts` | every static string on the page, one export per block |
| `apps/web/src/pages/landing/LandingManifesto.tsx` | block 4 |
| `apps/web/src/pages/landing/LandingSections.tsx` | block 7 |
| `apps/web/src/pages/landing/LandingDesk.tsx` | block 13 |
| `apps/web/src/pages/landing/LandingMembership.tsx` | block 14 |
| `apps/web/src/pages/landing/LandingSponsors.tsx` | block 16 |

**Edited**

| File | Change |
|---|---|
| `Landing.tsx` | new block order; `secondaryArticles` → masthead; `Latest` → `slice(3,9)`; derived honest counts; pass `articlesLoading` to the hero |
| `landing/LandingHero.tsx` | masthead spread; skeleton while loading (D1); honest counts strip (D2); `aria-live` + pause on the ticker (D7) |
| `landing/LandingFeaturedArticles.tsx` | Latest 3→6, Analysis 3→4, stables rows → photo cards, `loading="lazy"` (D8) |
| `landing/LandingSidebar.tsx` | 4 blocks → 2; honest benefits (D3); sponsors removed |
| `landing/LandingPodcast.tsx` | rail card → full-width band |
| `landing/LandingBulletins.tsx` | cover at full strength under a scrim (D4) |
| `landing/LandingFooter.tsx` | dedupe links (D5); drop the duplicate sponsor bar |
| `stores/articleStore.ts` | `fetchArticles` stops toasting on the public page (D6) — narrowest possible change |

Untouched: `LandingBlog.tsx`, `LandingDirectory.tsx`, `SectionHead.tsx`, `LandingRaces.tsx`,
`LandingLeaderboard.tsx` (still on disk, still unrendered), the navbar, and every route.

---

## 6. Verification

Every gate below must pass before this is called done.

1. `npm run typecheck` (or `tsc -b`) and `vite build` — clean.
2. `npm run check:hooks -w apps/server` — the white-screen guard.
3. **Off-scale opacity grep** from THEME-DIRECTION §gotcha — Tailwind silently drops
   `bg-primary/8`, so every new modifier must be a multiple of 5 or bracket syntax.
4. **Type floor**: zero new text below `11px`. Grep for `text-[9px]`, `text-[10px]`.
5. **Gold discipline**: gold as *text* on a light surface must be `--brand-accent-ink`
   (2.06:1 vs 5.51:1). `--brand-accent` only as a fill or a rule, or as text on green.
6. **Green discipline**: no new block paints a content field green. Grep new files for
   `bg-primary` and justify each hit as chrome.
7. **No new hardcoded facts**: grep the new copy for digits — any number must trace to a store.
8. **Open it in a browser.** This landing page has never been rendered in one; the last rebuild
   shipped on typecheck plus two client screenshots. Both hero states (photo / no photo), the
   loading skeleton, empty stores, and 375px / 768px / 1440px.

---

## 7. Phase 2 — real data into the Phase 1 shells

Listed so the shapes are designed for it, **not built now**:

- **Live counts on the six section cards** (block 7) — needs a cheap `/api/metrics` extension
  or per-store counts.
- **Contributors strip** — real bylines are already in `published[].author`; a "who writes here"
  block can be honest without a new endpoint. Deferred only because it needs author pages to
  link to.
- **Admin-editable copy** — promote `copy.ts` into a `siteContent` collection and extend the
  Site Content screen. The one-file shape exists to make this a swap, not a rewrite.
- **`/api/articles` pagination** (D10) and the counts' exactness that depends on it.
- **SSR / prerender for OG + SEO** — `usePageMeta` runs after mount and is invisible to
  crawlers and link unfurlers; this is the front page, so it matters most here.
- **Anonymous email capture** — the subscribe form still routes into `/signup` with the address
  prefilled, because no anonymous capture store exists.
