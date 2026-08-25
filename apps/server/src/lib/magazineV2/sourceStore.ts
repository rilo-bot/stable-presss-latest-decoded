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
