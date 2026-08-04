# Real reactions — one mechanism, four surfaces

**Status: COMPLETE — P0–P4 BUILT, 2026-08-04.** Reactions are real on **all four
surfaces** (blogs, blog parts, stories, bulletin issues), and the Emoji
Analytics dashboard reads them live. Every gate and every figure is verified
against a live database (§11). The sample generator, the "Sample data" badge and
the "nothing on this page is live" footer are all deleted.
**Related:** `docs/EMOJI-ANALYTICS-PLAN.md` (the dashboard this feeds),
`docs/BLOG-SYSTEM-PLAN.md` §10 (blog parts).

All three open decisions were settled as recommended: counts reveal on react,
a reader may change their pick freely, and `isStaff` is stamped at write time
from the account so the dashboard can exclude the building's own reactions.

---

## 1. Where we are

| Piece | State |
|---|---|
| `types/reactions.ts` | The seven-step scale **and the weights** (−5 −3 −1 0 1 3 5). Shared, correct. **No change needed.** |
| `blog/BlogReactions.tsx` | Real UI, real keyboard handling, honest zeros. **No storage of any kind** — a pick dies on reload. |
| `BlogPost.tsx` | Already draws a bar **per part** and one for the post overall. |
| Emoji Analytics screen | Reads `deriveDashboard()` over a generated sample. |
| Server | **Nothing.** No collection, no route, no lib. |

So the UI is done and the plumbing is missing. That is the whole job.

Two things the reader page already got right, which the storage must not break:
per-part reactions are a **separate target** from the post, and `BlogPart.id` is
a `crypto.randomUUID()` that survives editing — reorder a part or rewrite its
prose and the id stays put. That id is what a stored reaction keys to.

## 2. The one mechanism

One document per reaction. One collection. One server lib that is the only thing
allowed to touch it.

```
reactions
  _id
  targetType   'blog' | 'blogPart' | 'story' | 'bulletin'
  targetId     blog id | part uuid | article id | issue id
  parentId?    for a blogPart: the post's id  ← see §5, this is load-bearing
  emoji        EmojiKey — the KEY only, never the weight
  userId       who
  createdAt
  updatedAt
```

**The weight is never stored.** It is derived at read time through `weightOf()`
from the shared scale. The scale was re-weighted once already before shipping and
may be again; a weight copied onto every row would make all of history wrong on
that day and force a backfill, where deriving makes it a config change.

### Indexes

```
{ targetType: 1, targetId: 1, userId: 1 }   UNIQUE   ← "one reaction per reader"
{ targetType: 1, targetId: 1 }                       ← count aggregation
{ parentId: 1 }                                      ← every part of a post at once
{ createdAt: -1 }                                    ← the analytics date window
```

The unique index **is** the one-per-reader rule. Without it that rule is a
sentence in the UI, and every number the dashboard prints is unfalsifiable.

### This collection opts out of soft delete — deliberately

`lib/db.ts` folds `deletedAt: null` into every query and `deleteOne` stamps
rather than removes. That convention **cannot** be used here: a soft-deleted row
still occupies the unique key, so a reader who clears their reaction and picks
again would hit a duplicate-key error. Reactions hard-delete.

That single fact is why reactions get their own module instead of going through
`db.collection()`, and it needs one narrow addition to `db.ts`: a documented
`rawCollection(name)` escape hatch, used by `lib/reactions.ts` and nothing else.

## 3. The centralized pieces — one of each

| File | Owns |
|---|---|
| `apps/server/src/lib/reactions.ts` | The collection, the upsert, the clear, the count aggregation, and `assertReactable()`. **The only file that touches `reactions`.** |
| `apps/server/src/routes/reactions.ts` | Three endpoints (§4). Thin — all logic is in the lib. |
| `apps/web/src/components/ReactionBar.tsx` | One component, four surfaces. `BlogReactions` moves here and keeps its props. |
| `apps/web/src/stores/reactionStore.ts` | One store: load a page's counts, submit, clear, optimistic update, rollback on failure. |
| `apps/web/src/types/reactions.ts` | The scale and weights. **Unchanged** — it is already the shared contract. |

Nothing else imports the collection name, and nothing else computes a score. The
same rule that has kept the scale from forking between the public bar and the
dashboard.

## 4. The endpoints

```
GET    /api/reactions?targetType=blog&targetId=X&withParts=1
PUT    /api/reactions/:targetType/:targetId     { emoji }
DELETE /api/reactions/:targetType/:targetId
```

`GET` is public and returns counts per target plus `mine` (the caller's own pick)
when signed in. `PUT`/`DELETE` need auth, go through `rateLimit('reactions', …)`,
and are mounted like every other write route in `index.ts`.

## 5. The N+1 that `parentId` exists to kill

A post with eight parts needs nine sets of counts. Nine round trips would make
the reader page slower for a feature nobody asked to wait for.

`parentId` on every part reaction makes it **one** aggregation:

```js
$match: { $or: [ { targetType: 'blog', targetId: X }, { parentId: X } ] }
$group: { _id: { t: '$targetType', id: '$targetId' }, … counts per emoji }
```

One query returns the post and every part. `withParts=1` is what asks for it.

## 6. Who may react — the decision this has been waiting on

**Recommendation: signed-in only.** Not because it is stricter, but because the
alternative costs more than it looks:

There is **no cookie layer in this app at all** — no `cookie-parser`, no
`res.cookie`, no `req.cookies` anywhere in the server. Anonymous reactions need a
signed device cookie, which means a new dependency, `SameSite`/`Secure` decisions
across the split web/api origins, and CORS credentials — a cross-cutting change
to the whole API for one feature.

Signed-in only, by contrast:

- `userId` is the unique key. One-per-reader is enforceable in one index.
- Every count is **people**, not reactions — so the dashboard drops the "this
  counts reactions, not people" caveat it currently has to carry everywhere.
- It costs nothing to build. OTP sign-in already exists.

The trade is volume: an anonymous reader sees the bar and must sign in to use it.
For a members' racing publication with party claims and subscription tiers, that
is a reasonable ask — and reactions from accounts are worth more than reactions
from devices, because they can later be cut by party role and tier.

If volume matters more than fidelity, say so and anonymous goes back on the
table — but as its own piece of work, not smuggled in with this one.

## 7. The gates

- **Reactable = readable.** `assertReactable()` re-checks the same gate the read
  endpoint applies: the target exists, is published (`isLive` / `isBlogLive`),
  and — for a paywalled post — that this reader's tier reaches `minTier`. You may
  react to what you may read, and to nothing else.
- **A part must belong to a live post**, and the part id must actually exist on
  it. Otherwise a made-up uuid creates orphan rows the dashboard would then count.
- **Rate limited** per account, through the existing `lib/rateLimit.ts`.
- **Counts are public. `mine` needs auth. The dashboard needs `analytics.view`.**
- **The PAGE must not offer what the server will refuse.** Staff and authors read
  drafts on the very pages that carry a bar, and "reactable = readable" is
  narrower than "can you see this" — so each page hides the bar unless the thing
  is live (`isBlogLive` / `isLive` / `!issue.unpublishedAt`), matching
  `assertReactable` exactly. This was a real defect, found by opening a draft
  story: the scale rendered, every click answered `Not found`, and it read as a
  broken feature rather than one that isn't open yet. A 404 that still reaches
  the client — the thing was unpublished while someone had it open — now reads
  "This is not open for reactions" instead of the API's "Not found".

## 8. The dashboard — P4, as built

`GET /api/analytics/reactions?from&to&types` (`routes/analytics.ts`), gated on
`analytics.view`. `reactionsReport()` in `lib/reactions.ts` does the work.

**The endpoint returns COUNTS and performs no arithmetic.** That is the one
design decision here worth defending. Scoring means weights, and the weights
live in exactly one file — `apps/web/src/types/reactions.ts`, shared with the
public reaction bar. A server-side copy would be a second scale waiting to
disagree with the first, which is the precise failure that module was extracted
to prevent. The browser multiplies, so a re-weighting stays a one-file change
and re-scores all of history correctly with no backfill.

The payload is therefore **one row per reacted item**, bounded by the published
catalogue, rather than one row per reaction, which would grow with traffic.
Three things the client cannot derive from those rows come separately:
`reactors` (distinct people — a reader reacts to many items, so per-item counts
cannot be summed), `publishedByType` (the coverage denominator), and
`truncated`.

Other decisions worth recording:

- **Staff reactions are excluded**, using the `isStaff` flag stamped at write
  time. `?includeStaff=1` puts them back; there is no UI for it.
- **`analytics.view` is now server-enforced.** It gated a sidebar module and
  nothing else, because there was no server-side data to protect. There is now.
  (`check:permissions` reads *tracked* files via `git grep`, so it will keep
  reporting this as a module gate until `routes/analytics.ts` is committed.)
- **A target whose record has gone is dropped, not shown as "Unknown".** Its
  reactions still exist, but a leaderboard row nobody can click is noise.
- **The report caps at 500 reacted items** and says so in `truncated`, which the
  page prints. A dashboard that quietly leaves things out is worse than one that
  admits it.
- **`rangeFor()` now measures from `Date.now()`.** It used to measure from a
  frozen constant, because the sample data was generated around one — against a
  live feed that would have silently stopped including today.

## 9. Phases

| | | Ships |
|---|---|---|
| **P0** ✅ | `lib/reactions.ts`, `routes/reactions.ts`, indexes, `rawCollection`. No UI change. | Testable with curl; nothing user-visible |
| **P1** ✅ | **Blogs.** `ReactionBar` wired for `blog` + `blogPart`, real counts, sign-in prompt, optimistic update. Preview copy comes off the blog page. | Reactions are real on `/blog/:slug` |
| **P2** ✅ | **Stories** — `ReactionBar` closes the article column on `/articles/:id`, above Related (which is an invitation to leave). Hidden behind the paywall. | Reactions are real on a story |
| **P3** ✅ | **Bulletins** — under the last page of `/bulletins/:id`, `print:hidden` so it never lands in the downloadable PDF. | Reactions are real on an edition |
| **P4** ✅ | `GET /api/analytics/reactions` behind `analytics.view`; the screen swaps sample → real; generator, badge and footer deleted. | The dashboard is live |

P1 was the real milestone: it proved the mechanism against the hardest surface,
because blogs are the only one with two granularities. P2 and P3 were then a
`ReactionBar` on a page each with no server change at all — `assertReactable`
already knew both target types, which is what "one mechanism" was supposed to
buy and did.

## 11. What was verified, and how

Not by reading it. The server was run against a real MongoDB and every rule
above was exercised over HTTP:

| | Result |
|---|---|
| Anonymous GET on a target with no rows | 200, all seven zeros — the bar renders |
| React `love`, then `hate` | `total` stays **1**. A change is not a second reader |
| React on a part with its `parentId` | Recorded; row carries `parentId`, no weight |
| React on a part id **not on that post** | **404** — no orphan rows |
| `blogPart` with no `parentId` | 404 |
| `withParts=1` | Post **and** part in ONE response |
| Same call anonymously | Counts present, `mine: null` |
| Clear, then react again | 200 — the hard-delete/unique-index trap does not fire |
| Unknown emoji / unknown target type | 400 |
| A **draft** post | 404 |
| A **premium** post, free reader | 403 |
| `reactions` indexes after boot | All four present, `unique: true` on the right one |
| **Story**: react, then change it | 200; `total` stays 1 |
| **Story**: a draft | 404 |
| **Story**: premium, free reader | 403 |
| **Bulletin**: a live issue | 200 |
| **Bulletin**: an issue that was pulled (`unpublishedAt`) | 404 |
| **Bulletin**: an id that does not exist | 404 |
| **Analytics**, anonymous | 401 |
| **Analytics**, signed-in reader with no `analytics.view` | 403 |
| **Analytics**, administrator | Counts match a hand-computed catalogue exactly |
| — staff reaction excluded by default | 8 reactions / 5 readers of 9 rows |
| — `?includeStaff=1` | staff rows reappear |
| — `?types=blog,blogPart` | only those types, and the coverage denominator narrows with them |
| — `?types=blog,podcast` | unknown type dropped, not a 400 |
| — a window with nothing in it | zeros, not an error |
| — `from` after `to` | 400 |
| — blog part row | titled "Part A", carrying its post's title as `parentTitle` |

Three defects were found this way and fixed:

1. **`$limit: 0` is not a legal MongoDB stage.** It was the stub for the `mine`
   branch of the `$facet` when nobody is signed in. The sub-pipeline is now
   omitted entirely for an anonymous caller.
2. **Express 4 does not await route handlers**, so the thrown error above never
   reached the error middleware and the request simply *never came back* —
   there was no 500 to read, just a client timeout. Every handler in this router
   now goes through a `handle()` wrapper that turns a rejection into a logged
   500. Worth knowing: the rest of the app's routers have the same latent shape.
3. **`?includeStaff=1` was documented and never read.** The handler ignored the
   query parameter entirely, so the flag the doc comment promised did nothing.
   Only caught because the expected count (9) and the observed count (8) were
   written down before the request was made.

## 10. Decisions — settled

**D1 — Counts are PUBLIC, always, and start at zero.** *Reversed by the user
after seeing it, 2026-08-04.* It first shipped as reveal-on-react, on the
argument that a visible tally nudges the answer. Overruled: this is a reader
feature, and a scale that withholds what everyone else said looks like it is
hiding something. Every step shows its real count to everyone, signed in or not,
before they answer.

A zero is shown as a zero — no seeding, no rounding up, no "be the first" in
place of a figure. `docs/FAKE-DATA-REMOVED.md` records the sweep that pulled
invented follower counts and subscriber stats out of this app; a plausible
number is a lie somebody eventually decides on.

**D2 — A reader may change their pick, freely.** `setReaction` is an upsert, and
tapping your current pick again clears it. A locked-in misclick is worse data
than a considered change. `total` does not move on a change, because a change is
not a second reader.

**D3 — Staff reactions are stored with a flag, excluded by default, and the
exclusion is VISIBLE.** `isStaff` is stamped at write time from the account,
never the client.

"No UI for it" was wrong, and the way it was wrong is worth recording. Staff
test their own reaction bars, so the very first thing this feature did to the
people who built it was hide their reactions and show an unexplained zero — the
user reacted on three surfaces, opened the dashboard and found nothing. The
report now returns `staffExcluded`, the page prints "N staff reactions not
counted" with an **Include them** link, and a "Who counts: Readers / Everyone"
control sits with the other filters. The default is unchanged, because these
figures are meant to be the readership's; what changed is that the rule explains
itself instead of looking like a bug.

**Sign-in, D1's companion.** A signed-out reader tapping a step is not making a
dead click — it is asking to take part, so it routes to `/login?next=…` via
`loginUrlFor` and comes back to the piece they were reading. Silently ignoring
the tap was the worst of both: the control looked live and nothing happened.
Arrow keys still only move, never redirect — reading the scale is not answering
it.
