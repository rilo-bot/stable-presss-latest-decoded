// ---------------------------------------------------------------------------
// The real CommandStore — the only part of the command layer that touches Mongo.
//
// Everything interesting (planning, ordering, compensation) lives in plan.ts and
// execute.ts as pure logic over the port this file implements, which is why the
// rollback path is unit-tested rather than hoped about.
//
// Page writes go through the SAME `updateOneIf` compare-and-set the element PATCH
// route uses, on the same `rev` token. So a batch competing with a human editing
// the same page loses the race in exactly the way a second human would — no new
// concurrency semantics were invented here.
// ---------------------------------------------------------------------------

import { db } from '../../db.js';
import { COL } from '../collections.js';
import type { BatchOutcome, BatchRecord, CommandStore, PageWrite } from './execute.js';

/** A batch document as stored. `_id` is normalised to a string on read. */
export interface StoredBatch extends BatchRecord {
  _id: string;
  status: 'pending' | BatchOutcome['status'] | 'undone';
  applied?: BatchOutcome['applied'];
  detail?: string;
  finishedAt?: string;
  /** Set when this batch has been reverted, so undo is not offered twice. */
  undoneAt?: string;
  /** The batch that undid this one (or that this one undid) — enough for redo. */
  undoneByBatchId?: string;
}

export function mongoCommandStore(): CommandStore {
  return {
    async writePage(write: PageWrite): Promise<boolean> {
      const update: Record<string, unknown> = {
        elements: write.elements,
        rev: write.expectedRev + 1,
        updatedAt: new Date().toISOString(),
      };
      // Only touch the ground when the batch actually changed it — a background
      // key written on every batch would clobber a concurrent background edit.
      if (write.background !== undefined) update.background = write.background;
      return db.collection(COL.pages).updateOneIf(write.pageId, { rev: write.expectedRev }, update);
    },

    async recordBatch(record: BatchRecord): Promise<string> {
      return db.collection(COL.batches).insertOne({ ...record, status: 'pending' });
    },

    async finishBatch(batchId: string, outcome: BatchOutcome): Promise<void> {
      await db.collection(COL.batches).updateOne(batchId, {
        status: outcome.status,
        applied: outcome.applied,
        detail: outcome.detail ?? '',
        finishedAt: outcome.finishedAt,
      });
    },
  };
}

/** One batch, scoped to its magazine so an id from another issue cannot be used. */
export async function loadBatch(batchId: string, magazineId: string): Promise<StoredBatch | null> {
  const doc = (await db.collection(COL.batches).findById(batchId)) as StoredBatch | null;
  if (!doc || doc.magazineId !== magazineId) return null;
  return doc;
}

/** Mark a batch reverted, and point it at the batch that did the reverting. */
export async function markUndone(batchId: string, undoneByBatchId: string): Promise<void> {
  await db.collection(COL.batches).updateOne(batchId, {
    status: 'undone',
    undoneAt: new Date().toISOString(),
    undoneByBatchId,
  });
}
