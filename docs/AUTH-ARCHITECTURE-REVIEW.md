# Auth & User-Model Review — 2026-08-05

Full read of the auth/identity/RBAC stack on `feature/blogs`, against the model
locked in [USER-MODEL-PLAN.md](./USER-MODEL-PLAN.md) §0 and the shape the owner
restated on 2026-08-05.

**Verdict:** the *design* you described is already the design in `lib/`. The
problem is that only `lib/` moved. The routes, the register, the org flow and the
whole web app are still on the pre-refactor model, and the two halves do not
disagree loudly — they disagree silently, and in three places that disagreement
is an auth bypass.

- **Server does not compile: 39 type errors**, 12 of them in auth-path files.
- **3 Critical**, 7 High, 9 redundancy findings.
- The web app typechecks **clean** — because it has its own copy of the model, so
  nothing catches the drift.

---

## 1. Your proposed model vs. what is built

Your spec, and where it stands:

| Your spec | Built? | Where |
|---|---|---|
| `users` — name, email, isAdmin, lastLogin | ✅ exactly | `lib/identity.ts:89` |
| `admins` — userId, roleId | ✅ + unique index on userId | `lib/staffAssignment.ts:5`, `lib/ensureIndexes.ts:87` |
| `adminRoles` — name, permissions, `isSuper` | ✅ | `lib/roleRegistry.ts:53` |
| `organizations` — name, ownerId, description, bio | ❌ collection exists, **no owner field written** | `routes/organisations/index.ts:31` |
| `orgMembers` — userId, orgId, static role | ⚠️ read from the collection, **written to a deleted array** | `lib/effectiveAccess.ts:99` vs `routes/organisations/index.ts:43` |
| `parties` — role, orgId, horseId, one row per role | ⚠️ types + indexes + scope are on it; **the router is not** | `lib/identity.ts:62` vs `routes/parties/index.ts` |

So: **the model is right, the write paths never followed.**

### Three corrections to the spec itself

1. **`users` must also keep `tokenVersion` and `status`.** They are not identity,
   they are revocation. `attachAccount` reads both live (`lib/auth.ts:154`) and
   they are the only way to end a session before the 7-day JWT expiry. Drop them
   and "sign out everywhere" and "suspend account" both stop existing.

2. **`isAdmin` is a denormalised duplicate of "has an `admins` row", and it is
   currently trusted for access.** That is Critical #2 below. Keep the field if
   you want the roster to be one indexed query — but then `resolveAccount` must
   overwrite it from the `admins` table, which the plan says it does and the code
   does not. Otherwise drop it and join.

3. **`organizations.ownerID` and `orgMembers.role = 'owner'` are two sources of
   truth for the same fact.** Pick one. Recommend `orgMembers` only — ownership
   transfer is then one row update, not a two-write transaction that can half-apply
   exactly the way `isAdmin` already does.

---

## 2. Critical

### C1 — `/api/parties` is mounted twice; the first mount has no gate

```
routes/index.ts:21   import partyClaimsRouter from './parties/index.js'
routes/index.ts:26   import partiesRouter    from './parties/index.js'   // same file
routes/index.ts:138  router.use('/parties', partyClaimsRouter)                      // ← no gate
routes/index.ts:143  router.use('/parties', partyScopedWriteGate, partiesRouter)    // ← never reached
```

Express matches the first mount and the handler responds, so `partyScopedWriteGate`
never runs. And `routes/parties/index.ts` does no auth of its own —
`DELETE /:id` (line 111) checks nothing at all.

**Effect: an unauthenticated caller can create, edit and delete any party in the
register.** POST/PUT read `isAdminAccount(req.account)` with `req.account`
undefined, so they simply take the non-staff branch and write.

Fix: delete the `partyClaimsRouter` import and the line 138 mount.

### C2 — the denormalised `isAdmin` flag is the real staff gate

`resolveAccount` spreads the identity through untouched:

```ts
// lib/effectiveAccess.ts:71
return { ...identity, parties, orgMembers, isSuperAdmin: hasSuperRole(roleDocs), … }
```

`identity.isAdmin` comes straight off the `users` document. Nothing re-derives it
from `admins`. But `lib/ensureIndexes.ts:97` states *"it is never trusted for
access (resolveAccount overwrites it from the admins table)"*, and USER-MODEL-PLAN
§0 lists that overwrite as the mitigation for the flag/row drift it knowingly
accepted.

Meanwhile `isAdminAccount()` — `isSuperAdmin || isAdmin` (`lib/rbac.ts:19`) — has
**62 call sites** and is what `staffWriteGate`, `reportsGate`, `issuesGate`,
`horseScopedWriteGate`, `partyScopedWriteGate`, both agent studios, magazines v2,
newsroom, tips and tipper profiles actually gate on.

**Effect: a user row with `isAdmin: true` and no `admins` row has full staff
access with no role, no permissions, and no entry in the roster to reveal it.**
Every path that can leave the flag set without a row — a failed `grantStaffRole`
between its two writes, a hand-edited document, an import — produces that account.

Fix: one line, in `resolveAccount`:
```ts
isAdmin: roleDocs.length > 0,
```

### C3 — OTP login issues tokens with no `v`, so a `tokenVersion` bump is a permanent lockout

```ts
// routes/auth/index.ts:258
const token = signToken({ sub: identity.id, email: identity.email })   // no v
// routes/invites/index.ts:181
v: typeof (fresh ?? userDoc).tokenVersion === 'number' ? … : 0,        // has v
```

`isRevoked` treats a missing `v` as 0 (`lib/auth.ts:157`). Bumping
`users.tokenVersion` to 1 revokes the old session as intended — and then revokes
every *new* session the moment it is issued, because the fresh token is also
version 0. The user signs in successfully, gets a token, and is 401'd on their
next request, forever.

Fix: pass `v: doc.tokenVersion ?? 0` at `routes/auth/index.ts:258`, the way the
invite path already does.

---

## 3. High

### H1 — the server does not compile (39 errors)

Auth-path files among them: `routes/roles` (5), `routes/staff` (11),
`routes/invites`, `routes/organisations`, `lib/ownedRecordRoutes`,
`lib/agent/tools` (4), `lib/agent/capabilities`, `routes/horses` (5). Plus three
`TIERS`/`tierAllows` references left behind by the `paywall.ts` deletion and two
imports of deleted modules (`../paywall.js`, `./horsePartyLinks/index.js`).

### H2 — the staff roster and the share directory both return empty

```ts
// routes/staff/index.ts:64 and :98
await db.collection('users').find({ staffRoleSlug: { $ne: null } })
```

`staffRoleSlug` was deleted from the model. In MongoDB `$ne: null` **excludes**
documents where the field is absent — so this matches nothing. `GET /api/staff`
returns an empty roster and `GET /api/staff/directory` returns an empty share
picker. Should be `{ isAdmin: true }`, which is what the index at
`ensureIndexes.ts:98` was created for.

### H3 — org membership is written to the deleted embedded array

`routes/organisations/index.ts:41-45` reads `userDoc.orgMembers`, appends, writes
it back onto the **user document**, then calls `mirrorOrgMemberships` — which no
longer exists. `resolveAccount` reads the **`orgMembers` collection**
(`effectiveAccess.ts:99`). The two never meet: creating an organisation grants the
creator nothing, so `canManageOrg` / `isOrgOwner` are false for the person who
just made it. The org is also created with no owner field at all.

### H4 — the parties router is the pre-refactor model end to end

`routes/parties/index.ts` writes `verificationStatus: 'verified' | 'unverified'`
and accepts a `roles: string[]` array. `PartyRow`, `lib/scope.ts` and all four
`parties` indexes are on `role` (singular), `taken`, `userId`, `horseId`. Nothing
writes `taken` or `userId`, and **there is no claim endpoint** — so the register
that the whole party/horse scope model reads from can never be populated. Every
`manageablePartyIds` / `writableHorseIds` answer is `[]`.

### H5 — `ownedRecordRoutes` runs a staff check against an unresolved identity

```ts
// lib/ownedRecordRoutes.ts:15
import { isAdminAccount, withIdentityDefaults } from './identity.js'   // not exported there
// :172
if (!isAdminAccount(identity)) { … }                                    // IdentityUser, not AccountUser
```

Two problems: the import doesn't resolve (it lives in `rbac.ts`), and an
`IdentityUser` has no `isSuperAdmin`, so the check collapses to the raw `isAdmin`
flag. A superadmin whose flag is stale cannot be shared with. The comment above it
("Synchronous now") is the reasoning that introduced the bug — it traded the
resolve for the flag, which is C2 in miniature.

### H6 — two full-collection scans per horse write, both discarded

```ts
// lib/rbac.ts:113-114
const horses = await db.collection('horses').find()
const links  = await db.collection('horsePartyLinks').find()   // collection is gone
```

Neither variable is used. `accountCanManageHorse` runs on every horse-scoped
write, so this is two unbounded reads per mutation for nothing.

### H7 — the web app is on a different model and nothing catches it

`apps/web/src/rbac/can.ts` reads `user.partyClaims[].status === 'verified'`,
`user.orgMemberships[].orgRole`, `user.subscriptionTier`, and a `ScopeData` blob
built from `horsePartyLinks`. The server emits `parties`, `orgMembers`, and no
tier at all (`toClientUser`, `effectiveAccess.ts:194`). Web typechecks clean
because it declares its own `AuthUser`. Every client-side permission answer is
now computed from fields that arrive `undefined` — which fails *closed*, so it
shows as "the UI lost its buttons", not as an error.

---

## 4. Redundancy — the duplication you asked about

| # | What | Where | Collapse to |
|---|---|---|---|
| R1 | **Five copies of the staff-only gate.** `staffWriteGate`, `reportsGate`, `issuesGate` are byte-identical; `agentEditor` and `agentInstant` inline the same six lines. | `rbac.ts:87,337,356`; `agentEditor:29`; `agentInstant:42` | one `staffGate(opts?)` |
| R2 | **Two parallel admin axes.** `isAdminAccount` (62 sites) is flag-based; `isPlatformAdmin` = `accountCan('platform.admin')` (permission-based). Both mean "override everything", neither implies the other. | `rbac.ts:19` vs `:28` | delete `isAdminAccount`; make staff-only a permission |
| R3 | **`manageablePartyIds` exists twice with different rules** — server returns every claimed row, web filters on `verified \|\| (pending && selfRegistered)`. | `lib/scope.ts:20`, `web/rbac/can.ts:50` | server-only; ship the ids in `toClientUser` |
| R4 | **Horse scope duplicated** — `writableHorseIds`/`visibleHorseIds` on the server, `writableHorseIds`/`authorisedHorseIds`/`previewHorseIds` on the client over `ScopeData`. | `lib/scope.ts`, `web/rbac/can.ts:99-160` | server-only |
| R5 | **19 copies of `WithMongoId` + `project()`**, character-for-character. | 19 route files | `lib/project.ts` |
| R6 | **Dead permissions.** `claims.verify` and `platform.admin` both describe verification, which §0 deleted. | `permissionCatalogue.ts:35,94` | drop `claims.verify` |
| R7 | **Dead mount + dead import.** `/horsePartyLinks` mounts a router whose file is deleted. | `routes/index.ts:25,142` | delete both lines |
| R8 | **`lib/membership.ts` is 3 lines holding 2 collection-name constants**, while `ADMINS` lives in `staffAssignment.ts` and `ADMIN_ROLES` in `roleRegistry.ts`. Three files, one concept. | `lib/membership.ts` | one `collections.ts`, or inline them |
| R9 | **Slug vocabulary survives the "no slugs" decision** — `rolesForSlugs`, `POST /roles/:slug/assign`, the `slug` wire key in `ClientAccess`, `pendingStaffGrants` as the invites collection. | `roleRegistry.ts:180`, `effectiveAccess.ts:188`, `invites.ts:42` | rename to `name` on the wire while the client is being rewritten anyway |

`roleRegistry`'s single map keyed by **both** id and name (`roleRegistry.ts:137`)
is the one duplication worth keeping — the comment justifies it correctly, and the
key spaces genuinely cannot collide.

---

## 5. Recommended order

**P0 — security, ~1 hour, no model work**
1. C1: delete the duplicate `/parties` mount (2 lines).
2. C2: `isAdmin: roleDocs.length > 0` in `resolveAccount` (1 line).
3. C3: pass `v` in `routes/auth/index.ts` (1 line).
4. H6: delete the two dead scans in `rbac.ts` (2 lines).

**P1 — finish the refactor to green**
5. H2 `staffRoleSlug` → `isAdmin` in `routes/staff`.
6. H5 fix the `ownedRecordRoutes` import and resolve properly.
7. Clear the remaining 39 errors: `routes/roles`, `routes/invites`,
   `lib/agent/*`, the three `TIERS` leftovers, R7's dead mount.

**P2 — the write paths the model still lacks**
8. Rewrite `routes/parties` onto `PartyRow`: `role`, `taken`, `userId`, `horseId`,
   plus the claim endpoint (`POST /:id/claim` → set `userId`, flip `taken`)
   through a single writer, the way `grantStaffRole` owns `isAdmin`.
9. Rewrite `routes/organisations` onto the `orgMembers` collection; add
   `ownerUserId` **or** drop it in favour of the member row (§1.3).

**P3 — collapse the duplication**
10. R1 (one staff gate), R2 (one admin axis), R5 (`lib/project.ts`).
11. R3/R4: strip the client's scope engine; ship resolved ids in `toClientUser`.

**P4 — the web app**
12. Rewrite `apps/web/src/rbac/*` and `authStore` against the real wire shape.
    Nothing here is caught by a typecheck, so this needs a manual pass per screen.
