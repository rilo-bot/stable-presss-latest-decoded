# Blog AI Studio — Implementation Plan

**Date:** 2026-08-03 · **Branch:** `feature/blogs` · **Status: BUILT** — all four phases, signed off as
recommended (two modes, confirm cards, the anchoring rule). See §10 for what shipped and how it was verified.

This is `BLOG-SYSTEM-PLAN.md` **P6 — AI**, which that document deferred as "separate plan". Nothing here
contradicts it; §6's one architectural claim — *"the block model IS the AI interface … an agent emits a
`Block[]`"* — turns out to need one amendment, explained in §2.

---

## 1. What was asked for

> "add here one blog ai studio just how we have for the story, very easy with the all blogs access, crud
> and all, draft publish"

Three requirements, and the first two pull against each other:

1. **"just how we have for the story"** — the Story Studio is a right-side drawer that holds a natural
   type-or-speak conversation, writes one thing, files it as a draft and opens it. It is **create-only**.
2. **"all blogs access, crud and all, draft publish"** — list every post, open any of them, edit, publish,
   unpublish, delete. That is a **desk**, not a create-flow.
3. **"very easy"** — no new concepts for the user to learn.

The Article Studio (`agent/article/`) is the other half of the pattern: a drawer *inside* an editor that
mutates the open record. Neither existing studio does what was asked on its own.

---

## 2. The one thing that changes the shape of this plan

**The prose → blocks seam already exists, is battle-tested, and takes the opposite approach to the one
`BLOG-SYSTEM-PLAN` §6 predicted.**

Instant Capture already writes Blog drafts, and `apps/web/src/pages/instant/buildBlocks.ts` says why:

> *"This is the deliberate seam in the design: the agent never emits `Block[]`. It returns a flat list of
> typed body items (paragraph / heading / list / quote), and the blocks are assembled HERE, in code, through
> the same `@/blog/factories` the composer's own toolbar uses … there is no model output path into the block
> model at all."*

That is the right call and this plan adopts it wholesale rather than re-deriving it. Handing an LLM the real
block model means asking it to mint UUIDs and `placement` objects correctly on every call — and
`normaliseBlocks` **silently drops** anything malformed (it returns a `droppedBlocks` count, which the client
shows as "3 blocks could not be saved"). Content vanishing on save is the worst possible failure mode for a
writing tool.

**Already built and reused as-is:**

| Asset | What it does |
|---|---|
| `pages/instant/types.ts` → `BodyItem` | The flat intermediate form: paragraph / heading / list / quote |
| `lib/agent/instantDraft.ts` → `cleanBody()` | Normaliser with hard-won rules: one-bullet lists demote to paragraphs, a leading heading is dropped, item/point ceilings |
| `pages/instant/buildBlocks.ts` → `buildBlogPayload()` | `BodyItem[]` + photos → `{ blocks, media, cover }` via `@/blog/factories`, with predictable photo placement |
| `lib/agent/instantPrompt.ts` → `BodyItemSchema` | The zod shape, including the note about the provider rejecting `maxItems` |

**The one genuinely new piece of logic** is the inverse direction, which does not exist yet: reading an
existing post's body *back* into `BodyItem[]` so the assistant can revise a post rather than only write new
ones. That is §5.

Net effect: this is a smaller, lower-risk job than it looks — roughly **1,200 lines across 12 files**, most
of it adaptation of two existing studios.

---

## 3. Shape — one drawer, two modes

Rather than two near-identical drawers that drift apart (the exact failure `CRM-UX-CONSOLIDATION` records),
**one panel, and where you opened it decides what it is scoped to:**

| Opened from | Mode | What the assistant can do |
|---|---|---|
| `BlogsScreen` (the list) | **desk** | List/search all posts, open one, write a new one, publish, unpublish, delete |
| `BlogEditorScreen` (a post open) | **post** | Everything above, but pre-focused on *this* post — "tighten the third section", "give it a better standfirst" |

Same component, same transport, same prompt file with a `mode` flag. The user learns one thing.

---

## 4. Server work

### 4.1 `routes/agentBlog.ts` — ~55 lines

A direct clone of `routes/agentStory.ts`: `POST /api/agent/blog/chat`, `attachAccountOptional`,
`isAgentConfigured()` 503 guard, `messages[]` required, the 100-message cap, `pipeUIMessageStreamToResponse`
with the same `onError`.

One deliberate difference: `stopWhen: stepCountIs(16)` rather than 12. A CRUD conversation ("list them →
open that one → rewrite the middle → publish it") legitimately takes more tool steps than "write one story
and file it", and hitting the cap mid-flow reads to the user as the assistant losing interest.

### 4.2 `lib/agent/blogPrompt.ts` — ~190 lines

`buildBlogSystemPrompt(account, ctx)`, mirroring `storyPrompt.ts` including the LANGUAGE rule, the
one-question-at-a-time rule, the no-buttons rule and the prompt-injection line.

`BlogContext` (the client mirror, sent each turn):

```ts
interface BlogContext {
  displayName?: string
  role?: string
  mode: 'desk' | 'post'
  postId?: string
  postTitle?: string
  postStatus?: 'draft' | 'published'
}
```

**The capability lines are derived server-side from `accountCan(account, 'blog.*')`, never from `ctx`** — the
same rule `storyPrompt.ts` states for `ctx.role`. A client that lies about its permissions changes the
prompt's *tone* and nothing else, because §4.3 makes every write go through the RBAC gate anyway.

The write flow for a new post mirrors the Story Studio's ordered steps: draft the piece → confirm →
standfirst → cover photo (📎) → access tier → category → tags → file as draft. Publishing is **never**
automatic; it is always a separate explicit ask.

### 4.3 `lib/agent/blogTools.ts` — ~150 lines

**Every tool is client-executed — declared without `execute`.** This is not a style choice: it is the reason
the model cannot bypass permissions. The browser runs each tool through `useBlogStore`, which calls the
`blogsWriteGate`-protected REST endpoints, so `blog.create` / `edit_own` / `edit_any` / `publish` / `delete`
are all still enforced by the server that owns them. `articleTools.ts` documents this same rationale.

| Tool | Input | Notes |
|---|---|---|
| `listBlogPosts` | `{ status?, q? }` | Rows: id, title, slug, status, category, updatedAt. Also renders an on-screen read-only list, exactly as `listHorses` does for stories |
| `openBlogPost` | `{ id }` | Full fields **plus `body` as `BodyItem[]`** (see §5) so the model can read the copy before revising |
| `createBlogDraft` | `{ title, subtitle?, excerpt?, body: BodyItem[], category?, tags?, minTier }` | Always files as `draft` |
| `updateBlogPost` | `{ id, title?, subtitle?, excerpt?, category?, tags?, minTier? }` | Metadata only — deliberately separate from the body |
| `replaceBlogBody` | `{ id, body: BodyItem[] }` | The destructive one, kept on its own so it is never a side effect of a metadata edit |
| `setBlogPublished` | `{ id, published }` | Goes through `POST /:id/publish`, so the title/content gate and the "`publishedAt` is never rewritten" rule still hold |
| `deleteBlogPost` | `{ id }` | Soft delete. Gated behind a human confirm — §6 |
| `suggestBlogImages` | `{ query? }` | Reuses whatever `suggestImageOptions` already uses for articles. Never invents URLs |

`BodyItemSchema` is imported from `instantPrompt.ts` rather than restated, so the two agents cannot drift.

### 4.4 `lib/agent/capabilities.ts` — ~12 lines added

**Blogs are currently absent from `summariseCapabilities` entirely** — grep for `blog` in that file returns
nothing. So today the general Stablehand agent does not know the Blogs module exists. Add the `blog.*` lines
to the staff branch alongside the `content.draft.*` ones.

### 4.5 Wiring — ~4 lines

- Mount in `index.ts` beside the other agent routers (uses the existing `jsonAgent` 30 MB parser, since the
  `/api/agent` prefix already skips the global 2 MB cap).
- Add `'blog-studio'` to the `navigateTo` enum + description in `lib/agent/tools.ts`, so Stablehand can send
  a staff member there the way it already does for `story-studio`.

**No permission-catalogue change.** All five `blog.*` ids already exist and are already enforced, so
`npm run check:permissions` and `npm run sync:roles` stay green and **no API restart is needed** — this adds
no Production System module.

---

## 5. `lib/blog/bodyItems.ts` — the new logic, ~110 lines

This is the only part that is not adaptation, and the only part that needs real care.

### 5.1 `blocksToBodyItems(blocks)` — reading a post back

Maps the text-family blocks onto `BodyItem`: `paragraph`/`callout` → paragraph, `heading` → heading (level 4
folded to 3, since `BodyItem` only has 2|3), `list` → list, `quote` → quote. Inline HTML is reduced to plain
text with the existing `blogPlainText` helper, because `BodyItem` carries text and `buildBlocks` re-escapes
on the way back.

Deliberately **lossy for `image` / `gallery` / `embed` / `horseCard` / `partyCard` / `articleRef` / `code`**.
`BodyItem` has no shape for them and inventing one would fork the format Instant Capture already uses.

### 5.2 `spliceBodyItems(currentBlocks, nextItems)` — writing it back without losing photographs

The problem: if `replaceBlogBody` simply rebuilt the body from `BodyItem[]`, every image, gallery and horse
card in the post would be **deleted** by an AI copy-edit. Unacceptable.

The rule, stated plainly so it can be checked against behaviour:

> A non-text block keeps its position **measured in text blocks from the top**. If the rewrite is shorter
> than the point where a photograph sat, that photograph moves to the end. **Nothing is ever dropped, and
> the media pool is never touched.**

1. Walk `currentBlocks`, partitioning into text blocks and non-text blocks; record each non-text block's
   anchor = how many text blocks preceded it.
2. Build the new text blocks from `nextItems` via the existing `blockForItem`.
3. Re-insert each non-text block after the same *count* of text blocks, clamped to the new length.
4. Return the merged list. The `media` array is passed through untouched.

~40 lines, pure, and the one function in this plan that deserves unit tests.

**Known limitation, stated rather than hidden:** a heavy restructure can leave a photograph next to prose it
no longer illustrates. The assistant is told to say so — *"I've rewritten the body; do check the photo
positions"* — and the composer is one click away. The alternative (asking the model to place images itself)
puts model output back into the block model, which §2 exists to prevent.

---

## 6. Web work

| File | Lines | What |
|---|---|---|
| `stores/blogStudioUiStore.ts` | ~85 | `storyStudioUiStore` + `mode`, `postId`, `postList`, `pendingConfirm`, `createdDraftId`, `lastAction` |
| `agent/blog/blogTransport.ts` | ~40 | Clone of `storyTransport.ts`, sending `blogContext` each turn |
| `agent/blog/useBlogChatSession.ts` | ~45 | Clone of `useStoryChatSession` — `useChat` + `onToolCall` → executor → `addToolResult` |
| `agent/blog/blogToolExecutor.ts` | ~240 | The real work: all eight tools through `useBlogStore` |
| `agent/blog/BlogStudioPanel.tsx` | ~340 | Adapted `StoryStudioPanel` + the post list box + the confirm card |
| `pages/production-system/screens/BlogsScreen.tsx` | ~25 changed | "New post" becomes an AI/manual chooser; a "Studio AI" button opens desk mode |
| `pages/blog-composer/BlogEditorScreen.tsx` | ~15 changed | "Studio AI" button in the header row, opens post mode |
| `pages/production-system/ProductionSystemLayout.tsx` | ~2 | Mount `<BlogStudioPanel />` beside `<StoryStudioPanel />` |

**Reused unchanged:** `useVoiceChat` (push-to-talk + spoken replies), `useChatAttachments` +
`AttachmentBar`/`MessageAttachments`, `MarkdownMessage`, `useAutoGrowTextarea`,
`uploadImage({ kind: 'blog' })`, `@/blog/factories`, `buildBlocks.ts`. Voice and attachments therefore come
free.

### 6.1 The one place this deviates from the Story Studio's rules

The Story Studio's prompt says **never show buttons** — every question lists its options in the text. That
rule is about *gathering preferences*, and the Story Studio never deletes or overwrites anything, so it was
never tested against a destructive action.

`deleteBlogPost`, and `replaceBlogBody` **on a published post**, set `pendingConfirm` in the store. The panel
renders a small confirm card, and the tool result does not resolve until a human clicks it. A model that
mis-hears "scrap that bit" as "scrap the post" must not be able to delete published writing on its own.

Everything else — tier, category, tags, which post — stays conversational, as asked.

---

## 7. Phasing

| Phase | Scope | Size |
|---|---|---|
| **P1 — Desk mode: read + create** | Route, prompt, `listBlogPosts` / `openBlogPost` / `createBlogDraft`, store, panel, `BlogsScreen` launcher | ~1 day |
| **P2 — Edit + publish** | `bodyItems.ts` (both functions), `updateBlogPost`, `replaceBlogBody`, `setBlogPublished`, editor launcher, post mode | ~½ day |
| **P3 — Delete + images** | `deleteBlogPost`, the confirm card, `suggestBlogImages`, cover setting | ~½ day |
| **P4 — Wire it out** | `capabilities.ts` blog lines, `navigateTo: 'blog-studio'`, docs | ~1 hour |

**P1 is independently useful** — "write me a post about X" working end to end is most of the value, and it
ships before any of the destructive paths exist.

---

## 8. Out of scope — called out, not built

- **Block-level surgical editing** ("bold the third paragraph"). Needs a stable block-addressing scheme
  exposed to the model. The body-rewrite path covers the real use case at a fraction of the risk.
- **AI-authored galleries, embeds and horse/party cards.** `BodyItem` has no shape for them and the composer
  does it better with two clicks.
- **Live block-by-block streaming into the editor** (the magazine-v2 "live build" idea). Bigger, and the
  drawer-then-open-the-draft flow is what "just how we have for the story" asks for.
- **Scheduling.** `publishAt` is still unreachable model surface — see `BLOG-FEATURE-REVIEW.md` M5. The
  assistant will not offer to schedule something the app cannot do.

---

## 9. Decisions — settled 2026-08-03

All three went with the recommendation:

1. **One drawer, two modes** (§3).
2. **Confirm cards** for delete and for overwriting a live post's body (§6.1).
3. **The photo-anchoring rule** for body rewrites (§5.2).

---

## 10. What shipped

### New files

| File | What |
|---|---|
| `server/src/routes/agentBlog.ts` | `POST /api/agent/blog/chat`, `stepCountIs(16)` |
| `server/src/lib/agent/blogPrompt.ts` | Persona, both modes, capability lines derived from `accountCan` |
| `server/src/lib/agent/blogTools.ts` | The nine tools, all client-executed |
| `web/src/blog/bodyItems.ts` | `blocksToBodyItems`, `spliceBodyItems`, `blockForItem`, `describeVisuals` |
| `web/src/stores/blogStudioUiStore.ts` | Open/mode/post, post list, attached cover, `requestConfirm` |
| `web/src/agent/blog/blogTransport.ts` | Sends `blogContext` (read at send time, not construction time) |
| `web/src/agent/blog/useBlogChatSession.ts` | `useChat` + `onToolCall` → executor |
| `web/src/agent/blog/blogToolExecutor.ts` | All nine tools through `useBlogStore` |
| `web/src/agent/blog/BlogStudioPanel.tsx` | The drawer, the posts-on-file box, the confirm card |
| `web/.../screens/NewPostChoice.tsx` | The AI-vs-manual chooser, mirroring `FileStoryChoice` |

### Changed files

`server/index.ts` (mount) · `capabilities.ts` (the missing blog lines) · `instantPrompt.ts` (export
`BodyItemSchema` so the two agents share one shape) · `agent/tools.ts` (`navigateTo: 'blog-studio'`) ·
`AgentWidget.tsx` (route + `blog.create` guard + open the drawer) · `BlogsScreen.tsx` (both launchers) ·
`BlogEditorScreen.tsx` ("Studio AI", which flushes a dirty autosave first — the assistant reads the post from
the server, so unsaved keystrokes would be invisible to it) · `ProductionSystemLayout.tsx` (mount) ·
`blogStore.ts` (a `BlogSaveInput` type, because `cover: null` means *clear* and `Partial<Blog>` cannot say so)

### Two things found while building

**`PUT /api/blogs/:id` is a full replace**, so a "partial" update that omitted `blocks` would have emptied the
post. Every write in the executor reads the post first and sends a complete document with the change merged
in; `saveFull()` is the single place that calls `saveBlog`, so that rule has one enforcement point rather
than nine. This is review finding L3 in `BLOG-FEATURE-REVIEW.md`, met head-on rather than tripped over.

**`BodyItemSchema` was not exported.** Restating it in `blogTools.ts` would have let the Instant Capture
agent and the Blog Studio drift apart on the one shape they both speak, so it is exported and imported
instead.

### Verification

- Both apps typecheck clean; the web app builds clean.
- `npm run check:permissions` → 40 in catalogue, 37 server-enforced, 3 module-gated, **0 unenforced**. No new
  permission was added and none was orphaned.
- `spliceBodyItems`' anchoring was checked against seven cases — equal-length rewrite, shorter, longer, a
  leading image, two visuals sharing an anchor, an empty body, and text-only. Positions land where §5.2 says
  and **no visual is dropped in any case**, including the empty-body one.

**Not opened in a browser.** There is no test runner in this repo, so the anchoring check above was run as a
standalone script rather than committed as a unit test — worth adding if vitest ever lands. The chat flows
themselves need `OPENROUTER_API_KEY` and a real session to exercise.
