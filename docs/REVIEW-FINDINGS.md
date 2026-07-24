# Stable Press — Review Findings Register

> Full issues/bugs register from the 2026-07-23 code review.
> Companion document: [PROJECT-OVERVIEW.md](./PROJECT-OVERVIEW.md).
>
> Severity key: **Critical** = exploitable / data loss; **High** = correctness or
> security impact in normal use; **Medium** = wrong behavior in common paths;
> **Low** = polish / defense-in-depth. Each entry lists `file:line`, a concrete failure
> scenario, and a fix.

## Summary counts

| Severity | Count | IDs |
|---|---|---|
| Critical | 4 | C1–C4 |
| High | 6 | H1–H6 |
| Medium | 13 | M1–M13 |
| Low | 12 | L1–L12 |

**Two systemic root causes** worth fixing once, everywhere:
1. **Do content/entitlement filtering server-side, not in the browser** (drives C3, H6, M8, and restricted-report visibility).
2. **Fail closed on missing production config** (drives C1, C2, and the SETUP_SECRET note).

---

## 🔴 Critical

### C1 — OTP falls back to a fixed code `123456` and leaks it in the API response
- **Where:** `apps/server/src/routes/auth.ts:79`, `:99-101`; `apps/server/src/lib/email.ts:26`; only warned at `apps/server/src/index.ts:21-23`.
- **Detail:** `const code = isEmailConfigured() ? genOtp() : '123456'` — the fallback triggers whenever SendGrid is unconfigured, keyed on env alone (not a real dev flag), and the code is returned to the client as `devCode`.
- **Scenario:** a production deploy missing `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` (one ops mistake) makes every account a takeover target — request an OTP for any email, sign in with `123456` (or read `devCode` from the JSON response).
- **Fix:** gate the fallback on an explicit `NODE_ENV !== 'production'` / dev flag; refuse to issue OTPs in prod when email is unconfigured; never return `devCode` outside dev.

### C2 — JWT signing secret silently falls back to a hardcoded constant
- **Where:** `apps/server/src/lib/auth.ts:12-17`.
- **Detail:** `JWT_SECRET = (env ?? '').trim() || 'dev-only-insecure-secret'`, warn-only.
- **Scenario:** if `JWT_SECRET` is unset in prod, anyone forges `{sub:<any user id>, role:'administrator'}` with the public constant and becomes admin.
- **Fix:** throw on startup when in production and `JWT_SECRET` is unset (fail closed).

### C3 — `GET /api/articles` performs no server-side status/tier filtering
- **Where:** `apps/server/src/routes/articles.ts:13-16`; enforced-public mount `apps/server/src/index.ts:139`; client gate `apps/web/src/pages/ArticleDetail.tsx:207,560-562`.
- **Detail (two exposures, one root cause):**
  - **Premium paywall is cosmetic** — the full body (`article.summary`) ships to every client; the paywall only decides which paragraphs to *render*.
  - **Unpublished content is public** — drafts, `submitted`, `legal_review`, `compliance`, `publisher_review`, `archived` are all returned; pages merely filter client-side.
- **Scenario:** an anonymous user hits `/api/articles` and reads premium bodies and legally-sensitive in-review copy before publication.
- **Fix:** filter by status/tier server-side for non-staff (attach account optionally on GET). The podcast route already does this correctly — `apps/server/src/routes/podcastEpisodes.ts:42-47`. Truncate premium bodies to a teaser for unentitled callers.

### C4 — Public unauthenticated `/api/uploads/file/*` streams any key; SVG uploads allowed
- **Where:** `apps/server/src/routes/uploads.ts:147-170` (public GET, no auth); `:10` (`image/svg+xml` in `IMAGE_TYPES`).
- **Detail:** the file endpoint requires no auth and streams *any* key — including `evidence/<userId>/…` identity documents attached to claims — relying only on UUID unguessability (security-by-obscurity) for PII. Separately, an uploaded SVG containing `<script>`, served from the API origin with an executable content-type, is stored XSS if opened as a top-level document.
- **Scenario:** claim evidence (ID documents) is retrievable by anyone with the URL; a malicious SVG runs script in the API origin.
- **Fix:** require auth + an ownership/scope check for sensitive kinds; serve uploads with `Content-Disposition: attachment` + restrictive CSP; drop `image/svg+xml` (or sanitize + force a non-executable content-type).

---

## 🟠 High

### H1 — Magazine structural edits & publish clobber collaborators' concurrent work
- **Where:** `apps/web/src/stores/magazineStore.ts:263` (`flushStructure`), `:315` (owner `persistRestored`), `:658` (`buildIssuePayload`); server `apps/server/src/routes/magazines.ts:224` (`PUT /:id/pages`).
- **Detail:** every owner add/delete/reorder page — **and owner undo/redo** — PUTs the owner's *entire in-memory pages array* (content included); the server replaces the whole document. The owner never refetches, so their copy of collaborator-edited pages is whatever loaded at open time. Publish (`buildIssuePayload`) freezes the same stale snapshot into the public issue.
- **Scenario:** Owner opens at 9:00; collaborator saves page-5 edits at 9:05; owner reorders a page (or hits Ctrl+Z) at 9:10 → collaborator's page-5 edits are permanently overwritten. This is whole-document last-write-wins, not the documented per-page model.
- **Fix:** make structural ops targeted server-side (send order + added/removed page ids applied against stored pages), or refetch-and-merge before `flushStructure`/publish; publish from the stored doc, not a client-supplied array.

### H2 — No referential-integrity cleanup on horse/party delete (orphans + scope leak)
- **Where:** `apps/server/src/routes/horses.ts:212`, `parties.ts:111`.
- **Detail:** delete only soft-deletes the single doc. Deleting a horse leaves its `horsePartyLinks`/`reports`/`sales`/`racingEntries`/`mediaItems` live; deleting a party leaves dangling ids in links, `sale.buyer_party_id`, `racingEntry.jockey_id/trainer_id`, `mediaItem.featured_party_ids`, and every horse `*Ids` array. Orphaned links still feed `authorisedHorseIds` (`lib/scope.ts:85-95`).
- **Scenario:** staff delete a duplicate party; its links persist, the horse page keeps showing the deleted person as owner, and scope/authorisation still grants access through the orphaned link. (Likely the root of the "data inconsistency" commits.)
- **Fix:** cascade soft-delete children on horse delete; on party delete remove links and pull the id from every horse `*Ids` array — or block deletion while references exist.

### H3 — New race defaults to invalid status `'pending'`
- **Where:** `apps/server/src/routes/races.ts:38` (`status: body.status ?? 'pending'`); enum in `apps/web/src/types/tip.ts:1` (`upcoming | open | closed | resolved`).
- **Scenario:** a race created without explicit status becomes `'pending'`; every client filter keys on `'open'`/`'upcoming'` (`Landing.tsx:110`, `TippingRing.tsx:113-117`), so the race is invisible everywhere and can never be tipped or resolved.
- **Fix:** default to `'upcoming'`, or validate `body.status` against `RACE_STATUSES`.

### H4 — `org_member` (view-only per spec) gets write access to org-linked horses
- **Where:** `apps/server/src/lib/scope.ts:85-95` (`authorisedHorseIds`); mirror `apps/web/src/rbac/can.ts:84-103`; consumed by `rbac.ts:94-106`.
- **Detail:** `authorisedHorseIds` folds in *every* `orgMembership.orgId` regardless of `orgRole`, so any horse linked with `party_id === orgId` grants write to all members.
- **Scenario:** an org owner adds a plain `org_member` and links a horse to the org; that member can now edit/delete the horse and its child records — contradicting RBAC.md ("org_member cannot edit org-wide data").
- **Fix:** only `org_owner`/`org_manager` memberships should be write-authorising; keep `org_member` in a view-only scope. (Also note the inverse: managed-party horses aren't included in members' authorised set — see L2.)

### H5 — No rate limiting on `/api/agent/*`; several LLM endpoints accept anonymous callers
- **Where:** `apps/server/src/index.ts` (no limiter, CORS `*`); `/chat`, `/compose`, `/voice/{transcribe,speak}` use `attachAccountOptional` (`agent.ts:19`, `agentCompose.ts:26`, `agentVoice.ts:26/48`; voice accepts a 25 MB body at `agentVoice.ts:25`).
- **Scenario:** an anonymous script POSTs `/api/agent/chat` or `/api/agent/voice/transcribe` in a loop and drains the OpenRouter/OpenAI budget — no per-IP/per-account throttle, no daily cap.
- **Fix:** add rate limiting on all `/api/agent/*` mounts (tighter for unauthenticated); require auth for voice/compose; add a per-account daily token budget.

### H6 — Play-money economy is client-trusted (forgeable leaderboard)
- **Where:** `apps/server/src/routes/tipperProfiles.ts:66-69` (strips only `totalWon`, leaves `coinBalance`/`totalWagered` member-writable); `tips.ts:30-49` (accepts `userId`, `wager`, `odds` from the body, no validation/debit); limits live only client-side in `apps/web/src/stores/tippingStore.ts:96-109`; concurrent `/resolve` in `tipping.ts:33-36`.
- **Scenario:** a member PUTs `{coinBalance: 1000000}` to their own profile, or POSTs a tip with `odds:9999` then `/resolve` credits a huge server-side payout; two concurrent `/resolve` calls double-credit.
- **Fix:** make wager debit/credit fully server-authoritative (verify and decrement balance transactionally on tip create, credit only on resolve); reject client-supplied `coinBalance`/`odds`; guard `/resolve` against concurrency (atomic status transition).

---

## 🟡 Medium

### M1 — Podcast routes authorize off the stale JWT `role`, not the live account
- **Where:** `apps/server/src/routes/podcastEpisodes.ts:44,51,80,128` (use `req.user.role`).
- **Detail:** every other surface uses `attachAccount` (live roles); podcast is the exception. A revoked `podcast_producer` keeps access up to 7 days; and because the token carries only the single highest-ranked staff role, an `editor`+`podcast_producer` is treated as `editor` and loses producer create rights.
- **Fix:** switch podcast routes to `attachAccount` and evaluate against every role in `account.roles`.

### M2 — Article edit ownership keyed on display-name string equality
- **Where:** `apps/server/src/lib/rbac.ts:222-229`; mirror `apps/web/src/lib/permissions.ts:271-282`; author is client-set on create (`articles.ts:39`). Article Studio can also set `author` (`articleTools.ts:17`).
- **Scenario:** two contributors share/collide on a display name → each can edit the other's drafts; or a contributor renames themselves to match a byline.
- **Fix:** stamp and compare an immutable `authorUserId` on articles instead of the display-name string.

### M3 — `scheduled` items never auto-publish (articles & podcast)
- **Where:** articles excluded from `isLive` (`ArticleDetail.tsx:199-202`, NewsIndex); podcast `EpisodeDetailPanel.tsx:86-93` sets `scheduled` + `scheduledFor`. No scheduler anywhere flips `scheduled → published`.
- **Scenario:** an editor schedules a story/episode; the date passes and nothing goes live until someone manually republishes.
- **Fix:** add a server-side promotion job (or on-read promotion), or relabel the UI as manual-only.

### M4 — Studio generation endpoints don't enforce the feature's own role server-side
- **Where:** `apps/server/src/routes/agentStory.ts:20`, `agentArticle.ts:21`, `agentProfile.ts:20` (all `attachAccountOptional`, no role check). Contrast `agentEditor.ts:29-36` (correct: `attachAccount` + `isStaff` up front).
- **Scenario:** a guest drives Story Studio to completion; the LLM generates a full article every turn; only the final `POST /api/articles` 403s — all the model cost was already incurred.
- **Fix:** gate `/story` and `/article` chat with `attachAccount` + the relevant capability before streaming.

### M5 — Attachment count/size enforced only client-side
- **Where:** caps in `apps/web/src/agent/attachments/attachments.ts:17-23`; server only has the 30 MB JSON cap (`index.ts:59`) and 100-message cap (`agent.ts:32`).
- **Scenario:** a crafted client posts a conversation stuffed with many large data-URL PDFs/images under 30 MB; each turn re-sends all of them to the vision model → repeated large bills.
- **Fix:** validate attachment count and per-file/total bytes server-side; reject over-cap payloads with 413.

### M6 — `ArticleForm` save is not awaited → false success + closes on failure
- **Where:** `apps/web/src/components/ArticleForm.tsx:240-253`.
- **Detail:** `updateArticle`/`addArticle` are async but not awaited; `toast.success` + `onClose` run immediately, `finally setSaving(false)` fires before the request resolves.
- **Scenario:** the server rejects the save; the store rolls back with an error toast, but the form already showed "Story updated" and closed. (Contrast `ArticleDetail.saveEditing:122-138`, which awaits and checks `ok`.)
- **Fix:** `await` the store call; keep the dialog open and skip the success toast on failure.

### M7 — Clearing category / reading time / image in ArticleForm doesn't persist
- **Where:** `apps/web/src/components/ArticleForm.tsx:231-237` sends `category || undefined` etc.; store requires `null` to clear (`articleStore.ts:6-17`); server merge keeps old value on `undefined` (`articles.ts:72-84`).
- **Scenario:** an editor removes a category (or empties reading time / image) and saves; it clears optimistically but reloads with the old value.
- **Fix:** send `null` for intentionally-emptied optional fields (as `ArticleDetail`'s inline editor already does).

### M8 — Archived articles miscounted as Drafts on the newsroom board
- **Where:** `apps/web/src/pages/Newsroom.tsx:201-214` — `buckets` has no `archived` key, so `else map['draft'].push(...)` dumps archived stories into Draft.
- **Scenario:** archiving inflates the Draft column and the "My/Total Stories" tiles; archived pieces reappear as drafts.
- **Fix:** add an `archived` bucket (or exclude archived from the board and `totalStories`).

### M9 — Systemic `Date`-typed-as-`Date` mismatch (runtime strings)
- **Where:** types declare `createdAt: Date` / `publishedAt: Date | null` in `article.ts:23,30`, `horse.ts:2`, `party.ts:77`, `horsePartyLink.ts:29`, `horseReport.ts:24`, `sale.ts:20`, `racingEntry.ts:21`, `mediaItem.ts:13`; every route stores `new Date().toISOString()` (a string); no store converts on read.
- **Scenario:** any code trusting the type and calling `article.createdAt.getTime()` throws. Masked today by defensive `new Date(...)` wrapping at call sites, but a latent trap for sorting/arithmetic.
- **Fix:** type these as `string` (ISO) consistently — as `Podcast`/`Race`/`Tip` already do — or parse to `Date` at the store boundary.

### M10 — No FK / enum / required-field validation on writes
- **Where:** `mediaItems.ts:20` (validates only `title`, not type-required `horse_id`); `racingEntries.ts:20`; `sales.ts:20`; `reports.ts:26`; `horsePartyLinks.ts:18` (accepts any `relationship_type`).
- **Scenario:** a partial/buggy client POST persists an incomplete or dangling record (media with no horse; link with `relationship_type:"banana"` → `HORSE_PARTY_RELATIONSHIP_LABELS[rel]` undefined → blank header) that later renders blank or crashes list views.
- **Fix:** validate all type-required fields and enum membership; optionally verify referenced ids exist; return 400 with the offending field.

### M11 — Restricted reports hidden from their own authorised members; missing visibility fails open
- **Where:** `apps/server/src/routes/reports.ts:16-22` (non-public shown only to `isStaff`; `visibility ?? 'public'`); TODO `reports.ts:15` leaves horse-scoped access unimplemented.
- **Scenario:** an owner uploads a restricted vet report and then can't see it (only staff can); a legacy report missing `visibility` leaks to anonymous readers.
- **Fix:** scope private-report visibility to `canViewAuthorisedRecord` (staff **or** authorised horse link); default missing `visibility` to `restricted` (fail closed).

### M12 — Account enumeration + weak OTP throttling
- **Where:** `apps/server/src/routes/auth.ts:51-59` (login 404 vs signup 409 reveals account existence); attempt cap resets on resend (`:70-73,124-128`); no global limiter (`index.ts`).
- **Scenario:** enumerate which emails have accounts, then brute the OTP 5 guesses per 30s per email with fresh codes (catastrophic combined with C1).
- **Fix:** identical generic response for both modes; IP + per-email rate limiting; track cumulative failed attempts across resends.

### M13 — Overlapping magazine page assignments silently drop edits
- **Where:** server `apps/server/src/routes/magazines.ts:20` (comment) vs `addCollaborator` `:289`; per-page PATCH is unconditional last-write-wins with no version check.
- **Scenario:** two collaborators both granted `'all'`/overlapping pages edit the same page simultaneously → one side's edit is silently dropped.
- **Fix:** optimistic-concurrency guard on the per-page PATCH (per-page `rev`/`updatedAt`; reject stale with 409 + prompt reload), or warn on overlapping assignments.

---

## 🟢 Low

### L1 — Two independent undo stacks in the magazine editor
`apps/web/src/editor/agent/applyEdits.ts:74,165` + store undo `magazineStore.ts:606`. AI applies push both a store-level and an AI-panel undo entry; Ctrl+Z and "undo last AI change" are separate stacks over the same content → confusing reverts. **Fix:** unify on one authority.

### L2 — Gate wiring inconsistency; dead `reportsGate`
`apps/server/src/index.ts:146` mounts `/api/reports` with `horseScopedWriteGate` while a dedicated staff-only `reportsGate` sits unused at `rbac.ts:237-249`. Also, managed-party horses aren't in members' `authorisedHorseIds` (inverse of H4). **Fix:** decide the intended report write policy; remove the dead gate.

### L3 — Article rich-text stored unsanitized server-side
`apps/server/src/routes/articles.ts:39,72` spread `...body` with no `sanitizeRichText` (unlike magazines/issues). Safe today only because the web app renders article text as escaped React nodes; latent stored-XSS for any future HTML-rendering consumer. **Fix:** sanitize article rich-text server-side as defense-in-depth.

### L4 — PDF export ships blank artwork silently; can't fetch private-bucket images
`apps/web/src/pages/BulletinViewer.tsx:131-133` resolves readiness on image `load` **and `error`**, so `data-bulletin-ready` fires even when images fail; published-issue renders run anonymously (`apps/server/src/routes/issues.ts:126`) so private-bucket images 401 and vanish. The 45s `waitForSelector` (`pdf.ts:124`) can also time out image-heavy issues. **Fix:** fail/flag on image error; ensure published images are publicly fetchable (or forward a service token); paginate large issues.

### L5 — Default artwork depends on live third-party (Pexels) URLs
`apps/web/src/editor/templates/helpers.ts:28`, `blueprints/_shared.ts:42`. Unedited regions and the default cover reference `images.pexels.com`; publishing without replacing them yields a bulletin/PDF dependent on Pexels uptime and slows headless render. **Fix:** self-host default/stock images (or proxy at publish so frozen issues are truly self-contained).

### L6 — Breaking news has no expiry; ticker rotates oldest-first
No expiry field (`types/breakingNews.ts`); server sorts oldest-`createdAt` first (`breakingNews.ts:19-24`); ticker starts at index 0 (`LandingHero.tsx:32-44`); `breakingNewsStore.addItem:47` appends without re-applying `sortOrder`. **Fix:** add optional `expiresAt` with filtering; sort newest-first; re-sort locally after add.

### L7 — Bulletin-status articles vanish once any magazine issue exists
`apps/web/src/pages/Bulletins.tsx:312` renders the bulletin-article section only when `publishedIssues.length === 0`. **Fix:** render both the issues newsstand and the bulletin-article sections, or make the intent explicit.

### L8 — NewsIndex loading spinner is a fixed 500ms timer
`apps/web/src/pages/NewsIndex.tsx:46-51` — `loading` flips off after 500ms regardless of fetch state; on a slow network the skeleton clears and an "empty" flash appears before data. **Fix:** drive `loading` off the store's `loaded`/`loading` (as Landing does).

### L9 — Metrics "Active Members" counts all users
`apps/server/src/routes/metrics.ts:27` sets `activeMembers: users.length`. **Fix:** relabel to "Members" or compute real activity.

### L10 — Article store never refetches after first load → stale public site
`apps/web/src/stores/articleStore.ts:51` (`if (loading || loaded) return`). A reader with an open tab never sees newly published stories until a hard reload (podcast store refetches each visit — copy that). **Fix:** background refresh on mount while keeping the current list visible.

### L11 — Report PUT mass-assignment; SETUP_SECRET hardening
`apps/server/src/routes/reports.ts:50` spreads `...req.body`, letting a scoped member move a report to another `horse_id` or flip `visibility` (horses PUT correctly strips protected fields — copy that). `admin.ts:23` compares `SETUP_SECRET` with `!==` (non-constant-time) and the seed stays enabled while the env var is set. **Fix:** allow-list writable fields on report PUT; use `crypto.timingSafeEqual` and a disable-after-seed mechanism.

### L12 — `tipperProfiles` uniqueness is a check-then-insert race; other small gaps
`tipperProfiles.ts:32-40` (no unique index → duplicate profiles under concurrency; resolution credits only `profiles[0]`). Also: profile `setField` accepts an arbitrary field key with no server allow-list (`profileTools.ts:24-31`; data-integrity, not escalation — the escalation-critical fields are stripped); Article Studio undo is single-step (`articleToolExecutor.ts:61`); load-time `renumberPages`/`reconcilePages` mutate content without persisting (`magazineStore.ts:363`); `reconcilePages` never drops stale regions or handles kind changes (`magazineStore.ts:74-88`); `horsePartyLinks` POST doesn't default `start_date` (`horsePartyLinks.ts:39-46`); racy issue republish version bump (`issues.ts:233`). **Fix:** unique index + upsert on `userId`; allow-list `setField` keys; give Article Studio an undo stack; persist reconciliation once after load; atomic `$inc` for issue version.

---

## Recommended fix order

1. **Criticals C1–C4** — exploitable and mostly a few lines each; do first.
2. **H1–H3** — the data-integrity trio (magazine clobbering, delete orphans, dead races) most affecting real content correctness.
3. **H4–H6** — RBAC scope, LLM cost abuse, tipping integrity.
4. Work the Medium list into normal sprints; Low as polish.

## Verified correct (so they aren't regressed away)

- Read-only concierge AI tools mirror REST GET scoping; write/action tools proxy gated endpoints with the caller's Bearer + a `confirmed:true` handshake — the LLM never bypasses a permission check.
- API keys are server-only; `.env` / `deploy.secrets.ps1` gitignored and never committed.
- HTML sanitizer (`sanitizeHtml.ts`) — sound allowlist, applied on all magazine/issue write paths; article body rendered as escaped React nodes.
- Last-admin revoke guard correct (`staff.ts:89-98`); claim verify/reject re-checks authorization server-side (no IDOR); notifications & tipperProfile create/update scoped to the owner.
- Podcast visibility/publish gating is the correct pattern (the articles route should copy it).
- Document ingest is well-guarded (per-page OCR timeouts, page caps, `Promise.allSettled`); `/compose` re-validates every model-produced target against a legal-id map.
- Both apps typecheck clean; server crash-guards keep the process alive on transient rejections.
