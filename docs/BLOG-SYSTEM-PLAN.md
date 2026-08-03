# Blog System — Implementation Plan

> Advanced, block-based blogging for Stable Press. Manual authoring first; AI layered on afterwards.
> Written 2026-08-03. Status: **decisions locked (§9) — ready to build.**
>
> **Locked:** separate `blogs` collection · simple `draft → published` workflow · staff-only authoring for v1.

---

## 1. What was reviewed

| Area | What is actually there today |
|---|---|
| `articles` | The existing story type. **Its body is a single plain-text `summary` field** — `ArticleDetail.tsx` splits it on blank lines and renders a fixed drop-cap + pull-quote layout. One `imageUrl`. No blocks, no multi-image, no placement. |
| Workflow | `lib/workflow.ts` — a clean 5-stage machine (`draft → submitted → approved → scheduled → published`) with per-move permissions, enforced server-side. Good code, but article-specific; blogs take a two-state model instead (§3.5) and leave this file untouched. |
| RBAC | `lib/permissionCatalogue.ts` is the single source of truth (actions + modules + stages); the web console renders checkboxes from `GET /api/roles/catalogue`. No role slug appears in `lib/rbac.ts` — every gate asks what an account may *do*. Adding a permission axis is a data-only change. |
| Uploads | `routes/uploads.ts` — proxied S3 PUT (`/direct`) and presigned PUT (`/sign`), 15 MB image cap, `ALLOWED_KINDS` folder allowlist. Client helper `lib/upload.ts` compresses to JPEG and **falls back to an inline base64 data URL when S3 isn't configured**. |
| Sanitizing | `lib/sanitizeHtml.ts` (server) mirrors `editor/lib/sanitize.ts` (client). Allowlist is inline-formatting only: `b i u s span br` + a few CSS props. **No `<a>`.** |
| Rich text | No editor library in `package.json` (no tiptap/slate/lexical). The magazine editor rolls its own `contenteditable` + the sanitizer above. |
| Persistence | `lib/db.ts` — thin Mongo wrapper. Soft deletes everywhere (`deletedAt`). **`find()` has no pagination — it returns the whole collection.** `aggregate()` is available for server-side rollups. |
| Indexes | `lib/ensureIndexes.ts`, idempotent on boot, one array to append to. |
| Web shell | Public routes in `App.tsx` under `AppLayout`; staff screens are real routes under `/production-system` driven by `SIDE_NAV` in `pages/newsroom/constants.tsx`; full-screen editors sit *outside* the layout (`/production-system/magazine-v2/:id` is the pattern to copy). |

**Conclusion: there is nothing to reuse for the body.** Blogs are genuinely new content, and the requirement
"multiple image media + set where to show the images" cannot be expressed in the article model at all.

---

## 2. Design decision — separate `blogs` collection

Recommended over adding `format: 'story' | 'blog'` to `articles`.

Grafting a block body onto `articles` means migrating every existing article and touching every consumer:
Landing, NewsIndex, ArticleDetail, the kanban board, bulletins, the magazine builder, and four AI studio
routes (`agentArticle`, `agentStory`, `agentCompose`, `agentEditor`). A separate collection keeps the blast
radius at zero and lets the block model be clean from day one. Blogs *reuse* the upload, sanitize and RBAC
plumbing — the content shape and the publish model are what differ.

---

## 3. Data model

### 3.1 The blog document (`blogs`)

```ts
interface Blog {
  id: string
  slug: string                    // unique, from title, editable, frozen after first publish
  slugHistory: string[]           // old slugs 301 → current

  title: string
  subtitle?: string
  excerpt?: string                // hand-written or derived from the first paragraph

  // "Blog by" — a display name always, optionally bound to a real Party record
  author: { name: string; partyId?: string; userId?: string; avatarUrl?: string; bio?: string }
  coAuthors?: Array<{ name: string; partyId?: string }>

  blocks: Block[]                 // THE body — see §3.3
  media: BlogMedia[]              // the blog's own asset pool — see §3.2

  cover?: { mediaId: string; treatment: 'hero-full' | 'hero-split' | 'inset' | 'none'; focal?: [number, number] }
  thumbnailMediaId?: string       // card image on /blog and in shares; defaults to cover

  category?: string
  tags: string[]
  linkedHorseIds: string[]        // reuse the platform's own entities
  linkedPartyIds: string[]

  // Two states, not five. Blogs deliberately do NOT reuse the article workflow
  // machine — see §3.5. `publishAt` is optional and only honoured once P5 adds it.
  status: 'draft' | 'published'
  publishedAt?: string | null
  publishAt?: string | null       // P5 — future-dated publish. Absent in v1.

  seo: { metaTitle?: string; metaDescription?: string; ogMediaId?: string; canonicalUrl?: string; noindex?: boolean }
  minTier?: SubscriptionTier      // reuse the existing paywall
  readingTime: number             // COMPUTED server-side on save, not typed by a human

  createdAt: string
  updatedAt: string
  createdByUserId: string
  deletedAt?: string | null
}
```

### 3.2 The media pool — the key architectural call

```ts
interface BlogMedia {
  id: string          // stable local id; blocks reference THIS, never a URL
  url: string
  key?: string        // S3 object key
  kind: 'image' | 'video' | 'file'
  filename: string
  contentType: string
  width?: number
  height?: number
  bytes?: number
  alt: string
  caption?: string
  credit?: string
  uploadedAt: string
  uploadedByUserId: string
}
```

Blocks hold a `mediaId`, **not** a URL. This is what makes the feature "advanced" rather than
"an image field repeated":

- upload once, place the same asset in several positions;
- edit alt/credit/caption in one place and every placement updates;
- deleting an asset can report exactly which blocks reference it instead of silently breaking them;
- the AI phase can reason about "the pool of available images" separately from "where they go" — which is
  precisely the shape an auto-layout agent needs.

### 3.3 Blocks

```ts
type Block =
  | { id; kind: 'paragraph';  html: string }                                   // inline rich text only
  | { id; kind: 'heading';    level: 2 | 3 | 4; text: string }
  | { id; kind: 'list';       ordered: boolean; items: string[] }
  | { id; kind: 'quote';      html: string; attribution?: string; style: 'pull' | 'block' }
  | { id; kind: 'callout';    tone: 'info' | 'tip' | 'warning'; html: string }
  | { id; kind: 'divider';    style: 'rule' | 'ornament' | 'space' }
  | { id; kind: 'image';      mediaId; placement: Placement; caption?; credit?; alt?; focal?; linkUrl? }
  | { id; kind: 'gallery';    layout: 'grid' | 'masonry' | 'carousel' | 'filmstrip'; columns: 2|3|4;
                              items: Array<{ mediaId: string; span?: 1 | 2; caption?: string }>;
                              placement: Placement }
  | { id; kind: 'embed';      provider: 'youtube' | 'vimeo' | 'x' | 'spotify'; url: string; ratio: '16:9' | '1:1' | '4:5' }
  | { id; kind: 'horseCard';  horseId: string }        // native cross-links — this is a racing platform
  | { id; kind: 'partyCard';  partyId: string }
  | { id; kind: 'articleRef'; articleId: string }
  | { id; kind: 'code';       language?: string; text: string }
```

### 3.4 Placement — "set where to show the images"

Three independent controls, which together cover everything the requirement implies:

**A. Position in the flow** — the block's index in `blocks[]`. Drag to reorder, or insert between any two
paragraphs. This is "show this photo after the third paragraph".

**B. Layout within the column** — `Placement`:

```ts
interface Placement {
  width: 'inline' | 'wide' | 'full-bleed'   // column width | breaks past the text | edge-to-edge
  float?: 'none' | 'left' | 'right'         // text wraps around it
  floatWidth?: '1/3' | '1/2'                // only when float ≠ none
  align?: 'left' | 'center' | 'right'       // when narrower than the column
  captionPosition?: 'below' | 'overlay' | 'side'
  aspect?: 'original' | '16:9' | '4:3' | '1:1' | '3:4'
}
```

**C. Named slots outside the flow** — `cover`, `thumbnailMediaId`, `seo.ogMediaId`. These are images that
belong to the *post*, not to a point in the body.

One module — `apps/web/src/blog/placement.ts` — turns a `Placement` into layout classes, and **both** the
editor canvas and the public page call it. That mirrors the existing "single render path" rule that keeps a
published magazine pixel-identical to its editor.

### 3.5 Workflow — two states, not five

`status: 'draft' | 'published'`. Blogs do **not** go through the article pipeline.

`lib/workflow.ts` is left entirely alone. A blog's status write is a plain field edit guarded by one
permission (`blog.publish`), not a `findMove()` transition — the transition table, the `changesRequested`
flag, the per-move permissions and the `channels` distribution field are all article concepts that do not
apply here.

Two consequences worth stating up front, both accepted:

- **No review step.** Anyone holding `blog.publish` puts a post live directly. The gate is who holds the
  permission, not a queue.
- **Blogs will not appear on the newsroom kanban board.** It is keyed to the five article stages, and a
  two-state type has nothing meaningful to show in five columns. `BlogsScreen` (P4) is a filterable list
  — Drafts / Published / All — which is the right surface for this shape anyway.

If a review stage is wanted later, the cheapest addition is a third state (`in_review`) plus one
permission, not adopting the article machine.

---

## 4. Server work

| File | Change |
|---|---|
| `apps/server/src/routes/blogs.ts` | **new** — CRUD, publish toggle, media pool, slug resolution |
| `apps/server/src/lib/blog/blocks.ts` | **new** — block validation + normalisation (rejects unknown kinds, clamps enums, strips unreferenced media ids) |
| `apps/server/src/lib/blog/slug.ts` | **new** — slugify, uniqueness with `-2` suffixing, history append on change |
| `apps/server/src/lib/blog/readingTime.ts` | **new** — word count across text blocks + a flat cost per image |
| `apps/server/src/lib/sanitizeHtml.ts` | add `sanitizeBlogInline()` — a **second** allowlist adding `a[href] code sup sub`, forcing `rel="nofollow noopener"` and rejecting `javascript:`. The magazine allowlist is left untouched. |
| `apps/server/src/lib/rbac.ts` | add `blogsWriteGate` — modelled on `articlesWriteGate` (create / edit_own with author match / edit_any / delete) |
| `apps/server/src/lib/permissionCatalogue.ts` | add the `blog.*` actions, the `blogs` module, and the seed grants |
| `apps/server/src/lib/ensureIndexes.ts` | add four `blogs` index specs |
| `apps/server/src/routes/uploads.ts` | add `'blog'` to `ALLOWED_KINDS` |
| `apps/server/src/index.ts` | mount `/api/blogs` with a 10 MB JSON parser (blocks + dev data-URL images) |

### 4.1 Endpoints

```
GET    /api/blogs                    paginated list. Published only, unless the caller has newsroom.access.
                                     Query: page, limit, status, tag, category, author, q, sort
GET    /api/blogs/:idOrSlug          one post. Resolves slugHistory → 301-style { movedTo }.
                                     404 unless published, or the caller may see drafts.
POST   /api/blogs                    blog.create
PUT    /api/blogs/:id                full save. Carries baseUpdatedAt; 409 if stale (see §7.2)
POST   /api/blogs/:id/publish        { published: boolean }. Requires blog.publish. Stamps publishedAt on
                                     the first go-live and keeps it on any later unpublish/republish.
POST   /api/blogs/:id/media          register an uploaded asset into the pool
PATCH  /api/blogs/:id/media/:mediaId edit alt / caption / credit
DELETE /api/blogs/:id/media/:mediaId 409 + the referencing block ids unless ?force=true
DELETE /api/blogs/:id                soft delete
```

### 4.2 Permissions (new axis, one grid row)

Five actions, matching the two-state model:

`blog.create`, `blog.edit_own`, `blog.edit_any`, `blog.publish`, `blog.delete`

Seeded: **contributor** → create, edit_own. **editor** → all five. **administrator** derives every action
automatically (it maps the whole catalogue), so it needs no edit.

A separate axis rather than reusing `content.*` for two reasons: publishing a blog is a genuinely different
power from publishing a news story, and it keeps the door open to member/guest authors later as a role
change rather than a code change.

Every gate is permission-only — no role slug, matching the rule stated at the top of `lib/rbac.ts`.
"Staff-only for v1" is therefore enforced by *which roles hold `blog.create`*, not by a hardcoded check.

### 4.3 Indexes

```
blogs: { slug: 1, deletedAt: 1 }            unique, partial on deletedAt: null
blogs: { deletedAt: 1, status: 1, publishedAt: -1 }   the public index query
blogs: { deletedAt: 1, updatedAt: -1 }                the newsroom list
blogs: { tags: 1, deletedAt: 1 }
```

---

## 5. Web work

```
types/blog.ts                                    model, block union, type guards, isLive/coverOf helpers
blog/factories.ts                                block factories + defaults (mirrors the server validator)
blog/placement.ts                                Placement → layout classes. ONE source, both surfaces.
blog/sanitize.ts                                 client mirror of sanitizeBlogInline
blog/BlogRenderer.tsx                            the render path — read-only and edit-aware
blog/blocks/{Text,Media,Ref}Blocks.tsx           the 13 block renderers, grouped by family
stores/blogStore.ts                              zustand — a page of card projections + one full post
pages/BlogIndex.tsx                              public /blog — cards, tag/category filter, pagination
pages/BlogPost.tsx                               public /blog/:slug — renderer + author card + paywall
pages/blog-composer/BlogListPane.tsx             the post rail (left)
pages/blog-composer/BlogEditorPane.tsx           the editor (right) — one slim bar, one column
pages/blog-composer/BlockCanvas.tsx              selection, reorder, inline text, slash menu, file drop
pages/blog-composer/BlockToolbar.tsx             CONTEXTUAL per-block controls (placement lives here)
pages/blog-composer/InsertMenu.tsx               + button and / command over one option list
pages/blog-composer/ImagePicker.tsx              the media pool, on demand
pages/blog-composer/InlineText.tsx               contentEditable with caret-safe seeding
pages/blog-composer/SettingsPanel.tsx            post settings, opened as a sheet
pages/blog-composer/composerStore.ts             draft state, undo, autosave, conflict
pages/production-system/screens/BlogsScreen.tsx  the split-view shell
```

### 5.1 Layout — cards → form → editor, revised 2026-08-03

Two passes were rejected before this one, and the reasons are worth keeping:

1. **Full-screen editor, three columns** (media tray · canvas · inspector) —
   too heavy, and it took the page over.
2. **Split view** (post rail · editor, contextual toolbar, no rail) — the rail
   was too narrow to browse by, and putting controls on a floating toolbar
   *and* in a settings sheet meant two places to look for one setting.

The shape that stuck:

- **Cards.** `/production-system/blogs` shows every post as a card with its
  cover. A post is a visual thing, so covers tell you what you have faster than
  a table of titles. Click one to edit it.
- **A create form.** `/production-system/blogs/new` asks for title, standfirst,
  cover, byline, category and summary — only the title is required, and all of it
  is editable later. Dropping straight into a blank canvas meant the decisions
  that shape a post got made last or never. The cover travels with the create
  call, so the post opens with it already in place.
- **The editor opens on the standard shape of a blog post**:
  cover image → title → standfirst → body. Nothing to assemble from parts.
  The cover is a real slot in the document, not a rail-only setting — it is the
  first thing a reader sees, so it is the first thing an author sees.
- **All tools on the right.** One rail, two sections: the selected block first
  (that is what you are looking at when you reach for it), then the post —
  cover treatment, category, tags, byline, excerpt, URL, access. There is no
  floating toolbar; one home for controls, not two.
- **Six block types up front**, the other five behind "More".
- **`/` in an empty block** opens the same list, filterable, arrow keys + Enter.
  Only when the block is empty — mid-sentence a slash has to stay a slash.
- **Captions and quote attributions are edited in place**, where they appear.
- **Images**: drop files anywhere on the canvas, or `+ → Image`. The pool is
  unchanged underneath; it just surfaces as a picker instead of a column.

All three routes sit *inside* the newsroom layout, so the sidebar never
disappears and none of them is a page takeover. The magazine editors take the
whole viewport because they lay out fixed print pages; a blog is one column of
text.

Trade-off accepted: the document pane is narrower than the viewport, so `wide`
and `full-bleed` are true to the model but not to the published pixel width.
"View" opens the real page in a new tab for that.

Plus: `SIDE_NAV` entry (Content section), two public routes + one staff route in `App.tsx`, a NavBar link,
and `'blog'` added to `UploadKind` in `lib/upload.ts`.

**Rich text:** no editor library. Recommendation is to reuse the existing `contenteditable` + allowlist
approach from `editor/lib/sanitize.ts` rather than adding tiptap — it keeps the bundle flat and means the
client and server allowlists stay mirrored, which is the invariant the codebase already maintains. Blocks
make this easy: each paragraph is its own small editable, so no full document model is needed.

---

## 6. Phasing

| Phase | Scope | Rough size |
|---|---|---|
| **P0 — Contract** | `types/blog.ts` + `lib/blog/blocks.ts` validator, agreed on both sides before anything is built | ~250 lines |
| **P1 — Server** | routes, gate, permissions, indexes, slug, sanitizer, uploads kind, mount | ~600 lines |
| **P2 — Read path** | `BlogRenderer` + all block components + `placement.ts` + public `/blog` and `/blog/:slug` | ~700 lines |
| **P3 — Composer** | block list, inspector, media tray, settings panel, autosave. The big one. | ~1200 lines |
| **P4 — Newsroom** | `BlogsScreen` (Drafts / Published / All list), nav entry, RBAC console rows | ~250 lines |
| **P5 — Polish** | `publishAt` (read-time), revisions, SEO/meta tags, related posts, view counts | ~400 lines |
| **P6 — AI** *(later)* | outline → draft, auto image placement, alt-text generation, per-post chat | separate plan |

P2 before P3 is deliberate: the renderer is the contract, and building it first means the composer is a
thin editing shell around something already proven to display correctly.

### Why P6 lands cleanly

The block model *is* the AI interface. An agent emits a `Block[]` and a `mediaId` assignment — the same
validator the manual path uses rejects anything malformed, so an AI post can never persist a shape a human
post couldn't. This is the same client-executes-tools-through-REST pattern the existing studios use.

---

## 7. Risks and gaps found during the review

### 7.1 Scheduling — sidestepped in v1, but the trap is real
Articles have a `scheduled` status and a `scheduledFor` date that **nothing ever acts on** — `grep
scheduledFor` across `apps/server` and `apps/worker` returns only write paths, no cron, no worker job. A
story parked there never goes live on its own.

The two-state model means blogs don't inherit this. Noted here so P5 doesn't reintroduce it: when
`publishAt` is added, resolve it at **read time** (`publishAt <= now` counts as live) rather than relying on
a timer. That is correct with zero moving parts, and a worker tick to stamp the real transition becomes an
optimisation rather than a correctness requirement.

*(The article-side bug is pre-existing and out of scope here — worth its own ticket.)*

### 7.2 Two editors will clobber each other
Whole-document `PUT` with no concurrency check means the second save silently wins.
*Fix:* the client sends `baseUpdatedAt`; the server 409s if the stored `updatedAt` moved. Cheap, and it
makes block-level `PATCH` an optional later optimisation rather than a requirement.

### 7.3 `db.find()` loads the whole collection
There is no pagination in the db wrapper — `routes/articles.ts` literally does `find()` then filters in
JS. A blog index doing that degrades with every post published.
*Fix:* the list endpoint uses `aggregate()` with `$match`/`$sort`/`$skip`/`$limit` and returns a
projection (no `blocks`, no `media`) — cards only need title, excerpt, thumbnail, author, date.

### 7.4 Data-URL fallback can exceed Mongo's 16 MB document limit
When S3 isn't configured, `lib/upload.ts` inlines images as base64. A blog with a dozen photos and an
embedded media pool would blow the document ceiling and fail the write with an opaque error.
*Fix:* the media-register endpoint rejects a `data:` URL once the document's inline payload passes ~6 MB,
with a message naming the real cause (object storage not configured). Local dev keeps working for a handful
of images, which is all it needs.

### 7.5 The sanitizer has no `<a>`
Blogs need links; the magazine allowlist deliberately doesn't have them. Adding `<a>` to the shared
allowlist would silently widen what a magazine text region accepts.
*Fix:* a second, separately-exported function. Do not loosen `sanitizeRichText`.

---

## 8. Out of scope (call out, don't build)

Comments and moderation · newsletter delivery of blog posts · multi-language · A/B headline testing ·
public author pages beyond the existing `/parties/:id` · view analytics beyond a raw counter.

---

## 9. Decisions — locked 2026-08-03

1. **Separate `blogs` collection.** Zero migration, no risk to the existing article surfaces. §2.
2. **Simple `draft → published`.** The article workflow machine is not reused. Accepted consequences: no
   review step before go-live, and blogs do not appear on the newsroom kanban board. §3.5.
3. **Staff-only authoring for v1.** Composer lives under `/production-system` with the newsroom chrome.
   Enforced by which roles hold `blog.create`, not by a hardcoded staff check, so opening it to members
   later is a role change. §4.2.
