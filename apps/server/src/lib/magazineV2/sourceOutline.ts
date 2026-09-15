// ---------------------------------------------------------------------------
// Magazine Builder v2 — the document MAP handed to the issue planner.
//
// WHY A MAP AND NOT MORE TEXT
//
// The planner decides an issue's running order from SOURCE_BUDGET.plan — 14,000
// characters. For a 500-page report that is about three per cent of the document,
// and no amount of clever sampling changes the arithmetic: the planner was
// choosing the shape of an issue from a sample of its source and could not know
// what it had not seen. Raising the budget is not the answer either; it costs
// tokens on every call and still only moves three per cent to six.
//
// A page's opening line is a tiny fraction of that page and yet carries most of
// what a planner needs from it. So this builds a map — one short line per page —
// which fits the WHOLE document into a few thousand characters. The planner sees
// the document's real structure and the excerpt for its detail, rather than
// mistaking the opening pages for the document.
//
// PURE ON PURPOSE, like sourceStore: it takes the rows and returns a string, so
// the thinning arithmetic (which is where this would go wrong) is testable
// without a Mongo.
// ---------------------------------------------------------------------------

/** One page, as it appears on the map. */
export interface OutlineEntry {
  pageNo: number;
  /** The most heading-like line found near the top of the page. */
  head: string;
}

/** Longest a single map line may be. Past this a heading is not a heading, it is
 *  a paragraph, and it would crowd out other pages. */
const MAX_HEAD_CHARS = 90;

/** Lines from the top of a page to consider. Deeper than this and we are quoting
 *  body copy rather than finding a heading. */
const HEAD_LINES = 4;

/** Fold a line to the shape it shares with its repeats: letters only, lowercased.
 *  A running header differs page to page only in its folio, so the digits have to
 *  go before two instances of it can be recognised as the same thing. */
function shapeOf(line: string): string {
  return line
    .replace(/[\d\W_]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True for a line that is page furniture rather than content.
 *
 * Two signals, and they cover different cases. A line with no real word in it, or
 * one that is only a page number, is furniture outright. A line that pairs a
 * SEPARATOR with a standalone number — "ANNUAL REVIEW 2025 | 12", "Chapter 3 · 47"
 * — is a running header, and this is the only clue available when looking at one
 * page alone. Repetition across pages catches the rest; see runningHeaders.
 */
function isFurniture(line: string): boolean {
  if (!/[\p{L}]{3}/u.test(line)) return true;
  // "12", "Page 4 of 88", "12 | 40" — a folio in any of its usual dresses.
  if (/^(?:page\s*)?\d{1,4}(?:\s*(?:[|/·•-]+|of)\s*\d{1,4})?$/iu.test(line)) return true;
  // A separator and a bare number on the same short line: a header or a footer.
  if (line.length <= MAX_HEAD_CHARS && /[|·•]|\s{2,}/u.test(line) && /(?:^|\s)\d{1,4}(?:$|\s)/u.test(line)) return true;
  return false;
}

/**
 * Lines that appear as the TOP line of many pages — i.e. running headers.
 *
 * The signal a single page cannot give you. "ANNUAL REVIEW 2025 | 12" looks like a
 * perfectly good heading in isolation; what gives it away is that pages 13 through
 * 400 all say the same thing. A map of four hundred identical lines costs the
 * planner tokens and tells it nothing.
 *
 * TWO CHOICES HERE ARE LOAD-BEARING, and the first draft got both wrong.
 *
 * Only the FIRST line of each page is counted. Comparing every line near the top
 * conflated running headers with numbered section headings — "Section 1 heading",
 * "Section 2 heading" fold to the same shape as each other just as a folio line
 * does, so a document whose every page carried its own heading lost all of them.
 * Running headers live at the top of the page; real headings sit below them.
 *
 * And the threshold is HALF the pages, not a third. A heading that recurs across a
 * handful of pages is content, and losing it means losing the only heading those
 * pages have.
 */
export function runningHeaders(texts: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const first = topLines(text)[0];
    if (!first) continue;
    const shape = shapeOf(first);
    if (!shape) continue;
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  const floor = Math.max(3, Math.ceil(texts.length / 2));
  const headers = new Set<string>();
  for (const [shape, n] of counts) if (n >= floor) headers.add(shape);
  return headers;
}

function topLines(text: string): string[] {
  return (text ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, HEAD_LINES);
}

/**
 * Pick the line that best represents a page.
 *
 * NOT simply the first line. The first line of a typeset page is very often
 * furniture — a folio, a running header, a date — and a map of 400 pages all
 * reading "ANNUAL REVIEW 2025 | 12" tells the planner nothing at all. So this skips
 * furniture, skips anything `ignore` identifies as a running header (which is what
 * repetition across the document reveals), prefers a line short enough to be a
 * heading, and falls back to the first real line when the page has no heading-shaped
 * line in it — the honest answer for a page of solid prose.
 */
export function headlineOf(text: string, ignore?: Set<string>): string {
  const lines = topLines(text);
  if (lines.length === 0) return '';

  const real = lines.filter((l) => !isFurniture(l) && !ignore?.has(shapeOf(l)));
  if (real.length === 0) {
    // Nothing but furniture. Fall back to the first line only if it was not a
    // recognised running header — repeating that 400 times is the failure case.
    const first = lines[0]!;
    return ignore?.has(shapeOf(first)) ? '' : trimHead(first);
  }

  // A heading is short. Prefer the first short line; otherwise the first real one,
  // trimmed.
  return trimHead(real.find((l) => l.length <= MAX_HEAD_CHARS) ?? real[0]!);
}

/**
 * Build map entries from every page's opening text.
 *
 * TWO PASSES, and the second is the point: the running headers can only be found by
 * looking at the whole document, so the per-page choice has to be made after that
 * is known. Doing it in one pass means the map is a list of the same header
 * repeated, which is the main way a document map is worthless.
 */
export function buildOutline(pages: Array<{ pageNo: number; text: string }>): OutlineEntry[] {
  const ignore = runningHeaders(pages.map((p) => p.text));
  return pages.map((p) => ({ pageNo: p.pageNo, head: headlineOf(p.text, ignore) }));
}

function trimHead(line: string): string {
  const clean = line.trim();
  if (clean.length <= MAX_HEAD_CHARS) return clean;
  // Cut on a word boundary so the map does not end mid-word.
  const cut = clean.slice(0, MAX_HEAD_CHARS);
  const space = cut.lastIndexOf(' ');
  return (space > MAX_HEAD_CHARS * 0.6 ? cut.slice(0, space) : cut).trim() + '…';
}

/** Roughly what the map's own header line costs. Reserved from the budget so the
 *  whole map fits it, rather than the entries fitting and the header pushing the
 *  total over — a budget that is only true of part of its output is not a budget. */
const HEADER_RESERVE = 240;

/** What one entry costs on the map: "123: Some heading" plus its newline. */
function costOf(e: OutlineEntry): number {
  return String(e.pageNo).length + 2 + e.head.length + 1;
}

/** `count` entries spread evenly across `all`, first and last always included. */
function spread(all: OutlineEntry[], count: number): OutlineEntry[] {
  const kept: OutlineEntry[] = [];
  for (let i = 0; i < count; i++) kept.push(all[Math.floor((i * all.length) / count)]!);
  // The last page, always — a map that stops at page 480 of 500 reads as though the
  // document does.
  const last = all[all.length - 1]!;
  if (kept[kept.length - 1]!.pageNo !== last.pageNo) kept[kept.length - 1] = last;
  return kept;
}

/**
 * Thin a map to fit a character budget, keeping an EVEN spread.
 *
 * Truncating instead — the first N pages that fit — would reproduce the exact bug
 * this map exists to fix, one level up: the planner would get a complete-looking
 * map of the document's opening. Thinning keeps the beginning, middle and end in
 * the proportions the document has them, and the gaps are visible because the page
 * numbers jump.
 *
 * The budget is a real ceiling, not an estimate. Sizing the selection from the
 * AVERAGE entry cost is only a first guess — a document whose headings vary in
 * length can overshoot it — so the guess is then checked against the actual cost
 * and walked down until it fits. And a budget too small for a map worth reading
 * yields NO map: two pages out of five hundred is not a map of the document, it is
 * a claim to be one.
 */
export function thinOutline(entries: OutlineEntry[], budgetChars: number): OutlineEntry[] {
  const usable = entries.filter((e) => e.head);
  if (usable.length === 0) return [];
  const budget = Math.max(0, Math.floor(budgetChars));

  const total = usable.reduce((sum, e) => sum + costOf(e), 0);
  if (total <= budget) return usable;

  const average = total / usable.length;
  let room = Math.min(usable.length, Math.floor(budget / average));
  while (room >= 2) {
    const kept = spread(usable, room);
    if (kept.reduce((sum, e) => sum + costOf(e), 0) <= budget) return kept;
    room -= 1;
  }
  return [];
}

/**
 * Render the map, or '' when there is nothing worth mapping.
 *
 * Returns '' for a single page too: a map of one page is the page, and a heading
 * repeated immediately above its own text is noise.
 */
export function formatOutline(
  entries: OutlineEntry[],
  opts: { budgetChars: number; pagesTotal?: number },
): string {
  const kept = thinOutline(entries, opts.budgetChars - HEADER_RESERVE);
  if (kept.length < 2) return '';
  const total = Math.max(opts.pagesTotal ?? 0, entries[entries.length - 1]?.pageNo ?? 0);
  const thinned = kept.length < entries.filter((e) => e.head).length;
  const header =
    `[MAP OF THE DOCUMENT — ${kept.length} of ${total} pages, as "page: opening line". ` +
    (thinned ? 'Pages are sampled evenly, so the numbers jump. ' : '') +
    'It shows the document’s full structure; the text below it is only an excerpt.]';
  return [header, ...kept.map((e) => `${e.pageNo}: ${e.head}`)].join('\n');
}
