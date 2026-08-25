// ---------------------------------------------------------------------------
// Magazine Builder v2 — read one uploaded document into the store.
//
// WHY THIS IS A JOB AND NOT A REQUEST
//
// The old reader ran inside POST /api/agent/editor/ingest, so a browser sat
// waiting on it. That single fact caused: a 300s client abort against a read
// whose worst case was 900s; a 6-page cap on scanned PDFs so the wait stayed
// tolerable; and 50MB buffered in the API process per upload. With no client
// waiting, every page can be read — and the queue's existing retry, orphan sweep
// and TTL apply for free.
//
// NEVER AWAIT ANOTHER JOB FROM IN HERE. The worker runs ONE job at a time, so a
// handler that waits for a second job to finish waits for a job that can never be
// claimed: a guaranteed deadlock, and one that presents as "generation hangs
// sometimes". Follow-on work is CHAINED — this handler enqueues the continuation
// as its last act. See continuationFor().
// ---------------------------------------------------------------------------

import { storage } from '../storage.js';
import { readDocumentUnits, JOB_MAX_OCR_PAGES } from '../agent/documentIngest.js';
import {
  chunkDocument,
  coverageOf,
  type SourceCoverage,
  type SourceDoc,
  type SourceDocKind,
} from './sourceStore.js';
import {
  beginReading,
  deleteChunks,
  failReading,
  findReadableTwin,
  finishReading,
  getSourceDoc,
  loadChunks,
  noteProgress,
  pagesWithChunks,
  writeChunks,
} from './sourceDocsDb.js';

/**
 * What to run once this document is readable.
 *
 * Carried in the job payload rather than resolved here, so the read handler has
 * no opinion about generation and no import of it. `null` means "nothing follows"
 * — a document uploaded on its own, read for later use.
 */
export interface ReadContinuation {
  type: 'generateIssue';
  payload: Record<string, unknown>;
}

export interface ReadSourceDocPayload {
  docId: string;
  /** OCR page cap for this document. Defaults to the job path's full cap. */
  maxPages?: number;
  onDone?: ReadContinuation | null;
}

/** Digest shown in the Uploads list — a cheap preview, never what generation reads. */
function previewOf(name: string, text: string, coverage: SourceCoverage): { title: string; summary: string } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const title = (lines[0] ?? name).slice(0, 120);
  const body = lines.slice(0, 3).join(' ').slice(0, 280) || `Uploaded document “${name}”.`;
  // The coverage note goes in the PREVIEW too, not just the prompt: "we read 6 of
  // 40 pages" was previously computed, appended to a summary, and then dropped by
  // a caller that preferred the full text — so nobody was ever told.
  return { title, summary: coverage.truncated ? `${body} (${coverage.reason})` : body };
}

/**
 * Copy a twin's chunks instead of re-reading the same bytes.
 *
 * The largest cost saving in the pipeline: the same brief attached to three issues
 * is OCR'd once. Safe because the chunk text is a pure function of the bytes, and
 * the bytes are identical by sha256.
 */
async function adoptTwin(doc: SourceDoc, twin: SourceDoc): Promise<'ready' | 'partial' | null> {
  const chunks = await loadChunks(String(twin._id));
  if (chunks.length === 0) return null;
  await writeChunks(
    String(doc._id),
    String(doc.magazineId),
    chunks.map((c) => ({ pageNo: c.pageNo, seq: c.seq, text: c.text, chars: c.chars, terms: c.terms })),
  );
  console.log(`[readSourceDoc] ${doc.originalName}: adopted ${chunks.length} chunks from an identical earlier upload`);
  return finishReading(String(doc._id), { coverage: twin.coverage, kind: twin.kind, digest: twin.digest });
}

/**
 * Read one document into chunks. Idempotent and resumable: re-running it after a
 * crash re-reads only the units that have no rows.
 *
 * Returns the terminal status so the worker can decide about the continuation.
 * THROWS on a failure worth retrying — the queue owns retry policy, and this
 * handler must not quietly succeed on a document it could not read.
 */
export async function readSourceDoc(payload: ReadSourceDocPayload): Promise<'ready' | 'partial' | 'failed'> {
  const doc = await getSourceDoc(payload.docId);
  if (!doc) throw new Error(`Source document ${payload.docId} not found.`);

  // Already done — a duplicate delivery, or a retry after the continuation failed.
  // Re-reading would spend OCR to reach the same rows.
  if (doc.status === 'ready' || doc.status === 'partial') {
    console.log(`[readSourceDoc] ${doc.originalName}: already ${doc.status}, nothing to do`);
    return doc.status;
  }

  const twin = await findReadableTwin(doc.contentHash, String(doc._id));
  if (twin) {
    if (!(await beginReading(String(doc._id)))) throw new Error('Could not claim that document for reading.');
    const adopted = await adoptTwin(doc, twin);
    if (adopted) return adopted;
    // The twin turned out to have no chunks after all — fall through and read.
  } else if (!(await beginReading(String(doc._id)))) {
    throw new Error('Could not claim that document for reading.');
  }

  let bytes: Buffer;
  try {
    bytes = await storage.downloadObject(doc.s3Key);
  } catch (e) {
    // Storage is transient often enough that this must be retryable, not terminal.
    throw new Error(`Could not fetch “${doc.originalName}” from storage: ${e instanceof Error ? e.message : e}`);
  }

  // What we already hold. THE resume decision, and it comes from the rows.
  const already = await pagesWithChunks(String(doc._id));
  if (already.size > 0) {
    console.log(`[readSourceDoc] ${doc.originalName}: resuming — ${already.size} unit(s) already stored`);
  }

  let kind: SourceDocKind = doc.kind;
  let firstText = '';
  try {
    const result = await readDocumentUnits({
      bytes,
      contentType: doc.contentType,
      name: doc.originalName,
      skipUnits: already,
      maxPages: payload.maxPages ?? JOB_MAX_OCR_PAGES,
      onUnit: async (unit) => {
        if (!unit.text.trim()) return; // a genuinely blank page stores no rows
        if (!firstText) firstText = unit.text;
        // Persisted per unit, BEFORE the next is read: a kill here costs one unit.
        await writeChunks(String(doc._id), String(doc.magazineId), chunkDocument(unit.text, { pageNo: unit.pageNo }));
      },
    });
    kind = result.kind;

    // Coverage from the ROWS, not from the reader's own count — the two can differ
    // if a unit produced no chunks, and the rows are what consumers will read.
    const stored = await pagesWithChunks(String(doc._id));
    const coverage = coverageOf({
      pagesRead: kind === 'pdf-ocr' ? stored : stored.size > 0 ? 1 : 0,
      pagesTotal: kind === 'pdf-ocr' ? result.unitsTotal : 1,
      skipped: result.failed,
      reason: result.reason,
    });

    if (coverage.pagesRead === 0) {
      throw new Error(
        kind === 'pdf-ocr'
          ? "I couldn't read any text from this PDF — it looks like a photo/scan with no legible text."
          : `No readable text was found in “${doc.originalName}”.`,
      );
    }

    const status = await finishReading(String(doc._id), {
      coverage,
      kind,
      digest: previewOf(doc.originalName, firstText, coverage),
    });
    if (!status) {
      // Someone else moved this document on while we read (watchdog, or a second
      // delivery). Believe them rather than overwriting.
      const fresh = await getSourceDoc(payload.docId);
      console.warn(`[readSourceDoc] ${doc.originalName}: status was taken by another actor (${fresh?.status ?? 'gone'})`);
      return fresh?.status === 'ready' || fresh?.status === 'partial' ? fresh.status : 'failed';
    }
    console.log(
      `[readSourceDoc] ${doc.originalName}: ${status} — ${coverage.pagesRead}/${coverage.pagesTotal} units, ${stored.size} stored${coverage.reason ? ` (${coverage.reason})` : ''}`,
    );
    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failReading(String(doc._id), message);
    throw err; // the queue decides whether to retry
  }
}

/** Discard a document's chunks so the next read starts clean. For a corrupted
 *  partial read — not part of the normal resume path, which keeps them. */
export async function resetSourceDoc(docId: string): Promise<void> {
  const removed = await deleteChunks(docId);
  await noteProgress(docId, { pagesRead: 0, pagesTotal: 0, truncated: false, reason: '' });
  console.log(`[readSourceDoc] reset ${docId}: dropped ${removed} chunk(s)`);
}
