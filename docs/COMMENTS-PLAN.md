# Reader comments — one mechanism, three surfaces, one opinion

**Status: BUILT, 2026-08-04.** Comments are live on **stories**, **blog posts** and
**bulletin editions**, with a staff moderation desk at
`/production-system/comments` behind a new `comments.moderate` permission.
Typecheck (server + web) and `check:permissions` are green. **Never opened in a
browser** — see §11 for exactly what that leaves unverified.

**Related:** `docs/REACTIONS-PLAN.md` (the mechanism this is built on top of and
writes into), `docs/EMOJI-ANALYTICS-PLAN.md` (the dashboard, and why comments do
*not* add a figure to it), `docs/BLOG-SYSTEM-PLAN.md` §10 (blog parts, and why
they are rated but not discussed).

---

## 1. The one idea

There is **one opinion per reader per piece**, and it appears in two places.

The reaction bar asks *how did this sit with you* and takes one tap. The comment
section asks *why*, on the same seven-point scale, and **posting a comment writes
that pick through `setReaction()`** — the same lib the bar writes to, the same
unique index, the same one-per-reader rule.

That single decision is what makes the rest of this design fall out:

- The Positive / Neutral / Negative category is **derived**, never stored.
- A comment can never disagree with the reaction bar above it.
- Emoji Analytics needs no new figure and gets no double-count.
- "Commentable" cannot drift from "reactable", because it *is* reactable.

## 2. Where we started

| Piece | State before |
|---|---|
| `reactions` collection + `lib/reactions.ts` | Real, complete, four surfaces. **Reused unchanged.** |
| `types/reactions.ts` | The seven-step scale, weights, **and a `side` field nothing outside the dashboard read**. |
| Comments | **Nothing anywhere.** No collection, no route, no lib, no component. |

The `side: 'for' | 'middle' | 'against'` field is the hinge. It already existed,
already agreed with the scale, and was already the thing the analytics dashboard
grouped on — so the three-way category the reader sees needed a *label map*, not a
data model.

## 3. Who may comment — settled

**Signed-in only**, exactly like reactions, and for the same reason plus two more.

The original reason still holds: there is **no cookie layer in this server at
all** — no `cookie-parser`, no `res.cookie`, no `req.cookies` anywhere. An
anonymous commenter needs a signed device cookie, which means a new dependency,
`SameSite`/`Secure` decisions across the split web/api origins, and CORS
credentials: a cross-cutting change to the whole API for one feature.

The two that are specific to comments:

- **An author can edit and delete their own words.** That requires an identity
  that survives a browser. Anonymous comments are write-only for the person who
  wrote them, which is worse than not offering the feature.
- **Moderation is traceable to a person.** A report count is a count of PEOPLE
  because `userId` is the unique key; anonymous reports are a count of taps.

The trade is volume, and it is the same trade reactions already made. A reader who
wants to comment sees an invitation with a `?next=` back to the piece they were
reading, never a disabled textarea.

## 4. The category is derived, and that is the point

A comment row stores `emoji` — one of the seven scale keys — and **nothing else
about its sentiment**. Positive / Neutral / Negative is computed on read by
`sideOf()` in `apps/web/src/types/reactions.ts`, from the `side` field on the same
scale the reaction bar and the dashboard use.

A stored `category: 'positive'` column would be a second opinion axis sitting next
to the emoji, free to disagree with it — someone picks 🤩 and the row says
Negative. That is the precise failure the shared scale module was extracted to
prevent, and it is the same argument the weights won: **derive, never copy.**
Re-labelling the scale, or moving a step from one arm to the other, stays a change
to one file and re-categorises all of history correctly, with no backfill.

```
🤬 😠 😕   →  Negative        🤬 −5   😠 −3   😕 −1
😐         →  Neutral         😐  0
🙂 😊 🤩   →  Positive        🙂 +1   😊 +3   🤩 +5
```

**The pick is required.** You cannot post a comment without placing yourself on
the scale. That is the editorial content of the feature: a thread of unplaced
opinions is what this exists *instead of*, and it is what makes the sentiment
column complete rather than mostly-null.

## 5. The centralized pieces — one of each

| File | Owns |
|---|---|
| `apps/server/src/lib/comments.ts` | The two collections, the gate, post/edit/delete, reports, the moderation queue. **The only file that names `comments` or `commentReports`.** |
| `apps/server/src/routes/comments.ts` | Eight endpoints (§7). Thin — all logic is in the lib. |
| `apps/web/src/stores/commentStore.ts` | One store: load, page, post, edit, delete, report. |
| `apps/web/src/components/comments/CommentsSection.tsx` | One section, three surfaces. |
| `apps/web/src/components/comments/CommentComposer.tsx` | One composer, used for both posting and editing. |
| `apps/web/src/types/reactions.ts` | The scale, the weights, **and now `sideOf` + `SIDE_LABEL`** — the one place a pick becomes a category. |

Nothing else imports a collection name and nothing else maps an emoji to a
category. The same rule that has kept the scale from forking between the public
bar and the staff dashboard.

## 6. The gates

- **Commentable = reactable = readable.** The visibility check is
  `assertReactable()` from `lib/reactions.ts`, called **unchanged** — not a copy
  of its rules, the function itself. A draft, a pulled edition and a paywalled
  piece a free reader cannot see all refuse a comment for the same reason and with
  the same status code.
- **The page must not offer what the server will refuse.** Each of the three pages
  renders the section behind exactly the condition it already used for the
  reaction bar (`canReact` / `!locked && isLive(article)` /
  `!issue.unpublishedAt`). This was a real defect in reactions once — a draft story
  rendered a scale that answered every click with `Not found` — and the fix is not
  re-derived here, it is the same boolean.
- **`comments.moderate`** is the only new permission, and there is only one. Leaving
  a comment needs no permission at all; an author editing or deleting their own is
  ownership, not a grant. The single grantable power is acting on *other people's*
  comments, which is one editorial job. Seeded to `editor` and (by derivation)
  `administrator`; **not** to `contributor`.
- **Rate limited** at 20 writes/minute per account — tighter than reactions' 60,
  because a reaction is a tap someone legitimately changes their mind about and a
  comment is a paragraph they typed.
- **Length is enforced server-side** (2–2000 chars), not only by the textarea's
  `maxLength`. A client-side limit is a courtesy; the endpoint is reachable
  without the form.
- **Bodies render as text, never as markup.** React escapes them, which is what
  keeps a comment field from being an injection point on a public page.

## 7. The endpoints

```
GET    /api/comments?targetType=blog&targetId=X&limit=20&before=<iso>   public
POST   /api/comments/:targetType/:targetId   { body, emoji }            auth
PATCH  /api/comments/:id                     { body, emoji }            auth, author, in-window
DELETE /api/comments/:id                                                auth, author OR moderator
POST   /api/comments/:id/report              { reason? }                auth
GET    /api/comments/moderation?filter=reported|hidden|all              comments.moderate
POST   /api/comments/:id/hide                { reason }                 comments.moderate
POST   /api/comments/:id/restore                                        comments.moderate
```

`GET` returns counts and `mine` / `reportedByMe` for a signed-in caller — one
request, so a thread does not cost a second round trip to find out which comments
are yours. The moderation `GET` returns the queue **and both header counts**
together, because the screen draws all three at once and three requests to render
one page is three chances for it to half-load.

The literal `/moderation`, `/:id/hide`, `/:id/restore` and `/:id/report` routes are
registered **before** the parameterised ones. Express matches in registration
order, so a literal path declared after a same-shape parameter never runs.

## 8. Storage

```
comments
  _id
  targetType   'blog' | 'story' | 'bulletin'      ← NOT blogPart; see below
  targetId
  userId
  authorNameAtPost   FALLBACK ONLY — read when the account is gone
  body
  emoji        the scale key. The category is derived from it, never stored
  isStaff      stamped from the ACCOUNT at write time, never the client
  status       'visible' | 'hidden'
  hiddenBy / hiddenAt / hiddenReason
  reportCount  recounted from the rows, never $inc'd
  editedAt?
  createdAt / updatedAt / deletedAt

commentReports
  _id, commentId, userId, reason, createdAt, deletedAt
```

### No `blogPart`

A part gets its own **reaction bar** because rating a section takes one tap and
says something the post-level score cannot. A comment **thread** per part is a
different proposition: eight threads on one post splits the discussion into eight
rooms with nobody in them, and makes the reader who wants to talk about the piece
choose where. `COMMENT_TARGET_TYPES` has no `blogPart`, so this is enforced rather
than a habit.

### Comments use soft delete; reactions do not

`lib/reactions.ts` goes through `rawCollection()` and hard-deletes, because its
unique index has no partial filter and a tombstone would block the reader's next
pick. Comments have no such constraint and go through the normal `db.collection()`
wrapper: what somebody wrote is worth keeping recoverable, and a moderation
decision that turns out to be wrong should be reversible by someone with database
access even after the row leaves every read. A reaction is one field re-entered in
one click; a comment is not.

### The author's name is resolved, not denormalised

Only `userId` is stored. Display names are resolved on read in one batched pass
over the distinct authors on the page. A snapshot copied onto every row is the
drift `resolveAccount` exists to avoid — a reader who corrects their name would
keep the old one on every comment they had ever left. `authorNameAtPost` is
written as a fallback and read **only** when the account itself has gone, because
a comment must still be attributable to something and "Anonymous" on a
signed-in-only system would be a lie about how it was written.

### Indexes

```
comments        { targetType, targetId, deletedAt, createdAt: -1 }   the thread read
comments        { deletedAt, status, reportCount: -1 }               the moderation queue
comments        { deletedAt, createdAt: -1 }                         "everything, newest first"
commentReports  { commentId, userId }  UNIQUE, partial on deletedAt: null
commentReports  { commentId, deletedAt } / { userId, deletedAt }
```

The unique index **is** the one-report-per-reader rule, exactly as the reactions
unique index is the one-reaction-per-reader rule. Without it, `reportCount` stops
being a count of people and the number a moderator triages on quietly stops
meaning what it says. It is **partial** on `deletedAt: null` (unlike reactions'
plain unique index) because reports go through the soft-delete wrapper.

## 9. Pagination

Newest first, cursor on `createdAt`, **not `$skip`**. A comment posted while
someone is reading page 1 shifts every offset by one, so an offset-paged thread
shows one comment twice and hides another. The cursor is an instant, so it does
not move. The store dedupes on id anyway, because a comment *deleted* between two
requests shifts the window the other way.

`total` is counted separately and is the whole thread — the items are one page of
it, and `items.length` is not an answer to "how many comments are there".

## 10. Decisions — settled

**D1 — Live immediately, with report-and-hide.** A comment appears the moment it
posts. Any reader can Report one; a moderator can hide it (leaving a tombstone),
restore it, or delete it outright. Pre-moderation was rejected: a section that
tells the person who just wrote something that an editor will look at it eventually
is a section that looks dead, and it only works if someone works the queue daily.

**D2 — Nothing is ever auto-hidden, at any number of reports.** A threshold that
removes a comment on its own is a brigade's delete button. Reporting asks for a
decision; a person makes it.

**D3 — A hidden comment leaves a tombstone.** "A comment by X was removed by an
editor." The alternatives are both worse: deleting it makes a thread other people
were reading change shape with no explanation, and leaving the text up makes
hiding it pointless. The **reason** is recorded for the moderation screen and is
never shown publicly — publishing it would make every removal an argument inside
the thread it was removed from.

**D4 — Edits are allowed for 15 minutes, and marked.** A reply, a reaction or a
quote elsewhere can be built on what a comment said, and silently rewriting it
hours later changes a conversation other people have already had. The window
covers the typo and the sentence that came out wrong. Every edit stamps `editedAt`
and the UI says "edited", so nothing changes invisibly even inside the window.
**The Edit control is only rendered inside the window** — a button that answers
"the edit window has closed" is a control that lies about what it does.

**D5 — Posting is not optimistic; reporting is.** A reaction tile lighting up and
rolling back costs nothing. A comment that appears and then vanishes because the
server refused it leaves a reader unable to tell whether their words were
published — so the form stays filled and disabled for one round trip instead.
Reporting *is* optimistic, because the only visible change is the reader's own
control saying "Reported" and the server is idempotent.

**D6 — Deleting a comment keeps the reaction.** The reader said how the piece sat
with them; withdrawing the words is not withdrawing the verdict, and the bar still
shows their pick where they can take it back themselves.

**D7 — Comments add no figure to Emoji Analytics.** Every comment already wrote a
reaction, so it is inside those numbers once. Counting comments there as well
would count one opinion twice. The two copy claims on that screen that said "no
comments exist anywhere in the platform" have been corrected — they were true when
written and are not now.

## 11. What is NOT verified

Honest ledger, in the shape `docs/REACTIONS-PLAN.md` §11 set:

| | |
|---|---|
| `tsc --noEmit`, server | ✅ clean |
| `tsc --noEmit`, web | ✅ clean |
| `npm run check:permissions` | ✅ 0 unenforced; `comments.moderate` reported as a *module gate* only because that script reads **tracked** files via `git grep` and `routes/comments.ts` is not yet committed. It **is** server-enforced. |
| Every endpoint over HTTP against a real MongoDB | ❌ **not done** |
| Any of it in a browser | ❌ **not done** |

Reactions were verified by running the server and exercising every rule over HTTP,
and that found three real defects (`$limit: 0`, the un-awaited Express handler, an
ignored query flag). **This feature has not had that pass**, and the same class of
bug is entirely possible here. The list worth running:

- anonymous `GET` on an empty thread → 200, `items: []`, `total: 0`
- post, then edit inside the window, then edit again after 15 minutes → 200, 200, 403
- post → confirm a `reactions` row now exists for that reader on that target
- change the emoji on an edit → confirm the reaction row moved, `total` unchanged
- comment on a **draft** post → 404; on a **premium** post as a free reader → 403
- comment on a **pulled** edition → 404
- `blogPart` as a target type → 400 (it is not in `COMMENT_TARGET_TYPES`)
- 2001 characters → 400; whitespace only → 400
- report twice → 200 both times, `reportCount` stays 1
- report your own comment → 400
- hide with no reason → 400; hide → thread shows the tombstone and an empty body
- hide, then `GET` the thread as a moderator → body present; as a reader → empty
- delete someone else's comment without `comments.moderate` → 403
- `GET /moderation` anonymous → 401; as a reader → 403; as an editor → the queue
- 21 writes in a minute → 429
- indexes after boot: all six present, `unique: true` on `commentReports`

## 12. Deploy steps

This adds a **module** and a **permission**, so it needs the four-registration
dance plus a grant (see the `adding-a-production-system-module` note):

1. `SIDE_NAV` row — `apps/web/src/pages/newsroom/constants.tsx` ✅
2. Route — `apps/web/src/App.tsx` (`/production-system/comments`) ✅
3. `MODULE_CATALOGUE` row — `apps/server/src/lib/permissionCatalogue.ts` ✅
4. **Restart the API.** `roleRegistry` filters each role's stored modules against
   the catalogue compiled into the *running* process, so a server started before
   step 3 silently strips `comment-moderation` out of every role on every request
   — the DB row has it, the session payload does not, the sidebar row never
   appears, and nothing says why.
5. `npx tsx scripts/grant-comments-module.ts` (dry run), then `--apply`.
   `seedRoles()` is insert-only, so roles written before this feature have neither
   the permission nor the module. The script grants both, and **only** to roles
   already holding `content.publish` — the power to put words in front of the
   public is the honest prerequisite for deciding which of the public's words stay
   up. Superadmin needs only the restart.
6. Hard-reload the browser (the web session is zustand-persisted and revalidates
   via `/api/auth/me`).

## 13. Deliberately not built

Asked about and declined for this cut, so it is a decision and not an oversight:

- **Threaded replies.** Flat thread, newest first.
- **Staff badge on public comments** and **pin to top**. `isStaff` is stored and
  the moderation screen shows it; the public thread does not.
- **Sentiment filter chips, sort control, and a "61% positive" summary strip.**
  The per-comment category chip is there; filtering by it is not.

All three are additive to this data model and none of them needs a migration.
