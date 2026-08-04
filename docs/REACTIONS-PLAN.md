# Real reactions — one mechanism, four surfaces

**Status: P0 + P1 BUILT, 2026-08-04.** Reactions on blogs and blog parts are
real and verified against a live database (§11). P2 (stories), P3 (bulletins)
and P4 (the dashboard endpoint) are still open.
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

## 8. What the dashboard does on the day this lands

Nothing structural. `deriveDashboard()` was written as the API contract for
exactly this: `GET /api/analytics/reactions?from&to&types` returns the same
`Dashboard` shape, the sample generator is deleted, and the screen changes one
import. The sample-data badge and the "nothing on this page is live" footer come
off in the same commit — and not one commit earlier.

## 9. Phases

| | | Ships |
|---|---|---|
| **P0** ✅ | `lib/reactions.ts`, `routes/reactions.ts`, indexes, `rawCollection`. No UI change. | Testable with curl; nothing user-visible |
| **P1** ✅ | **Blogs.** `ReactionBar` wired for `blog` + `blogPart`, real counts, sign-in prompt, optimistic update. Preview copy comes off the blog page. | Reactions are real on `/blog/:slug` |
| **P2** | **Stories** — `/articles/:id`. Same component, one new `targetType`. The server side already accepts `story`. | |
| **P3** | **Bulletins** — the magazine issue viewer. The server side already accepts `bulletin`. | |
| **P4** | Analytics endpoint; screen swaps sample → real; badges come off. | The dashboard is live |

P1 was the real milestone: it proves the mechanism against the hardest surface,
because blogs are the only one with two granularities. P2 and P3 are now a
`ReactionBar` on a page each — `assertReactable` already knows both.

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

Two defects were found this way and fixed:

1. **`$limit: 0` is not a legal MongoDB stage.** It was the stub for the `mine`
   branch of the `$facet` when nobody is signed in. The sub-pipeline is now
   omitted entirely for an anonymous caller.
2. **Express 4 does not await route handlers**, so the thrown error above never
   reached the error middleware and the request simply *never came back* —
   there was no 500 to read, just a client timeout. Every handler in this router
   now goes through a `handle()` wrapper that turns a rejection into a logged
   500. Worth knowing: the rest of the app's routers have the same latent shape.

## 10. Decisions — settled

**D1 — Counts appear AFTER you pick.** A visible tally is a nudge: seven numbers
under seven emoji tell you the popular answer before you have given your own,
and the whole value of this scale is that it is not a popularity poll. Before
you answer you see the size of the room ("412 readers have had their say") and
no breakdown; the split is the reward for answering. Implemented as
`showCounts = picked !== null` in `ReactionBar`.

**D2 — A reader may change their pick, freely.** `setReaction` is an upsert, and
tapping your current pick again clears it. A locked-in misclick is worse data
than a considered change. `total` does not move on a change, because a change is
not a second reader.

**D3 — Staff reactions are stored with a flag.** `isStaff` is stamped at write
time from the account (never the client), so the dashboard can exclude the
building's own reactions from the readership's. No UI for it.
