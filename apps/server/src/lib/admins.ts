// ---------------------------------------------------------------------------
// The `admins` collection — the join that MAKES an account an admin.
//
// TWO CATEGORIES, ONE FACT. A row here (`userId` → `roleId`) is what makes
// someone an admin. `users.isAdmin` is a denormalised copy of "a row exists",
// kept only so listing admins is one indexed query instead of a join.
//
// THIS FILE IS THE ONLY WRITER OF `users.isAdmin`. The row and the flag are set
// together, at one call site each, so they cannot drift by omission. Nothing
// else may set the flag — and nothing anywhere may READ it for an access
// decision, because resolveAccount overwrites it from the row first.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import { ADMINS, USERS } from './collections.js'
import { getRole, type RoleDoc } from './roleRegistry.js'

export interface AdminRow {
  userId: string
  /** References `adminRoles._id` — NOT the role name, so a rename is free. */
  roleId: string
  grantedBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * What the `admins` table says about one user.
 *
 * `isAdmin` and `role` are SEPARATE answers, deliberately. A row whose `roleId`
 * no longer resolves — the role was deleted out from under it — is still an
 * admin, holding nothing. Collapsing the two would make that account vanish from
 * the roster, and then nobody could see it to repair its role.
 */
export interface AdminRecord {
  /** A row exists. This, and only this, is what "is an admin" means. */
  isAdmin: boolean
  /** The resolved role, or null when there is no row OR the roleId is dangling. */
  role: RoleDoc | null
}

const NOT_AN_ADMIN: AdminRecord = { isAdmin: false, role: null }

/**
 * The admin record for one user.
 *
 * ONE indexed query: the `admins` row gives a roleId, and the registry turns it
 * into a doc from an in-process cache rather than a second round trip.
 */
export async function adminRecordFor(userId: string): Promise<AdminRecord> {
  if (!userId) return NOT_AN_ADMIN
  const rows = await db.collection(ADMINS).find({ userId })
  const row = rows[0]
  if (!row) return NOT_AN_ADMIN
  const roleId = row.roleId ? String(row.roleId) : ''
  return { isAdmin: true, role: roleId ? ((await getRole(roleId)) ?? null) : null }
}

/**
 * Admin records for MANY users at once, keyed by userId. Absent from the map =
 * not an admin.
 *
 * One query for the whole set instead of one per user. Every roster, assignee
 * count and admin-directory screen needs this shape; doing it per row is how the
 * full-collection scans happened in the first place.
 */
export async function adminRecordsForUsers(userIds: string[]): Promise<Map<string, AdminRecord>> {
  const out = new Map<string, AdminRecord>()
  if (userIds.length === 0) return out
  const rows = await db.collection(ADMINS).find({ userId: { $in: [...new Set(userIds)] } })
  for (const row of rows) {
    const roleId = row.roleId ? String(row.roleId) : ''
    out.set(String(row.userId), {
      isAdmin: true,
      role: roleId ? ((await getRole(roleId)) ?? null) : null,
    })
  }
  return out
}

/** Every admin row, newest irrelevant — used by the roster and the reconciler. */
export async function allAdminRows(): Promise<Array<{ userId: string; roleId: string }>> {
  const rows = await db.collection(ADMINS).find({})
  return rows.map((r) => ({ userId: String(r.userId), roleId: String(r.roleId ?? '') }))
}

/** How many users hold a role flagged `isSuper`. */
export async function superadminCount(): Promise<number> {
  const rows = await allAdminRows()
  let n = 0
  for (const row of rows) {
    const role = row.roleId ? await getRole(row.roleId) : undefined
    if (role?.isSuper) n++
  }
  return n
}

/** Every userId holding a given role. Used by assignee counts and role deletion. */
export async function holdersOfRole(roleId: string): Promise<string[]> {
  if (!roleId) return []
  const rows = await db.collection(ADMINS).find({ roleId })
  return rows.map((r) => String(r.userId))
}

/** How many users hold each roleId. One query for the whole Roles console. */
export async function assigneeCountsByRoleId(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const row of await allAdminRows()) {
    if (!row.roleId) continue
    counts.set(row.roleId, (counts.get(row.roleId) ?? 0) + 1)
  }
  return counts
}

/**
 * Make a user an admin with the given role, replacing whatever they held.
 *
 * REPLACES rather than adds: the admin axis is one-role-per-user, so there is no
 * append. Writes `users.isAdmin` in the same call — see the file header.
 */
export async function grantAdminRole(
  userId: string,
  roleId: string,
  grantedBy?: string,
): Promise<void> {
  if (!userId || !roleId) throw new Error('grantAdminRole needs a userId and a roleId')
  const now = new Date().toISOString()

  const existing = await db.collection(ADMINS).find({ userId })
  if (existing.length > 0) {
    // Update the first and drop any extras. Extras cannot be created any more
    // (unique index), but a row written before it existed would otherwise make
    // "which role?" depend on document order.
    await db.collection(ADMINS).updateOne(String(existing[0]!._id), { roleId, grantedBy, updatedAt: now })
    for (const dupe of existing.slice(1)) await db.collection(ADMINS).deleteOne(String(dupe._id))
  } else {
    await db.collection(ADMINS).insertOne({ userId, roleId, grantedBy, createdAt: now, updatedAt: now })
  }

  await db.collection(USERS).updateOne(userId, { isAdmin: true, updatedAt: now })
}

/**
 * Take away a user's admin role. The ACCOUNT survives — they drop back to being a
 * plain user rather than being deleted, because their bylines, posts and uploads
 * all still reference them.
 */
export async function revokeAdminRole(userId: string): Promise<void> {
  if (!userId) return
  const now = new Date().toISOString()
  const rows = await db.collection(ADMINS).find({ userId })
  for (const row of rows) await db.collection(ADMINS).deleteOne(String(row._id))
  await db.collection(USERS).updateOne(userId, { isAdmin: false, updatedAt: now })
}

/**
 * Drop every assignment of a role that is being deleted, and clear `isAdmin` for
 * everyone who held it. Returns how many users were affected.
 */
export async function revokeRoleEverywhere(roleId: string): Promise<number> {
  const userIds = await holdersOfRole(roleId)
  for (const userId of userIds) await revokeAdminRole(userId)
  return userIds.length
}

/**
 * Repair `users.isAdmin` so it agrees with the `admins` table, in both directions.
 *
 * The table is authoritative — it carries the roleId, so a flag with no row grants
 * nothing, while a row with no flag is a real grant the flag is lying about.
 * Returns what it changed; available as a consistency check at any time.
 */
export async function reconcileIsAdmin(
  apply: boolean,
): Promise<{ flagAdded: string[]; flagCleared: string[]; orphanRows: string[] }> {
  const [users, rows] = await Promise.all([
    db.collection(USERS).find({}),
    db.collection(ADMINS).find({}),
  ])
  const userIds = new Set(users.map((u) => String(u._id)))
  const withRow = new Set(rows.map((r) => String(r.userId)))

  const flagAdded: string[] = []
  const flagCleared: string[] = []
  for (const u of users) {
    const id = String(u._id)
    const shouldBe = withRow.has(id)
    if (u.isAdmin === shouldBe) continue
    if (shouldBe) flagAdded.push(String(u.email ?? id))
    else flagCleared.push(String(u.email ?? id))
    if (apply) await db.collection(USERS).updateOne(id, { isAdmin: shouldBe })
  }

  // A grant whose account is gone.
  const orphanRows: string[] = []
  for (const r of rows) {
    if (userIds.has(String(r.userId))) continue
    orphanRows.push(String(r.userId))
    if (apply) await db.collection(ADMINS).deleteOne(String(r._id))
  }

  return { flagAdded, flagCleared, orphanRows }
}
