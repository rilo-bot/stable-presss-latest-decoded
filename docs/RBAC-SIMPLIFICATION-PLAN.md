# RBAC Simplification — one grid: every screen × view / create / edit / delete

**Status: BUILT 2026-08-11.** Server + web + console + migration + tests. Verified
against a running server; the LOCAL database is migrated. **Production is not.**
**Date:** 2026-08-11 (v2 — replaces the resource-based draft from earlier the same day)

## Built — what actually shipped

| | Result |
|---|---|
| Catalogue | **55 ids**, 18 screens × their own verbs |
| Enforcement | **51 server-enforced, 0 unenforced** (`npm run check:permissions`) |
| Tests | **19/19** (`apps/server/tests/permissions.test.ts`) |
| Axes per role | 3 → **1** (`modules` and `workflowStages` are derived and no longer stored) |
| Typecheck / build | server + web both clean |

Two decisions were taken while building, both toward the simpler end:

- **Four Stables rows, not one Register row** — the grid mirrors the sidebar exactly.
- **My Media Assets and My Compensation have NO rows.** They only ever show your own
  files and your own payouts, so gating them would be theatre. With Overview that makes
  three always-on screens (`ALWAYS_ON_MODULES`).

### What the migration found

The dry run caught a real escalation before it landed: `contributor` would have gained
`magazine.publish`, because its stored `modules` array was itself derived from
`content.draft.create` (`builtinModulesFor`) — so it recorded that one permission, not
anyone's intent. **Seeded roles are therefore RESET to the new definitions rather than
inferred**; only custom roles are derived from their modules, and they keep the magazine
access they genuinely had.

### Verified live (role `test`: stories view/create/edit + magazine, nothing else)

| Request | Result |
|---|---|
| `POST /api/uploads/direct?kind=media` | **200** — the reported bug, fixed: editing a story now carries its photos |
| `POST /api/uploads/direct?kind=podcast` | 403 |
| `GET /api/magazinesV2/issues` | 200 |
| `GET /api/staff` | 403 |
| `POST /api/horses` | 403 — the registers are really gated now |

### Still to do

1. **Migrate production** — `npm run migrate:permissions` (dry run first), then
   `--apply`, then **restart the API**: `roleRegistry` caches definitions, and an
   un-restarted process strips ids missing from its own compiled catalogue.
   Deploying the code without migrating is survivable but not tidy — `projectRole`
   maps legacy ids on read, so roles resolve correctly while the stored rows are stale.
2. **Nothing has been opened in a browser.** All verification was curl + tests.
3. `LEGACY_PERMISSION_ALIASES` and `scripts/migrate-permissions.ts` come out once prod
   has been migrated.
**Supersedes the permission half of:** docs/DYNAMIC-RBAC-PLAN.md (DB-defined roles stand)
**Related:** docs/RBAC-UI-REVIEW.md, docs/CRM-MODULES-PERMISSIONS-REVIEW.md

---

## 1. What is wrong today

Three checkbox axes describe one role:

| Axis | Count |
|---|---|
| `permissions` | 38 |
| `modules` | 24 |
| `workflowStages` | 5 |

**67 decisions per role**, across three lists that can contradict each other — a role
can hold `content.publish` with the `workflow` module unticked and own a power it has
no screen to use. Nothing detects that.

The 38 ids are not shaped alike, so none can be guessed: stories are nine `content.*`
ids, blogs are five `blog.*`, podcast is **thirteen**, magazines have **none at all**,
and the four Stables registers are gated on `content.draft.create` — so "may start a
story draft" is what decides who edits the horse register.

Measured, not estimated: **125 server enforcement sites + 80 web sites = 205**.

### 1.1 Why media upload is its own permission (and why it stops being one)

`media.upload_own` / `media.manage_all` date from when "My Media Assets" was a
standalone library. Uploads then grew into every editor and the permission never
followed, so the server maps upload *kind* → permission in a table that has drifted
from what the screens offer. The `blog` row already carries the fix in miniature — it
accepts `blog.create`, because an author who cannot upload cannot write a post.

This is the bug hit on 2026-08-11: a role with `content.draft.edit_any` opened the
Article Studio, attached a hero photo, and got *"You do not have permission to upload
media files"*.

**Uploading a file is not a power of its own — it is part of editing the thing the file
belongs to.** A hero photo is a property of the story; whoever may edit the story may
set it. See §5.

---

## 2. The model: the sidebar IS the permission grid

One row per screen. Up to five columns. Every id is `<module>.<verb>`, so knowing the
screen and the verb is enough to know the id.

```
view · create · edit · delete            + publish, only on rows that publish
```

**A row shows only the verbs it supports.** Pipeline Map is a picture of work that
already exists — it gets View and nothing else, and the other four columns render as a
dash, never as an unticked box. An admin is never offered a decision that cannot take
effect.

### 2.1 The 20 rows

| Section | Screen | id | View | Create | Edit | Delete | Publish |
|---|---|---|:--:|:--:|:--:|:--:|:--:|
| **Stories** | All Stories | `stories` | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Workflow Board | `workflow` | ✓ | – | – | – | – |
| | Pipeline Map | `pipeline` | ✓ | – | – | – | – |
| | Editor Hub | `editor-hub` | ✓ | – | – | – | – |
| **Content** | Blogs | `blogs` | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Instant Capture | `instant` | ✓ | – | – | – | – |
| | Magazine Builder | `magazine` | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Podcast | `podcast` | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Stables** | Horses | `horses` | ✓ | ✓ | ✓ | ✓ | – |
| | People | `people` | ✓ | ✓ | ✓ | ✓ | – |
| | Media Records | `media-records` | ✓ | ✓ | ✓ | ✓ | – |
| | Racing Records | `racing-records` | ✓ | ✓ | ✓ | ✓ | – |
| **Community** | Comments | `comments` | ✓ | – | ✓ | ✓ | – |
| | Emoji Analytics | `emoji-analytics` | ✓ | – | – | – | – |
| **Management** | Team Members | `team` | ✓ | ✓ | ✓ | ✓ | – |
| | Roles & Permissions | `roles` | ✓ | ✓ | ✓ | ✓ | – |
| | Analytics | `analytics` | ✓ | – | – | – | – |
| | Settings | `settings` | ✓ | – | ✓ | – | – |
| **Personal** | My Media Assets | `my-assets` | ✓ | ✓ | ✓ | ✓ | – |
| | My Compensation | `compensation` | ✓ | – | – | – | – |

**Overview has no row.** It is the general tab — every staff member lands there, and
what it shows is decided by the rows above (§6).

Comments have no Create: leaving a comment needs no grant, and editing your own is
ownership. The grantable job is acting on other people's words — Edit hides and
restores, Delete removes.

Team's verbs read as: Create = invite, Edit = change someone's role, Delete = remove.

### 2.2 Honest arithmetic

**60 ids, against 38 today.** This plan does not claim a smaller catalogue and the
count is not the point:

| | Today | After |
|---|---|---|
| Lists an admin must understand | 3 | **1** |
| Decisions per role | 67 | 60 |
| Ids you can guess from the sidebar | 0 | **all 60** |
| Screens with a permission that cannot take effect | several | **0 by construction** |
| Screens with no permission at all | Magazine Builder | **0** |

Most rows carry one or two verbs. A contributor's grid is a dozen ticks.

*Option if 60 is still too many:* collapse the four Stables rows into one `register`
row (16 ids → 4, total 48). It costs the ability to give someone Horses but not Racing.
Recommend keeping the four, since the grid should mirror the sidebar exactly.

### 2.3 The lens rule — the one thing that keeps this safe

Four rows are **lenses**: they show records that belong to another row.

| Lens | Shows | Actions inside it enforce |
|---|---|---|
| Workflow Board | stories | `stories.edit`, `stories.publish` |
| Pipeline Map | stories | *(read-only screen)* |
| Editor Hub | stories | `stories.edit`, `stories.publish` |
| Instant Capture | new story or post | `stories.create` **or** `blogs.create`, per destination |

> **View gates the screen. Every action inside a lens is enforced with the owning
> row's verb.**

Without this rule a lens becomes a bypass — `instant.create` would let someone create
stories without `stories.create`. That is why Instant Capture is View-only in the grid
even though its whole job is creating: it chooses a destination, and the destination's
own Create is what is checked when it saves.

### 2.4 Scope — the one modifier

Splitting Edit into `edit_own` / `edit_any` is what produced six ids for three
decisions. Instead: one Edit box, plus a scope on the role.

```jsonc
{
  "permissions": ["stories.view", "stories.create", "stories.edit"],
  "scopes": { "stories": "own" }        // "own" | "all"   (default: "own")
}
```

Scope applies to View, Edit and Delete — the verbs that act on an existing record.
Create and Publish have no owner to compare against. It appears in the console only on
rows where records have an author (Stories, Blogs, Magazine, Podcast, My Media Assets).

Two server helpers, so no route hand-rolls ownership again:

```ts
can(account, 'stories', 'edit')            // holds the verb at all?
canOn(account, 'stories', 'edit', doc)     // …and does scope allow it on THIS record?
```

Without scope, granting Edit on Stories grants editing everyone's work — which is why
it stays.

### 2.5 Two rules enforced by the console

1. **Any verb implies View.** Ticking Create, Edit, Delete or Publish ticks View and
   locks it; you cannot act on a screen you cannot open.
2. **Publish implies Edit.** Putting something live is a change to it.

---

## 3. The sidebar

```
Overview

STORIES
  All Stories · Workflow Board · Pipeline Map · Editor Hub

CONTENT
  Blogs · Instant Capture · Magazine Builder · Podcast

STABLES
  Horses · People · Media Records · Racing Records

COMMUNITY
  Comments · Emoji Analytics

MANAGEMENT
  Team Members · Roles & Permissions · Analytics · Settings

PERSONAL
  My Media Assets · My Compensation
```

**The `modules` axis is deleted.** An entry appears when the role holds that row's
View; a section header appears when at least one of its rows does. There is no second
list to keep in sync, and the contradictory state is unrepresentable.

What is lost, deliberately: you can no longer hide a screen from someone who holds its
permission. That has never been asked for — holding a permission and being able to open
its screen should be one fact, not two.

**`workflowStages` is deleted too.** The board shows all five columns to anyone with
`workflow.view`; which *cards* appear is `stories` scope; which *transitions* are
allowed is `stories.edit` / `stories.publish`.

---

## 4. The Roles console

One screen, one grid, no tabs. Left column names the screen; the right side is the same
five columns all the way down, so the grid reads across *and* down.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Editor                                        Preset ▾   ⟲ Reset   Save     │
│  Sees 14 of 20 screens · publishes Stories, Blogs, Magazines                  │
├──────────────────────────────────────┬──────┬────────┬──────┬────────┬───────┤
│                                      │ View │ Create │ Edit │ Delete │Publish│
├──────────────────────────────────────┼──────┼────────┼──────┼────────┼───────┤
│ STORIES                              │  ▣   │   ▣    │  ▣   │   ▢    │   ▣   │
│   All Stories            (Own | All) │ [x]  │  [x]   │ [x]  │  [ ]   │  [x]  │
│   Workflow Board                     │ [x]  │   –    │  –   │   –    │   –   │
│   Pipeline Map                       │ [x]  │   –    │  –   │   –    │   –   │
│   Editor Hub                         │ [x]  │   –    │  –   │   –    │   –   │
│   Blogs                  (Own | All) │ [x]  │  [x]   │ [x]  │  [x]   │  [x]  │
│   Instant Capture                    │ [x]  │   –    │  –   │   –    │   –   │
│   Magazine Builder       (Own | All) │ [x]  │  [x]   │ [x]  │  [ ]   │  [x]  │
│   Podcast                (Own | All) │ [ ]  │  [ ]   │ [ ]  │  [ ]   │  [ ]  │
├──────────────────────────────────────┼──────┼────────┼──────┼────────┼───────┤
│ STABLES                              │  ▣   │   ▣    │  ▣   │   ▢    │       │
│   Horses                             │ [x]  │  [x]   │ [x]  │  [ ]   │   –   │
│   People                             │ [x]  │  [x]   │ [x]  │  [ ]   │   –   │
│   …                                                                          │
```

**Interactions — four, and that is all:**

| Do this | Get this |
|---|---|
| Click a checkbox | that one permission |
| Click a **row label** | every verb that row supports, on/off |
| Click a **section header cell** | that verb for every row in the section that supports it |
| Pick a **Preset** | fills the whole grid as Contributor / Editor / Administrator, then edit freely |

**Details that make it readable rather than dense:**

- Unsupported verbs are a dash `–`, never an empty box. The eye skips them.
- View auto-ticks and locks when any other verb is on (§2.5), with a tooltip saying why.
- The scope control shows only on rows that have it, and only once View or Edit is on.
- The header line states the role in a sentence — *"Sees 14 of 20 screens · publishes
  Stories, Blogs, Magazines"* — so nobody has to read 60 boxes to know what a role is.
- Section rows collapse; a collapsed section shows a chip summary (*"Stables — full
  access"*, *"Community — view only"*).
- Superadmin renders read-only, every box ticked, with a note that `isSuper`
  short-circuits the grid.
- **Mobile:** one card per screen, verbs as tappable chips. No horizontal scrolling
  grid on a phone.

This replaces the current console's three separate checkbox lists (docs/RBAC-UI-REVIEW.md).

---

## 5. Uploads stop being a permission

`media.upload_own` and `media.manage_all` are deleted. `KIND_PERMISSIONS` becomes:

| kind | requires |
|---|---|
| `media` (story hero) | `stories.edit` |
| `blog` | `blogs.edit` |
| `podcast` | `podcast.edit` |
| `misc` | `my-assets.create` |
| `party`, `horse`, `avatar`, `evidence` | signed in — unchanged, self-service |

The shared library (was Media Library, in Editor Hub) moves under `media-records`.
`useCanUpload(kind)` on the web keeps its shape and reads the new table, so the fix
shipped on 2026-08-11 survives the migration.

---

## 6. Overview is the general tab, and the AI summary obeys the grid

No permission, no row, every staff member lands there. **Each block is conditional on
the row behind it** — a role holding only `stories.view` sees a page about stories, not
a page of empty cards.

### 6.1 The AI summary

The Overview summary must be built from **the same scoped resolver that renders the
page**, never from a broad fetch trimmed afterwards. A summary assembled from
everything and filtered later leaks in its wording — *"3 stories are awaiting
approval"* — even when the reader may open none of them.

1. One resolver produces the viewer's visible record set; the page and the summary both
   read from it.
2. The prompt names only screens the viewer holds View on.
3. Counts are counts **of what was returned**, so they cannot exceed what is visible.
4. No ids, headlines or names for records outside the set.

Same rule for the Stablehand agent when it answers questions about pipeline state.

---

## 7. Old → new

| Old | New |
|---|---|
| `content.draft.create` | `stories.create` |
| `content.draft.edit_own` / `edit_any` | `stories.edit` + scope `own` / `all` |
| `content.submit` | — (whoever may edit a draft may submit it) |
| `content.editorial_review`, `content.send_revision` | `stories.edit` + scope `all` |
| `content.approve`, `content.schedule`, `content.publish` | `stories.publish` |
| `blog.create` / `edit_own` / `edit_any` / `publish` / `delete` | `blogs.create` / `blogs.edit` + scope / `blogs.publish` / `blogs.delete` |
| `media.upload_own` | — (inherited, §5) |
| `media.manage_all` | `media-records.edit` |
| `compensation.view_own` | `compensation.view` |
| `platform.admin` | — (`role.isSuper`, which already short-circuits) |
| `roles.manage` | `roles.create` + `roles.edit` + `roles.delete` |
| `team.view` / `team.manage` | `team.view` / `team.create` + `edit` + `delete` |
| `settings.view` / `settings.manage` | `settings.view` / `settings.edit` |
| `analytics.view` | `analytics.view` + `emoji-analytics.view` |
| `comments.moderate` | `comments.edit` + `comments.delete` |
| the 13 `podcast.*` | `podcast.view/create/edit/delete/publish` + scope |
| *(none)* | `magazine.*` — **new**; every magazine route needs gating |
| module `media-production-system` | `media-records` |
| module `racing-production-system` | `racing-records` |
| modules `review-queue`, `assignments`, `scheduling`, `media-library`, `horse-records` | — (Editor Hub tabs; `editor-hub.view` + the lens rule) |
| `workflowStages` | — (§3) |

Seeded roles afterwards:

| Role | Grid |
|---|---|
| **contributor** | Stories V·C·E · Board V · Pipeline V · Blogs V·C·E · Instant V · Stables V · My Media all · Compensation V — **scope Own** |
| **editor** | contributor + Delete + Publish everywhere · Editor Hub · Magazine · Comments · Emoji · Analytics · Team V — **scope All** |
| **administrator** | every box, scope All |
| **superadmin** | `isSuper` — never reads the grid |

---

## 8. Build order

| Phase | Work | Size |
|---|---|---|
| **P0** | New catalogue (20 rows × supported verbs) + `scopes` on the role doc + `can()` / `canOn()`. Old ids kept as **read-time aliases** so nothing breaks mid-flight. | small |
| **P1** | Server enforcement — **125 sites**, plus the lens rule (§2.3) and magazine routes, which have no gate today. | **large** |
| **P2** | Web gates — **80 sites**. `useCanUpload` re-points at the new table. | medium |
| **P3** | Sidebar derives from View; sections regrouped per §3; Editor Hub tabs become lenses; register modules renamed. | medium |
| **P4** | Roles console rebuilt as the single grid (§4). | medium |
| **P5** | Overview blocks + the scoped resolver and AI summary (§6). | medium |
| **P6** | `migrate:permissions` rewrites every role via §7 · `check:permissions` extended to fail when a catalogue id has **zero** server enforcement sites, or a route enforces an id not in the catalogue · aliases removed. | small |

### 8.1 Risks

- **A mis-mapped id is a silent privilege change.** P6 catches unenforced ids; it
  cannot catch an id mapped to the wrong verb. The migration must print a before/after
  grid per role and require confirmation.
- **`content.draft.create` gates the four Stables screens today**, so everyone who can
  start a draft would inherit `horses.*`+`people.*`+`media-records.*`+`racing-records.*`.
  The migration must derive those from the role's *modules*, not from that permission.
- **Magazines gain a gate they never had.** Everyone has full magazine access now.
  Recommend granting `magazine.*` to every role that holds the module today and logging
  it, so nothing silently breaks.
- **The API must be restarted after P0 ships** — `roleRegistry` strips ids missing from
  the running process's compiled catalogue, so an un-restarted API would quietly empty
  every role. (See the note in docs/ADDING-A-PRODUCTION-SYSTEM-MODULE.md.)
- 205 sites is a wide diff; it should land as one series, not two models live for weeks.

### 8.2 Still open

1. Four Stables rows (16 ids) or one Register row (4). Recommend four — the grid should
   mirror the sidebar.
2. Whether `my-assets` needs a row at all, or is simply always available to staff since
   it only ever shows your own files.
