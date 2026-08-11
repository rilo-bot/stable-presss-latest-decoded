// Granting and revoking an admin role — the guard sequence, in one place.
//
// TWO ENDPOINTS DO THIS: `POST /api/staff` (address it by email, and stage an
// invite when there is no account yet) and `POST /api/roles/:name/assign`
// (address it by userId, from the role card). They are different doors onto the
// SAME operation, and they had begun to differ on which guards ran and how the
// "is this me?" test was made — staff compared lowercased emails, roles compared
// ids, and only one of them checked the actor on revoke.
//
// The guards themselves already lived in one place (`denyRoleGrant`,
// `checkSuperadminLoss`); what was copied was the ORDER they run in and the
// status code each failure maps to. That is what this file owns.

import { db } from './db.js'
import { USERS } from './collections.js'
import type { AccountUser } from './effectiveAccess.js'
import type { UserDoc } from './session.js'
import type { PermissionAction } from './permissionCatalogue.js'
import {
  assignRole,
  clearRole,
  roleOfUser,
  superadminCount,
  type RoleDoc,
} from './roleRegistry.js'

/** A refusal carries the status the route should answer with. */
type RoleChange = { ok: true } | { ok: false; status: 403 | 409; error: string }

// ── The two guards ──────────────────────────────────────────────────────────
// Moved here from roleRegistry.ts, which stores roles rather than deciding who
// may hand them out. Both are pure policy and both are used only by this file.

/** THE guard on handing out a role. Returns an error message, or null to allow. */
export function denyRoleGrant(
  actor: { isSuperAdmin: boolean; permissions: ReadonlySet<PermissionAction> },
  role: RoleDoc,
  isSelf: boolean,
): string | null {
  if (isSelf) return 'You cannot change your own role. Ask another administrator to do it.'
  if (actor.isSuperAdmin) return null
  const missing = role.permissions.filter((p) => !actor.permissions.has(p))
  if (missing.length > 0) {
    return `You cannot grant "${role.label}" — it includes access you do not hold yourself.`
  }
  return null
}

/** THE guard for every path that can take superadmin away from someone. */
export async function checkSuperadminLoss(
  actor: { isSuperAdmin: boolean },
  losesSuperadmin: boolean,
): Promise<string | null> {
  if (!losesSuperadmin) return null
  if (!actor.isSuperAdmin) return 'Only a superadmin can change another superadmin.'
  // Reaching zero is unrecoverable without shell access, so this is checked even
  // for a superadmin acting.
  if ((await superadminCount()) <= 1) {
    return 'Cannot remove the last superadmin — the platform would be locked out.'
  }
  return null
}

const refuse = (status: 403 | 409, error: string): RoleChange => ({ ok: false, status, error })

/**
 * May the actor hand out this role AT ALL, to anyone?
 *
 * The half of the check that depends only on the actor and the role, with no
 * target — which is exactly the case when `POST /api/staff` stages an INVITE for
 * an address that has no account yet. That path has no user document to pass to
 * `grantRoleTo`, and skipping these two guards there would let an invite become
 * the way to hand out a role you could not grant directly.
 */
export function canOfferRole(actor: AccountUser, role: RoleDoc): RoleChange {
  // Reads `isSuper`, not the name: a role's name is editable.
  if (role.isSuper && !actor.isSuperAdmin) {
    return refuse(403, 'Only a superadmin can grant the superadmin role.')
  }
  const denied = denyRoleGrant(actor, role, false)
  if (denied) return refuse(403, denied)
  return { ok: true }
}

/**
 * Give `target` the role, replacing whatever they held. ONE ROLE PER PERSON.
 *
 * Self-identification is by ID, never by email — the two endpoints disagreed on
 * this, and an email comparison is the weaker of the two (it depends on both
 * sides having been normalised the same way).
 */
export async function grantRoleTo(
  actor: AccountUser,
  target: UserDoc,
  role: RoleDoc,
): Promise<RoleChange> {
  const targetId = String(target._id)

  const offerable = canOfferRole(actor, role)
  if (!offerable.ok) return offerable

  // Re-run with the real target: granting to YOURSELF is refused outright, which
  // canOfferRole cannot know about.
  const denied = denyRoleGrant(actor, role, targetId === actor.id)
  if (denied) return refuse(403, denied)

  const held = await roleOfUser(target)
  if (held?.id === role.id) return refuse(409, 'That person already holds this role.')

  // Replacing TAKES AWAY the old role, so the superadmin floor applies here as
  // much as on an explicit removal.
  const blocked = await checkSuperadminLoss(actor, held?.isSuper === true && !role.isSuper)
  if (blocked) return refuse(403, blocked)

  // Writes the `adminRoles` link AND `users.isAdmin`, in the order that fails
  // closed. `assignedBy` is the audit trail for who put them on the team.
  await assignRole(targetId, role.id, actor.id)
  return { ok: true }
}

/**
 * Clear `target`'s role. The ACCOUNT survives — bylines, posts and uploads all
 * reference it.
 *
 * `expected` is for the role-card door, which revokes one NAMED role: if they
 * hold something else by now that is a no-op, not an error, and it must not
 * take away whatever they DO hold.
 */
export async function revokeRoleFrom(
  actor: AccountUser,
  target: UserDoc,
  expected?: RoleDoc,
): Promise<RoleChange> {
  const targetId = String(target._id)

  // How you would drop your own restrictions, so it is refused on both doors.
  if (targetId === actor.id) {
    return refuse(403, 'You cannot change your own role. Ask another administrator.')
  }

  const held = await roleOfUser(target)
  const losesSuper = expected
    ? expected.isSuper && held?.isSuper === true
    : held?.isSuper === true
  const blocked = await checkSuperadminLoss(actor, losesSuper)
  if (blocked) return refuse(403, blocked)

  if (expected && held?.id !== expected.id) return { ok: true }

  await clearRole(targetId)
  return { ok: true }
}

export async function findUserById(userId: string): Promise<UserDoc | null> {
  if (!userId) return null
  return db.collection(USERS).findById(userId)
}
