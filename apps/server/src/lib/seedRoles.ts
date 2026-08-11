
import { db } from './db.js'
import {
  BUILTIN_ROLE_LABELS,
  BUILTIN_ROLE_PERMISSIONS,
  BUILTIN_ROLE_SCOPES,
  PERMISSION_CATALOGUE,
  SCOPED_SCREENS,
  type RoleScopes,
} from './permissionCatalogue.js'
import { ROLES, SUPERADMIN_ROLE_NAME, bustRoleCache } from './roleRegistry.js'
import type { SeedRoleName } from './permissionCatalogue.js'

/**
 * Per-role presentation. `workflowStages` used to live here; it is derived now
 * (anyone who can open the board sees every column), so a seeded role no longer
 * carries a third list that could disagree with the first two. Icons are lucide
 * NAMES, not components.
 */
const SEED_PRESENTATION: Record<SeedRoleName, { description: string; color: string; icon: string }> =
  {
    contributor: {
      description: 'Write stories and posts — their own work only',
      color: 'hsl(var(--chart-1))',
      icon: 'FileText',
    },
    editor: {
      description: 'Runs the desk: everyone’s work, publishing and the queues',
      color: 'hsl(var(--primary))',
      icon: 'CheckSquare',
    },
    administrator: {
      description: 'Full platform access',
      color: 'hsl(var(--primary))',
      icon: 'Star',
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
  scopes: RoleScopes
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
    scopes: Object.fromEntries(SCOPED_SCREENS.map((s) => [s, 'all' as const])),
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
      scopes: { ...BUILTIN_ROLE_SCOPES[name] },
    }
  })

  return [superadmin, ...builtins]
}

/**
 * Insert any missing seed role. Never updates an existing one.
 * Returns the slugs actually created. Safe to call on every boot.
 */
export async function seedRoles(): Promise<string[]> {
  const existing = await db.collection(ROLES).find()
  const have = new Set(existing.map((r) => String(r.name)))
  const now = new Date().toISOString()
  const created: string[] = []

  for (const role of seedRoleDefinitions()) {
    if (have.has(role.name)) continue
    await db.collection(ROLES).insertOne({ ...role, createdAt: now, updatedAt: now })
    created.push(role.name)
  }

  if (created.length > 0) {
    bustRoleCache()
    console.log(`[rbac] seeded ${created.length} role(s): ${created.join(', ')}`)
  }
  return created
}
