// ---------------------------------------------------------------------------
// Boot seed for the `roles` collection.
//
// Creates the immutable `superadmin` role plus the default staff roles, with
// permissions and modules DERIVED from the catalogue (rather than retyped) so
// the seed cannot drift from the matrix it replaces.
//
// INSERT-ONLY and idempotent: a role that already exists is left completely
// alone. That is the whole contract — once a superadmin edits a seeded role, a
// redeploy must never quietly revert their change.
//
// See docs/DYNAMIC-RBAC-PLAN.md §3, Phase 0.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import {
  ALL_WORKFLOW_STAGES,
  BUILTIN_ROLE_LABELS,
  BUILTIN_ROLE_PERMISSIONS,
  MODULE_CATALOGUE,
  PERMISSION_CATALOGUE,
  builtinModulesFor,
} from './permissionCatalogue.js'
import { SUPERADMIN_SLUG, bustRoleCache } from './roleRegistry.js'
import type { SeedRoleSlug } from './permissionCatalogue.js'

/**
 * Per-role presentation + workflow visibility, lifted verbatim from the static
 * `ROLES` config in apps/web/src/pages/newsroom/constants.tsx. `workflowStages`
 * was `allowedStatuses` there. Icons are lucide NAMES, not components.
 */
const SEED_PRESENTATION: Record<
  SeedRoleSlug,
  { description: string; color: string; icon: string; workflowStages: string[] }
> = {
  contributor: {
    description: 'Draft & submit stories',
    color: 'hsl(var(--chart-1))',
    icon: 'FileText',
    workflowStages: ['draft', 'submitted', 'revision'],
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
  slug: string
  label: string
  description: string
  color: string
  icon: string
  isSystem: boolean
  isImmutable: boolean
  permissions: string[]
  modules: string[]
  workflowStages: string[]
}

/** The roles a fresh install starts with. */
export function seedRoleDefinitions(): SeedRole[] {
  const superadmin: SeedRole = {
    slug: SUPERADMIN_SLUG,
    label: 'Superadmin',
    description: 'Unrestricted access to every module and action. Cannot be edited or deleted.',
    color: 'hsl(var(--brand-accent))',
    icon: 'ShieldCheck',
    isSystem: true,
    isImmutable: true,
    // Materialised for display only. Enforcement short-circuits in accountCan()
    // BEFORE any lookup, so superadmin survives an empty or corrupt collection.
    permissions: PERMISSION_CATALOGUE.map((p) => p.id),
    modules: MODULE_CATALOGUE.map((m) => m.id),
    workflowStages: ALL_WORKFLOW_STAGES,
  }

  const builtins = (Object.keys(BUILTIN_ROLE_LABELS) as SeedRoleSlug[]).map((slug) => {
    const meta = SEED_PRESENTATION[slug]
    return {
      slug,
      label: BUILTIN_ROLE_LABELS[slug],
      description: meta.description,
      color: meta.color,
      icon: meta.icon,
      isSystem: true,
      isImmutable: false, // seeded, but a superadmin may edit these
      permissions: [...BUILTIN_ROLE_PERMISSIONS[slug]],
      modules: builtinModulesFor(slug),
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
  const existing = await db.collection('roles').find()
  const have = new Set(existing.map((r) => String(r.slug)))
  const now = new Date().toISOString()
  const created: string[] = []

  for (const role of seedRoleDefinitions()) {
    if (have.has(role.slug)) continue
    await db.collection('roles').insertOne({ ...role, createdAt: now, updatedAt: now })
    created.push(role.slug)
  }

  if (created.length > 0) {
    bustRoleCache()
    console.log(`[rbac] seeded ${created.length} role(s): ${created.join(', ')}`)
  }
  return created
}
