// ---------------------------------------------------------------------------
// Roles API — full CRUD over the dynamic `roles` collection, plus assignment.
//
// Every role in the platform lives here, including the seeded ones. A
// superadmin may edit any of them; the only hard limits are:
//
//   isImmutable (superadmin) — cannot be edited or deleted, ever
//   isSystem    (seeded)     — cannot be DELETED, but may be freely edited
//
// Lockout guards below stop an admin removing their own ability to get back in.
//
// See docs/DYNAMIC-RBAC-PLAN.md.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'
import { ADMIN_ROLES, USERS } from '../../lib/collections.js'
import { canManageRoles, canManageTeam, canViewTeam } from '../../lib/rbac.js'
import {
  SUPERADMIN_ROLE_NAME,
  bustRoleCache,
  checkSuperadminLoss,
  denyRoleGrant,
  getRoles,
  projectRole,
  type RoleDoc,
} from '../../lib/roleRegistry.js'
import {
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  WORKFLOW_STAGE_CATALOGUE,
  isModuleId,
  isPermissionAction,
  isWorkflowStage,
  type PermissionAction,
} from '../../lib/permissionCatalogue.js'
import type { AccountUser } from '../../lib/effectiveAccess.js'
import {
  adminRecordsForUsers,
  assigneeCountsByRoleId,
  grantAdminRole,
  revokeAdminRole,
  revokeRoleEverywhere,
} from '../../lib/admins.js'

const router = Router()

router.use(attachAccount)

/**
 * Two different powers, two different gates:
 *
 *   roles.manage — DEFINE a role (create / edit what it grants / delete)
 *   team.manage  — decide WHO HOLDS one (assign / unassign)
 *
 * Reads are open to either, because the Team Members screen has to list the
 * roles it offers in its dropdown. Gating the whole router on roles.manage (as
 * it originally did) meant anyone with only team.manage got a fully-rendered
 * team screen where every call 403'd.
 */
const requireDefineRoles = (req: Request, res: Response, next: NextFunction): void => {
  if (!canManageRoles(req.account)) {
    res.status(403).json({ error: 'You do not have permission to create or change roles.' })
    return
  }
  next()
}

const requireAssignRoles = (req: Request, res: Response, next: NextFunction): void => {
  if (!canManageTeam(req.account)) {
    res.status(403).json({ error: 'You do not have permission to change who holds a role.' })
    return
  }
  next()
}

// READS are open to anyone who may see the Team screen: it renders each member's
// role label and colour, so a `team.view` holder who could not GET this would see
// a roster of blanks. Every mutating route below carries its own narrower gate
// (`requireDefineRoles` / `requireAssignRoles`), so widening the read is safe.
router.use((req, res, next) => {
  const allowed =
    canManageRoles(req.account) ||
    canManageTeam(req.account) ||
    (req.method === 'GET' && canViewTeam(req.account))
  if (!allowed) {
    res.status(403).json({ error: 'You do not have permission to manage roles.' })
    return
  }
  next()
})

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

interface RoleBody {
  label: string
  description?: string
  color?: string
  icon?: string
  permissions: PermissionAction[]
  modules: string[]
  workflowStages: string[]
}

/** Validate + normalize the writable body of a role. */
function readRoleBody(body: unknown): RoleBody | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const label = typeof b.label === 'string' ? b.label.trim() : ''
  if (!label) return { error: 'A role name is required.' }
  if (label.length > 60) return { error: 'Role name must be 60 characters or fewer.' }

  // Unknown ids are dropped rather than rejected: the catalogue gains and loses
  // entries between deploys, and a stale checkbox shouldn't 400 the whole save.
  return {
    label,
    description:
      typeof b.description === 'string' && b.description.trim()
        ? b.description.trim().slice(0, 240)
        : undefined,
    color: typeof b.color === 'string' && /^(#[0-9a-fA-F]{6}|hsl\([^)]{1,60}\))$/.test(b.color) ? b.color : undefined,
    icon: typeof b.icon === 'string' && /^[A-Za-z]{1,32}$/.test(b.icon) ? b.icon : undefined,
    permissions: Array.isArray(b.permissions) ? b.permissions.filter(isPermissionAction) : [],
    modules: Array.isArray(b.modules) ? b.modules.filter(isModuleId) : [],
    workflowStages: Array.isArray(b.workflowStages) ? b.workflowStages.filter(isWorkflowStage) : [],
  }
}

/**
 * Would this change strip the acting user's own ability to manage roles?
 * A superadmin is exempt — they can never lock themselves out.
 *
 * The old version also checked "do any of their OTHER roles still grant
 * roles.manage". That branch is unreachable by construction: a person holds
 * exactly one admin role, so if they hold the role being edited there is no other
 * role to fall back on. Simplified rather than kept, because dead defensive code
 * reads as a live guarantee.
 */
function wouldSelfLockOut(
  actor: AccountUser,
  roleId: string,
  nextPermissions: PermissionAction[],
): boolean {
  if (actor.isSuperAdmin) return false
  if (actor.roleDocs[0]?.id !== roleId) return false
  return !nextPermissions.includes('roles.manage')
}

// ── Catalogue the admin UI renders checkboxes from ───────────────────────────
router.get('/catalogue', (_req, res) => {
  res.json({
    permissions: PERMISSION_CATALOGUE,
    modules: MODULE_CATALOGUE,
    workflowStages: WORKFLOW_STAGE_CATALOGUE,
  })
})

// ── List every role ──────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  const [roles, counts] = await Promise.all([getRoles(), assigneeCountsByRoleId()])
  // The registry map is keyed under BOTH id and name, so iterating it yields each
  // role twice. De-duplicate by id before counting or the console shows doubles.
  const distinct = [...new Map([...roles.values()].map((r) => [r.id, r])).values()]
  const out = distinct
    .map((r) => ({ ...r, assigneeCount: counts.get(r.id) ?? 0 }))
    .sort((a, b) => {
      // Superadmin first, then the rest of the system roles, then custom.
      if (a.isImmutable !== b.isImmutable) return a.isImmutable ? -1 : 1
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
      return a.label.localeCompare(b.label)
    })
  res.json({ roles: out })
})

// ── Create ───────────────────────────────────────────────────────────────────
router.post('/', requireDefineRoles, async (req, res) => {
  const parsed = readRoleBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const name = slugify(parsed.label)
  if (!name) {
    res.status(400).json({ error: 'Role name must contain at least one letter or number.' })
    return
  }
  if (name === SUPERADMIN_ROLE_NAME) {
    res.status(409).json({ error: 'That name is reserved.' })
    return
  }
  if ((await getRoles()).has(name)) {
    res.status(409).json({ error: 'A role with that name already exists.' })
    return
  }

  const now = new Date().toISOString()
  const id = await db.collection(ADMIN_ROLES).insertOne({
    name,
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon ?? 'Shield',
    isSystem: false,
    isImmutable: false,
    // Unrestricted access is not something a role can be CREATED with — only the
    // seeded superadmin carries it, and `isImmutable` stops it being edited in.
    isSuper: false,
    permissions: parsed.permissions,
    modules: parsed.modules,
    workflowStages: parsed.workflowStages,
    createdBy: req.account!.id,
    createdAt: now,
    updatedAt: now,
  })
  bustRoleCache()
  const created = await db.collection(ADMIN_ROLES).findById(id)
  res.status(201).json({ role: { ...projectRole(created!), assigneeCount: 0 } })
})

// ── Update ───────────────────────────────────────────────────────────────────
// `:name` resolves through the registry, which is keyed by BOTH id and name — so
// the console may address a role either way and a rename does not break a URL.
router.put('/:name', requireDefineRoles, async (req, res) => {
  const current = (await getRoles()).get(String(req.params.name))
  if (!current) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  if (current.isImmutable) {
    res.status(403).json({ error: `The ${current.label} role cannot be edited.` })
    return
  }
  const parsed = readRoleBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  if (wouldSelfLockOut(req.account!, current.id, parsed.permissions)) {
    res.status(409).json({
      error:
        'That would remove your own ability to manage roles. Grant "Manage roles" to another role you hold first.',
    })
    return
  }

  // Assignments reference `adminRoles._id`, never the name — so a rename is free
  // and nothing needs re-pointing. Only the LABEL is editable here regardless.
  await db.collection(ADMIN_ROLES).updateOne(current.id, {
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon ?? current.icon ?? 'Shield',
    permissions: parsed.permissions,
    modules: parsed.modules,
    workflowStages: parsed.workflowStages,
    updatedAt: new Date().toISOString(),
  })
  bustRoleCache()
  const fresh = await db.collection(ADMIN_ROLES).findById(current.id)
  res.json({ role: projectRole(fresh!) })
})

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:name', requireDefineRoles, async (req, res) => {
  const current = (await getRoles()).get(String(req.params.name))
  if (!current) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  if (current.isSystem) {
    res.status(403).json({
      error: `${current.label} is a built-in role and cannot be deleted. You can edit its permissions instead.`,
    })
    return
  }
  if (!req.account!.isSuperAdmin && req.account!.roleDocs[0]?.id === current.id) {
    res.status(409).json({ error: 'You cannot delete a role you currently hold.' })
    return
  }

  // Drop every assignment FIRST — an `admins` row pointing at a deleted role
  // leaves an admin holding nothing, which is worse than not being an admin
  // because no screen shows them as broken. `revokeRoleEverywhere` clears the
  // rows and `users.isAdmin` together, through the single writer.
  const unassigned = await revokeRoleEverywhere(current.id)
  await db.collection(ADMIN_ROLES).deleteOne(current.id)
  bustRoleCache()
  res.json({ ok: true, unassigned })
})

// ── Assign / unassign ────────────────────────────────────────────────────────
//
// ONE ROLE PER PERSON. Assigning REPLACES whatever they held rather than adding
// to it: a union of roles meant the Team screen showed rows like
// "Superadmin · Administrator" where the second chip granted nothing (superadmin
// short-circuits every check), and answering "what can this person do?" required
// mentally OR-ing several permission sets. The effective access is unchanged for
// anyone holding a single role, which is everyone in practice.
router.post('/:name/assign', requireAssignRoles, async (req, res) => {
  const role = (await getRoles()).get(String(req.params.name))
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  // Only an existing superadmin may mint another one. Reads `isSuper`, not the
  // name — the name is editable and must not be able to grant omnipotence.
  if (role.isSuper && !req.account!.isSuperAdmin) {
    res.status(403).json({ error: 'Only a superadmin can grant the superadmin role.' })
    return
  }
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
  const target = userId ? await db.collection(USERS).findById(userId) : null
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  const denied = denyRoleGrant(req.account!, role, userId === req.account!.id)
  if (denied) {
    res.status(403).json({ error: denied })
    return
  }
  const held = (await adminRecordsForUsers([userId])).get(userId)?.role ?? null
  if (held?.id === role.id) {
    res.status(409).json({ error: 'That member already holds this role.' })
    return
  }

  // Replacing a role TAKES AWAY the old one, so the superadmin guard has to fire
  // here too — not only on explicit removal. Without it, "change Mahin to Editor"
  // would quietly delete the only superadmin.
  const blocked = await checkSuperadminLoss(req.account!, held?.isSuper === true && !role.isSuper)
  if (blocked) {
    res.status(403).json({ error: blocked })
    return
  }

  // Single writer: the `admins` row and `users.isAdmin` cannot half-apply.
  await grantAdminRole(userId, role.id, req.account!.id)
  res.status(201).json({ ok: true, role: { name: role.name, label: role.label } })
})

router.delete('/:name/assign/:userId', requireAssignRoles, async (req, res) => {
  const role = (await getRoles()).get(String(req.params.name))
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  const userId = String(req.params.userId)
  const target = await db.collection(USERS).findById(userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  // Removing your own role is the same self-service problem as granting one: it
  // is how you would drop a restriction you are subject to.
  if (userId === req.account!.id) {
    res.status(403).json({ error: 'You cannot change your own role. Ask another administrator.' })
    return
  }

  // Was a bare holder-count check, so anyone with `team.manage` could demote a
  // superadmin whenever a second one existed — routes/staff.ts guarded that and
  // this route did not. One helper now answers for every path.
  const held = (await adminRecordsForUsers([userId])).get(userId)?.role ?? null
  const blocked = await checkSuperadminLoss(req.account!, role.isSuper && held?.isSuper === true)
  if (blocked) {
    res.status(403).json({ error: blocked })
    return
  }
  // Unassigning a role they do not hold is a no-op, not an error — but it must
  // not revoke whatever they DO hold.
  if (held?.id !== role.id) {
    res.json({ ok: true })
    return
  }

  await revokeAdminRole(userId)
  res.json({ ok: true })
})

export type { RoleDoc }
export default router
