# PLANNING — RBAC & Entitlement Build

> Execution roadmap for the role + entitlement system.
> Model spec lives in [RBAC.md](./RBAC.md). This file is *how & in what order* we build it,
> plus live status. Update the checkboxes as phases land.
>
> Last updated: 2026-06-14 · Status: **Phases A–E — ✅ COMPLETE** · RBAC milestone delivered 🎉

---

## Decisions locked (from approval)

1. **Verification** — claim is `pending` until approved by (a) a **staff admin** via a queue,
   **or** the **org owner/manager** if the party is currently linked to their org; claimant
   attaches a **document/evidence** upload.
2. **Dashboard** — one **merged** dashboard, modules shown per active role.
3. **`org_manager`** — single level for now.
4. **Backend** — full-stack & **persisted**; permissions enforced server-side.
5. **Tiers** — `free | standard | premium`, set **manually** (billing is a later seam).

### Defaulted micro-decisions
- First-admin seed: one-time `/api/admin/seed` guarded by `SETUP_SECRET`.
- Evidence upload: reuse existing image/media pipeline (data URL → media item).
- Tier switch: plain manual selector, no Stripe, clean billing seam.
- Org verifying a claim: only `org_owner`/`org_manager` of an org the party is **currently** linked to.

---

## Current state → gaps (what exists today)

| Requirement | Status | File / gap |
|---|---|---|
| Multiple roles per user | ❌ single `role` string | `apps/web/src/stores/authStore.ts`, `apps/server/src/routes/auth.ts` |
| `subscriptionTier` axis | ❌ absent | new field |
| Default `['reader']` / `free` | ❌ signup forces editorial role | `apps/web/src/pages/Signup.tsx` |
| Reader follow | 🟡 local-only, horse-only | `apps/web/src/stores/followStore.ts` |
| Party claim + verify | ❌ party has no user link | `apps/web/src/types/party.ts` |
| Org membership | ❌ org is just a party row | new collection |
| Staff invite / admin seed | ❌ self-serve today | new routes |
| Individual/Org registration | ❌ | `Signup.tsx` |
| Permissions = role + **scope** | 🟡 role-only matrix; scope logic exists | `lib/permissions.ts` + `hooks/useProfileScope.ts` |
| `Report.visibility` enforced | 🟡 stored, never enforced | `apps/server/src/routes/reports.ts` |

**Key reusable asset:** `apps/web/src/hooks/useProfileScope.ts` already resolves the
relationship-scoped horse set — lift its core into a shared pure function.

---

## New module layout

```
apps/web/src/rbac/
  roles.ts          # Role families: Reader | PartyRole | OrgRole | StaffRole
  entitlement.ts    # SubscriptionTier + ordering + canViewContent()
  scope.ts          # pure horsesInScopeForParty() (lifted from useProfileScope)
  can.ts            # can(user, action, target?) — role + scope engine
  guards.tsx        # <RequireRole> <RequireTier> <RequireScope>
  sampleUsers.ts    # dev seed across all four populations (dev only)
apps/server/src/lib/
  rbac.ts           # server mirror of scope + can; permission middleware
```

---

## Execution phases

Each step is full-stack and independently reviewable. Tick boxes as completed.

### Phase A — Identity foundation ✅
- [x] A1. Backend user shape: `roles[]`, `subscriptionTier`, `partyClaims[]`, `orgMemberships[]`; signup defaults to `['reader']` / `free`; role picker removed. → `apps/server/src/lib/identity.ts`, `routes/auth.ts`
- [x] A2. Fresh-user middleware `attachAccount` loads live user per request; `/me` uses it. → `apps/server/src/lib/auth.ts` (token still carries derived `role` for podcast back-compat until B3)
- [x] A3. Frontend `authStore` new shape + `useHasRole/useSubscriptionTier/useActivePartyRoles` selectors; persist v3 + migrate. `currentUser.role` kept as derived staff-primary (undefined for readers) → zero consumer churn. → `apps/web/src/rbac/{roles,entitlement}.ts`, `stores/authStore.ts`, `pages/Signup.tsx`
- [x] A4. Idempotent migration `npm run migrate:rbac`. → `apps/server/src/scripts/migrateRbac.ts`
- **Verified:** both apps tsc-clean, vite + tsc builds pass, runtime smoke test (signup ignores injected `role`, account is reader/free, `/me` returns full shape). Also fixed a pre-existing `await` bug in `components/PartyForm.tsx` that blocked a clean web typecheck.

### Phase B — Permission engine ✅
- [x] B1. `rbac/scope.ts` — pure `horsesInScopeForParty` / `horsesLinkedToParty`; `useProfileScope` re-pointed (behavior-preserving). → `apps/web/src/rbac/scope.ts`
- [x] B2. `rbac/can.ts` — `isStaff/verifiedPartyIds/canStaff/orgRoleIn/authorisedHorseIds/canViewAuthorisedRecord/canManageHorse/canViewPremium`. → `apps/web/src/rbac/can.ts`
- [x] B3. `apps/server/src/lib/rbac.ts` — per-route gates replace blanket write-gate. Racing data = staff-only; tipping = any authed; articles = editorial matrix + author match; `Report.visibility` enforced on GET (non-public hidden from non-staff). `attachAccountOptional` added. → `lib/rbac.ts`, `routes/reports.ts`, `index.ts`
- [x] B4. `rbac/guards.tsx` — `RequireAuth/RequireStaff/RequireRole/RequireTier`; `/newsroom` + `/podcast/workflow` now `RequireStaff`. → `apps/web/src/rbac/guards.tsx`, `App.tsx`
- **Verified:** both apps tsc + build clean. Runtime: anon GET 200; anon write 401; reader write to horses/parties/reports/articles → 403; reader tips/tipperProfiles → 201; anon report list returns public-only.
- **Not runtime-exercised (no staff acct until Phase E seed):** staff-sees-private-reports and article author-match — both tsc-clean + logic-reviewed.
- **Behavior change shipped:** racing/editorial writes are now locked down (readers can no longer write). Existing staff accounts (migrated `roles[]`) retain access.

### Phase C — Registration & claims ✅
- [x] C0. `/api/admin/seed` (SETUP_SECRET) — idempotent first-admin bootstrap; promotes/creates; multi-admin. → `routes/admin.ts`
- [x] C1. `Signup.tsx` wizard: account-type step (**Reader / Individual**; Organisation shown "coming soon" → Phase D).
- [x] C2. Individual → claim wizard (multi-role select + optional evidence file→data-URL) → `pending` claim. → `Signup.tsx`, `stores/claimStore.ts`
- [x] C3. `/api/partyClaims`: create (one-per-role dedup; reuses one person-party across roles) + `/pending` queue + `/:id/verify` + `/:id/reject`. Dual verifier (admin now; org owner/manager seam ready for D). → `routes/partyClaims.ts`
- [x] C4. Admin verification queue page `/claims` (RequireRole administrator) + NavBar "Verify Claims" link. → `pages/ClaimsQueue.tsx`, `App.tsx`, `NavBar.tsx`
- **Verified:** both apps tsc + build clean. Runtime: seed admin; reader claims trainer → pending (+ evidence + auto person-party); admin queue shows it; reader blocked from queue (403); admin verify → `/me` roles gain `trainer`, claim `verified`; reject → stays reader w/ reason; duplicate-role → 409; re-claim after reject → 201; multi-role claims collapse to one person-party (`roles:[owner,trainer]`).
- **Deferred to D:** org-owner/manager verification UI (backend path exists; no org-linked parties until D).

### Phase D — Organisations ✅
- [x] D1. `/api/organisations`: create, `/mine`, `/:id` (members + managed parties + horse scope), members add/remove, managed-parties. Server helpers `orgRoleIn/canManageOrg/isOrgOwner`. → `routes/organisations.ts`, `lib/rbac.ts`
- [x] D2. Signup Organisation branch → create org → become `org_owner` → redirect to org dashboard. → `Signup.tsx`, `stores/orgStore.ts`
- [x] D3. `OrgDashboard` `/orgs/:id` (RequireAuth): members (add by email / remove — owner), managed parties (add), scoped horses, and the **org-scoped claim verification queue**. NavBar "My Organisation" link. → `pages/OrgDashboard.tsx`, `App.tsx`, `NavBar.tsx`
- **Verified (runtime):** create org → owner membership; owner adds member; member add→403; owner creates managed party; org detail returns members+parties+horseIds; non-member detail→403. **C↔D integration:** user claims a managed party → org owner sees it in their scoped queue → verifies with `verifierType:'org'` → claimant gains the role. Both apps tsc + build clean.
- **Org control model:** managed parties carry `managedByOrgId`; the claim org-verifier path keys on it (built as a seam in C, now live).

### Phase E — Staff & premium ✅
- [x] E1. `/api/staff` (admin-only) list/grant/revoke; grantable roles include **`administrator`** (multi-admin); grant by email attaches to an existing account or stages a **pending grant applied on first sign-in** (last-admin revoke guard). Admin portal `/staff`. → `routes/staff.ts`, `routes/auth.ts` (grant-on-login), `pages/StaffAdmin.tsx`, `stores/staffStore.ts`
- [x] E2. Merged `/dashboard` (RequireAuth) — plan/tier switch, racing-role claim, "My Stable" (scoped horses), organisations (list + create), staff/admin entries. Login + signup now land here. → `pages/Dashboard.tsx`, `Login.tsx`, `Signup.tsx`, `NavBar.tsx`
- [x] E3. `POST /api/subscription` (manual tier) + `authStore.setSubscriptionTier`; `Paywall` component; `Article.minTier` + gating in `ArticleDetail` (first paragraph = free teaser) + `minTier` selector in `ArticleForm`. → `routes/subscription.ts`, `components/Paywall.tsx`, `pages/ArticleDetail.tsx`, `components/ArticleForm.tsx`, `types/article.ts`
- **Verified (runtime):** grant editor (immediate); grant administrator to a new email → pending → **auto-applied on signup** (multi-admin via portal); non-admin staff ops → 403; subscription upgrade → premium, invalid tier → 400; article `minTier:'premium'` persists through the API. Both apps tsc + build clean.

---

## Migration & back-compat notes
- Keep old `role` as a derived getter during migration so nothing breaks mid-flight.
- `authStore` persist `version` bump with a `migrate()` mapping the old shape.
- Server migration is idempotent (safe to re-run).

## Out of scope (this milestone)
- Payment/billing integration.
- Finer-grained `org_manager` sublevels.
- Real object storage for evidence documents.
