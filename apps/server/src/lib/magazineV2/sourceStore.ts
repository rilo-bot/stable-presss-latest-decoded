// ---------------------------------------------------------------------------
// Magazine Builder v2 — the source-document store: types and chunking.
//
// A document used to be a transient STRING passing through the browser: read on
// an HTTP request, concatenated in React state, posted back as a form field,
// truncated by whoever held it, then discarded. Nobody owned it, so nobody could
// bound it. This module gives it an owner.
//
// PURE ON PURPOSE. Everything here takes data and returns data — no database, no
// clock, no network — so the interesting logic (chunking, term extraction, the
// progress arithmetic a resumed read depends on) is testable without a Mongo or a
// model. The db writes live in the read job; what can be a pure function is one.
// ---------------------------------------------------------------------------

import { tokenize } from './retrieval.js';
import { chunkSource } from './retrieval.js';

/**
 * Lifecycle of one document's read.
 *
 * `partial` is the honest third state, and it exists so that `ready` cannot lie.
 * A read that stops short — the page cap, the wall-clock budget, pages whose OCR
 * failed — must be observable as "some of this document was never read", because
 * a consumer that sees `ready` is entitled to assume the chunks are the whole
 * document. Collapsing partial into ready is how "the magazine ignored half my
 * PDF" becomes invisible.
 */
export type SourceDocStatus = 'queued' | 'reading' | 'partial' | 'ready' | 'failed';

/** How the text was obtained — worth keeping, because OCR text is materially
 *  less trustworthy than a PDF's own text layer and a reader may want to know. */
export type SourceDocKind = 'pdf-text' | 'pdf-ocr' | 'docx' | 'text' | 'image';

/**
 * What was actually read, as opposed to what was uploaded.
 *
 * Derived from the chunk rows at the moment of a status transition — never
 * accumulated in a counter and trusted. A counter that a crash left one behind
 * would make a partially-read document look complete, which is the failure this
 * whole shape exists to prevent.
 */
export interface SourceCoverage {
  pagesRead: number;
  pagesTotal: number;
  /** True when some of the document was never read. `ready` requires this false. */
  truncated: boolean;
  /** Why, in a phrase a person can read. '' when nothing was skipped. */
  reason: string;
}

/** One stored document. `_id` is the docId every consumer cites. */
export interface SourceDoc {
  _id: string;
  magazineId: string;
  ownerId: string;
  originalName: string;
  contentType: string;
  size: number;
  s3Key: string;
  url: string;
  /** sha256 of the bytes. A re-upload of the same file reuses the existing read
   *  rather than paying for OCR twice — by far the largest cost in the pipeline. */
  contentHash: string;
  status: SourceDocStatus;
  kind: SourceDocKind;
  coverage: SourceCoverage;
  /** The compact preview shown in the Uploads list (not what generation reads). */
  digest: { title: string; summary: string };
  error: string;
  /**
   * How far the sweep has got: the read has PASSED OVER pages [1, readSwept]. The
   * next batch starts at readSwept + 1.
   *
   * This is not a duplicate of the chunk rows, and the distinction matters. The
   * rows answer "which pages do I hold?" — which is what a resumed batch skips.
   * They cannot answer "which pages have been looked at?", because a page can be
   * swept and produce no rows at all: a blank page in a scan, or a page whose OCR
   * call errored. Without this field those pages are re-read forever.
   *
   * It states a FACT about the past, not an intention, and it only ever moves
   * forward. So losing it (or leaving it behind after a crash) costs a re-read of
   * pages we already hold — cheap, because the rows make that a skip — and can
   * never cause a page to be silently passed over. Completeness is still decided
   * from the rows; see coverageOf / sweptCoverage.
   */
  readSwept?: number;
  /**
   * Units whose OCR call ERRORED, as a set rather than a count.
   *
   * A count accumulated across batches double-counts when a batch is retried; a set
   * is idempotent under re-run. And it is only ever a HINT about why a page has no
   * rows: sweptCoverage discards any entry that later produced chunks, so a page
   * that failed once and succeeded on a re-read stops being reported as unread.
   */
  failedUnits?: number[];
  /**
   * Pages transcribed by the OCR model, as a set.
   *
   * The only pages that cost money, so this is what the read estimate counts. A set
   * rather than a running total for the same reason as failedUnits: a retried batch
   * would inflate a counter, and an over-reported bill is a worse failure than a
   * slightly larger document.
   *
   * Also useful on its own — it says which of a mixed document's pages were
   * transcribed rather than extracted, and transcription is the less trustworthy of
   * the two.
   */
  ocrUnits?: number[];
  /** Latest reading of what this read costs. Advisory — see ReadEstimate. */
  estimate?: ReadEstimate;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  deletedAt: string | null;
}

/**
 * One chunk of one document.
 *
 * IDENTITY IS `{docId, pageNo, seq}`, NOT a running counter — and that is what
 * makes a resumed read safe. With a single global `ord`, re-reading page 5 after
 * pages 6 and 7 had already been written would allocate ords that collide with
 * theirs, so a crash mid-document could only be recovered by deleting everything
 * and starting again. Keyed per page, re-reading page 5 rewrites exactly page 5's
 * rows and cannot touch another page's. Document order is (pageNo, seq).
 *
 * `pageNo` is 0 for a source with no pages (a text file, a DOCX body).
 */
export interface SourceChunk {
  docId: string;
  magazineId: string;
  pageNo: number;
  seq: number;
  text: string;
  chars: number;
  /** Precomputed search terms — a candidate FILTER, not the score. Scoring reads
   *  `text` with the same scorer the string path uses, so the two cannot drift. */
  terms: string[];
}

/** A chunk before it has a document to belong to. */
export type ChunkDraft = Omit<SourceChunk, 'docId' | 'magazineId'>;

/** Chunks longer than this are split on a word boundary. Matches the string path. */
const MAX_CHUNK_CHARS = 900;

/**
 * Split one page (or one whole non-paginated document) into chunk drafts.
 *
 * `seq` restarts at 0 for every page by design — see SourceChunk on why identity
 * is per-page rather than a running counter.
 */
export function chunkDocument(text: string, opts?: { pageNo?: number }): ChunkDraft[] {
  const pageNo = Math.max(0, Math.floor(opts?.pageNo ?? 0));
  return chunkSource(text ?? '', MAX_CHUNK_CHARS)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, seq) => ({ pageNo, seq, text: t, chars: t.length, terms: tokenize(t) }));
}

/**
 * Which pages of a document already have chunks — i.e. what a resumed read can
 * SKIP. Derived from the rows themselves, never from a stored counter: a counter
 * is a second answer to a question the rows already answer, and a crash between
 * the two writes makes them disagree. Re-deriving costs one indexed query.
 */
export function pagesAlreadyRead(chunks: Pick<SourceChunk, 'pageNo'>[]): Set<number> {
  return new Set(chunks.map((c) => c.pageNo));
}

/**
 * Coverage computed from the rows that exist, plus what the reader reports it
 * skipped. The ONLY place a document's completeness is decided.
 */
export function coverageOf(opts: {
  pagesRead: Set<number> | number;
  pagesTotal: number;
  /** Pages the reader gave up on (OCR error, wall-clock, page cap). */
  skipped?: number;
  reason?: string;
}): SourceCoverage {
  const read = typeof opts.pagesRead === 'number' ? opts.pagesRead : opts.pagesRead.size;
  const total = Math.max(0, Math.floor(opts.pagesTotal));
  const truncated = read < total || (opts.skipped ?? 0) > 0;
  const reason = truncated
    ? opts.reason || (read < total ? `read ${read} of ${total} pages` : 'some pages could not be read')
    : '';
  return { pagesRead: read, pagesTotal: total, truncated, reason };
}

/**
 * What a read is costing, and what it is going to cost.
 *
 * THIS EXISTS BECAUSE THE PAGE CAPS ARE GONE. A cap was, among its other jobs, an
 * accidental spend ceiling: 200 pages could not cost more than 200 pages. Reading a
 * document to its last page is the right behaviour and it removes that ceiling, so
 * something has to say out loud what is being spent — otherwise "no cap" is not a
 * decision anybody made, it is a number nobody saw.
 *
 * Deliberately a READING and not a bill. The rate is configured (OCR_USD_PER_PAGE),
 * so this can be wrong about money in a way it can never be wrong about pages, and
 * `projected` says which half of the number is still a guess.
 */
export interface ReadEstimate {
  /** Pages in the document. */
  pagesTotal: number;
  /** Pages looked at so far. */
  pagesSeen: number;
  /** Pages transcribed by the OCR model so far — the only ones that cost anything. */
  ocrPages: number;
  /** Pages expected to need OCR across the whole document. */
  ocrPagesExpected: number;
  /** Expected total, in USD, at the configured rate. 0 when the rate is 0. */
  usd: number;
  /** True while ocrPagesExpected is extrapolated from what has been seen so far. */
  projected: boolean;
}

/**
 * Project the cost of the whole read from the part of it that has happened.
 *
 * The ratio matters more than it looks. A 900-page document is not 900 OCR pages
 * unless it is a scan throughout — a typeset report with a scanned appendix might be
 * twelve. Extrapolating from pages SEEN rather than assuming the worst is what makes
 * the estimate worth showing: a number that reads "900 pages, $0.90" for every long
 * document tells the user nothing about their document.
 *
 * Never projects fewer OCR pages than have already been done, and never more than
 * the document has pages.
 */
export function projectRead(opts: {
  pagesSeen: number;
  ocrPages: number;
  pagesTotal: number;
  usdPerOcrPage?: number;
}): ReadEstimate {
  const pagesTotal = Math.max(0, Math.floor(opts.pagesTotal));
  const pagesSeen = Math.max(0, Math.min(pagesTotal, Math.floor(opts.pagesSeen)));
  const ocrPages = Math.max(0, Math.min(pagesSeen, Math.floor(opts.ocrPages)));
  const rate = Math.max(0, opts.usdPerOcrPage ?? 0);

  const done = pagesSeen >= pagesTotal;
  const ratio = pagesSeen > 0 ? ocrPages / pagesSeen : 0;
  const ocrPagesExpected = done
    ? ocrPages
    : Math.min(pagesTotal, Math.max(ocrPages, Math.round(ratio * pagesTotal)));

  return {
    pagesTotal,
    pagesSeen,
    ocrPages,
    ocrPagesExpected,
    // Rounded to the cent it will be displayed as, so the stored number and the
    // number shown to a person cannot disagree.
    usd: Math.round(ocrPagesExpected * rate * 100) / 100,
    projected: !done,
  };
}

/**
 * Whether a document is read page by page, or as one body.
 *
 * Both PDF kinds are paginated — the text layer is now extracted per page too, not
 * as one string for the whole file, which is what gives a text PDF real page
 * numbers, progress and resumability. A DOCX or a text file has no pages to count,
 * so it is one unit numbered 0.
 *
 * A function rather than a comparison at each call site because the answer changed:
 * `pdf-text` used to be a single unit, and every `kind === 'pdf-ocr'` test written
 * back then silently became a test for "is it paginated?" that gets the new answer
 * wrong.
 */
export function isPaginated(kind: SourceDocKind): boolean {
  return kind === 'pdf-text' || kind === 'pdf-ocr';
}

/**
 * The kind a document settles on, given what an earlier batch found and what this
 * one did. OCR is STICKY.
 *
 * Once any page has been read by OCR, the document is `pdf-ocr` — because that is
 * the only thing `kind` is for: telling a consumer the text is transcribed rather
 * than extracted, and so materially less trustworthy. A 400-page report with twelve
 * scanned pages that reported itself as `pdf-text` because the last batch happened
 * to be typeset would be making exactly the wrong promise.
 */
export function mergeKind(previous: SourceDocKind | undefined, current: SourceDocKind): SourceDocKind {
  if (previous === 'pdf-ocr' && isPaginated(current)) return 'pdf-ocr';
  return current;
}

/**
 * Coverage for a document read in BATCHES, from how far the sweep got.
 *
 * The paginated counterpart to coverageOf. That one counts the pages that produced
 * rows, which is right when one run reads the whole document — but wrong once a
 * read is swept in batches, because a page can be read successfully and still
 * produce nothing: a blank page in a scan. Counting rows would report a 500-page
 * scan with a dozen blank pages as `partial` forever, and a `partial` that is
 * always true tells a reader nothing. So this counts what was LOOKED AT, minus what
 * demonstrably could not be read.
 *
 * `failedUnits` is self-correcting on purpose: an entry that has since produced
 * chunks is dropped, so a page that errored once and succeeded on a re-read is not
 * held against the document. That is what lets the two writes (failures, then the
 * cursor) be non-atomic — a crash between them costs a re-read, never a wrong
 * total.
 */
export function sweptCoverage(opts: {
  /** Pages the read has passed over: [1, swept]. */
  swept: number;
  /** Pages in the document. */
  total: number;
  /** Units whose read errored — hints, filtered against `storedPages`. */
  failedUnits?: number[];
  /** Pages that actually produced chunks. Used only to discard stale failures. */
  storedPages?: Set<number>;
  /** True when a wall-clock budget, not the end of the document, stopped the read. */
  outOfTime?: boolean;
}): SourceCoverage {
  const total = Math.max(0, Math.floor(opts.total));
  const swept = Math.max(0, Math.min(total, Math.floor(opts.swept)));
  const stored = opts.storedPages;
  const failed = (opts.failedUnits ?? []).filter((p) => p >= 1 && p <= swept && !stored?.has(p)).length;
  const read = Math.max(0, swept - failed);

  const parts: string[] = [];
  if (swept < total) {
    parts.push(
      opts.outOfTime
        ? `stopped after ${swept} of ${total} pages (time limit)`
        : `read the first ${swept} of ${total} pages`,
    );
  }
  if (failed > 0) parts.push(`${failed} page${failed === 1 ? '' : 's'} could not be read`);

  const truncated = read < total;
  return {
    pagesRead: read,
    pagesTotal: total,
    truncated,
    reason: truncated ? parts.join('; ') || `read ${read} of ${total} pages` : '',
  };
}

/**
 * Where the next batch starts, or null when the sweep is over.
 *
 * `ceiling` is the last page this read will ever reach — the true page count, or
 * lower if a caller imposed a page cap. Kept separate from the document's total so
 * a capped read stops without the coverage arithmetic losing sight of how long the
 * document actually was.
 */
export function nextBatchFrom(swept: number, ceiling: number): number | null {
  const at = Math.max(0, Math.floor(swept));
  return at < Math.max(0, Math.floor(ceiling)) ? at + 1 : null;
}

/**
 * Whether a batch may be re-enqueued — the loop's termination guarantee, in one
 * place with a test on it.
 *
 * A batch must either finish the sweep or move the cursor FORWARD. A batch that
 * requeues itself at the page it started on would run for ever, and it would do it
 * quietly: the queue would look busy, the document would stay `reading`, and the
 * issue waiting on it would never be generated. This is the check that makes that
 * unrepresentable, so no future caller has to remember it.
 */
export function sweepAdvanced(startedAt: number, nextFrom: number | null): boolean {
  return nextFrom === null || nextFrom > Math.floor(startedAt);
}

/**
 * The status a finished read should land on, given its coverage.
 *
 * `ready` is reserved for a document that was read completely — so a consumer
 * seeing `ready` may treat the chunks as the whole document, and one seeing
 * `partial` knows to say so. This is a function rather than a line inside the job
 * so that "can a partially-read document be observed as complete?" has exactly
 * one answer, in one place, with a test on it.
 */
export function statusForCoverage(coverage: SourceCoverage): Extract<SourceDocStatus, 'ready' | 'partial'> {
  return coverage.truncated ? 'partial' : 'ready';
}

/** Documents a consumer may read FROM. A queued/failed document has no usable
 *  chunks; a `partial` one does, and its coverage is what the prompt discloses. */
export function isReadable(status: SourceDocStatus): boolean {
  return status === 'ready' || status === 'partial';
}

/**
 * Whether the work waiting on a document's read should go ahead, given how the
 * read ended.
 *
 * Lives HERE, in the pure module, and not beside the job that calls it — because
 * importing the job pulls in the database layer, which throws at import time
 * without a MONGODB_URI. Putting this policy next to its caller made the whole
 * test file unrunnable; policy about a status needs no database and should not
 * drag one in.
 *
 * A FAILED read must not chain: a magazine invented from nothing, while the user
 * believes it came from their document, is worse than an honest failure because it
 * looks like it worked. A PARTIAL read does chain — some of the document beats
 * none, and the coverage receipt discloses what was missed.
 */
export function shouldChain(status: SourceDocStatus | null): boolean {
  return status === 'ready' || status === 'partial';
}
