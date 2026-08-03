# Stable Press — Theme Direction: where green, where cream, where white

**Date:** 2026-08-03
**Trigger:** the blog composer reads as one flat cream field — no figure/ground, nothing to
rest the eye on.
**Companion doc:** [THEME-REVIEW.md](THEME-REVIEW.md) (the audit). This is the decision.

---

## Why it looks flat — measured, not guessed

Contrast ratio is the wrong metric for comparing two light surfaces; it compresses badly near
white. The right metric is **CIE L\*** (perceptually uniform lightness). A surface step needs
**≥3 L\*** to read as a distinct plane.

Current tokens:

| Token | Hex | L\* | Step from page |
|---|---|---|---|
| `--muted` / `--secondary` | `#efede6` | 93.7 | **−2.6** |
| `--background` (page) | `#f6f4ee` | 96.3 | — |
| `--card` | `#fcfbf8` | 98.7 | **+2.4** |

So the *entire* surface system spans **5.0 L\* points**. `--card`, the only surface above the
page, sits 2.4 points up — below the just-noticeable threshold. There is no elevation to see.

Then the code makes it vanish completely. **`bg-card` appears zero times in the blog
composer.** All 12 files paint with `bg-background`, `bg-muted` or `bg-muted/40`:

| What the code writes | Renders as | Step from page |
|---|---|---|
| `bg-muted/10` | `#f6f4ed` | −0.26 L\* |
| `bg-muted/20` | `#f5f3ec` | −0.52 L\* |
| `bg-muted/40` | `#f4f1eb` | −1.05 L\* |
| `bg-muted/60` | `#f2f0e9` | −1.57 L\* |

Every panel in that screenshot is within **1 L\* point** of the page behind it. It isn't
"too much cream" as a taste problem — it is **one single colour** wearing four class names.
Someone already noticed: `BlogEditorScreen.tsx` reaches for raw `bg-white` and `bg-white/90`,
because the tokens offered nothing.

**There are two bugs, and fixing either alone won't work:** the token values are too tight
*and* the code doesn't use the one real step that exists.

---

## The rule: colour gets a structural job, not a mood

The app already half-follows this and then contradicts itself. `NavBar.tsx:85` is
**`bg-primary`** — solid deep forest. The CMS sidebar (`ProductionSystemNav.tsx:309`) is
**`bg-card`** — cream. Same job, opposite treatment.

So "where green" is not an invention. **It's a rule the public site already follows and the
CMS breaks.**

| Colour | Job | Where | Never |
|---|---|---|---|
| **GREEN** `--primary` | Chrome & commitment — the frame around the work, and the one button that commits | Sidebar, navbar, primary buttons, active nav | A content background. Green is the frame, never the picture |
| **WHITE** `--background` | The sheet. The page, the writing canvas, and anything that *floats* (it lifts by shadow, not by tint) | Page field, editor canvas, dialogs, dropdowns, inputs | A box. If it's furniture, it's cream |
| **CREAM** `--card` | The boxes. Furniture sitting *on* the sheet | Cards, panels, stat tiles, the top bar | The page. Cream-on-cream was the whole bug |
| **CREAM-DEEP** `--muted` / `--surface-sunken` | Wells — nested inside a box | List panes, tool rails, table headers, hover | The thing being edited |
| **GOLD** `--brand-accent` | Punctuation. Rules, active markers, kickers | Hairlines, `--rule-gold`, active pill on green | **Body ink on light** — 2.06:1, see THEME-REVIEW C2. Use `--brand-accent-ink` |

The one-line version: **green frames it, white is the sheet, cream is the boxes, gold points at it.**

### Why white is the page and cream is the boxes (revised 2026-08-03)

The first pass had this inverted — cream page, white raised cards. Structurally correct, and it
did fix the flatness, but it left cream covering ~90% of every screen, which was the original
complaint. Making white dominant demotes cream from "everything" to "the boxes" and keeps the
warmth as an accent. Same tokens, better allocation.

### Making cream read warm, not dirty

A cream box on a white page goes muddy the instant it is under-saturated. What separates "warm
cream" from "dirty grey" is the tint's **yellow (Lab b\*) relative to how far it drops below
the page**:

| `--card` | Hex | L\* drop | b\* | ratio | Reads as |
|---|---|---|---|---|---|
| `45 34% 93%` | `#f3f0e7` | 4.8 | 4.7 | **1.0** | "dark and dirty" |
| `44 70% 96%` | `#fcf8ee` | 2.0 | 5.5 | **2.7** | still read dark on white |
| `44 85% 98%` | `#fefcf6` | 0.7 | 3.3 | **4.5** | warm white ✓ |

Below a ratio of roughly **2.0** it reads grey, and every step lighter buys warmth. So the box
must stay *light* to stay *warm* — which means the fill cannot also be the thing that says "this
is a box". **`--border` does the structural work; the fill only carries warmth.** Final steps
are tiny on purpose: page→box **0.7 L\***, box→well **2.1**, page→well **2.9**. `--muted` (the
well) is the only surface with a real step, so it's the only one that can stand alone unbordered.

### The border's saturation matters as much as its lightness

Half of "dirty" was never the fill — it was the outline. `--border` at `44 20% 70%` drew a
**khaki-tan** line around every card, and a tan outline reads dirty even when the fill inside it
is clean. Chroma (`√(a*²+b*²)`) is the number to watch:

| `--border` | Hex | on page | chroma | Reads as |
|---|---|---|---|---|
| `44 20% 70%` | `#c2baa3` | 1.93 | **12.4** | tan / khaki |
| `44 10% 72%` | `#bfbbb0` | 1.90 | **5.8** | warm grey ✓ |

Same definition strength, half the colour. Lightness barely moved — saturation did the work.

Corollary: cream boxes are *inset*, not raised, so they take a border and **no drop shadow** —
a shadow under a panel darker than its page reads as a mistake. Only genuinely floating things
(dialogs, dropdowns, floating toolbars) are white + shadow.

---

## The token set — all 30 contrast checks pass

Verified in CIE L\* for surface steps and WCAG 2.1 for every ink/edge pair on all three
surfaces.

```css
/* ── Surfaces: a real 3-step ladder ───────────────────────── */
--surface-sunken:  44 26% 88%;   /* #e8e4d8  L*=90.7  wells, lists, rails */
--background:      45 32% 93%;   /* #f3f0e7  L*=94.8  the room  (was 95%) */
--card:            46 60% 99%;   /* #fefdfb  L*=99.4  the work  (was 48 45% 98%) */

/* ── Edges: split by job (THEME-REVIEW C4) ────────────────── */
--hair:            44 20% 70%;   /* #c2baa3  decorative dividers, card edges */
--border:          44 20% 70%;   /* alias of --hair */
--edge:            44 16% 45%;   /* #857b60  control boundaries — 3:1 everywhere */
--input:           44 16% 45%;   /* MUST be --edge, not --hair */

/* ── Ink ──────────────────────────────────────────────────── */
--foreground:     156 20% 13%;   /* unchanged */
--muted-foreground:150 10% 34%;  /* was 150 8% 38% — clears 4.5:1 on sunken too */

/* ── Chrome ───────────────────────────────────────────────── */
--primary:        152 36% 18%;   /* unchanged — already right */
--primary-foreground: 44 44% 95%;

/* ── Gold: split fill from ink (THEME-REVIEW C2) ──────────── */
--brand-accent:    42 64% 53%;   /* #d4a63a  FILLS / RULES ONLY — unchanged */
--brand-accent-ink:38 64% 30%;   /* #7d5a1c  NEW — gold as text */

/* ── States (THEME-REVIEW C3, H6) ─────────────────────────── */
--destructive:      0 72% 42%;   /* #b81e1e  was 0 84.2% 60.2% → failed own fg at 3.59:1 */
--success:        152 48% 29%;   /* #266d4c  NEW */
--warning:         32 74% 31%;   /* #8a5315  NEW */
/* all three take white foreground: 6.47 / 6.18 / 6.33 */
```

**Surface steps:** sunken→page **4.1 L\***, page→raised **4.6 L\***, sunken→raised **8.7 L\***.
Compare current: page→card 2.4, and what the code actually paints, −1.05.

**Ink on every surface** (worst case is always `sunken`):

| | raised | page | sunken |
|---|---|---|---|
| `--foreground` | 15.11 | 13.46 | 12.08 |
| `--muted-foreground` | 6.65 | 5.92 | 5.32 |
| `--brand-accent-ink` | 6.19 | 5.51 | 4.95 |
| `--destructive` | 6.37 | 5.67 | 5.10 |
| `--success` | 6.09 | 5.43 | 4.87 |
| `--warning` | 6.23 | 5.55 | 4.99 |
| `--edge` (needs 3:1) | 3.68 | 3.28 | 3.02 |
| `--hair` (needs 1.5:1) | 1.91 | 1.70 | 1.53 |

Note `--background` moves 95% → 93%. That single change is what buys the room for white to
read as raised. Cream stays cream — it just stops competing with paper.

---

## Applied to the blog composer

The screen in the screenshot, re-assigned:

```
┌────────────┬──────────────────────────────────────────────────┐
│            │  top bar ......................  WHITE (raised)  │
│  SIDEBAR   ├─────────────┬────────────────────────────────────┤
│            │  POSTS      │                                    │
│  GREEN     │  LIST       │        EDITOR CANVAS               │
│  #1d3e2f   │             │                                    │
│  cream ink │  CREAM-DEEP │        WHITE (raised)              │
│            │  #e8e4d8    │        #fefdfb                     │
│  active =  │  (sunken)   │        + --hair border             │
│  gold pill │             │        + soft shadow               │
│            │  selected = │                                    │
│            │  white card │        ← floats in the cream room  │
│            │             │                                    │
├────────────┴─────────────┴────────────────────────────────────┤
│  everything sits in CREAM #f3f0e7 — the gaps ARE the page     │
└───────────────────────────────────────────────────────────────┘
```

Concrete changes, by file:

| File | Now | Change to |
|---|---|---|
| `ProductionSystemNav.tsx:309`, `:394` | `bg-card` | `bg-primary text-primary-foreground` |
| ‑ inactive nav item | `text-muted-foreground` | `text-primary-foreground/70` (floor is `/62` = 4.5:1) |
| ‑ active nav item | `bg-primary/10 text-primary` | `bg-primary-foreground/10` + `text-[hsl(var(--brand-accent))]` gold pill (5.19:1 on green) |
| `BlogListPane.tsx` | `bg-muted`, `bg-muted/40` | `bg-[hsl(var(--surface-sunken))]`; **selected row** → `bg-card` + `border-hair` |
| `BlogEditorPane.tsx` / `BlockCanvas.tsx` | `bg-muted`, `bg-background` | `bg-card` + `border border-border` + `shadow-sm` — **the paper** |
| `BlogEditorScreen.tsx` | raw `bg-white`, `bg-white/90` | `bg-card` (the token now actually means white) |
| `InsertMenu.tsx`, `ToolsRail.tsx` | `bg-muted` ×5 | `bg-card` for the floating menu, `surface-sunken` for the rail |
| `BlockToolbar.tsx` | `bg-background` ×5 | `bg-card` + `shadow-sm` (it floats — it must be raised) |
| Empty-state "An empty page." | on cream | on the white canvas, so the invitation is *on the paper* |

The rule that prevents regression: **anything that floats above the page — dropdown, toolbar,
dialog, popover, card — is `bg-card`. `bg-muted` and its alpha variants stop being surfaces
entirely** and are reserved for hover states only. That one sentence eliminates ~9 of the 25
card recipes in THEME-REVIEW M12.

---

## Why this also fixes "too much cream" everywhere else

Green sidebar + white work surfaces means cream drops from ~90% of pixels to roughly the gaps
and the page field — maybe 25%. It stops being the theme and becomes what it should be: the
warm paper stock the product is printed on. Nothing about the palette changes; the
*allocation* does.

Knock-on effects, all good:
- The CMS finally matches the public site (both green-chromed).
- `--card` starts meaning something, so `bg-muted/40`-as-a-card disappears.
- Splitting `--hair` from `--edge` fixes THEME-REVIEW C4 (invisible form fields) without
  making every card edge heavy.
- Splitting gold fill from gold ink fixes C2 without touching the gold hairlines that work.

---

## Decisions locked (2026-08-03)

- **Green scope: FULL GREEN SIDEBAR.** The CMS sidebar becomes solid forest with cream text
  and a gold active pill, matching `NavBar.tsx` exactly. Top bar stays light and sits with the
  content. One rule across public site and CMS.
- **Rollout: tokens first, judged in the browser before component work.**

## Sequence

1. **Token file only** — ✅ **DONE 2026-08-03.** `theme.css` + `tailwind.config.js`, zero
   component edits. Build verified (`vite build`, 21s, clean) and all values confirmed present
   in the compiled CSS. Fully revertible: `git checkout apps/web/src/styles/theme.css
   apps/web/tailwind.config.js`.
2. **Green the CMS sidebar** — `ProductionSystemNav.tsx:309` and `:394`, ~10 lines. Biggest
   visual payoff per line changed.
3. **Raise the composer** — the file table above. This is the screen that prompted this.
4. **Sweep `bg-muted` → `bg-card`** app-wide wherever the element floats; enforce the
   floats-are-raised rule in lint (THEME-REVIEW Phase 4).

Steps 2–3 are roughly half a day and cover everything visible in the screenshot.

### What step 1 changed on its own, with no component edits

Because `--muted` now maps to the sunken plane, the ~200 existing `bg-muted` panels became a
genuine surface instead of a 2.6 L\* whisper — including the composer's posts list and tool
rail. And because `--card` is now real white, every existing `bg-card` site (sidebar, dialogs,
role cards) became a raised plane. So a share of step 3's benefit arrived for free.

Still flat until step 3: the editor canvas itself, which paints `bg-background` /
`bg-muted/40` and needs `bg-card`. `bg-muted/40` renders as a faint tint of sunken — correct
for a hover state, wrong for paper.

### Gotcha: Tailwind silently drops off-scale opacity modifiers

`bg-primary/8` does not mean "8% primary". It means **nothing at all** — `8` is not in
Tailwind's `opacity` scale, so no rule is generated and the element renders with no background.
No warning, no error, no class in the output CSS. The scale here carries multiples of 5
(`/5 /10 /15 /20 … /60 /65 /70 …`); anything else needs bracket syntax, `bg-primary/[0.08]`.

Found and fixed 2026-08-03, 13 sites of `bg-primary/8`. Most were **selected / active states**,
so the feedback was invisible:

| Site | What was invisible |
|---|---|
| `horse-form/PartyPicker.tsx:112` | `isSelected && 'bg-primary/8'` — the **only** selection cue |
| `navbar/MobileMenu.tsx` ×4 | active nav item highlight |
| `signup/StepClaim.tsx`, `StepDetails.tsx` | selected option fill |
| `signup/StepComplete.tsx:17` | icon chip background — icon sat on nothing |
| `ArticleForm.tsx:757` | selected option fill |
| `party-form/PhotoUpload.tsx:94` | drag-over state fill |
| `Login.tsx:287`, `signup/StepOtp.tsx:57` | info-box fill |
| `editor-hub/EditorScheduling.tsx:149` | button fill |

**Still outstanding:** `newsroom/production-systems/HorseProductionSystem.tsx:277` uses
`bg-primary/3` for an expanded-row tint, which is also dropped. Left alone deliberately — that
file is off-limits without asking. One-line fix when you want it: `/3` → `/5`.

To catch these, this finds every off-scale modifier in the tree:

```bash
grep -rohE "\b(text|bg|border|ring|from|to|via|divide|placeholder|fill|stroke)-[a-z-]+/[0-9]{1,3}\b" \
  --include=*.tsx apps/web/src | awk -F/ '{if ($NF % 5 != 0) print}' | sort -u
```

Worth making a lint rule in Phase 4.

### Verification

47 of 48 contrast checks pass across card / page / sunken. The one exception is
`--brand-accent` as a **fill** on white (2.22:1) — a usage rule, not a token defect: gold
fills belong on green (5.19:1) or need a border; gold text now uses `--brand-accent-ink`.
