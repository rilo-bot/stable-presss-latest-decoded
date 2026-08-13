# Magazine v2 — chat threads and history management

**Status: ✅ BUILT 2026-08-12** on `day-work`. T1–T3 in full, T4 partially — see the deviations below.
127 tests pass; server + web typecheck and build clean. Never opened in a browser.

**Three deliberate deviations from this plan:**

1. **`GET /issues/:id/chat` was REMOVED, not kept as a deprecated alias** (§3 said keep it). It returned
   every message in the magazine to anyone with access — the leak this document exists to close — and a
   deprecated endpoint that still leaks is one nobody ever gets round to deleting. The client ships in
   the same deploy.
2. **No archive, and no TTL on soft-deleted threads** (§5). Delete is the pressure valve. Both were
   dropped on instruction — *"no need any advance kind of thing"* — and neither is load-bearing for the
   flow. Soft-deleted threads and messages simply persist; add the TTL when retention matters.
3. **Page tags are applied to prompt history unconditionally** when a turn comes from a different page,
   rather than only when the thread is known to span pages. Cheaper to reason about, and the label costs
   the model nothing.

Everything else is as designed, including the access pair, the synthesised legacy thread, the grouped
owner view, and the disclosure line in the panel.

---
**Date:** 2026-08-11 · **Branch:** `feature/blogs`
**Companion to:** `docs/MAGAZINE-V2-SUBMISSIONS-PLAN.md` (independent — either can go first, though T2 pairs naturally with S3).
**Also fixes:** **M3** in `docs/MAGAZINE-V2-REVIEW-2026-08-11.md` (a per-magazine chat sent to a per-page agent), which this supersedes.

---

## 1. What is wrong today

One collection, `magazineChatV2`, with one shape:

```
{ magazineId, pageId, pageIndex, role: 'user'|'assistant', content, attachments?, createdAt }
```

and `GET /issues/:id/chat` returns the newest 50 for the **whole magazine**, oldest→newest, with a `before` cursor.

Three problems, all verified in code:

| # | Problem | Consequence |
|---|---|---|
| **T-a** | **No `userId` on a message. At all.** | There is no such thing as "my chat". Every collaborator reads the owner's conversation and each other's — which is what prompted this. It also means **existing history cannot be attributed retroactively**; the information was never recorded. |
| **T-b** | **No thread concept.** One flat per-magazine log. | You cannot start a fresh conversation, park one, or return to one. Every turn lands in the same undifferentiated stream, forever. |
| **T-c** | **The whole stream is re-sent to a per-page agent.** `store.ts` posts `[...s.chat, newTurn]`; the server caps it at 30 messages × 4,000 chars. | Turns about page 7 — *written by someone else* — enter the prompt when you ask about page 2. This is review finding M3. |

And one operational fact: the chat collection has exactly **one index** (`{magazineId, deletedAt, createdAt}`) and **no TTL**. Unlike `magazineJobs`, which deliberately stamps a BSON `expiresAt` on terminal jobs, chat grows forever.

---

## 2. The model

**A thread is an explicit document, private to the person who created it.**

```
magazineThreadsV2  NEW
  magazineId
  userId                      the creator — the only writer
  userName                    denormalised, so the owner's grouped list needs no join
                              (mirrors `ownerName` on magazinesV2)
  title                       auto-derived from the first message, editable
  startedOnPageId/Index       a hint about where it began, NOT a constraint
  lastMessageAt, messageCount denormalised for the list, no per-thread count query
  legacy                      true only for the migrated flat log
  archivedAt, deletedAt       soft
  createdAt, updatedAt

magazineChatV2  EXISTING, gains
  threadId                    the key change
  userId                      who wrote it
```

**Access, in one place:**

| Action | Who |
|---|---|
| read a thread + its messages | its creator, **or the magazine owner** |
| send a turn into it | its **creator only** |
| rename / archive / delete | its **creator only** |
| anything else | 404 |

Three deliberate decisions:

**Threads are per user, and the OWNER can read all of them.** A collaborator sees only their own; the magazine owner sees everyone's. Anyone else's thread **404s** (repo convention — never reveal existence with a 403).

The upside of this is real: an owner approving page 4 can read what the contributor was actually trying to do, which is review context that the submissions flow's `reviewNote` alone does not carry. Two consequences follow, and both are load-bearing:

- **The owner reads; only the creator writes.** The owner must not send a turn into someone else's thread. The agent is a 1:1 assistant with no notion of multiple participants — a second voice mid-thread would land in the creator's next prompt, and staged proposals are applied by whoever is looking at them under *their* page permissions. So: read-only for the owner, and the composer is disabled with the reason shown. Rename, archive and delete stay with the creator.
- **The collaborator must be told.** A scratchpad someone *believes* is private but is not is worse than one that is openly visible. The panel carries a permanent one-line disclosure — *"the magazine owner can see your threads"* — not buried in a tooltip. This is the cost of the decision and it is paid honestly rather than hidden.

Editorial feedback that needs to be *acted on* still belongs in the submissions flow's `reviewNote`, not in a chat log the owner happens to read. Reading a thread is context; a review note is an instruction.

**Threads may span pages; each turn records its own page.** The agent is per-page, but a train of thought is not ("keep the voice we used on page 2"). What made T-c a bug was *other people's* and *unrelated* turns, not your own continuity. So a thread crosses pages, and the prompt **labels each turn with its page** — `[p4] make the headline bigger` — so the model knows what "it" referred to two turns ago.

**Only that thread's history is sent.** This is the actual M3 fix: the request carries `threadId`, and the server assembles history from that thread alone, still capped at 30 × 4,000.

### 2.1 Legacy history — a synthesised thread, not a migration

Existing messages have no `userId`, so they **cannot be attributed** — the data was never captured, and guessing would be worse than admitting it.

**No migration script** (same decision as the submissions plan §6.4). Messages with **no `threadId`** are served as a *virtual* thread: the threads list synthesises one row per magazine titled **"Earlier conversation"**, visible to the owner, flagged `legacy: true` and **read-only**, and `GET …/threads/legacy/messages` queries `{ magazineId, threadId: null }`. Zero database writes, and the flat log stops being the default surface.

Read-only is not just a UI state here — there is genuinely nothing sensible to append to a conversation whose participants are unknown. The composer explains that in one line.

---

## 3. Endpoints

Reusing the `before`-cursor pagination pattern that `GET /issues/:id/chat` already established.

| Endpoint | Effect |
|---|---|
| `GET /issues/:id/threads` | A collaborator gets **their own**; the **owner gets everyone's**, each row carrying `userId` + `userName` so the UI can group by person. Newest activity first: id, title, page hint, `messageCount`, `lastMessageAt`, archived, `mine: boolean`. |
| `POST /issues/:id/threads` | Create, always owned by the caller. Optional `title`, optional `startedOnPageId`. |
| `PATCH /issues/:id/threads/:threadId` | Rename, archive/unarchive. **Creator only** — the owner reading a thread cannot retitle or bury it. |
| `DELETE /issues/:id/threads/:threadId` | Soft-delete the thread **and its messages**. Creator only. |
| `GET /issues/:id/threads/:threadId/messages` | Paginated, `before` cursor, oldest→newest. Creator **or owner**. |
| `POST …/pages/:pageId/agent` | **Changed:** takes `threadId`. Persists both turns into it and sends only its history. **Rejects a thread the caller did not create**, even for the owner — reading is not writing. A missing `threadId` creates a fresh thread rather than erroring (degrade, never fail). |
| `GET /issues/:id/chat` | **Kept, deprecated.** Returns the legacy thread only, so nothing breaks mid-deploy. Remove once the web client ships. |

Indexes to add in `ensureIndexes.ts`:
- `magazineThreadsV2`: `{ magazineId: 1, userId: 1, deletedAt: 1, lastMessageAt: -1 }` — serves a collaborator's own list.
- `magazineThreadsV2`: `{ magazineId: 1, deletedAt: 1, lastMessageAt: -1 }` — serves the owner's all-threads list without scanning.
- `magazineChatV2`: `{ threadId: 1, deletedAt: 1, createdAt: 1 }` — the new hot path, alongside the existing magazine index.

**The dangling-tool-call rule still applies.** A client tool that never returns a result permanently bricks a conversation; all five agent routes repair history server-side, and thread history must go through the same repair. Threads make this *better*, not worse: a bricked conversation is now something the user can abandon in one click instead of a dead magazine chat.

---

## 4. UI

The AI panel is docked left with two tabs, **Chat** and **Uploads(n)**. Add a thread header above the transcript — not a third tab, because a thread list is navigation for the Chat tab, not a peer of it.

```
┌─ AI ─────────────────────────────────┐
│ Chat │ Uploads(2)                     │
├──────────────────────────────────────┤
│ ▾ Cover headline options      + New  │  ← thread switcher + one-click new
├──────────────────────────────────────┤
│                                       │
│   assistant bubbles                   │
│   [p1] user turn                      │  ← page tag when the thread spans pages
│                                       │
│   ▸ Review & apply (3)                │
│     ✓ Apply all   ✕ Discard           │
├──────────────────────────────────────┤
│ 📎  [ask about this page…]      🎤 ➤ │
└──────────────────────────────────────┘
```

Opening the switcher — **a collaborator** sees only their own:

```
┌──────────────────────────────────────┐
│ + New thread                          │
├──────────────────────────────────────┤
│ ● Cover headline options    p1 · 2m   │
│   Stat page rewrite         p5 · 1h   │
│   Photo choices             p3 · yest │
├──────────────────────────────────────┤
│   Archived (2)                      ▸ │
├──────────────────────────────────────┤
│ ⓘ The magazine owner can see your     │  ← permanent, not a tooltip
│   threads.                            │
└──────────────────────────────────────┘
```

**The owner** sees everyone's, grouped by person — flat would be a soup:

```
┌──────────────────────────────────────┐
│ + New thread                          │
├──────────────────────────────────────┤
│ MINE                                  │
│ ● Cover headline options    p1 · 2m   │
│   Contents rewrite          p2 · 3h   │
├──────────────────────────────────────┤
│ SAM PATEL                     3 pages │
│   Feature deck options      p4 · 20m  │
│   Photo choices             p5 · 1h   │
├──────────────────────────────────────┤
│ PRIYA R                       2 pages │
│   Gallery captions          p6 · yest │
├──────────────────────────────────────┤
│   Earlier conversation   read-only    │  ← the migrated legacy log
├──────────────────────────────────────┤
│   Archived (4)                      ▸ │
└──────────────────────────────────────┘
```

Reading someone else's thread swaps the composer for a clear read-only state:

```
├──────────────────────────────────────┤
│ 👁 Viewing Sam's thread — read-only.   │
│    Leave feedback on the page instead. │  ← links to request-changes
└──────────────────────────────────────┘
```

That last line is deliberate: it points the owner at the channel that actually *does* something (the submissions flow's review note) rather than letting them type into a conversation the contributor owns.

Details that matter:

- **`+ New` is one click**, and the new thread starts on the current page. No dialog, no "name your thread" prompt — the title comes from the first message.
- **Auto-title from the first user message** (first ~60 chars, tidied), editable inline. Do **not** spend a model call naming threads.
- **Page tags appear only when a thread actually spans pages.** A single-page thread showing `[p4]` on every line is noise.
- **Switching pages does not switch threads.** The active thread persists; the composer's placeholder reflects the current page. Auto-switching would silently move where a user's words land, which is the same class of mistake as the scroll handler yanking focus mid-edit — the studio already avoids that deliberately.
- **Proposals stay page-scoped.** `proposalsPageId` already guards apply; a staged tray must also be discarded when switching threads, since proposals belong to a turn, not a magazine.
- **Archive, rename and delete** live in the switcher's row menu. Delete asks once and says how many messages go with it.
- Auto-scroll on new turns, but **not** when older history is prepended — the existing rule, kept.

---

## 5. History management

- **Archive** — hides a thread from the default list, keeps it. The everyday tidy-up.
- **Delete** — soft-deletes the thread and its messages, so `find()`'s implicit `deletedAt: null` filter hides both.
- **Retention** — chat has no TTL today and grows forever. Recommend a TTL on **soft-deleted** threads and their messages (e.g. 30 days, using a real BSON `expiresAt` — Mongo's TTL monitor ignores ISO strings, the trap already documented for `magazineJobs`). Live threads are not auto-reaped; a magazine's working history is worth keeping.

---

## 6. Build order

| Phase | Scope |
|---|---|
| **T1** | `magazineThreadsV2` + `threadId`/`userId` written on new messages + the synthesised legacy thread (§2.1) + indexes. **No migration.** No behaviour change; `GET /chat` still works. |
| **T2** | Thread CRUD endpoints; the agent route takes `threadId` and sends only that thread's history. **M3 is fixed here.** Page-tagged turns in the prompt. |
| **T3** | The panel: switcher, `+ New`, auto-title, page tags, thread-scoped proposal discard. |
| **T4** | Archive / rename / delete, the archived section, the read-only legacy thread, and the soft-delete TTL. |

T1 and T2 are server-only and shippable before any UI — with `GET /chat` kept, the existing panel keeps working throughout.

---

## 7. Decided

- **Store `userId`** on threads and on every message, from T1.
- **Per-user threads. The owner reads everyone's; everyone else reads only their own.**
- **Reading is not writing** — only a thread's creator can send a turn into it, rename it, archive it or delete it. Enforced on the agent route, not just hidden in the UI.
- **Collaborators are told**, permanently and in the panel, that the owner can see their threads.

## 8. Still open

1. **Cap on threads per user per magazine?** Recommend none, with archive as the pressure valve. Revisit if the list gets unusable.
2. **Do attachments follow the thread?** Uploads currently live in the magazine-wide media/Uploads library, reachable by anyone with access. Recommend leaving that alone — a *file* added to the magazine is a shared asset even if the conversation about it is private. Worth confirming, since it is the one place the privacy model deliberately does not carry through.
3. **Should the owner's own threads be visible to collaborators?** By the rule above, no — "owner sees all" is one-directional. Confirm that is the intent, since it is the asymmetry someone will eventually ask about.
