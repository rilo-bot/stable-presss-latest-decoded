// ---------------------------------------------------------------------------
// `users.isAdmin` and the `adminRoles` link say the same thing in two places.
// This finds and repairs any disagreement between them.
//
// The two are written by ONE pair of functions (`assignRole` / `clearRole`) in
// an order that fails closed, so drift needs a write to die between the two
// statements — rare, but the whole reason to store the flag at all is fast
// roster queries, and a flag nobody verifies is a flag that lies eventually.
//
// FOUR kinds of drift, and the repair for each:
//
//   isAdmin:true, no link          admin holding nothing. LEFT ALONE — this is a
//                                  legitimate state (their role was deleted) and
//                                  they must stay visible in the roster.
//   isAdmin:false, link exists     a grant that half-landed. They have no access
//                                  (resolveAccount gates on isAdmin), so the
//                                  repair DELETES the orphan link.
//   link → missing role            points at a deleted definition. Repair drops
//                                  the link and leaves them isAdmin:true, which
//                                  is the "holding nothing" state above.
//   two links for one user         predates the unique index. Repair keeps the
//                                  newest by assignedAt and deletes the rest.
//
// Usage:
//   npx tsx scripts/check-admins.ts            # report only (exit 1 if drift)
//   npx tsx scripts/check-admins.ts --fix
//
// Needs MONGODB_URI in the environment.
// ---------------------------------------------------------------------------

import { MongoClient } from 'mongodb'

const FIX = process.argv.includes('--fix')
const uri = (process.env.MONGODB_URI ?? '').trim()

if (!uri) {
  console.error('MONGODB_URI is required.')
  process.exit(1)
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()

  const users = await db.collection('users').find({ deletedAt: null }).toArray()
  // `deletedAt: null` matters: revoking SOFT-deletes the link, so a person who
  // has been granted and revoked a few times has several tombstones. Counting
  // those as duplicates reported drift that does not exist.
  const links = await db.collection('adminRoles').find({ deletedAt: null }).toArray()
  // Same `deletedAt: null` reason as the links: deleting a role soft-deletes it,
  // and a tombstoned definition should not count toward "roles" nor satisfy a
  // dangling-link check.
  const roles = await db.collection('roles').find({ deletedAt: null }).toArray()
  const roleIds = new Set(roles.map((r) => String(r._id)))

  const byUser = new Map<string, typeof links>()
  for (const l of links) {
    const uid = String(l.userId)
    byUser.set(uid, [...(byUser.get(uid) ?? []), l])
  }

  const problems: string[] = []
  const dropLinks: unknown[] = []

  for (const u of users) {
    const uid = String(u._id)
    const mine = byUser.get(uid) ?? []
    const isAdmin = u.isAdmin === true

    if (isAdmin && mine.length === 0) {
      // Legitimate — reported, never "repaired".
      console.log(`  note  ${u.email} is staff but holds no role (repair in the Team screen)`)
      continue
    }
    if (!isAdmin && mine.length > 0) {
      problems.push(`ORPHAN LINK  ${u.email} — isAdmin:false but ${mine.length} link row(s)`)
      dropLinks.push(...mine.map((l) => l._id))
      continue
    }
    if (mine.length > 1) {
      const sorted = [...mine].sort((a, b) => String(b.assignedAt).localeCompare(String(a.assignedAt)))
      problems.push(`DUPLICATE    ${u.email} — ${mine.length} link rows, keeping newest`)
      dropLinks.push(...sorted.slice(1).map((l) => l._id))
      continue
    }
    if (mine.length === 1 && !roleIds.has(String(mine[0]!.roleId))) {
      problems.push(`DANGLING     ${u.email} — link points at a role that no longer exists`)
      dropLinks.push(mine[0]!._id)
    }
  }

  // Links whose user is gone entirely.
  const userIds = new Set(users.map((u) => String(u._id)))
  for (const l of links) {
    if (!userIds.has(String(l.userId))) {
      problems.push(`NO USER      link ${String(l._id)} → userId ${String(l.userId)} (account gone)`)
      dropLinks.push(l._id)
    }
  }

  console.log(`\nusers: ${users.length}   links: ${links.length}   roles: ${roles.length}`)
  if (problems.length === 0) {
    console.log('✓ users.isAdmin and the adminRoles links agree')
    await client.close()
    return
  }

  console.log(`\n${problems.length} problem(s):`)
  for (const p of problems) console.log('  ' + p)

  if (FIX) {
    const ids = [...new Set(dropLinks)]
    if (ids.length) await db.collection('adminRoles').deleteMany({ _id: { $in: ids as never[] } })
    console.log(`\n✓ removed ${ids.length} bad link row(s). Re-run to confirm.`)
  } else {
    console.log('\nRe-run with --fix to repair.')
    process.exitCode = 1
  }

  await client.close()
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
