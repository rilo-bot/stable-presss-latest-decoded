# Stable Press — UI / UX / Layout Review

**Date:** 2026-07-30
**Branch:** `enhancement` (includes uncommitted working-tree changes)
**Scope:** full public website + full Newsroom production system + dossier/profile layer + magazine editors
**Method:** static review of `apps/web/src` (230 `.tsx` files, ~44k lines), design-token layer, and WCAG contrast maths on the declared palettes. **The app was not run in a browser** — nothing here rests on a rendered screenshot, so visual-polish issues that only show at runtime are out of scope.

---

## Verdict

The design foundation is better than most projects this size. There is a real token system (`theme.css` + `brand.css` + shadcn semantics), the public website is consistent and responsive, and accessibility basics are genuinely clean (zero `<img>` without `alt`, 232 `aria-label`s, only 7 click-handling `<div>`s and those are dialog backdrops).

Two things hold it back, and they are unrelated:

1. **One blocking layout gap** — the production system has no navigation at all below 768px.
2. **Styling has outgrown the token layer** — 1,401 inline style objects, 897 arbitrary font sizes, and a documented contrast fix that was only half-applied.

Grades: **Public website B+ · Production system B− · Dossier/profile layer C+ · Magazine editors C−**

---

> **Update 2026-07-30 (later same day).** The production system was restructured
> after this review: `/newsroom` → `/production-system`, one real route per
> screen, a single CMS header row, and no public-site chrome. That closed **C1**
> (mobile drawer), **M3** (duplicate counts) and **L1** (collapse icon). Items
> H1, H2, H3, M1, M2, M4, M5, M6 and the remaining Low findings are untouched.
> See "Restructure" at the foot of this document.

## CRITICAL

### C1. The Newsroom has no navigation below 768px ✅ FIXED

`NewsroomSidebar` is the *only* way to switch between the production system's **21 views**, and it is `hidden md:flex`:

- [NewsroomSidebar.tsx:44](apps/web/src/pages/newsroom/components/NewsroomSidebar.tsx#L44) — `'hidden md:flex flex-col …'`
- [Newsroom.tsx](apps/web/src/pages/Newsroom.tsx) renders 21 `activeNav === …` branches and contains **zero** `md:hidden` blocks (verified: `grep -c "md:hidden"` → 0)
- `activeNav` initialises to `'workflow'` ([Newsroom.tsx:109](apps/web/src/pages/Newsroom.tsx#L109))

**Consequence:** on a phone or a narrow window, a staff user lands on the Workflow Board and can never reach Overview, All Stories, Editor Hub, the four Production Systems, Team, Roles, Analytics, or Settings. There is no hamburger, no drawer, no tab strip, no `<select>` fallback.

**This regressed in the current working tree.** `NewsroomTopBar.tsx` was deleted (staged) and its one action moved into `NewsroomPageHeader`. The reasoning in the code comment is sound — it *had* been reduced to a single button — but the top bar was also the only chrome that existed outside the `md:` breakpoint. Its replacement, [FileStoryButton.tsx](apps/web/src/pages/newsroom/components/FileStoryButton.tsx), is careful about small screens (`hidden sm:inline` / `sm:hidden` label swap), which makes the missing nav the one remaining hole.

**Worth stressing: the views themselves are fine.** Every data table is wrapped correctly — `overflow-x-auto` on the container plus an explicit `min-w-[Npx]` on the table — in all four Production Systems, `AllStoriesView`, `CompensationView`, `EditorAssignments`, and `EditorMediaLibrary`. That is exactly the right pattern and it means **this is a nav-shell gap only, not a responsive rewrite.** A `md:hidden` drawer reusing `visibleNav` (or even a plain `<select>`) closes it.

---

## HIGH

### H1. A documented contrast fix was applied to 40 sites and skipped on 41

`brand.css` states the rule explicitly:

```css
/* Readable label / muted-text colour ON parchment (~6:1 on --parchment).
   --parchment-shadow stays for hairline borders; use this for TEXT. */
--parchment-label: #6b5a2f;
```

Measured contrast on `--parchment` (#f5edda):

| Foreground | Ratio | WCAG AA (4.5:1) |
|---|---|---|
| `--parchment-label` #6b5a2f | **5.76:1** | pass |
| `--parchment-shadow` #c9b99a | **1.65:1** | **fail** |

Adoption is split almost exactly in half: **40** uses of `--parchment-label`, **41** remaining uses of `--parchment-shadow` as a `color:`.

All 41 are in the data-entry forms:

| File | Count |
|---|---|
| `media-data-form/MetadataFields.tsx` | 17 |
| `media-data-form/FileUpload.tsx` | 7 |
| `RacingDataForm.tsx` | 6 |
| `MediaDataForm.tsx` | 5 |
| `SalesDataForm.tsx` | 2 |
| `ReportsDataForm.tsx` | 2 |
| `DraftRestoredHint.tsx` | 2 |

And they are on precisely the text a first-time user depends on — the optionality hints:

```tsx
<label style={fieldLabelStyle}>Source Publication
  <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', … }}>(optional)</span>
</label>
```

At 1.65:1, italic, at small size, "(optional)" is effectively invisible — so every field reads as required. **This is the highest value-per-effort fix in the review: a token swap the codebase has already sanctioned.**

### H2. `--gold-dark` used as a text colour in 47 places, and it fails on every green it sits on

| Pair | Ratio | AA |
|---|---|---|
| `--gold-dark` on `--forest-deep` | 2.73:1 | fail |
| `--gold-dark` on `--forest-mid` | 2.16:1 | fail |
| `--gold-mid` on `--forest-mid` | 3.70:1 | large text only |
| `--gold-mid` on `--forest-deep` | 4.67:1 | pass |
| `--gold-bright` on `--forest-deep` | 6.15:1 | pass |
| `--gold-bright` on `--parchment` | 1.90:1 | fail |

Concentrated in `profile/sections.tsx` (25), `OnboardingGuide.tsx` (3), `AddHorseChoice.tsx` (3), `PartyProfile.tsx` (2), `HorseProfile.tsx` (2), `OnboardingFocus.tsx` (2). The palette itself is well-chosen — `--gold-bright` and `--parchment` on the forest greens are comfortably compliant. The problem is that the *border/hairline* golds are being reused as *text* golds. Same class of mistake as H1.

### H3. Typography has drifted into an undeclared second scale, most of it ≤10px

- **897** arbitrary sizes (`text-[Npx]`) vs **809** Tailwind-scale utilities — more than half of all type bypasses the scale.
- Distribution: `text-[10px]` **328** · `text-[11px]` **224** · `text-[12px]` **178** · `text-[9px]` **111** · `text-[13px]` **45** · `text-[8px]` **8**
- **447 instances at 10px or smaller.**
- **235** of those also carry `uppercase` + `tracking-[…em]` — tiny, all-caps, wide-tracked.
- **183** pair a ≤10px size with `text-muted-foreground`.

The 8–13px band is a real, consistently-used label tier that sits entirely *below* Tailwind's `text-xs` (12px) — so it can never be expressed in the scale and is retyped as an arbitrary value every time. Worst offenders: `horse-form/sections.tsx` (31), `ArticleForm.tsx` (21), `ArticleDetail.tsx` (17), `landing/LandingSidebar.tsx` (15).

Tiny + uppercase + wide-tracked + muted is the app's house style for labels, and in isolation each instance looks intentional. In aggregate it means the densest screens — the forms and the dossier rails — are the least legible ones. **Fix the cause, not the 447 sites:** add the missing tier to `tailwind.config.js` (`label-xs`/`label-sm`/`label-md`) with a floor of 11px, and the drift becomes expressible.

---

## MEDIUM

### M1. Dark mode is ~80 lines of unreachable code

- `tailwind.config.js` → `darkMode: ['class']`
- **Both** `index.css` and `theme.css` declare a complete `.dark` token set (~40 tokens each — every semantic surface, fully considered)
- Nothing ever adds the class. The only `document.documentElement` write in the app is [NavBar.tsx:38](apps/web/src/components/NavBar.tsx#L38), which sets `--navbar-h`, not a theme.
- **2** `dark:` variants exist app-wide, both in `editor-v2/MagazineV2Home.tsx`.

The dark palette is good work that no user can reach. Either wire a toggle (the tokens are ready — this is a genuinely cheap win) or delete it, but leaving it maintained-yet-dead invites edits nobody can verify.

### M2. Four visual languages; one is tokenized

| Language | Surface | Basis |
|---|---|---|
| Editorial (forest/gold/cream) | public website, newsroom chrome | **semantic tokens** ✅ |
| Vintage skeuomorphic (parchment/emboss/Georgia) | 42 files — all profiles, all data forms, `ArticleDetail` | **raw hex** |
| Editor/AI dark chrome | magazine v1+v2, all agent panels | **hardcoded** `#0b1220` (25), `#0d1626` (26), `#7c3aed` (16) |
| Magazine print (navy/cream/gold) | — | declared, **zero consumers** |

The vintage layer deserves credit: it is a deliberate system with a shared kit (`profile/kit.tsx` — `serifStyle`, `goldStyle`, `OrnateCrest`, `SectionPanel`, `SRow`, badges; 19 importers), not ad-hoc drift. But because it is built on raw hex rather than HSL tokens it cannot respond to theming — which is *why* H1/H2 happened and *why* M1 can't ship. Migrating `--parchment*`/`--forest-*`/`--gold-*` to `H S% L%` triples would make all three tractable at once.

The AI/editor surfaces are the genuinely un-systematized ones: **31 of 230 files** use hardcoded Tailwind palette colours, and the top 10 are all editor or agent panels (`EditorAgentPanel` 22, `ArticleStudioPanel` 20, `MagazineEditorV2` 18, `ProfileAgentPanel` 17, `AiPanel` 14).

### M3. Duplicate counts: the same number in the sidebar and the header at once

`NewsroomSidebar` renders a count badge for `editor-hub`, `horses`, `parties`, `media-production-system`, `racing-production-system` — and `NewsroomPageHeader` renders *the same counts again* as pills on the title row ("N in the stables", "N parties registered", "N media records", "N racing records"). On the Horses view the user sees `12` in the sidebar and "12 in the stables" in the header simultaneously.

The header already solved this once for `publishedCount`, with the reasoning recorded in the file:

```
// Only on Overview — the Workflow Board's stage strip already shows a
// PUBLISHED count, and showing both made one number read as two.
```

That exact reasoning applies to the other five. Pick one home per count — sidebar badges for at-a-glance, header pills for context, not both.

Related: the badges use **five** different accent colours (`brand-accent`, `primary`, `chart-1`, `chart-3`, plus `primary` again for pendingReview) with no encoded meaning, so colour carries no information while implying it does.

### M4. Design-system components are the minority

- **440** raw `<button>` vs **113** `<Button>` (47 files import `ui/button`)
- **1,401** inline `style={{…}}` objects
- only **73** `focus-visible:` declarations across ~553 buttons

Each raw button re-derives its own hover, disabled, and focus treatment — and most skip focus entirely. The newsroom chrome is the good example here ([NewsroomSidebar.tsx:59](apps/web/src/pages/newsroom/components/NewsroomSidebar.tsx#L59) has `focus-visible:ring-2 focus-visible:ring-ring` *and* an `aria-label`); the vintage and editor layers are where the gap is. Inline-style hotspots: `profile/sections.tsx` (133), `profile/kit.tsx` (79), `RoleConnectionBox.tsx` (48), `MetadataFields.tsx` (48), `RacingDataForm.tsx` (45).

### M5. Loading and empty states are inconsistent

`EmptyState` has decent reach (22 files) but **24** ad-hoc "No … yet / not found" strings sit alongside it. `SkeletonCard` exists and is used in only **4** files — so most views have no defined loading state at all. (Credit: zero `Loading...` string literals, so nothing is falling back to raw text.)

### M6. Dead CSS in `brand.css`

Tokens with zero consumers: all 7 `--magazine-*`, `--ticker-height`, `--sponsor-tint`, `--bulletin-scrim`, `--cms-sidebar-w`, `--rule-light`, `--text-masthead`, `--waveform-active`, `--waveform-track`, `--font-script`.

Classes with zero consumers: `.ticker-scroll`, `.rule-gold`, `.sponsor-badge`, `.card-lift`, `.kanban-draft/review/legal/publish`, `.sku-table`, `.sku-icon-btn`, `.sku-corner`.

Notable: `--cms-sidebar-w: 224px` is unused while `NewsroomSidebar` hardcodes `w-56` (= 224px) — the token and its intended consumer drifted apart. `.sku-table` is fully specified (gradient headers, gold rules, hover states) and unused while the Production Systems hand-roll their tables in Tailwind.

Live and working: `.sku-gold-card` (20), `.sku-parchment` (19), `.sku-green-header` (16), `.sku-gold-btn` (11), `.pull-quote` (9), `.onb-spotlight` (7), `.sku-divider` (3), `.studio-focus-ring` (3), `.onb-choice-card` (2).

---

## LOW

- **L1 — Wrong icon for the sidebar collapse toggle.** [NewsroomSidebar.tsx:57](apps/web/src/pages/newsroom/components/NewsroomSidebar.tsx#L57) uses lucide `Filter` for collapse/expand. Users will read it as "filter the nav". Use `PanelLeftClose`/`PanelLeftOpen`. Its `aria-label="Toggle sidebar"` is also stateless — should reflect expanded vs collapsed, or carry `aria-expanded`.
- **L2 — Cross-component coupling via a global CSS var.** `NavBar` writes `--navbar-h` to `documentElement` and `ProfileScaffold` reads it (`calc(100vh - var(--navbar-h, 112px))`). It works and the fallback is sensible, but it is the app's only instance of this pattern and the 36px/112px values are duplicated as magic numbers in `NavBar`.
- **L3 — `profile-grid` breakpoint is off-system.** [ProfileScaffold.tsx:92-97](apps/web/src/components/profile/ProfileScaffold.tsx#L92-L97) collapses 3 columns → 1 at `max-width: 900px` via a raw `@media` in a `<style>` block. Correct behaviour, but 900px matches no Tailwind breakpoint (`md` 768 / `lg` 1024), so the dossier reflows at a width nothing else in the app responds to.
- **L4 — Dead route in production.** `/__preview/premium` → `__PremiumPreview.tsx`, marked `// TEMP — remove with its route`.
- **L5 — Google Fonts loaded via two blocking `@import`s** at the top of `theme.css` — 6 families, ~20 weights. `@import` in CSS serialises the request behind the stylesheet; a `<link rel="preconnect">` + `<link>` in `index.html` would render text sooner.

---

## What is working well (do not "fix" these)

- **Accessibility basics.** 0 `<img>` without `alt` across the whole app. 232 `aria-label`s. Only 7 click-handling `<div>`s, all dialog backdrops.
- **Reduced motion honoured everywhere.** All four keyframe animations in `brand.css` (`ticker-scroll`, `onb-pulse`, `studio-focus-pulse`, `card-lift`) have `@media (prefers-reduced-motion: reduce)` escapes. This is usually the first thing skipped.
- **Public website layout is consistent.** `max-w-7xl` (30 uses) and `px-4 md:px-8` (23 uses) dominate; responsive utilities cluster exactly where they should (`Bulletins` 27, `ArticleDetail` 22, `Newsletter` 21, `PodcastWorkflow` 19, plus all of `landing/*`).
- **Newsroom table overflow is uniformly correct** — `overflow-x-auto` + `min-w-[Npx]`, every table, no exceptions.
- **The magazine templates' rigid layout is right.** `editor/templates/**` accounts for most of the app's fixed-px widths and un-prefixed `grid-cols-3/4/5`. That is a fixed A4 print canvas; making it fluid would be the bug. Excluded from every finding above.
- **`theme.css` layer trick is correct and documented** — unlayered `:root` beating `@layer base` is subtle, deliberate, and explained in a comment.
- **The newsroom chrome is the quality bar** — tokens throughout, `focus-visible` rings, `aria-label`s, `min-w-0` on the flex child with the reasoning written down. The rest of the app should look like this.

---

## Suggested order

Ordered by value per unit of effort, not by severity.

| # | Action | Finding | Size |
|---|---|---|---|
| 1 | Swap the remaining 41 `--parchment-shadow` text colours to `--parchment-label` | H1 | ~1h, mechanical |
| 2 | Add a `md:hidden` nav drawer (or `<select>`) to `Newsroom.tsx`, reusing `visibleNav` | C1 | ~2h |
| 3 | Swap the 47 `--gold-dark` text uses to `--gold-mid`/`--gold-bright` per background | H2 | ~2h |
| 4 | Pick one home per count; drop the duplicate pills or badges | M3 | ~1h |
| 5 | Correct the collapse icon + `aria-expanded` | L1 | ~10min |
| 6 | Add the 11–13px label tier to `tailwind.config.js`, stop the bleeding on new code | H3 | ~1h + ongoing |
| 7 | Decide dark mode: wire the toggle or delete the `.dark` blocks | M1 | ~2h or ~10min |
| 8 | Delete the dead tokens and classes in `brand.css` | M6 | ~30min |
| 9 | Convert `--parchment*`/`--forest-*`/`--gold-*` to HSL triples | M2 | ~1d, unblocks M1 properly |
| 10 | Adopt `Button` + `SkeletonCard` in the vintage and editor layers | M4, M5 | incremental |

Items 1–5 are a single afternoon and cover the one critical gap plus both contrast failures.

---

## Restructure (2026-07-30, after the review)

The production system was rebuilt as a routed app rather than one page with an
`activeNav` switch. What changed:

**Routing.** `/newsroom` → `/production-system`, with one real route per screen
(`/production-system/workflow`, `/people`, `/media-records`, …). The old
755-line `Newsroom.tsx` is gone; its state and handlers moved to
`useProductionSystemState.ts`, shared with the screens through the router's
Outlet context, and each screen is now its own small file under
`pages/production-system/screens/`. Deep links, the back button and bookmarks
work for the first time.

URL slugs are **not** always the module id: role permissions are stored in the
database against ids like `media-production-system`, so ids stayed frozen while
the addresses read properly. RBAC still resolves on the id — no server or DB
change. `/newsroom/*` redirects, because staff-invite and magazine-share emails
already in inboxes point at it.

**Chrome.** No `AppLayout`, so the public site's three header rows are gone.
In their place: one 56px CMS header row (screen name, notifications, the
screen's primary action) and a sidebar that owns navigation and the account.
The rail is `sticky top-0 h-screen` and scrolls its own nav list instead of
scrolling away with the page. `--radius` is overridden on the layout root, so
the CMS rounds up without altering the public site.

**Also corrected in passing:**
- `RequireStaff` gated `/newsroom` but nothing gated the individual screens.
  Now that each is a URL, a deep link to a screen whose module the user lacks is
  bounced by the layout. Magazine Studio is deliberately exempt — its id
  (`bulletin-templates`) is not in the server's module catalogue, so gating on it
  would have locked the screen for everyone.
- `/production-system` resolves to the first screen the user actually has;
  `activeNav` used to default to `'workflow'` for everybody.
- "File a Story" was shown via a negated condition that excluded only the four
  registers — so Settings, Analytics and Roles all offered to file a story. It is
  now listed explicitly on the five story screens.
- `setActiveNav` props renamed to `onNavigate` in `OverviewView` and
  `CompensationView`; they navigate now, so the old name lied.
- The "Your Role" sidebar block was dropped at the user's request; the role text
  moved into the account chip.

**Verified:** `tsc --noEmit` clean on web and server, `vite build` clean, dev
server boots. Not verified in a browser beyond the Overview screenshot the user
supplied — the other 15 screens have not been clicked through.

## Caveat

Static review only — the app was never rendered. Contrast ratios are computed from the declared token values against the backgrounds those tokens are used on in code, which is reliable for flat surfaces but does not account for the gradient backgrounds used widely in the vintage layer (`linear-gradient(90deg, var(--forest-mid), var(--forest-light))`); on those, the true ratio varies across the element and my figures are the midpoint. Nothing here covers runtime behaviour: animation smoothness, focus order in practice, real-device touch targets, or how the layouts hold with production data volumes.
