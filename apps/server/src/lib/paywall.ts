// ---------------------------------------------------------------------------
// The premium paywall, server side.
//
// This file exists because the story paywall was a CLIENT-SIDE DECORATION.
// `/articles/:id` computed `locked` from the reader's tier and rendered a
// <Paywall> over the body — but `GET /api/articles` returned the whole of
// `summary` to every caller regardless of `minTier`, so a premium story was
// readable in full from the network tab, or with one curl. Two of the AI
// concierge's server-executed tools (`searchArticles`, `getArticle`) handed the
// same body back to anyone who asked for it in a sentence.
//
// A client cannot enforce a paywall over content it has already been handed.
//
// One module rather than a copy per call site, because there were three sites and
// the blog had already grown a fourth, independent implementation. A paywall that
// is spelled four ways is one edit away from being spelled three ways.
// ---------------------------------------------------------------------------

export const TIERS = ['free', 'standard', 'premium'] as const
export type Tier = (typeof TIERS)[number]

/**
 * Does `have` reach `need`?
 *
 * Mirrors `tierAtLeast` in apps/web/src/rbac/entitlement.ts. Unknown values on
 * either side read as `free`, so a garbled tier fails CLOSED for the reader
 * (`have` sinks to the bottom) and OPEN for the content (`need` sinks too, i.e.
 * an unrecognised `minTier` never paywalls a story by accident).
 */
export function tierAtLeast(have: unknown, need: unknown): boolean {
  const h = TIERS.indexOf(have as Tier)
  const n = TIERS.indexOf(need as Tier)
  return (h < 0 ? 0 : h) >= (n < 0 ? 0 : n)
}

/** Is this reader entitled to the full text of something gated at `minTier`? */
export function tierAllows(readerTier: unknown, minTier: unknown): boolean {
  const need = typeof minTier === 'string' ? minTier : 'free'
  return need === 'free' || tierAtLeast(readerTier, need)
}

/**
 * Split a story body into paragraphs.
 *
 * Mirrors `splitIntoParagraphs` in apps/web/src/pages/article-detail/helpers.ts
 * EXACTLY — including the sentence-grouping fallback for bodies with no blank
 * lines. It has to: the reader page renders paragraph 0 above the paywall and the
 * rest below it, so if the server's idea of "the free teaser" were any different,
 * a legitimate reader would watch the article change under them.
 *
 * A story body is one plain-text field (`summary`), not blocks — which is why
 * this is a text heuristic rather than a structural filter the way the blog's
 * gate is.
 */
export function splitIntoParagraphs(text: string): string[] {
  if (!text) return []
  // Respect explicit paragraph breaks when the author wrote them.
  const byNewline = text.split(/\n{2,}/)
  if (byNewline.length > 1) return byNewline.filter(Boolean)
  // Otherwise group sentences in threes.
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const groups: string[] = []
  for (let i = 0; i < sentences.length; i += 3) {
    groups.push(sentences.slice(i, i + 3).join(' ').trim())
  }
  return groups.filter(Boolean)
}

/** The free teaser for a gated story body: its first paragraph. */
export function articleTeaser(summary: unknown): string {
  const text = typeof summary === 'string' ? summary : ''
  return splitIntoParagraphs(text)[0] ?? ''
}

/**
 * Strip a paywalled story down to its free teaser.
 *
 * Returns the document untouched when it is free, or when the reader's tier
 * reaches it. Otherwise `summary` becomes paragraph 0 — exactly what the page
 * already showed above the gate, so nothing visible changes for a legitimate
 * reader — and `locked: true` travels so the reader page can render the gate off
 * the server's answer instead of only re-deriving it.
 *
 * `readingTime` deliberately stays: it describes the story you are being asked to
 * buy, and every card in /news already carries it.
 */
export function gateArticleForTier<T extends Record<string, unknown>>(
  doc: T,
  readerTier: unknown,
): T & { locked?: boolean } {
  if (tierAllows(readerTier, doc.minTier)) return doc
  return { ...doc, summary: articleTeaser(doc.summary), locked: true }
}
