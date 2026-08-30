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
import { readDocumentUnits, JOB_BATCH_PAGES } from '../agent/documentIngest.js';
import {
  chunkDocument,
  coverageOf,
  isPaginated,
  isReadable,
  mergeKind,
  nextBatchFrom,
  projectRead,
  sweepAdvanced,
  sweptCoverage,
  type SourceCoverage,
  type SourceDoc,
  type SourceDocKind,
} from './sourceStore.js';
import { enqueueJob } from './jobs.js';
import { OCR_USD_PER_PAGE } from './config.js';
import {
  beginReading,
  claimGeneration,
  contentHashOf,
  deleteChunks,
  failReading,
  findReadableTwin,
  finishReading,
  firstChunkText,
  getSourceDoc,
  loadChunks,
  noteEstimate,
  noteProgress,
  noteSweep,
  pagesWithChunks,
  resetSweep,
  setContentHash,
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
  /** The issue whose generation is waiting on this read — see JobPayloads. Set only
   *  when something IS waiting, so an unrelated read cannot fail a live issue. */
  issueId?: string;
  /**
   * A page cap for this document. Absent means EVERY page, which is both the
   * default and the point — the job path has no cap. Present only for a caller that
   * deliberately wants a preview of the first few pages.
   */
  maxPages?: number;
  /**
   * Pages this batch may read. Defaults to JOB_BATCH_PAGES.
   *
   * Note what is NOT here: where to resume. That lives on the document row and
   * nowhere else. A copy in the payload would be a second answer to the same
   * question, and a stale one would either re-read pages or — far worse — skip them.
   */
  batchPages?: number;
  onDone?: ReadContinuation | null;
}

/**
 * Report that work is still happening. Called per page, throttled by the caller.
 *
 * Without this a long read is killed by the watchdog on GET /issues/:id — the very
 * endpoint the studio polls to show reading progress. See jobHealth.ts.
 */
export type Beat = () => Promise<void>;

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
 * Read ONE BATCH of a document into chunks, re-enqueueing itself while pages
 * remain. Idempotent and resumable: re-running it after a crash re-reads only the
 * units that have no rows.
 *
 * Returns `'reading'` when a batch finished and another is queued, or the terminal
 * status so the worker can decide about the continuation. THROWS on a failure worth
 * retrying — the queue owns retry policy, and this handler must not quietly succeed
 * on a document it could not read.
 */
export async function readSourceDoc(
  payload: ReadSourceDocPayload,
  beat?: Beat,
): Promise<'ready' | 'partial' | 'failed' | 'reading'> {
  const doc = await getSourceDoc(payload.docId);
  if (!doc) throw new Error(`Source document ${payload.docId} not found.`);

  // Already done — a duplicate delivery, or a retry after the continuation failed.
  // Re-reading would spend OCR to reach the same rows.
  if (doc.status === 'ready' || doc.status === 'partial') {
    console.log(`[readSourceDoc] ${doc.originalName}: already ${doc.status}, nothing to do`);
    return doc.status;
  }

  if (!(await beginReading(String(doc._id)))) throw new Error('Could not claim that document for reading.');

  let bytes: Buffer;
  try {
    bytes = await storage.downloadObject(doc.s3Key);
  } catch (e) {
    // Storage is transient often enough that this must be retryable, not terminal.
    throw new Error(`Could not fetch “${doc.originalName}” from storage: ${e instanceof Error ? e.message : e}`);
  }

  // Hash HERE, not at upload: the API would have had to pull the whole file
  // through itself to do it, and the job already holds the bytes. Persisted before
  // the twin lookup so a concurrent read of the same file can see this one.
  const contentHash = doc.contentHash || contentHashOf(bytes);
  if (contentHash !== doc.contentHash) await setContentHash(String(doc._id), contentHash);

  // An identical file already read? Adopt its chunks rather than paying for OCR
  // twice — the same brief attached to three issues is read once.
  const twin = await findReadableTwin(contentHash, String(doc._id));
  if (twin) {
    const adopted = await adoptTwin(doc, twin);
    if (adopted) return adopted;
    // The twin turned out to have no chunks after all — fall through and read.
  }

  // Where this batch starts. THE DOCUMENT ROW IS THE AUTHORITY — see the payload
  // type for why there is no copy of this in the job.
  let cursor = Math.max(0, Math.floor(Number(doc.readSwept) || 0));

  // What we already hold. THE resume decision, and it comes from the rows.
  let already = await pagesWithChunks(String(doc._id));

  // Rows from before text extraction was paginated: a PDF's text layer used to be
  // stored as ONE chunk at pageNo 0. Those cannot be merged with per-page rows —
  // retrieval would serve the same passage twice, once numbered and once not — so a
  // half-read document carrying one starts again. Only reachable for a document
  // still queued/reading/failed across the change; a finished one returned above.
  if (already.has(0) && doc.contentType === 'application/pdf') {
    console.warn(`[readSourceDoc] ${doc.originalName}: dropping pre-pagination rows and re-reading`);
    await deleteChunks(String(doc._id));
    await resetSweep(String(doc._id));
    already = new Set<number>();
    cursor = 0; // the cursor described rows that no longer exist
  }

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
      startUnit: cursor + 1,
      ocrBudget: payload.batchPages ?? JOB_BATCH_PAGES,
      // Undefined means EVERY page. The job path has no page cap — see
      // documentIngest, where the constant that used to be here was deleted.
      maxPages: payload.maxPages,
      onUnit: async (unit) => {
        // Beat FIRST, and for every unit including blank ones: a run of blank
        // pages is still progress, and going quiet through them would look like
        // death to the watchdog.
        await beat?.();
        if (!unit.text.trim()) return; // a genuinely blank page stores no rows
        if (!firstText) firstText = unit.text;
        // Persisted per unit, BEFORE the next is read: a kill here costs one unit.
        await writeChunks(String(doc._id), String(doc.magazineId), chunkDocument(unit.text, { pageNo: unit.pageNo }));
      },
    });
    // OCR is sticky across batches — see mergeKind. A document whose scanned pages
    // were in batch 2 must not report itself as a clean text extraction because
    // batch 9 happened to be typeset.
    kind = mergeKind(doc.kind, result.kind);
    const paginated = isPaginated(kind);

    // Every page of this batch errored — a provider outage, not a document we
    // cannot read. Throw BEFORE the cursor moves, so the queue's retry re-reads
    // THIS batch rather than sweeping past 25 pages it never saw. Bounded by
    // maxAttempts, after which the job fails honestly.
    if (result.attempted > 0 && result.ok === 0) {
      throw new Error(
        `Reading “${doc.originalName}” failed on every page of this batch — the reader hit a temporary error. The batch will be retried.`,
      );
    }

    // Record the sweep, and only now: failures first, then the cursor. See noteSweep
    // — that order is what makes a crash here cost a re-read rather than a document
    // that claims to have been read in full.
    if (paginated) {
      await noteSweep(String(doc._id), {
        swept: result.sweptTo,
        failedUnits: result.failedUnits,
        ocrUnits: result.ocrUnits,
      });
    }

    const stored = await pagesWithChunks(String(doc._id));

    // A scan whose first batch is legibly blank is not a document we can read, and
    // saying so now saves OCR on the remaining hundreds of pages. Only on the FIRST
    // batch, and only when nothing errored: a later run of blank pages mid-document
    // is normal, and a batch that was entirely skipped proves nothing.
    if (paginated && cursor === 0 && stored.size === 0 && result.attempted > 0 && result.failedUnits.length === 0) {
      throw new Error(
        kind === 'pdf-ocr'
          ? "I couldn't read any text from this PDF — it looks like a photo/scan with no legible text."
          : `The first ${result.attempted} page${result.attempted === 1 ? '' : 's'} of “${doc.originalName}” are blank — there is nothing here to read.`,
      );
    }

    // Coverage, computed ONCE and used both mid-read and at the end. Paginated
    // documents count what was swept minus what demonstrably could not be read, so
    // a scan with blank pages is `ready` rather than eternally `partial`; everything
    // else is one unit and counts rows.
    const coverage =
      paginated
        ? sweptCoverage({
            swept: result.sweptTo,
            total: result.unitsTotal,
            failedUnits: [...(doc.failedUnits ?? []), ...result.failedUnits],
            storedPages: stored,
            outOfTime: result.outOfTime,
          })
        : coverageOf({ pagesRead: stored.size > 0 ? 1 : 0, pagesTotal: 1 });

    // What this read has cost, and what it is going to. Recomputed every batch from
    // the SETS on the document, never accumulated — so a retried batch cannot inflate
    // it. Stored while the read is still running, because the number is only useful
    // to somebody deciding whether to let a 900-page scan finish.
    if (paginated) {
      const ocrSoFar = new Set([...(doc.ocrUnits ?? []), ...result.ocrUnits]).size;
      await noteEstimate(
        String(doc._id),
        projectRead({
          pagesSeen: result.sweptTo,
          ocrPages: ocrSoFar,
          pagesTotal: result.unitsTotal,
          usdPerOcrPage: OCR_USD_PER_PAGE,
        }),
      );
    }

    // More to read: persist progress for the UI, then re-enqueue and hand the
    // worker back. The requeued row is NEW, so claimOne's oldest-first ordering
    // puts it behind whatever arrived while this batch ran — which is the whole
    // point, and why a 5,000-page scan no longer blocks every other magazine.
    const resumeAt = paginated ? nextBatchFrom(result.sweptTo, result.unitsCeiling) : null;
    if (resumeAt !== null) {
      // The termination guarantee. A batch that requeues itself where it started
      // would run for ever, and quietly: the queue looks busy, the document stays
      // `reading`, and the issue waiting on it is never generated.
      if (!sweepAdvanced(cursor, resumeAt)) {
        throw new Error(
          `Reading “${doc.originalName}” made no progress at page ${cursor + 1} — refusing to requeue. It will be retried.`,
        );
      }
      await noteProgress(String(doc._id), coverage);
      await enqueueJob('readSourceDoc', payload);
      console.log(
        `[readSourceDoc] ${doc.originalName}: batch ${cursor + 1}–${result.sweptTo} of ${result.unitsTotal} done (${stored.size} pages stored); requeued from ${resumeAt}`,
      );
      return 'reading';
    }

    // Nothing readable came out of the whole document. Distinct from the blank-scan
    // check above: that one is an early exit on the first batch, this one is the
    // verdict once the sweep is over.
    if (stored.size === 0) {
      throw new Error(
        kind === 'pdf-ocr'
          ? "I couldn't read any text from this PDF — it looks like a photo/scan with no legible text."
          : `No readable text was found in “${doc.originalName}”.`,
      );
    }

    // The digest describes the DOCUMENT, so it comes from the document's opening —
    // read back from the rows, not from whatever text this run happened to end
    // holding. Once a read is batched, the last batch's text is page 476 of 500, and
    // a report titled after page 476 is worse than one titled after its filename.
    const opening = (await firstChunkText(String(doc._id))) || firstText;
    const status = await finishReading(String(doc._id), {
      coverage,
      kind,
      digest: previewOf(doc.originalName, opening, coverage),
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

/**
 * Enqueue the follow-on work, but only once EVERY document has settled.
 *
 * The barrier without the wait. Handing the continuation to one document would
 * start generation while the others were still being read, and the issue would be
 * built from one attachment with nobody told — the silent-partial failure this
 * whole design is against. So every read carries the continuation and this decides
 * whether it is the last one out.
 *
 * "Settled" includes FAILED on purpose: one unreadable attachment must not strand
 * the issue in `processing` forever waiting for a read that will never come. We go
 * ahead with whatever was readable, and only refuse when nothing was.
 *
 * The compare-and-set is what makes it safe under concurrency: two reads finishing
 * in the same instant both see every document settled, and exactly one wins the
 * right to enqueue. Without it the issue would be generated twice.
 */
export async function chainIfReady(onDone: ReadContinuation | null | undefined): Promise<'enqueued' | 'waiting' | 'nothing-readable' | 'already-chained' | 'no-continuation'> {
  if (!onDone) return 'no-continuation';
  const payload = onDone.payload as { issueId?: string; docIds?: string[] };
  const issueId = String(payload.issueId ?? '');
  const docIds = Array.isArray(payload.docIds) ? payload.docIds : [];
  if (!issueId || docIds.length === 0) return 'no-continuation';

  const docs = await Promise.all(docIds.map((id) => getSourceDoc(id)));
  const settled = docs.every((d) => !d || d.status === 'ready' || d.status === 'partial' || d.status === 'failed');
  if (!settled) return 'waiting';
  if (!docs.some((d) => d && isReadable(d.status))) return 'nothing-readable';

  const claimed = await claimGeneration(issueId);
  if (!claimed) return 'already-chained';
  await enqueueJob(onDone.type, payload as never);
  return 'enqueued';
}

/** Discard a document's chunks so the next read starts clean. For a corrupted
 *  partial read — not part of the normal resume path, which keeps them. */
export async function resetSourceDoc(docId: string): Promise<void> {
  const removed = await deleteChunks(docId);
  // Rewind the batch cursor TOGETHER with dropping the chunks. Either alone is a
  // bug: the cursor without the chunks re-reads pages we hold, and the chunks
  // without the cursor leaves a document the sweep believes it has already covered.
  await resetSweep(docId);
  await noteProgress(docId, { pagesRead: 0, pagesTotal: 0, truncated: false, reason: '' });
  console.log(`[readSourceDoc] reset ${docId}: dropped ${removed} chunk(s)`);
}
