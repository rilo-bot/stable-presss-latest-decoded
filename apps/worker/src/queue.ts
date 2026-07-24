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

// How long a job may sit in `running` before we treat it as orphaned. A worker
// that crashes/restarts (or is OOM-killed by the host) mid-job leaves its job
// stuck in `running` forever — claimOne only ever grabs `queued`, so nothing
// ever picks it back up and the issue's client spins indefinitely. We sweep for
// these and requeue (or fail) them. NOTE: there is no per-job heartbeat, so if
// you ever run MORE THAN ONE worker, this must exceed the longest real job
// runtime or a sweep on one worker could requeue a job another worker is still
// running. With a single worker it's always safe (the loop only sweeps while
// idle, when no job is running in-process).
const STALE_RUNNING_MS = Math.max(60_000, Number(process.env.MAGAZINE_V2_STALE_JOB_MS ?? 5 * 60_000));

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
  console.log(`[worker] claimed job ${job._id} (${job.type}) — attempt ${attempts}/${maxAttempts}`);
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}".`);
    await handler(job.payload);
    await db
      .collection(COL.jobs)
      .updateOne(job._id, { status: 'done', finishedAt: nowIso(), lastError: '', updatedAt: nowIso() });
    console.log(`[worker] job ${job._id} (${job.type}) done`);
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

/**
 * Requeue (or fail) jobs orphaned in `running` by a crashed/restarted worker.
 * Only ever runs while THIS worker is idle, so a `running` job it sees is never
 * one it owns — it's either dead (requeue it) or, once it has burned through its
 * attempts, permanently stuck (fail it, and fail the issue so the client's poll
 * stops spinning instead of hanging forever). Safe/idempotent: the compare-and-set
 * on `status: 'running'` means a job another actor just moved on is left alone.
 */
async function recoverOrphanedJobs(): Promise<void> {
  let running: Array<Record<string, any>>;
  try {
    running = (await db.collection(COL.jobs).find({ status: 'running' })) as Array<Record<string, any>>;
  } catch (err) {
    console.error('[worker] orphaned-job scan failed:', err instanceof Error ? err.message : err);
    return;
  }
  const cutoff = Date.now() - STALE_RUNNING_MS;
  for (const job of running) {
    const startedMs = Date.parse(String(job.startedAt ?? job.updatedAt ?? ''));
    if (Number.isFinite(startedMs) && startedMs > cutoff) continue; // still within its grace window

    const attempts = Number(job.attempts) || 0;
    const maxAttempts = Number(job.maxAttempts) || 3;
    const issueId = (job.payload as { issueId?: string } | undefined)?.issueId;

    if (attempts >= maxAttempts) {
      // Died repeatedly (e.g. OOM every run) — give up rather than loop forever.
      const msg = `Abandoned after ${attempts}/${maxAttempts} interrupted attempts (worker crashed/restarted mid-job — likely OOM).`;
      const failed = await db
        .collection(COL.jobs)
        .updateOneIf(job._id, { status: 'running' }, { status: 'failed', lastError: msg, finishedAt: nowIso(), updatedAt: nowIso() });
      if (failed) {
        console.error(`[worker] job ${job._id} (${job.type}) ${msg}`);
        if (issueId)
          await db
            .collection(COL.issues)
            .updateOneIf(
              issueId,
              { status: 'processing' },
              { status: 'failed', stage: '', processingError: 'Generation was interrupted and could not recover. Please try again.', updatedAt: nowIso() },
            );
      }
    } else {
      const requeued = await db
        .collection(COL.jobs)
        .updateOneIf(job._id, { status: 'running' }, { status: 'queued', lastError: 'Requeued after worker restart (was stuck in running).', updatedAt: nowIso() });
      if (requeued) console.warn(`[worker] requeued orphaned job ${job._id} (${job.type}) — attempt ${attempts}/${maxAttempts}`);
    }
  }
}

/** Run the queue forever: drain all ready jobs, then idle for POLL_INTERVAL_MS. */
export async function startQueueLoop(handlers: JobHandlers): Promise<never> {
  const names = Object.keys(handlers);
  console.log(`[worker] queue loop started (poll ${POLL_INTERVAL_MS}ms; stale-job ${STALE_RUNNING_MS}ms; handlers: ${names.join(', ') || 'none'})`);
  // Recover anything a previous instance left mid-flight before we start polling.
  await recoverOrphanedJobs();
  for (;;) {
    let didWork = false;
    try {
      didWork = await processNextJob(handlers);
    } catch (err) {
      // A transient claim/DB blip must not kill the loop — log and back off one
      // interval, then keep polling.
      console.error('[worker] queue tick error:', err instanceof Error ? err.message : err);
    }
    if (!didWork) {
      // Idle: no job is running in-process right now, so it's safe to sweep for
      // jobs orphaned by a crash before we sleep.
      await recoverOrphanedJobs();
      await sleep(POLL_INTERVAL_MS);
    }
  }
}
