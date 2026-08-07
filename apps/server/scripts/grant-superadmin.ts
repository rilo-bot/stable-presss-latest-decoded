// ---------------------------------------------------------------------------
// Grant superadmin from the command line. THE LOCKOUT RECOVERY PATH.
//
// POST /api/admin/seed self-disables once a superadmin exists, because while it
// is open it is an unauthenticated HTTP path to unrestricted platform access.
// That leaves one legitimate need unserved: recovering when every superadmin
// account is lost or was created against the wrong email.
//
// This script is that path, and it is deliberately NOT an endpoint. It requires
// MONGODB_URI — i.e. whoever runs it already has direct database access and could
// have edited the document by hand anyway. Nothing is granted here that the
// operator could not already take; what they get is a correct write instead of an
// improvised one.
//
// ⚠ THIS FILE ROTTED ONCE, SILENTLY. It was written against the old user model
// and still set `staffRoleSlug` / `staffRoles` / `displayName` long after an
// admin became "users.roleId is set". Three of its imports (SUPERADMIN_SLUG,
// superadminHolderCount, newReaderFields) no longer existed and resolved to
// `undefined` — which under tsx's ESM→CJS interop throws nothing. The damage:
// `find({ staffRoleSlug: undefined })` reads in Mongo as "field is missing", so
// --list matched EVERY user and reported them as superadmins, and --apply wrote
// undefined into dead fields, printed "✓ is now a superadmin", and granted
// nothing. The recovery path lied and left you locked out.
//
// It survived because tsconfig.json only included `src`. It is typechecked now,
// via tsconfig.scripts.json — keep it that way (`npm run check:types`).
//
// Usage:
//   npx tsx scripts/grant-superadmin.ts <email>            # dry run
//   npx tsx scripts/grant-superadmin.ts <email> --apply
//   npx tsx scripts/grant-superadmin.ts --list             # who holds it now
// ---------------------------------------------------------------------------

import { db } from '../src/lib/db.js'
import { USERS } from '../src/lib/collections.js'
import {
  SUPERADMIN_ROLE_NAME,
  assignRole,
  bustRoleCache,
  getRole,
  getRoles,
  roleOfUser,
  type RoleDoc,
} from '../src/lib/roleRegistry.js'
import { newUserFields } from '../src/lib/identity.js'
import { seedRoles } from '../src/lib/seedRoles.js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIST = args.includes('--list')
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()

/**
 * Every account holding a role with `isSuper`.
 *
 * Keyed on the FIELD, not on the role being named "superadmin": names are
 * editable at runtime, so a rename would otherwise make the last superadmin
 * invisible to the one tool that exists to find them.
 */
async function superadmins(): Promise<Array<{ id: string; email: string; role: string }>> {
  const holders = await db.collection(USERS).find({ roleId: { $ne: null } })
  const out: Array<{ id: string; email: string; role: string }> = []
  for (const u of holders) {
    const role = await roleOfUser(u)
    if (role?.isSuper) out.push({ id: String(u._id), email: String(u.email ?? ''), role: role.name })
  }
  return out
}

async function listHolders(): Promise<void> {
  const holders = await superadmins()
  console.log(`superadmins: ${holders.length}`)
  for (const h of holders) {
    console.log(`  ${h.email.padEnd(36)} id=${h.id}  role=${h.role}`)
  }
  if (holders.length === 0) {
    console.log('  (none — POST /api/admin/seed is open while this is true)')
  }
}

/** The role to grant: an existing `isSuper` row, else the seeded one by name. */
async function superRole(): Promise<RoleDoc | null> {
  for (const role of new Set((await getRoles()).values())) {
    if (role.isSuper) return role
  }
  return (await getRole(SUPERADMIN_ROLE_NAME)) ?? null
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

  // The role ROW must exist before anyone can point at it — `users.roleId` is a
  // reference, so granting without it would leave a dangling id.
  const created = await seedRoles()
  if (created.length > 0) console.log(`seeded role row(s): ${created.join(', ')}`)
  bustRoleCache()

  const role = await superRole()
  if (!role) {
    console.error('No superadmin role exists and seeding did not create one. Check seedRoles().')
    process.exitCode = 1
    return
  }

  const existing = (await db.collection(USERS).find({ email }))[0]
  const now = new Date().toISOString()

  if (existing) {
    const current = await roleOfUser(existing)
    if (current?.isSuper) {
      console.log(`${email} already holds "${current.name}" (superadmin). Nothing to do.`)
      return
    }

    console.log(`WOULD PROMOTE existing user ${email} (id ${String(existing._id)})`)
    // One role per user, so a grant REPLACES rather than stacks.
    if (current) console.log(`  replaces admin role: ${current.name}`)

    if (!APPLY) {
      console.log('\nDry run. Re-run with --apply to write.')
      return
    }

    await assignRole(String(existing._id), role.id)
    bustRoleCache()

    // Read back rather than trusting the write — this script's whole failure
    // mode last time was reporting success it had not achieved.
    const after = await roleOfUser(await db.collection(USERS).findById(existing._id))
    if (!after?.isSuper) {
      console.error(`\n✗ FAILED: ${email} still does not hold a superadmin role.`)
      process.exitCode = 1
      return
    }
    console.log(`\n✓ ${email} is now a superadmin (role "${after.name}").`)
    return
  }

  console.log(`WOULD CREATE a new account for ${email} and make it superadmin`)
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  const id = await db.collection(USERS).insertOne({
    email,
    name: email.split('@')[0],
    createdAt: now,
    updatedAt: now,
    ...newUserFields(),
  })
  await assignRole(String(id), role.id)
  bustRoleCache()

  const after = await roleOfUser(await db.collection(USERS).findById(id))
  if (!after?.isSuper) {
    console.error(`\n✗ FAILED: created ${email} (id ${String(id)}) but the role did not apply.`)
    process.exitCode = 1
    return
  }
  console.log(`\n✓ created ${email} (id ${String(id)}) as superadmin (role "${after.name}").`)
  console.log('They sign in with the normal email OTP flow — no password is set here.')
}

main()
  .catch((err) => {
    console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
    process.exitCode = 1
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 400))
