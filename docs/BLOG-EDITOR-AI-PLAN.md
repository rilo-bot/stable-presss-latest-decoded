# AI in the blog editor — review and plan

> **BUILT 2026-08-04.** P0–P5 are done and verified; §10 records what shipped, what
> changed from this plan, and the one thing left. Read §10 before §8.

**Asked for (2026-08-04):** AI on the blog editor page, on **every input**, working like the studios —
the author says *"add this content here"*, *"add a part"*, *"tighten this excerpt"* — and it happens.

This extends `docs/BLOG-AI-STUDIO-PLAN.md` (the drawer, built 2026-08-03) and `§10` of
`docs/BLOG-SYSTEM-PLAN.md` (parts, built 2026-08-04). Nothing here is built yet.

---

## 1. What already exists

More than you'd think. Four of the five pieces are in the repo already.

| Piece | Where | State |
| --- | --- | --- |
| Blog Studio drawer | `agent/blog/BlogStudioPanel.tsx`, mounted in `ProductionSystemLayout` | Built. Opens from the editor scoped to the post (`openForPost`), keeps its conversation, **has push-to-talk and spoken replies already** |
| 9 client-executed tools | `lib/agent/blogTools.ts` + `agent/blog/blogToolExecutor.ts` | Built. Every write goes back through `/api/blogs`, so RBAC is unchanged |
| The `BodyItem` seam | `blog/bodyItems.ts` | Built. The model never emits `Block[]`; `spliceBodyItems` is what stops a copy-edit deleting every photograph |
| **Per-field ✨ AI** | `agent/compose/AiComposeButton.tsx` + `AiTextarea.tsx` → `POST /api/agent/compose` | **Built and already used** in profile fields and Instant Review. Type or dictate a brief, preview, Accept into the field. `entityKind` is a free string, so `'blog'` needs no server work |
| Focus editing ("purple ring") | `pages/article-detail/SelectableField.tsx` + `articleStudioUiStore.selectedFieldId` + `agent/article/articleContext.ts` + `articleFields.ts` | Built **for articles**. This is the pattern to port |

So this is mostly **wiring existing primitives into the blog editor**, plus one architectural change and
one set of new tools.

## 2. What it cannot do today — the actual gap list

1. **The drawer cannot see the document being edited.** Every tool `load()`s the post from the server and
   writes a whole `PUT`. The editor's live state lives in `composerStore` with a 1.5s autosave, so the
   assistant reads a version that may be seconds stale, and after it writes the composer has to
   `adoptServerVersion` or reload. The editor's Studio AI button papers over this by force-saving first.
2. **`replaceBlogBody` is whole-body only.** There is no insert, no target, no notion of where the caret
   is. *"Add this content here"* is not expressible.
3. **It knows nothing about parts** beyond the read-only list I added on 2026-08-04. It cannot add,
   retitle, reorder or remove one.
4. **No field focus.** Nothing in the editor is selectable-for-AI. You cannot select the excerpt and say
   "shorter". `composerStore.selectedId` (block selection) exists but the assistant never sees it.
5. **Fields the assistant simply cannot set:** byline/author, cover from the existing media pool,
   thumbnail, **image alt text** (an accessibility field a writing assistant should be best at), block
   placement, and every part field. `updateBlogPost` covers only title / subtitle / excerpt / category /
   tags / tier.

## 3. The one decision: where an AI edit lands

**Recommendation — into the live editor document, not through the API.** While the editor has that post
open, tools mutate `composerStore`; autosave carries it to the server as usual. Desk mode (the list
screen, no editor) keeps today's API path. One bridge, chosen by `composerStore.blog?.id === postId`.

Why:

- **Instant, and undoable with Ctrl+Z.** Composer mutations already push undo history, so an AI edit
  becomes an ordinary editor step. Through the API it is a save + reload: history reset, no undo.
- **It works on a draft with unsaved keystrokes** — no forced flush, no 409 dance, no reload flash.
- **The human and the AI use ONE mutation path,** so the assistant cannot produce a document a person
  couldn't. That is the same rule as the `BodyItem` seam, one level up.
- **Validation is unchanged.** Autosave still goes through `normaliseBlocks` / `normaliseParts`, and the
  route still re-checks `blog.publish` and ownership.

Cost: two routes behind one façade, and a rule that they never both fire. Accepted.

## 4. All inputs — two different affordances, on purpose

They answer different questions and both are already built.

- **✨ per field (`AiComposeButton` / `AiTextarea`) — "write me one."** One shot, previewed, Accept or
  discard, no conversation. Right for excerpt, standfirst, category, tags, byline, meta title/description,
  a part title, image alt text. **This is what "AI for all inputs" mostly means.**
- **The drawer — "let's work on this."** Conversation, voice, multi-step, sees the whole post. Right for
  "add a part about the autumn carnival", "add this content here", "rewrite the middle section".

The bridge between them is the **selection**: clicking a field puts a purple ring on it and the drawer
focuses it, exactly as `SelectableField` does on the article page.

## 5. The field registry

`blogFields.ts`, mirroring `articleFields.ts` — but with one difference that matters: a blog's fields are
**not a fixed list**. Blocks and parts come and go, so the registry is a *function of the post*:

```
title · standfirst · excerpt · category · tags · byline · cover(+alt/caption/credit) ·
thumbnail · tier · seo.metaTitle · seo.metaDescription        ← fixed
block:<blockId>                                              ← one per body block
part:<partId>.title · part:<partId>.body                     ← two per part
```

**Not in the registry, deliberately:** `slug`, `canonicalUrl`, `noindex`, `status`. The slug is a
published post's public identity, the other two are editorial search decisions, and publishing is always
its own human ask. The existing prompt already forbids all four — this keeps that true by construction
rather than by instruction.

**One selection, not two.** The editor already rings the selected block in `primary`. Adding a second
purple "AI focus" ring on fields is fine, but selecting a field must clear the block selection and vice
versa — otherwise the toolbar and the assistant disagree about what "this" means, and one of them is
lying.

## 6. Tools to add (editor commands)

Valid only while the editor is open on the post; refused with a plain reason otherwise.

| Tool | What it does |
| --- | --- |
| `insertContent({ position, items })` | *"add this content here"* — `position` is `after-selection` \| `end` \| `start` \| `in-part:<id>`. `items` are `BodyItem[]`, so the seam holds |
| `replaceSelection({ items })` | Rewrite the selected block, or the selected part's body |
| `setField({ field, value })` | Any registry field, kind-checked against the registry |
| `addPart({ title, items, atIndex? })` | *"add parts"* |
| `updatePart` / `movePart` / `removePart` | Retitle, reorder, delete (delete goes through the existing confirm card) |
| `setAltText({ mediaId, alt })` | Accessibility; impossible today |
| `setCoverFromPool({ mediaId })` | Choose a cover from photos already attached, not only from stock search |

`replaceBlogBody` stays for whole-post rewrites and desk mode. Destructive moves reuse
`pendingConfirm`, which already blocks the tool call on a human click.

## 7. Context sent each turn

`buildBlogEditorContext()`, mirroring `buildArticleContext()`, read at **send** time:

post id/title/status/dirty · the field list with `filled` + a short `preview` · **the selection** (which
field or block, and its current value in full) · the parts outline (index, title, word count) · the media
pool (id, filename, `hasAlt`).

Previews not full values, plus one `readBody` tool for when it genuinely needs everything — otherwise
every turn ships the whole post and the cost climbs with the length of the piece.

## 8. Phasing

| Phase | Work | Why this order |
| --- | --- | --- |
| **P0** | Harden `/api/agent/compose` (see §9) | It is about to be used on a dozen more fields |
| **P1** | Editor bridge + `buildBlogEditorContext` | Everything else needs the drawer to see the live document |
| **P2** | ✨ on every field via `AiComposeButton` / `AiTextarea` | Biggest visible win, smallest change — the component exists |
| **P3** | Field focus: registry + selectable fields + one-selection rule + `setField` | "Select it and tell it what to do" |
| **P4** | `insertContent` / `replaceSelection` | *"add this content here"* |
| **P5** | Parts tools; drop the "you cannot edit parts" prompt line | *"add parts"* |
| **P6** | `setAltText`, `setCoverFromPool`, prompt rewrite, honesty pass | Finish the surface |

P2 alone is a day and satisfies most of "AI for all inputs". P4 and P5 are what make it feel like a studio.

## 9. Risks and one live security finding

**`POST /api/agent/compose` has no authentication.** It uses `attachAccountOptional`, so any request from
anywhere spends the OpenRouter key — no account, no rate limit, no metering. This is the
"guest-reachable unmetered endpoints" item from `docs/AI-AGENTS-AUDIT.md`, and it is the endpoint this
plan leans on hardest. Fix it in P0 the way `agentInstant` already does: require a staff account and rate
limit per user. Small change; it should not wait.

Other risks:

- **AI and human writing at once.** The composer is the single source, so apply each AI edit as one atomic
  store mutation and toast what changed with an Undo. Do not stream tokens into a block the author has a
  caret in.
- **Token cost per turn** — mitigated by previews + `readBody` (§7).
- **Two selections** (§5) — a correctness issue, not cosmetic.
- **Permission drift.** `setField` must not become a route around `blog.publish` or `blog.edit_any`. It
  can't, as long as every write still leaves via `PUT /api/blogs/:id` — which is exactly what routing
  through `composerStore` + autosave guarantees. Do not add a direct-to-DB shortcut later.
- **`parts` on save.** Any new writer of the post must send `parts` or knowingly omit it
  (`BLOG-SYSTEM-PLAN §10.2`). The editor bridge inherits this correctly because it saves through the
  composer.
---

## 10. What shipped (2026-08-04)

### 10.1 The bridge — `agent/blog/blogEditorBridge.ts`

While the editor has that post open, **every** studio write goes through the
composer store instead of a whole-post `PUT`. `editorOpenFor(postId)` is the only
switch. So an AI edit is an ordinary editing step: instant, and **Ctrl+Z takes it
back**. Autosave still carries it through `PUT /api/blogs/:id`, so `normaliseBlocks`,
`normaliseParts` and the RBAC gate are untouched — *do not ever add a path from the
bridge straight to the database or to a bespoke endpoint.*

Multi-block edits are ONE undo step, which needed three new composer actions
(`insertBlocks`, `replaceBlockWith`, `setBodyBlocks`) — a loop over `insertBlock`
would have made undoing a five-paragraph insertion take five presses.

### 10.2 The three legacy tools route through it too

`updateBlogPost`, `replaceBlogBody` and `setBlogCover` now check `editorOpenFor`
first. This was not in the plan and is not cosmetic: a whole-post save while the
composer holds newer local state is exactly what produces a **false "someone else
saved this post"** 409 and loses unsaved typing. Forbidding them in the prompt would
have left that one disobeyed instruction away. `setBlogCover` also needed
`adoptExternalMedia`, because the stock endpoint writes to the document itself.

### 10.3 Registry, selection, and the bug it uncovered

`agent/blog/blogFields.ts` is a **function of the post** — `part:<id>.title`,
`media:<id>.alt` and `block:<id>` exist only while their subject does. `slug`,
`canonicalUrl`, `noindex` and `status` are absent by construction, so `setBlogField`
cannot reach them.

Selection lives in `composerStore` as `selectedFieldId` beside `selectedId`, and each
setter clears the other — one selection, so the body toolbar and the assistant can
never disagree about what "this" is.

**Focus is the selection, but only on the input.** The first version put
`onFocusCapture` on the whole field; focusing the ✨ then changed the selection,
which unmounts the block-settings card above it in the rail, so the layout jumped
between mousedown and mouseup and the browser cancelled the click — **the ✨ simply
did not work while a block was selected.** The handler now wraps the input alone.
Same fix on the headline, the standfirst and part titles.

### 10.4 Two affordances, as planned

- **✨ on every input that exists** — headline, standfirst, excerpt, category, tags,
  byline, tier, cover, **image alt text**, part title. One line at each call site
  (`<Field field="excerpt">`), because the chrome lives in the shared `Field`.
  Accepting a draft goes through the same bridge, so it is length-checked and
  undoable like anything else.
- **The drawer** for conversation. It already had voice in and out.

### 10.5 Tools added

`setBlogField` · `insertBlogContent` (`selection` | `end` | `start` | `part`) ·
`replaceBlogSelection` · `addBlogPart` · `updateBlogPart` · `moveBlogPart` ·
`removeBlogPart`. Each takes the post `id` and refuses if that post is not the one
open — the author can switch posts mid-conversation.

**Collapsed from the plan:** `setAltText` and `setCoverFromPool` are not separate
tools. Alt text is `media:<id>.alt` and the cover is `cover`, both through
`setBlogField` — one validation path, two fewer tools for the model to choose
between. A cover value must be the id of a photo **already attached**; an invented id
is refused with an explanation.

`removeBlogPart` parks the existing confirm card and does not resolve until a human
clicks — verified, including that it changes nothing while it waits.

### 10.6 Honesty repairs

The prompt's *"You cannot read or write \[parts]"* line is gone, replaced by the part
tools plus the editorial rule that **a part carries its own reaction scale**, so it is
not a formatting choice: add one when asked, use headings otherwise. The editor
section is emitted **only when the composer is open**, so tools that would be refused
are never advertised. Where a photo has no alt text the assistant is told to offer to
write it *and* that it cannot see the picture, so it must ask rather than invent.

### 10.7 P0, and it mattered

`POST /api/agent/compose` was reachable with **no authentication** — anyone could
spend the OpenRouter key. Now `attachAccount` + `rateLimit('agent-compose', 60,
5 min)`. Signed-in rather than staff-only, because the ✨ also sits on member-facing
profile and onboarding forms. Verified: anonymous → **401**, signed in → 200.

### 10.8 Verified

Three suites, in the session scratchpad. **Prompt** (21 assertions, real module): the
editor section, the selection quoted with its id and value, the parts outline and
photo pool with real ids, no section when the composer is shut, and the removed
"cannot edit parts" line. **Browser**: ✨ on 9 inputs; focus rings one input purple;
selecting a block clears it; **a real compose accepted into the summary and carried
to the server by autosave**; and the chat request on the wire carrying the live
selection, the dynamic part field and the parts outline. **Tools** (40 assertions,
executor driven directly in the page against the live store): every tool, every
refusal path (bogus tier, body field as text, unknown field, over-long value, wrong
post, empty insert, empty part body, stale part id, nothing selected, moving past the
end), one-undo-step-per-insert, the confirm card, and everything persisting.

### 10.9 The one thing left

**The editor has no SEO inputs.** `seo.metaTitle` and `seo.metaDescription` are in
the registry and the assistant can set them (it already writes them when filing a
draft), but there is no field for them in the rail — so they have no ✨ and cannot be
typed by hand. Either add the two inputs or accept that they are AI-and-create-time
only; right now the editor is silent about them, which is the part worth fixing.
