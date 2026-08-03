# Stable Press — Theme & Design-System Review

**Date:** 2026-08-03
**Scope:** `apps/web` — 261 components, ~64,700 lines. Token files, Tailwind config, every
rendering surface (public site, reader pages, production system, magazine editors v1/v2,
AI studio panels, vintage horse/party profiles, blog composer + renderer).
**Method:** static audit of token definitions vs. actual usage, plus computed WCAG contrast
ratios for every token pair and every alpha-composited pattern the code actually produces.
**Status:** nothing fixed. This is the diagnosis.

---

## Verdict

The token layer is well-designed and almost entirely bypassed.

`theme.css` overrides all 20 semantic shadcn variables with a coherent forest-green / gold /
warm-cream palette. `brand.css` adds 40+ considered custom tokens. Both files are carefully
commented — including comments explaining *why* the cascade is arranged the way it is. That
work is real and it is good.

Below it, the app runs on **four parallel, unreconciled design languages**, **three separate
type scales**, **five untokenized navies**, and **1,397 inline `style={{}}` sites**. The
inconsistency you're seeing isn't drift in a system — it's the absence of enforcement between
a good token layer and the code that ignores it.

The single highest-leverage fact in this document: **`--brand-accent` (gold, the brand's
signature colour) scores 2.06:1 as text on the page background.** It is used as text in 18
places, almost all at 10px, including the article kicker on the homepage. The brand colour is
unreadable in the brand's primary application of it.

| Severity | Count | Theme |
|---|---|---|
| **Critical** | 4 | Accessibility failures baked into the tokens themselves; dead dark mode |
| **High** | 8 | Scales bypassed, languages forked, states untokenized, focus lost |
| **Medium** | 12 | Component-level divergence, dead config, payload |
| **Low** | 4 | Token-modelling errors |

---

## Critical

### C1 — Dark mode is fully specified and completely unreachable

`tailwind.config.js` sets `darkMode: ['class']`. `index.css` defines a 20-token `.dark`
block. `theme.css` defines a *second*, hand-tuned 27-token `.dark` block. That is ~47 lines
of maintained token work.

Nothing ever adds the `dark` class. There is no `ThemeProvider`, no `useTheme`, no
`documentElement.classList` write, no `prefers-color-scheme` query anywhere in `src/`.
`dark:` appears **3 times** in the entire application — twice in `brand.css` (as
`prefers-reduced-motion` neighbours) and once in `MagazineV2Home.tsx`.

Even if a toggle were added tomorrow it would not work: the 151 hardcoded Tailwind palette
colours (C4/H4) and 1,397 inline styles are mode-blind and would not invert.

**Decision needed, and it's a fork in the road:** either commit to dark mode (which makes
H4's dark editor islands a *feature* — they become the dark theme — and turns the 151 raw
colours into required cleanup), or delete the `.dark` blocks and `darkMode` config. Keeping
both files in sync for a mode nobody can reach is pure carrying cost. **This choice gates
roughly half of the remediation below, so it should be made first.**

### C2 — The brand accent is unreadable as text

Computed against the light theme in `theme.css`:

| Foreground | Background | Ratio | WCAG AA (4.5:1) |
|---|---|---|---|
| `--brand-accent` gold | `--background` cream | **2.06:1** | ✗ fail |
| `--brand-accent` gold | `--card` | **2.19:1** | ✗ fail |
| `--brand-accent-foreground` | `--brand-accent` | 6.79:1 | ✓ pass |

Gold works as a *surface* and fails as *ink*. The code uses it as ink 18 times in TSX plus
twice in CSS, and it does so at the smallest sizes in the app:

- [ArticleCard.tsx:44](apps/web/src/components/ArticleCard.tsx#L44), `:83`, `:139` — the
  article kicker, `text-[10px] uppercase tracking-[0.12em]`. Three of the most-rendered
  elements on the public site.
- [brand.css:194](apps/web/src/styles/brand.css#L194) — `.sponsor-badge` colour, at
  `font-size: 0.625rem`.
- [index.css:163](apps/web/src/index.css#L163) — `.blog-dropcap` colour. Large, so it clears
  the 3:1 large-text bar — this one is defensible.
- [ImageUploader.tsx:165](apps/web/src/components/horse-form/ImageUploader.tsx#L165) — an
  `AlertTriangle` warning icon at 11px. A warning the user cannot see is worse than none.
- `RaceCard.tsx`, `RaceMap.tsx` — status pills for `resolved`.
- `NavBar.tsx:110`, `:278` — hover colour on the wordmark. On `--primary` green this is
  fine; flagged only because the same class is reused on light surfaces elsewhere.

**Fix:** add a dedicated `--brand-accent-ink` token — the same hue driven down to ~35% L,
which clears 4.5:1 on both cream and card — and reserve `--brand-accent` for fills, rules
and borders. Do not simply darken `--brand-accent`; it would wreck the gold hairlines,
`--rule-gold`, and the gold-on-forest surfaces that currently pass.

### C3 — `--destructive` fails its own foreground

| Pair | Ratio | Needs |
|---|---|---|
| `--destructive-foreground` on `--destructive` | **3.59:1** | 4.5:1 |
| `--destructive` as text on `--background` | **3.43:1** | 4.5:1 |

`theme.css` deliberately re-tuned every other semantic token but left `--destructive` to fall
through to the stock shadcn light value (`0 84.2% 60.2%`) — the file's own header comment
even names `--destructive` as the example of a token intentionally left to the default. That
default is a known shadcn accessibility defect, and `destructive` appears 145 times: every
delete button, every error message, every danger dialog.

**Fix:** override `--destructive` in `theme.css` to roughly `0 72% 42%`, which clears 4.5:1
against white foreground and as text on cream. This is a two-line change with the widest
blast radius of anything in this document.

### C4 — Border tokens are effectively invisible, then diluted further

| Pair | Ratio | Needs (WCAG 1.4.11 non-text) |
|---|---|---|
| `--border` on `--background` | **1.25:1** | 3:1 for control boundaries |
| `border-border/60` composited | **1.14:1** | — |
| `border-border/40` composited | **1.09:1** | — |

A decorative divider at 1.25:1 is a legitimate style choice. But `--input` is set to the
*same value*, and `border-input` (36 sites, plus every `ui/input.tsx` and `ui/textarea.tsx`
render) is the **sole visual indicator that a form field exists**. At 1.25:1 the field
boundary is not perceivable — a WCAG 1.4.11 failure across every form in the app.

The app then makes it worse. Border opacity is diluted at 322 sites with no rule governing
which:

| Class | Sites |
|---|---|
| `border-border/60` | 167 |
| `border-border/40` | 74 |
| `border-border/50` | 67 |
| `border-border/30` | 10 |
| `border-border/70` | 4 |

Five opacities for one concept ("card edge"), reaching 1.09:1. This is also the mechanism
behind the "everything looks slightly different" feeling: adjacent cards written by different
hands land on different edge weights.

**Fix:** split the token. Keep `--border` decorative but lift it to ~1.5:1; add
`--border-strong` at ≥3:1 and point `--input` at it. Then collapse the five opacities to
exactly two — `border-border` for cards, `border-border/50` for internal dividers — and
codify it.

---

## High

### H1 — Three parallel type scales; the Tailwind one is the minority

| Mechanism | Sites | Distinct values |
|---|---|---|
| Arbitrary Tailwind px — `text-[10px]` | **941** | 14 |
| Tailwind scale — `text-sm`, `text-xl` | 898 | 11 |
| Inline `fontSize` (rem/px) | 284 | 26 |

The scale is bypassed more often than it is used. The arbitrary values include
`text-[12.5px]`, `text-[13.5px]`, `text-[11.5px]`, `text-[10.5px]`, `text-[14.5px]` —
half-pixel sizes, which is freehand, not a system.

The inline set is worse: 26 distinct rem values in 0.02rem increments from **0.46rem (≈7.4px)**
to 1rem. `0.46rem`, `0.48rem`, `0.5rem`, `0.52rem`, `0.54rem`, `0.55rem`, `0.56rem`,
`0.57rem`, `0.58rem`, `0.6rem`, `0.62rem`… Sub-8px body text is illegible on any display and
unreachable by Tailwind tooling.

Note the distribution: `text-[10px]` (345), `text-[11px]` (238), `text-[12px]` (171),
`text-[9px]` (115). The app *wants* a dense 9–13px UI scale that Tailwind's default simply
doesn't have — `text-xs` is 12px and there is nothing below it. That's the root cause, and
it's fixable: extend `fontSize` in the config with named steps (`2xs: 11px`, `3xs: 10px`,
`4xs: 9px`) and the 941 arbitrary values become mechanically replaceable.

### H2 — Four unreconciled design languages, switched at route boundaries

| Language | Palette / mechanism | Routes |
|---|---|---|
| **Editorial** (intended) | Cream/forest/gold tokens, Tailwind classes | `/`, `/news`, `/blog`, `/articles/:id`, `/newsletter`, `/bulletins`, `/parties`, `/tipping`, `/podcast` |
| **Vintage skeuomorphic** | `--parchment`, `--forest-*`, `--gold-*`, embossed shadows, Georgia + IM Fell English, ~100% inline styles | `/horses/:id`, `/studio/horse/:id`, all of `components/profile/*` |
| **Dark navy chrome** | Raw `#0b1220` / `#0d1626`, `white/NN` alphas | `/production-system/magazine/:id`, `/magazine-v2/:id`, all inspectors, all AI panels |
| **Print magazine** | `--magazine-navy/cream/gold/maroon/forest` | `editor/templates/premium/*` (~20 page components) |

Plus the production system, which is Editorial-with-a-sidebar but injects **arbitrary
per-role hex accents** (H8).

Four languages is not automatically wrong — a print-template renderer legitimately needs its
own palette, and a full-bleed editor legitimately wants dark chrome. What's wrong is that
none of them are *declared*. There is no documented boundary, no shared contract for radius,
type step, focus treatment or state colour across them, and no token bridge. So a user
walking `/news` → `/horses/:id` → `/production-system/magazine-v2/:id` traverses three
unrelated products, and a developer has no way to know which language a new component should
speak.

### H3 — Radius fork between the primitives and the app

`--radius: 0.5rem`, so `rounded-lg` = 8px, `rounded-md` = 6px, `rounded-sm` = 4px.

| Class | Sites |
|---|---|
| `rounded-sm` (4px) | **781** |
| `rounded-full` | 204 |
| `rounded-md` (6px) | 71 |
| `rounded-lg` (8px) | 17 |
| `rounded-2xl` | 10 |
| `rounded-xl` | 2 |
| `rounded-none` | 2 |
| arbitrary (`rounded-[3px]`, `[2px]`, `[26px]`, `[8px]`, `[7px]`) | 20 |

The app has clearly chosen **4px** — a tight, editorial radius, consistent with the story-workflow
work. But **all five shadcn primitives disagree**: `button.tsx` is `rounded-md` (all three
sizes), `input.tsx` `rounded-md`, `textarea.tsx` `rounded-md`, `dialog.tsx` `sm:rounded-lg`,
`badge.tsx` `rounded-full`.

`Button` is imported in 52 files. Every one of those places puts a 6px-cornered button
against a 4px-cornered card. This is the most *visible* inconsistency in the app and the
cheapest to fix: change `rounded-md` → `rounded-sm` in the four primitives, and set
`--radius: 0.5rem` → keep as-is so nothing else shifts.

### H4 — Five untokenized navies and 33 copies of one dark-surface recipe

| Value | Sites | Where |
|---|---|---|
| `bg-[#0d1626]` | 23 | Editor chrome, panels, dropdowns, dialogs |
| `bg-[#0b1220]` | 13 | Editor canvas backdrop, composer footer |
| `bg-[#160d26]` | 1 | ArticleStudioPanel only (purple-black) |
| `bg-[#0a2342]` | 1 | — |
| `--magazine-navy` (`218 71% 15%` ≈ `#0a2342`) | token | Print templates |

None of the first four exist in any token file, and `--magazine-navy` — the one that *is* a
token — is a fifth, different navy. There is no `--surface-dark` / `--surface-dark-raised`.

Alongside them, `border border-white/15 bg-white/5` appears **33 times** verbatim, plus
`border-white/10 bg-white/5` 4 more. `white/NN` alphas appear in 30 files, concentrated in
`MagazineEditorV2` (45), `AiPanel` (32), `Inspector` (31), `ProfileAgentPanel` (28).

Contrast on `#0d1626` / `#0b1220`:

| Pattern | Ratio | Verdict |
|---|---|---|
| `text-white/70` | 9.22:1 | ✓ |
| `text-white/60` | 7.05:1 | ✓ |
| `text-white/50` | 5.26:1 | ✓ |
| `text-white/40` | **3.81:1** | ✗ |
| `text-white/35` | **3.21:1** | ✗ |
| `placeholder:text-white/30` | **2.67:1** | ✗ |
| `border-white/15` (UI, 3:1) | **1.56:1** | ✗ |
| `border-white/10` (UI, 3:1) | **1.31:1** | ✗ |

So the standard editor card edge is invisible and every editor placeholder fails. The
`white/50` cutoff is the practical floor — everything below it needs raising.

### H5 — The eyebrow label has 20+ recipes and one ignored canonical component

`SectionHeading.tsx` exists, is well-documented, and says in its own comment: *"Before this
existed each screen hand-rolled the same `<h2>` markup, which is how they drifted apart."*
It is imported in **5 files**. There are **563** `uppercase` sites.

Counting only exact `text-[Npx] font-{weight} uppercase tracking-[Nem]` sequences (class-order
variants add more):

| Recipe | Sites |
|---|---|
| `text-[11px] font-semibold uppercase tracking-[0.08em]` | 10 |
| `text-[10px] font-bold uppercase tracking-[0.12em]` | 10 |
| `text-[10px] font-semibold uppercase tracking-[0.1em]` | 4 |
| `text-[10px] font-semibold uppercase tracking-[0.08em]` | 4 |
| `text-[13px] font-bold uppercase tracking-[0.1em]` | 3 |
| `text-[11px] font-semibold uppercase tracking-[0.1em]` | 3 |
| `text-[10px] font-bold uppercase tracking-[0.14em]` | 3 |
| …13 more, 1–2 sites each | 17 |

And `SectionHeading` itself is a 21st variant (`text-sm font-bold tracking-[0.1em]`) that
matches none of them. The letter-spacing spread is 17 distinct values (M9).

This is the clearest instance of the systemic pattern: **the component exists, nobody adopts
it, and the canonical version isn't even the most common one.**

### H6 — No success or warning tokens, so three vocabularies for every state

`theme.css` defines `--destructive` and nothing else for state. There is no `--success`,
`--warning`, or `--info`. So state colour is spelled ad hoc:

| State | Vocabularies in use |
|---|---|
| Success | `emerald-*` (55+ sites) **and** `green-*` |
| Warning | `amber-*` (35+) **and** `yellow-*` **and** `orange-*` |
| Danger | `red-*` (40+) **and** `rose-*` (15+) **and** the `destructive` token (145) |

Danger is the sharp one: three mechanisms for one meaning, and only the third is
theme-aware. A "delete" affordance is `text-destructive` in one screen, `text-red-400` in
another, `text-rose-300` in a third — all on the same user journey.

**Fix:** add `--success` / `--warning` / `--info` token pairs (each with a `-foreground`),
tuned for 4.5:1 on cream and card, and treat every `emerald|green|amber|yellow|orange|red|rose`
class as a migration target.

### H7 — Focus indication is lost across most of the app

| Metric | Count |
|---|---|
| Raw `<button>` elements | 470 |
| `focus-visible:` declarations | 95 |
| `focus:ring` / `focus:outline` declarations | 81 |
| `outline-none` with **no** ring/outline replacement | 26 |

Most of the 95 come from the five shadcn primitives; hand-rolled buttons largely rely on the
browser default, which is inconsistent across the four design languages and disappears
entirely on the dark islands.

The 26 stripped-focus sites are the real failures. The dominant pattern is in every AI panel
composer:

```
outline-none placeholder:text-white/30 focus:border-white/30
```
— [ArticleStudioPanel.tsx:274](apps/web/src/agent/article/ArticleStudioPanel.tsx#L274),
[ProfileAgentPanel.tsx:296](apps/web/src/agent/profile/ProfileAgentPanel.tsx#L296),
[StoryStudioPanel.tsx:276](apps/web/src/agent/story/StoryStudioPanel.tsx#L276),
[EditorAgentPanel.tsx:388](apps/web/src/editor/agent/EditorAgentPanel.tsx#L388).

A border-colour swap from `white/15` to `white/30` is a change from 1.56:1 to ~2.1:1 — not
perceivable as a focus state, and a WCAG 2.4.7 failure on the primary input of every AI
studio. Others (`controls.tsx:78`, `MagazineEditor.tsx:187`, `:194`) strip focus with no
replacement at all.

### H8 — Role accent colours are ungoverned and injected into chrome

[RolesPermissionsView.tsx:26](apps/web/src/pages/newsroom/views/RolesPermissionsView.tsx#L26):

```js
const ROLE_COLOR_CHOICES = ['#7c3aed', '#0ea5e9', '#059669', '#d97706', '#dc2626', '#475569'];
```

Six raw Tailwind-500/600 hexes. **None is from the Stable Press palette** — no forest green,
no gold. The default for every new role is `#7c3aed`, violet, in a forest-and-gold brand.

The chosen hex is stored on the role in the DB, arrives on the session payload, and is spread
through CMS chrome as `accentColor` — sidebar avatar fill
([ProductionSystemNav.tsx:270](apps/web/src/pages/production-system/components/ProductionSystemNav.tsx#L270)),
alert banners as `${accentColor}40` border and `${accentColor}08` background
([OverviewView.tsx:71](apps/web/src/pages/newsroom/views/OverviewView.tsx#L71),
[AllStoriesView.tsx:43](apps/web/src/pages/newsroom/views/AllStoriesView.tsx#L43)), and role
chips. No contrast check anywhere.

Contrast of each choice as text on `--background` cream:

| Choice | Ratio | AA |
|---|---|---|
| `#475569` slate | 6.91:1 | ✓ |
| `#7c3aed` violet (default) | 5.20:1 | ✓ |
| `#dc2626` red | **4.40:1** | ✗ |
| `#059669` emerald | **3.44:1** | ✗ |
| `#d97706` amber | **2.91:1** | ✗ |
| `#0ea5e9` sky | **2.53:1** | ✗ |

**Four of six fail.** A superadmin creating a role can make its label unreadable with no
warning, and the accent also lands on `AlertCircle` icons at 14px. Replace the array with
brand-derived, contrast-verified tokens.

---

## Medium

**M1 — The three AI studio panels diverge from each other.** Same component pattern, three
different skins:

| Panel | Background | Accent | Width | max-w |
|---|---|---|---|---|
| `ArticleStudioPanel` | `#160d26` | `purple-*`, gradient `from-purple-900` | 380px | 94vw |
| `StoryStudioPanel` | `#0d1626` | `--gold-bright` | 380px | 94vw |
| `ProfileAgentPanel` | `#0d1626` | `--gold-bright` | **360px** | **92vw** |

The 380/360 and 94/92 splits have no reason to exist. Worse, `.studio-focus-ring--on` in
`brand.css` is hardcoded purple `#9333ea` — matching Article Studio and clashing with the two
gold panels, even though `StudioField.tsx` (the only consumer) sits under the *gold* profile
panel. The focus ring doesn't match its own studio's accent.

**M2 — Two badge languages, one of which mixes three colour mechanisms.**
`ui/badge.tsx` is `rounded-full px-2.5 py-0.5 text-xs font-semibold`; `StatusBadge.tsx` is
`rounded-sm px-2 py-0.5 text-[11px] uppercase tracking-[0.1em] font-bold`. Nothing reconciles
them. Inside `StatusBadge` a single map uses semantic tokens (`bg-muted`, `bg-primary/10`),
arbitrary token interpolation (`bg-[hsl(var(--chart-2)/0.15)]`), **and** raw inline colour:

```js
revision:  { style: { background: 'rgba(232,160,32,0.15)', color: '#e8a020' } },
approved:  { style: { background: 'rgba(93,168,84,0.15)',  color: '#5da854' } },
```

Those two are the only statuses that won't respond to a palette change — and they're the two
that most need to read as warning/success (see H6).

**M3 — The reader surfaces have forked.** Same job, four templates:

| Page | Container | Padding | h1 ramp |
|---|---|---|---|
| `NewsIndex` | `max-w-7xl` | `px-4 md:px-8 py-8 md:py-10` | `text-3xl md:text-4xl` |
| `ArticleDetail` | `max-w-7xl` | `px-4 md:px-8 py-10 md:py-14` | `text-3xl sm:text-4xl md:text-5xl` |
| `BlogIndex` | `max-w-6xl` | `px-4 py-10 md:py-14` | `text-4xl md:text-5xl` |
| `BlogPost` | `max-w-6xl` + `max-w-[68ch]` | `px-4 py-16` | `text-3xl md:text-4xl` |

Two container widths, four padding rhythms, three h1 ramps. Blog is the newest work and
drifted furthest from News, which is the pattern to expect — new surfaces don't inherit
because there's nothing to inherit *from*.

**M4 — Two serifs on the same page.** `components/profile/kit.tsx:9` states IM Fell English
was replaced because it was *"hard-to-read"*, and sets `serifStyle` to Georgia. But **13
files still use IM Fell English**, including `DossierMeter`, `PedigreeGrid`, `FollowButton`,
`RacingDataForm`, `SalesDataForm`, `ReportsDataForm`, `MediaDataForm` — components that render
in the same card stack as the Georgia ones on the horse profile. The readability fix was
applied to the kit and not to its neighbours.

**M5 — Font payload: three loaders, nine families, one duplicate request.**
`theme.css` has two `@import`s (Playfair Display 400–700 + Source Sans 3; then DM Serif
Display, Inter, Montserrat, Oswald, **and Playfair Display 800 again** — a second network
request for a family already loaded). `App.tsx:68` `useVintageFonts()` injects IM Fell
English + IM Fell English SC **on every route**, including routes where no vintage surface
renders. `editor/fonts/registry.ts` builds a third URL at runtime. Both `theme.css` `@import`s
are render-blocking and serialized.

**M6 — Z-index has no scale, and dialogs sit below panels.** Eleven levels in use: `z-10`
(25), `z-50` (20), `z-30` (9), `z-[70]` (6), `z-[60]` (6), `z-20` (5), `z-[90]` (3), `z-[80]`
(3), `z-40` (3), `z-[1]` (2). `ui/dialog.tsx` overlay and content are both **`z-50`**, while
the AI studio panels are **`z-[80]`** and other chrome reaches `z-[90]`. A studio panel
renders on top of a modal dialog and its overlay — the panel stays interactive while the
dialog claims to be modal.

**M7 — `--parchment-shadow` is used as text, against its own documentation.** `brand.css:62`
says explicitly: *"`--parchment-shadow` stays for hairline borders; use this for TEXT"* —
pointing at `--parchment-label`. `--parchment-shadow` on `--parchment` is **1.65:1**. It is
still used as `color:` in 10+ places: `DraftRestoredHint.tsx:20`, `:30`, and eight sites in
`media-data-form/FileUpload.tsx` including the italic helper text at `fontSize: '0.56rem'`
(≈9px at 1.65:1 — effectively invisible). Separately, `--gold-bright` on `--parchment` is
**1.90:1**.

**M8 — 1,397 inline `style={{}}` sites.** Concentrated in `components/profile/` —
`sections.tsx` (113), `kit.tsx` (73), `RoleConnectionBox.tsx` (48), `PartyProfile.tsx` (42),
`HorseProfile.tsx` (30). That subtree is outside Tailwind entirely: no purge analysis, no
responsive variants, no hover/focus pseudo-states without extra JS, and invisible to every
grep-based audit including parts of this one.

**M9 — 17 letter-spacing values for one idiom.** `tracking-[0.1em]` (144),
`tracking-[0.08em]` (104), `tracking-[0.12em]` (61), `tracking-[0.14em]` (41),
`tracking-wide` (20), `tracking-[0.2em]` (18), `tracking-wider` (16), `tracking-[0.16em]`
(14), `tracking-[0.06em]` (14), `tracking-[0.22em]` (11), `tracking-widest` (9),
`tracking-[0.18em]` (8), `tracking-tight` (5), `tracking-normal` (3), `tracking-[0.4em]` (1).
Tailwind's named scale and the arbitrary values are used interchangeably for the same purpose.

**M10 — Shadow scale is 6 named + 9 one-off.** Arbitrary shadows include two
near-duplicates that differ imperceptibly: `shadow-[0_10px_40px_rgba(0,0,0,0.18)]` and
`shadow-[0_8px_30px_rgba(0,0,0,0.18)]`. `shadow-[-8px_0_30px_rgba(0,0,0,0.5)]` is repeated
in all three studio panels rather than tokenized. No elevation scale exists.

**M11 — Dead Tailwind config.** `theme.container` (`center`, `padding: 2rem`,
`2xl: 1400px`) is configured but the `container` class appears **once**. The app uses
`max-w-7xl` (1280px) 39 times instead. Alongside `darkMode: ['class']` (C1) and the unused
`fontFamily` keys (L4), three of the config's five customisations are inert.

**M12 — No Card primitive, so 25+ card recipes.** `--card` and `--card-foreground` are
defined and `components/ui/` has button, badge, dialog, input, label, textarea — **no card**.
Every surface is hand-rolled, producing at minimum:

```
border border-border/60 bg-card       (17)   border border-border/60 bg-muted/40   (7)
border border-border/50 bg-muted/20   (7)    border border-border/40 bg-muted/20   (5)
border border-border/40 bg-muted/10   (5)    border border-border/60 bg-background (8)
border border-border bg-card          (3)    border border-border/70 bg-card       (3)
border border-white/15 bg-white/5     (33)   …and ~16 more
```

Nine variants of "a card on a light surface." This is the direct cause of H3 and C4
manifesting visibly — a Card primitive would have made both single-line fixes.

---

## Low

**L1 — Alpha-composited text below AA.** `text-foreground/60` → **4.04:1**;
`text-muted-foreground/70` → **2.91:1**. `text-foreground/70` (5.48:1) and `/75` (6.43:1,
the `.pull-quote`) pass — so `/70` is the floor on `foreground` and `muted-foreground` should
never be diluted at all.

**L2 — Dark theme `--border` is 1.67:1** against dark `--background`. Currently unreachable
(C1), but it's a pre-existing defect to fix if dark mode is ever switched on.

**L3 — `--chart-2` and `--brand-accent` are accidentally coupled.** Both are `42 64% 53%` in
light mode — byte-identical — so gold simultaneously means "brand accent" and "chart series
2". In dark mode they silently diverge (`42 66% 58%` vs `40 70% 62%`). Any chart with two or
more series will read series 2 as a brand highlight. Give `--chart-2` its own hue, or alias it
explicitly and document the intent.

**L4 — The `fontFamily` config keys are 100% unused.** `tailwind.config.js` defines
`fontFamily.display` and `fontFamily.body`, which should be used as `font-display` /
`font-body`. Standalone usage of either: **zero**. Instead the app writes the 38-character
arbitrary value `font-[family-name:var(--font-display)]` **205 times**. Worse, `theme.css:90`
already applies `var(--font-display)` to `h1`–`h6`, so a large share of the 205 are redundant
on headings.

---

## Root causes

Five findings recur, and they explain the rest:

1. **The token layer has no enforcement layer.** Good tokens, zero lint. No `eslint-plugin-tailwindcss`,
   no arbitrary-value ban, no stylelint. Every finding above is a rule that could be a lint error.
2. **Missing primitives get hand-rolled, and hand-rolling forks.** No Card → 25 card recipes.
   No dense type steps → 941 arbitrary sizes. No `--success`/`--warning` → three state
   vocabularies. No `--surface-dark` → five navies. **Every fork traces to an absent token or
   component, not to carelessness.**
3. **The primitives disagree with the app they serve.** shadcn defaults (`rounded-md`,
   stock `--destructive`) were never reconciled with the app's own choices (4px radius, tuned
   palette). Both are internally consistent; together they aren't.
4. **Canonical components exist and aren't adopted.** `SectionHeading` — which documents this
   exact failure in its own comment — has 5 adopters against 563 candidate sites. Extraction
   without migration leaves the app *more* inconsistent, because the canonical version becomes
   one more variant.
5. **Documented rules are violated in-repo.** `brand.css` warns against `--parchment-shadow`
   as text; it's used as text 10+ times. `kit.tsx` says IM Fell English was dropped for
   readability; 13 files still load it. Comments aren't enforcement.

---

## Remediation sequence

**Gate: decide dark mode (C1) first** — it changes the scope of everything in Phase 3.

**Phase 0 — token corrections (hours, very high leverage, near-zero risk)**
Two files, no component changes:
1. Override `--destructive` → ~`0 72% 42%` (C3). Fixes 145 sites at once.
2. Add `--brand-accent-ink` at ~35% L; repoint the 18 gold-as-text sites (C2).
3. Split `--border`: lift decorative to ~1.5:1, add `--border-strong` ≥3:1, point `--input`
   at it (C4).
4. Add `--success` / `--warning` / `--info` pairs (H6).
5. Add `--surface-dark` / `--surface-dark-raised` for `#0b1220` / `#0d1626` (H4).
6. Extend `fontSize` config with `2xs`/`3xs`/`4xs` = 11/10/9px (H1).
7. Give `--chart-2` its own hue (L3).

**Phase 1 — reconcile the primitives (hours, immediately visible)**
`rounded-md` → `rounded-sm` in button/input/textarea, `sm:rounded-lg` → `sm:rounded-sm` in
dialog (H3). Add a `Card` primitive and a `Label`/eyebrow primitive (M12, H5). Raise dialog
to `z-[100]` and document a layer scale (M6).

**Phase 2 — migrate, mechanically (days)**
Codemod the 941 arbitrary font sizes to the new steps; collapse 322 border opacities to two;
replace 151 raw palette colours with the new state tokens; adopt `Card` and the eyebrow
primitive across the 563 uppercase sites; align the three studio panels (M1); unify
`StatusBadge` on tokens (M2); pick one profile serif (M4).

**Phase 3 — the structural items (weeks, needs product input)**
Declare the four design languages explicitly with a documented token bridge between them
(H2); decide the fate of `components/profile/`'s 1,397 inline styles; unify the reader
surfaces on one template (M3); execute the dark-mode decision.

**Phase 4 — lock it (do not skip)**
Add `eslint-plugin-tailwindcss` with arbitrary values restricted, a CI contrast check over
token pairs (the script used for this audit is reusable), and a `font-display`/`font-body`
autofix rule (L4). Without this, Phases 0–3 regress — that is exactly what happened to
`SectionHeading`.

Phases 0 and 1 together are roughly a day of work and resolve all four Critical findings plus
the most-visible High one. They're worth doing before anything else in the app.