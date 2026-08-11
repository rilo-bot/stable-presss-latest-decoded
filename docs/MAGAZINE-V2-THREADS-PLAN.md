# Magazine v2 — chat threads and history management

**Status: PLANNED.** Nothing built.
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
  magazineId, userId          the creator — and the only reader
  title                       auto-derived from the first message, editable
  startedOnPageId/Index       a hint about where it began, NOT a constraint
  lastMessageAt, messageCount denormalised for the list, no per-thread count query
  archivedAt, deletedAt       soft
  createdAt, updatedAt

magazineChatV2  EXISTING, gains
  threadId                    the key change
  userId                      who wrote it
```

Three deliberate decisions:

**Threads are private.** The owner does not read a collaborator's AI chat, and vice versa. This is the point of the change, but it is also the right *separation*: an AI chat is a working scratchpad, and the shared channel for editorial conversation is the submissions flow's `reviewNote` — feedback that needs to be seen belongs to a review, not buried in someone's chat log. Access follows the repo convention: a thread you do not own **404s**, it does not 403.

**Threads may span pages; each turn records its own page.** The agent is per-page, but a train of thought is not ("keep the voice we used on page 2"). What made T-c a bug was *other people's* and *unrelated* turns, not your own continuity. So a thread crosses pages, and the prompt **labels each turn with its page** — `[p4] make the headline bigger` — so the model knows what "it" referred to two turns ago.

**Only that thread's history is sent.** This is the actual M3 fix: the request carries `threadId`, and the server assembles history from that thread alone, still capped at 30 × 4,000.

### 2.1 Legacy history

Existing messages have no `userId`, so they **cannot be attributed** — the data was never captured, and guessing would be worse than admitting it. Migration: per magazine, move all existing messages into one thread titled **"Earlier conversation"**, owned by the magazine owner, flagged `legacy: true` and rendered **read-only** with a one-line explanation. Non-destructive, honest, and it stops the flat log from being the default surface.

---

## 3. Endpoints

Reusing the `before`-cursor pagination pattern that `GET /issues/:id/chat` already established.

| Endpoint | Effect |
|---|---|
| `GET /issues/:id/threads` | **My** threads, newest activity first: id, title, page hint, `messageCount`, `lastMessageAt`, archived. Plus the legacy thread for the owner. |
| `POST /issues/:id/threads` | Create. Optional `title`, optional `startedOnPageId`. Returns the thread. |
| `PATCH /issues/:id/threads/:threadId` | Rename, or archive/unarchive. Creator only. |
| `DELETE /issues/:id/threads/:threadId` | Soft-delete the thread **and its messages**. Creator only. |
| `GET /issues/:id/threads/:threadId/messages` | Paginated, `before` cursor, oldest→newest. Creator only. |
| `POST …/pages/:pageId/agent` | **Changed:** takes `threadId`. Persists both turns into it, and sends only its history. A missing/foreign `threadId` creates a fresh thread rather than erroring — degrade, never fail. |
| `GET /issues/:id/chat` | **Kept, deprecated.** Returns the legacy thread only, so nothing breaks mid-deploy. Remove once the web client ships. |

Indexes to add in `ensureIndexes.ts`:
- `magazineThreadsV2`: `{ magazineId: 1, userId: 1, deletedAt: 1, lastMessageAt: -1 }`
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

Opening the switcher:

```
┌──────────────────────────────────────┐
│ + New thread                          │
├──────────────────────────────────────┤
│ ● Cover headline options    p1 · 2m   │
│   Stat page rewrite         p5 · 1h   │
│   Photo choices             p3 · yest │
├──────────────────────────────────────┤
│   Earlier conversation   read-only    │  ← the migrated legacy log
├──────────────────────────────────────┤
│   Archived (2)                      ▸ │
└──────────────────────────────────────┘
```

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
| **T1** | `magazineThreadsV2` + `threadId`/`userId` on messages + the legacy-migration script + indexes. No behaviour change; `GET /chat` still works. |
| **T2** | Thread CRUD endpoints; the agent route takes `threadId` and sends only that thread's history. **M3 is fixed here.** Page-tagged turns in the prompt. |
| **T3** | The panel: switcher, `+ New`, auto-title, page tags, thread-scoped proposal discard. |
| **T4** | Archive / rename / delete, the archived section, the read-only legacy thread, and the soft-delete TTL. |

T1 and T2 are server-only and shippable before any UI — with `GET /chat` kept, the existing panel keeps working throughout.

---

## 7. Open

1. **Should the owner be able to read collaborators' threads?** Recommend **no** — a scratchpad people expect to be private, with the review note as the deliberate shared channel. Easy to add later; hard to take back once people have written in it assuming privacy.
2. **Should a thread be shareable on purpose** ("show this conversation to the owner")? A natural follow-up, but not v1 — and it needs the answer to (1) first.
3. **Cap on threads per user per magazine?** Recommend none, with archive as the pressure valve. Revisit if the list gets unusable.
4. **Do attachments follow the thread?** Uploads currently live in the magazine-wide media/Uploads library and are reachable by anyone with access. Recommend leaving that alone — a *file* added to the magazine is a shared asset even if the conversation about it is private. Worth confirming this is the intent, since it is the one place privacy is deliberately not carried through.
