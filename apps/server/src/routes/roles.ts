// ---------------------------------------------------------------------------
// Custom roles — admin-defined, checkbox-configured roles.
//
// An admin creates a role, ticks the modules it can open and the actions it may
// perform, and assigns it to team members. Roles layer ON TOP of the six
// built-in staff roles: a member keeps whatever their staff role grants and the
// custom role adds to it. Nothing here can take a permission away.
//
// SCOPE: custom roles currently drive NAVIGATION and UI affordances. The API
// gates still enforce the built-in matrix (see lib/effectiveAccess.ts for why
// the two are kept apart). Assigning a custom role to someone with no staff role
// therefore does nothing yet — the UI says so at the point of assignment.
// ---------------------------------------------------------------------------

import { Router } from 'express'
import { db } from '../lib/db.js'
import { attachAccount } from '../lib/auth.js'
import { withIdentityDefaults } from '../lib/identity.js'
import { canManageRoles } from '../lib/rbac.js'
import type { CustomRole } from '../lib/effectiveAccess.js'
import {
  BUILTIN_ROLE_LABELS,
  BUILTIN_ROLE_PERMISSIONS,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  builtinModulesFor,
  isModuleId,
  isPermissionAction,
  type PermissionAction,
} from '../lib/permissionCatalogue.js'

const router = Router()

router.use(attachAccount)
router.use((req, res, next) => {
  if (!canManageRoles(req.account)) {
    res.status(403).json({ error: 'You do not have permission to manage roles.' })
    return
  }
  next()
})

type RoleDoc = Record<string, any> & { _id: string }

function projectRole(doc: RoleDoc): CustomRole {
  return {
    id: String(doc._id),
    key: String(doc.key ?? ''),
    label: String(doc.label ?? ''),
    description: doc.description ? String(doc.description) : undefined,
    color: doc.color ? String(doc.color) : undefined,
    permissions: Array.isArray(doc.permissions) ? doc.permissions.filter(isPermissionAction) : [],
    modules: Array.isArray(doc.modules) ? doc.modules.filter(isModuleId) : [],
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    createdAt: String(doc.createdAt ?? ''),
    updatedAt: String(doc.updatedAt ?? ''),
  }
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

/** Validate + normalize the writable body of a role. */
function readRoleBody(body: unknown): { label: string; description?: string; color?: string; permissions: PermissionAction[]; modules: string[] } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const label = typeof b.label === 'string' ? b.label.trim() : ''
  if (!label) return { error: 'A role name is required.' }
  if (label.length > 60) return { error: 'Role name must be 60 characters or fewer.' }

  // Unknown ids are dropped rather than rejected: the catalogue can gain and
  // lose entries between deploys, and a stale checkbox shouldn't 400 the save.
  const permissions = Array.isArray(b.permissions) ? b.permissions.filter(isPermissionAction) : []
  const modules = Array.isArray(b.modules) ? b.modules.filter(isModuleId) : []

  return {
    label,
    description: typeof b.description === 'string' && b.description.trim() ? b.description.trim().slice(0, 240) : undefined,
    color: typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : undefined,
    permissions,
    modules,
  }
}

// ── The catalogue the admin UI renders checkboxes from ───────────────────────
router.get('/catalogue', (_req, res) => {
  res.json({
    permissions: PERMISSION_CATALOGUE,
    modules: MODULE_CATALOGUE,
    builtinRoles: (Object.keys(BUILTIN_ROLE_LABELS) as Array<keyof typeof BUILTIN_ROLE_LABELS>).map(
      (key) => ({
        key,
        label: BUILTIN_ROLE_LABELS[key],
        permissions: BUILTIN_ROLE_PERMISSIONS[key],
        modules: builtinModulesFor(key),
      }),
    ),
  })
})

// ── List custom roles, with how many people hold each ────────────────────────
router.get('/', async (_req, res) => {
  const docs = (await db.collection('customRoles').find()) as RoleDoc[]
  const users = await db.collection('users').find()
  const counts = new Map<string, number>()
  for (const u of users) {
    for (const id of Array.isArray(u.customRoleIds) ? u.customRoleIds : []) {
      counts.set(String(id), (counts.get(String(id)) ?? 0) + 1)
    }
  }
  const roles = docs
    .map(projectRole)
    .map((r) => ({ ...r, assigneeCount: counts.get(r.id) ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label))
  res.json({ roles })
})

// ── Create ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const parsed = readRoleBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const key = slugify(parsed.label)
  if (!key) {
    res.status(400).json({ error: 'Role name must contain at least one letter or number.' })
    return
  }
  const existing = (await db.collection('customRoles').find({ key })) as RoleDoc[]
  if (existing.length > 0) {
    res.status(409).json({ error: 'A role with that name already exists.' })
    return
  }

  const now = new Date().toISOString()
  const id = await db.collection('customRoles').insertOne({
    key,
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    permissions: parsed.permissions,
    modules: parsed.modules,
    createdBy: req.account!.id,
    createdAt: now,
    updatedAt: now,
  })
  const created = (await db.collection('customRoles').findById(id)) as RoleDoc | null
  res.status(201).json({ role: { ...projectRole(created!), assigneeCount: 0 } })
})

// ── Update (label + description + colour + both checkbox sets) ───────────────
router.put('/:id', async (req, res) => {
  const current = (await db.collection('customRoles').findById(req.params.id)) as RoleDoc | null
  if (!current) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  const parsed = readRoleBody(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const key = slugify(parsed.label)
  const clash = ((await db.collection('customRoles').find({ key })) as RoleDoc[]).filter(
    (r) => String(r._id) !== String(current._id),
  )
  if (clash.length > 0) {
    res.status(409).json({ error: 'A role with that name already exists.' })
    return
  }

  await db.collection('customRoles').updateOne(req.params.id, {
    key,
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    permissions: parsed.permissions,
    modules: parsed.modules,
    updatedAt: new Date().toISOString(),
  })
  const fresh = (await db.collection('customRoles').findById(req.params.id)) as RoleDoc | null
  res.json({ role: projectRole(fresh!) })
})

// ── Delete — also unassigns it from everyone holding it ──────────────────────
router.delete('/:id', async (req, res) => {
  const current = await db.collection('customRoles').findById(req.params.id)
  if (!current) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  // Drop the reference first: a role that is deleted but still listed on user
  // docs would resolve to nothing and quietly shrink someone's navigation.
  const unassigned = await db.collection('users').pullFromAll('customRoleIds', req.params.id)
  await db.collection('customRoles').deleteOne(req.params.id)
  res.json({ ok: true, unassigned })
})

// ── Assign / unassign to a team member ───────────────────────────────────────
router.post('/:id/assign', async (req, res) => {
  const role = await db.collection('customRoles').findById(req.params.id)
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
  const target = userId ? await db.collection('users').findById(userId) : null
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  const acct = withIdentityDefaults({ id: target._id, ...target })
  if (acct.customRoleIds.includes(req.params.id)) {
    res.status(409).json({ error: 'That member already holds this role.' })
    return
  }
  // $addToSet, not read-modify-write — two admins assigning at once must not
  // clobber each other.
  await db.collection('users').addToSet(userId, 'customRoleIds', req.params.id)
  res.status(201).json({ ok: true })
})

router.delete('/:id/assign/:userId', async (req, res) => {
  const target = await db.collection('users').findById(req.params.userId)
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  await db.collection('users').pullFrom(req.params.userId, 'customRoleIds', req.params.id)
  res.json({ ok: true })
})

export default router
