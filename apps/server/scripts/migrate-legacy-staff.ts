// ---------------------------------------------------------------------------
// Bring a `staffRoleSlug`-era database up to the LINK model.
//
// THIS IS THE MISSING STEP. `migrate-admin-roles.ts` migrates a database whose
// users carry `roleId`. Production never reached that model — it is a generation
// further back and still identifies staff by `staffRoleSlug`, with role
// definitions keyed by `slug`. Pointing migrate-admin-roles at it would match
// ZERO users, write ZERO links, and then stamp `isAdmin: false` on everyone,
// because its "these are the readers" query is `{ roleId: null }` and a missing
// field matches null. Every admin, including every superadmin, would lose
// access. Verified against a copy before this script was written.
//
//   BEFORE  users.staffRoleSlug ─────────────► roles.slug
//           users.displayName, roles.slug, no isSuper, no adminRoles collection
//   AFTER   users.isAdmin = true
//           adminRoles { userId, roleId, assignedAt } ──► roles._id
//           roles.name (= slug), roles.isSuper, users.name (= displayName)
//
// PURELY ADDITIVE BY DEFAULT. Every legacy field is left exactly where it is, so
// the currently-deployed code keeps working and the deploy stays reversible:
//
//   old code  users.staffRoleSlug → roles.slug          ✓ untouched
//   new code  users.isAdmin → adminRoles link → roles   ✓ added alongside
//
// `--finish` removes the legacy fields, and only then. Run it days later.
//
// Usage:
//   MONGODB_URI="<uri>" npx tsx scripts/migrate-legacy-staff.ts            # dry run
//   MONGODB_URI="<uri>" npx tsx scripts/migrate-legacy-staff.ts --apply
//   MONGODB_URI="<uri>" npx tsx scripts/migrate-legacy-staff.ts --apply --finish
//
// Idempotent. Re-running skips anything already done.
// ---------------------------------------------------------------------------

import { MongoClient, type Document } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const FINISH = process.argv.includes('--finish')
const uri = (process.env.MONGODB_URI ?? '').trim()

if (!uri) {
  console.error('MONGODB_URI is required.')
  process.exit(1)
}

/** The one role that must end up `isSuper`. Matched on slug, not on label. */
const SUPERADMIN_SLUG = 'superadmin'

/**
 * Legacy fields `--finish` removes. Every one verified to have ZERO readers:
 * `withIdentityDefaults` builds an identity from exactly six fields —
 * id, name, email, createdAt, isAdmin, lastLogin — and nothing else on the
 * document is consulted anywhere in server or web.
 *
 * `roles` and `status` are in this list on their own merit, not by association:
 *
 *   roles: ['reader']  the party-role axis is DERIVED from the `parties`
 *                      collection by `derivedRoles()`, never from this array.
 *                      Leaving it is worse than leaving a dead field — it reads
 *                      like the source of truth for racing roles, and is not.
 *   status: 'active'   zero readers. Nothing suspends an account through it;
 *                      revocation is `tokenVersion`, and removal is a soft
 *                      delete via `deletedAt`.
 *
 * What SURVIVES, and why: `tokenVersion` (sign-out-everywhere), `deletedAt`
 * (soft delete), and the six identity fields above.
 */
const LEGACY_USER_FIELDS = [
  'displayName',
  'staffRoleSlug',
  'staffRoles',
  'subscriptionTier',
  'partyClaims',
  'orgMemberships',
  'roles',
  'status',
]

const line = (s = '') => console.log(s)
const mask = (e: unknown) => String(e ?? '').replace(/^(.{2}).*@/, '$1***@')

/** Which role slug does this user hold? `staffRoleSlug` first, then the array. */
function legacySlugOf(u: Document): string | null {
  if (typeof u.staffRoleSlug === 'string' && u.staffRoleSlug) return u.staffRoleSlug
  if (Array.isArray(u.staffRoles) && u.staffRoles.length) {
    // ONE role per admin now. The array could hold several, so pick the
    // strongest rather than the first — `staffRoles: ['superadmin','administrator']`
    // exists in an older database and must not resolve to `administrator`.
    const ranked = [SUPERADMIN_SLUG, 'administrator', 'editor', 'contributor']
    for (const slug of ranked) if (u.staffRoles.includes(slug)) return slug
    return String(u.staffRoles[0])
  }
  return null
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  line(`\n[migrate] database: ${db.databaseName}`)
  line(APPLY ? '[migrate] APPLY — writing' : '[migrate] DRY RUN — nothing will be written')
  if (FINISH) line('[migrate] --finish — legacy fields WILL be removed (not reversible)')

  const users = db.collection('users')
  const roles = db.collection('roles')
  const adminRoles = db.collection('adminRoles')
  const now = new Date().toISOString()

  // ── 1. roles: slug → name, and isSuper ────────────────────────────────────
  line('\n── 1. role definitions ──')
  const roleDocs = await roles.find({}).toArray()
  if (roleDocs.length === 0) {
    line('  ⚠ no roles at all. Wrong database? Refusing to continue.')
    await client.close()
    process.exit(1)
  }
  for (const r of roleDocs) {
    const slug = String(r.slug ?? r.name ?? '')
    const needsName = r.name === undefined
    const isSuper = slug === SUPERADMIN_SLUG
    const needsSuper = r.isSuper === undefined
    line(
      `  ${slug.padEnd(24)} ${needsName ? '+name' : 'name ok'}  ` +
        `${needsSuper ? `+isSuper:${isSuper}` : `isSuper ok (${r.isSuper === true})`}`,
    )
    if (APPLY) {
      const set: Document = { updatedAt: now }
      if (needsName) set.name = slug
      if (needsSuper) set.isSuper = isSuper
      // The superadmin role must not be editable through the console, whatever
      // the old row said — that is the invariant the whole model rests on.
      if (isSuper) {
        set.isImmutable = true
        set.isSystem = true
      }
      await roles.updateOne({ _id: r._id }, { $set: set })
    }
  }

  // ── 2. users: displayName → name, lastLogin ───────────────────────────────
  line('\n── 2. user identity fields ──')
  const userDocs = await users.find({}).toArray()
  let renamed = 0
  for (const u of userDocs) {
    const set: Document = {}
    if (u.name === undefined) set.name = String(u.displayName ?? '').trim() || String(u.email ?? '').split('@')[0]
    if (u.lastLogin === undefined) set.lastLogin = null
    if (Object.keys(set).length === 0) continue
    renamed++
    if (APPLY) await users.updateOne({ _id: u._id }, { $set: set })
  }
  line(`  ${renamed} of ${userDocs.length} user(s) need name/lastLogin`)

  // ── 3. staffRoleSlug → link rows + isAdmin ────────────────────────────────
  line('\n── 3. staff links ──')
  const bySlug = new Map(roleDocs.map((r) => [String(r.slug ?? r.name ?? ''), r]))
  const existingLinks = await adminRoles.find({ userId: { $exists: true } }).toArray()
  const linkedUserIds = new Set(existingLinks.map((l) => String(l.userId)))

  let staff = 0
  let readers = 0
  const orphaned: string[] = []

  for (const u of userDocs) {
    const uid = String(u._id)
    const slug = legacySlugOf(u)
    if (!slug) {
      readers++
      if (APPLY && u.isAdmin === undefined) await users.updateOne({ _id: u._id }, { $set: { isAdmin: false } })
      continue
    }
    const role = bySlug.get(slug)
    if (!role) {
      // A slug with no definition: real, and it must NOT silently become staff
      // with no role. Reported and left alone for a human.
      orphaned.push(`${mask(u.email)} holds "${slug}", which no role defines`)
      continue
    }
    staff++
    const already = linkedUserIds.has(uid)
    line(`  ${mask(u.email).padEnd(26)} ${slug.padEnd(24)} ${already ? '(link exists)' : '+link +isAdmin'}`)
    if (APPLY) {
      // Link FIRST, then the flag — the same fail-closed order roleRegistry
      // uses, so a half-applied grant leaves no access rather than access with
      // no role behind it.
      if (!already) {
        await adminRoles.insertOne({
          userId: uid,
          roleId: String(role._id),
          assignedAt: now,
          assignedBy: null,
          deletedAt: null,
        })
      }
      await users.updateOne({ _id: u._id }, { $set: { isAdmin: true, updatedAt: now } })
    }
  }
  line(`\n  staff: ${staff}   readers: ${readers}`)
  for (const o of orphaned) line(`  ⚠ ${o}`)

  // ── 4. indexes ────────────────────────────────────────────────────────────
  line('\n── 4. indexes ──')
  if (APPLY) {
    const LINK_INDEX = {
      unique: true,
      partialFilterExpression: { userId: { $exists: true }, deletedAt: null },
    } as const
    await adminRoles.createIndex({ userId: 1 }, LINK_INDEX).catch(async (err: unknown) => {
      const present = (await adminRoles.indexes()).some((i) => i.name === 'userId_1')
      if (!present) throw err
      await adminRoles.dropIndex('userId_1')
      await adminRoles.createIndex({ userId: 1 }, LINK_INDEX)
    })
    await adminRoles.createIndex({ roleId: 1 })
    await roles.createIndex({ name: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } })
    line('  ✓ adminRoles.userId (unique, partial), adminRoles.roleId, roles.name')
  } else {
    line('  would create adminRoles.userId (unique, partial), adminRoles.roleId, roles.name')
  }

  // ── 5. legacy fields ──────────────────────────────────────────────────────
  line('\n── 5. legacy fields ──')
  if (!FINISH) {
    line('  KEPT. The deployed code still reads staffRoleSlug / displayName / roles.slug,')
    line('  so it keeps working and this migration is reversible.')
    line('  Re-run with --finish once the new code is live and settled.')
  } else {
    line(`  removing from users: ${LEGACY_USER_FIELDS.join(', ')}`)
    line('  removing from roles: slug, modules, workflowStages')

    // THE STALE `slug_1` UNIQUE INDEX MUST GO FIRST.
    //
    // `slug` was the role key before `name` was, and it carries a UNIQUE index.
    // Unsetting the field makes every role index as `slug: null`, so the FIRST
    // document succeeds and the SECOND fails with E11000 — and because
    // `updateMany` is per-document rather than atomic, that leaves the
    // collection half-cleaned. Hit for real against production; the users half
    // had already committed, which is why this step is written to be re-runnable.
    const staleSlug = (await roles.indexes()).find((i) => i.name === 'slug_1')
    line(`  stale unique index roles.slug_1: ${staleSlug ? 'present — dropping first' : 'already gone'}`)

    if (APPLY) {
      if (staleSlug) await roles.dropIndex('slug_1')
      await users.updateMany({}, { $unset: Object.fromEntries(LEGACY_USER_FIELDS.map((f) => [f, ''])) })
      await roles.updateMany({}, { $unset: { slug: '', modules: '', workflowStages: '' } })
    }
  }

  // ── report ────────────────────────────────────────────────────────────────
  line('\n── after ──')
  line(`  roles              : ${await roles.countDocuments({})}`)
  line(`  roles with isSuper : ${await roles.countDocuments({ isSuper: true })}`)
  line(`  adminRoles links   : ${await adminRoles.countDocuments({ userId: { $exists: true } })}`)
  line(`  users isAdmin:true : ${await users.countDocuments({ isAdmin: true })}`)
  if (!APPLY) line('\nDry run. Re-run with --apply to write.')
  else line('\n✓ done. RESTART THE API — roleRegistry caches role definitions.')

  await client.close()
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
