// ---------------------------------------------------------------------------
// One-shot, idempotent migration: backfill the RBAC identity shape onto every
// existing user doc (roles[], subscriptionTier, partyClaims[], orgMemberships[]).
//
// Reads are already normalized lazily via withIdentityDefaults(); this persists
// the backfill so queries and future writes see the real fields.
//
// Run AFTER building, in the target environment (prod Mongo):
//   npm run build && npm run migrate:rbac   (with PROD=true + MONGODB_URI set)
// In-memory dev DBs are ephemeral, so this is a no-op there.
// ---------------------------------------------------------------------------

import 'dotenv/config'
import { db } from '../lib/db.js'
import { withIdentityDefaults } from '../lib/identity.js'

async function main(): Promise<void> {
  const users = await db.collection('users').find()
  let migrated = 0

  for (const u of users) {
    const alreadyShaped =
      Array.isArray(u.roles) &&
      typeof u.subscriptionTier === 'string' &&
      Array.isArray(u.partyClaims) &&
      Array.isArray(u.orgMemberships)
    if (alreadyShaped) continue

    const norm = withIdentityDefaults({ id: u._id, ...u })
    await db.collection('users').updateOne(u._id, {
      roles: norm.roles,
      subscriptionTier: norm.subscriptionTier,
      partyClaims: norm.partyClaims,
      orgMemberships: norm.orgMemberships,
    })
    migrated++
  }

  console.log(
    `[migrate:rbac] mode=${db.isProduction() ? 'mongodb' : 'in-memory'} ` +
      `processed=${users.length} migrated=${migrated}`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error('[migrate:rbac] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
