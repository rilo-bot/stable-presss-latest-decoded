
import { db } from './db.js'
import {
  ALL_WORKFLOW_STAGES,
  BUILTIN_ROLE_LABELS,
  BUILTIN_ROLE_PERMISSIONS,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  builtinModulesFor,
} from './permissionCatalogue.js'
import { ADMIN_ROLES, SUPERADMIN_ROLE_NAME, bustRoleCache } from './roleRegistry.js'
import type { SeedRoleName } from './permissionCatalogue.js'

/**
 * Per-role presentation + workflow visibility, lifted verbatim from the static
 * `ROLES` config in apps/web/src/pages/newsroom/constants.tsx. `workflowStages`
 * was `allowedStatuses` there. Icons are lucide NAMES, not components.
 */
const SEED_PRESENTATION: Record<
  SeedRoleName,
  { description: string; color: string; icon: string; workflowStages: string[] }
> = {
  contributor: {
    description: 'Draft & submit stories',
    color: 'hsl(var(--chart-1))',
    icon: 'FileText',
    // A contributor sees their own work up to the point it leaves their hands.
    // 'revision' is gone — a sent-back story is a Draft carrying a
    // `changesRequested` flag, so it shows up in the Draft column.
    workflowStages: ['draft', 'submitted'],
  },
  editor: {
    description: 'Full editorial control',
    color: 'hsl(var(--primary))',
    icon: 'CheckSquare',
    workflowStages: ALL_WORKFLOW_STAGES,
  },
  administrator: {
    description: 'Full platform access',
    color: 'hsl(var(--primary))',
    icon: 'Star',
    workflowStages: ALL_WORKFLOW_STAGES,
  },
}

interface SeedRole {
  name: string
  label: string
  description: string
  color: string
  icon: string
  isSystem: boolean
  isImmutable: boolean
  /** Unrestricted access. A field now, not a name comparison — see RoleDoc.isSuper. */
  isSuper: boolean
  permissions: string[]
  modules: string[]
  workflowStages: string[]
}

/** The roles a fresh install starts with. */
export function seedRoleDefinitions(): SeedRole[] {
  const superadmin: SeedRole = {
    name: SUPERADMIN_ROLE_NAME,
    label: 'Superadmin',
    description: 'Unrestricted access to every module and action. Cannot be edited or deleted.',
    color: 'hsl(var(--brand-accent))',
    icon: 'ShieldCheck',
    isSystem: true,
    isImmutable: true,
    isSuper: true,
    // Materialised for display only. Enforcement short-circuits in accountCan()
    // BEFORE any lookup, so superadmin survives an empty or corrupt collection.
    permissions: PERMISSION_CATALOGUE.map((p) => p.id),
    modules: MODULE_CATALOGUE.map((m) => m.id),
    workflowStages: ALL_WORKFLOW_STAGES,
  }

  const builtins = (Object.keys(BUILTIN_ROLE_LABELS) as SeedRoleName[]).map((name) => {
    const meta = SEED_PRESENTATION[name]
    return {
      name,
      label: BUILTIN_ROLE_LABELS[name],
      description: meta.description,
      color: meta.color,
      icon: meta.icon,
      isSystem: true,
      isImmutable: false, // seeded, but a superadmin may edit these
      isSuper: false,
      permissions: [...BUILTIN_ROLE_PERMISSIONS[name]],
      modules: builtinModulesFor(name),
      workflowStages: [...meta.workflowStages],
    }
  })

  return [superadmin, ...builtins]
}

/**
 * Insert any missing seed role. Never updates an existing one.
 * Returns the slugs actually created. Safe to call on every boot.
 */
export async function seedRoles(): Promise<string[]> {
  const existing = await db.collection(ADMIN_ROLES).find()
  const have = new Set(existing.map((r) => String(r.name)))
  const now = new Date().toISOString()
  const created: string[] = []

  for (const role of seedRoleDefinitions()) {
    if (have.has(role.name)) continue
    await db.collection(ADMIN_ROLES).insertOne({ ...role, createdAt: now, updatedAt: now })
    created.push(role.name)
  }

  if (created.length > 0) {
    bustRoleCache()
    console.log(`[rbac] seeded ${created.length} role(s): ${created.join(', ')}`)
  }
  return created
}
