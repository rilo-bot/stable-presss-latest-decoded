# Auth System — Function Inventory

Every function, type, endpoint and collection in the auth / admin / invite surface,
as it stands after the consolidation and the link-model change (2026-08-11).

**Purpose: a review sheet.** Each entry says what it does, who calls it, and how
many places. Work through it, mark what you want gone or changed, and I'll do the
removals in one pass.

### How to read the call counts

`ext=N files=M` — N references outside the defining file, across M files.
Generated mechanically over `apps/server/src`, `apps/server/scripts` and
`apps/web/src`.

⚠ **Counts for short or common names are inflated** — the scan is word-based, so
`can` (685), `isAdmin` (156), `Role` (58) and `Session` (4) pick up prose in
comments and unrelated identifiers. Trust these two signals only:

- **`ext=0`** — genuinely not referenced outside its own file. A real removal candidate.
- **the file list** — who actually imports it.

---

## 1. Collections

| Collection | Shape | Constraint |
|---|---|---|
| `users` | `_id, name, email, isAdmin, lastLogin, createdAt, updatedAt` | `email` unique (partial on `deletedAt:null`) |
| `roles` | `_id, name, label, description, color, icon, isSystem, isImmutable, isSuper, permissions[], modules[], workflowStages[], createdBy, createdAt, updatedAt` | `name` unique (partial) |
| `adminRoles` | `_id, userId, roleId, assignedAt, assignedBy?` | **`userId` unique (partial)** — one role per admin |
| `otps` | `_id, email, codeHash, name?, attempts, expiresAt, createdAt` | `email + deletedAt + createdAt` |
| `pendingStaffGrants` | `_id, email, role, tokenHash, expiresAt, invitedBy, invitedByName, redirectTo?, lastSentAt, createdAt` | `tokenHash`, `email` |

Declared in `src/lib/collections.ts` as `USERS`, `ROLES`, `ADMIN_ROLES`, `OTPS`,
`INVITES` (note: the `INVITES` constant maps to the collection literally named
`pendingStaffGrants`).

**An account is an admin when `users.isAdmin === true`.** Which role they hold is
the one `adminRoles` row pointing at them. A normal reader has neither.

---

## 2. `src/lib/auth.ts` — tokens & middleware

| Function | ext | Called from | What it does |
|---|---|---|---|
| `genOtp()` | 2 / 1 | routes/auth | 6-digit code from `crypto.randomBytes` |
| `hashOtp(code)` | 3 / 1 | routes/auth | sha256 hex. **Unsalted — see review L2** |
| `signToken(claims)` | 3 / 1 | lib/session | JWT, 7-day TTL, `{sub, email, v}` |
| `claimsFromHeader(req)` | — | internal | parses `Bearer`, verifies signature + expiry |
| `failClosed(req, res, err)` | — | internal | **500s an unexpected resolution failure instead of hanging the request** (see below) |
| `isRevoked(claims, doc)` | — | internal | `claims.v` vs `users.tokenVersion`. **DEAD — nothing writes tokenVersion (review H2)** |
| `loadAccount(req)` | — | internal | **the shared body.** Resolves onto `req.account`, returns `'ok' \| 'no-token' \| 'no-account' \| 'revoked'`. Never touches the response |
| **`attachAccount`** | 56 / 18 | rbac.ts + 17 routers | `loadAccount` → 401 on anything but `ok`. THE only producer of `req.account`, and the only 401 in the API |
| **`attachAccountOptional`** | 34 / 13 | rbac.ts + 12 routers | `loadAccount` → **discards the outcome**. For public reads shaped by the reader |

**Merged 2026-08-11.** Both used to retype the same four-step sequence
(`claimsFromHeader → findById → isRevoked → resolveAccount`) to express a one-line
policy difference, and they had already drifted: the optional form was **missing
the idempotency guard**, so mounting it at both router and route level cost a
second user lookup plus every `resolveAccount` query. `routes/comments` was
working around that by hand, in a comment that said so.

Now one `loadAccount` does the work — idempotent for both — and each export is
three lines. The two names stay separate deliberately: they are one mechanism
with opposite policies, and a `{ optional: true }` flag would make the safe
choice the one you get by forgetting.

Verified after the merge: all three 401 messages still distinct
(`Authentication required` / `Account not found` / session-ended), success path
resolves 38 permissions, and a draft blog post returns `total=0` anonymously vs
`total=1` with a staff token on the same URL.

### Hang fix — a failed session resolution used to never answer

Both middlewares are `async`, and Express 4 does not forward a rejected promise
from one. Any unexpected throw — realistically Mongo being briefly unreachable
under `resolveAccount` — became an unhandled rejection: logged by the
process-level handler, server stays up, **and the request never gets a
response.** Measured at 15s (client timeout) on `/api/staff`.

Fixed at the source, in `attachAccount` / `attachAccountOptional`, not at the
call sites — `attachAccount` is mounted directly in ~18 routers that never touch
rbac.ts, so a wrapper there fixes only a fraction. A first attempt did exactly
that and `/api/staff` still hung; the injected-failure test is what caught it.

`rbac.ts` additionally gained `runAuth`, which is still needed for a different
reason: several gates pass an `async () => {…}` as `next`, and `attachAccount`
does not await it, so a throw in the *continuation* was a second way to hang.

Verified by temporarily injecting a throw into `loadAccount` and hitting every
mounting style — all seven answered **HTTP 500 in under 35ms**:

| Route | Mount style | Before | After |
|---|---|---|---|
| `POST /api/races` | rbac `adminGate` | hang | 500 |
| `POST /api/sales` | rbac `horseScopedWriteGate` | hang | 500 |
| `GET /api/blogs` | rbac optional | hang | 500 |
| `GET /api/staff` | `router.use(attachAccount)` | **hang** | 500 |
| `GET /api/roles` | `router.use(attachAccount)` | hang | 500 |
| `GET /api/analytics/*` | `router.use(attachAccount)` | hang | 500 |
| `GET /api/comments` | `router.use(attachAccountOptional)` | hang | 500 |

The injected failure was removed afterwards; `grep` for `x-throw-test` confirms
nothing remains.

Note the optional form answers 500 too rather than proceeding. An anonymous
caller can never reach this path — `loadAccount` returns before touching the
database when there is no token — so only signed-in users are affected, and
silently downgrading an author to the logged-out view of their own drafts reads
as data loss rather than an incident.

**Review note on `attachAccountOptional`** — 10 of its 17 mounts are correct
(public data personalised by who's asking). **7 are the open Critical**: the AI
routers `agent`, `agentArticle`, `agentBlog`, `agentStory`, `agentProfile`,
`agentVoice` (×2) are reachable anonymously and spend the model key for free.
`agentCompose` and `agentInstant` were already moved off it for exactly this
reason. → candidate: switch those 7 to `attachAccount` + `rateLimit`.

---

## 3. `src/lib/session.ts` — accounts & sessions

| Function | ext | Called from | What it does |
|---|---|---|---|
| `nameFromEmail(email)` | **0** | internal only | `jane.f2@` → `"Jane Fitzgerald"`. **Exported but nothing outside uses it — drop the `export`** |
| `findUserByEmail(email)` | 4 / 2 | routes/admin, routes/staff | one live user or null |
| **`findOrCreateUser(email, name?)`** | 9 / 4 | auth, invites, admin, grant-superadmin | THE account creator. Catches E11000 → re-reads winner |
| **`issueSession(userDoc)`** | 4 / 2 | auth, invites | THE session issuer |
| `markSignedIn(userDoc)` | 2 / 1 | routes/auth | THE only writer of `lastLogin` |
| type `UserDoc` | 4 / 1 | roleGrant | |
| type `Session` | — | — | count is noise (word collision) |

---

## 4. `src/lib/roleRegistry.ts` — definitions + the link

| Function | ext | Called from | What it does |
|---|---|---|---|
| `projectRole(doc)` | 3 / 1 | routes/roles | raw doc → `RoleDoc` |
| `bustRoleCache()` | 12 / 4 | seedRoles, routes/roles, 2 scripts | generation-counter invalidation |
| `getRoles()` | 16 / 4 | invites, roles, staff | all definitions, 60s cache, keyed by id **and** name. **Serves the stale map if a reload fails**, rather than rejecting into a hung request |
| `listRoles()` | new | routes/roles, grant-superadmin | **Use this to ITERATE.** `getRoles()` keys each role twice, so iterating it yields everything double — two call sites were de-duplicating by hand, one of them relying on both keys sharing an object reference |
| `getRole(idOrName)` | 6 / 3 | effectiveAccess, admin, grant-superadmin | one definition |
| `linkForUser(userId)` | 3 / 1 | effectiveAccess | the one link row |
| `linksForUsers(ids[])` | 2 / 1 | routes/staff | many links, ONE query (roster) |
| `roleOfUser(userDoc)` | 14 / 5 | roleGrant, admin, invites, staff, script | gated on `isAdmin` first |
| **`assignRole(userId, roleId, by?)`** | 18 / 9 | roleGrant, admin, invites, script | link **then** `isAdmin:true` |
| **`clearRole(userId)`** | 4 / 3 | roleGrant, check-admins | `isAdmin:false` **then** delete link |
| `clearRoleEverywhere(roleId)` | 2 / 1 | routes/roles | unassign before deleting a definition |
| `assigneeCounts()` | 2 / 1 | routes/roles | holders per role |
| `superadminCount()` | 2 / 1 | routes/admin | used by the last-superadmin floor |
| `denyRoleGrant(actor, role, isSelf)` | 4 / 1 | roleGrant | self-check + amplification |
| `checkSuperadminLoss(actor, losing)` | 5 / 2 | roleGrant, invites | the floor |
| type `RoleDoc` | 12 / 5 | | |
| type `AdminRoleLink` | **0** | internal only | **drop the `export`** |

**Write ordering is load-bearing.** Both directions fail closed — a half-applied
change is always "no access", never "access they shouldn't have". Don't reorder
these two functions without reading the header comment.

---

## 5. `src/lib/roleGrant.ts` — the shared guard sequence

| Function | ext | Called from | What it does |
|---|---|---|---|
| `canOfferRole(actor, role)` | 2 / 1 | routes/staff | actor-vs-role only. **Exists for the invite path, which has no user doc** |
| `grantRoleTo(actor, target, role)` | 4 / 2 | routes/roles, routes/staff | full sequence |
| `revokeRoleFrom(actor, target, expected?)` | 4 / 2 | routes/roles, routes/staff | full sequence |
| `findUserById(userId)` | 3 / 1 | routes/roles | |
| type `RoleChange` | **0** | internal only | **drop the `export`** |

---

## 6. `src/lib/effectiveAccess.ts` — what may this account do

| Function | ext | Called from | What it does |
|---|---|---|---|
| **`resolveAccount(identity)`** | 16 / 9 | auth, session, comments, ownedRecordRoutes, magazinesV2, … | THE only producer of `AccountUser`. 3 parallel reads |
| `toPartyRows(rows)` | 12 / 3 | agent/tools, organisations, parties | joins `people` in, one query per batch |
| **`accountCan(account, action)`** | (noisy) 17 files | everywhere | THE authorization check. `isSuper` short-circuits |
| `accountCanAny(account, actions[])` | 4 / 2 | rbac, uploads | |
| `accountCanOpenModule(account, id)` | 2 / 1 | rbac | |
| `identityCan(identity, action)` | 2 / 1 | magazinesV2 | resolve-then-check for a *different* user |
| **`toClientUser(account)`** | 6 / 3 | session, routes/auth | THE wire payload |
| type `AccountUser` | 75 / 18 | | |

---

## 7. `src/lib/rbac.ts` — route gates

| Function | ext | Called from |
|---|---|---|
| `isAdmin(account)` | (noisy) 45 files | everywhere |
| `isPlatformAdmin(account)` | 12 / 4 | capabilities, newsroom, organisations, uploads |
| `canViewTeam` / `canManageTeam` | 13–15 / 5 | routes/roles, routes/staff + 3 web screens |
| `canManageRoles` | 12 / 4 | routes/roles + 3 web screens |
| `orgRoleIn` / `canManageOrg` / `isOrgOwner` | 3–4 / 1–2 | routes/organisations |
| `adminGate(opts)` | 5 / 1 | routes/index |
| `authedWriteGate` | 5 / 2 | routes/index, tips |
| `horseScopedWriteGate(opts)` | 6 / 1 | routes/index |
| `partyScopedWriteGate` | 5 / 2 | routes/index |
| `personScopedWriteGate` | 2 / 1 | routes/index |
| `articlesWriteGate` | 3 / 2 | routes/index, workflow |
| `blogsWriteGate` | 6 / 5 | routes/index, blogs, blogs/media |
| `ownsArticle(doc, account)` | 1 / 1 | podcastEpisodes |

`ownsArticle` has a single external caller, in a *podcast* route — worth a look.

---

## 8. `src/lib/invites.ts`

`generateInviteToken()` (32 bytes) · `hashInviteToken()` · `inviteExpiry()` ·
`expiresInLabel()` · `isExpired(row)` · `findInviteByToken(raw)` ·
`inviteUrl(base, token)` · **`sanitizeRedirect(v)`** (open-redirect guard, also
mirrored in web `safeRedirect.ts`) · `magazinePath()` · `absoluteUrl()` ·
`INVITE_RESEND_COOLDOWN_MS`

All single-caller except `sanitizeRedirect` (3) and `magazinePath` (3).
`magazinePath` / `absoluteUrl` are magazine helpers living in the invites file —
arguably misfiled.

---

## 9. Endpoints

### Auth — `src/routes/auth/index.ts`
| Method | Path | Gate |
|---|---|---|
| POST | `/api/auth/start` (alias `/request-otp`) | rateLimit 8 / 15 min per IP |
| POST | `/api/auth/verify` (alias `/verify-otp`) | rateLimit 15 / 15 min per IP |
| GET | `/api/auth/me` | `attachAccount` |

Internal helpers: `normalizeEmail`, `latestOtp`, `clearOtps`, `storeOtp`.
The aliases are transitional — droppable once a deploy has settled.

### Invites — `src/routes/invites/index.ts`
| Method | Path | Gate |
|---|---|---|
| GET | `/api/invites/:token` | public; grants nothing |
| POST | `/api/invites/:token/accept` | rateLimit 20 / 5 min |

### Team — `src/routes/staff/index.ts`
| Method | Path | Gate |
|---|---|---|
| GET | `/api/staff/directory` | `isAdmin` (before the team gate — share dialogs) |
| GET | `/api/staff` | `team.view` |
| POST | `/api/staff` | `team.manage` → `canOfferRole` → `grantRoleTo` **or** stage invite |
| POST | `/api/staff/member/:userId/resend` | `team.manage` |
| DELETE | `/api/staff/member/:userId` | `team.manage` → `revokeRoleFrom` |
| POST | `/api/staff/pending/:id/resend` | `team.manage`; issues a FRESH token |
| DELETE | `/api/staff/pending/:id` | `team.manage` |

Internal: `actorName(req)`, `adminRoster()`, `lastMemberNotify` map.

### Roles — `src/routes/roles/index.ts`
| Method | Path | Gate |
|---|---|---|
| GET | `/api/roles/catalogue` | read gate |
| GET | `/api/roles` | read gate |
| POST | `/api/roles` | `roles.manage` |
| PUT | `/api/roles/:name` | `roles.manage` — **missing amplification check (H3)** |
| DELETE | `/api/roles/:name` | `roles.manage` |
| POST | `/api/roles/:name/assign` | `team.manage` → `grantRoleTo` |
| DELETE | `/api/roles/:name/assign/:userId` | `team.manage` → `revokeRoleFrom` |

Internal: `requireDefineRoles`, `requireAssignRoles`, `slugify`, `readRoleBody`,
`wouldSelfLockOut`.

### Bootstrap — `src/routes/admin/index.ts`
| Method | Path | Gate |
|---|---|---|
| POST | `/api/admin/seed` | `SETUP_SECRET` + self-disables once a superadmin exists |

Internal: `secretMatches` (constant-time).

---

## 10. Web

### `stores/authStore.ts`
`requestOtp(email, name?)` · `verifyOtp` · `acceptInvite` · `verifySession` ·
`logout` · `hydrateUser` (internal) · `postJson` (internal)
Selectors: `useHasRole` · `useIsAdmin` · `useActivePartyRoles`
Types: `AuthUser`, `ResolvedAccess`, `PartyRow`, `OrgMember`, `AssignedRole`

### `lib/api.ts`
`apiUrl` · **`authFetch`** (401 → logout) · `authFetchRetry`

### `lib/permissions.ts`
`can` · `useCan` · `canOpenModule` · `visibleWorkflowStages` · `isSuperAdmin` ·
`canAny` · `canEditArticle` · `canEditEpisode`
**`canAll` — ext=0** · **`allowedNextStatuses` — ext=0**

### `rbac/guards.tsx`
`RequireAuth` · `RequirePermission` · `RequireAdmin`

### `rbac/can.ts`
`orgRoleIn` · `authorisedHorseIds` · `writableHorseIds` · `canManageHorse` ·
`canManageParty` · `canManagePerson` · `primaryPartyId` · `isAdmin`
**ext=0: `myPartyIds`, `myPersonIds`, `canAdmin`, `canViewAuthorisedRecord`, `primaryPersonId`**
(`myPartyIds`/`myPersonIds` are used *inside* the file — the export is what's unused.)

---

## 11. Scripts

| Command | File | Purpose |
|---|---|---|
| `npm run check:permissions` | check-permission-enforcement.ts | 38 catalogue permissions, 0 unenforced |
| `npm run check:admins` | check-admins.ts | `users.isAdmin` vs the links. `--fix` |
| `npm run migrate:admin-roles` | migrate-admin-roles.ts | roleId → link model. `--apply`. **Applied to local only** |
| `npm run sync:roles` | sync-role-catalogue.ts | reconcile stored roles with the catalogue |
| `npm run grant:superadmin` | grant-superadmin.ts | lockout recovery. **Needs `MONGODB_URI=` inline — no dotenv** |
| — | clean-user-model.ts | **STALE — do not run until reviewed** (§13) |

---

## 12. Removal candidates

Nothing here is broken; these are the things the scan says nobody uses.

**Unused exports** (function stays, `export` goes):
- `session.ts` → `nameFromEmail`
- ~~`roleGrant.ts` → type `RoleChange`~~ — **done**
- ~~`roleRegistry.ts` → type `AdminRoleLink`~~ — **done**
- `rbac/can.ts` → `myPartyIds`, `myPersonIds`

**Moved** (2026-08-11): `denyRoleGrant` and `checkSuperadminLoss` left
`roleRegistry.ts` for `roleGrant.ts`. They are policy, not storage, and
`roleGrant.ts` was their only caller. `roleRegistry.ts` now does one job: reading
and writing role definitions and the links to them.

**Entirely unused** (safe to delete outright):
- `lib/permissions.ts` → `canAll`, `allowedNextStatuses`
- `rbac/can.ts` → `canAdmin`, `canViewAuthorisedRecord`, `primaryPersonId`

**Misfiled rather than unused:**
- `magazinePath`, `absoluteUrl` in `invites.ts` — magazine helpers in the invite lib
- `ownsArticle` — its only external caller is a podcast route

**Transitional:**
- `/api/auth/request-otp` and `/api/auth/verify-otp` aliases

---

## 13. Known-open items

### Closed 2026-08-11

| # | Item | Fix |
|---|---|---|
| **H2** | no session revoke path | `revokeAllSessions()` in session.ts + `POST /api/auth/sign-out-everywhere`. Verified: the acting token 401s immediately after, a fresh sign-in works |
| **H3** | role-edit privilege escalation | `denyAmplification()` on **both** `POST /api/roles` and `PUT /:name`. Verified with a narrow `roles.manage` role: both escalation attempts 403, a legitimate edit within their own grant still 200s, and they end holding exactly `["roles.manage"]` |
| **Critical (part)** | 4 staff studios reachable anonymously | `agent/story`, `agent/blog`, `agent/profile`, `agent/article` now take `attachAccount` + `rateLimit(30/min)`. They edit content the caller must be signed in to reach, so nothing public was removed |
| **Critical (part)** | `agent/voice` had **no rate limit at all** | `20/min` STT, `40/min` TTS. Kept `attachAccountOptional` — the concierge widget renders for signed-out visitors (App.tsx mounts it globally), so gating it would remove a public feature |
| **A1–A4, A6, A7** | accessibility on the auth screens | `<h1>` at desktop on all three steps, `autoComplete="one-time-code"` on the first digit, OTP error wired via `aria-describedby` + `aria-invalid` + `role="alert"`, focus moves to the step heading instead of an unlabelled input, `aria-busy` on submits |

### Still open

| # | Item | Where |
|---|---|---|
| **Product call** | `agent/chat` + `agent/voice` remain anonymous-but-rate-limited. Gating them removes the public assistant | `routes/agent`, `routes/agentVoice` |
| — | `clean-user-model.ts` lists `roleId` as dead and drops indexes; reviewed but **never run against the new model** | scripts/ |
| — | `grant-superadmin.ts` doesn't load dotenv | scripts/ |
| — | OTP rows never expire (`expiresAt` is a string, so no TTL index possible) | review L1 |
| — | 8 accessibility items on `/login` + `/signup` | AUTH-SYSTEM-REVIEW §5 |

See `docs/AUTH-SYSTEM-REVIEW-2026-08-11.md` for the full findings.
