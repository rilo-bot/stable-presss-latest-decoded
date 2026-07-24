# Fake Data — Removed, and What to Display Instead

**Date:** 2026-07-24
**Scope:** Full-stack audit (`apps/web`, `apps/server`, `apps/worker`).
**Outcome:** `apps/server` and `apps/worker` are clean of production-facing fake
data. All fabricated data was in the **web frontend "chrome"** (numbers, stats,
and sample articles the app displayed as if real). Those are removed here.

The magazine-builder **templates** (`apps/web/src/editor/templates/`) were
deliberately **left as-is** — they are editable sample content by design. Their
fabricated stats, quotes, and personal emails are documented in the "Not changed"
section below and remain a known item to address before any template is published
unedited.

---

## Principle applied

> Never render a number, stat, or record that isn't derived from real data.
> When there is no real source yet, show an **honest empty state / CTA** or omit
> the element — never a fabricated stand-in.

---

## What was removed and what now shows instead

### 1. Fabricated follower counts (HIGH)
- **Was:** `followStore.ts` generated a deterministic "follower count" of 200–2,999
  from an FNV-1a hash of the horse id, rendered on the public profile
  (`FollowButton`) and on every card in the "My Stable" strip (`HorseProfiles`).
  There is **no follow backend** — the number was invented.
- **Files:** `apps/web/src/stores/followStore.ts`,
  `apps/web/src/components/FollowButton.tsx`,
  `apps/web/src/pages/HorseProfiles.tsx`
- **Now:** `baseFollowerCount` / `followerCount` deleted. Follow remains a
  **personal, per-browser bookmark** ("your stable", localStorage). The button
  shows only the **Follow / Following** toggle — no number. The stable strip shows
  a plain "Following" label.
- **To display a real count later:** add a follows collection/counter on the
  backend and surface the true aggregate; only then re-introduce a number.

### 2. Fake circulation stats on the Newsletter masthead (HIGH)
- **Was:** hardcoded `Subscribers: 12,840` and `Issues Published: 47` next to the
  one real stat ("This Edition"), styled identically so they read as real.
- **File:** `apps/web/src/pages/Newsletter.tsx`
- **Now:** only the real, computed **"This Edition — N stories"** stat renders.
- **To display later:** subscriber total from the members/subscription backend;
  issues-published count from the issue store. Wire to real counts before re-adding.

### 3. Six fake articles with fake bylines on `/news` (HIGH)
- **Was:** `EDITORIAL_FEATURES` — a hardcoded array of six invented articles
  (fake authors "Sarah Ellison", "Catherine Darragh", etc., fake headlines and
  reading times) rendered in an "Editorial showcase" grid whenever the CMS had
  **zero** live articles (e.g. a fresh production deploy). Cards linked to `/news`
  (dead ends).
- **Files:** `apps/web/src/pages/news-index/constants.tsx` (array removed),
  `apps/web/src/pages/NewsIndex.tsx` (showcase grid + `showcaseFeatures` memo +
  now-unused `motion`/`Clock`/`EDITORIAL_FEATURES` imports removed).
- **Now:** the empty state shows only the pre-existing honest CTA —
  **"The press stands ready. No dispatches have been filed."** with a link to the
  Newsroom. Real articles come from `useArticleStore`; nothing stands in for them.

### 4. Fake "Vol. 47" print edition on the Bulletins masthead (MEDIUM)
- **Was:** hardcoded `Print Edition: Vol. 47` masthead stat (paired with the fake
  "47 Issues Published" above to imply a long publishing history).
- **File:** `apps/web/src/pages/Bulletins.tsx`
- **Now:** removed. "Fortnightly / Bi-Weekly" (the real cadence) and "This Issue"
  (a live count) remain.
- **To display later:** a real volume/issue number once editions are tracked.

### 5. Placeholder ABN in the footer (LOW)
- **Was:** `ABN 00 000 000 000.` in the landing footer — a fabricated business
  identifier (all zeros).
- **File:** `apps/web/src/pages/landing/LandingFooter.tsx`
- **Now:** removed. Copyright line remains.
- **To display later:** the real ABN once the entity is registered.

### 6. Hardcoded "9 templates ready to use" (LOW)
- **Was:** the Newsroom Overview "Bulletin Templates" card claimed "9 templates" —
  a made-up number (only **2** gallery templates actually ship).
- **File:** `apps/web/src/pages/newsroom/views/OverviewView.tsx`
- **Now:** derived from the real source — `MAGAZINE_TEMPLATES.length` — so it stays
  correct as templates are added/removed.

---

## Verified clean (no change needed)

- **`apps/server`** — every metric/dashboard endpoint computes from live DB reads
  (`.length` of real collections); no route returns canned records or fabricated
  stats. The AI pipeline makes real model calls and degrades *layout* (never
  facts); prompts explicitly forbid inventing statistics or lorem filler.
- **`apps/worker`** — all DB writes derive from real uploaded files or real AI
  output; no seeders, fixtures, or mock responses.
- **All 20 web stores** fetch from the real backend via `authFetch`/`apiUrl`.
- Guarded dev-only defaults (OTP `123456`, JWT `dev-only-insecure-secret`) fail
  **closed** in production (process refuses to start / returns 503) — dev-only,
  left in place.

---

## Not changed — known items (product decision: templates left as-is)

The magazine-builder templates under `apps/web/src/editor/templates/`
(`blueprints/` + `premium/`, ~2,500 lines) are editable sample content shipped as
the "New Magazine" gallery defaults. They contain **realistic fabricated data**
that reaches the public newsstand if a template is published unedited:

- **Fabricated statistics presented as real** — e.g. sale results
  (`blueprints/karaka.ts`: "Gross $7,393,000 · Clearance 91%"), leaderboards
  (`blueprints/competitions.ts`), a predictions scoreboard and a "$380,000" auction
  lot (`blueprints/predictions.ts`), champion career earnings
  (`blueprints/headline.ts`). Each is duplicated in the `premium/*.bp.ts` twins.
- **Quotes and tips attributed to named, real-sounding people** —
  `blueprints/headline.ts` ("— John Thompson, Richill Farm"),
  `blueprints/predictions.ts`, `blueprints/winning.ts`.
- **Hardcoded personal email addresses** (incl. a real-looking Gmail) —
  `premium/blueprints.ts`, `blueprints/president.ts`.

**Recommended follow-up if/when addressed:** replace fabricated stats with
obviously-placeholder figures ("$0 · sample"), quotes with "— Contributor Name",
and personal emails with `name@example.com`, so templates read as clearly-editable
scaffolding rather than fabricated real data. (This is the highest reputational/
legal-risk item and the biggest remaining surface.)

Stock **Pexels fallback images** (e.g. `HorseCard.tsx`, landing/bulletin heroes)
were also left in place — conventional fallback imagery, not fabricated records —
though note a real subject without its own photo is shown a generic horse image.
