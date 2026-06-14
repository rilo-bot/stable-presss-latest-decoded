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
surfaces (two CRMs) over one auth.**

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

### 4.4 Staff / editorial roles — *admin-granted ONLY*
`contributor` · `editor` · `podcast_producer` · `legal_reviewer` · `publisher` · `administrator`

- Never self-serve. The **first admin is seeded** via a setup step (`/api/admin/seed`,
  guarded by `SETUP_SECRET`). After that, only an admin grants the rest.
- **Multiple admins are supported** — `administrator` is just another entry in `roles[]`,
  so any number of users can hold it.
- **Admins can add other admins.** The staff-grant flow (portal) lets an existing admin
  grant ANY staff role **including `administrator`** to another user. Granting/revoking
  `administrator` is itself an admin-only action.
- Governed by the existing action matrix (see `apps/web/src/lib/permissions.ts`); the
  `team.manage` permission gates inviting/granting staff (admin-only).

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
