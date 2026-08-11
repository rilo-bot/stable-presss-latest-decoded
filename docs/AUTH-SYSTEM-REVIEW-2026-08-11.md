# Auth System Review — 2026-08-11

Review of the centralised auth model as it stands on `feature/blogs` (HEAD `740df50`),
covering the server (`apps/server`) and the web client (`apps/web`).

**Method.** Code read end-to-end plus two mechanical checks. NOT exercised in a browser
and NOT run against a live API — every behavioural claim below is derived from the source.

Verified mechanically:

| Check | Result |
|---|---|
| `tsc --noEmit -p apps/server/tsconfig.scripts.json` | clean (exit 0) |
| `tsc --noEmit -p apps/web/tsconfig.json` | clean (exit 0) |
| `npm run check:permissions -w apps/server` | 38 catalogue permissions — 36 server-enforced, 2 module-gated, **0 unenforced** |

Scoreboard as first written: **3 High · 5 Medium · 5 Low · 8 Accessibility**.

---

## 0. Update — consolidation pass, same day

The duplication described in §2 was the root cause of several findings, so it was
collapsed rather than patched. **Fixed: H1, M2, M3, M4, L3, L4.** Still open:
**H2, H3, M1, M5, L1, L2, L5, and all eight accessibility items.**

Two new files own what four routes and a script previously hand-rolled:

- **`lib/session.ts`** — `findOrCreateUser()`, `issueSession()`, `markSignedIn()`,
  `nameFromEmail()`. Account creation went from **4 call sites to 1**; session
  issuing from **2 to 1**.
- **`lib/roleGrant.ts`** — `canOfferRole()`, `grantRoleTo()`, `revokeRoleFrom()`.
  Both admin-add doors (`POST /api/staff`, `POST /api/roles/:name/assign`) and
  both revoke doors now run one guard sequence instead of two that had drifted.

Auth collapsed to two branchless endpoints:

| Was | Now |
|---|---|
| `POST /request-otp` + `mode: 'login' \| 'signup'` | `POST /start` — no mode |
| `POST /verify-otp` + `otp.purpose` branch | `POST /verify` — no purpose |
| `requestLoginOtp()` + `requestSignupOtp()` (web) | `requestOtp(email, name?)` |

The old paths are still mounted as aliases (`router.post(['/start',
'/request-otp'], …)`) so a browser holding a cached bundle across a deploy does
not 404 on sign-in. They can be dropped once a deploy has settled.

**Signing in no longer grants a role.** The pending-invite lookup at the old
auth/index.ts:204-221 is gone — it was an implicit privilege change on the login
path, and it was the copy that skipped the superadmin guard (M1's asymmetry now
has only one side left, so M1 is reduced to a note about the invite route being
the sole remaining assigner).

Behaviour change to know about: someone who ignores an invite link and signs up
normally no longer lands in the invited role. An admin re-grants from the Team
screen. This was a deliberate trade — see §3/M1.

Also fixed in passing, not in the original findings:

- `findOrCreateUser` catches duplicate-key (11000) and re-reads the winner. Every
  previous caller did find-then-insert, which has a real TOCTOU window; the
  unique partial index on `users.email` is what closes it.
- Self-identification on a role grant is now by **id everywhere**. `POST
  /api/staff` compared lowercased emails and `POST /api/roles/:name/assign`
  compared ids — the email comparison was the weaker of the two.
- `canOfferRole` gates the **invite-staging** path. Moving the guards into
  `grantRoleTo` alone would have let an invite hand out a role the actor could
  not grant directly, because that branch has no user document. Caught and closed
  during the edit; verified below.

### Verified against a running server

Not just typechecked. `apps/server` was run against local MongoDB with
`DEV_OTP_CODE` and the flows exercised over HTTP:

| Check | Result |
|---|---|
| Signup on a new address, `name` sent | account created, `isAdmin: false`, `roles: []`, 0 permissions |
| Sign-in on the same address, no `name` | same user id — no duplicate account; name preserved |
| New address with no `name` | `jane.fitzgerald2@` → `"Jane Fitzgerald"` |
| Unknown vs known address on `/start` | byte-identical `{"ok":true}` — enumeration closed |
| Wrong code / no prior start / code replay | 400 with the right message each time |
| `GET /api/auth/me` with the issued token | live account returned |
| Legacy `/request-otp` alias | 200 |
| Rate limit on `/start` | 429 after the allowance, `Retry-After` set |
| `POST /api/staff` grant, then repeat | granted, then 409 "already holds this role" |
| `POST /api/roles/:name/assign` | granted via the other door |
| Self-grant, both doors | refused, identical message |
| Superadmin grant by a non-super `administrator` | refused on **all three** paths incl. invite-staging |
| Last-superadmin floor | refused |

Test accounts and OTP/invite rows created during this were removed from the local
database afterwards, and the one real local account was confirmed to still hold
superadmin.

One tuning note: `/start` is 8 requests per 15 min per IP, not 5. A household or
office shares one public address and a genuine sign-in can spend three or four
(request, no mail yet, resend, resend). Eight still caps a single host at 32
mails an hour, which is what the limit is for.

---

## 1. The verdict up front

The centralisation is real and it is the strongest part of the codebase. The
single-resolver design does what it claims:

- **One producer.** `resolveAccount()` in `lib/effectiveAccess.ts` is the only function
  that builds an `AccountUser`, and `accountCan()` only accepts an `AccountUser`. A route
  cannot run a permission check against an unresolved user — that is a compile error, not
  a convention.
- **No authorization in the token.** The JWT carries `{ sub, email, v }` and nothing else.
  Every permission input is read live from the database on each request, so a role change
  takes effect on the next call with no session churn.
- **`isAdmin` is derived, not stored.** `identity.roleId !== null`. There is no second
  field to drift out of sync with the role actually held.
- **Fail-closed defaults.** Missing `JWT_SECRET` under `PROD=true` calls `process.exit(1)`
  rather than throwing (so the crash-guard in `index.ts` can't keep a broken process
  alive). Missing email config under `PROD=true` refuses `request-otp` with a 503 instead
  of falling back to a fixed code.
- **Open redirects guarded on both ends** — `lib/invites.ts:sanitizeRedirect` and
  `web/src/lib/safeRedirect.ts`, deliberately duplicated so either can be the one bypassed.
- **Invite tokens are treated as credentials** — 32 bytes of entropy, SHA-256 at rest,
  single-use, and unknown/expired return the same 404 so neither can be probed.
- **Self-service guards are thorough on the assign path** — can't change your own role,
  can't delete a role you hold, can't remove the last superadmin, can't grant a role
  containing permissions you don't hold yourself.
- **`POST /api/admin/seed` self-disables** the moment a superadmin exists, and checks that
  *after* the secret so it cannot be used to probe whether setup has happened.
- **Role cache is correct under concurrency** — a generation counter stops a load that
  started before a bust from committing stale data, and `inflight` is cleared on both the
  resolve and reject paths so a failed load can't park a rejected promise and break every
  authorization check until restart.

The client mirrors it honestly. `lib/permissions.ts` has no local role matrix at all —
every answer comes from `currentUser.access`, and no access payload means no permissions.
The legacy axes (`staffRoles`, `subscriptionTier`, `partyClaims`, `orgMemberships`,
`newsroom.access`) are fully gone from `apps/web/src`; grep finds only comments explaining
their removal. The persist `version: 5` + `migrate: () => null` correctly resets stale
sessions rather than hydrating a half-shaped user.

What follows is what is wrong with it.

---

## 2. High

### H1 — `POST /api/auth/request-otp` is an unauthenticated open mail sender

`routes/index.ts:130` mounts `/auth` with **no rate limiter**. The only throttle in
`routes/auth/index.ts` is a 30-second-per-email resend cooldown (line 98), and it is
per-address, so it does nothing against an attacker rotating addresses.

With `mode: 'signup'` and any address that has no account, the handler sends a real email
through Resend/SMTP (line 126). There is no cap on distinct addresses and no per-IP cap,
so a single caller can drive unlimited concurrent sends to arbitrary third-party inboxes,
each carrying your branding.

Cost, sender reputation, and blocklisting are all exposed. It also writes one permanent
`otps` row per distinct address (see L1).

`mode: 'login'` is safer by accident — an unknown address 404s before any send — but that
only narrows the vector, it doesn't close it.

**Fix.** Mount a limiter on the router. Note `rateLimit()` skips GET, so `/auth/me` is
unaffected:

```ts
// routes/auth/index.ts, above the route definitions
router.use(rateLimit('auth-otp', 5, 15 * 60_000))
```

This needs H2's `trust proxy` fix (M2) to key on the real caller rather than Render's
load balancer.

### H2 — `users.tokenVersion` is read but never written; there is no revoke path

`lib/auth.ts:92` compares `claims.v` against `doc.tokenVersion` on every request, and the
comment above it describes "sign out everywhere" as the mechanism that makes a Bearer JWT
revocable. Grepping `apps/*/src` for `tokenVersion` returns six hits: two token *signings*
that read it, three comments, and the comparison itself. **Nothing increments it.**

Consequences:

- `logout()` in `authStore.ts:256` is `set({ currentUser: null, token: null })` — purely
  client-side. The token stays valid on the server.
- A leaked or stolen token is good for its full 7-day TTL. The only way to kill it is
  soft-deleting the account (which `findById` treats as gone), which also takes the
  account's bylines and uploads with it.
- `DELETE /api/staff/member/:userId` clears the role but leaves the session alive. That
  part is *correct* — permissions resolve live, so they lose access on the next request —
  but there is still no way to end the session itself.

The load-bearing comment in `TokenClaims` about `v` being required is doing real work
(it prevents a permanent lockout regression), so the plumbing is right — the writer is
just missing.

**Fix.** Add a revoke endpoint. `db.collection().updateOne` only issues `$set`, so this
needs either a `$inc` helper or a read-modify-write:

```ts
// routes/auth/index.ts
router.post('/sign-out-everywhere', attachAccount, async (req, res) => {
  const doc = await db.collection(USERS).findById(req.account!.id)
  const next = (typeof doc?.tokenVersion === 'number' ? doc.tokenVersion : 0) + 1
  await db.collection(USERS).updateOne(req.account!.id, { tokenVersion: next })
  res.json({ ok: true })
})
```

Until then, either implement it or delete the `isRevoked` machinery and the comments
promising it — right now the code documents a capability that does not exist.

### H3 — `PUT /api/roles/:name` has no permission-amplification check

`routes/roles/index.ts:192`. The gate is `requireDefineRoles` → `roles.manage`. The body
is validated by `readRoleBody`, which filters permission ids through `isPermissionAction`
and nothing else. The only self-referential guard is `wouldSelfLockOut` (line 110), which
blocks *removing* your own `roles.manage` — it does not block *adding* anything.

So a holder of a narrow `roles.manage` role can `PUT` their own role with
`permissions: ['roles.manage', 'platform.admin', 'team.manage', ...]` and hold all of it
on their very next request, because permissions resolve live. `isSuper` is unreachable
(hardcoded `false` on create, untouched on update, and `isImmutable` blocks editing
superadmin) — but everything short of that is one request away.

`denyRoleGrant()` implements exactly the missing check for the *assign* path:

```ts
const missing = role.permissions.filter((p) => !actor.permissions.has(p))
```

The *define* path skips it. `POST /` (line 146) has the same gap — you can mint a role
holding permissions you lack. Assigning it to someone else is then blocked by
`denyRoleGrant`, and self-assign is blocked outright, so create-then-assign is closed;
edit-your-own-role is the open door.

**Severity note.** The seeded `administrator` role already holds every permission
(`BUILTIN_ROLE_PERMISSIONS.administrator = PERMISSION_CATALOGUE.map(p => p.id)`), so it
gains nothing from this. The escalation only matters where a superadmin has deliberately
created a custom role with `roles.manage` and a restricted permission set — which is
precisely the scenario dynamic RBAC exists to support. High rather than Critical.

**Fix.** In both `POST /` and `PUT /:name`, before writing:

```ts
if (!req.account!.isSuperAdmin) {
  const missing = parsed.permissions.filter((p) => !req.account!.permissions.has(p))
  if (missing.length > 0) {
    res.status(403).json({ error: 'You cannot grant permissions you do not hold yourself.' })
    return
  }
}
```

---

## 3. Medium

### M1 — Invite redemption is asymmetric about superadmin

There are two paths that apply a pending invite, and they disagree.

`routes/invites/index.ts:112` guards explicitly, with a comment explaining why:

```ts
const held = await roleOfUser(userDoc)
if (held?.isSuper !== true) {
  await assignRole(String(userDoc._id), role.id)
}
```

`routes/auth/index.ts:217` — the branch that applies a pending grant at first sign-in —
does not:

```ts
if (granted) await assignRole(String(finalDoc._id), granted)
```

No `roleOfUser`, no `checkSuperadminLoss`. Same operation, two rules. It is hard to reach
today (the invite branch in `POST /api/staff` only fires when no account exists, and the
existing-account branch does run `checkSuperadminLoss`), but the ordering that reaches it
is real: invite an address with no account, then create that account as superadmin via
`scripts/grant-superadmin.ts`, then sign in — silently demoted, with no guard and nobody
to report the refusal to.

Port the `held?.isSuper !== true` check across.

### M2 — No `trust proxy`, so IP-keyed rate limits are one global bucket

`apps/server/src/index.ts` never calls `app.set('trust proxy', …)`. Express 4 defaults it
off, so `req.ip` is the socket peer — on Render, the load balancer, identically for every
anonymous caller.

`lib/rateLimit.ts:21` falls back to `req.ip` whenever there is no account. Every
IP-keyed bucket is therefore effectively global:

- `agent-chat` (20/min) — shared across *all* signed-out visitors at once
- `invite-accept` (20 / 5 min) — shared across everyone redeeming an invite
- `admin-seed` (5 / 15 min) — shared

This fails in both directions: legitimate anonymous users 429 each other, and the limit
provides no per-attacker isolation. Fix is one line — `app.set('trust proxy', 1)` — and it
is a prerequisite for H1's limiter being meaningful.

### M3 — No global 401 handling on the client

`App.tsx:137` calls `verifySession()` exactly once, on mount. Nothing re-checks after that.

When the 7-day token expires (or the account is removed, or H2's revoke lands) while a tab
is open, every `authFetch` starts returning 401 and **nothing clears the session**. The
persisted `currentUser.access` keeps rendering the full Campaign Engine shell — sidebar,
modules, every affordance — against an API that refuses every call. The user sees blank
lists and silent failures, not "your session ended".

Grepping `apps/web/src` for `401` returns four hits: `authStore.verifySession`, and
`reactionStore`/`commentStore`, which only map it to a message string. No store logs out.

The server already sends a good message — `"Your session has ended. Please sign in
again."` — and nothing consumes it. Route the 401 through `authFetch` itself:

```ts
// lib/api.ts
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(apiUrl(path), { ...init, headers })
  if (res.status === 401 && token) useAuthStore.getState().logout()
  return res
}
```

Guard on `token` so public reads that 401 for other reasons don't nuke a session that was
never there.

### M4 — `request-otp` enumerates accounts

`mode: 'login'` against an unknown address → `404 "No account found with that email
address."` `mode: 'signup'` against a known one → `409 "An account with this email already
exists."` Both are precise oracles for whether an address has an account here.

This may well be the right UX trade (the alternative — always claiming a code was sent —
strands people who typo their address). Flagging it so it's a recorded decision rather
than an accident. If you keep it, note it in the route comment next to the "SIGNUP TAKES
A NAME AND AN EMAIL" block.

### M5 — `DEV_OTP_CODE` is a full auth bypass gated only on an env var

`routes/auth/index.ts:23`. When set, every OTP request uses a fixed code, no email is
sent, no cooldown applies, and the code is echoed in the response — for *any* address.
Deliberately decoupled from `PROD` (documented at line 20), because local dev now runs
`PROD=true` against a real cluster.

The startup warning is good. But given local dev historically pointed at the production
database (see the `local-env-hits-prod-db` note), nothing structurally prevents this
reaching a deployed environment — it is one stray Render env var from being a total
authentication bypass.

Consider a hard stop where the two combine, matching how `JWT_SECRET` already behaves:

```ts
if (DEV_OTP_CODE && IS_PROD && process.env.ALLOW_DEV_OTP_IN_PROD !== 'true') {
  console.error('[auth] FATAL: DEV_OTP_CODE is set with PROD=true — refusing to start.')
  process.exit(1)
}
```

---

## 4. Low

**L1 — OTP rows never expire.** `expiresAt` is written as an ISO **string**
(`new Date(...).toISOString()`, line 89/121), so a MongoDB TTL index cannot be added
without changing the field to a `Date`. `ensureIndexes.ts` has no TTL on `OTPS` — only the
lookup index at line 65. And `clearOtps` goes through `db.deleteOne`, which soft-deletes,
so tombstones persist too. Every distinct address ever used leaves a permanent row. Pure
storage bloat today; combined with H1 it is an unbounded write amplifier.

**L2 — `hashOtp` is unsalted SHA-256 over a 6-digit code.** A leak of the `otps`
collection is reversible by exhausting one million candidates. Mitigated hard by the
10-minute TTL and 5-attempt cap, so impact is genuinely low — but a keyed HMAC plus
`crypto.timingSafeEqual` on the comparison at line 163 costs nothing, and `routes/admin`
already demonstrates the constant-time pattern in `secretMatches`.

**L3 — `InviteAccept.tsx:37` types `InviteRole` with `slug: string`.** The server sends
`{ name, label, description, color, icon }` (`routes/invites/index.ts:66`). No `slug` is
ever read, so nothing breaks at runtime — the type is just wrong, and would mislead the
next person to touch it.

**L4 — `routes/auth/index.ts:10` imports `WithMongoId` and never uses it.** Same file
imports `project` which *is* used. Dead import.

**L5 — `adminGate` tests `req.method === 'GET'` only** (`lib/rbac.ts:88`), so a HEAD
request against a public read goes through `attachAccount` and 401s. Same in
`authedWriteGate` and `horseScopedWriteGate`. Cosmetic unless a crawler or health check
uses HEAD.

---

## 5. Accessibility

This is the weakest area of the auth surface. The pages look considered but the semantics
are thin, and the OTP step — the one screen every single user must complete — is where
most of it lands.

### A1 — No `<h1>` on desktop for `/login` or `/signup`

The only `<h1>` on either page sits inside the `lg:hidden` mobile masthead
(`Login.tsx:181`, `Signup.tsx:220`). The left brand panel is `aria-hidden="true"` and its
heading is an `<h2>` regardless. So at ≥1024px both pages have **no `<h1>` at all** and
the heading outline starts at `<h2>`.

Fix: promote "Welcome back" / the step heading in the right-hand column to `<h1>` and drop
the duplicate mobile masthead heading to a `<p>`.

### A2 — OTP inputs have no `autoComplete="one-time-code"`

`Login.tsx:310-328` and `signup/StepOtp.tsx:80-98`. Without it, iOS, macOS and Android
will not surface the emailed code for one-tap fill — users retype six digits by hand from
another app. With split inputs the convention is to put it on the first field only:

```tsx
autoComplete={i === 0 ? 'one-time-code' : 'off'}
```

### A3 — The OTP error is associated with nothing

```tsx
{otpError && <p className="text-xs text-destructive mt-1">{otpError}</p>}
```

No `id`, nothing points `aria-describedby` at it, and the inputs carry no `aria-invalid`.
A screen reader user who mistypes their code gets nothing from the fields themselves —
only the sonner toast, which they may well have moved past. The email field on
`Login.tsx:229-236` does this correctly with `aria-describedby={emailError ? 'email-error'
: undefined}`; copy that pattern onto the digit group and add
`aria-invalid={!!otpError}`.

### A4 — Step transitions are not announced

Moving email → OTP replaces the entire right-hand panel and focuses digit 1 after an 80ms
timeout. The new heading ("Check your inbox") and the instruction naming the address are
never announced — a screen reader user's focus simply lands in an unlabelled text box.

Either wrap the step in `role="status" aria-live="polite"`, or move focus to the new
heading (`tabIndex={-1}` + `.focus()`) instead of the first input, which announces the
heading and then lets the user tab in.

### A5 — `InviteAccept` auto-redeems silently

The page redeems on mount and shows `<Loader2 className="animate-spin" /> Setting up your
access…` (`InviteAccept.tsx:219-221`) with no live region, then navigates away. A screen
reader user hears silence followed by an unexplained page change. Add `role="status"` to
that block.

### A6 — The OTP `<Label>` labels nothing

`Login.tsx:300` and `StepOtp.tsx:70` render `<Label>Verification Code</Label>` with no
`htmlFor` and no associated control — a `<label>` element bound to nothing. The
`role="group"` wrapper below it already carries `aria-label="6-digit verification code"`,
so the visible label is orphaned. Give the Label an `id` and point the group at it with
`aria-labelledby` (dropping the now-redundant `aria-label`), or make it a plain `<span>`.

### A7 — No `aria-busy`, and "Resend code" has no cooldown state

Submit buttons swap their text while loading (`'Verifying…'`) but never set
`aria-busy={loading}`, so the state change is announced only if the button happens to hold
focus. Separately, "Resend code" is always enabled — clicking it within 30 seconds hits
the server cooldown and surfaces as a red error toast for what is a normal, expected
action. Disable it with a visible countdown for the `RESEND_COOLDOWN_MS` window.

### A8 — Sub-12px type and low-contrast text throughout both pages

`text-[10px]` and `text-[11px]` uppercase tracked labels appear five times across
`Login.tsx` / `StepOtp.tsx` / `StepDetails.tsx`, and the brand panel's pull quote is
`text-primary-foreground/40`. The panel is `aria-hidden` so assistive tech skips it, but
it is still visible text well below the contrast floor for sighted low-vision users. This
is the site-wide pattern already recorded in `docs/PUBLIC-SITE-REVIEW-2026-08-04.md`
(79 gold-as-text sites at 2.06:1, 170 sub-12px sites) — the auth pages are not an
exception to it, they are part of it.

---

## 6. Suggested order

1. **M2** — `app.set('trust proxy', 1)`. One line, and H1 depends on it.
2. **H1** — rate-limit the `/auth` mount.
3. **H3** — amplification check on `POST /api/roles` and `PUT /api/roles/:name`.
4. **M3** — 401 → `logout()` inside `authFetch`.
5. **H2** — either implement `sign-out-everywhere` or remove the comments promising it.
6. **A1–A3** — `<h1>`, `one-time-code`, and wiring the OTP error to the inputs. Roughly an
   hour, and they are the three that affect every user who signs in.
7. **M1, M5, L1–L5, A4–A8** as capacity allows.
