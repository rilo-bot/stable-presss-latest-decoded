# User Model Plan — Users vs Staff, Edge Collections, Two Surfaces

> Authoritative plan for restructuring identity, membership and the admin surfaces.
> Companion to [RBAC.md](../RBAC.md) (what the system must be) and
> [AUTH-RBAC-REVIEW.md](./AUTH-RBAC-REVIEW.md) (what is currently wrong).
>
> **⚠️ SUPERSEDED IN PART — see §0. The owner specified a different shape on
> 2026-08-05.** §1–§7 describe the model that was built as P0–P2 and remain accurate
> as history and as the reasoning behind each mechanism. Where §0 and §3 disagree,
> **§0 wins.**

---

## 0. The locked model (2026-08-05)

Specified by the owner directly. Six collections, minimal and centralised.

```
users          _id, name, email, isAdmin, lastLogin, createdAt
               + subscriptionTier, status, tokenVersion      ← see "retained", below
admins         _id, userId, roleId                            ← unique (userId)
adminRoles     _id, name, permissions[], modules[], workflowStages[], isSuper
organizations  _id, name, ownerUserId, description, bio
orgMembers     _id, userId, orgId, role                       ← static owner|manager|member
parties        _id, name, imageUrl, role, taken, userId?, orgId?, horseId
```

**Deleted from `users`:** `roles[]`, `staffRoles[]`, `staffRoleSlug`, `partyClaims[]`,
`orgMemberships[]`; `displayName` → `name`.
**Deleted collections:** `partyMemberships`, `orgMemberships` (P1's edge tables — their
job moves to `parties` and `orgMembers`), `pendingStaffGrants`.
**Renamed:** `roles` → `adminRoles`, `slug` → **`name`**; `isSuper` replaces the
`slug === 'superadmin'` test.

### No slugs, and no legacy support

**There is no slug anywhere in this model.** Roles, users and parties each have a
plain `name`. `adminRoles` is referenced by `_id` (from `admins.roleId`), so nothing
needs a stable machine key at all — a role can be renamed freely without touching a
single assignment. `SUPERADMIN_ROLE_NAME` survives only as the name the seeded
all-access role is *created* with; authority comes from the `isSuper` field, never
from a name comparison.

Every backward-compatibility fallback has been REMOVED, on instruction — this is a
new database, so there is nothing to be compatible with:

- `projectRole` no longer reads `doc.slug`, and no longer infers `isSuper` from the
  name.
- `withIdentityDefaults` no longer reads `displayName`.
- `seedRoles` no longer reads `r.slug`.
- `RoleSlug` type, the deprecated `SUPERADMIN_SLUG` alias, `primaryStaffRole`
  (collapsed a `staffRoles[]` array that no longer exists), `PartyClaim`,
  `OrgMembership`, `SubscriptionTier` and `isStaticRole` are all deleted.
- `SeedRoleSlug` → `SeedRoleName`.
- The migration scripts are deleted (`migrate-user-model.ts`,
  `migrate-admin-roles.ts`). Nothing migrates; the DB is new.

### What changed from P0–P2, and the cost accepted

The staff axis moves from **one indexed field on the user document** back to a
**flag plus a join table**. That was considered and rejected in §1.2; the owner
reaffirmed it twice, so it is the model. Two consequences, stated so nobody
rediscovers them as bugs:

1. **`isAdmin` is derivable from the presence of an `admins` row**, so the two can
   disagree — `isAdmin: true` with no row is an account flagged as staff and locked
   out of everything; the reverse is an account with a role treated as a reader.
   Same for `parties.taken` versus `parties.userId`.
   *Mitigation:* both pairs are written by a **single helper each**, never at a call
   site, so they cannot drift by omission. That makes it a discipline problem solved
   by construction rather than by review.
2. **Resolution needs the `admins` row**, which the previous model got for free.
   *Mitigation:* the token's `sub` IS the user id, so `users`, `admins`, `parties`
   and `orgMembers` are all fetched in ONE `Promise.all` — one round trip, which is
   actually fewer than the two the P2 path used.

### Verification is gone

`parties` has `taken: boolean`, not `pending | verified | rejected`. A user claiming
a party is immediately that party. There is no evidence upload, no verifier, no
queue, and the public site has no way to distinguish an asserted role from a checked
one. `claims.verify` therefore leaves the permission catalogue — leaving it would
fail `npm run check:permissions`, which is exactly what that guard is for.

`parties` doubles as the register: staff create a row with `taken: false` and no
`userId` for a trainer or owner who has never signed up, and a claim flips
`taken: true` and sets `userId`.

### Build status — 2026-08-05, mid-refactor, DOES NOT COMPILE

**115 server type errors remaining.** This is a deliberate mid-slice state, not a
regression: the model types changed first and the call sites follow. Nothing is
committed.

**Slice 1 — DONE, verified.** `roles` → `adminRoles`, `slug` → `roleName`, `+isSuper`.
Server typechecked clean at that point; `adminRoles` verified in the DB with
permission/module counts matching the old collection exactly. `check:permissions`
green. `scripts/migrate-admin-roles.ts` exists (`--apply`, `--drop-old`); it was a
no-op locally because the dev server had already re-seeded. **The old `roles`
collection is still present and now dead** — drop it with `--drop-old` once eyeballed.

**Slice 2 — IN PROGRESS.** Done so far:

- `lib/staffAssignment.ts` (new) — the `admins` collection, and the ONLY writers of
  `users.isAdmin`: `grantStaffRole` / `revokeStaffRole` / `revokeRoleEverywhere`,
  plus `staffRoleFor`, `staffRolesForUsers`, `superadminHolderCount`,
  `holdersOfRole`, `reconcileIsAdmin`.
- `IdentityUser` is now exactly the spec: `id, name, email, createdAt, isAdmin,
  lastLogin`. `newReaderFields()` reduced to `{ isAdmin: false, lastLogin: null }`.
- `PartyRow` / `OrgMemberRow` types added.
- `resolveAccount` rewired: three concurrent indexed queries (`admins`, `parties`,
  `orgMembers`), superadmin via `hasSuperRole` reading `isSuper`, and the stored
  `isAdmin` **overwritten** from the authoritative `admins` table so a stale flag can
  never grant access.
- `toClientUser` emits `name`/`isAdmin`/`lastLogin`/`parties`/`orgMembers`; the wire
  key for a role stays `slug` (reading `roleName`) so the web app is untouched for now.
- `lib/scope.ts` rewritten: **`ScopeData` is gone.** A party row carries `horseId`, so
  `horsePartyLinks` and the seven legacy `ownerIds`/`trainerIds`/… arrays are no
  longer consulted, and nothing preloads the horse collection. `writableHorseIds` /
  `visibleHorseIds` are now `async` and do one `$in` query for org-reached horses.
- `PARTY_MEMBERSHIPS`/`ORG_MEMBERSHIPS` constants renamed to `PARTIES`/`ORG_MEMBERS`.

### Error count: 137 → 57

Cleared so far, all of it deletion rather than porting:

- **`displayName` → `name`** across 12 files (done per-file against the compiler's
  own list, never by a repo-wide sed — `displayName` also exists on non-user objects).
- **The paywall is gone.** `lib/paywall.ts` deleted; `tierAllows` / `gateForTier` /
  `gateArticleForTier` call sites removed from `lib/reactions.ts`,
  `routes/articles`, `routes/blogs/reads.ts`, `lib/agent/tools.ts`,
  `lib/agent/capabilities.ts`, `lib/agent/prompt.ts`. Nothing is tier-gated: a
  published record is readable by anyone. The STATUS gate stays — a draft is still
  not reactable or readable.
- **`account.roles` is no longer a field.** The agent files derive it inline from
  claimed party rows (`['reader', ...parties.map(p => p.role)]`), which is the same
  thing `toClientUser` sends the browser.
- **Pending-claim reporting removed** from the agent capabilities — with no
  verification step there is no pending state to report, so both the count and the
  "N claims pending staff verification" gate line are gone.

### There is no "staff" — only users and admins

Removed on instruction, because each of these was the same fact wearing a third name:

- **`newsroom.access` is deleted from `PermissionAction` entirely.** Opening the admin
  app is `users.isAdmin` — the account *category*, not a grantable permission and not
  a derived flag. It had already stopped being grantable; now it does not exist.
- **`isStaffIdentity()` deleted.** It read `isAdmin` and returned it.
- **`canAccessNewsroom()` → `isAdminAccount()`**, which is
  `account.isSuperAdmin || account.isAdmin`. Renamed rather than kept, so no call site
  reads as though a third category exists.
- **`resolveAccount` no longer recomputes `isAdmin`.** It was `roleDocs.length > 0`,
  which duplicated the stored flag. The flag is now simply trusted: `isAdmin` is the
  category, the `admins` row is the role. An admin with no role is an admin who can
  get in and do nothing — coherent, and no longer silently rewritten on every request.
- **The `implicit` permission array is gone** from `toClientUser`; it existed only to
  synthesise `newsroom.access` for the browser.

### Auth, rebuilt for two categories

- **Signup takes a name and an email. Nothing else.** The request body is never
  consulted for a role, so a client cannot send one even by accident. Every signup is
  `isAdmin: false`; becoming an admin means an `admins` row, which only an existing
  admin creates.
- **The `reader` role is gone.** `ReaderRole` deleted and `Role = PartyRole`, because
  with two categories "reader" was never a role — it was the absence of one. An
  account with no claimed party has an empty role list.
- **`lastLogin` is written for the first time**, in `verify-otp`, AFTER every gate
  passes — so it means "last time this account got in", not "last time someone tried".
- **Invite grants go through `grantStaffRole`.** They used to union role slugs into an
  array; now one role per user, last valid invite wins, applied through the single
  writer so the row and the flag cannot half-apply.
- `newReaderFields` → `newUserFields`. The token no longer carries `v`.

### Remaining work, by cluster

| Files | What |
|---|---|
| `lib/agent/capabilities.ts` (20), `lib/agent/tools.ts` (16), `lib/agent/prompt.ts` (3) | read `partyClaims` / `orgMemberships` / `subscriptionTier`; repoint at `parties` / `orgMembers`, drop tier |
| `lib/membership.ts` (8) | **DELETE** — the P1 reconcilers mirror embedded arrays that no longer exist. Keep only the two collection-name constants (move them to `staffAssignment.ts` or a `collections.ts`) |
| `routes/partyClaims/` (8) | **DELETE** the route — no verification flow. Also remove `claims.verify` from the catalogue or `check:permissions` fails |
| `routes/horsePartyLinks/` | **DELETE** — redundant now `parties.horseId` exists |
| `lib/paywall.ts`, `routes/blogs/visibility.ts`, `routes/blogs/content.ts`, `routes/blogs/write.ts`, `routes/articles/index.ts`, `lib/comments.ts`, `lib/reactions.ts` | remove `subscriptionTier` / `minTier` gating entirely (owner: "remove the subscription related, we have the diff plan") |
| `routes/staff/` (9), `routes/roles/` (5) | assignment must go through `grantStaffRole`/`revokeStaffRole`; `assigneeCounts` via `holdersOfRole`; roster via `staffRolesForUsers` |
| `lib/rbac.ts` (6), `routes/horses/` (6), `lib/ownedRecordRoutes.ts` (2) | `writableHorseIds` is async now — `await` it; `accountCanManageHorse` loses its `ScopeData` loads |
| `routes/auth/` (2), `routes/invites/` | `displayName` → `name`; stamp `lastLogin` on verify-otp; delete `isRevoked`/`tokenVersion`/`status` |
| `routes/magazinesV2/` (7), `routes/newsroom/` (3), `routes/podcastEpisodes/` (2), `routes/organisations/` (2) | `displayName` → `name`; org membership reads |
| `lib/notify.ts` | `usersForParty` — repoint at `parties` |
| `lib/ensureIndexes.ts` | new indexes: `admins.userId` unique, `admins.roleId`, `parties.userId`, `parties.orgId`, `parties.horseId`, `orgMembers.{userId,orgId}` unique; drop the `partyMemberships`/`orgMemberships` ones |
| `apps/web` | `AccountUser` shape changed — `partyClaims`/`orgMemberships`/`subscriptionTier`/`displayName` all gone. `rbac/can.ts`, `rbac/scope.ts`, `rbac/entitlement.ts`, `RequireTier`, `authStore`, Dashboard, blog/article tier UI |
| new | `scripts/migrate-user-model-v2.ts` — `displayName`→`name`, `staffRoleSlug`→`admins` row + `isAdmin`, drop the 5 dead fields, `partyMemberships`→`parties`, `orgMemberships`→`orgMembers` |

### Removed on the owner's instruction

`subscriptionTier`, `status` and `tokenVersion` are **gone** from `users`. I argued to
keep them; the owner ruled otherwise twice ("only put what I said for the users
collection", "remove the subscription related, we have the diff plan"), so they are
out and the features they powered come out with them:

- **the paywall** — `lib/paywall.ts`, `minTier` on blogs and articles, `RequireTier`
  in the web app, and the tier checks in `comments.ts` / `reactions.ts` / agent prompts.
  A separate plan covers subscriptions.
- **account suspension** — `status: 'suspended'`.
- **sign-out-everywhere** — `tokenVersion` + the `v` JWT claim + `isRevoked()`.

`users` is therefore exactly: `_id, name, email, isAdmin, lastLogin, createdAt`.

---

## 1. The decision

**ONE identity table. The staff axis is a single field. The two multi-valued axes are
their own collections. Two API surfaces.**

| Question | Decision | Why |
|---|---|---|
| One `users` table or `users` + `staff`? | **One**, one login | Cross-over people are real (a trainer hired as a columnist; a staff journalist who owns a horse). Two tables means one human, two logins, and cross-table email uniqueness maintained by hand — on a codebase that does not yet have a unique index on the one table it has (review M6). |
| **How many staff roles per user?** | **Exactly one, or none.** Fully dynamic (a DB row a superadmin defines). | Locked by the owner. "What can this person do?" is answerable from one row — no mental OR-ing of permission sets. This is also what the code already does at [roles.ts:323](../apps/server/src/routes/roles.ts#L323). |
| **How many party roles per user?** | **Many.** Static enum — `owner` · `trainer` · `jockey` · `breeder` · `bloodstock agent` · `syndicate manager` · `personnel`. | Locked by the owner. One person genuinely is both an owner and a jockey. The vocabulary is fixed because it is bound to `relationship_type` on horse links and to `ROLE_LINK_FIELDS` — it describes a **data relationship**, not a configurable permission bundle. |
| So where does the staff axis live? | **A field: `users.staffRoleSlug: string \| null`** (indexed) | A 1:1 relationship does not need a collection. See §1.2 — this is strictly better than the `staffAssignments` table this plan originally proposed. |
| Where do the multi-valued axes live? | Collections: `partyMemberships`, `orgMemberships` | Genuinely 1:many **and** queried from both directions (by user *and* by party/org). Embedded arrays are why 10 call sites scan the whole `users` collection. |
| Where is the security boundary? | The API: `/api/me/*` vs `/api/admin/*` vs `/api/public/*` | A self-service endpoint that cannot name a target user cannot be used to escalate. This structurally closes the review's C3 class. |
| Is there any denormalised field left? | **No.** | `staffRoleSlug` is the source of truth, not a cache — so it is safe to authorise from. The earlier `isStaff` flag is gone (§1.2). |

### 1.1 The two categories, precisely

```
USERS  (staffRoleSlug = null)  — the public-facing population
  ├── reader          default state of every account; no memberships at all
  ├── party holder    ≥1 partyMemberships row — MANY roles allowed, static enum
  │                   e.g. same user: (partyA,'owner',verified) + (partyA,'jockey',verified)
  └── org member      ≥1 orgMemberships row

STAFF  (staffRoleSlug != null)  — the CRM population
  └── exactly ONE dynamic role slug → permissions via the `roles` registry
```

**"Is this person staff?" is `staffRoleSlug != null`.** No separate flag, nothing to keep
in sync, nothing to drift.

A user may be in **both** categories. Being staff never grants racing scope; holding a
party role never grants a newsroom permission. That orthogonality is already correct in
[RBAC.md §2](../RBAC.md) and this plan preserves it — it just stops storing both axes in
the same document.

### 1.2 Why one-staff-role-per-user removes a whole collection

The original draft of this plan proposed a `staffAssignments` collection to restore the
array semantics [RBAC.md §4.4](../RBAC.md) describes. With the axis locked to
**one role per user**, that table is the wrong shape — a 1:1 relationship belongs on the
document. Consequences, all improvements:

| | `staffAssignments` collection | `users.staffRoleSlug` field |
|---|---|---|
`superadminHolderCount` | count on a joined table | `users.count({staffRoleSlug:'superadmin'})` — one indexed count |
`assigneeCounts` | `$group` + join back for names | one `$group` on `users` |
Staff roster | `find()` then `$in` on ids — 2 round trips | `users.find({staffRoleSlug:{$ne:null}})` — 1 query |
`resolveAccount` hot path | +1 query per request | **+0 queries** — already on the document being loaded |
"Is staff?" | needs the denormalised `isStaff` flag | `staffRoleSlug != null` — no flag at all |
Drift risk | flag can disagree with rows | **none possible** |

So: **3 collections → 2. One denormalised field → zero. Hot-path queries 4 → 3.**

The `roles` collection (role *definitions* — the dynamic, superadmin-editable part) is
unchanged. Only the assignment shape changes.

### 1.3 One thing to be explicit about: party roles are descriptive *and* scope-bearing

"Static, just for the data to acknowledge" is the right description of the **role name** —
it is a fixed vocabulary labelling a real-world racing relationship, not an admin-defined
permission bundle. But it is worth stating plainly what a *verified* party role currently
does, so it is a decision rather than a surprise:

```
partyMemberships (verified)  →  manageablePartyIds()   ─┐
horsePartyLinks  (current)   →  horsesLinkedToParty()  ─┴→ authorisedHorseIds()
                                                          → accountCanManageHorse()
```

A verified party role is what makes the person's party "theirs", and the dated
**horse↔party links** decide which horses that reaches. So the role never grants access on
its own — [RBAC.md §6](../RBAC.md), "permissions are ROLE + SCOPE, not role alone" — but it
is a required input to write access, not purely cosmetic.

That is the correct design and this plan keeps it. Flagged only because "just for
acknowledgement" could be read as "carries no authority", which would be a materially
different (and much larger) change.

**One person-party, many roles.** The current code already funnels every self-registered
claim onto a single person-party and appends the role to `party.roles[]`
([partyClaims.ts:90-96](../apps/server/src/routes/partyClaims.ts#L90)). That stays: one
party record per human, one `partyMemberships` row **per role**, each row carrying its own
`status` and `evidenceKey` — because verification is per-role (a licence proving someone
is a jockey says nothing about them being a breeder).

---

## 2. Why edge collections (the actual problem)

Ten call sites load the **entire** `users` collection into Node and filter in JavaScript,
because the thing they need to query is inside an embedded array:

| Site | Operation | Today | After |
|---|---|---|---|
[roleRegistry.ts:40](../apps/server/src/lib/roleRegistry.ts#L40) | `superadminHolderCount` — runs on **every** role mutation | full scan | `users.count({staffRoleSlug:'superadmin'})` |
[notify.ts:39](../apps/server/src/lib/notify.ts#L39) | `usersForParty` — runs on **every** horse-link write | full scan | `partyMemberships.find({partyId, status:'verified'})` |
[newsroom.ts:77](../apps/server/src/routes/newsroom.ts#L77) | pending-claim count, **per CRM dashboard load** | full scan | `partyMemberships.count({status:'pending'})` |
[metrics.ts:20](../apps/server/src/routes/metrics.ts#L20) | site metrics on a **public, uncached** endpoint | full scan | `users.estimatedDocumentCount()` |
[partyClaims.ts:47](../apps/server/src/routes/partyClaims.ts#L47) | `findClaim` — locate **one** claim | full scan | `partyMemberships.findById(id)` |
[partyClaims.ts:135](../apps/server/src/routes/partyClaims.ts#L135) | pending queue | full scan + N party lookups **inside the loop** | `find({status:'pending'})` paginated + one `$lookup` |
[organisations.ts:78](../apps/server/src/routes/organisations.ts#L78) | members of **one** org | full scan | `orgMemberships.find({orgId})` |
[staff.ts:50](../apps/server/src/routes/staff.ts#L50) | staff roster | full scan | `users.find({staffRoleSlug:{$ne:null}})` |
[roles.ts:117](../apps/server/src/routes/roles.ts#L117) | `assigneeCounts` | full scan | one `$group` on `users.staffRoleSlug` |
[magazines.ts:136](../apps/server/src/routes/magazines.ts#L136) | collaborator picker | full scan | `users.find({staffRoleSlug:{$ne:null}})` |

At 100 users this is invisible. At 50k readers, a CRM dashboard load and a public
`/api/metrics` hit each pull 50k documents with their embedded arrays into memory.

Embedding also causes three correctness problems the review already flagged:

1. **`roles[]` is a hand-synced derived cache.** [RBAC.md §9](../RBAC.md) admits it
   ("a derived convenience cache kept in sync"); the sync is one manual line at
   [partyClaims.ts:191-194](../apps/server/src/routes/partyClaims.ts#L191). Any path that
   forgets it silently changes someone's access.
2. **Read-modify-write on arrays loses concurrent writes.**
   `partyClaims: [...claims, claim]`, `orgMemberships: [...memberships, {...}]` — two
   simultaneous operations drop one. [db.ts:165-168](../apps/server/src/lib/db.ts#L165)
   already warns about exactly this and provides `addToSet`/`pullFrom`, which these
   sites don't use.
3. **The verification queue cannot be indexed, sorted, filtered or paginated**, because
   `status` is a field inside an array inside a document.

---

## 3. Target data model

### 3.1 `users` — identity + the staff axis

```ts
{
  _id, email, displayName, avatarUrl?,
  subscriptionTier: 'free'|'standard'|'premium',   // 1:1 — stays on the document
  staffRoleSlug: string | null,   // THE staff axis. one per user. indexed.
                                  // null ⇒ not staff. source of truth, safe to authorise.
  staffRoleGrantedBy?, staffRoleGrantedAt?,        // audit trail for the grant
  status: 'active'|'suspended',
  tokenVersion: number,           // bumped to invalidate sessions (review L5)
  createdAt, lastSeenAt?
}
```

| Index | Serves |
|---|---|
`{email:1, deletedAt:1}` **unique** | review M6 |
`{staffRoleSlug:1, deletedAt:1}` | roster, `assigneeCounts`, `superadminHolderCount`, "is staff" |

Removed: `roles[]`, `staffRoles[]`, `partyClaims[]`, `orgMemberships[]`.
Added: `staffRoleSlug`, `status`, `tokenVersion`, `lastSeenAt`.

`subscriptionTier` and `staffRoleSlug` both stay on the document for the same reason: 1:1,
single-valued. The two axes that are 1:**many** move out.

`staffRoleSlug` holds a slug into the `roles` collection, which stays fully dynamic — a
superadmin defines what the role grants; this field only records which one the person
holds. Validated against the live registry on write (as
[staff.ts:90](../apps/server/src/routes/staff.ts#L90) already does), and cleared by
`pullFromAll`'s replacement when a role is deleted.

### 3.2 `partyMemberships` — the racing axis (was `partyClaims[]`)

```ts
{
  _id, userId, partyId, role: PartyRole,
  status: 'pending'|'verified'|'rejected',
  selfRegistered: boolean,
  evidenceKey?,                                    // S3 key, NOT a public URL (review H7)
  verifiedBy?, verifierType?: 'admin'|'org', verifiedAt?, rejectionReason?,
  createdAt, updatedAt
}
```
| Index | Serves |
|---|---|
`{userId:1, partyId:1, role:1}` **unique** | one row per (person, party, role) — **multiple roles per person are expected**, this only stops duplicates of the same one |
`{status:1, createdAt:1}` | the verification queue — **paginated**, which is impossible today |
`{partyId:1, status:1}` | `usersForParty`, "who is behind this party" |
`{userId:1, status:1}` | scope resolution on every authenticated request |

`role` is the **static** `PartyRole` enum from
[identity.ts:25](../apps/server/src/lib/identity.ts#L25) — unchanged, deliberately not
admin-definable (§1.1, §1.3). A user holding owner + jockey has two rows sharing one
`partyId`, each independently verifiable.

Renamed from "claims" to "memberships" deliberately — see §5.

### 3.3 `orgMemberships` — the org axis

```ts
{ _id, userId, orgId, orgRole: 'org_owner'|'org_manager'|'org_member', addedBy, createdAt }
```
| Index | Serves |
|---|---|
`{userId:1, orgId:1}` **unique** | "already a member" |
`{orgId:1}` | org member list (one query instead of a full scan) |
`{userId:1}` | `resolveAccount`, `/orgs/mine` |

### 3.4 Also fix while we're in here

Two index changes from the review that belong in this migration:

- `users.email` → **unique**, partial on `deletedAt: null` (review M6). Same treatment
  `roles.slug` already gets in [ensureIndexes.ts:54](../apps/server/src/lib/ensureIndexes.ts#L54),
  for the same reason.
- `otps` → `{email:1, deletedAt:1, createdAt:-1}` (review M7). Currently unindexed and
  scanned on every unauthenticated sign-in request.

### 3.5 Final shape

```
users              identity + subscriptionTier + staffRoleSlug (1:1 axes)
  │
  ├──< partyMemberships    userId, partyId, role(static enum), status …   MANY
  └──< orgMemberships      userId, orgId, orgRole                        MANY

roles              role DEFINITIONS — dynamic, superadmin-editable. unchanged.
                   referenced by users.staffRoleSlug
```

Two new collections, one new indexed field, four embedded arrays deleted.

---

## 4. The compatibility trick that makes this cheap

**`AccountUser` keeps its exact current shape. Only `resolveAccount` changes.**

Every consumer reads `account.staffRoles` / `account.partyClaims` /
`account.orgMemberships` off the resolved `AccountUser`. If those field names survive and
`resolveAccount` becomes the loader that hydrates them from the edge collections, then
**every consumer site needs zero changes**:

| Consumer | Sites | Change |
|---|---|---|
[lib/scope.ts](../apps/server/src/lib/scope.ts) | the whole scope engine | **none** |
[lib/rbac.ts:53](../apps/server/src/lib/rbac.ts#L53) | `orgRoleIn` | **none** |
[routes/horses.ts:124](../apps/server/src/routes/horses.ts#L124) | auto-link on create | **none** |
`lib/agent/capabilities.ts` | 6 sites | **none** |
`lib/agent/tools.ts`, `prompt.ts`, `editorPrompt.ts` | 5 sites | **none** |
[lib/effectiveAccess.ts:170-181](../apps/server/src/lib/effectiveAccess.ts#L170) | `toClientUser` | **none** — same wire shape |

Because `toClientUser` emits the same JSON, **the entire web app is untouched in P1 and
P2.** `AuthUser`, `rbac/can.ts`, `rbac/scope.ts`, `lib/permissions.ts`, every guard and
every screen keep working. Web changes are confined to the *new* admin surfaces (§5) and
the post-login redirect (§6).

Two fields need shimming, both inside `resolveAccount`/`toClientUser` only:

- **`staffRoles: RoleSlug[]`** stays an array on `AccountUser` and on the wire, populated
  as `staffRoleSlug ? [staffRoleSlug] : []`. One-or-zero elements. Every consumer —
  `hasSuperAdminSlug`, `rolesForSlugs`, `wouldSelfLockOut`, the web's `AuthUser.staffRoles`
  — keeps compiling and behaving identically.
- **`roles[]`** (the static axis) is deleted from storage but **kept on the wire**, derived
  from verified `partyMemberships`. So `currentUser.roles`, `useHasRole` and the Dashboard's
  role line keep working while the stored duplicate — and its hand-written sync at
  [partyClaims.ts:191](../apps/server/src/routes/partyClaims.ts#L191) — are gone.

### 4.1 The one real cost — smaller than first estimated

Because the staff axis is now a field on the document already being fetched,
`attachAccount` goes from **1 query** to **1 + 2 parallel indexed lookups**:

```ts
const user = await users.findById(claims.sub)          // carries staffRoleSlug already
const [parties, orgs] = await Promise.all([            // ~1 round trip
  partyMemberships.find({ userId, status: { $in: ['verified','pending'] } }),
  orgMemberships.find({ userId }),
])
```

The staff/permission resolution — the part on the hot path of *every* authorisation check —
costs **zero extra queries**, exactly as today, because `staffRoleSlug` rides along on the
user document and the `roles` registry is already an in-process cache.

The two remaining lookups are equality matches on indexed fields, issued concurrently: one
network round trip. **Decision: accept this rather than cache a snapshot on the user
document.** Snapshot drift is exactly what produced `roles[]` and its manual sync. If
profiling later shows it matters, add a snapshot then, with the edges still as truth.

A further optimisation is available and deliberately **not** taken now: most requests only
need racing scope for horse/party writes, so the two lookups could be lazy. Not worth the
complexity until measured.

---

## 5. Surfaces: two admin screens, two vocabularies

The review's "role management feels too critical" is half a **naming** problem. Today both
axes reach an admin as "roles", which is why they read as one dangerous pile.

| | Staff axis | Racing axis |
|---|---|---|
**Noun** | a **role** | a **verified identity** / **org membership** |
**Verb** | *grant* / *revoke* | *verify* / *reject* |
**Cardinality** | **one** per person | **many** per person |
**Vocabulary** | **dynamic** — superadmin defines it | **static** enum — fixed by the racing domain |
**Source of authority** | an admin's decision | evidence about the real world |
**Stored as** | `users.staffRoleSlug` → `roles` | `partyMemberships`, `orgMemberships` |
**CRM screen** | Team Members · Roles & Permissions | **Verification Queue** · Users |
**Grants permissions?** | yes | **no** — it is one input to *scope* (§1.3) |

That row of contrasts is the whole mental model: **one dynamic role that says what you may
do; many static roles that say what you are.** Keeping them in separate words and separate
screens is most of the fix for "role management feels too critical".

Concretely in the CRM:

- **Team Members** (`team.manage`) — staff only. Lists `staffRoleSlug != null`. Invite,
  change role, remove. One role per row, so the screen shows one chip per person.
- **Roles & Permissions** (`roles.manage`) — role definitions. Unchanged.
- **Users** (new, `users.view`) — the `staffRoleSlug == null` population. Read-mostly:
  search, see their party roles + org memberships, suspend. Filter by reader / party
  holder / org member.
- **Verification Queue** (new, `claims.verify`) — replaces the claims screen. Paginated
  off `{status:'pending', createdAt}`, which the embedded array cannot support.

Those last two need new permission actions. Note the review found `team.view` is
currently **dead** (the `team` module requires `team.manage`) — fold that fix in here.

---

## 6. API surfaces

```
/api/public/*   anonymous reads.  The H1/H2 visibility filters live here ONCE.
/api/me/*       self-service.  Scoped to req.account.id BY CONSTRUCTION.
                *** NEVER accepts a userId/targetId parameter. ***
/api/admin/*    staff.  newsroom.access at the router + a specific action per route.
```

This is where the security comes from. Today
[roles.ts:289](../apps/server/src/routes/roles.ts#L289) takes `{userId}` and is reachable
with `team.manage`, so a team manager assigns themselves `administrator` (review C3).
Under the split there is no self-service endpoint that can name a target, and
`/api/admin/users/:id/roles` carries the no-privilege-amplification guard in one place.

### 6.1 Route map

| Now | Becomes | Gate |
|---|---|---|
`POST /api/subscription` | `POST /api/me/subscription` | self |
`POST /api/partyClaims` | `POST /api/me/party-memberships` | self |
`POST /api/organisations` | `POST /api/me/organisations` | self |
`GET /api/notifications` | `GET /api/me/notifications` | self |
`GET /api/auth/me` | unchanged | self |
`GET /api/partyClaims/pending` | `GET /api/admin/verifications` | `claims.verify` |
`POST /api/partyClaims/:id/verify` | `POST /api/admin/verifications/:id/verify` | `claims.verify` + §7 guards |
`GET /api/staff` | `GET /api/admin/team` | `team.manage` |
`POST /api/roles/:slug/assign` | `POST /api/admin/users/:id/roles` | `team.manage` + amplification guard |
`GET /api/roles`, CRUD | `/api/admin/roles` | `roles.manage` |
— (new) | `GET /api/admin/users?type=&q=&page=` | `users.view` |
`GET /api/articles` | `GET /api/public/articles` + `/api/admin/articles` | filtered / `newsroom.access` |

Keep the old paths as thin redirects for one release so nothing breaks mid-migration.

### 6.2 Entry surfaces — two login pages, one token

**Decision: separate pages, shared auth flow. The login page is UX and intent; it is NOT
the security boundary.**

| Route | For | Signup? | On success | Refuses when |
|---|---|---|---|---|
`/login` | users | yes — links to `/signup` | `?next=` → else `/dashboard` | — |
`/admin/login` | staff | **no** — staff are invited | `?next=` → else the CRM | `staffRoleSlug == null` |
`/signup` | users only | — | `/dashboard` | — |
`/invite/:token` | invited staff | name only | `redirectTo` → else CRM | unchanged |

Both pages call the same `POST /api/auth/request-otp` and `/verify-otp` and receive the
same token. The differences are deliberate and small:

- **No signup path on `/admin/login`.** [RBAC.md §3](../RBAC.md) already requires staff to
  be admin-invited; today the shared page offers a signup link to everyone, which quietly
  contradicts it.
- **A post-verify gate.** `/admin/login` checks `user.access.permissions` for
  `newsroom.access` and, if absent, signs the session out of the admin context and shows
  *"This account doesn't have newsroom access — sign in at /login instead."* Better than
  dropping them into a CRM that 403s every call.
- **Admin branding**, no public-site chrome, no "browse as guest".

**What this explicitly does not do.** A staff member who signs in at the public `/login`
still holds a token that works on `/api/admin/*`. That is accepted: enforcement is
`/api/admin/*` + `accountCan()`, exactly as it is today, and the review's C3 fix comes from
`/api/me` never accepting a `userId` (§6) — not from which page issued the token.

Recorded so it is not mistaken for protection later: **if staff MFA or "a stolen
public-site token must not reach the CRM" ever becomes a requirement, it needs an
admin-scoped token** (`aud: 'admin'` issued only by `/admin/login`, required by
`/api/admin/*`). `users.tokenVersion` (§3.1) is already in the model, so that is an
additive change — but it is not in scope now, and the two-page split does not deliver it.

**Implementation cost is small.** `Login.tsx` becomes one component parameterised by
`{ mode: 'user' | 'admin' }`: the OTP flow, `nextFromSearch` and
[safeRedirect.ts](../apps/web/src/lib/safeRedirect.ts) are shared unchanged. `loginUrlFor`
gains an admin variant so `RequireStaff` bounces to `/admin/login?next=…` while
`RequireAuth` keeps bouncing to `/login?next=…` — which also fixes today's behaviour, where
a staff member deep-linked into the CRM is sent to the public login page.

---

## 7. Security fixes this plan absorbs

The model work fixes some review findings structurally and leaves others untouched.
**Explicitly listed so nothing is assumed fixed by accident.**

| Finding | Status under this plan |
|---|---|
**C3** `team.manage` → administrator | **Structurally fixed** — `/api/me` cannot name a target; amplification guard on the one admin route |
**C2** self-verification via own org | **Fixed here** — the verify route gets `membership.userId !== actor.id` plus "the org must itself be admin-verified". Needs a 3-line guard **shipped before** the refactor too (§8). |
**H4** non-superadmin strips superadmin | **Fixed** — one guard helper, one route, instead of two divergent paths |
**H8** `org_member` gets write scope | **Fixed** — `authorisedHorseIds` splits into read-scope and write-scope; write filters to `org_owner`/`org_manager` |
**M6** `users.email` not unique | **Fixed** — §3.5 |
**M7** `otps` unindexed | **Fixed** — §3.5 |
**M10** doc drift (one-role-per-person) | **Fixed the other way** — the **code was right, the spec was wrong**. [RBAC.md §4.4](../RBAC.md)'s "any number of users may hold any role; `staffRoles[]` is an array" gets rewritten to one-role-per-person, now an explicit owner decision rather than an accident. `wouldSelfLockOut`'s multi-role branch at [roles.ts:143](../apps/server/src/routes/roles.ts#L143) becomes definitively dead and should be simplified, not preserved. |
**L5** no session revocation | **Fixed** — `tokenVersion` on the user doc, checked in `attachAccount` |
**M5** `team.view` dead | **Fixed** — new `users.view` / `claims.verify` actions, `team` module regated |
**H7** evidence served publicly | **Partly** — `evidenceKey` replaces `evidenceUrl`; still needs the authorised `/uploads/file` split |
**C1** `horsePartyLinks` re-point | **NOT FIXED** — route-handler bug, survives untouched. Ship separately. |
**H1** `GET /api/articles` unfiltered | **NOT FIXED by the model** — but §6.1 gives it the right home |
**H2** `minTier` unenforced | **NOT FIXED** — needs its own server-side gate |
**H3** `newsroom.access` gates the homepage | **NOT FIXED** — needs new actions per surface |
**H5/H6** auth rate limits, `DEV_OTP_CODE` | **NOT FIXED** — unrelated, ship separately |
**M2** ownership by `displayName` | **NOT FIXED** — good candidate to fold into P2 (`createdByUserId` on articles) |

---

## 8. Phases

Additive and reversible. Each phase ships independently.

### P0 — Critical guards ✅ **DONE 2026-08-03**
Small, self-contained, and they stop the bleeding while the refactor is in flight. Doing
these first keeps the P1–P3 diff about the model. Server-only; no web changes, no schema
changes. `tsc --noEmit` clean.

1. **C1 ✅** — [rbac.ts](../apps/server/src/lib/rbac.ts) `horseScopedWriteGate` now authorises
   the **destination** horse on any PUT whose body carries a different `horse_id`, and
   [horsePartyLinks.ts](../apps/server/src/routes/horsePartyLinks.ts) strips `horse_id` from
   the update outright.
   - *Deviation:* `party_id` is deliberately left **writable**. The plan said strip both, but
     `HorsePartyLinkPanel` genuinely edits it, and re-pointing the party of a horse you
     already manage grants the caller no new reach — only `horse_id` fed the escalation.
   - The gate-level check is the general fix (it also covers `sales`, `reports`,
     `mediaItems`, `racingEntries`, whose handlers spread the body the same way); the strip
     is the narrow guarantee for links.
2. **C2 ✅** — [partyClaims.ts](../apps/server/src/routes/partyClaims.ts): `orgsForParty` →
   `verifiedOrgsForParty`, which requires the organisation itself to be
   `verificationStatus: 'verified'`, plus a self-verification check on the org path.
   - *Went further than planned:* rejecting self-verification alone was **insufficient**.
     A verifies-B attack still worked — create an org, mint a managed party, have any second
     account claim it, approve them. Requiring org verification closes the path completely,
     and since `POST /api/organisations` writes no `verificationStatus`, no org can use it
     today. That restores the behaviour the old (stale) comment claimed.
   - `platform.admin` is exempt from the self-check by design: it restricts nothing (an
     admin may already verify every claim) and blocking it would strand a single-admin
     install whose one admin is also a trainer.
   - The pending queue applies the same rules, so it never lists a claim the viewer would
     be refused on — including their own.
3. **C3 ✅** — `denyRoleGrant()` in [roleRegistry.ts](../apps/server/src/lib/roleRegistry.ts),
   called from `POST /api/roles/:slug/assign` and `POST /api/staff`; plus a self-check on
   `DELETE /:slug/assign/:userId`.
   - *Went further than planned:* added the **no-amplification** rule (you cannot grant a
     role holding permissions you lack) alongside the no-self-service rule. §7 had it
     scheduled for the model work, but self-assignment blocking alone only stops the
     single-actor version — two colleagues each holding `team.manage` could still promote
     each other to `administrator`.
   - Verified against 6 cases (self / other × amplifying / not × superadmin / not).
4. **H4 ✅** — `checkSuperadminLoss()` in
   [roleRegistry.ts](../apps/server/src/lib/roleRegistry.ts) now answers for all four paths
   (`roles` assign, `roles` unassign, `staff` invite-move, `staff` member-delete). The
   `roles` router previously checked only the holder count, so `team.manage` could demote a
   superadmin whenever a second existed.

### P1 — Expand ✅ **DONE 2026-08-03** (backfilled on the `stable-press-local` test cluster)

Shipped: [lib/membership.ts](../apps/server/src/lib/membership.ts) (new),
[ensureIndexes.ts](../apps/server/src/lib/ensureIndexes.ts) (+11 indexes, 23/23 building),
[scripts/migrate-user-model.ts](../apps/server/scripts/migrate-user-model.ts) (new),
and mirror calls at all 14 write sites. `tsc --noEmit` clean.

**Design change vs the plan: ONE reconciler instead of 14 bespoke dual-writes.** Every write
site already computes the *complete* new array before calling `updateOne`, so
`mirrorPartyMemberships(userId, claims)` / `mirrorOrgMemberships(userId, memberships)` take
that final array and reconcile the collection to match (insert / update / soft-delete).
One function to get right rather than fourteen, idempotent by construction, and the backfill
script calls the **same** functions — so the migration and the live path cannot drift in how
they map one user's arrays to rows. `staffRoleSlug` needed no reconciler at all: it is a
field on the document already being written, so it folds into the same `$set` and cannot
half-apply.

Verified on real data (17 users → 13 partyMemberships, 1 orgMembership, 4 slugs):
`--apply` twice → identical result (idempotent); `--check` → zero drift; soft-delete →
re-add cycle succeeds against the partial unique index; and a synthetic case proved the
headline requirement — **one user, one person-party, many static roles**, each with its own
independently-changeable `status`, removable one at a time.

Not exercised by real data: no current user holds more than one party role, and none held
more than one staff role (so the lossy-collapse warning never fired). Both paths are
structurally supported and covered by the synthetic test.

<details><summary>Original P1 task list</summary>
1. Create the two collections + every index in §3, plus §3.4.
2. `scripts/migrate-user-model.ts` — backfill from the embedded arrays. Idempotent,
   re-runnable, reports counts, `--check` mode that reports disagreement. Verify against a
   snapshot before proceeding.
   - `staffRoles[]` → `staffRoleSlug`: take element `[0]`. **Report any user with >1** —
     that is data the new model cannot represent and needs a human decision, not a silent
     truncation. (In practice everyone has ≤1, since `assign` already replaces.)
   - `partyClaims[]` → one `partyMemberships` row per entry, preserving `status`,
     `selfRegistered`, `evidenceUrl`→`evidenceKey`, `verifiedBy`, `verifierType`.
   - `orgMemberships[]` → one row per entry.
3. **Dual-write**: every write site writes both old array and new location. 14 sites —
   8 `staffRoles` ([admin.ts:52,64](../apps/server/src/routes/admin.ts#L52),
   [auth.ts:229](../apps/server/src/routes/auth.ts#L229),
   [roles.ts:275,323,346](../apps/server/src/routes/roles.ts#L275),
   [staff.ts:115,261](../apps/server/src/routes/staff.ts#L115)),
   3 `partyClaims` ([partyClaims.ts:116,194,236](../apps/server/src/routes/partyClaims.ts#L116)),
   3 `orgMemberships` ([organisations.ts:42,131,159](../apps/server/src/routes/organisations.ts#L42)).
   The `staffRoles` ones are trivial: `{staffRoles:[slug]}` becomes
   `{staffRoles:[slug], staffRoleSlug: slug}`, and `roles.ts:275`'s `pullFromAll` gains an
   `updateMany({staffRoleSlug: slug}, {$set:{staffRoleSlug: null}})`.

*Exit:* both shapes agree on every user. Reads still 100% old. Fully revertible.
</details>

**Production note:** the backfill has run against the test cluster only. Deploying P1 needs
`npx tsx scripts/migrate-user-model.ts --check` on production first (it reports duplicate
emails, which would stop the new unique index building) then `--apply`.

### P2 — Move reads ✅ **DONE 2026-08-03**

`tsc --noEmit` clean on **server and web**. Verified against real data: every one of the
17 users resolves to identical memberships, permissions and derived roles from the edge
collections as from the embedded arrays.

**Exit criterion met: zero `collection('users').find()` anywhere in the codebase.**

Also landed here, beyond the original list:
- `users.staffRoleSlug` became the canonical staff axis. `SUPERADMIN_SLUG` and
  `primaryStaffRole()` moved to identity.ts (a leaf module) so the read path, the live
  mirror and the backfill share ONE rule — duplicating it is how H4 happened.
  `staffRoles[]` survives as a one-or-zero shim, so nothing downstream changed.
- `db.count()` added. Several sites only wanted a number and were doing
  `(await find()).length`, i.e. loading a whole collection to count it.
- `partyMemberships.claimId` — the original embedded claim id, so `findClaim()` is an
  indexed lookup. **This was missed on the first pass**: the P1 backfill ran before the
  field existed, so rows lacked it and the fallback silently substituted the row's `_id`
  — an id `findClaim` could never resolve, which would have broken verify/reject. Caught
  by the verification script, fixed by re-running the backfill, and the fallback now warns
  loudly instead of failing quietly.
- **H8 fixed** — `authorisedHorseIds` split into `visibleHorseIds` / `writableHorseIds`.
  Write scope now requires `org_owner`/`org_manager`; a plain `org_member` sees the org's
  horses and cannot edit them. Verified: member 1 visible / 0 writable, manager 1 / 1.
  The **web mirror** (`rbac/can.ts`) was split identically and `canManageHorse` repointed
  at the write set — otherwise the UI would offer an Edit button the server refuses.
- **L5 fixed** — `tokenVersion` on the user doc plus a `v` claim in the JWT. Bumping the
  field invalidates every existing session; `status: 'suspended'` also revokes. Tokens
  issued before this carry no `v` and are treated as version 0, so the deploy logs nobody
  out. `attachAccountOptional` degrades to anonymous rather than 401, per its contract.

<details><summary>Original P2 task list</summary>
1. `resolveAccount` reads `staffRoleSlug` off the user doc and hydrates the two membership
   axes from their collections (§4), shimming `staffRoles` to a one-or-zero array.
   **This is the keystone** — it lands the whole consumer table in §4 for free.
2. Repoint the ten scan sites in §2. Independently verifiable, any order. Start with
   `superadminHolderCount` and `usersForParty` (hottest), then `newsroom.ts` and
   `metrics.ts` (worst per-request cost).
3. Derive `roles[]` in `toClientUser`; delete the manual sync at `partyClaims.ts:191`.
4. Split `authorisedHorseIds` into read-scope and write-scope (fixes H8).
5. Simplify `wouldSelfLockOut` — the multi-role branch is now unreachable by construction.
6. `tokenVersion` check in `attachAccount`.

*Exit:* no `collection('users').find()` anywhere. Old arrays written but never read.
</details>

**P3 is now simpler than planned.** The owner confirmed there is no production data to
preserve, so the expand/contract dance can collapse: the dual-write and the backfill exist
only to protect existing rows. P3 can drop the embedded arrays outright and rewrite
`routes/partyClaims.ts` + `routes/organisations.ts` to operate on the edge collections
directly, instead of the read-modify-write-then-mirror they still do. `scripts/migrate-user-model.ts`
stays useful as a **consistency checker** (`--check`) even once its `--apply` is redundant.

### P3 — Contract + new surfaces
1. Stop dual-writing; drop `roles`, `staffRoles`, `partyClaims`, `orgMemberships` from
   `users`; drop the `Pick<>` in `newReaderFields`.
2. New route surfaces (§6) with the old paths as redirects.
3. New CRM screens: **Users**, **Verification Queue** (§5). New permission actions
   (`users.view`, `claims.verify`) and regate the `team` module off the dead `team.view`.
4. Entry surfaces (§6.2): split `Login.tsx` into `{mode:'user'|'admin'}`, add
   `/admin/login`, drop the signup link from the admin mode, add the `newsroom.access`
   post-verify gate, and point `RequireStaff` at `/admin/login?next=…`.
5. Update [RBAC.md](../RBAC.md) — §4.2 (many static party roles, explicitly), §4.3, §4.4
   (**one** dynamic staff role per person — reverses the current wording), §7, §9.

---

## 9. Open questions for later (do not build now)

- **Org-scoped roles.** Letting an org owner define roles for their own members is a
  separate system ([RBAC.md §10](../RBAC.md)). `orgMemberships.orgRole` stays a fixed
  three-value enum.
- **Staff MFA.** `users.tokenVersion` and a future `requireMfa` flag make it possible to
  harden staff auth in place, without extracting a second table.
- **Multi-tenant.** Nothing here assumes it; nothing here blocks it.
