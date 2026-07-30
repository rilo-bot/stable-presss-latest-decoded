# RBAC & Entitlement Model — Stable Press / Future Racing

> Authoritative specification for the roles, access, and subscription model.
> This is the **reference** document — describes *what the system must be*.
> For the build sequence and status, see [PLANNING.md](./PLANNING.md).
>
> Last updated: 2026-06-13

---

## 1. Core principle

There is **ONE user identity / one login for everyone.** Roles are layered on top —
a single user can hold multiple roles. There are **no separate account types per role**.

- Every new account starts as a plain **reader**.
- Everything else (party roles, org membership, staff roles, paid tier) is added on top.

---

## 2. Two independent axes (never merge them)

| Axis | Field | Governs | Default |
|------|-------|---------|---------|
| **Roles** — *what you are* | `roles[]` (+ `partyClaims`, `orgMemberships`) | Racing & editorial **data access** via role + scope | `['reader']` |
| **Entitlement** — *what you've paid for* | `subscriptionTier` | Access to **premium/gated content ONLY** | `'free'` |

These are **orthogonal**. Anyone on any role can hold any subscription tier.
A premium reader with no roles can view premium content but can **edit no racing or
editorial data**. A verified trainer on the free tier can manage their stable's horses
but cannot read premium-gated articles.

---

## 3. The four populations (one shared login)

| Population | How they arrive | Notes |
|------------|-----------------|-------|
| **1. Readers** (base, largest) | Default state of every account | No party, no org, no staff. Browse public content, follow entities, may hold a subscription. |
| **2. Racing parties** | Self-register, **then verified** | Claim party role(s); a claim is read-only `pending` until verified. |
| **3. Organisations** | Self-register as an organisation | A party of type `organisation`; has member users; owns/manages horses. |
| **4. Editorial staff** | **Admin-invited only** | Never self-serve. First admin is seeded; admins invite the rest. |

All four share the same user/login table. **Racing and Editorial are separate admin
surfaces (two Production Systems) over one auth.**

---

## 4. Role families

### 4.1 Reader (the floor)
Every account has `reader`. Grants: browse public content, follow horses/owners/parties,
hold a subscription. No editing of any racing or editorial data.

### 4.2 Party roles — *racing identities, self-claimed + verified*
`owner` · `trainer` · `jockey` · `breeder` · `bloodstock agent` · `syndicate manager` · `personnel`

- A claim must be **VERIFIED** before it becomes active. Until then it is `pending` and **read-only**.
- Each **active** (verified) party role links the user to a `party` record and unlocks a
  tailored module on the merged dashboard.
- A user may hold **multiple** party roles (e.g. trainer + jockey).

### 4.3 Org-membership roles — *scoped to one organisation*
These only mean something **inside one organisation** — what you can do within that org's
data, not what you are in racing terms. They live in `orgMemberships`, never the global
`roles[]` array.

| Org role | Can do | Cannot do |
|----------|--------|-----------|
| **org_owner** (principal) | Full control: members, billing, all horses/data, delete org | — |
| **org_manager** | Operational: add/edit horses, attach parties, manage records, see private reports for org horses | Billing, org deletion |
| **org_member** | View org's horses & data, see own shareholding/tokens | Edit org-wide data |

> `org_manager` is a **single level** for this milestone (no stable-manager vs syndicate-manager split yet).

A member's effective access is always: **their org role × the org's scope** (the horses
that org is linked to).

### 4.4 Staff / editorial roles — *fully dynamic, admin-granted ONLY*

**There is no hardcoded staff-role list.** Staff roles are rows in the `roles` collection,
referenced from `user.staffRoles[]` by slug and resolved through
`apps/server/src/lib/roleRegistry.ts`. Anything a superadmin creates in the console is a
first-class role, indistinguishable from a seeded one.

A fresh install is seeded with four:

| Slug | Notes |
|------|-------|
| `superadmin` | All access, short-circuited in code. `isImmutable` — cannot be edited or deleted. |
| `administrator` | Every permission in the catalogue, but editable and deletable. |
| `editor` | Full editorial control across all workflow stages. |
| `contributor` | Draft and submit only. |

`legal_reviewer`, `podcast_producer` and `publisher` were part of the pre-dynamic union and
are deliberately **not** seeded. Every permission they held still exists in the catalogue, so
a superadmin can rebuild any of them from the console.

- Never self-serve. The **first superadmin is seeded** via `/api/admin/seed`, guarded by
  `SETUP_SECRET`. After that, only someone holding `roles.manage` grants the rest.
- Any number of users may hold any role; `staffRoles[]` is an array.
- Only a superadmin may grant `superadmin`, and the last one cannot be unassigned.

### 4.5 Defining a role — *three checkbox axes*

From **Newsroom → Roles & Permissions**, a superadmin ticks three independent sets:

| Axis | What it controls | Stored as |
|------|------------------|-----------|
| **Modules** | Which navigation surfaces the role can open (sidebar entries, Editor Hub tabs) | `roles.modules[]` |
| **Workflow columns** | Which Kanban stages are visible on the board | `roles.workflowStages[]` |
| **Permissions** | Which actions from the catalogue the role may perform | `roles.permissions[]` |

The catalogue backing all three lives in `apps/server/src/lib/permissionCatalogue.ts` — the
single source of truth — and the web app fetches it via `GET /api/roles/catalogue`, so adding
an action makes a new checkbox appear without a frontend change.

- Effective access = **union** across every role the user holds. Roles are additive; nothing
  subtracts. Resolved server-side in `apps/server/src/lib/effectiveAccess.ts` and returned as
  `user.access` on `/api/auth/me`.
- `superadmin` short-circuits in `accountCan()` **before** any registry read, so an empty or
  corrupt `roles` collection cannot lock the platform out.
- Roles are cached in-process for 60s and busted explicitly on every mutation.

> **Current enforcement depth.** The three axes drive **navigation and UI affordances**; the
> API gates enforce the permission axis via `accountCan`. Modules and workflow stages are not
> re-checked server-side — see §10.

---

## 5. Account type at registration (racing side)

Everyone starts as `reader`. The racing-side registration then branches:

- **Individual** → claims party role(s) (with evidence) → continues to the merged dashboard;
  modules appear per **active** role.
- **Organisation** → creates an org (a party of type `organisation`: syndicate, stud, stable,
  agency) and becomes its `org_owner`. The org can either:
  - create a **managed party** it controls fully (no separate login for that party), **or**
  - **invite** a real person as a user who brings their own login and links into the org.

---

## 6. Permissions are ROLE + SCOPE, not role alone

- **Scope** comes from the **dated links** between a party and its horses
  (`HorsePartyLink`, current/expired via `isCurrentLink`).
- A trainer can edit horses **in their stable**, not every horse.
- **"Authorised-only"** records (private reports, vet records) are visible only if the
  user has a **current link** to that horse. Records always attach to a horse; parties see
  records via their link to the horse — so permission checks are **relationship-scoped**.
- The scope resolver is the pure function `horsesInScopeForParty(partyId, role, {horses, links})`,
  lifted from `apps/web/src/hooks/useProfileScope.ts` and shared client + server.
- **Premium content is gated separately** by `subscriptionTier` — independent of all roles.

### Permission check shapes
```
can(user, action, target?)            // role + scope
  - staff actions   → action matrix (permissions.ts)
  - party actions   → verified party role AND target.horseId ∈ scope
  - org actions     → required orgRole within target.orgId
canViewContent(user, content)         // entitlement only: content.minTier <= user.subscriptionTier
```

---

## 7. Claim verification workflow

A party claim (`partyClaims[]` entry) moves: `pending` → `verified` (or `rejected`).

- **Claimant** attaches **document/evidence** at claim time (`evidenceUrl`, via the existing
  media/image pipeline).
- **Two verifier paths:**
  1. **Staff admin** approves via the editorial verification queue (`verifierType: 'admin'`).
  2. **Org owner/manager** approves *if the claimed party is **currently linked** to an org
     they own/manage* (`verifierType: 'org'`).
- On approve: status → `verified`, the party role joins the user's effective `roles[]`, and
  the user↔party link becomes active. On reject: status → `rejected` with a reason.
- While `pending`: the role is **read-only** — no edit access to any scoped data.

---

## 8. Subscription tiers (entitlement)

Ordered: `free` < `standard` < `premium`.

- Set **manually** for now (a tier selector) — **no payment integration yet**, but with a
  clean billing seam (`/api/subscription`).
- Gated content carries `minTier` (default `free`): applies to premium articles, bulletin
  issues, and podcast episodes.
- Gating is enforced by `canViewContent()` only and **never** affects role/scope checks.

---

## 9. Data model (target shapes)

**User** (backend doc + frontend `AuthUser`):
```ts
{
  id, email, displayName, createdAt,
  roles: Role[],                  // default ['reader']; union of reader + staff + VERIFIED party roles
  subscriptionTier: 'free' | 'standard' | 'premium',   // default 'free'
  partyClaims: Array<{
    id, partyId, role: PartyRole,
    status: 'pending' | 'verified' | 'rejected',
    evidenceUrl?, verifiedBy?, verifierType?: 'admin' | 'org', verifiedAt?, rejectionReason?
  }>,
  orgMemberships: Array<{ orgId, orgRole: 'org_owner' | 'org_manager' | 'org_member' }>,
}
```
- Source of truth = `partyClaims` + `orgMemberships` + explicit staff grants.
- `roles[]` is a derived convenience cache kept in sync (verified party roles flattened in).

**Organisation** = a `Party` with `party_type='organisation'` (keeps existing horse-link /
scope machinery) **+** a membership collection (users↔org) **+** *managed parties*
(party rows with `managedByOrgId`, no user/login).

**Content gating** = `minTier` field on articles / bulletin issues / podcast episodes.

---

## 10. Seams for later (don't build now)
- **Billing/payments** — tier is set manually; `/api/subscription` is the seam.
- **Real evidence storage** — reuse media pipeline now; swap for object storage later.
- **Finer org roles** — `org_manager` stays single-level until a later milestone.
- **Custom roles as a server boundary** — §4.5 roles are UI-scoped today. The seam is
  `resolveAccess()` vs `builtinPermissions()` in `lib/effectiveAccess.ts`: the gates in
  `rbac.ts` call the built-in-only path, and switching them to action checks against the
  resolved set is what makes custom roles enforceable.
- **Org-scoped custom roles** — §4.5 roles are global/editorial. Letting an org owner define
  roles for their own members is a separate system.
