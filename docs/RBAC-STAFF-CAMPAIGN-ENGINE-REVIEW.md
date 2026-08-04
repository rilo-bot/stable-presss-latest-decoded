# RBAC review — staff roles & the Campaign Engine

**Date:** 2026-08-04 · **Branch:** `feature/blogs` · **Scope:** the staff/editorial
role axis (`roles` collection, `staffRoleSlug`, permission catalogue, assignment
and invite paths) and every Campaign Engine surface reached under
`/production-system`.

Out of scope: racing scope (`lib/scope.ts`, horse/party relationships), org roles,
party claims, subscription tiers. Those are separate axes with their own reviews.

**Verdict.** The *shape* is right and clearly better than what the earlier reviews
found: no role slug appears in an authorization decision, `AccountUser` makes
"forgot to resolve permissions" a compile error, superadmin short-circuits before
any lookup, and `denyRoleGrant` / `checkSuperadminLoss` are single-sourced. The
failures are all in the same two places: **the role-*definition* path never got
the anti-escalation rule the role-*assignment* path has**, and **the MODULE axis
is enforced only in the browser**.

1 Critical · 3 High · 5 Medium · 4 Low.

---

## Critical

### C1 — `roles.manage` self-escalates to full platform access in one request

`PUT /api/roles/:slug` ([routes/roles.ts:224](../apps/server/src/routes/roles.ts#L224))
is gated on `roles.manage` and nothing else. The only self-protection is
`wouldSelfLockOut` ([roles.ts:148](../apps/server/src/routes/roles.ts#L148)), which
blocks *removing* `roles.manage` from a role you hold. Nothing blocks *adding*
anything.

So the holder of a deliberately narrow "Role Admin" role (`newsroom.access` +
`roles.manage`) PUTs their own slug with the full catalogue and walks away with
`platform.admin`, `team.manage`, `claims.verify`, `content.publish` — everything
except the immutable `superadmin` slug itself. `isImmutable` protects only that one
row; `administrator` is `isSystem` but explicitly editable.

The assign path already has exactly the rule that is missing here — `denyRoleGrant`'s
"NO AMPLIFICATION: you cannot hand out access you do not hold yourself"
([roleRegistry.ts:74](../apps/server/src/lib/roleRegistry.ts#L74)), written for
AUTH-RBAC-REVIEW C3. Defining a role was left out, and defining is the stronger
power of the two. `POST /api/roles` has the same hole: a `roles.manage` holder can
mint an all-permissions role, which then only needs a colleague with `team.manage`
to land.

Reachable from the console UI, not just the API —
[RolesPermissionsView.tsx](../apps/web/src/pages/newsroom/views/RolesPermissionsView.tsx)
has no self-role check and no per-checkbox restriction.

**Fix.** In `readRoleBody`'s callers, apply the amplification rule to both create
and update: unless `actor.isSuperAdmin`, reject when
`parsed.permissions.some(p => !actor.permissions.has(p))`. Separately, refuse to
change the permission set of the role the actor currently holds, mirroring
`denyRoleGrant`'s rule 1 (no self-service) — rule 2 alone still lets two
`roles.manage` colleagues escalate each other.

---

## High

### H1 — the MODULE axis has no server-side enforcement at all

`accountCanOpenModule` is defined at
[effectiveAccess.ts:199](../apps/server/src/lib/effectiveAccess.ts#L199) and
re-exported by [rbac.ts:26](../apps/server/src/lib/rbac.ts#L26). It is called from
**nowhere** in the repository. Every module gate in the product is
[ProductionSystemLayout.tsx:112-115](../apps/web/src/pages/production-system/ProductionSystemLayout.tsx#L112-L115)
— a `<Navigate>` in a browser.

`scripts/check-permission-enforcement.ts` states this on its face: it accepts
"a module's `requiresPermission`" as a tier of enforcement because
"ProductionSystemLayout enforces [it] per URL". Current output:

```
Permissions in catalogue: 38
  server-enforced : 35
  module gate     : 3  compensation.view_own, settings.view, analytics.view
  web-only        : 0
  UNENFORCED      : 0
```

Those three happen to be nearly inert (their screens make no API calls and derive
from the already-loaded article store), so the honest reading is not "3 permissions
are weak" but "the module axis is decoration, and the CI check is written to accept
that". The concrete bypass: both full-screen magazine editors are mounted **outside**
the layout ([App.tsx:325-326](../apps/web/src/App.tsx#L325-L326)) under `RequireStaff`
alone, so a contributor with no `magazine-v2` module deep-links
`/production-system/magazine-v2/<id>` and the server asks only for `newsroom.access`.

**Fix.** Either add a `requireModule(id)` middleware and mount it on the routers
behind module-gated screens, or drop the pretence and stop counting `module gate`
as enforcement in the CI script. The first is the smaller change and makes the
existing checkbox column mean something.

### H2 — publishing to the public newsstand is "is staff", with no permission of its own

There is no `magazine.*` id anywhere in `PERMISSION_CATALOGUE`. `magazinesV2`
([magazinesV2.ts:79-85](../apps/server/src/routes/magazinesV2.ts#L79-L85)) and
`issuesGate` ([rbac.ts:410](../apps/server/src/lib/rbac.ts#L410)) both check
`canAccessNewsroom` and stop there.

Result: a **contributor** — a role designed so that it cannot put a news story live —
can build a magazine issue, publish it to the public `/bulletins` page, and
unpublish or delete anybody else's. `staffWriteGate` gives the same posture to
`breakingNews` (the site-wide ticker on the landing page) and `sponsors`. Same
class of gap the retired `content.bulletin` permission was meant to cover; the
permission went away and the surface it guarded did not.

**Fix.** Add `magazine.edit` / `magazine.publish` (and an `issue.publish`, or reuse
the same pair) to the catalogue in the same commit that enforces them, seed them
onto `editor`/`administrator`, and give `breakingNews` a real id rather than
`newsroom.access`.

### H3 — `GET /api/articles` hands the whole pipeline to every contributor

`canSeePipeline` ([articles.ts:52](../apps/server/src/routes/articles.ts#L52))
returns true on `content.draft.create` alone, and that branch returns `sorted`
unfiltered — every article, every field, including `assignmentNote`,
`changesRequestedNote`, `createdByUserId` and `scheduledFor`.

The contributor-only view exists purely in the browser
([useProductionSystemState.ts:180-182](../apps/web/src/pages/production-system/useProductionSystemState.ts#L180-L182)),
as a display-name filter. So the lowest staff tier can read every colleague's
unpublished drafts and the editors' private notes on them with one unauthenticated-
looking GET. The seeded contributor's `edit_own` + `workflowStages: ['draft','submitted']`
say plainly that this is not the intent.

**Fix.** Inside the pipeline branch, when the caller lacks `content.draft.edit_any`
and `content.editorial_review`, restrict to `createdByUserId === account.id` (plus
published rows) and strip the two note fields.

---

## Medium

### M1 — ownership is an id on the server and a display-name string in the browser

`ownsArticle` ([rbac.ts:313](../apps/server/src/lib/rbac.ts#L313)) prefers
`createdByUserId`; `canEditArticle`
([permissions.ts:155](../apps/web/src/lib/permissions.ts#L155)) and every
contributor filter compare `article.author === currentUser.displayName`. Since
`author` is a writable field ([articles.ts:190](../apps/server/src/routes/articles.ts#L190)),
a contributor who changes their own byline loses the story from their board while
the server still authorises the edit. For legacy rows with no `createdByUserId`
the server falls back to the same string match, making a byline collision an edit
grant — not remotely exploitable (`displayName` is settable only at signup,
[auth.ts:75](../apps/server/src/routes/auth.ts#L75)) but it is a free-text field
standing in for identity.

### M2 — a published story cannot be taken down

`MOVES.published = []` ([workflow.ts:64](../apps/server/src/lib/workflow.ts#L64)).
The only retraction is `DELETE /api/articles/:id`, which needs
`content.draft.edit_any`. A role granted `content.publish` without `edit_any` can
put a story live and cannot pull it back. Blogs are symmetric (`blog.publish` both
directions); stories are not.

### M3 — two pending invites for one address give an arbitrary role

`POST /api/staff` dedupes per-role only ([staff.ts:171](../apps/server/src/routes/staff.ts#L171)),
so contributor + editor invites for one address both persist. First sign-in unions
them ([auth.ts:225-234](../apps/server/src/routes/auth.ts#L225-L234)) and
`primaryStaffRole` takes `slugs[0]` — Mongo document order. `withIdentityDefaults`
then collapses to that one slug, so the other invite is consumed and discarded.
"I invited them as an Editor" and they arrive as a Contributor, with no trace.

Not an escalation: each invite passed `denyRoleGrant` on its way in, and the read
path collapses to a single slug, so the union is never actually granted. The
one-role-per-person invariant holds; the *choice* of role is a coin flip.

**Partly fixed 2026-08-04.** `POST /api/invites/:token/accept` (the one-click link
redemption) replaces rather than unions, and consumes *every* invite row for the
address — so a sibling invite can no longer change the role after the fact on that
path. The `routes/auth.ts` sign-in fallback, for someone who ignores the link and
signs up normally, still unions and still takes `slugs[0]`.

### M4 — resending an invite re-checks nothing

`POST /api/staff/pending/:id/resend` mints a fresh token and extends the expiry
behind `team.manage` alone. `denyRoleGrant` runs when the invite is created
([staff.ts:121](../apps/server/src/routes/staff.ts#L121)) and not here. A team
manager who could not create an `administrator` invite can refresh and re-send one
a superadmin staged, including after the 14-day window has lapsed.

### M5 — `SIDE_NAV.requiresPermission` is dead metadata that has already drifted

[constants.tsx:137](../apps/web/src/pages/newsroom/constants.tsx#L137) says `team`
needs `team.manage`; the server catalogue says `team.view`
([permissionCatalogue.ts:274](../apps/server/src/lib/permissionCatalogue.ts#L274)),
and its comment claims both copies were fixed together. Harmless only because
`visibleNav` filters on module id and never reads the field
([useProductionSystemState.ts:201-204](../apps/web/src/pages/production-system/useProductionSystemState.ts#L201-L204)).
Ten rows carry it. It reads as live config, which is how the drift comes back.
Delete the field from `SideNavItem`.

---

## Low

- **L1** `GET /api/roles` and `/catalogue` are open to `team.view`
  ([roles.ts:77-87](../apps/server/src/routes/roles.ts#L77-L87)), handing the
  complete permission matrix of every role to anyone who may read the roster. The
  stated need is labels and colours; project to those for the `team.view`-only case.
- **L2** Agent endpoints behind Campaign Engine surfaces are guest-reachable and
  unmetered: `agentBlog`, `agentStory`, `agentArticle`, `agentProfile`,
  `agentCompose`, `agentVoice` all use `attachAccountOptional` with no rate limit
  (only `agent.ts`, `agentEditor.ts`, `agentInstant.ts` are gated). Blog Studio's
  server-executed `searchStockPhotos`
  ([blogTools.ts:184](../apps/server/src/lib/agent/blogTools.ts#L184)) burns the
  provider quota anonymously. **No data exposure** — the borrowed register lookups
  fail closed on `account === undefined`
  ([tools.ts:61-88](../apps/server/src/lib/agent/tools.ts#L61-L88)). Cost/abuse
  only; matches docs/AI-AGENTS-AUDIT.md.
- **L3** A "Team Manager" role is not constructible. `denyRoleGrant` requires the
  actor to hold *every* permission in the role being granted, so `team.manage` +
  `team.view` can assign nothing at all — assignment de facto requires
  `administrator`. Correct as a rule; it means the Team screen ships an invite form
  that 403s for the exact role it was built for. Consider a `roles.grant_any`
  escape hatch, or say so in the UI.
- **L4** New modules never reach existing roles. `seedRoles` is insert-only by
  contract, so each new `MODULE_CATALOGUE` row needs a one-off script
  (`grant-emoji-analytics-module.ts`, `grant-instant-module.ts`) plus an API
  restart. Known; see the auto-memory note on adding a Production System module.

---

## What is right, and worth not breaking

- No role slug reaches an authorization decision. `canAccessNewsroom` /
  `isPlatformAdmin` replaced `isStaff` / `isAdmin` by deletion, so the compiler
  enumerated the call sites.
- `AccountUser` can only be produced by `attachAccount`, so an unresolved user
  cannot be permission-checked. Superadmin short-circuits before any lookup and
  survives an empty or corrupt `roles` collection.
- Permissions are a union across held roles with no ranking — the old
  primary-role collapse bug cannot recur.
- `denyRoleGrant` and `checkSuperadminLoss` are single-sourced, which is what
  closed the H4 divergence between `routes/staff.ts` and `routes/roles.ts`.
- The workflow is a move machine, not a field write: `findMove` + per-move
  permission, and `content.draft.edit_any` deliberately does not bypass it.
- `getRoles`' in-flight collapsing clears on both settle paths — a failed read no
  longer parks a rejected promise that breaks every later check.
- Upload authorization is per-*kind* with a fail-closed `misc` default
  ([uploads.ts:67-97](../apps/server/src/routes/uploads.ts#L67-L97)).

## Suggested order

1. **C1** — one guard in `readRoleBody`'s two callers. Closes a full
   privilege-escalation path and is the smallest change here.
2. **H3** — one filter in the pipeline branch of `GET /api/articles`.
3. **H2** — add the magazine/issue permission pair with its enforcement.
4. **H1** — `requireModule` middleware, then make the CI script demand it.
5. M1–M5, then the Lows.
