# Emoji Analytics — platform-wide plan

**Status:** 2026-08-04. **The front end (§6–§9) is BUILT** against a generated
sample dataset — typecheck and build green, not yet opened in a browser. The
store, the write path and the read API (§5, §11 P0–P2) are still proposal.
D1–D3 in §13 remain open.
**Related:** `docs/EMOJI-ANALYTICS-REVIEW.md` (findings on the current screen),
`docs/BLOG-SYSTEM-PLAN.md` (the model this follows), `docs/PUBLIC-SITE-REVIEW.md`.

---

## 1. What this is

Reader reactions on the seven-point emoji scale, collected on **every published
surface in the platform**, and read back as one staff dashboard.

The decision that shapes everything below: **reactions are the only reader-engagement
signal Stable Press has.** There is no view tracking, no dwell time, no referrer, no
comments — grep the server for `views`, `viewCount`, `readCount`, `impressions` and
you get nothing. So this page is not "a nice extra on top of analytics"; for reader
behaviour it *is* the analytics. That raises the bar on two things at once: it must
cover every surface, and it must never imply a measurement it doesn't take.

## 2. Where we are

| Surface | Reality |
|---|---|
| Analytics module (`views/AnalyticsView.tsx`) | Four workflow counts + a card reading *"connects to your analytics provider in production"*. |
| `/api/metrics` | Four public counts for the marketing hero. |
| Emoji Analytics screen | ~11 panels, 100% invented data, honestly labelled. |
| `BlogReactions` on a blog post | Real UI, seven real steps, **zero storage** — a pick dies on reload. |
| `types/reactions.ts` | The scale, correct and already shared by both. **Keep as-is.** |

Two things must be deleted rather than wired up:

- **Comment counts.** The sample data carries `comments: 184` per item and renders it.
  There is no comments collection anywhere in the platform. Remove the field; do not
  build a "0 comments" column for a feature that doesn't exist.
- **The unguarded prose claims** ("it is also your busiest category", "blogs beat news
  and stories") — see the review. Everything the page asserts must be derived.

## 3. Reactable surfaces — the whole CRM

Stories, bulletins and the newsletter are **one collection** (`articles`) split by
`channels`, not three content types. That matters: it means the channel cut is free.

| Surface | Collection | Public route | React? |
|---|---|---|---|
| Stories (news) | `articles` (`channels: news`) | `/articles/:id` | ✅ P1 |
| Bulletins | `articles` (`channels: bulletin`) | `/bulletins/:id` | ✅ P1 |
| Newsletter | `articles` (`channels: newsletter`) | `/newsletter` | ✅ P1 |
| Blogs | `blogs` | `/blog/:slug` | ✅ P1 |
| Podcast episodes | `podcastEpisodes` | `/podcast` | ✅ P1 |
| Magazine issues | `issues` | share link | ✅ P2 |
| Horse profiles | `horses` | `/horses/:id` | ⚠️ P3 — see below |
| People / party profiles | `parties` | `/parties/:id` | ⚠️ P3 |
| Tipping | `tips` / `races` | `/tipping` | ❌ — see below |
| Breaking news | `breakingNews` | banner | ❌ — ephemeral |

**Profiles (horses, people) react differently and must be treated differently.** A
reaction on a *story* is editorial feedback: "you wrote this well." A reaction on a
*horse* is a popularity vote about a real animal and, by extension, its connections.
Same seven emoji, completely different meaning — and 🤬 on a named trainer's profile is
a moderation problem, not a metric. Recommendation: ship profiles in P3 with a
**separate, kinder scale** (or reaction-off by default, opt-in per profile), and never
mix profile reactions into the editorial totals. They get their own section.

**Tipping is excluded.** A tip is a prediction that is later right or wrong; it already
has an objective outcome. An emoji vote on it measures nothing the result doesn't
measure better, and invites reacting to the tipster rather than the tip.

## 4. What a reaction can be cut by

This is the whole reason the store is shaped the way it is in §5.

Per item — what already exists on the documents:

| Dimension | articles | blogs | podcasts | issues |
|---|---|---|---|---|
| Category | ✅ 9-key enum | ⚠️ **free text** | ❌ | ❌ |
| Tags | ✅ | ✅ | ❌ | ❌ |
| Author | ⚠️ free-text `author` + `createdByUserId` | ✅ `author.userId` / `partyId` | `host` | — |
| Linked horses | ✅ `linkedHorseIds` | ✅ `linkedHorseIds` | ❌ | — |
| Linked people | ❌ | ✅ `linkedPartyIds` | `guests` | — |
| Channel | ✅ news/newsletter/bulletin | ❌ | ✅ | — |
| Paywall tier | ✅ `minTier` | ✅ `minTier` | ❌ | — |
| Length | `readingTime?` | ✅ computed | duration | — |

Per reader, when signed in — and this is the part a generic analytics product cannot
touch:

- `roles[]` — **reader, owner, trainer, jockey, breeder, bloodstock agent, syndicate
  manager, personnel**
- `subscriptionTier` — free / standard / premium
- `orgMemberships`, account age, staff-vs-reader (`staffRoleSlug != null`)

Blog `category` is free text (`optStr` in `routes/blogs.ts`; the AI prompt says *"their
words are fine"*) while articles use the closed 9-key enum. **Blogs and articles cannot
share a category axis until this is resolved** — decision D2 in §12.

## 5. The store

One document per reaction, with the target and reader **denormalised at write time**.
That is the central design call: it turns every cut in §7 into a single `$group`
instead of a four-collection join, and it is what makes a 20-panel page load once.

```
reactions
  _id
  targetType     'article' | 'blog' | 'podcast' | 'issue' | 'horse' | 'party'
  targetId
  emoji          EmojiKey            // the shared seven-step scale
  // NO weight column. Weights (−5 −3 −1 0 +1 +3 +5) live on the scale in
  // types/reactions.ts and are applied at READ time — a `$switch` in the
  // aggregation. The scale was re-weighted once before shipping and may be
  // again; a weight copied onto every row would make all of history wrong on
  // that day and turn a config change into a backfill.
  userId?                            // null when anonymous
  anonId?                            // signed cookie — makes one-per-reader enforceable
  reactedAt

  // snapshot of the target, at write time
  targetCategory?   targetTags[]     targetAuthorUserId?
  targetChannels[]  targetMinTier    targetPublishedAt

  // snapshot of the reader, at write time
  readerRoles[]     readerTier       readerIsStaff
```

**Why snapshot rather than join:** a reaction is a fact about a moment. If a post is
recategorised in September, the August reactions it earned under the old category
should not silently move. Joining would rewrite history every time an editor edits a
tag. It also means the aggregation never touches `articles`/`blogs` at all.

Indexes (the first two are the feature, not an optimisation):

```
{ targetType: 1, targetId: 1, userId: 1 }  unique, partial: userId exists
{ targetType: 1, targetId: 1, anonId: 1 }  unique, partial: anonId exists
{ targetType: 1, targetId: 1 }
{ reactedAt: -1 }
{ targetAuthorUserId: 1, reactedAt: -1 }
```

Without the two unique indexes, "one reaction per reader" is a sentence in the UI
rather than a property of the data — and every number on the dashboard becomes
unfalsifiable.

**Write path.** `POST /api/reactions` `{ targetType, targetId, emoji }` → upsert on the
unique key, so changing your mind replaces rather than adds. `DELETE` clears it.
Rate-limited per `anonId`. Staff reactions are stored with `readerIsStaff: true` and
**excluded from the dashboard by default** — otherwise the newsroom reacting to its own
work is indistinguishable from readers doing it.

**Read path.** `GET /api/analytics/reactions?from&to&types&excludeStaff&minN` returns the
whole dashboard in one payload. `deriveDashboard()` in the current `data.ts` is already
close to the right response shape — keep the interfaces, replace the source.

## 6. The page — the spine

Twenty panels with no spine is a page nobody reads. The order is the order an editor
actually asks the questions:

> **How are we doing → what did they love → what split them → which of our things →
> who are they → is it moving → what do I do**

**One control row above everything** (never per-panel filters): date range · content
types · exclude staff · minimum-n floor. Every panel re-renders against the same slice.

## 7. The panels

### §0 · Mood strip — stat tiles, not charts

Hero figure: total reactions in range (≥48px, body sans, proportional figures — never a
display face, never `tabular-nums` on a standalone number). Then four tiles: net with a
delta vs the previous period; reactors (signed-in + anonymous devices); **coverage** —
items reacted to ÷ items published; most-used step.

Coverage is the tile the current design lacks and needs most: it is the honest answer to
"how much of this can I trust".

### §1 · The scale — diverging stacked bar, centred on neutral

The correct form for an ordered sentiment scale, and an upgrade on today's three-part
for/middle/against meter: one mark shows all seven steps **and** where the neutral pivot
falls. Below it, the seven-row "every emoji, counted" list stays — each row wears its own
step fill, which is legitimate because there the rows *are* the scale.

### §2 · Leaderboards — "what did they love"

The panel the whole feature is for, and the one the current screen has no way to express
because it collapses seven emoji into `net`.

- **Emoji selector**: All + the seven steps. Picking 🤩 gives the top items by 🤩.
- **Rank mode**: `Count` (reach) · `Share` (purity) · `Net` (direction). 40 of 50
  reactions being 🤩 is a different animal from 60 of 600, and one ranking cannot say
  both.
- **Top 10 table** — a table, not a chart: ten named items each carrying a seven-step
  distribution is past the ~7-class limit where colour stops working. Columns: rank ·
  title · type chip · category · date · the metric · a **mini centred diverging bar** of
  that item's own distribution · net.
- **Bottom 10** on the same control. `🤬 Really hate it` sorted by count is the
  complaints queue — arguably the most operationally useful list on the page.
- Row → drawer: full breakdown, reader-role split, arrival timeline, link to the record.

### §3 · Divisiveness — the panel nothing today has

`net` cannot tell "nobody cared" (all 😐) from "half loved it, half hated it". Both land
near zero; they are opposite editorial situations.

- **Heat** = share of reactions at the poles (🤬 + 🤩). **Direction** = net.
- Form: **scatter** — net on x (−100…+100), heat on y, dot area = reaction count. Four
  labelled quadrants: *Loved* · *Quietly liked* · **Divisive** · *Ignored*.
- Colour: each dot wears its band fill — the same one language, no new palette. When a
  content type is selected, that type keeps colour and the rest go to the de-emphasis
  gray (emphasis, not categorical).

"Most divisive this month" is a commissioning decision, and right now nothing in the
platform can produce it.

### §4 · Registers — the platform-specific cuts

Six ranked lists built from **one row component** (title · centred diverging bar · net ·
n). Same mark six times is what stops six registers becoming six designs. Every list
honours the min-n floor and prints it.

By content type · by category (articles-only until D2) · by tag · by writer · **by
horse** · **by person**.

The last two are the ones no off-the-shelf product can do: `linkedHorseIds` and
`linkedPartyIds` already exist, so *"stories mentioning this horse pull three times your
average 🤩"* is one `$group` away — and it feeds straight back into the horse and party
profile pages.

### §5 · Audience — who is reacting

- **Reader-role × emoji heatmap.** Eight party roles × seven steps, **row-normalised
  share on a single-hue sequential ramp**, with each row's net printed at the end. Share
  goes on the sequential ramp and direction stays on the diverging scale — never both on
  the same channel. Includes a permanent **"not signed in"** row so the coverage gap is
  on the face of the panel, not in a footnote.
- By subscription tier — three small multiples of the diverging bar. Answers "is the
  premium tier earning its gate".
- By channel — news / newsletter / bulletin. Is the newsletter audience warmer?

### §6 · Time

- Reactions per week — a line, one series (no legend; the title names it).
- Mood trend — net per week against a zero baseline.
- **Two charts stacked on a shared x-axis, never a dual axis.** Volume and net is
  precisely the pair someone will be tempted to put on two y-scales; the alignment would
  be arbitrary and would invent a correlation.
- Arrival curve — median hours to half an item's reactions. That is the shelf life of a
  post, and it is otherwise unknowable here.

### §7 · Moves

Recommendations, each **derived**, each carrying its n, each linked to the real record.
A card renders only when its n clears the floor — which is the structural fix for the
current page recommending "commission more of this" off a single post.

## 8. Colour discipline

**The page has exactly one colour language: the seven-step diverging sentiment scale.**
Content type, category, writer, horse, person, role, tier and channel are carried by
position, facet, label and small multiples — never by a second palette. Six types plus
nine categories plus eight roles would want 23 hues; the ceiling is 8, and the budget is
already spent on sentiment, which is the actual subject.

Validated with the dataviz validator against the real card surface `#fefcf6`:

| Check | Result |
|---|---|
| For-arm `#2f7a58 → #22603f → #174a32` as an ordinal ramp | **all pass** (monotone L, ΔL ≥ 0.06, single hue 4°) |
| Against-arm `#e37945 → #cd5c2f → #b84619` as an ordinal ramp | **all pass** (hue spread 6°) |
| Five bands, worst all-pairs protanopia | **ΔE 9.2 — pass**, matching the claim in `data.ts` |
| Five bands, worst all-pairs **normal vision** | **ΔE 14.4 — below the 15 floor.** `data.ts` claims 15.3; it does not reproduce. The pair is **Cool ↔ Rejected** (`#e37945` ↔ `#b84619`). |
| Contrast vs card | `split` 2.13:1, `cool` 2.89:1 — both under 3:1 |

Two rules follow, and they are cheap because the current design already half-obeys them:

1. **Cool and Rejected must always carry their band label.** They are the hardest pair to
   separate even with full colour vision. Correct the 15.3 claim in `data.ts` to the
   measured 14.4 while you're there.
2. **Relief is mandatory, not optional**, for `split` and `cool`: a visible label and a
   table-view twin on every panel that uses them.

The categorical checks the validator fails on these palettes do **not** apply — an
ordered diverging ramp is not a categorical palette, and adjacent steps within an arm are
*meant* to be similar. Validate each arm as ordinal (done, passes) and the bands for
pairwise separation (done).

**Dark mode:** the scale is light-only by design and `theme.css`'s dark block is unwired.
When dark mode is turned on, the ramp gets **re-stepped and re-validated** against the
dark card — never flipped.

## 9. Interaction and accessibility

- One filter row above everything it scopes; no filter lives inside a panel.
- Hover tooltip on every mark; keyboard focus shows the same content.
- A table-view twin for every chart — required anyway by the contrast note above.
- Refetch holds the previous render at reduced opacity; no skeleton flash, no layout jump.
- Nothing is encoded by colour alone, anywhere. The current screen already gets this
  right and it is the standard to hold.

## 10. Placement of the reaction bar

`BlogReactions` becomes a shared `<ReactionBar targetType targetId />`, unchanged in
appearance, wired to the store. It goes on: article detail, bulletin viewer, blog post,
podcast episode, magazine issue. The honest-zero design stays until real counts exist,
then counts come from the API.

One rule when it goes live: **show the distribution, never a single "score"**. A
five-star average is exactly the abstraction this scale was chosen to avoid.

## 11. Phases

| | |
|---|---|
| **P0** | Store: collection, indexes, `POST`/`DELETE /api/reactions`, one-per-reader, staff flagging, rate limit |
| **P1** | `<ReactionBar>` on article / bulletin / blog / podcast; real counts |
| **P2** | `GET /api/analytics/reactions` — the one aggregation endpoint; magazine issues |
| **P3** | Page core: mood strip, scale, leaderboards, registers |
| **P4** | Divisiveness, audience heatmap, time |
| **P5** | Moves, drill-down drawers, table views |
| **P6** | Feed back out: most-loved rail on `/blog` and `/news`, reactions on horse & party profiles (separate scale, §3) |

Each phase is independently shippable. P0+P1 alone replace the whole fabricated screen
with a small honest one.

## 12. Rules this page keeps

Carried forward from the current screen, which gets these right and should not lose them:

- **No seeded counts, ever.** An honest zero beats a plausible number someone makes a
  decision on. (`docs/FAKE-DATA-REMOVED.md`.)
- **Every ranked panel states its minimum-n**, and no recommendation renders below it.
- **The anonymous share is always visible** — it is the error bar on every reader cut.
- **Nothing claims a measurement we don't take.** No views, dwell, geography, devices or
  comments. When a panel would need data we don't collect, it says so where it sits.

## 13. Open decisions

**D1 — Anonymous reactions, or sign-in required?**
Sign-in unlocks §5 entirely and makes per-person counting honest; anonymous gets far more
volume but most reader cuts collapse to "unknown". *Recommendation: allow anonymous with
`anonId`, show the signed-in share on every reader panel.*

**D2 — Blog categories.** Move onto the 9-key enum, or leave free text and drop blogs
from the category register? *Recommendation: move them — a free-text taxonomy is already
producing categories that match no tab on the public site.*

**D3 — Profile reactions.** Ship horse/party reactions at all, and if so on the same
seven emoji or a kinder scale? *Recommendation: P6, separate scale, never mixed into
editorial totals.*
