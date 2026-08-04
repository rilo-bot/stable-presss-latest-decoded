// ---------------------------------------------------------------------------
// Grant superadmin from the command line. THE LOCKOUT RECOVERY PATH.
//
// POST /api/admin/seed self-disables once a superadmin exists, because while it
// is open it is an unauthenticated HTTP path to unrestricted platform access.
// That leaves one legitimate need unserved: recovering when every superadmin
// account is lost, suspended, or was created against the wrong email.
//
// This script is that path, and it is deliberately NOT an endpoint. It requires
// MONGODB_URI — i.e. whoever runs it already has direct database access and could
// have edited the document by hand anyway. Nothing is granted here that the
// operator could not already take; what they get is a correct write instead of an
// improvised one.
//
// Usage:
//   npx tsx scripts/grant-superadmin.ts <email>            # dry run
//   npx tsx scripts/grant-superadmin.ts <email> --apply
//   npx tsx scripts/grant-superadmin.ts --list             # who holds it now
// ---------------------------------------------------------------------------

import { db } from '../src/lib/db.js'
import { SUPERADMIN_SLUG, bustRoleCache, superadminHolderCount } from '../src/lib/roleRegistry.js'
import { newReaderFields } from '../src/lib/identity.js'
import { seedRoles } from '../src/lib/seedRoles.js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIST = args.includes('--list')
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()

async function listHolders(): Promise<void> {
  const holders = await db.collection('users').find({ staffRoleSlug: SUPERADMIN_SLUG })
  console.log(`superadmins: ${holders.length}`)
  for (const u of holders) {
    const status = u.status === 'suspended' ? '  ⚠ SUSPENDED' : ''
    console.log(`  ${String(u.email).padEnd(36)} id=${String(u._id)}${status}`)
  }
  if (holders.length === 0) {
    console.log('  (none — POST /api/admin/seed is open while this is true)')
  }
}

async function main(): Promise<void> {
  if (LIST || !email) {
    await listHolders()
    if (!email) {
      console.log('\nUsage: npx tsx scripts/grant-superadmin.ts <email> [--apply]')
    }
    return
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Not a valid email: ${email}`)
    process.exitCode = 1
    return
  }

  await listHolders()
  console.log()

  // The role ROW must exist before anyone holds the slug, or the Roles screen has
  // nothing to render. Enforcement itself short-circuits before any lookup, so the
  // grant would work regardless — this is for the UI.
  const created = await seedRoles()
  if (created.length > 0) console.log(`seeded role row(s): ${created.join(', ')}`)

  const existing = (await db.collection('users').find({ email }))[0]
  const now = new Date().toISOString()

  if (existing) {
    const previous = existing.staffRoleSlug ? String(existing.staffRoleSlug) : null
    const wasSuspended = existing.status === 'suspended'

    if (previous === SUPERADMIN_SLUG && !wasSuspended) {
      console.log(`${email} is already a superadmin. Nothing to do.`)
      return
    }

    console.log(`WOULD PROMOTE existing user ${email} (id ${String(existing._id)})`)
    if (previous) console.log(`  replaces staff role: ${previous}`)
    if (wasSuspended) console.log('  account is SUSPENDED — will be reactivated')

    if (!APPLY) {
      console.log('\nDry run. Re-run with --apply to write.')
      return
    }

    const update: Record<string, unknown> = {
      staffRoleSlug: SUPERADMIN_SLUG,
      staffRoles: [SUPERADMIN_SLUG],
      updatedAt: now,
    }
    if (wasSuspended) update.status = 'active'
    await db.collection('users').updateOne(String(existing._id), update)
    bustRoleCache()
    console.log(`\n✓ ${email} is now a superadmin.`)
    return
  }

  console.log(`WOULD CREATE a new account for ${email} and make it superadmin`)
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  const id = await db.collection('users').insertOne({
    email,
    displayName: email.split('@')[0],
    createdAt: now,
    updatedAt: now,
    ...newReaderFields(),
    staffRoles: [SUPERADMIN_SLUG],
    staffRoleSlug: SUPERADMIN_SLUG,
  })
  bustRoleCache()
  console.log(`\n✓ created ${email} (id ${String(id)}) as superadmin.`)
  console.log('They sign in with the normal email OTP flow — no password is set here.')
}

main()
  .catch((err) => {
    console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
    process.exitCode = 1
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 400))
