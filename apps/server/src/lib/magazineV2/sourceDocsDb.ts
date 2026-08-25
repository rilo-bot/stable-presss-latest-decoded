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
 * Write one page's chunks. IDEMPOTENT: keyed on {docId, pageNo, seq}, so a page
 * written twice is overwritten rather than duplicated, and a resumed read needs
 * no cleanup pass. Uses the raw driver because the shared wrapper only updates by
 * _id and this needs a compound-key upsert.
 */
export async function writeChunks(docId: string, magazineId: string, drafts: ChunkDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const col = await rawCollection(COL.sourceChunks);
  const ops = drafts.map((d) => ({
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
  }));
  const res = await col.bulkWrite(ops, { ordered: false });
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
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

/** Every chunk of a document, in document order. */
export async function loadChunks(docId: string): Promise<SourceChunk[]> {
  const col = await rawCollection(COL.sourceChunks);
  return (await col
    .find({ docId: String(docId) })
    .sort({ pageNo: 1, seq: 1 })
    .toArray()) as unknown as SourceChunk[];
}

/**
 * Candidate chunks for a retrieval: those carrying any of `terms`, plus — when
 * terms are absent or match nothing — the document's chunks in order so a breadth
 * sample is still possible. `limit` bounds the read so a 500-page report cannot
 * pull its whole self into memory for one page draft.
 */
export async function loadCandidateChunks(docId: string, terms: string[], limit = 400): Promise<SourceChunk[]> {
  const col = await rawCollection(COL.sourceChunks);
  const query = terms.length > 0 ? { docId: String(docId), terms: { $in: terms } } : { docId: String(docId) };
  const hit = (await col
    .find(query)
    .sort({ pageNo: 1, seq: 1 })
    .limit(limit)
    .toArray()) as unknown as SourceChunk[];
  if (hit.length > 0) return hit;
  // No term matched: fall back to an ordered slice so retrieval can still take a
  // representative spread rather than reporting the document empty.
  return (await col
    .find({ docId: String(docId) })
    .sort({ pageNo: 1, seq: 1 })
    .limit(limit)
    .toArray()) as unknown as SourceChunk[];
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
