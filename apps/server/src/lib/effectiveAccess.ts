// ---------------------------------------------------------------------------
// Effective access resolution — the ONE place that answers "what may this
// account do?".
//
// Two deliberately separate answers, because they are enforced at different
// depths right now:
//
//   builtinPermissions(account)   union of the BUILT-IN staff matrix across ALL
//                                 of the account's staff roles. This is what the
//                                 SERVER enforces. Custom roles are excluded on
//                                 purpose — see the note below.
//
//   resolveAccess(account, roles) builtin ∪ custom-role grants, plus the module
//                                 list. This is what the CLIENT gets, and what
//                                 drives navigation + button visibility.
//
// Why the split: custom roles are currently a UI/navigation layer only. Making
// them a server-side security boundary is a deliberate follow-up — every gate in
// rbac.ts would need to move off `isStaff` onto action checks first. Until then,
// a custom role can only ever REVEAL surfaces to someone who already holds a
// built-in staff role; it can never widen what the API accepts. Keeping the two
// functions distinct is what stops that promotion from happening by accident.
//
// The union across all roles is also the fix for the old collapse bug: the code
// used to pick a single highest-ranked role via primaryRole(), so holding
// podcast_producer + editor silently dropped every producer-only permission.
// ---------------------------------------------------------------------------

import { STAFF_ROLES, type AccountUser, type StaffRole } from './identity.js'
import {
  BUILTIN_ROLE_PERMISSIONS,
  MODULE_CATALOGUE,
  builtinModulesFor,
  isModuleId,
  isPermissionAction,
  type PermissionAction,
} from './permissionCatalogue.js'

/** A custom role as stored in the `customRoles` collection. */
export interface CustomRole {
  id: string
  key: string
  label: string
  description?: string
  color?: string
  permissions: PermissionAction[]
  modules: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** The resolved access payload handed to the client. */
export interface ResolvedAccess {
  /** Actions the UI should treat as granted (builtin ∪ custom). */
  permissions: PermissionAction[]
  /** Navigation surfaces the UI should show (builtin ∪ custom). */
  modules: string[]
  /** Built-in staff roles held, for display. */
  staffRoles: StaffRole[]
  /** Custom roles held, for display. */
  customRoles: Array<{ id: string; label: string; color?: string }>
}

const staffRolesOf = (account: AccountUser | undefined): StaffRole[] =>
  ((account?.roles ?? []) as string[]).filter((r): r is StaffRole =>
    (STAFF_ROLES as string[]).includes(r),
  )

/**
 * Union of the built-in matrix across EVERY staff role the account holds.
 * Server-enforcing callers use this — never the custom-role set.
 */
export function builtinPermissions(account: AccountUser | undefined): Set<PermissionAction> {
  const out = new Set<PermissionAction>()
  for (const role of staffRolesOf(account)) {
    for (const p of BUILTIN_ROLE_PERMISSIONS[role]) out.add(p)
  }
  return out
}

/** Server-side capability check. Built-in roles only, unioned. */
export function accountCan(account: AccountUser | undefined, action: PermissionAction): boolean {
  if (!account) return false
  return builtinPermissions(account).has(action)
}

/**
 * Full access resolution for the client. `allCustomRoles` is the whole
 * `customRoles` collection; only the ones this account is assigned are folded in.
 */
export function resolveAccess(
  account: AccountUser | undefined,
  allCustomRoles: CustomRole[] = [],
): ResolvedAccess {
  const staffRoles = staffRolesOf(account)

  const permissions = builtinPermissions(account)
  const modules = new Set<string>()
  for (const role of staffRoles) {
    for (const m of builtinModulesFor(role)) modules.add(m)
  }

  const assigned = new Set(account?.customRoleIds ?? [])
  const held = allCustomRoles.filter((r) => assigned.has(r.id))
  for (const role of held) {
    for (const p of role.permissions) {
      if (isPermissionAction(p)) permissions.add(p)
    }
    for (const m of role.modules) {
      if (isModuleId(m)) modules.add(m)
    }
  }

  // An administrator always sees everything, regardless of what a custom role
  // does or doesn't tick — there must be no way to lock the last admin out of
  // the roles screen.
  if (staffRoles.includes('administrator')) {
    for (const m of MODULE_CATALOGUE) modules.add(m.id)
  }

  return {
    permissions: [...permissions],
    modules: [...modules],
    staffRoles,
    customRoles: held.map((r) => ({ id: r.id, label: r.label, color: r.color })),
  }
}
