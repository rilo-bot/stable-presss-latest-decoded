// users          _id, name, email, isAdmin, lastLogin, createdAt, tokenVersion
// roles          _id, name, permissions[], scopes{}, isSuper
//                (`modules` and `workflowStages` are DERIVED from permissions in
//                 projectRole() — they are no longer stored on the document)
// adminRoles     _id, userId, roleId, assignedAt        ← the LINK, admins only
// organisations  _id, name, ownerUserId, description, bio
// orgMembers     _id, userId, orgId, role          'owner' | 'manager' | 'member'
// people         _id, name, imageUrl, profession, dateOfBirth, countryOfBirth,
//                baseLocation, startedYear, personnelSubtype[]
// parties        _id, personId, role, taken, userId?, orgId?, horseId?
//
// AN ACCOUNT IS AN ADMIN WHEN `users.isAdmin` IS TRUE, and the role it holds is
// the ONE `adminRoles` row pointing at it. A normal reader has neither — no flag,
// no link row, no role of any kind.
//
// ONE ROLE PER ADMIN is enforced by the DATABASE: `adminRoles.userId` is unique.
// It used to be a single `users.roleId` field, which made "one role" a property
// of the shape rather than a rule anything could violate; a link row needs the
// index to say the same thing.
//
// The two are written together by ONE pair of functions (`assignRole` /
// `clearRole` in roleRegistry.ts) and in an order that fails CLOSED — see there.
//
// `parties` is an EDGE, not a profile: one row per person x role x horse. Who
// the person IS lives once in `people`, so a trainer on thirty horses has one
// profile and thirty edges. Reads join the person in; nothing denormalises it.

export const USERS = 'users'
/** Role DEFINITIONS — what a role may do. */
export const ROLES = 'roles'
/** The LINK between a user and the role they hold. Unique on `userId`. */
export const ADMIN_ROLES = 'adminRoles'
export const ORGANISATIONS = 'organisations'
export const ORG_MEMBERS = 'orgMembers'
export const PEOPLE = 'people'
export const PARTIES = 'parties'
export const INVITES = 'pendingStaffGrants'
export const OTPS = 'otps'
