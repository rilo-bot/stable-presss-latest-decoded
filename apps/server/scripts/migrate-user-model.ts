/**
 * Backfill the membership edge collections from the embedded arrays on `users`.
 *
 *   npx tsx scripts/migrate-user-model.ts            # dry run — prints a plan
 *   npx tsx scripts/migrate-user-model.ts --apply    # writes
 *   npx tsx scripts/migrate-user-model.ts --check     # compare both shapes, report drift
 *
 * P1 of docs/USER-MODEL-PLAN.md. This is the EXPAND half of an expand/contract
 * migration and is therefore safe to run at any time:
 *
 *   - It only writes the NEW shape. It never touches `partyClaims[]`,
 *     `orgMemberships[]` or `staffRoles[]`, so the running app is unaffected.
 *   - Nothing READS the new shape yet (that is P2), so a mistake here cannot
 *     affect access control.
 *   - It is idempotent. It delegates to the SAME reconcilers the live write path
 *     uses (lib/membership.ts), so the migration and the app can never disagree
 *     about how one user's arrays map to rows. Re-running is a no-op.
 *
 * --check is the exit criterion for P1: it must report zero drift before P2 moves
 * any read over.
 *
 * TWO THINGS IT REPORTS RATHER THAN GUESSES
 *
 *   1. Users holding MORE THAN ONE staff role. The new model stores exactly one
 *      (docs/USER-MODEL-PLAN.md §1), so collapsing is lossy. primaryStaffRole()
 *      picks superadmin-then-first, but a multi-role user is data the new model
 *      cannot represent and deserves a human decision, not a silent truncation.
 *      In practice there should be none — assign has always REPLACED.
 *   2. Duplicate emails. `users.email` is becoming a unique index; if duplicates
 *      exist the index build fails (logged, non-fatal) and they must be merged.
 */
import 'dotenv/config'
import { db } from '../src/lib/db.js'
import {
  ORG_MEMBERSHIPS,
  PARTY_MEMBERSHIPS,
  mirrorOrgMemberships,
  mirrorPartyMemberships,
  primaryStaffRole,
} from '../src/lib/membership.js'
import type { OrgMembership, PartyClaim } from '../src/lib/identity.js'

const APPLY = process.argv.includes('--apply')
const CHECK = process.argv.includes('--check')

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

async function main(): Promise<void> {
  const users = await db.collection('users').find()
  console.log(`[migrate] ${users.length} user(s)\n`)

  // ── Pre-flight: things a human has to decide ──────────────────────────────
  const multiRole = users.filter((u) => arr<string>(u.staffRoles).length > 1)
  if (multiRole.length > 0) {
    console.warn(`[migrate] ⚠ ${multiRole.length} user(s) hold MORE THAN ONE staff role.`)
    console.warn('           The new model stores one. primaryStaffRole() would pick:')
    for (const u of multiRole) {
      const roles = arr<string>(u.staffRoles)
      console.warn(`           - ${u.email}: [${roles.join(', ')}] → ${primaryStaffRole(roles)}`)
    }
    console.warn('           Resolve these in the Team screen first if the pick is wrong.\n')
  }

  const byEmail = new Map<string, number>()
  for (const u of users) {
    const e = String(u.email ?? '').toLowerCase()
    byEmail.set(e, (byEmail.get(e) ?? 0) + 1)
  }
  const dupes = [...byEmail.entries()].filter(([, n]) => n > 1)
  if (dupes.length > 0) {
    console.warn(`[migrate] ⚠ ${dupes.length} DUPLICATE email(s) — the unique index will not build:`)
    for (const [email, n] of dupes) console.warn(`           - ${email} ×${n}`)
    console.warn('           Merge these before relying on users.email being unique.\n')
  }

  // ── Plan ─────────────────────────────────────────────────────────────────
  let claimRows = 0
  let orgRows = 0
  let slugWrites = 0
  for (const u of users) {
    claimRows += arr<PartyClaim>(u.partyClaims).length
    orgRows += arr<OrgMembership>(u.orgMemberships).length
    if (primaryStaffRole(arr<string>(u.staffRoles)) !== (u.staffRoleSlug ?? null)) slugWrites++
  }
  console.log(`[migrate] plan: ${claimRows} partyMemberships, ${orgRows} orgMemberships, ${slugWrites} staffRoleSlug write(s)`)

  if (CHECK) {
    await report(users)
    return
  }
  if (!APPLY) {
    console.log('\n[migrate] DRY RUN — nothing written. Re-run with --apply.')
    return
  }

  // ── Apply ────────────────────────────────────────────────────────────────
  let done = 0
  for (const u of users) {
    const userId = String(u._id)
    await mirrorPartyMemberships(userId, arr<PartyClaim>(u.partyClaims))
    await mirrorOrgMemberships(userId, arr<OrgMembership>(u.orgMemberships))
    const slug = primaryStaffRole(arr<string>(u.staffRoles))
    if (slug !== (u.staffRoleSlug ?? null)) {
      await db.collection('users').updateOne(userId, { staffRoleSlug: slug })
    }
    done++
    if (done % 100 === 0) console.log(`[migrate]   …${done}/${users.length}`)
  }
  console.log(`\n[migrate] applied to ${done} user(s).`)
  await report(await db.collection('users').find())
}

/** Compare the embedded arrays against the edge collections and print any drift. */
async function report(users: Record<string, any>[]): Promise<void> {
  const parties = await db.collection(PARTY_MEMBERSHIPS).find()
  const orgs = await db.collection(ORG_MEMBERSHIPS).find()

  const partiesByUser = new Map<string, number>()
  for (const r of parties) {
    partiesByUser.set(String(r.userId), (partiesByUser.get(String(r.userId)) ?? 0) + 1)
  }
  const orgsByUser = new Map<string, number>()
  for (const r of orgs) {
    orgsByUser.set(String(r.userId), (orgsByUser.get(String(r.userId)) ?? 0) + 1)
  }

  const problems: string[] = []
  for (const u of users) {
    const id = String(u._id)
    const wantParties = arr<PartyClaim>(u.partyClaims).length
    const wantOrgs = arr<OrgMembership>(u.orgMemberships).length
    const wantSlug = primaryStaffRole(arr<string>(u.staffRoles))
    const gotParties = partiesByUser.get(id) ?? 0
    const gotOrgs = orgsByUser.get(id) ?? 0
    const gotSlug = (u.staffRoleSlug ?? null) as string | null

    if (gotParties !== wantParties) {
      problems.push(`${u.email}: partyMemberships ${gotParties} ≠ partyClaims ${wantParties}`)
    }
    if (gotOrgs !== wantOrgs) {
      problems.push(`${u.email}: orgMemberships rows ${gotOrgs} ≠ array ${wantOrgs}`)
    }
    if (gotSlug !== wantSlug) {
      problems.push(`${u.email}: staffRoleSlug ${gotSlug ?? 'null'} ≠ expected ${wantSlug ?? 'null'}`)
    }
  }

  // Rows whose user no longer exists would become invisible orphans once P2 reads
  // these collections, so they are drift too.
  const knownIds = new Set(users.map((u) => String(u._id)))
  for (const r of [...parties, ...orgs]) {
    if (!knownIds.has(String(r.userId))) {
      problems.push(`orphan row ${String(r._id)} → unknown userId ${String(r.userId)}`)
    }
  }

  console.log(`\n[migrate] --check: ${parties.length} partyMemberships, ${orgs.length} orgMemberships`)
  if (problems.length === 0) {
    console.log('[migrate] ✓ no drift — both shapes agree on every user. P1 exit criterion met.')
    return
  }
  console.error(`[migrate] ✗ ${problems.length} problem(s):`)
  for (const p of problems) console.error(`           - ${p}`)
  process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('[migrate] FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
    process.exitCode = 1
  })
  .finally(() => {
    // db.ts holds an open MongoClient with no exposed close(); the pool would keep
    // the process alive otherwise.
    setTimeout(() => process.exit(process.exitCode ?? 0), 250)
  })
