// ---------------------------------------------------------------------------
// Collection names — ONE place, so a rename is one edit and a typo is a compile
// error rather than a silently-empty query.
//
// THE WHOLE IDENTITY MODEL IS SIX COLLECTIONS:
//
//   users          _id, name, email, isAdmin, lastLogin, createdAt, updatedAt
//                  + status, tokenVersion        ← session control, see below
//   admins         _id, userId (unique), roleId  ← the join that MAKES someone an admin
//   adminRoles     _id, name (unique), permissions[], modules[], workflowStages[], isSuper
//   organisations  _id, name, ownerUserId, description, bio
//   orgMembers     _id, userId, orgId, role      ← 'owner' | 'manager' | 'member'
//   parties        _id, name, role, taken, userId?, orgId?, horseId?
//
// There are exactly TWO categories of account: a user, and an admin. "Admin" is
// not a field you can set — it is the presence of an `admins` row. `users.isAdmin`
// is a denormalised copy of that fact, written ONLY by lib/admins.ts and never
// read for an access decision (resolveAccount overwrites it from the row).
//
// `status` and `tokenVersion` are not identity, they are REVOCATION: a Bearer JWT
// lives 7 days, and these two are the only way to end a session before it expires.
// ---------------------------------------------------------------------------

/** Accounts. Four identity fields and two session fields — nothing else. */
export const USERS = 'users'

/** userId → roleId. A row here IS what makes an account an admin. */
export const ADMINS = 'admins'

/** The admin role definitions. Referenced by `_id`, so a rename is free. */
export const ADMIN_ROLES = 'adminRoles'

/** Organisations. `ownerUserId` plus an `orgMembers` row with role 'owner'. */
export const ORGANISATIONS = 'organisations'

/** userId × orgId → 'owner' | 'manager' | 'member'. */
export const ORG_MEMBERS = 'orgMembers'

/**
 * The racing register AND the horse link, in one row per role.
 *
 * Staff create a row with `taken: false` and no `userId` for someone who has
 * never signed up; claiming it flips `taken` and sets `userId`. Somebody who is
 * both owner and trainer of a horse has TWO rows — which is why `role` is a
 * single value and not an array.
 */
export const PARTIES = 'parties'

/** Staged role grants for an email with no account yet. Consumed at first sign-in. */
export const INVITES = 'pendingStaffGrants'

/** One-time sign-in codes. */
export const OTPS = 'otps'
