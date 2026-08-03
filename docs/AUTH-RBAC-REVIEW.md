# Authentication, Role Management & Permissions — Full Review

> Static review of the whole CRM: sign-in, session, the dynamic role registry,
> permission enforcement, racing scope, and entitlement.
> Scope: `apps/server/src/**` (all 38 routers + lib), `apps/web/src/rbac/**`,
> `apps/web/src/lib/permissions.ts`, `apps/web/src/stores/authStore.ts`, route table.
>
> Date: 2026-08-03 · Branch: `enhancement`
>
> **STATUS: C1, C2, C3 and H4 are FIXED** (2026-08-03, P0 of
> [USER-MODEL-PLAN.md](./USER-MODEL-PLAN.md) — see that file's §8 for exactly what shipped,
> including two places the fix went further than this document proposed).
> Everything else below is still open.

---

## Verdict

The *architecture* is genuinely good. The dynamic-RBAC rebuild landed well: no role
slug appears in `lib/rbac.ts`, `AccountUser` vs `IdentityUser` makes "forgot to resolve
permissions" a compile error, superadmin short-circuits before any registry read, the
role cache has a correct generation guard, and the editorial workflow is enforced
server-side with a real transition table (`lib/workflow.ts`) rather than trusting
`body.status`. The JWT deliberately carries no permission data, so a role edit takes
effect on the next request. Those are the hard parts, and they are right.

The problems are almost all in the **layer below the permission check** — the places
where authority comes from a *relationship* rather than a role, and the places where a
gate authorises "editing the record" instead of "the specific change being made".

| Severity | Count | Theme |
|---|---|---|
| **Critical** | 3 | Self-service escalation: two horizontal (reach other people's data), one vertical (reach full admin) |
| **High** | 8 | Unfiltered public reads, gates too coarse for what they protect, unthrottled auth |
| **Medium** | 10 | Identity-by-display-name, unenforced catalogue entries, doc drift, missing indexes |
| **Low** | 10 | Hardening, hygiene, scale |

Three cross-cutting patterns explain most of it:

1. **Mass assignment past the gate.** Every `PUT` handler spreads `...req.body` into
   `$set`. The gate checked the record *as it was*; the handler then lets the caller
   change the very field the gate keyed on. (C1, M2)
2. **Relationship-derived authority is writable by the person it authorises.** Party
   claims, orgs, managed parties and horse↔party links are all self-service, and each
   one feeds `lib/scope.ts`. Nothing checks that the graph wasn't built by the person
   about to benefit from it. (C1, C2, H8)
3. **`newsroom.access` is used as a stand-in for "trusted staff".** It is the floor for
   *any* staff role, including `contributor`, yet it gates the public homepage, the
   racing calendar and bulletin publication. (H3, M3)

---

## CRITICAL

### C1 · Any signed-in reader can gain full write access to any horse in the register

`PUT /api/horsePartyLinks/:id` — [rbac.ts:138-176](../apps/server/src/lib/rbac.ts#L138-L176),
[horsePartyLinks.ts:80-107](../apps/server/src/routes/horsePartyLinks.ts#L80-L107)

`horseScopedWriteGate` resolves the **existing** link's `horse_id` and checks the caller
may manage *that* horse. The handler then does `{ ...body }` — so `horse_id` is
client-settable. Move a link you legitimately own onto someone else's horse and your
party is now currently-linked to it; `authorisedHorseIds()` reads exactly that, so
`accountCanManageHorse()` starts returning true.

Four unprivileged calls, no staff involvement:

```
POST /api/partyClaims        { role: 'owner' }        → mints your own party, pending,
                                                        selfRegistered ⇒ manageable NOW
POST /api/horses             { name: 'x' }            → any signed-in account may create;
                                                        auto-links your party (ownership)
GET  /api/horsePartyLinks                             → public; find your new link id
PUT  /api/horsePartyLinks/<id> { horse_id: <victim> } → gate checks the OLD horse ✅
```

You now hold write access to that horse and, through the same gate, to its `sales`,
`reports`, `mediaItems` and `racingEntries`. `PUT /api/horses/:id` strips
`verificationStatus`, so you cannot un-verify it — but you can rewrite every other
field on a verified public record.

**Fix:** in the gate, when the body carries `horse_id`, authorise the **destination**
as well as the source; and strip `horse_id`/`party_id` from the update in the handler
(links should be delete-and-recreate, not re-pointable). The same `delete update.<key>`
discipline already used for `createdByUserId` and `verificationStatus`.

### C2 · Any reader can self-verify a racing identity, bypassing claim verification entirely

[partyClaims.ts:25-43](../apps/server/src/routes/partyClaims.ts#L25-L43),
[organisations.ts:19-51](../apps/server/src/routes/organisations.ts#L19-L51),
[organisations.ts:164-187](../apps/server/src/routes/organisations.ts#L164-L187)

`verifierTypeFor()` grants the `'org'` verifier path to an `org_owner`/`org_manager` of
any org that manages the claimed party. Both halves are self-service:

```
POST /api/organisations                   → you are org_owner (no approval, no checks)
POST /api/organisations/:id/managed-parties  { name, roles: ['trainer'] }
                                          → party with managedByOrgId = your org
POST /api/partyClaims  { role:'trainer', partyId:<that party> }   → pending
POST /api/partyClaims/<claimId>/verify    → verifierType 'org' → VERIFIED
```

Result: `roles[]` gains `trainer`, and the party flips to
`verificationStatus: 'verified'` — i.e. it appears on the public register as a
**verified** trainer. RBAC.md §7 ("a claim must be VERIFIED before it becomes active",
"read-only until then") is fully bypassable, and the public trust signal is mintable by
anyone with an email address.

The code comment at `orgsForParty` still says *"Phase D wires this up; until then it
resolves to none, so only the admin verifier path is active."* That is **stale** —
`/managed-parties` shipped and sets `managedByOrgId`, which is the only input
`orgsForParty` reads. The comment is what makes this easy to miss on inspection.

**Fix:** the org verifier path must require the org itself to be trustworthy — at
minimum, refuse `verifierType: 'org'` when the verifier is the claimant
(`found.user._id === account.id`), and require the org to be admin-verified before any
of its officers can verify anything. Verifying your own claim should never be legal
regardless of path.

### C3 · `team.manage` escalates to full platform admin in one call

[roles.ts:289-325](../apps/server/src/routes/roles.ts#L289-L325),
[staff.ts:83-132](../apps/server/src/routes/staff.ts#L83-L132)

`POST /api/roles/:slug/assign` is gated on `team.manage` and has **no self-assignment
guard**. `administrator` is seeded with `PERMISSION_CATALOGUE.map(p => p.id)` — every
permission, including `platform.admin` and `roles.manage`.

```
POST /api/roles/administrator/assign  { userId: <your own id> }   → 201
```

You now hold every permission in the platform. `POST /api/staff` with your own email
reaches the same place (an existing member is *moved* to the invited role). The only
thing `team.manage` cannot reach is the `superadmin` slug itself — and superadmin's
practical advantages over `administrator` are the immutability guards, not access.

So the intended separation in RBAC.md §4.4 ("only someone holding `roles.manage` grants
the rest") does not hold: `team.manage` is `roles.manage` with two extra steps.

**Fix:** reject `userId === req.account.id` on assign/unassign (an admin changing their
own role should be a deliberate, separately-gated action), and refuse to assign a role
whose permission set is not a subset of the actor's own — the standard
"no-privilege-amplification" rule. Same guard on `POST /api/staff`.

---

## HIGH

### H1 · `GET /api/articles` is unauthenticated and returns every unpublished story

[index.ts:145](../apps/server/src/index.ts#L145),
[articles.ts:61-64](../apps/server/src/routes/articles.ts#L61-L64)

`articlesWriteGate` returns `next()` immediately for GET without attaching an account,
and the handler filters only `deletedAt`. Every draft, submitted, approved and scheduled
story is public, with `author`, `status`, `scheduledFor`, `assignmentNote` and
`changesRequestedNote` attached — i.e. embargoed stories, the schedule, and editors'
private notes to writers.

This is clearly unintentional: `lib/agent/tools.ts:333` does
`if (!staff) articles = articles.filter(isLiveArticle)` for the *same* data, and
`podcastEpisodes.ts:46` does the equivalent. The REST route is the outlier.

It also makes the whole `workflowStages` axis cosmetic — hiding a Kanban column does
nothing when the underlying list is world-readable.

**Fix:** `attachAccountOptional` on GET, then filter to published unless the caller
holds `newsroom.access` (mirroring the agent tool, which is already correct).

### H2 · Premium entitlement is enforced only in the browser

`canViewContent` / `tierAtLeast` exist **only** in `apps/web/src/rbac/entitlement.ts`.
The server never reads `minTier` — grep returns zero enforcement sites. The paywall in
[ArticleDetail.tsx:554](../apps/web/src/pages/ArticleDetail.tsx#L554) hides paragraphs
2..n of `article.summary`, which `GET /api/articles` returns in full to anonymous
callers.

Independently, `POST /api/subscription` ([subscription.ts:17](../apps/server/src/routes/subscription.ts#L17))
lets any account set its own tier to `premium`. That one is a documented seam
(RBAC.md §8, "manual for now") — but it means there are two independent bypasses, and
the API-level one will survive the billing integration unless `minTier` gets a
server-side gate at the same time.

**Fix:** add the `canViewContent` check server-side on the article/issue/episode read
paths (strip or truncate the gated field), before wiring payments. The client gate
should be an affordance, never the boundary — which is what `lib/permissions.ts` already
says about permissions.

### H3 · `newsroom.access` gates the public website and bulletin publication

[index.ts:149,163,175,176](../apps/server/src/index.ts#L149-L176)

`staffWriteGate` and `issuesGate` check `newsroom.access` and nothing else. That is the
floor permission held by `contributor` — whose entire purpose per RBAC.md is
"draft and submit only". A contributor can therefore:

| Endpoint | What it controls |
|---|---|
| `POST/PUT /api/breakingNews` | the public homepage breaking-news ticker |
| `POST/PUT /api/sponsors` | public sponsor placements |
| `POST/PUT /api/races` | the racing calendar |
| `POST/PUT/DELETE /api/issues` | publishing and unpublishing magazine bulletins |

`content.publish` and `content.bulletin` are checked meticulously for *articles*
([workflow.ts](../apps/server/src/lib/workflow.ts)) and not at all for any of the above.
A contributor cannot publish their own story but can push content straight onto the
front page.

**Fix:** these need real actions. `issues` writes → `content.bulletin` /
`content.publish`; `sponsors`/`breakingNews` → a `site.content.manage` action;
`races` → a racing-data action. `staffWriteGate` should be reserved for genuinely
"any staff member" surfaces.

### H4 · A non-superadmin can strip `superadmin` from someone else

[roles.ts:327-348](../apps/server/src/routes/roles.ts#L327-L348) vs
[staff.ts:240-268](../apps/server/src/routes/staff.ts#L240-L268)

`DELETE /api/roles/superadmin/assign/:userId` checks only `superadminHolderCount() <= 1`.
`staff.ts` has the additional guard the roles router is missing:

```ts
if (acct.staffRoles.includes(SUPERADMIN_SLUG) && !req.account!.isSuperAdmin) {
  res.status(403).json({ error: 'Only a superadmin can remove another superadmin.' })
```

So with two superadmins on the platform, anyone holding `team.manage` can demote one of
them. Two paths to the same operation, two different rule sets — the classic shape of
an access-control bug.

**Fix:** lift both guards (last-holder *and* only-a-superadmin) into one helper in
`roleRegistry.ts` and call it from every path that can take the slug away: `roles`
assign, `roles` unassign, `staff` invite-move, `staff` member-delete.

### H5 · No rate limiting on any authentication endpoint

`lib/rateLimit.ts` exists and is applied to `/api/agent/*` and `/api/magazinesV2` —
but `app.use('/api/auth', authRouter)` and `app.use('/api/admin', adminRouter)` are
mounted bare.

- **`POST /api/auth/request-otp`** — the only limit is a 30 s per-email resend cooldown.
  Unlimited addresses ⇒ mail-bombing through your Resend account, and unbounded writes
  to `otps` (see M7).
- **`POST /api/auth/verify-otp`** — 5 attempts per OTP row, but requesting a new code
  resets that. No per-IP ceiling.
- **`POST /api/admin/seed`** — unauthenticated, unthrottled, and compares with
  `req.body?.secret !== secret` (non-constant-time). Guessing `SETUP_SECRET` mints a
  **superadmin on an arbitrary email**. The repo's own `.env` has a 12-character secret.

**Fix:** `rateLimit('otp-request', 5, 60_000)` and `rateLimit('otp-verify', 10, 600_000)`
on the auth router (note: the limiter currently skips GET — fine here, all POSTs), a
tight limit on `/api/admin/seed`, `crypto.timingSafeEqual` for the secret compare, and
operationally: unset `SETUP_SECRET` once the first superadmin exists.

### H6 · `DEV_OTP_CODE` is a full auth bypass that PROD does not disable

[auth.ts:21-29,82-99](../apps/server/src/routes/auth.ts#L21-L99)

When set, every OTP request uses a fixed code, sends no email, **and returns the code in
the response body** — for any existing email address, i.e. sign in as anyone. It is
gated *solely* on the variable being present; `IS_PROD` deliberately does not disable it.

`apps/server/.env` in this repo currently has **both** `PROD=true` and
`DEV_OTP_CODE=123456`. Every other dangerous default in this codebase fails closed on
`PROD` (JWT secret → `process.exit(1)`; OTP delivery → 503; fixed `123456` fallback →
refused). This is the one that doesn't, and it is the most dangerous of the set. One
copied env block from a working local setup is total compromise.

**Fix:** refuse to honour `DEV_OTP_CODE` when `PROD=true` (log and ignore), or require a
second explicit `ALLOW_DEV_LOGIN=true`. The friction the comment worries about is a
one-line env change; the downside is unauthenticated superadmin.

### H7 · Claim evidence and private files are served without authentication

[uploads.ts:140-170](../apps/server/src/routes/uploads.ts#L140-L170)

`GET /api/uploads/file/*` is public by design ("so it works in `<img>` tags"), relying
on UUID-prefixed keys being unguessable. But `ALLOWED_KINDS` includes `evidence` — the
`kind` used for `PartyClaim.evidenceUrl`, i.e. identity documents proving someone is a
licensed trainer. Those URLs are then handed to every verifier via
`GET /api/partyClaims/pending`, stored on the user doc, and (per C2) reachable by
self-appointed org verifiers.

Security-by-URL-secrecy is not appropriate for PII: the URL leaks through referrers,
browser history, proxy logs, and any of the several places the claim object is echoed
back.

**Fix:** split the route — public passthrough for `party`/`horse`/`media`/`avatar`, and
an `attachAccount` + authorisation check for `evidence` (and anything else private).
Long-term, presigned time-limited GETs.

### H8 · Every org membership grants write scope, including `org_member`

[scope.ts:92-102](../apps/server/src/lib/scope.ts#L92-L102)

```ts
const partyIds = [
  ...manageablePartyIds(account),
  ...account.orgMemberships.map((m) => m.orgId),   // ← orgRole never consulted
]
```

`authorisedHorseIds` is the input to `accountCanManageHorse`, so **any** member of an org
can write every horse the org is linked to, plus its sales, reports, media and racing
entries. RBAC.md §4.3 is explicit that `org_member` "Cannot edit org-wide data" and
§6 that access is "their org role × the org's scope". The role half is dropped.

An `org_owner` adding a colleague as a plain viewer is silently handing them full write.

**Fix:** filter to `org_owner`/`org_manager` when computing write scope, and give
read-scope its own function — the two are currently conflated because
`authorisedHorseIds` is used for both visibility filtering (`horses.ts:40`) and write
authorisation (`rbac.ts:124`). Those need to diverge.

---

## MEDIUM

### M1 · `roles.manage` and `team.manage` are each equivalent to superadmin

`roles.manage` can edit any non-immutable role, including one it holds, and add
`platform.admin` to it. `wouldSelfLockOut` only prevents *removing* `roles.manage` from
yourself — nothing prevents *adding* anything. `team.manage` gets there via C3.

RBAC.md §4.4 frames these as two graduated powers below superadmin. In practice both are
total. Worth stating plainly in the doc even if it is accepted: there are effectively two
privilege levels, not four.

### M2 · Ownership is keyed on `displayName`, and `author` is client-settable

- [rbac.ts:246](../apps/server/src/lib/rbac.ts#L246) — `doc.author === account.displayName`
- [podcastEpisodes.ts:91,138](../apps/server/src/routes/podcastEpisodes.ts#L91) — `existing.producedBy === displayName`

`POST /api/articles` requires `body.author` and never forces it to the caller, and `PUT`
lets it be rewritten. So: a contributor can publish-path a story under someone else's
byline; two staff with the same display name share `edit_own` on each other's drafts; and
a story whose author string is edited stops being "own" for its actual author. Every other
ownership check in the codebase correctly uses `createdByUserId`
([recordSharing.ts](../apps/server/src/lib/recordSharing.ts), `magazineV2/access.ts`).

**Fix:** stamp `createdByUserId` on articles/episodes and key `edit_own` on it; keep
`author` as a display byline only, server-defaulted to the caller.

### M3 · "Authorised-only" record visibility is unimplemented

[reports.ts:13-22](../apps/server/src/routes/reports.ts#L13-L22) carries its own TODO.
Non-staff see only `visibility: 'public'` rows — so the owner of a horse cannot see the
private vet report attached to it, which is precisely the case RBAC.md §6 describes
("visible only if the user has a current link to that horse"). Meanwhile *every*
`newsroom.access` holder sees all of them. Both halves are wrong: too tight for parties,
too loose for staff. Also `PUT /api/reports/:id` can re-point `horse_id` (same
mass-assignment shape as C1, without the escalation).

### M4 · The Modules and Workflow-stages axes have no server enforcement

`accountCanOpenModule` is exported from `rbac.ts` and **never called** — zero call sites
server-side. `workflowStages` is likewise never consulted outside the client. RBAC.md
§4.5/§10 admits this, but the practical consequence is worth naming: those two thirds of
the "define a role" screen are presentation. The web app does gate correctly
([ProductionSystemLayout.tsx:111-128](../apps/web/src/pages/production-system/ProductionSystemLayout.tsx#L111-L128)
blocks direct URL entry), so the *UI* is consistent — but any data those screens read
is protected only by whatever the underlying endpoint checks, which for H1/H3 is nothing.

### M5 · Catalogue entries that are never enforced anywhere

Grep of every `accountCan`/`contentCan`/`identityCan` site: 18 of 42 catalogue actions
have **no** server enforcement.

| Action | Status |
|---|---|
| `podcast.episode.publish` | **Mis-wired** — publishing checks `podcast.episode.approve` instead. Grant "Publish episodes" and nothing happens. |
| `podcast.manage`, `podcast.audio.upload`, `podcast.guests.manage`, `podcast.episode.schedule`, `podcast.episode.submit_review`, `podcast.distribution.manage` | Client-only (`allowedNextStatuses` in `lib/permissions.ts`); server accepts any status move via `edit_any`/`edit_own` |
| `media.upload_own`, `media.manage_all` | Module gating only; `/api/uploads` checks `requireAuth` alone |
| `compensation.view_own`, `compensation.view_all`, `compensation.manage` | No endpoint exists |
| `settings.view`, `settings.manage`, `analytics.view` | Module gating only |
| `team.view` | **Dead** — the `team` module requires `team.manage`, and `/api/staff` requires `team.manage` |
| `workflow.view_all_columns`, `workflow.view_own_columns` | Superseded by the `workflowStages` axis |
| `content.compliance`, `content.publisher_review` | Retired stages; no move references them |
| `content.legal_review` | Only in `agent/capabilities.ts` copy |

These are checkboxes that promise something they do not deliver — the most confusing
possible failure mode for an admin defining a role. Either wire them or drop them from
the catalogue (the catalogue is the single source of truth for the UI, so removing an
entry removes the checkbox with no frontend change).

### M6 · `users.email` is not unique

[ensureIndexes.ts:41](../apps/server/src/lib/ensureIndexes.ts#L41) creates
`{ email: 1, deletedAt: 1 }` **without** `unique`. The `roles.slug` index right below it
gets the treatment and the comment explaining why ("two concurrent creates would
otherwise both pass the application-level check") — the same argument applies to signup,
which does exactly that check at `auth.ts:191`. Duplicate accounts make
`find({ email })[0]` arbitrary, so sign-in, invites and org member-add could each pick a
different row.

**Fix:** same partial-unique treatment as `roles.slug` (partial on `deletedAt: null`,
since deletes are soft).

### M7 · The `otps` collection grows forever and is scanned on every sign-in request

No index on `otps` in `INDEX_SPECS`, and `db.deleteOne` is a **soft** delete — so
`clearOtps` stamps `deletedAt` and the row stays. `latestOtp()` does
`find({ email })`, which is a collection scan against a monotonically growing collection,
triggered by an **unauthenticated** endpoint with no rate limit (H5). That combination is
a cheap availability attack, and a slow-degradation problem even without one.

**Fix:** index `{ email: 1, deletedAt: 1, createdAt: -1 }`, plus a TTL index on
`expiresAt` (needs a real `Date`, not the ISO string currently stored) or a hard-delete
path for `otps`.

### M8 · Account enumeration on `/api/auth/request-otp`

`mode: 'login'` → `404 "No account found with that email address."`;
`mode: 'signup'` → `409 "An account with this email already exists."` A clean oracle for
whether any address is registered. `routes/invites.ts` reasons carefully about exactly
this leak and returns identical 404s for unknown vs expired tokens — the auth route
should hold the same line.

### M9 · CORS `*`, token in localStorage, and SVG uploads on the API origin

- `cors({ origin: '*' })` ([index.ts:41](../apps/server/src/index.ts#L41)) — low direct
  risk since auth is a Bearer header rather than a cookie (no CSRF), but it permits any
  page to script the API with a token it obtains.
- The JWT is persisted by `zustand/persist` under `stablepress-auth` in localStorage, so
  any XSS is a 7-day session theft with no revocation (L5).
- `IMAGE_TYPES` includes `image/svg+xml`, and `/api/uploads/file/*` serves it back with
  that `Content-Type` — stored script execution on the API origin, uploadable by any
  authenticated account. It cannot read the web app's localStorage across origins, but it
  can call the API with the viewer's cookies-free session if a token ever reaches it, and
  it is a phishing surface on your own domain.

**Fix:** drop `image/svg+xml` or serve uploads with
`Content-Disposition: attachment` + `Content-Security-Policy: sandbox`; restrict CORS to
the known web origins.

### M10 · RBAC.md has drifted from the code

| RBAC.md says | Code does |
|---|---|
| §4.4 "Any number of users may hold any role; `staffRoles[]` is an array" | `POST /:slug/assign` **replaces**: `{ staffRoles: [role.slug] }`. One role per person (documented in the route, not the spec). |
| §4.5 "Effective access = union across every role the user holds" | True in `resolveAccount`, but unreachable — assignment can never produce two roles. `wouldSelfLockOut`'s multi-role reasoning is dead code. |
| §7 "org owner/manager approves if the party is linked to an org they own" | Live and self-servable (C2). The `orgsForParty` comment still claims it "resolves to none". |
| §4.4 four seeded roles | Correct. |
| §10 "custom roles are UI-scoped today" | Still accurate — see M4. |

Also: `MODULE_CATALOGUE`'s `team` entry requires `team.manage`, which strands
`team.view` (M5); the comment on the `roles` entry explains this reasoning for roles but
the same fix wasn't applied to team.

---

## LOW

| # | Finding |
|---|---|
| L1 | `PUT /api/tipperProfiles/:id` strips `totalWon` but **not** `coinBalance` — a user can set their own play-money balance. |
| L2 | `POST /api/tipping/resolve` — any signed-in user can resolve any race at will (acknowledged in the comment; the payout maths is server-side, so impact is timing only). |
| L3 | `hashOtp` is unsalted SHA-256 over a 10⁶ space — a DB leak inverts every live code by rainbow table. 10-minute TTL limits it. Use an HMAC with a server pepper. |
| L4 | `requireAuth`/`optionalAuth` verify the token but never confirm the user still exists. `/api/uploads` uses `requireAuth` and keys S3 objects on `req.user.sub`, so a removed account can upload for up to 7 days. `attachAccount` does check. |
| L5 | No session revocation: 7-day JWT, no `jti`, no token version on the user doc. Role changes take effect live (good), but you cannot sign someone out. |
| L6 | `POST /api/parties` accepts an arbitrary `roles[]` of unvalidated strings (`organisations.ts` filters against `PARTY_ROLES`; `parties.ts` doesn't). |
| L7 | `DELETE /api/articles/:id` requires `content.draft.edit_any`, so an author cannot delete their own draft. |
| L8 | `wouldSelfLockOut` guards only `roles.manage` — a role-manager can drop `newsroom.access` from their own role and lose the UI (recoverable only by another admin). |
| L9 | `rateLimit` buckets and the role cache are both in-process: on more than one API instance, limits multiply by instance count and a role edit takes up to 60 s to reach the others. Both are documented; noted here because RBAC correctness now depends on it. |
| L10 | `GET /api/newsroom/summary` returns whole-newsroom `byStatus` aggregates to any `newsroom.access` holder, ignoring their `workflowStages`. Minor, and moot while H1 stands. |

---

## What is done well (don't regress these)

- **`AccountUser` vs `IdentityUser`.** Only `attachAccount` can produce something
  `accountCan` accepts, so a missing resolution is a compile error. This is the single
  best structural decision in the auth layer.
- **No role slugs in `rbac.ts`.** Deleting `isStaff`/`isAdmin` rather than deprecating
  them forced the compiler to enumerate every call site.
- **Superadmin short-circuit before any registry read** — an empty or corrupt `roles`
  collection cannot lock the platform out, and `toClientUser` correctly derives the
  superadmin payload from the catalogue rather than the (possibly missing) row.
- **Role cache generation counter** and the `finally`-clears-`inflight` fix. Both are
  real bugs that were found and fixed correctly; the comments explain why.
- **`lib/workflow.ts`.** A transition table plus `enterPermission` for creates closes the
  self-publish hole properly, and the comment records exactly what was broken.
- **Invite tokens.** Hashed at rest, identical 404 for unknown vs expired, rotate on
  resend, `sanitizeRedirect` covers `//` and `/\`, and the token is explicitly *not* a
  credential — mailbox control via OTP is still required. Textbook.
- **`recordSharing.ts` / `magazineV2/access.ts`.** Owner-vs-shared is keyed on user id,
  shares are read-only, and `newsroom.access` deliberately does not grant visibility.
- **Agent tools** reuse the REST visibility rules rather than re-deriving them — which is
  how H1 was caught.

---

## Suggested order

1. **C1, C3, H4** — small, contained, each closes an escalation. `delete update.horse_id`,
   a self-assignment guard, one shared superadmin guard.
2. **C2** — refuse self-verification, then decide the org-trust rule.
3. **H1, H2** — one filter each; H1 has a correct implementation to copy from `agent/tools.ts`.
4. **H6, H5** — env-gate the bypass, add three `rateLimit` calls, timing-safe compare.
5. **H8, H3** — need a decision on the read/write scope split and on which action gates
   each public surface.
6. **H7, M6, M7** — evidence authorisation; two index changes.
7. **M5** — wire or delete. `podcast.episode.publish` first: it is actively misleading.
8. **M2, M3** — the `createdByUserId` migration and the report-scope TODO.
9. **M10** — update RBAC.md once the above settles, so the spec stops disagreeing with
   the code.
