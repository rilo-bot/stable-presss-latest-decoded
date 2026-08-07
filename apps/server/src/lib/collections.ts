// users          _id, name, email, roleId, lastLogin, createdAt, tokenVersion
// adminRoles     _id, name, permissions[], modules[], workflowStages[], isSuper
// organisations  _id, name, ownerUserId, description, bio
// orgMembers     _id, userId, orgId, role          'owner' | 'manager' | 'member'
// people         _id, name, imageUrl, profession, dateOfBirth, countryOfBirth,
//                baseLocation, startedYear, personnelSubtype[]
// parties        _id, personId, role, taken, userId?, orgId?, horseId?
//
// An account is an ADMIN when users.roleId is set. That is the whole test.
//
// `parties` is an EDGE, not a profile: one row per person x role x horse. Who
// the person IS lives once in `people`, so a trainer on thirty horses has one
// profile and thirty edges. Reads join the person in; nothing denormalises it.

export const USERS = 'users'
export const ADMIN_ROLES = 'adminRoles'
export const ORGANISATIONS = 'organisations'
export const ORG_MEMBERS = 'orgMembers'
export const PEOPLE = 'people'
export const PARTIES = 'parties'
export const INVITES = 'pendingStaffGrants'
export const OTPS = 'otps'
