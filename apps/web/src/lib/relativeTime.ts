/**
 * How the product says "when".
 *
 * This lived inside `stores/commentStore` and was reached for by anything that
 * needed it — which meant a screen with no comments on it still pulled in the
 * comment store, zustand and all, to format one timestamp. It is a pure function
 * about dates and belongs nowhere near a store; the comment store re-exports it
 * so its existing callers are undisturbed.
 */

/**
 * "just now" / "14 minutes ago" / "3 Aug".
 *
 * Relative inside a day, absolute beyond it. A thread is read for its recency, so
 * "2 hours ago" is the useful fact about a comment from today; "17 days ago" is
 * arithmetic nobody asked for, and the date is shorter to read. The full instant
 * is always on the element's `title`.
 */
export function relativeTime(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The unabbreviated instant, for a `title` tooltip. Returns '' for an unparseable
 * or missing stamp so a caller can drop the attribute entirely rather than
 * offering a tooltip that reads "Invalid Date".
 */
export function fullTimestamp(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A calendar date, no clock — "12 Aug 2025", or "12 Aug" inside the current year,
 * where the year is the one part a reader already knows. '' when unparseable.
 */
export function shortDate(iso: string, now = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
