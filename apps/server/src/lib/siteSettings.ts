// ---------------------------------------------------------------------------
// Website customisation — which public sections the site shows.
//
// ONE document, `siteSettings/site`, holding one boolean per public nav section.
// Six sections, matching NAV_SECTIONS in apps/web/src/components/navbar/config.tsx
// and PUBLIC_NAV_SECTIONS in apps/web/src/types/siteSettings.ts. That mirror is
// deliberate — there is no shared package in this repo, so the same list exists
// on both sides the way MODULE_CATALOGUE mirrors SIDE_NAV. Add a section in all
// three places or it will not appear.
//
// DEFAULT IS ON. An absent document, an absent key, or a non-boolean value all
// read as visible — a settings row that has never been written must never take a
// section off the public site.
//
// Turning a section off hides it from the navbar AND takes its public pages out
// of the router (the client redirects them home). It does not unpublish anything:
// the stories, posts and episodes stay exactly where they are and come back the
// moment the section is switched on.
// ---------------------------------------------------------------------------

import { db } from './db.js'

export const PUBLIC_NAV_KEYS = ['news', 'blog', 'horses', 'directory', 'podcast', 'bulletins'] as const

export type PublicNavKey = (typeof PUBLIC_NAV_KEYS)[number]

/** One boolean per section. Always complete — `normalisePublicNav` fills the gaps. */
export type PublicNavVisibility = Record<PublicNavKey, boolean>

export const DEFAULT_PUBLIC_NAV: PublicNavVisibility = {
  news: true,
  blog: true,
  horses: true,
  directory: true,
  podcast: true,
  bulletins: true,
}

/** The singleton row. A fixed `_id` so there can only ever be one. */
const SETTINGS_ID = 'site'
const COLLECTION = 'siteSettings'

function isNavKey(v: unknown): v is PublicNavKey {
  return typeof v === 'string' && (PUBLIC_NAV_KEYS as readonly string[]).includes(v)
}

/**
 * Coerce anything into a complete visibility map. Unknown keys are dropped and
 * missing ones default to `true`, so a stored document written by an older (or
 * newer) build can never hide a section this build knows about.
 */
export function normalisePublicNav(raw: unknown): PublicNavVisibility {
  const source = (raw ?? {}) as Record<string, unknown>
  const out = { ...DEFAULT_PUBLIC_NAV }
  for (const key of Object.keys(source)) {
    if (!isNavKey(key)) continue
    // Only an explicit `false` hides a section. Anything else — a string, a
    // null left by a bad write — falls back to visible.
    out[key] = source[key] !== false
  }
  return out
}

/** The current map. Never throws a missing document at the caller. */
export async function readPublicNav(): Promise<PublicNavVisibility> {
  const doc = await db.collection(COLLECTION).findById(SETTINGS_ID)
  return normalisePublicNav(doc?.publicNav)
}

/**
 * Persist a full map, creating the singleton on first write. Returns what is now
 * stored, re-normalised, so the caller echoes back the truth rather than what it
 * sent.
 */
export async function writePublicNav(
  next: PublicNavVisibility,
  actorId: string | undefined,
): Promise<PublicNavVisibility> {
  const publicNav = normalisePublicNav(next)
  const now = new Date().toISOString()
  const existing = await db.collection(COLLECTION).findById(SETTINGS_ID)
  if (existing) {
    await db.collection(COLLECTION).updateOne(SETTINGS_ID, {
      publicNav,
      updatedAt: now,
      updatedBy: actorId ?? null,
    })
  } else {
    try {
      await db.collection(COLLECTION).insertOne({
        _id: SETTINGS_ID,
        publicNav,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        updatedBy: actorId ?? null,
      })
    } catch {
      // Two first-writes raced; the loser updates the row the winner created
      // rather than failing the request on a duplicate key.
      await db.collection(COLLECTION).updateOne(SETTINGS_ID, {
        publicNav,
        updatedAt: now,
        updatedBy: actorId ?? null,
      })
    }
  }
  return readPublicNav()
}
