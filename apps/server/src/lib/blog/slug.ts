// ---------------------------------------------------------------------------
// Blog slugs.
//
// A slug is a post's public identity, so two rules matter: it must be unique
// among live posts, and it must keep resolving after a rename. The second is
// why `slugHistory` exists — a published post that gets retitled would
// otherwise 404 every link already in the wild.
// ---------------------------------------------------------------------------

import { db } from '../db.js'

const MAX_SLUG_LENGTH = 80

/**
 * Reserved because they collide with real or near-certain routes under /blog.
 * Cheaper to refuse them here than to debug why one post is unreachable.
 */
const RESERVED = new Set(['new', 'edit', 'draft', 'drafts', 'preview', 'feed', 'rss', 'tag', 'tags', 'category', 'author', 'page', 'search'])

/**
 * Latin letters NFKD does NOT decompose, because they are distinct letters
 * rather than a base plus a combining mark. Without this they fall through to
 * the non-alphanumeric rule and become separators — "Straße" slugs as
 * "stra-e". Bloodstock is full of German, Scandinavian and Polish names, so
 * this is a routine case here rather than an exotic one.
 */
const LETTER_FOLDS: Record<string, string> = {
  ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe',
  ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ð: 'd', Ð: 'd',
  ł: 'l', Ł: 'l', þ: 'th', Þ: 'th', ı: 'i', ħ: 'h',
}

const FOLDABLE = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'g')

/**
 * Turn arbitrary text into a URL slug. Diacritics are folded rather than
 * stripped, so "Ascót Gold Cup" becomes "ascot-gold-cup" and not "asct-gold-cup".
 */
export function slugify(input: string): string {
  const base = (input ?? '')
    .replace(FOLDABLE, (ch) => LETTER_FOLDS[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // combining marks left behind by NFKD
    .toLowerCase()
    .replace(/['’]/g, '') // possessives read better closed up: "owner's" → "owners"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '') // the slice may have left a trailing separator

  return base
}

/**
 * A slug that is free, suffixing `-2`, `-3`… until it is.
 *
 * `excludeId` is the post being saved — without it, re-saving a post would
 * always collide with its own stored slug and creep to `-2`, `-3` on every
 * keystroke of an autosave.
 *
 * There is a unique partial index behind this (ensureIndexes), so a race
 * between two concurrent creates still fails loudly at the database rather than
 * silently producing a duplicate. This function makes that outcome rare, not
 * impossible; the route handles the E11000.
 */
export async function uniqueSlug(desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired) || 'post'
  const candidate = RESERVED.has(base) ? `${base}-post` : base

  // Only the slugs that could actually collide — `base`, and anything of the
  // form `base-<n>`. Loading the whole collection to build this set is the
  // "load everything" pattern the scalability review already flagged elsewhere,
  // and it would run on every autosave.
  //
  // `candidate` is the output of slugify(), so it is [a-z0-9-] only and needs no
  // regex escaping; the anchor and the explicit suffix shape keep this served by
  // the slug index rather than scanning.
  const prefix = { $regex: `^${candidate}(-[0-9]+)?$` }
  const existing = await db.collection('blogs').find({
    $or: [{ slug: prefix }, { slugHistory: prefix }],
  })

  const taken = new Set<string>()
  for (const doc of existing) {
    if (excludeId && doc._id === excludeId) continue
    if (typeof doc.slug === 'string') taken.add(doc.slug)
    // A previous slug still routes to its post, so it is just as taken.
    if (Array.isArray(doc.slugHistory)) {
      for (const old of doc.slugHistory) if (typeof old === 'string') taken.add(old)
    }
  }

  if (!taken.has(candidate)) return candidate
  for (let n = 2; n < 500; n++) {
    const next = `${candidate}-${n}`
    if (!taken.has(next)) return next
  }
  // Practically unreachable; better than looping forever.
  return `${candidate}-${Date.now()}`
}

/**
 * Fold a slug change into the history.
 *
 * Only a slug that was ever PUBLIC is worth keeping — a draft's slug has never
 * been linked anywhere, so recording it would just clutter the uniqueness set
 * and reserve names nobody can use.
 */
export function nextSlugHistory(
  history: unknown,
  previousSlug: string | undefined,
  nextSlug: string,
  wasPublished: boolean,
): string[] {
  const prior = Array.isArray(history) ? history.filter((s): s is string => typeof s === 'string') : []
  if (!wasPublished) return prior
  if (!previousSlug || previousSlug === nextSlug) return prior
  if (prior.includes(previousSlug)) return prior
  return [...prior, previousSlug]
}
