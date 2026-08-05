// ---------------------------------------------------------------------------
// One-off cleanup to bring an existing database onto the six-collection model.
//
// This is NOT a migration — no old data is preserved or translated. It DELETES
// fields and collections that the model no longer has, on the explicit
// instruction that nothing in the database needs carrying forward.
//
//   npx tsx scripts/clean-user-model.ts            # report only
//   npx tsx scripts/clean-user-model.ts --apply    # actually write
//
// Safe to re-run: every step is idempotent.
// ---------------------------------------------------------------------------

import 'dotenv/config'
import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')

/** Fields deleted from `users`. The model is name, email, isAdmin, lastLogin. */
const DEAD_USER_FIELDS = [
  'displayName', // → name
  'roles',
  'staffRoles',
  'staffRoleSlug',
  'partyClaims',
  'orgMemberships',
  'orgMembers', // the embedded array; membership is the orgMembers COLLECTION
  'subscriptionTier',
] as const

/** Collections the model no longer has. */
const DEAD_COLLECTIONS = ['roles', 'orgMemberships', 'partyMemberships', 'horsePartyLinks'] as const

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required.')

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  console.log(`[clean] database: ${db.databaseName}`)
  console.log(APPLY ? '[clean] APPLYING changes\n' : '[clean] DRY RUN — pass --apply to write\n')

  // ── 1. adminRoles: `roleName` → `name` ────────────────────────────────────
  //
  // The live docs were keyed `roleName`; every reader looks for `name`, so all
  // four roles projected with a blank name and the unique index on `name`
  // indexed nothing.
  const misKeyed = await db.collection('adminRoles').find({ roleName: { $exists: true } }).toArray()
  console.log(`adminRoles with \`roleName\` instead of \`name\`: ${misKeyed.length}`)
  for (const doc of misKeyed) {
    console.log(`   ${String(doc.roleName)} → name`)
    if (APPLY) {
      await db
        .collection('adminRoles')
        .updateOne({ _id: doc._id }, { $set: { name: doc.roleName }, $unset: { roleName: '' } })
    }
  }

  // ── 2. users: drop dead fields, and rename displayName → name ─────────────
  const users = await db.collection('users').find({}).toArray()
  console.log(`\nusers: ${users.length}`)
  for (const u of users) {
    const drops = DEAD_USER_FIELDS.filter((f) => f in u)
    // `name` is the identity field; fall back to the old displayName, then the
    // local part of the email, so nobody ends up nameless.
    const needsName = typeof u.name !== 'string' || !u.name
    const name = needsName
      ? String(u.displayName ?? String(u.email ?? '').split('@')[0] ?? '')
      : String(u.name)

    const set: Record<string, unknown> = {}
    if (needsName) set.name = name
    // Written EXPLICITLY rather than left absent so `find({ isAdmin: true })`
    // behaves predictably. Step 3 corrects it from the admins table.
    if (typeof u.isAdmin !== 'boolean') set.isAdmin = false
    if (!('lastLogin' in u)) set.lastLogin = null

    if (drops.length === 0 && Object.keys(set).length === 0) continue
    console.log(
      `   ${String(u.email)}: ${drops.length ? `drop [${drops.join(', ')}]` : 'no drops'}` +
        `${Object.keys(set).length ? ` set {${Object.keys(set).join(', ')}}` : ''}`,
    )
    if (APPLY) {
      const update: Record<string, unknown> = {}
      if (Object.keys(set).length) update.$set = set
      if (drops.length) update.$unset = Object.fromEntries(drops.map((f) => [f, '']))
      await db.collection('users').updateOne({ _id: u._id }, update)
    }
  }

  // ── 3. reconcile users.isAdmin against the admins table ───────────────────
  //
  // The table is authoritative: it carries the roleId, so a flag with no row
  // grants nothing while a row with no flag is a real grant the flag is lying
  // about. resolveAccount reads the ROW, so this only repairs the denormalised
  // copy the roster lists from.
  const adminRows = await db.collection('admins').find({}).toArray()
  const withRow = new Set(adminRows.map((r) => String(r.userId)))
  const userIds = new Set(users.map((u) => String(u._id)))
  console.log(`\nadmins rows: ${adminRows.length}`)
  for (const u of users) {
    const id = String(u._id)
    const shouldBe = withRow.has(id)
    if (u.isAdmin === shouldBe) continue
    console.log(`   ${String(u.email)}: isAdmin ${u.isAdmin === true} → ${shouldBe}`)
    if (APPLY) await db.collection('users').updateOne({ _id: u._id }, { $set: { isAdmin: shouldBe } })
  }
  for (const r of adminRows) {
    if (userIds.has(String(r.userId))) continue
    console.log(`   orphan admins row for missing user ${String(r.userId)} — removing`)
    if (APPLY) await db.collection('admins').deleteOne({ _id: r._id })
  }

  // ── 4. drop the collections the model no longer has ───────────────────────
  const present = new Set((await db.listCollections().toArray()).map((c) => c.name))
  console.log('')
  for (const name of DEAD_COLLECTIONS) {
    if (!present.has(name)) {
      console.log(`${name}: absent`)
      continue
    }
    const n = await db.collection(name).countDocuments()
    console.log(`${name}: DROPPING (${n} docs)`)
    if (APPLY) await db.collection(name).drop()
  }

  console.log(APPLY ? '\n[clean] done.' : '\n[clean] dry run complete — re-run with --apply.')
  await client.close()
}

main().catch((err) => {
  console.error('[clean] failed:', err)
  process.exit(1)
})
