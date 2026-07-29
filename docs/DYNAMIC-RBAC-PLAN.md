# Fully Dynamic RBAC — Migration Plan

> Replaces the hardcoded six-role staff system with DB-defined roles a superadmin
> manages at runtime. Locked direction; supersedes the "custom roles layer on top"
> interim shipped on 2026-07-29.
>
> Reference model: [RBAC.md](../RBAC.md). Status doc: this file.

---

## 0. Locked decisions

| Question | Decision |
|----------|----------|
| `isStaff()` replacement | A real permission, `newsroom.access`. All ~30 sites convert. |
| Party roles / org roles | **Stay static.** Only staff/editorial roles go dynamic. |
| Superadmin | Seeded via the existing `SETUP_SECRET` flow. The role is **immutable and undeletable**, short-circuited in code before any DB read. |

### Explicitly out of scope

Three systems reuse the word "role" and must not be swept in:

- **`PartyRole`** (`owner`/`trainer`/`jockey`/`breeder`/`bloodstock agent`/`syndicate manager`/`personnel`) — racing identities bound to `horsePartyLinks`, `ROLE_BINDINGS`, the profile role rails, and the claim-verification flow.
- **`OrgRole`** (`org_owner`/`org_manager`/`org_member`) — scoped inside a single organisation.
- **`MagRole`** in `lib/magazineV2/access.ts` — per-document collaborator sharing that coincidentally uses the words "editor" and "contributor".

Also out of scope (flagged during the audit, separate work): fabricated magazine
templates in `editor/templates/blueprints.ts` + `TemplateGallery.tsx`, and static
content in `news-index/constants.tsx`, `PedigreeGrid.tsx`, `Newsletter.tsx`.

---

## 1. Target data model

```ts
// NEW collection: roles   (absorbs the interim `customRoles` collection)
{
  _id,
  slug: string,              // stable key stored on the user; unique
  label, description, color,
  icon: string,              // lucide icon NAME, resolved to a component client-side
  isSystem: boolean,         // seeded — cannot be deleted
  isImmutable: boolean,      // superadmin only — cannot be edited at all
  permissions: string[],
  modules: string[],
  workflowStages: string[],  // Kanban columns this role sees (was `allowedStatuses`)
  createdBy, createdAt, updatedAt
}
```

### User shape

The two axes get their own arrays, so a dynamic staff role can never collide with
a static party role:

```ts
user.roles[]       // STATIC axis: 'reader' + verified PartyRoles. Unchanged.
user.staffRoles[]  // DYNAMIC axis: role slugs. Replaces the interim customRoleIds.
```

No migration path exists, by decision — the database is flushed and reseeded
rather than carried forward. `withIdentityDefaults` filters `roles[]` down to
known static roles, so a leftover staff slug in that array is simply dropped.

### Superadmin

```ts
export const isSuperAdmin = (a) => a.staffRoles.includes('superadmin')

export function accountCan(account, action) {
  if (isSuperAdmin(account)) return true    // short-circuit — never reads the DB
  return resolvedPermissions(account).has(action)
}
```

`superadmin` is seeded with `isSystem: true, isImmutable: true`. The roles API
refuses to edit or delete it. There is no code path that can strip its access,
so an empty or corrupted `roles` collection cannot lock the platform out.

---

## 2. Why the sweep is safe: 1:1 behaviour preservation

The risky part is converting ~45 role checks. The rule that de-risks it:

> **Phase 1 maps every existing check to exactly one new permission, and seeds
> that permission onto exactly the roles that pass the check today. Behaviour is
> bit-identical after the sweep. Splitting into finer-grained permissions is
> later *configuration*, not code.**

| Today | Becomes | Seeded onto |
|-------|---------|-------------|
| `isStaff(account)` | `newsroom.access` | all six seeded roles |
| `isAdmin(account)` | `platform.admin` | `administrator`, `superadmin` |
| `isReviewer(account)` (newsroom.ts) | `content.editorial_review` | editor, legal_reviewer, administrator |
| `isPublisher(account)` (newsroom.ts) | `content.publish` | publisher, administrator |
| `roles.includes('legal_reviewer')` | `content.legal_review` | legal_reviewer, administrator |
| staff-only role management | `roles.manage` | `administrator`, `superadmin` |

Once shipped, a superadmin can split `newsroom.access` into per-area permissions
purely by editing role rows — no deploy.

---

## 3. Phases

### Phase 0 — Foundations (no behaviour change)

Both systems coexist; nothing switches over yet.

- `lib/roleStore.ts` (server): `roles` collection accessors + **in-process cache**
  (`Map<slug, RoleDoc>`, 60s TTL, explicit `bustRoleCache()` on every mutation).
  This is what keeps dynamic RBAC free at request time — `attachAccount` resolves
  permissions from the cache, not a per-request DB read.
- Idempotent boot seed: `superadmin` + `administrator` / `editor` / `contributor`,
  built from `BUILTIN_ROLE_PERMISSIONS` / `builtinModulesFor()` in
  `permissionCatalogue.ts`, plus `workflowStages` lifted from the web
  `ROLES[].allowedStatuses`. Inserts only what is missing — never overwrites an
  edited row. `legal_reviewer` / `podcast_producer` / `publisher` are not seeded;
  their permissions remain in the catalogue for a superadmin to rebuild from.
- Unique index on `roles.slug`.
- No migration script. The database is flushed and reseeded instead, so nothing
  reads a legacy staff slug out of `roles[]`.
- Add `newsroom.access`, `platform.admin`, `roles.manage` to the catalogue.

**Exit:** `roles` collection populated, cache warm, old code paths untouched.

### Phase 1 — Server goes role-agnostic ⚠️ highest risk

- Delete the `StaffRole` union → `type RoleSlug = string`. Delete `STAFF_ROLES`,
  `STAFF_RANK`, `primaryRole`.
- **Delete the `isStaff` and `isAdmin` exports outright.** Do not deprecate — a
  compile error at all ~42 sites is the guarantee none are missed silently.
- Convert each site per the table in §2. Audit individually; a handful of
  `isAdmin` sites are genuinely "is superadmin" rather than a permission.
- `newsroom.ts:26-28,82` — replace the hardcoded `isReviewer`/`isPublisher`.
- `attachAccount` resolves `permissions`/`modules` onto `req.account` from cache.
- Drop `role` from `TokenClaims` and stop signing it.
- Roles API → full CRUD with system-role protection + lockout guards.

**Exit:** no role slug appears in any server conditional. `grep -r "'administrator'" apps/server/src` returns only the seed.

### Phase 2 — Web goes role-agnostic

- Delete: `PERMISSIONS` matrix, `STAFF_ROLES`, `STAFF_RANK`, `primaryStaffRole`,
  `UserRole`, `ROLES`/`RoleConfig`/`getRoleConfig`, both `STAFF_ROLE_LABELS`.
- `can(action)` becomes single-argument, store-backed (~40 call sites, mechanical).
- **Role display** comes from `user.access.roles[]`. The sidebar shows *all* the
  user's roles as chips rather than one "primary" badge. Icons ship as lucide
  *names* mapped through a small client registry — components can't cross the wire.
- `allowedStatuses` → union of `workflowStages` across the user's roles.
- Behavioural branches (`isContributor`, `isEditor`, `role === 'administrator'`)
  → permission checks.
- `guards.tsx`: `RequireStaff` → `RequirePermission`; `App.tsx:316`
  `RequireRole roles={['administrator']}` → `RequirePermission 'platform.admin'`.
- **Delete `pages/StaffAdmin.tsx`** — a duplicate of TeamManagementView with its
  own copy of the role labels.

**Exit:** no role slug appears anywhere in `apps/web/src`.

### Phase 3 — Superadmin console

Extends the Roles & Permissions view already shipped:

- Full CRUD over *all* roles including the seeded six (now editable).
- Three checkbox axes: permissions · modules · workflow stages.
- System-role badges; superadmin rendered read-only with a lock.
- Assignment from Team Members (already built — repoints to slugs).
- Guards: cannot delete a role in use without confirming the affected count;
  cannot strip `roles.manage` from your own last role unless you are superadmin.

### Phase 4 — Harden & optimize

- Cache invalidation correctness; document the multi-instance TTL bound
  (see the single-instance caveat in the scalability review).
- Audit log for every role mutation and assignment — currently there is none.
- Resolver unit tests: union across N roles, superadmin short-circuit, unknown
  slug, empty roles collection, deleted-role reference.
- `/api/auth/me` served from cache rather than a collection scan.

---

## 4. Risk register

| Risk | Mitigation |
|------|-----------|
| A missed `isStaff` site silently grants or denies access | Delete the export — compiler enumerates every site |
| Bad role edit locks everyone out | Superadmin immutable + code short-circuit that never reads the DB |
| Stale cache serves revoked permissions | Explicit bust on mutation; 60s TTL bounds the multi-instance window |
| Migration leaves users role-less | Dry-run first; verify counts before and after; `roles[]` untouched as a fallback record |
| Dynamic slug collides with a party role | Separate arrays (`roles[]` vs `staffRoles[]`) makes collision structurally impossible |
| Unknown role renders as "Contributor" | `getRoleConfig`'s `?? ROLES[0]` fallback is deleted in Phase 2 |

---

## 5. Sequencing note

Phases 0 and 1 must land together in a deploy — Phase 0 alone leaves dead data,
Phase 1 alone has nothing to read. Phase 2 can follow independently because the
server keeps sending `user.access`. Phases 3 and 4 are additive.
