// ---------------------------------------------------------------------------
// Magazine Builder v2 — the source-document store's database layer.
//
// Kept apart from sourceStore.ts on purpose: that file is pure (chunking, term
// extraction, the coverage arithmetic) and testable without a Mongo. This one is
// the only place that writes.
//
// TWO RULES HOLD THE RESUMABILITY TOGETHER, and both live here:
//
//   1. Chunk writes are IDEMPOTENT, keyed on {docId, pageNo, seq}. Writing page 5
//      twice is a no-op, not a duplicate, so a worker killed mid-document can
//      simply be run again.
//   2. Progress is READ BACK FROM THE ROWS (pagesWithChunks), never from a
//      counter. A counter is a second answer to a question the rows already
//      answer, and a crash between the two writes makes them disagree — which is
//      how a half-read document comes to look complete.
// ---------------------------------------------------------------------------

import crypto from 'crypto';

import { ObjectId } from 'mongodb';

import { db, rawCollection } from '../db.js';
import { COL } from './collections.js';
import {
  isReadable,
  statusForCoverage,
  type ChunkDraft,
  type SourceCoverage,
  type SourceDoc,
  type SourceDocKind,
  type SourceDocStatus,
  type ReadEstimate,
  type SourceChunk,
} from './sourceStore.js';

/** sha256 of the bytes — the dedupe key. */
export function contentHashOf(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const nowIso = (): string => new Date().toISOString();

export interface NewSourceDoc {
  magazineId: string;
  ownerId: string;
  originalName: string;
  contentType: string;
  size: number;
  s3Key: string;
  url: string;
  /**
   * Filled in by the READ JOB, not at upload.
   *
   * Hashing needs the bytes, and the API has no business pulling 50MB through
   * itself to compute one — the whole point of the job is that the heavy handling
   * happens where nothing is waiting. The job downloads the file anyway, so it
   * hashes there and looks for a twin before doing the expensive part. Dedupe
   * exists to skip OCR, not to skip a download.
   */
  contentHash?: string;
}

/** Insert a document in `queued`. The read job is what moves it on. */
export async function createSourceDoc(input: NewSourceDoc): Promise<string> {
  const at = nowIso();
  return db.collection(COL.sourceDocs).insertOne({
    ...input,
    contentHash: input.contentHash ?? '',
    status: 'queued' satisfies SourceDocStatus,
    kind: 'text' satisfies SourceDocKind, // corrected by the reader once it knows
    coverage: { pagesRead: 0, pagesTotal: 0, truncated: false, reason: '' } satisfies SourceCoverage,
    digest: { title: input.originalName, summary: '' },
    error: '',
    // The batch cursor, initialised so the first sweep starts at page 1.
    readSwept: 0,
    failedUnits: [] as number[],
    ocrUnits: [] as number[],
    createdAt: at,
    updatedAt: at,
    readyAt: null,
    deletedAt: null,
  });
}

export async function getSourceDoc(docId: string): Promise<SourceDoc | null> {
  try {
    return (await db.collection(COL.sourceDocs).findById(String(docId))) as SourceDoc | null;
  } catch {
    return null;
  }
}

/** An issue's documents, newest first. */
export async function listSourceDocs(magazineId: string): Promise<SourceDoc[]> {
  const rows = (await db.collection(COL.sourceDocs).find({ magazineId: String(magazineId), deletedAt: null })) as SourceDoc[];
  return rows.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

/**
 * Another document with the same bytes that has ALREADY been read.
 *
 * The dedupe that stops a re-upload paying for OCR twice — the single largest
 * cost in this pipeline. Scoped to readable statuses: a sibling still `reading`
 * is no use to us, and one that `failed` has nothing to copy.
 */
export async function findReadableTwin(contentHash: string, excludeDocId?: string): Promise<SourceDoc | null> {
  const rows = (await db
    .collection(COL.sourceDocs)
    .find({ contentHash: String(contentHash), deletedAt: null })) as SourceDoc[];
  return (
    rows.find((d) => String(d._id) !== String(excludeDocId ?? '') && isReadable(d.status) && d.coverage?.pagesRead > 0) ??
    null
  );
}

/**
 * Claim a document for reading. Compare-and-set, so two workers cannot both
 * start on it. `failed` is re-claimable — that is what a queue retry is.
 */
export async function beginReading(docId: string, expected: SourceDocStatus[] = ['queued', 'failed', 'reading']): Promise<boolean> {
  for (const from of expected) {
    const ok = await db
      .collection(COL.sourceDocs)
      .updateOneIf(String(docId), { status: from }, { status: 'reading', error: '', updatedAt: nowIso() });
    if (ok) return true;
  }
  return false;
}

/**
 * Operations per bulkWrite. MongoDB splits a larger batch itself, but only after
 * the whole thing has been built and shipped as one message — so an unbounded batch
 * is a memory and 16MB-document-limit problem on our side of the wire, not the
 * server's. Adopting a twin's chunks is where this bites: that copies EVERY chunk of
 * a document in one call, which for a thousand-page report is tens of thousands of
 * operations built in memory at once.
 */
const BULK_CHUNK_OPS = 500;

/**
 * Write chunks. IDEMPOTENT: keyed on {docId, pageNo, seq}, so a page written twice
 * is overwritten rather than duplicated, and a resumed read needs no cleanup pass.
 * Uses the raw driver because the shared wrapper only updates by _id and this needs
 * a compound-key upsert.
 *
 * Batched, and `ordered: false` within each batch: order is irrelevant here (every
 * operation targets a distinct key), and unordered lets one bad row fail without
 * taking the rest of the page with it.
 */
export async function writeChunks(docId: string, magazineId: string, drafts: ChunkDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const col = await rawCollection(COL.sourceChunks);
  const opFor = (d: ChunkDraft) => ({
    updateOne: {
      // String ids: the raw driver does not get the wrapper's _id coercion, and a
      // mismatched type here matches nothing and silently inserts a duplicate.
      filter: { docId: String(docId), pageNo: d.pageNo, seq: d.seq },
      update: {
        $set: {
          docId: String(docId),
          magazineId: String(magazineId),
          pageNo: d.pageNo,
          seq: d.seq,
          text: d.text,
          chars: d.chars,
          terms: d.terms,
        },
      },
      upsert: true,
    },
  });
  let written = 0;
  for (let i = 0; i < drafts.length; i += BULK_CHUNK_OPS) {
    const res = await col.bulkWrite(drafts.slice(i, i + BULK_CHUNK_OPS).map(opFor), { ordered: false });
    written += (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
  }
  return written;
}

/**
 * Which pages of this document already have chunks — what a resumed read skips.
 * Straight from the rows, which is the whole point.
 */
export async function pagesWithChunks(docId: string): Promise<Set<number>> {
  const col = await rawCollection(COL.sourceChunks);
  const pages = (await col.distinct('pageNo', { docId: String(docId) })) as number[];
  return new Set(pages.map((p) => Number(p)));
}

/**
 * The document's OPENING text — its first chunk in document order.
 *
 * Exists because the digest shown in the Uploads list must describe the document,
 * and a batched read finishes holding the text of the LAST batch. Taking the digest
 * from whatever the reader happened to have in hand gave a 500-page report a title
 * lifted from page 476. One indexed query answers it properly, at any batch count.
 */
export async function firstChunkText(docId: string): Promise<string> {
  const col = await rawCollection(COL.sourceChunks);
  const rows = (await col
    .find({ docId: String(docId) })
    .sort({ pageNo: 1, seq: 1 })
    .limit(1)
    .toArray()) as unknown as SourceChunk[];
  return rows[0]?.text ?? '';
}

/**
 * The opening of every page, for the document map (sourceOutline.ts).
 *
 * `seq: 0` is the first chunk of each page, so this is one small row per page
 * rather than the document — and it is projected to a prefix server-side, so a
 * 500-page report costs a few tens of kilobytes to map rather than megabytes to
 * load. Uses the {docId, pageNo, seq} index it already has for the sort.
 *
 * Page 0 is excluded: that is the "whole document as one body" unit a DOCX or text
 * file produces, and a map of one entry is not a map.
 */
export async function loadOutlineHeads(docId: string): Promise<Array<{ pageNo: number; text: string }>> {
  const col = await rawCollection(COL.sourceChunks);
  const rows = (await col
    .aggregate([
      { $match: { docId: String(docId), seq: 0, pageNo: { $gt: 0 } } },
      { $sort: { pageNo: 1 } },
      // Only the top of the chunk: the heading is in the first line or two, and
      // pulling whole chunks here would defeat the point of a cheap map.
      { $project: { _id: 0, pageNo: 1, text: { $substrCP: ['$text', 0, 400] } } },
    ])
    .toArray()) as Array<{ pageNo: number; text: string }>;
  return rows;
}

/** Every chunk of a document, in document order. */
export async function loadChunks(docId: string): Promise<SourceChunk[]> {
  const col = await rawCollection(COL.sourceChunks);
  return (await col
    .find({ docId: String(docId) })
    .sort({ pageNo: 1, seq: 1 })
    .toArray()) as unknown as SourceChunk[];
}

/**
 * Chunks spread EVENLY across a document, for a retrieval with nothing to match on.
 *
 * The fallback used to be `.sort({pageNo,seq}).limit(400)`, which is the first 400
 * chunks — the head of the document. Retrieval then took what it believed was a
 * "representative spread across the whole document" from a set that only ever
 * covered the opening pages, so for anything long the planner saw the front matter
 * and nothing else. A silent one, because the text it got was real text.
 *
 * Two queries rather than one, deliberately. The first pulls only the KEYS (a few
 * bytes each), the second fetches the chosen rows by `_id`. That keeps the sampling
 * exact and deterministic without depending on `$setWindowFields`, which would tie
 * this to a MongoDB version for a query that runs on every page draft.
 */
async function sampleChunksAcross(docId: string, limit: number): Promise<SourceChunk[]> {
  const col = await rawCollection(COL.sourceChunks);
  const keys = (await col
    .find({ docId: String(docId) })
    .project({ _id: 1 })
    .sort({ pageNo: 1, seq: 1 })
    .toArray()) as Array<{ _id: unknown }>;
  if (keys.length === 0) return [];
  if (keys.length <= limit) {
    return (await col
      .find({ docId: String(docId) })
      .sort({ pageNo: 1, seq: 1 })
      .toArray()) as unknown as SourceChunk[];
  }
  // Evenly spaced by position, so the sample covers the beginning, middle and end
  // in the same proportions the document does.
  const picked: unknown[] = [];
  for (let i = 0; i < limit; i++) {
    picked.push(keys[Math.floor((i * keys.length) / limit)]!._id);
  }
  const rows = (await col
    .find({ _id: { $in: picked } as never })
    .sort({ pageNo: 1, seq: 1 })
    .toArray()) as unknown as SourceChunk[];
  return rows;
}

/**
 * Candidate chunks for a retrieval: the ones most likely to be worth scoring.
 *
 * `limit` bounds the read so a 500-page report cannot pull its whole self into
 * memory for one page draft. The bug this replaces was in HOW it bounded: matching
 * chunks were sorted by POSITION and then cut at 400, so in a long document every
 * match past the cut was invisible to scoring — a passage on page 300 could not be
 * retrieved at all, however well it matched, because 400 weaker matches came first
 * in the document. The candidate set has to be ranked before it is cut.
 *
 * Ranked here by how many of the query's DISTINCT terms a chunk carries, which is
 * the same primary signal the real scorer uses (`buildScorer`: distinct terms ×
 * 1000 + occurrences), so the 400 kept are the 400 the scorer would have wanted.
 * The scorer still re-scores them from `text` — this only decides who gets in.
 */
export async function loadCandidateChunks(docId: string, terms: string[], limit = 400): Promise<SourceChunk[]> {
  const col = await rawCollection(COL.sourceChunks);
  if (terms.length > 0) {
    const hit = (await col
      .aggregate(
        [
          { $match: { docId: String(docId), terms: { $in: terms } } },
          // $setIntersection over the precomputed terms: no text scanning, and it
          // uses the {docId, terms} index for the match.
          { $addFields: { _overlap: { $size: { $setIntersection: ['$terms', terms] } } } },
          // Position breaks ties, so the same query always returns the same rows —
          // retrieval is expected to be deterministic.
          { $sort: { _overlap: -1, pageNo: 1, seq: 1 } },
          { $limit: Math.max(1, Math.floor(limit)) },
          { $project: { _overlap: 0 } },
        ],
        { allowDiskUse: true },
      )
      .toArray()) as unknown as SourceChunk[];
    if (hit.length > 0) {
      // Back into document order: the scorer ranks, but the prompt reads better when
      // the passages it keeps arrive in the order the document put them in.
      return hit.sort((a, b) => a.pageNo - b.pageNo || a.seq - b.seq);
    }
  }
  // Nothing to match on, or nothing matched: a spread across the whole document, so
  // retrieval's breadth sample is actually a breadth sample.
  return sampleChunksAcross(String(docId), Math.max(1, Math.floor(limit)));
}

/** Drop a document's chunks (a re-read from scratch, or a deleted document). */
export async function deleteChunks(docId: string): Promise<number> {
  const col = await rawCollection(COL.sourceChunks);
  const res = await col.deleteMany({ docId: String(docId) });
  return res.deletedCount ?? 0;
}

/**
 * Finish a read: coverage decides the status, so `ready` cannot be set on a
 * document that was only partly read. Compare-and-set from `reading` so a
 * watchdog that already failed this document is not overwritten.
 */
export async function finishReading(
  docId: string,
  opts: { coverage: SourceCoverage; kind: SourceDocKind; digest: { title: string; summary: string } },
): Promise<'ready' | 'partial' | null> {
  const status = statusForCoverage(opts.coverage);
  const at = nowIso();
  const ok = await db.collection(COL.sourceDocs).updateOneIf(
    String(docId),
    { status: 'reading' },
    { status, coverage: opts.coverage, kind: opts.kind, digest: opts.digest, error: '', readyAt: at, updatedAt: at },
  );
  return ok ? status : null;
}

/** Record a failed read. The queue owns the retry; this is the terminal note. */
export async function failReading(docId: string, message: string): Promise<void> {
  await db
    .collection(COL.sourceDocs)
    .updateOne(String(docId), { status: 'failed', error: message.slice(0, 500), updatedAt: nowIso() });
}

/**
 * Claim the exclusive right to enqueue an issue's generation, once.
 *
 * Compare-and-set against a field that starts absent — Mongo matches a missing
 * field with `null` — so of N reads finishing simultaneously, exactly one wins and
 * the issue is generated once rather than N times.
 */
export async function claimGeneration(issueId: string): Promise<boolean> {
  return !!(await db
    .collection(COL.magazines)
    .updateOneIf(String(issueId), { genChained: null }, { genChained: true, updatedAt: nowIso() }));
}

/** Record the content hash once the job has the bytes. Written before the twin
 *  lookup, so a concurrent read of the same file can find this one. */
export async function setContentHash(docId: string, contentHash: string): Promise<void> {
  await db.collection(COL.sourceDocs).updateOne(String(docId), { contentHash, updatedAt: nowIso() });
}

/** Progress for the UI while a read is running. Advisory ONLY — never the input
 *  to a resume decision, which reads the rows. */
export async function noteProgress(docId: string, coverage: SourceCoverage): Promise<void> {
  await db.collection(COL.sourceDocs).updateOne(String(docId), { coverage, updatedAt: nowIso() });
}

/** Rewind the batch cursor for a read that is starting over from scratch. The ONE
 *  place allowed to move it backwards, and only alongside dropping the chunks it
 *  described — a rewind without that is the infinite re-read noteSweep prevents. */
export async function resetSweep(docId: string): Promise<void> {
  await db
    .collection(COL.sourceDocs)
    .updateOne(String(docId), { readSwept: 0, failedUnits: [] as number[], ocrUnits: [] as number[], updatedAt: nowIso() });
}

/**
 * Add page numbers to the document's `failedUnits` / `ocrUnits` sets, in ONE write.
 *
 * The shared wrapper's addToSet takes a single value, so recording a batch through
 * it meant up to fifty round trips per batch for bookkeeping. `$each` does it in
 * one. Sets rather than counters throughout: a retried batch must not be able to
 * inflate either the pages reported unread or the pages reported as costing money.
 *
 * The id coercion mirrors db.ts because the raw driver does not get the wrapper's —
 * these rows are inserted with ObjectId ids, and a string filter would match nothing
 * and report success.
 */
async function addUnits(docId: string, sets: Record<string, number[]>): Promise<void> {
  const add: Record<string, { $each: number[] }> = {};
  for (const [field, values] of Object.entries(sets)) {
    const clean = [...new Set(values.map((v) => Math.floor(v)).filter((v) => Number.isFinite(v)))];
    if (clean.length > 0) add[field] = { $each: clean };
  }
  if (Object.keys(add).length === 0) return;
  const col = await rawCollection(COL.sourceDocs);
  const update = { $addToSet: add };
  try {
    await col.updateOne({ _id: new ObjectId(String(docId)) }, update);
  } catch {
    await col.updateOne({ _id: String(docId) as never }, update);
  }
}

/** Store the latest cost reading. Advisory only — nothing branches on it, so a
 *  failed write costs a stale number on a screen, never a wrong read. */
export async function noteEstimate(docId: string, estimate: ReadEstimate): Promise<void> {
  await db.collection(COL.sourceDocs).updateOne(String(docId), { estimate, updatedAt: nowIso() });
}

/**
 * Record what a batch swept, so the next one knows where to start.
 *
 * TWO PROPERTIES, both load-bearing:
 *
 *   1. The cursor only moves FORWARD. The compare-and-set is on `$lt`, so a
 *      duplicate or retried batch cannot rewind it — and a rewind is not a slow
 *      re-read but an infinite one, the batch that requeues itself at the page it
 *      started on. The `$or` covers a document written before this field existed,
 *      where a bare `$lt` matches nothing and the read would never advance.
 *
 *   2. Failures are written BEFORE the cursor, in that order, deliberately. A crash
 *      between the two leaves failures recorded for pages the cursor has not passed
 *      — so those pages are simply read again, and sweptCoverage discards the stale
 *      entries once they produce rows. The other order would sweep past a failed
 *      page with nothing recording that it failed, and the document would claim to
 *      have been read in full.
 */
export async function noteSweep(
  docId: string,
  opts: { swept: number; failedUnits?: number[]; ocrUnits?: number[] },
): Promise<void> {
  const id = String(docId);
  const at = nowIso();
  await addUnits(id, { failedUnits: opts.failedUnits ?? [], ocrUnits: opts.ocrUnits ?? [] });
  const swept = Math.max(0, Math.floor(opts.swept));
  await db
    .collection(COL.sourceDocs)
    .updateOneIf(id, { $or: [{ readSwept: null }, { readSwept: { $lt: swept } }] }, { readSwept: swept, updatedAt: at });
}
