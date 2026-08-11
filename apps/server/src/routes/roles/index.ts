// Roles: CRUD over `roles` (the definitions), plus assigning them via `adminRoles`.
//
//   isImmutable (superadmin)  cannot be edited or deleted, ever
//   isSystem    (seeded)      cannot be DELETED, but may be freely edited

import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { db } from '../../lib/db.js'
import { attachAccount } from '../../lib/auth.js'
import { ROLES } from '../../lib/collections.js'
import { canManageRoles, canManageTeam, canViewTeam } from '../../lib/rbac.js'
import { findUserById, grantRoleTo, revokeRoleFrom } from '../../lib/roleGrant.js'
import {
  SUPERADMIN_ROLE_NAME,
  bustRoleCache,
  assigneeCounts,
  listRoles,
  clearRoleEverywhere,
  getRoles,
  projectRole,
  type RoleDoc,
} from '../../lib/roleRegistry.js'
import {
  PERMISSION_CATALOGUE,
  SCREEN_CATALOGUE,
  VERBS,
  normalisePermissions,
  normaliseScopes,
  type PermissionAction,
  type RoleScopes,
} from '../../lib/permissionCatalogue.js'
import type { AccountUser } from '../../lib/effectiveAccess.js'

const router = Router()

router.use(attachAccount)

/**
 * TWO POWERS: roles.manage DEFINES a role; team.manage decides WHO HOLDS one.
 * Reads are open to either, because the Team screen renders the role dropdown.
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

// Every mutating route below carries its own narrower gate, so the wide read is safe.
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
  scopes: RoleScopes
}

/** Validate + normalize the writable body of a role. */
function readRoleBody(body: unknown): RoleBody | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const label = typeof b.label === 'string' ? b.label.trim() : ''
  if (!label) return { error: 'A role name is required.' }
  if (label.length > 60) return { error: 'Role name must be 60 characters or fewer.' }

  // Unknown ids are dropped, not rejected: a stale checkbox must not 400 a save.
  return {
    label,
    description:
      typeof b.description === 'string' && b.description.trim()
        ? b.description.trim().slice(0, 240)
        : undefined,
    color: typeof b.color === 'string' && /^(#[0-9a-fA-F]{6}|hsl\([^)]{1,60}\))$/.test(b.color) ? b.color : undefined,
    icon: typeof b.icon === 'string' && /^[A-Za-z]{1,32}$/.test(b.icon) ? b.icon : undefined,
    // normalisePermissions also applies "any verb implies view", so a console
    // that somehow sent Edit without View still stores a coherent role.
    permissions: normalisePermissions(b.permissions),
    scopes: normaliseScopes(b.scopes),
  }
}

/**
 * You cannot DEFINE a role holding access you do not hold yourself.
 *
 * THE FIX FOR THE ESCALATION. `denyRoleGrant` applies exactly this rule when
 * deciding who may HOLD a role, but the define path had no equivalent — so a
 * narrow `roles.manage` holder could PUT their own role with `platform.admin`
 * added and hold it on their very next request, because permissions resolve
 * live. Creating a role had the same gap: `POST /` would mint anything, and only
 * the assign step pushed back.
 *
 * A superadmin is exempt — they already hold everything by short-circuit.
 */
function denyAmplification(actor: AccountUser, next: PermissionAction[]): string | null {
  if (actor.isSuperAdmin) return null
  const missing = next.filter((p) => !actor.permissions.has(p))
  if (missing.length === 0) return null
  return `You cannot grant access you do not hold yourself: ${missing.join(', ')}.`
}

/** Would this edit strip the actor's own roles.manage? A superadmin is exempt. */
function wouldSelfLockOut(
  actor: AccountUser,
  roleId: string,
  nextPermissions: PermissionAction[],
): boolean {
  if (actor.isSuperAdmin) return false
  if (actor.role?.id !== roleId) return false
  return !nextPermissions.includes('roles.edit')
}

// ── The grid the console renders ─────────────────────────────────────────────
//
// `screens` is the whole shape now: one row per screen, carrying the verbs it
// supports. The console needs nothing else to draw the grid, and a row can never
// offer a checkbox the server would ignore. `permissions` stays for anything
// still rendering a flat list.
router.get('/catalogue', (_req, res) => {
  res.json({
    screens: SCREEN_CATALOGUE,
    verbs: VERBS,
    permissions: PERMISSION_CATALOGUE,
  })
})

// ── List every role ──────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  // listRoles(), not getRoles(): the registry map keys each role under BOTH its
  // id and its name, so iterating that would yield every role twice.
  const [roles, counts] = await Promise.all([listRoles(), assigneeCounts()])
  const out = roles
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
  const amplified = denyAmplification(req.account!, parsed.permissions)
  if (amplified) {
    res.status(403).json({ error: amplified })
    return
  }

  const now = new Date().toISOString()
  const id = await db.collection(ROLES).insertOne({
    name,
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon ?? 'Shield',
    isSystem: false,
    isImmutable: false,
    // Only the seeded superadmin is ever isSuper; isImmutable stops it being edited in.
    isSuper: false,
    permissions: parsed.permissions,
    scopes: parsed.scopes,
    createdBy: req.account!.id,
    createdAt: now,
    updatedAt: now,
  })
  bustRoleCache()
  const created = await db.collection(ROLES).findById(id)
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
  const amplified = denyAmplification(req.account!, parsed.permissions)
  if (amplified) {
    res.status(403).json({ error: amplified })
    return
  }
  if (wouldSelfLockOut(req.account!, current.id, parsed.permissions)) {
    res.status(409).json({
      error:
        'That would remove your own ability to manage roles. Grant "Manage roles" to another role you hold first.',
    })
    return
  }

  // adminRoles.roleId references _id, never the name, so a rename needs no re-pointing.
  await db.collection(ROLES).updateOne(current.id, {
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon ?? current.icon ?? 'Shield',
    permissions: parsed.permissions,
    scopes: parsed.scopes,
    updatedAt: new Date().toISOString(),
  })
  bustRoleCache()
  const fresh = await db.collection(ROLES).findById(current.id)
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
  if (!req.account!.isSuperAdmin && req.account!.role?.id === current.id) {
    res.status(409).json({ error: 'You cannot delete a role you currently hold.' })
    return
  }

  // Unassign FIRST: a link row pointing at a deleted role leaves an admin holding
  // nothing, and no screen shows them as broken.
  const unassigned = await clearRoleEverywhere(current.id)
  await db.collection(ROLES).deleteOne(current.id)
  bustRoleCache()
  res.json({ ok: true, unassigned })
})

// ── Assign / unassign ────────────────────────────────────────────────────────
//
// ONE ROLE PER PERSON: assigning REPLACES whatever they held.
router.post('/:name/assign', requireAssignRoles, async (req, res) => {
  const role = (await getRoles()).get(String(req.params.name))
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
  const target = await findUserById(userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }

  // The SAME guard sequence `POST /api/staff` runs — one operation, two doors.
  const outcome = await grantRoleTo(req.account!, target, role)
  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.error })
    return
  }
  res.status(201).json({ ok: true, role: { name: role.name, label: role.label } })
})

router.delete('/:name/assign/:userId', requireAssignRoles, async (req, res) => {
  const role = (await getRoles()).get(String(req.params.name))
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  const target = await findUserById(String(req.params.userId))
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }

  // `role` is passed as the EXPECTED holding: this door revokes one named role,
  // so a member who now holds something else is a no-op rather than an error —
  // and must not lose whatever they DO hold.
  const outcome = await revokeRoleFrom(req.account!, target, role)
  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.error })
    return
  }
  res.json({ ok: true })
})

export type { RoleDoc }
export default router
