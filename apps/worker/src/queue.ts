// ---------------------------------------------------------------------------
// Magazine Builder v2 — background job queue consumer.
//
// A hand-rolled MongoDB poll queue (no Redis/BullMQ, matching the campaign-hq
// reference): the worker claims the oldest queued job ATOMICALLY (db.claimOne →
// findOneAndUpdate, safe across replicas), runs its handler, then marks it
// `done` — or requeues it up to `maxAttempts`, after which it's `failed`.
//
// ONE job at a time per process: PDF rasterization is CPU-bound, so running two
// big issues in one process would just contend for the single thread. Scale out
// with more worker processes instead — the atomic claim guarantees two workers
// never grab the same job.
// ---------------------------------------------------------------------------

import { db } from '../../server/src/lib/db.js';
import { COL } from '../../server/src/lib/magazineV2/collections.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type JobHandler = (payload: any) => Promise<void>;
export type JobHandlers = Record<string, JobHandler>;

const POLL_INTERVAL_MS = Math.max(250, Number(process.env.MAGAZINE_V2_POLL_INTERVAL_MS ?? 2000));

function nowIso(): string {
  return new Date().toISOString();
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Claim and run at most ONE queued job. Returns true if a job was processed (so
 * the caller can immediately try the next without idling), false if the queue
 * was empty. Exported so it can be driven a fixed number of times in tests /
 * health checks without starting the infinite loop.
 */
export async function processNextJob(handlers: JobHandlers): Promise<boolean> {
  // Atomic claim: flip the oldest queued job to `running` and bump its attempt
  // count in one operation, so no two workers take the same job.
  const job = await db
    .collection(COL.jobs)
    .claimOne({ status: 'queued' }, { status: 'running', startedAt: nowIso(), updatedAt: nowIso() }, { attempts: 1 });
  if (!job) return false;

  const handler = handlers[String(job.type)];
  const attempts = Number(job.attempts) || 1;
  const maxAttempts = Number(job.maxAttempts) || 3;
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}".`);
    await handler(job.payload);
    await db
      .collection(COL.jobs)
      .updateOne(job._id, { status: 'done', finishedAt: nowIso(), lastError: '', updatedAt: nowIso() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // An unknown job type is never retryable; a handler error retries until the
    // attempt cap, then fails permanently.
    const permanent = !handler || attempts >= maxAttempts;
    console.error(
      `[worker] job ${job._id} (${job.type}) ${permanent ? 'failed' : `errored (attempt ${attempts}/${maxAttempts}, will retry)`}: ${message}`,
    );
    await db
      .collection(COL.jobs)
      .updateOne(
        job._id,
        permanent
          ? { status: 'failed', finishedAt: nowIso(), lastError: message, updatedAt: nowIso() }
          : { status: 'queued', lastError: message, updatedAt: nowIso() },
      );
  }
  return true;
}

/** Run the queue forever: drain all ready jobs, then idle for POLL_INTERVAL_MS. */
export async function startQueueLoop(handlers: JobHandlers): Promise<never> {
  const names = Object.keys(handlers);
  console.log(`[worker] queue loop started (poll ${POLL_INTERVAL_MS}ms; handlers: ${names.join(', ') || 'none'})`);
  for (;;) {
    let didWork = false;
    try {
      didWork = await processNextJob(handlers);
    } catch (err) {
      // A transient claim/DB blip must not kill the loop — log and back off one
      // interval, then keep polling.
      console.error('[worker] queue tick error:', err instanceof Error ? err.message : err);
    }
    if (!didWork) await sleep(POLL_INTERVAL_MS);
  }
}
