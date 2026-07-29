// ---------------------------------------------------------------------------
// The role registry — DB-defined roles, plus the in-process cache that makes
// them free to read.
//
// Roles used to be a TypeScript union, so a permission check cost nothing. Now
// they are rows, and a naive implementation would add a database round trip to
// EVERY authenticated request. This module is the answer: one cached
// Map<slug, RoleDoc>, refreshed on a TTL and busted explicitly whenever a role
// is mutated. `attachAccount` resolves permissions out of that map, so the
// request path stays allocation-cheap and does no extra I/O.
//
// Staleness bound: an explicit bust makes a change instant on the instance that
// made it; other instances converge within CACHE_TTL_MS. That is acceptable
// while the API runs single-instance (see docs/MAGAZINE-V2-SCALABILITY-REVIEW.md);
// a horizontally-scaled deployment would want a pub/sub invalidation instead.
//
// See docs/DYNAMIC-RBAC-PLAN.md §1.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import {
  isModuleId,
  isPermissionAction,
  isWorkflowStage,
  type PermissionAction,
} from './permissionCatalogue.js'

/** The immutable, all-access role. Never resolved through the DB. */
export const SUPERADMIN_SLUG = 'superadmin'

export interface RoleDoc {
  id: string
  slug: string
  label: string
  description?: string
  color?: string
  /** A lucide icon NAME (e.g. 'Shield'). Components can't cross the wire. */
  icon?: string
  /** Seeded role — protected from deletion. */
  isSystem: boolean
  /** Superadmin only — protected from any edit. */
  isImmutable: boolean
  permissions: PermissionAction[]
  modules: string[]
  workflowStages: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** Normalize a raw Mongo doc, dropping ids the catalogue no longer knows. */
export function projectRole(doc: Record<string, any>): RoleDoc {
  return {
    id: String(doc._id ?? doc.id ?? ''),
    slug: String(doc.slug ?? ''),
    label: String(doc.label ?? ''),
    description: doc.description ? String(doc.description) : undefined,
    color: doc.color ? String(doc.color) : undefined,
    icon: doc.icon ? String(doc.icon) : undefined,
    isSystem: doc.isSystem === true,
    isImmutable: doc.isImmutable === true,
    permissions: Array.isArray(doc.permissions) ? doc.permissions.filter(isPermissionAction) : [],
    modules: Array.isArray(doc.modules) ? doc.modules.filter(isModuleId) : [],
    workflowStages: Array.isArray(doc.workflowStages)
      ? doc.workflowStages.filter(isWorkflowStage)
      : [],
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    createdAt: String(doc.createdAt ?? ''),
    updatedAt: String(doc.updatedAt ?? ''),
  }
}

// ── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000

let cache: Map<string, RoleDoc> | null = null
let cachedAt = 0
/** In-flight load, so a burst of concurrent requests triggers ONE query. */
let inflight: Promise<Map<string, RoleDoc>> | null = null

/** Drop the cache. Call after every write to the roles collection. */
export function bustRoleCache(): void {
  cache = null
  cachedAt = 0
  inflight = null
}

async function loadRoles(): Promise<Map<string, RoleDoc>> {
  const docs = await db.collection('roles').find()
  const map = new Map<string, RoleDoc>()
  for (const doc of docs) {
    const role = projectRole(doc)
    if (role.slug) map.set(role.slug, role)
  }
  cache = map
  cachedAt = Date.now()
  inflight = null
  return map
}

/** Every role, keyed by slug. Served from cache unless stale. */
export function getRoles(): Promise<Map<string, RoleDoc>> {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return Promise.resolve(cache)
  // Collapse concurrent misses onto a single load.
  if (!inflight) inflight = loadRoles()
  return inflight
}

export async function getRole(slug: string): Promise<RoleDoc | undefined> {
  return (await getRoles()).get(slug)
}

/** Resolve a list of slugs to role docs, silently dropping unknown ones. */
export async function rolesForSlugs(slugs: string[]): Promise<RoleDoc[]> {
  if (slugs.length === 0) return []
  const all = await getRoles()
  const out: RoleDoc[] = []
  for (const slug of slugs) {
    const role = all.get(slug)
    if (role) out.push(role)
  }
  return out
}
