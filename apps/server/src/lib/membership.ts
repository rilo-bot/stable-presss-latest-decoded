// ---------------------------------------------------------------------------
// Membership edge collections — the P1 "expand" half of the user-model migration.
//
// The three membership axes are moving OFF the user document, because keeping
// them in embedded arrays is why ten call sites load the ENTIRE users collection
// into Node and filter in JavaScript (docs/USER-MODEL-PLAN.md §2). The two 1:many
// axes become collections; the 1:1 staff axis becomes a scalar field on the user.
//
//   partyClaims[]     → partyMemberships   (one row PER ROLE — many per user)
//   orgMemberships[]  → orgMemberships     (one row per org  — many per user)
//   staffRoles[]      → users.staffRoleSlug (a FIELD: exactly one role, or none)
//
// WHAT THIS FILE IS FOR RIGHT NOW
//
// P1 is additive and reversible: every write site keeps writing its embedded
// array AND mirrors the result here, while every READ still comes from the old
// arrays. So this module is currently write-only — nothing authorises against it
// yet. P2 moves `resolveAccount` and the ten scan sites over; P3 deletes the
// arrays. Until P2, a bug in here cannot affect access control, which is the
// whole point of splitting the migration this way.
//
// WHY MIRROR-BY-RECONCILE RATHER THAN 14 HAND-WRITTEN DUAL-WRITES
//
// Every existing write site already computes the COMPLETE new array and hands it
// to updateOne (`{ partyClaims: [...claims, claim] }`). So the cheapest correct
// mirror takes that same final array and reconciles the collection to match:
// insert what's missing, update what changed, soft-delete what's gone. One
// function to get right instead of fourteen, and it is idempotent by
// construction — re-running it is a no-op, which is also exactly what the
// backfill script needs (scripts/migrate-user-model.ts calls these same
// functions, so the migration and the live path cannot drift).
//
// See docs/USER-MODEL-PLAN.md §3, §8 P1.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import { primaryStaffRole } from './identity.js'
import type { OrgMembership, OrgRole, PartyClaim, PartyRole } from './identity.js'

export const PARTY_MEMBERSHIPS = 'partyMemberships'
export const ORG_MEMBERSHIPS = 'orgMemberships'

/** One (person, party, role) racing membership. Was an entry in `user.partyClaims[]`. */
export interface PartyMembershipRow {
  /**
   * The ORIGINAL embedded claim id (`claim-<uuid>`), carried across so
   * POST /api/partyClaims/:id/verify can still resolve by the id the client holds.
   *
   * Without it, finding one claim to verify would remain a full users scan — the
   * row's Mongo `_id` is not what the web app sends. Kept as its own field rather
   * than reusing `_id` so the value is stable across a soft-delete/re-add cycle.
   */
  claimId: string
  userId: string
  partyId: string
  /** STATIC enum — see identity.ts PartyRole. Never admin-definable. */
  role: PartyRole
  status: 'pending' | 'verified' | 'rejected'
  selfRegistered: boolean
  /**
   * S3 key rather than a public URL. `evidenceUrl` pointed at the unauthenticated
   * GET /api/uploads/file/* route, so identity documents were retrievable by
   * anyone holding the link (docs/AUTH-RBAC-REVIEW.md H7). Storing the key keeps
   * the option of serving it through an authorised route open; P1 only carries
   * the value across, it does not change how it is served.
   */
  evidenceKey?: string
  verifiedBy?: string
  verifierType?: 'admin' | 'org'
  verifiedAt?: string
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

/** One (person, org) membership. Was an entry in `user.orgMemberships[]`. */
export interface OrgMembershipRow {
  userId: string
  orgId: string
  orgRole: OrgRole
  createdAt: string
  updatedAt: string
}

/**
 * The `staffRoleSlug` value to write alongside a `staffRoles[]` array.
 *
 * Callers fold this into the SAME `$set` as the array they are already writing —
 * it is a field on the same document, so the mirror costs no extra query and
 * cannot half-apply.
 *
 * Thin alias over `primaryStaffRole` (identity.ts), which is also what the READ
 * path and the backfill use — one rule, three callers, no chance of divergence.
 */
export function staffRoleSlugFor(staffRoles: string[] | undefined): string | null {
  return primaryStaffRole(staffRoles)
}

export { primaryStaffRole }

// ── Reconcilers ─────────────────────────────────────────────────────────────

/** Stable identity of a party membership within one user's set. */
const partyKey = (r: { partyId: string; role: string }) => `${r.partyId}::${r.role}`

/**
 * Bring `partyMemberships` for ONE user in line with the given claims array.
 *
 * Idempotent. Rows absent from `claims` are soft-deleted rather than left behind,
 * so a rejected-then-recreated claim cannot leave a stale duplicate that the P2
 * scope resolver would read as live access.
 */
export async function mirrorPartyMemberships(
  userId: string,
  claims: PartyClaim[],
): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.collection(PARTY_MEMBERSHIPS).find({ userId })
  const byKey = new Map(existing.map((r) => [partyKey(r as never), r]))

  for (const c of claims) {
    if (!c?.partyId || !c?.role) continue
    const key = partyKey(c)
    const row: Omit<PartyMembershipRow, 'createdAt'> = {
      claimId: String(c.id ?? ''),
      userId,
      partyId: String(c.partyId),
      role: c.role,
      status: c.status,
      // `selfRegistered` unset counts as TRUE — every legacy/dashboard claim is
      // one; only an explicit false (claiming a pre-existing party) opts out.
      // Mirrors the same reading in lib/scope.ts manageablePartyIds().
      selfRegistered: c.selfRegistered !== false,
      evidenceKey: c.evidenceUrl,
      verifiedBy: c.verifiedBy,
      verifierType: c.verifierType,
      verifiedAt: c.verifiedAt,
      rejectionReason: c.rejectionReason,
      updatedAt: now,
    }
    const found = byKey.get(key)
    if (found) {
      await db.collection(PARTY_MEMBERSHIPS).updateOne(String(found._id), row)
      byKey.delete(key)
    } else {
      await db.collection(PARTY_MEMBERSHIPS).insertOne({ ...row, createdAt: now })
    }
  }

  // Anything still in the map is no longer on the user doc.
  for (const orphan of byKey.values()) {
    await db.collection(PARTY_MEMBERSHIPS).deleteOne(String(orphan._id))
  }
}

/** Bring `orgMemberships` for ONE user in line with the given memberships array. */
export async function mirrorOrgMemberships(
  userId: string,
  memberships: OrgMembership[],
): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.collection(ORG_MEMBERSHIPS).find({ userId })
  const byOrg = new Map(existing.map((r) => [String(r.orgId), r]))

  for (const m of memberships) {
    if (!m?.orgId || !m?.orgRole) continue
    const orgId = String(m.orgId)
    const found = byOrg.get(orgId)
    if (found) {
      await db
        .collection(ORG_MEMBERSHIPS)
        .updateOne(String(found._id), { orgRole: m.orgRole, updatedAt: now })
      byOrg.delete(orgId)
    } else {
      await db
        .collection(ORG_MEMBERSHIPS)
        .insertOne({ userId, orgId, orgRole: m.orgRole, createdAt: now, updatedAt: now })
    }
  }

  for (const orphan of byOrg.values()) {
    await db.collection(ORG_MEMBERSHIPS).deleteOne(String(orphan._id))
  }
}

/**
 * Clear `staffRoleSlug` on every user holding it. The companion to
 * `users.pullFromAll('staffRoles', slug)` when a role is DELETED.
 *
 * A loop of point updates rather than one updateMany because db.ts deliberately
 * exposes no generic multi-document $set — and the row count here is the number
 * of people who held one role, which is small.
 */
export async function clearStaffRoleSlug(slug: string): Promise<number> {
  const holders = await db.collection('users').find({ staffRoleSlug: slug })
  for (const u of holders) {
    await db.collection('users').updateOne(String(u._id), { staffRoleSlug: null })
  }
  return holders.length
}
