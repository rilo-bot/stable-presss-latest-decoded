// ---------------------------------------------------------------------------
// Naming pages to a human.
//
// Three separate notifications now tell someone about a SET of magazine pages
// ("shared with you", "submitted for review", "approved"), and they must phrase
// it identically — an email that says "pages 4, 5 and 6" and another that says
// "3 pages" describe the same thing in two voices, and only one of them is
// actionable.
//
// v2 pages carry no title, only an index, so the honest label is the page
// NUMBER — which is exactly what the editor's page rail and the Share dialog's
// picker show (`index + 1`). UI and email therefore name the same thing.
// ---------------------------------------------------------------------------

/**
 * "page 4" · "pages 4 and 5" · "pages 4, 5 and 9".
 *
 * Sorted ascending and de-duplicated, because the caller resolves ids → numbers
 * through a map and a repeated id would otherwise read as "pages 4, 4 and 5".
 * Returns '' for an empty list so callers can decide what no-pages means rather
 * than being handed the misleading "pages ".
 */
export function pageNumbersLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return `page ${sorted[0]}`
  return `pages ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`
}
