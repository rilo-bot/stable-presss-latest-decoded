// ---------------------------------------------------------------------------
// Move an existing database onto the link model.
//
//   BEFORE  users.roleId ──────────────► adminRoles._id   (definitions)
//   AFTER   users.isAdmin = true
//           adminRoles { userId, roleId, assignedAt } ──► roles._id
//
// Three steps, in this order:
//   1. COPY the role DEFINITIONS from `adminRoles` into `roles`, keeping _id so
//      every existing reference stays valid.
//   2. WRITE one link row per user that had a `roleId`, and set `isAdmin: true`.
//   3. DROP the definition rows out of `adminRoles` and unset `users.roleId`.
//
// Idempotent — safe to re-run. Step 1 skips definitions already in `roles`, and
// step 2 skips users that already have a link.
//
// A definition row and a link row are told apart by SHAPE: a definition has
// `permissions`, a link has `userId`. That is what makes re-running safe even
// half-way through.
//
// Steps 1 and 2 only ADD — run them with `--keep-legacy` and BOTH the old and
// the new shape are valid at once, so the deploy can be rolled back without a
// database restore. Step 3 is the point of no return; run it after the deploy
// has stuck.
//
// Usage:
//   npx tsx scripts/migrate-admin-roles.ts                      # dry run
//   npx tsx scripts/migrate-admin-roles.ts --apply --keep-legacy  # reversible
//   npx tsx scripts/migrate-admin-roles.ts --apply                # finish
//
// Needs MONGODB_URI in the environment (this script does not read .env):
//   MONGODB_URI="mongodb://localhost:27017/stable-press-local" npx tsx ... --apply
// ---------------------------------------------------------------------------

import { MongoClient, type Document } from 'mongodb'

const APPLY = process.argv.includes('--apply')
/** Skip step 3, so the OLD shape survives and the deploy stays reversible. */
const KEEP_LEGACY = process.argv.includes('--keep-legacy')
const uri = (process.env.MONGODB_URI ?? '').trim()

if (!uri) {
  console.error('MONGODB_URI is required. e.g.')
  console.error('  MONGODB_URI="mongodb://localhost:27017/stable-press-local" npx tsx scripts/migrate-admin-roles.ts')
  process.exit(1)
}

const isDefinition = (d: Document): boolean => Array.isArray(d.permissions)
const isLink = (d: Document): boolean => typeof d.userId === 'string' || d.userId != null

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  console.log(`[migrate] ${uri.replace(/:([^@]+)@/, ':***@')}`)
  console.log(APPLY ? '[migrate] APPLY — writing\n' : '[migrate] DRY RUN — nothing will be written\n')

  const adminRoles = db.collection('adminRoles')
  const roles = db.collection('roles')
  const users = db.collection('users')

  // ── 1. definitions → `roles` ──────────────────────────────────────────────
  const defs = (await adminRoles.find({}).toArray()).filter(isDefinition)
  const alreadyThere = new Set((await roles.find({}).toArray()).map((r) => String(r._id)))
  const toCopy = defs.filter((d) => !alreadyThere.has(String(d._id)))

  console.log(`definitions in adminRoles : ${defs.length}`)
  console.log(`already present in roles  : ${defs.length - toCopy.length}`)
  console.log(`to copy                   : ${toCopy.length}`)
  for (const d of toCopy) console.log(`   + ${d.name}  (isSuper=${d.isSuper === true})`)
  if (APPLY && toCopy.length) await roles.insertMany(toCopy)

  // ── 1b. drop the DEFINITION-era index off adminRoles ──────────────────────
  //
  // `adminRoles` carried `{ name: 1 } UNIQUE partial={deletedAt:null}` from when
  // it held the definitions. Link rows have no `name`, and a partial filter of
  // `{deletedAt: null}` DOES cover documents missing the field (verified against
  // MongoDB, not assumed) — so every link would index as name:null and the
  // SECOND one would be rejected with a duplicate-key error. This must go before
  // any link is written.
  const stale = (await adminRoles.indexes()).filter((i) => i.name === 'name_1')
  console.log(`\nstale definition index on adminRoles: ${stale.length ? 'name_1 — will drop' : 'none'}`)
  if (APPLY && stale.length) await adminRoles.dropIndex('name_1')

  // ── 2. users.roleId → link rows + isAdmin ─────────────────────────────────
  const withRole = await users.find({ roleId: { $ne: null } }).toArray()
  const existingLinks = new Set(
    (await adminRoles.find({}).toArray()).filter(isLink).map((l) => String(l.userId)),
  )
  const now = new Date().toISOString()
  let linked = 0

  console.log(`\nusers holding a roleId    : ${withRole.length}`)
  for (const u of withRole) {
    const uid = String(u._id)
    if (existingLinks.has(uid)) {
      console.log(`   = ${u.email} already linked`)
      continue
    }
    console.log(`   + ${u.email} → roleId ${String(u.roleId)}  (isAdmin: true)`)
    linked++
    if (APPLY) {
      await adminRoles.insertOne({ userId: uid, roleId: String(u.roleId), assignedAt: now })
      await users.updateOne({ _id: u._id }, { $set: { isAdmin: true, updatedAt: now } })
    }
  }

  // Everyone else is explicitly NOT staff. Writing `false` rather than leaving
  // the field missing keeps the roster index selective and the shape uniform.
  const readers = await users.countDocuments({ roleId: null, isAdmin: { $ne: true } })
  console.log(`\nnon-admin accounts to stamp isAdmin:false : ${readers}`)
  if (APPLY && readers) {
    await users.updateMany({ roleId: null, isAdmin: { $ne: true } }, { $set: { isAdmin: false } })
  }

  // ── 3. drop the old shapes ────────────────────────────────────────────────
  //
  // THE ONLY DESTRUCTIVE STEP, and the only one that breaks the OLD code — which
  // is why `--keep-legacy` exists. Steps 1 and 2 only ADD: the definitions are
  // COPIED into `roles` rather than moved, and `isAdmin` is written alongside
  // `roleId` rather than instead of it. Stop there and BOTH shapes are valid at
  // once, so a deploy can be rolled back without a database restore:
  //
  //   old code  users.roleId → definition rows still in adminRoles   ✓
  //   new code  users.isAdmin → link rows → the `roles` collection    ✓
  //
  // The two never collide because a definition and a link are told apart by
  // shape — `linkForUser` queries on `userId`, which no definition has.
  //
  // Run without the flag once the deploy has stuck. Re-running is safe.
  if (KEEP_LEGACY) {
    console.log('\n── step 3 SKIPPED (--keep-legacy) ──')
    console.log('Both the old and the new shape are now valid. The old code keeps working,')
    console.log('so this deploy is reversible. Re-run WITHOUT --keep-legacy to finish.')
  } else {
    console.log(`\nremove ${defs.length} definition row(s) from adminRoles`)
    console.log(`unset users.roleId on ${await users.countDocuments({ roleId: { $exists: true } })} account(s)`)
  }
  if (APPLY && !KEEP_LEGACY) {
    if (defs.length) await adminRoles.deleteMany({ _id: { $in: defs.map((d) => d._id) } })
    await users.updateMany({ roleId: { $exists: true } }, { $unset: { roleId: '' } })
  }
  if (APPLY) {
    // Indexes land with the DATA, not with step 3 — the uniqueness constraint is
    // what makes "one role per admin" real, and it has to hold from the moment
    // links exist. PARTIAL: revoking soft-deletes the link, and a tombstone must
    // not keep occupying `userId` or re-granting to that person throws E11000.
    //
    // `userId: {$exists: true}` matters as much as the soft-delete filter: with
    // --keep-legacy the definition rows are still here, and they carry no
    // userId, so without it they all index as null and the second one collides.
    // MUST match ensureIndexes.ts or the running server fights this script.
    const LINK_INDEX = {
      unique: true,
      partialFilterExpression: { userId: { $exists: true }, deletedAt: null },
    } as const
    await adminRoles.createIndex({ userId: 1 }, LINK_INDEX).catch(async (err: unknown) => {
      // An earlier run created it with different options. Rebuild — but only if
      // it is actually there: swallowing every failure here turned a genuine
      // duplicate-key error into a confusing "index not found" from the dropIndex.
      const present = (await adminRoles.indexes()).some((i) => i.name === 'userId_1')
      if (!present) throw err
      await adminRoles.dropIndex('userId_1')
      await adminRoles.createIndex({ userId: 1 }, LINK_INDEX)
    })
    await roles.createIndex({ name: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } })
  }

  // ── report ────────────────────────────────────────────────────────────────
  console.log('\n── after ──')
  console.log(`roles (definitions) : ${await roles.countDocuments({})}`)
  console.log(`adminRoles (links)  : ${await adminRoles.countDocuments({})}`)
  console.log(`users isAdmin:true  : ${await users.countDocuments({ isAdmin: true })}`)
  console.log(`users with roleId   : ${await users.countDocuments({ roleId: { $exists: true } })}`)
  if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')

  await client.close()
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
