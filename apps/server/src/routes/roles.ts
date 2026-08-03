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
import { db } from '../lib/db.js'
import { attachAccount } from '../lib/auth.js'
import { withIdentityDefaults } from '../lib/identity.js'
import { canManageRoles, canManageTeam } from '../lib/rbac.js'
import {
  SUPERADMIN_SLUG,
  bustRoleCache,
  checkSuperadminLoss,
  denyRoleGrant,
  getRoles,
  projectRole,
  type RoleDoc,
} from '../lib/roleRegistry.js'
import {
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  WORKFLOW_STAGE_CATALOGUE,
  isModuleId,
  isPermissionAction,
  isWorkflowStage,
  type PermissionAction,
} from '../lib/permissionCatalogue.js'
import type { AccountUser } from '../lib/effectiveAccess.js'
import { clearStaffRoleSlug, staffRoleSlugFor } from '../lib/membership.js'

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

router.use((req, res, next) => {
  if (!canManageRoles(req.account) && !canManageTeam(req.account)) {
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

/** How many users hold each role slug. */
async function assigneeCounts(): Promise<Map<string, number>> {
  // P2: only the staff population, via the indexed field — was every user on the
  // platform. One role per person now, so this is a straight tally.
  const staff = await db.collection('users').find({ staffRoleSlug: { $ne: null } })
  const counts = new Map<string, number>()
  for (const u of staff) {
    const slug = String(u.staffRoleSlug)
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  return counts
}

/**
 * Would this change strip the acting user's own ability to manage roles?
 * A superadmin is exempt — they can never lock themselves out.
 *
 * The old version also checked "do any of their OTHER roles still grant
 * roles.manage". That branch is now unreachable by construction: a person holds
 * exactly one staff role (docs/USER-MODEL-PLAN.md §1), so if they hold the role
 * being edited there is no other role to fall back on. Simplified rather than kept,
 * because dead defensive code reads as a live guarantee.
 */
function wouldSelfLockOut(
  actor: AccountUser,
  slug: string,
  nextPermissions: PermissionAction[],
): boolean {
  if (actor.isSuperAdmin) return false
  if (actor.staffRoleSlug !== slug) return false
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
  const [roles, counts] = await Promise.all([getRoles(), assigneeCounts()])
  const out = [...roles.values()]
    .map((r) => ({ ...r, assigneeCount: counts.get(r.slug) ?? 0 }))
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
  const slug = slugify(parsed.label)
  if (!slug) {
    res.status(400).json({ error: 'Role name must contain at least one letter or number.' })
    return
  }
  if (slug === SUPERADMIN_SLUG) {
    res.status(409).json({ error: 'That name is reserved.' })
    return
  }
  if ((await getRoles()).has(slug)) {
    res.status(409).json({ error: 'A role with that name already exists.' })
    return
  }

  const now = new Date().toISOString()
  const id = await db.collection('roles').insertOne({
    slug,
    label: parsed.label,
    description: parsed.description,
    color: parsed.color,
    icon: parsed.icon ?? 'Shield',
    isSystem: false,
    isImmutable: false,
    permissions: parsed.permissions,
    modules: parsed.modules,
    workflowStages: parsed.workflowStages,
    createdBy: req.account!.id,
    createdAt: now,
    updatedAt: now,
  })
  bustRoleCache()
  const created = await db.collection('roles').findById(id)
  res.status(201).json({ role: { ...projectRole(created!), assigneeCount: 0 } })
})

// ── Update ───────────────────────────────────────────────────────────────────
router.put('/:slug', requireDefineRoles, async (req, res) => {
  const current = (await getRoles()).get(String(req.params.slug))
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
  if (wouldSelfLockOut(req.account!, current.slug, parsed.permissions)) {
    res.status(409).json({
      error:
        'That would remove your own ability to manage roles. Grant "Manage roles" to another role you hold first.',
    })
    return
  }

  // The slug is the key stored on every user doc, so renaming a role changes
  // its LABEL only. Re-slugging would orphan every assignment.
  await db.collection('roles').updateOne(current.id, {
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
  const fresh = await db.collection('roles').findById(current.id)
  res.json({ role: projectRole(fresh!) })
})

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:slug', requireDefineRoles, async (req, res) => {
  const current = (await getRoles()).get(String(req.params.slug))
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
  if (!req.account!.isSuperAdmin && req.account!.staffRoles.includes(current.slug)) {
    res.status(409).json({ error: 'You cannot delete a role you currently hold.' })
    return
  }

  // Drop every reference first — a deleted role still listed on user docs would
  // resolve to nothing and silently shrink someone's access.
  const unassigned = await db.collection('users').pullFromAll('staffRoles', current.slug)
  // P1 dual-write: the same cleanup for the scalar axis, or holders would keep a
  // slug pointing at a role that no longer exists.
  await clearStaffRoleSlug(current.slug)
  await db.collection('roles').deleteOne(current.id)
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
router.post('/:slug/assign', requireAssignRoles, async (req, res) => {
  const role = (await getRoles()).get(String(req.params.slug))
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  // Only an existing superadmin may mint another one.
  if (role.slug === SUPERADMIN_SLUG && !req.account!.isSuperAdmin) {
    res.status(403).json({ error: 'Only a superadmin can grant the superadmin role.' })
    return
  }
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : ''
  const target = userId ? await db.collection('users').findById(userId) : null
  if (!target) {
    res.status(404).json({ error: 'Team member not found.' })
    return
  }
  const denied = denyRoleGrant(req.account!, role, userId === req.account!.id)
  if (denied) {
    res.status(403).json({ error: denied })
    return
  }
  const acct = withIdentityDefaults({ id: target._id, ...target })
  const held = acct.staffRoles
  if (held.length === 1 && held[0] === role.slug) {
    res.status(409).json({ error: 'That member already holds this role.' })
    return
  }

  // Replacing a role TAKES AWAY the old one, so the superadmin guard has to fire
  // here too — not only on explicit removal. Without it, "change Mahin to Editor"
  // would quietly delete the only superadmin.
  const blocked = await checkSuperadminLoss(
    req.account!,
    held.includes(SUPERADMIN_SLUG) && role.slug !== SUPERADMIN_SLUG,
  )
  if (blocked) {
    res.status(403).json({ error: blocked })
    return
  }

  // P1 dual-write — same $set as the array, so the two cannot diverge.
  await db
    .collection('users')
    .updateOne(userId, { staffRoles: [role.slug], staffRoleSlug: role.slug })
  res.status(201).json({ ok: true, staffRoles: [role.slug] })
})

router.delete('/:slug/assign/:userId', requireAssignRoles, async (req, res) => {
  const role = (await getRoles()).get(String(req.params.slug))
  if (!role) {
    res.status(404).json({ error: 'Role not found.' })
    return
  }
  const userId = String(req.params.userId)
  const target = await db.collection('users').findById(userId)
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
  const acct = withIdentityDefaults({ id: target._id, ...target })
  const blocked = await checkSuperadminLoss(
    req.account!,
    role.slug === SUPERADMIN_SLUG && acct.staffRoles.includes(SUPERADMIN_SLUG),
  )
  if (blocked) {
    res.status(403).json({ error: blocked })
    return
  }

  await db.collection('users').pullFrom(userId, 'staffRoles', role.slug)
  // P1 dual-write. Clear the scalar only when it is the role being pulled —
  // someone holding a different one keeps it.
  const acctSlug = staffRoleSlugFor(acct.staffRoles)
  if (acctSlug === role.slug) {
    await db.collection('users').updateOne(userId, { staffRoleSlug: null })
  }
  res.json({ ok: true })
})

export type { RoleDoc }
export default router
