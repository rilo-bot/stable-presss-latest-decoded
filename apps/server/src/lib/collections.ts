// users          _id, name, email, roleId, lastLogin, createdAt, status, tokenVersion
// adminRoles     _id, name, permissions[], modules[], workflowStages[], isSuper
// organisations  _id, name, ownerUserId, description, bio
// orgMembers     _id, userId, orgId, role          'owner' | 'manager' | 'member'
// parties        _id, name, role, taken, userId?, orgId?, horseId?
//
// An account is an ADMIN when users.roleId is set. That is the whole test.

export const USERS = 'users'
export const ADMIN_ROLES = 'adminRoles'
export const ORGANISATIONS = 'organisations'
export const ORG_MEMBERS = 'orgMembers'
export const PARTIES = 'parties'
export const INVITES = 'pendingStaffGrants'
export const OTPS = 'otps'
