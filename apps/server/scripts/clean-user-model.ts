// Bring an existing database onto the model. Deletes rather than migrates -
// nothing in the old data needs carrying forward, with one exception noted below.
//
//   npx tsx scripts/clean-user-model.ts            report only
//   npx tsx scripts/clean-user-model.ts --apply    write
//
// Idempotent: safe to re-run.

import 'dotenv/config'
import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')

/**
 * Fields deleted from `users`. The model is name, email, isAdmin, lastLogin.
 *
 * ⚠ `isAdmin` and the `roles` collection were on these lists until the link
 * model landed — running the old version of this script now would strip the
 * admin flag off every account and DROP the role definitions. If you are
 * cherry-picking an old copy of this file, don't.
 *
 * `roleId` is here because it moved to `adminRoles.roleId`; run
 * `migrate:admin-roles` FIRST, which reads it, then this to clear it up.
 */
const DEAD_USER_FIELDS = [
  'displayName',
  'roleId',
  'roles',
  'staffRoles',
  'staffRoleSlug',
  'partyClaims',
  'orgMemberships',
  'orgMembers',
  'subscriptionTier',
] as const

// `roles` is NOT here — it holds the role definitions now.
const DEAD_COLLECTIONS = [
  'admins',
  'orgMemberships',
  'partyMemberships',
  'horsePartyLinks',
] as const

/** Indexes on fields that no longer exist. Dropped FIRST - see below. */
const DEAD_INDEXES: Array<[string, string]> = [
  ['adminRoles', 'roleName_1'],
  ['adminRoles', 'slug_1'],
  // adminRoles used to hold the DEFINITIONS, so it carried a unique name index.
  // It holds links now and every row would collide on a missing `name`.
  ['adminRoles', 'name_1'],
  ['users', 'staffRoleSlug_1_deletedAt_1'],
  ['users', 'roleId_1_deletedAt_1'],
  ['users', 'staffRoles_1'],
]

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required.')

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  console.log(`[clean] database: ${db.databaseName}`)
  console.log(APPLY ? '[clean] APPLYING\n' : '[clean] DRY RUN - pass --apply to write\n')

  // 1. Drop indexes on fields about to disappear. MUST run first: a UNIQUE index
  // on a field being $unset makes every document collide on null and aborts the
  // rest of the script half-done.
  for (const [coll, index] of DEAD_INDEXES) {
    const existing = await db
      .collection(coll)
      .indexes()
      .catch(() => [] as Array<{ name?: string }>)
    if (!existing.some((i) => i.name === index)) continue
    console.log(`drop index ${coll}.${index}`)
    if (APPLY) await db.collection(coll).dropIndex(index)
  }

  // 2. adminRoles: `roleName` -> `name`. Every reader looks for `name`, so
  // mis-keyed docs projected blank and the unique index indexed nothing.
  const misKeyed = await db.collection('adminRoles').find({ roleName: { $exists: true } }).toArray()
  for (const doc of misKeyed) {
    console.log(`adminRoles: ${String(doc.roleName)} -> name`)
    if (APPLY) {
      await db
        .collection('adminRoles')
        .updateOne({ _id: doc._id }, { $set: { name: doc.roleName }, $unset: { roleName: '' } })
    }
  }

  // 3. THE ONE THING THAT IS NOT THROWN AWAY: the admin grant itself.
  //
  // The role used to live in an `admins` join row (and before that in
  // `users.staffRoleSlug`). It now lives in `users.roleId`. Dropping those
  // without reading them first would leave the database with zero admins and no
  // way back in - /api/admin/seed needs SETUP_SECRET, and grant-superadmin.ts
  // needs shell access.
  const users = await db.collection('users').find({}).toArray()
  const adminRows = await db.collection('admins').find({}).toArray().catch(() => [])
  const rolesByName = new Map(
    (await db.collection('adminRoles').find({}).toArray()).map((r) => [
      String(r.name ?? r.roleName ?? ''),
      String(r._id),
    ]),
  )
  const roleIdByUser = new Map<string, string>()
  for (const row of adminRows) roleIdByUser.set(String(row.userId), String(row.roleId))
  for (const u of users) {
    if (roleIdByUser.has(String(u._id))) continue
    const legacyName = String(u.staffRoleSlug ?? (Array.isArray(u.staffRoles) ? u.staffRoles[0] : '') ?? '')
    const id = legacyName ? rolesByName.get(legacyName) : undefined
    if (id) roleIdByUser.set(String(u._id), id)
  }

  // 4. users: set roleId, drop everything the model no longer has.
  console.log(`\nusers: ${users.length}`)
  for (const u of users) {
    const id = String(u._id)
    const drops = DEAD_USER_FIELDS.filter((f) => f in u)
    const set: Record<string, unknown> = {}

    const roleId = roleIdByUser.get(id) ?? null
    if (u.roleId === undefined || String(u.roleId ?? '') !== String(roleId ?? '')) set.roleId = roleId
    if (typeof u.name !== 'string' || !u.name) {
      set.name = String(u.displayName ?? String(u.email ?? '').split('@')[0] ?? '')
    }
    if (!('lastLogin' in u)) set.lastLogin = null

    if (drops.length === 0 && Object.keys(set).length === 0) continue
    console.log(
      `   ${String(u.email)}: roleId=${roleId ?? 'null'}` +
        (drops.length ? ` drop[${drops.join(', ')}]` : ''),
    )
    if (APPLY) {
      const update: Record<string, unknown> = {}
      if (Object.keys(set).length) update.$set = set
      if (drops.length) update.$unset = Object.fromEntries(drops.map((f) => [f, '']))
      await db.collection('users').updateOne({ _id: u._id }, update)
    }
  }

  // 5. Drop the collections the model no longer has.
  console.log('')
  const present = new Set((await db.listCollections().toArray()).map((c) => c.name))
  for (const name of DEAD_COLLECTIONS) {
    if (!present.has(name)) {
      console.log(`${name}: absent`)
      continue
    }
    console.log(`${name}: DROP (${await db.collection(name).countDocuments()} docs)`)
    if (APPLY) await db.collection(name).drop()
  }

  console.log(APPLY ? '\n[clean] done.' : '\n[clean] dry run complete.')
  await client.close()
}

main().catch((err) => {
  console.error('[clean] failed:', err)
  process.exit(1)
})
