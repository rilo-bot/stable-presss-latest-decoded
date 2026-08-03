# CRM Modules & Permissions Review

> **STATUS: ALL FINDINGS FIXED — 2026-08-03.** Every item in §6 is done, verified by
> 43 assertions against the live role documents. The permission catalogue went from
> 44 ids (18 UI-only, 7 dead) to **40 ids with zero unenforced**: 37 server-enforced,
> 3 module gates. `npm run check:permissions` fails the build if that ever regresses,
> and `npm run sync:roles` reconciles stored role rows with the catalogue.
> Fix details are in §8. Nothing is committed.

**Date:** 2026-08-03
**Scope:** every module in the Production System, all 44 catalogue permissions, the
24 module surfaces, and the DB role rows — re-checked after the P0–P2 user-model /
RBAC work. Specific attention to **Blogs**, **Emoji Analytics** and **Instant Capture**,
the three modules added since the last RBAC review.
**Method:** static audit of `permissionCatalogue.ts` against every server reference,
the web nav/guard mirror, and a live query of the `roles` collection on the test
cluster (`stable-press-local`).

---

## Verdict

The **plumbing is sound and the newest modules are the best-gated in the codebase.**
Blogs is, in fact, the reference implementation — it enforces all five of its
permissions, and it does so at the mount rather than scattered through handlers.

The real finding is not a broken gate. It is that **18 of 44 permissions (41%) are
enforced only in the browser**, and 7 of those are enforced nowhere at all. They
render as grantable checkboxes in the Roles & Permissions console, so an
administrator ticking them believes they have granted or withheld something. Some
withhold nothing; one (`media.*`) withholds nothing while a real endpoint sits
open behind it.

**Counts:** 26 permissions server-enforced · 18 UI-only (7 fully dead) · 24/24
modules gated · 0 catalogue drift · 0 DB role drift.

---

## 1. What is verified healthy

| Check | Result |
|---|---|
| Web ↔ server permission catalogue parity | **44/44 match**, both directions |
| Web ↔ server module id parity | **24/24 match** (`bulletin-templates` deliberately absent — see below) |
| DB role rows vs seed spec | **zero drift** — no role missing a permission or module it should hold |
| `administrator` / `superadmin` vs full catalogue | hold **all 44 permissions and all 24 modules** |
| Module gating | enforced **per URL**, not just by hiding the sidebar entry |
| Article status transitions | enforced as workflow **moves**, not field writes |
| Podcast create/edit/approve/delete/read_all | enforced |
| Blogs — all 5 permissions | enforced |

Two details worth recording because they look like bugs and are not:

- **`bulletin-templates` is absent from the server module catalogue on purpose.**
  Magazine Studio is reached from Overview rather than the rail, and
  `ProductionSystemLayout` only gates SIDE_NAV-backed slugs — resolving this one
  through `moduleForSlug` would lock it for everybody.
- **`contributor` lacks the `emoji-analytics` module, correctly.** That module
  requires `analytics.view`, which contributor does not hold. The other three
  roles all have it, so `scripts/grant-emoji-analytics-module.ts` was evidently
  run (`seedRoles` is insert-only and could not have added it).

Module gating is stronger than the last review found it:

```ts
// ProductionSystemLayout.tsx — hiding a sidebar entry is not closing the screen
const gatedModuleId = SIDE_NAV.find((i) => i.slug === slug)?.id
const blocked = !!accessModules && !!gatedModuleId && !accessModules.includes(gatedModuleId)
```

---

## 2. Blogs — correctly gated (the reference implementation)

All five blog permissions are enforced. The design is worth copying: enforcement
lives in **`blogsWriteGate` at the mount**, so no handler can be reached without
passing it, and the handler only adds the check that depends on request *content*
(`blog.publish`, which is a function of the target status).

| Route | Gate |
|---|---|
| `GET /api/blogs`, `GET /:idOrSlug` | public; drafts require `blog.edit_any` / `blog.create` / `newsroom.access` |
| `POST /api/blogs` | `blog.create` |
| `PUT /:id`, `PATCH /:id/media/:mediaId` | `blog.edit_any`, else `blog.edit_own` **+ ownership** |
| `POST /:id/publish`, `PUT` with a status change | `blog.edit_*` **and** `blog.publish` |
| `DELETE /:id` | `blog.delete` |
| `DELETE /:id/media/:mediaId` | treated as an **edit**, not a delete |

Three things it gets right that other routes do not:

1. **Sub-resource POSTs are edits, not creations.** `POST /:id/media` and
   `POST /:id/publish` route to `blogEditGate` rather than passing on
   `blog.create` — so "may start a post" cannot be used to modify someone else's.
2. **Creating straight into `published` is gated.** Without that check,
   `POST { status: 'published' }` walks past the publish permission entirely —
   exactly the hole articles had before the workflow was enforced.
3. **A missing document 403s rather than 404s** in the edit gate, so the gate
   isn't an existence oracle.

Ownership uses `createdByUserId`, not the byline — correct, since `author.name` is
free text for pen names and is not an identity claim.

**No action required.**

---

## 3. Emoji Analytics — honest sample data, one future obligation

`emoji-analytics/data.ts` is **clearly and prominently labelled as invented**, in
the file header, in a header badge on the screen, and again under every panel that
would need real data. Every figure derives from one `ITEMS` array, so the panels
cannot contradict each other. There is no `reactions` collection, no endpoint, and
nothing on the public site that records a reader's emoji.

This is the right way to ship a design ahead of its backend, and it does **not**
repeat the fake-data problem catalogued in `docs/FAKE-DATA-REMOVED.md`.

**The obligation it creates:** `analytics.view` is currently enforced *nowhere on
the server* (§4.3). When the reactions endpoint lands it must be gated on
`analytics.view` at the mount. `deriveDashboard()` is already the shape that
endpoint should return, so only `ITEMS` gets replaced.

---

## 4. The finding: 18 of 44 permissions are UI-only

Full list, grouped by why:

### 4.1 High — a real endpoint sits behind an unenforced permission

**`media.upload_own` · `media.manage_all`**

`/api/uploads` requires only `requireAuth`:

```ts
router.post('/direct', requireAuth, rawUpload, …)
router.post('/sign',   requireAuth, …)
router.get('/file/*',  async (req, res) => { …    // no auth at all
```

So **any signed-in account — including a plain reader with no staff role — can
obtain a presigned S3 PUT URL** or push bytes through `/direct`. `media.upload_own`
restricts nothing, and `media.manage_all` (which the web checks in two places) is
purely cosmetic. `GET /file/*` being unauthenticated is the already-known **H7**
(it serves party-claim evidence to anyone with the key).

*Fix:* gate `/sign` and `/direct` on `media.upload_own`; gate `/file/*` on the
requesting account's relationship to the asset.

### 4.2 Medium — podcast field-level permissions collapse into "may edit"

Five permissions describe *specific actions* on an episode but resolve to a single
`PUT /:id` gated on `edit_own` / `edit_any`:

`podcast.audio.upload` · `podcast.guests.manage` · `podcast.episode.schedule` ·
`podcast.episode.submit_review` · `podcast.distribution.manage`

Anyone who may edit an episode may do all five. Granting only "may upload audio"
grants nothing at all.

Separately, **`podcast.episode.publish` is enforced nowhere** — going to
`status: 'published'` is gated on `podcast.episode.approve`. The two are conflated:
granting approve silently grants publish, and granting publish alone does nothing.
`podcast.manage` (checked twice in the web) is also unenforced server-side.

### 4.3 Medium — permissions gating screens that have no server surface

`analytics.view` · `settings.view` · `settings.manage` · `compensation.view_own` ·
`compensation.view_all` · `compensation.manage`

There is no `routes/settings.ts` and no `routes/compensation.ts`. The Analytics,
Emoji Analytics, Compensation and Settings screens make **no API calls at all** —
they render from client-side context. Nothing is currently exploitable *through
these permissions*, but two consequences follow:

- `settings.manage` implies settings persist. They have no endpoint, so whatever
  the screen changes is not durably stored server-side.
- `analytics.view` restricts nothing an attacker wants: the Analytics screen draws
  on `/api/articles`, which is **unauthenticated and unfiltered** (**H1**, rated
  Critical by the public-site review). Locking the screen while the data behind it
  is public is a UI gesture.

### 4.4 Medium — fully dead permissions (7)

Referenced in **neither** server nor web code, yet grantable in the Roles console:

`team.view` · `settings.manage` · `compensation.view_all` · `compensation.manage` ·
`workflow.view_all_columns` · `workflow.view_own_columns` · `podcast.episode.publish`

Two deserve individual notes:

- **`team.view` is the actively misleading one.** The `team` module requires
  `team.manage`. So the seeded **editor** role holds `team.view` and still gets no
  Team screen — the permission's plain-English promise ("See the staff roster") is
  false for the only role that holds it. Either regate the module on `team.view`
  for read-only access, or delete the permission.
- **`workflow.view_*_columns` were superseded** by the `workflowStages` axis (15
  usages). They are the vestige of the pre-dynamic-RBAC design and should be
  deleted from the catalogue, not re-wired.

### 4.5 Low — retired permission ids persist on role rows

`content.legal_review`, `content.compliance` and `content.publisher_review` were
removed from the catalogue when the twelve-status workflow collapsed to five, but
still sit on three role rows (`superadmin`, `editor`, `administrator`). They match
no catalogue entry so they authorize nothing — but they survive every round-trip
through the roles console. A one-line `$pull` clears them.

---

## 5. Gaps against the new user model (P3)

- **No `users.view`.** There is no Users screen and no permission for one.
- **No `claims.verify`.** Party-claim verification is gated on `platform.admin`,
  which also grants "manage every organisation, override ownership". There is no
  way to let someone work the verification queue without handing them the platform.
  This is the permission the new **Verification Queue** screen needs.
- **`team` module regating** — see §4.4.

---

## 6. Recommended order

| # | Action | Status |
|---|---|---|
| 1 | Gate `/api/uploads/sign` + `/direct` (§4.1) | ✅ done — by kind, not a blanket check |
| 2 | Gate `/api/uploads/file/*` — H7 | ✅ done — evidence only, 404 + no-store |
| 3 | Delete the dead permissions, or wire them (§4.4) | ✅ done — 5 removed, rest wired |
| 4 | Regate the `team` module on `team.view` | ✅ done — incl. read-only screen |
| 5 | `claims.verify` split off `platform.admin` | ✅ done (`users.view` deferred — see §8) |
| 6 | Podcast field permissions + `episode.publish` (§4.2) | ✅ done + mass-assignment fix |
| 7 | Clear the retired ids from role rows (§4.5) | ✅ done — `npm run sync:roles` |
| 8 | Gate the reactions endpoint on `analytics.view` when it lands (§3) | ⏳ blocked on the endpoint |

Items 1 and 2 are the only ones with live exposure. Everything else is a
correctness-of-meaning problem: the console promises control it does not have.

---

## 8. What was fixed (2026-08-03)

### The structural change

The catalogue is now **40 permissions with nothing decorative in it**. Two scripts keep
it that way:

- **`npm run check:permissions`** — fails with exit 1 if any catalogue id is
  referenced in neither server code, nor a module's `requiresPermission`, nor web
  code. Run it in CI. Current output: `37 server-enforced · 3 module gate · 0
  web-only · 0 UNENFORCED`.
- **`npm run sync:roles`** — reconciles stored role rows with the catalogue: prunes
  ids the catalogue no longer defines, tops up the two "holds everything" roles
  (`superadmin`, `administrator`), and re-derives seeded roles' module lists
  additively. Dry-run by default; `--apply` to write. Idempotent (verified).

`seedRoles` stays insert-only — the sync script is the deliberate, explicit
counterpart, so a redeploy still never silently reverts an admin's edit.

### §4.1 High — uploads (was: any signed-in reader could upload anything)

`/direct` and `/sign` are now gated **by upload kind**, because uploading is not one
power. The four identity/self-service kinds (`evidence`, `avatar`, `party`, `horse`)
stay open to any signed-in account — gating those on a staff permission would have
broken the claim flow outright, which is why a blanket `media.upload_own` check would
have been the wrong fix. `media`/`blog`/`podcast`/`misc` require a permission, and
unknown kinds fall through to `misc`, which **fails closed**.

Several kinds accept any-of two permissions, because the primary one is not held by
the roles that legitimately do the work — seeded `editor` may edit any episode but
was never granted `podcast.audio.upload`, and a blog-only author would hold
`blog.create` without `media.upload_own`.

Also: the kind check runs **before** the 60 MB body parser, so a refused caller never
gets buffered; and a per-account rate limit (120 writes / 5 min) stops the bucket
being used as free storage.

### H7 — evidence files (was: readable by anyone with the URL)

`GET /file/*` now parses the owner out of the key (`<kind>/<ownerId>/<uuid>-<name>`)
and, for `evidence`, admits only the owner or a claim verifier. It returns **404, not
403** — a 403 confirms a file exists — and sets `no-store` so no shared cache holds
someone's passport scan. Every other kind stays public, because party photos and blog
media render in `<img>` tags on the public site.

### §4.2 — podcast

Five field-level permissions are now enforced per field, checked only when the value
actually **differs** from what is stored (so a client that round-trips the whole
object isn't refused for fields it left alone). `podcast.manage` is the umbrella that
satisfies any of them.

`podcast.episode.publish` is enforced for the first time: publishing was gated on
`podcast.episode.approve`, so **granting approve silently granted publish**. They are
now separate, with takedown still approval-grade.

Two things found while in there and fixed: the `PUT` spread `{ ...body }` straight
into the update (mass assignment past the gates — now a write allow-list), and
ownership compared **display names**, which breaks when two staff share a name or one
is renamed. Now `producedByUserId`, stamped server-side, with the old name match as a
legacy fallback. Creating an episode directly into a published state is also gated
now.

### §4.4 — `team.view` means something

The `team` module moved from `team.manage` to `team.view`, and `routes/staff.ts` now
splits GET (`team.view`) from writes (`team.manage`). The Team screen renders
**read-only** for a viewer without `team.manage`: the role pill becomes a label rather
than a disabled `<select>` (greyed-out reads as "temporarily unavailable" when the
truth is "not yours to change"), and the invite form is hidden entirely rather than
shown with a submit the server refuses. `GET /api/roles` was widened to `team.view`
too — the roster renders role labels and colours, so a viewer who couldn't read it
would see a list of blanks.

**This exposed a gap in the fix itself:** `editor`'s stored `modules` array was
computed when `team` required `team.manage`, so editor held the permission and still
had no Team screen. That is what the sync script's additive module re-derivation is
for; it granted `editor` the `team` module.

### §4.4/4.3 — five permissions removed rather than left lying

`compensation.view_all`, `compensation.manage`, `settings.manage`,
`workflow.view_all_columns`, `workflow.view_own_columns`.

The two workflow ids were superseded by the `workflowStages` axis, which is real
per-role config with its own column in the Roles console — wiring them would have
created a second source of truth for column visibility. The other three have no
endpoint and no controls to gate: `CompensationView` derives everything from
`articles` and `SettingsView` is static text.

They are listed as **RESERVED** in `permissionCatalogue.ts` with the rule *re-add in
the same commit as the endpoint that enforces it*. `check:permissions` is what stops
the list growing back.

`SettingsView` also claimed "Legal Review Required: Yes" and "Workflow Stages: 12" —
both describing the retired twelve-status pipeline. Corrected to 1 approval step and
5 stages.

### New — `claims.verify`

Split out of `platform.admin`, which also grants "manage every organisation, override
any ownership". The verification queue can now be staffed without handing over the
platform.

One asymmetry, deliberate: `platform.admin` is exempt from the self-verification check
(it restricts nothing real, and blocking it would strand a single-admin install whose
admin is also a trainer), but **`claims.verify` is not**. That argument doesn't extend
to a records clerk, and separation of duty is worth more than the convenience. The
pending queue hides a `claims.verify` holder's own claim to match, so it never lists a
row that 403s on click.

`canVerifyClaims()` lives in `lib/rbac.ts`, not in the route, because
`routes/uploads.ts` needs the same answer for evidence reads — two copies of a rule
like that is how the H4 superadmin bug happened.

### Deliberately NOT done

**`users.view` was not added.** There is no Users screen and no `/api/users`, so
shipping the permission now would create exactly the decorative checkbox this whole
pass removed. It belongs in the same change as the P3 Users screen.

### Verification

- Server and web both `tsc --noEmit` clean.
- `check:permissions`: 0 unenforced, buckets asserted to sum to the catalogue size.
- `sync:roles --apply` run on the test cluster, then re-run: all four roles `✓ in sync`.
- 43 assertions against the real role documents: upload truth table for 4 account
  types × 6 kinds, evidence read gate (owner / other / anonymous / admin), the podcast
  status-permission table including "approve-only role may NOT publish", the team
  read/write split including editor's recovered module, the `claims.verify` split, and
  that all 8 removed/retired ids are gone from every role row.

Not opened in a browser.

---

## 7. Cross-reference

Still open from `docs/AUTH-RBAC-REVIEW.md`, unchanged by this review:
**H1** (`GET /api/articles` unauthenticated + unfiltered), **H2** (`minTier`
client-only), **H3** (`staffWriteGate` gates public-site + bulletin publish),
**H5** (no auth rate limiting), **H6** (`DEV_OTP_CODE` not disabled in prod),
**H7** (`/api/uploads/file/*` open — appears here as §4.1).

H1 and H2 are independently rated **Critical** by `docs/PUBLIC-SITE-REVIEW.md`.
