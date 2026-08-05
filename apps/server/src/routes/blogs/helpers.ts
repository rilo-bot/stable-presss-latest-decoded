// ---------------------------------------------------------------------------
// Small shared plumbing for the blogs routes: id projection, status narrowing,
// and the field coercers every write path runs untrusted input through.
//
// These are deliberately blunt and total — `str()` on a non-string gives '', it
// never throws — because they sit on the edge where a request body becomes a
// stored document. A coercer that can throw would turn a malformed field into a
// 500 instead of an ignored value.
// ---------------------------------------------------------------------------

import { BLOG_STATUSES, type BlogStatus } from '../../lib/blog/blocks.js'

export type WithMongoId = { _id: string; [key: string]: unknown }

/** Mongo's `_id` → the `id` the client speaks. */
export function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string }
}

export function isBlogStatus(v: unknown): v is BlogStatus {
  return typeof v === 'string' && (BLOG_STATUSES as readonly string[]).includes(v)
}

// ── Field coercion ──────────────────────────────────────────────────────────

export function str(v: unknown, max = 1000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

export function optStr(v: unknown, max = 1000): string | undefined {
  const s = str(v, max).trim()
  return s.length > 0 ? s : undefined
}

export function strArray(v: unknown, max = 50, itemMax = 80): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  for (const item of v) {
    const s = str(item, itemMax).trim()
    if (s) seen.add(s)
    if (seen.size >= max) break
  }
  return [...seen]
}
