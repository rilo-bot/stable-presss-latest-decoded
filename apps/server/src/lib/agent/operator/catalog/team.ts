import type { CatalogSurface } from './types.js'

// Operator catalog — 'team' pack. See ./types.ts for the contract.
//
// Web side: apps/web/src/pages/production-system/operator-team/
//   useTeamOperatorActions.ts  (registered by newsroom/views/TeamManagementView)
//   useRolesOperatorActions.ts (registered by newsroom/views/RolesPermissionsView)
// Names and arg shapes here MUST match the zod schemas there.
export const SURFACES: CatalogSurface[] = [
  {
    id: 'team-members',
    title: 'Team Members',
    route: '/production-system/team',
    who: 'staff with Team view (read-only roster); Team create/edit/delete to invite, change roles or remove',
    purpose:
      'The staff roster: every member with their ONE role, plus pending email invitations. Invite people by email with a role, change a member\'s role (it replaces their current one), re-send emails, cancel invitations, remove someone from the team (their account and bylines stay; they become a reader).',
    actions: [
      {
        name: 'team.list',
        description: 'List members (userId, name, email, role slug + label, isYou) and pending invitations (inviteId, email, role, expired). Call first to find a userId.',
        args: '{}',
      },
      {
        name: 'roles.list',
        description: 'List the roles you can give (slug, label, description). Use a slug or label as `role` in team.invite / team.changeRole.',
        args: '{}',
      },
      {
        name: 'team.invite',
        description: 'Invite someone by email with a role: types the email into the invite box, picks the role from the list and presses Invite. If they already have an account the role applies immediately, replacing their current one.',
        args: '{ email: string; role: string /* slug or label */ }',
        confirms: true,
      },
      {
        name: 'team.changeRole',
        description: "Change a member's role by opening their role pill and picking the new role. One role per person.",
        args: '{ member: string /* userId, email or name */; role: string /* slug or label */ }',
        confirms: true,
      },
      {
        name: 'team.remove',
        description: 'Remove a member from the team (revokes their role). You cannot remove yourself.',
        args: '{ member: string /* userId, email or name */ }',
        confirms: true,
      },
      {
        name: 'team.cancelInvite',
        description: 'Cancel a pending invitation; its emailed link stops working.',
        args: '{ invite: string /* inviteId or invited email */ }',
        confirms: true,
      },
      {
        name: 'team.resendEmail',
        description: "Re-send an email: a pending invite gets a fresh link (the old one stops working); a member gets their 'you have access' email again.",
        args: '{ who: string /* inviteId/email of an invite, or userId/email/name of a member */ }',
        confirms: true,
      },
    ],
    anchors: [
      'team.invite-email',
      'team.invite-role',
      'team.invite-submit',
      'team.member-<userId>',
      'team.role-select-<userId>',
      'team.role-select-<userId>.option-<roleSlug>',
      'team.resend-<userId>',
      'team.remove-<userId>',
      'team.remove-confirm',
      'team.pending-<inviteId>',
      'team.pending-resend-<inviteId>',
      'team.pending-cancel-<inviteId>',
    ],
  },
  {
    id: 'team-roles',
    title: 'Roles & Permissions',
    route: '/production-system/roles',
    who: 'staff with Roles view; Roles create/edit/delete to change roles',
    purpose:
      "Define what each role may do: one grid of screens × verbs (view, create, edit, delete, publish). Permission ids are '<screen>.<verb>' (e.g. 'stories.edit'); any verb implies that screen's view, and module access IS a screen's '.view'. Scoped screens (roles.catalog) also take an Own/Everyone scope. Built-in roles cannot be deleted; locked roles (Superadmin) cannot be edited. Assign roles to people on Team Members, not here.",
    actions: [
      {
        name: 'roles.list',
        description: 'List every role (slug, label, description, isSystem, locked, assignees, permissionCount).',
        args: '{}',
      },
      {
        name: 'roles.catalog',
        description: "List the grantable permissions per screen ('<screen>.<verb>' ids). Use before roles.create / roles.editPermissions.",
        args: '{}',
      },
      {
        name: 'roles.open',
        description: "Open a role in the grid and return its exact permissions and Own/Everyone scopes.",
        args: '{ role: string /* slug or label */ }',
      },
      {
        name: 'roles.create',
        description: 'Create a role: types the name and description, ticks the permission boxes (modules = screens to open, i.e. their .view), sets scopes, saves.',
        args: "{ label: string; description?: string; permissions?: string[] /* '<screen>.<verb>' */; modules?: string[]; scopes?: Record<string /* screen */, 'own' | 'everyone'> }",
        confirms: true,
      },
      {
        name: 'roles.editPermissions',
        description: "Grant and/or revoke permissions on a role (ticks/unticks grid boxes, saves). Revoking a '.view' clears that screen's whole row.",
        args: "{ role: string; grant?: string[]; revoke?: string[] /* '<screen>.<verb>' ids */ }",
        confirms: true,
      },
      {
        name: 'roles.setScope',
        description: "Set per-screen reach of a role's verbs: own records or everyone's (row must grant something).",
        args: "{ role: string; scopes: Record<string /* screen */, 'own' | 'everyone'> }",
        confirms: true,
      },
      {
        name: 'roles.rename',
        description: "Change a role's display name and/or description (slug and permissions stay).",
        args: '{ role: string; label?: string; description?: string }',
        confirms: true,
      },
      {
        name: 'roles.delete',
        description: 'Delete a custom role; people holding it lose that access until given another role.',
        args: '{ role: string /* slug or label */ }',
        confirms: true,
      },
    ],
    anchors: [
      'roles.scope-<screen>-<own|everyone>',
      'roles.role-<roleSlug>',
      'roles.new',
      'roles.edit',
      'roles.cancel',
      'roles.save',
      'roles.delete',
      'roles.delete-confirm',
      'roles.label',
      'roles.description',
      'roles.perm-<screen>.<verb>',
    ],
  },
]
