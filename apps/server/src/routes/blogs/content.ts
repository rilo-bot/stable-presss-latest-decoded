// ---------------------------------------------------------------------------
// Request body → storable post shape.
//
// Everything a client sends about a post's CONTENT is normalised here, so both
// create and update go through one implementation. The media pool is normalised
// FIRST and every other reference (blocks, cover, thumbnail, OG image) is
// validated against the ids it produces — which is what makes a dangling
// reference unable to reach the database at all.
// ---------------------------------------------------------------------------

import {
  deriveExcerpt,
  normaliseBlocks,
  normaliseMedia,
  normaliseParts,
  partsBlocks,
  readingTimeFor,
  type Block,
  type BlogMedia,
  type BlogPart,
} from '../../lib/blog/blocks.js'
import { optStr, str, strArray } from './helpers.js'

interface AuthorInput {
  name?: unknown
  partyId?: unknown
  userId?: unknown
  avatarUrl?: unknown
  bio?: unknown
}

/** "Blog by" — free text, so a pen name works, optionally bound to a Party. */
function normaliseAuthor(v: unknown, fallbackName: string): Record<string, unknown> {
  const raw = (v ?? {}) as AuthorInput
  const author: Record<string, unknown> = {
    name: optStr(raw.name, 120) ?? fallbackName,
  }
  const partyId = optStr(raw.partyId, 64)
  if (partyId) author.partyId = partyId
  const userId = optStr(raw.userId, 64)
  if (userId) author.userId = userId
  const avatarUrl = optStr(raw.avatarUrl, 500_000)
  if (avatarUrl) author.avatarUrl = avatarUrl
  const bio = optStr(raw.bio, 1000)
  if (bio) author.bio = bio
  return author
}

// Mirrors COVER_TREATMENTS in apps/web/src/types/blog.ts — see the doc comment
// there for what each one looks like. `side` is the default and must stay first.
const COVER_TREATMENTS = ['side', 'hero-full', 'hero-split', 'inset', 'none'] as const

function normaliseCover(v: unknown, poolIds: Set<string>): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as Record<string, unknown>
  const mediaId = optStr(raw.mediaId, 64)
  if (!mediaId || !poolIds.has(mediaId)) return undefined
  const treatment = (COVER_TREATMENTS as readonly unknown[]).includes(raw.treatment)
    ? (raw.treatment as string)
    : 'side'
  const cover: Record<string, unknown> = { mediaId, treatment }
  if (Array.isArray(raw.focal) && raw.focal.length === 2) {
    const [x, y] = raw.focal
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      cover.focal = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]
    }
  }
  return cover
}

function normaliseSeo(v: unknown, poolIds: Set<string>): Record<string, unknown> {
  const raw = (v ?? {}) as Record<string, unknown>
  const seo: Record<string, unknown> = {}
  const metaTitle = optStr(raw.metaTitle, 200)
  if (metaTitle) seo.metaTitle = metaTitle
  const metaDescription = optStr(raw.metaDescription, 400)
  if (metaDescription) seo.metaDescription = metaDescription
  const ogMediaId = optStr(raw.ogMediaId, 64)
  if (ogMediaId && poolIds.has(ogMediaId)) seo.ogMediaId = ogMediaId
  const canonicalUrl = optStr(raw.canonicalUrl, 500)
  if (canonicalUrl && /^https?:\/\//i.test(canonicalUrl)) seo.canonicalUrl = canonicalUrl
  if (raw.noindex === true) seo.noindex = true
  return seo
}

export interface BuiltContent {
  media: BlogMedia[]
  blocks: Block[]
  /**
   * The normalised parts, or undefined when the request said nothing about them
   * — see below. `fields` carries the key only in the first case.
   */
  parts?: BlogPart[]
  dropped: number
  fields: Record<string, unknown>
}

/**
 * Build the storable shape from a request body. The media pool is normalised
 * FIRST because every other reference — blocks, cover, thumbnail, OG image —
 * is validated against the ids it produces, so a dangling reference can never
 * reach the database.
 *
 * `parts` is the one field that is only written when the caller SENT it. Every
 * other field here is authoritative, because the composer always sends the whole
 * post; parts cannot be, because other writers of this endpoint don't know about
 * them — the blog studio's `saveFull` (apps/web/src/agent/blog/blogToolExecutor.ts)
 * rebuilds a full payload from a post it loaded, and an AI copy-edit through it
 * would otherwise silently delete every part of the post it was asked to improve.
 */
export function buildContent(body: Record<string, unknown>, fallbackAuthor: string): BuiltContent {
  const media = normaliseMedia(body.media)
  const poolIds = new Set(media.map((m) => m.id))
  const { blocks, dropped } = normaliseBlocks(body.blocks, media)

  const sentParts = body.parts !== undefined
  const normalisedParts = sentParts ? normaliseParts(body.parts, media) : null

  const fields: Record<string, unknown> = {
    title: str(body.title, 300).trim(),
    author: normaliseAuthor(body.author, fallbackAuthor),
    tags: strArray(body.tags),
    linkedHorseIds: strArray(body.linkedHorseIds, 50, 64),
    linkedPartyIds: strArray(body.linkedPartyIds, 50, 64),
    seo: normaliseSeo(body.seo, poolIds),
    // Parts are read as part of the post, so they count towards the estimate. A
    // caller that didn't send parts doesn't know the stored ones, so the reading
    // time it would compute is wrong — the PUT handler recomputes it from the
    // stored parts in that case.
    readingTime: readingTimeFor([...blocks, ...partsBlocks(normalisedParts?.parts)]),
  }
  if (normalisedParts) fields.parts = normalisedParts.parts

  const subtitle = optStr(body.subtitle, 300)
  if (subtitle) fields.subtitle = subtitle
  else fields.subtitle = ''

  // An author who clears the excerpt gets one derived rather than an empty card.
  fields.excerpt = optStr(body.excerpt, 500) ?? deriveExcerpt(blocks)

  const category = optStr(body.category, 80)
  fields.category = category ?? ''

  const cover = normaliseCover(body.cover, poolIds)
  if (cover) fields.cover = cover
  else fields.cover = null

  const thumbnailMediaId = optStr(body.thumbnailMediaId, 64)
  fields.thumbnailMediaId = thumbnailMediaId && poolIds.has(thumbnailMediaId) ? thumbnailMediaId : null


  return {
    media,
    blocks,
    ...(normalisedParts ? { parts: normalisedParts.parts } : {}),
    dropped: dropped + (normalisedParts?.dropped ?? 0),
    fields,
  }
}
