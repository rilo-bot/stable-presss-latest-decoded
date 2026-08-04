// ---------------------------------------------------------------------------
// Blog block model — THE authority.
//
// Mirrors `apps/web/src/types/blog.ts`. The browser has its own copy so the
// composer can build blocks without a round-trip, but nothing it sends is
// trusted: every write goes through `normaliseBlocks` here, which drops unknown
// kinds, clamps every enum to a known value, sanitizes all rich text, and
// severs references to media that is not in the post's pool.
//
// This matters more than the usual "validate your input" reason. The AI phase
// (BLOG-SYSTEM-PLAN §6) has an agent emit a Block[] directly, and it runs
// through this same function — so a generated post can never persist a shape a
// hand-authored one couldn't. The validator is the seam that makes the AI layer
// safe to add later without revisiting any of this.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import { sanitizeBlogInline } from '../sanitizeHtml.js'

// ── Enums (mirrored from the web copy) ──────────────────────────────────────

export const BLOG_STATUSES = ['draft', 'published'] as const
export type BlogStatus = (typeof BLOG_STATUSES)[number]

export const BLOG_MEDIA_KINDS = ['image', 'video', 'file'] as const
export type BlogMediaKind = (typeof BLOG_MEDIA_KINDS)[number]

const PLACEMENT_WIDTHS = ['inline', 'wide', 'full-bleed'] as const
const PLACEMENT_FLOATS = ['none', 'left', 'right'] as const
const PLACEMENT_FLOAT_WIDTHS = ['1/3', '1/2'] as const
const PLACEMENT_ALIGNS = ['left', 'center', 'right'] as const
const CAPTION_POSITIONS = ['below', 'overlay', 'side'] as const
const PLACEMENT_ASPECTS = ['original', '16:9', '4:3', '1:1', '3:4'] as const

const HEADING_LEVELS = [2, 3, 4] as const
const QUOTE_STYLES = ['pull', 'block'] as const
const CALLOUT_TONES = ['info', 'tip', 'warning'] as const
const DIVIDER_STYLES = ['rule', 'ornament', 'space'] as const
const GALLERY_LAYOUTS = ['grid', 'masonry', 'carousel', 'filmstrip'] as const
const GALLERY_COLUMNS = [2, 3, 4] as const
const EMBED_PROVIDERS = ['youtube', 'vimeo', 'x', 'spotify'] as const
const EMBED_RATIOS = ['16:9', '1:1', '4:5'] as const

export interface Placement {
  width: (typeof PLACEMENT_WIDTHS)[number]
  float: (typeof PLACEMENT_FLOATS)[number]
  floatWidth?: (typeof PLACEMENT_FLOAT_WIDTHS)[number]
  align: (typeof PLACEMENT_ALIGNS)[number]
  captionPosition: (typeof CAPTION_POSITIONS)[number]
  aspect: (typeof PLACEMENT_ASPECTS)[number]
}

export const DEFAULT_PLACEMENT: Placement = {
  width: 'inline',
  float: 'none',
  align: 'center',
  captionPosition: 'below',
  aspect: 'original',
}

export interface BlogMedia {
  id: string
  url: string
  key?: string
  kind: BlogMediaKind
  filename: string
  contentType: string
  width?: number
  height?: number
  bytes?: number
  alt: string
  caption?: string
  credit?: string
  uploadedAt: string
  uploadedByUserId?: string
}

// The block union is structurally identical to the web copy; it is restated
// rather than imported because the two apps do not share a package (the same
// arrangement types/article.ts and lib/workflow.ts already use).
export interface Block {
  id: string
  kind: string
  [key: string]: unknown
}

// ── Primitive coercion ──────────────────────────────────────────────────────

/** Pick `v` if it is one of `allowed`, else `fallback`. */
function oneOf<T extends readonly unknown[]>(v: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(v as T[number]) ? (v as T[number]) : fallback
}

function str(v: unknown, max = 5000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/** An optional string: undefined when absent or blank, so `?? fallback` works. */
function optStr(v: unknown, max = 5000): string | undefined {
  const s = str(v, max).trim()
  return s.length > 0 ? s : undefined
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** A 0..1 focal pair, or undefined if it isn't one. */
function focal(v: unknown): [number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const [x, y] = v
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]
}

/**
 * A safe outbound link. Anything that isn't plain http(s) is dropped —
 * `javascript:` and `data:` in an <a href> are both script-execution vectors.
 */
function safeUrl(v: unknown): string | undefined {
  const s = optStr(v, 2000)
  if (!s) return undefined
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

const newId = (): string => crypto.randomUUID()

// ── Placement ───────────────────────────────────────────────────────────────

export function normalisePlacement(v: unknown): Placement {
  const raw = (v ?? {}) as Record<string, unknown>
  const width = oneOf(raw.width, PLACEMENT_WIDTHS, DEFAULT_PLACEMENT.width)
  let float = oneOf(raw.float, PLACEMENT_FLOATS, DEFAULT_PLACEMENT.float)

  // A float and a breakout are mutually exclusive: text cannot wrap around
  // something wider than the column it flows in. The composer hides the
  // combination; a hand-rolled payload could still send it, so drop the float
  // rather than emit a placement the renderer has to second-guess.
  if (width !== 'inline') float = 'none'

  const placement: Placement = {
    width,
    float,
    align: oneOf(raw.align, PLACEMENT_ALIGNS, DEFAULT_PLACEMENT.align),
    captionPosition: oneOf(raw.captionPosition, CAPTION_POSITIONS, DEFAULT_PLACEMENT.captionPosition),
    aspect: oneOf(raw.aspect, PLACEMENT_ASPECTS, DEFAULT_PLACEMENT.aspect),
  }
  if (float !== 'none') {
    placement.floatWidth = oneOf(raw.floatWidth, PLACEMENT_FLOAT_WIDTHS, '1/2')
  }
  return placement
}

// ── Media pool ──────────────────────────────────────────────────────────────

/**
 * Normalise the pool. Assets without a usable URL are dropped outright — a
 * pool entry that cannot render is worse than an absent one, because blocks
 * would reference it and silently show nothing.
 */
export function normaliseMedia(v: unknown): BlogMedia[] {
  if (!Array.isArray(v)) return []
  const out: BlogMedia[] = []
  const seen = new Set<string>()
  for (const raw of v as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue
    const url = str(raw.url, 500_000) // data: URLs in the no-S3 dev fallback are long
    if (!url) continue
    let id = optStr(raw.id, 64) ?? newId()
    if (seen.has(id)) id = newId() // a duplicate id would make blocks ambiguous
    seen.add(id)
    const media: BlogMedia = {
      id,
      url,
      kind: oneOf(raw.kind, BLOG_MEDIA_KINDS, 'image'),
      filename: optStr(raw.filename, 200) ?? 'file',
      contentType: optStr(raw.contentType, 100) ?? 'application/octet-stream',
      alt: str(raw.alt, 500),
      uploadedAt: optStr(raw.uploadedAt, 40) ?? new Date().toISOString(),
    }
    const key = optStr(raw.key, 500)
    if (key) media.key = key
    const width = num(raw.width)
    if (width) media.width = width
    const height = num(raw.height)
    if (height) media.height = height
    const bytes = num(raw.bytes)
    if (bytes) media.bytes = bytes
    const caption = optStr(raw.caption, 1000)
    if (caption) media.caption = caption
    const credit = optStr(raw.credit, 300)
    if (credit) media.credit = credit
    const by = optStr(raw.uploadedByUserId, 64)
    if (by) media.uploadedByUserId = by
    out.push(media)
  }
  return out
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const MAX_BLOCKS = 500
const MAX_LIST_ITEMS = 200
const MAX_GALLERY_ITEMS = 60

/**
 * Normalise one block against the pool. Returns null when the block cannot be
 * salvaged — an unknown kind, or a visual block whose every media reference is
 * dangling. Dropping it is deliberate: persisting an image block that points at
 * nothing produces a post with an invisible hole in it, and the author gets no
 * signal. The route reports how many were dropped.
 */
function normaliseBlock(raw: Record<string, unknown>, poolIds: Set<string>): Block | null {
  const id = optStr(raw.id, 64) ?? newId()
  const kind = str(raw.kind, 40)

  switch (kind) {
    case 'paragraph': {
      return { id, kind, html: sanitizeBlogInline(str(raw.html, 20_000)) }
    }
    case 'heading': {
      const level = oneOf(num(raw.level), HEADING_LEVELS, 2)
      return { id, kind, level, text: str(raw.text, 500) }
    }
    case 'list': {
      const items = Array.isArray(raw.items)
        ? raw.items.slice(0, MAX_LIST_ITEMS).map((i) => sanitizeBlogInline(str(i, 2000)))
        : []
      return { id, kind, ordered: bool(raw.ordered), items }
    }
    case 'quote': {
      const block: Block = {
        id,
        kind,
        html: sanitizeBlogInline(str(raw.html, 5000)),
        style: oneOf(raw.style, QUOTE_STYLES, 'pull'),
      }
      const attribution = optStr(raw.attribution, 300)
      if (attribution) block.attribution = attribution
      return block
    }
    case 'callout': {
      return {
        id,
        kind,
        tone: oneOf(raw.tone, CALLOUT_TONES, 'info'),
        html: sanitizeBlogInline(str(raw.html, 5000)),
      }
    }
    case 'divider': {
      return { id, kind, style: oneOf(raw.style, DIVIDER_STYLES, 'rule') }
    }
    case 'image': {
      const mediaId = optStr(raw.mediaId, 64)
      if (!mediaId || !poolIds.has(mediaId)) return null
      const block: Block = { id, kind, mediaId, placement: normalisePlacement(raw.placement) }
      const caption = optStr(raw.caption, 1000)
      if (caption) block.caption = caption
      const credit = optStr(raw.credit, 300)
      if (credit) block.credit = credit
      const alt = optStr(raw.alt, 500)
      if (alt) block.alt = alt
      const f = focal(raw.focal)
      if (f) block.focal = f
      const linkUrl = safeUrl(raw.linkUrl)
      if (linkUrl) block.linkUrl = linkUrl
      return block
    }
    case 'gallery': {
      const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, MAX_GALLERY_ITEMS) : []
      const items: Record<string, unknown>[] = []
      for (const it of rawItems as Record<string, unknown>[]) {
        if (!it || typeof it !== 'object') continue
        const mediaId = optStr(it.mediaId, 64)
        if (!mediaId || !poolIds.has(mediaId)) continue
        const item: Record<string, unknown> = { mediaId }
        const span = num(it.span)
        if (span === 2) item.span = 2
        const caption = optStr(it.caption, 1000)
        if (caption) item.caption = caption
        items.push(item)
      }
      // Every reference was dangling — an empty gallery renders as a gap.
      if (items.length === 0) return null
      return {
        id,
        kind,
        layout: oneOf(raw.layout, GALLERY_LAYOUTS, 'grid'),
        columns: oneOf(num(raw.columns), GALLERY_COLUMNS, 3),
        items,
        placement: normalisePlacement(raw.placement),
      }
    }
    case 'embed': {
      const url = safeUrl(raw.url)
      if (!url) return null
      return {
        id,
        kind,
        provider: oneOf(raw.provider, EMBED_PROVIDERS, 'youtube'),
        url,
        ratio: oneOf(raw.ratio, EMBED_RATIOS, '16:9'),
      }
    }
    case 'horseCard': {
      const horseId = optStr(raw.horseId, 64)
      return horseId ? { id, kind, horseId } : null
    }
    case 'partyCard': {
      const partyId = optStr(raw.partyId, 64)
      return partyId ? { id, kind, partyId } : null
    }
    case 'articleRef': {
      const articleId = optStr(raw.articleId, 64)
      return articleId ? { id, kind, articleId } : null
    }
    case 'code': {
      const block: Block = { id, kind, text: str(raw.text, 20_000) }
      const language = optStr(raw.language, 30)
      if (language) block.language = language
      return block
    }
    default:
      return null
  }
}

export interface NormalisedBlocks {
  blocks: Block[]
  /** How many were discarded, so the route can tell the author instead of silently eating them. */
  dropped: number
}

/**
 * Normalise a whole block list against a media pool. Block ids are forced
 * unique — duplicates would break React keys and every id-based editor op.
 */
export function normaliseBlocks(v: unknown, media: BlogMedia[]): NormalisedBlocks {
  if (!Array.isArray(v)) return { blocks: [], dropped: 0 }

  const poolIds = new Set(media.map((m) => m.id))
  const overflow = Math.max(0, v.length - MAX_BLOCKS)
  const input = v.slice(0, MAX_BLOCKS)

  const blocks: Block[] = []
  const seenIds = new Set<string>()
  let dropped = overflow

  for (const raw of input as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') {
      dropped++
      continue
    }
    const block = normaliseBlock(raw, poolIds)
    if (!block) {
      dropped++
      continue
    }
    if (seenIds.has(block.id)) block.id = newId()
    seenIds.add(block.id)
    blocks.push(block)
  }

  return { blocks, dropped }
}

// ── Parts ───────────────────────────────────────────────────────────────────

/**
 * A titled sub-section of a post — a "sub-blog".
 *
 * A part is a heading and a body, and deliberately NOT a nested post: no cover,
 * no slug, no status, no byline. What earns it a type of its own rather than
 * being a `heading` block followed by paragraphs is that a part is the unit a
 * READER answers: each one carries its own reaction scale on the public page, so
 * it needs an identity that survives editing. Reorder a part or rewrite its
 * prose and `id` stays put — that id is what a stored reaction is keyed to when
 * reactions get a collection (docs/EMOJI-ANALYTICS-PLAN.md).
 *
 * The body is `Block[]`, the same shape as the post's own, so a part goes
 * through `normaliseBlocks` against the SAME media pool and renders through the
 * same component. A part whose body were one HTML string could not hold a
 * photograph anywhere but its end, which is the exact limitation of
 * `Article.summary` that blogs exist to escape.
 */
export interface BlogPart {
  id: string
  title: string
  blocks: Block[]
}

const MAX_PARTS = 20

export interface NormalisedParts {
  parts: BlogPart[]
  dropped: number
}

/**
 * Normalise the part list against the post's media pool.
 *
 * An EMPTY part is kept, not discarded. "Add part" in the editor creates a card
 * with nothing in it and autosave fires a second later — dropping it here would
 * delete the author's new section out from under them before they had typed the
 * title. The public page skips a part with no title and no content instead, and
 * the editor says so on the card, so nothing is silently swallowed at either end.
 */
export function normaliseParts(v: unknown, media: BlogMedia[]): NormalisedParts {
  if (!Array.isArray(v)) return { parts: [], dropped: 0 }

  let dropped = Math.max(0, v.length - MAX_PARTS)
  const parts: BlogPart[] = []
  const seenIds = new Set<string>()

  for (const raw of v.slice(0, MAX_PARTS) as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') {
      dropped++
      continue
    }
    // Duplicate ids would make two parts indistinguishable — to React keys now,
    // and to per-part reactions later.
    let id = optStr(raw.id, 64) ?? newId()
    if (seenIds.has(id)) id = newId()
    seenIds.add(id)

    const nested = normaliseBlocks(raw.blocks, media)
    dropped += nested.dropped
    parts.push({ id, title: str(raw.title, 200).trim(), blocks: nested.blocks })
  }

  return { parts, dropped }
}

/** Every block inside every part, in order. */
export function partsBlocks(parts: BlogPart[] | undefined): Block[] {
  if (!Array.isArray(parts)) return []
  return parts.flatMap((p) => (Array.isArray(p.blocks) ? p.blocks : []))
}

/**
 * Does this part have anything in it? A part with no title and no substance is a
 * card the author added and never filled in; the reader page skips it rather than
 * printing a bare "Part 3" over an empty reaction scale.
 *
 * A divider does not count as substance — a part containing only a rule is still
 * an empty part.
 */
export function partHasContent(part: BlogPart): boolean {
  if (part.title.trim()) return true
  return (Array.isArray(part.blocks) ? part.blocks : []).some((b) => {
    if (b.kind === 'divider') return false
    return blockText(b).trim().length > 0 || blockMediaIds(b).length > 0 || b.kind === 'embed' ||
      b.kind === 'horseCard' || b.kind === 'partyCard' || b.kind === 'articleRef'
  })
}

// ── Derived values ──────────────────────────────────────────────────────────

/** Plain text of a block, for word counting and excerpt derivation. */
export function blockText(b: Block): string {
  switch (b.kind) {
    case 'paragraph':
    case 'callout':
      return stripTags(String(b.html ?? ''))
    case 'heading':
      return String(b.text ?? '')
    case 'list':
      return Array.isArray(b.items) ? b.items.map((i) => stripTags(String(i))).join(' ') : ''
    case 'quote':
      return `${stripTags(String(b.html ?? ''))} ${String(b.attribution ?? '')}`
    case 'code':
      return String(b.text ?? '')
    default:
      return ''
  }
}

/** The inline allowlist means tags here are already safe; this is for counting, not output. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

const WORDS_PER_MINUTE = 225
/** Seconds a reader spends on an image — the standard tapering estimate, flattened. */
const SECONDS_PER_IMAGE = 8

/** Reading time in whole minutes, minimum 1. Computed on save; never author-supplied. */
export function readingTimeFor(blocks: Block[]): number {
  let words = 0
  let images = 0
  for (const b of blocks) {
    const text = blockText(b)
    if (text) words += text.split(/\s+/).filter(Boolean).length
    if (b.kind === 'image') images += 1
    if (b.kind === 'gallery' && Array.isArray(b.items)) images += b.items.length
  }
  const minutes = words / WORDS_PER_MINUTE + (images * SECONDS_PER_IMAGE) / 60
  return Math.max(1, Math.round(minutes))
}

/** First paragraph, trimmed to a card-sized excerpt. Used when the author leaves it blank. */
export function deriveExcerpt(blocks: Block[], max = 200): string {
  const first = blocks.find((b) => b.kind === 'paragraph' && blockText(b).length > 0)
  if (!first) return ''
  const text = blockText(first)
  if (text.length <= max) return text
  // Cut on a word boundary so the ellipsis doesn't land mid-word.
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Media ids a block references. Mirrors the web helper. */
export function blockMediaIds(b: Block): string[] {
  if (b.kind === 'image') return typeof b.mediaId === 'string' ? [b.mediaId] : []
  if (b.kind === 'gallery' && Array.isArray(b.items)) {
    return (b.items as { mediaId?: unknown }[])
      .map((i) => i.mediaId)
      .filter((x): x is string => typeof x === 'string')
  }
  return []
}

/** Block ids that reference a given asset — powers the delete-in-use guard. */
export function blocksUsingMedia(blocks: Block[], mediaId: string): string[] {
  return blocks.filter((b) => blockMediaIds(b).includes(mediaId)).map((b) => b.id)
}
