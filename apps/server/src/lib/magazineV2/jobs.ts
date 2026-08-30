// ---------------------------------------------------------------------------
// Magazine Builder v2 — background job enqueue (server/API side).
//
// The API never runs CPU-heavy work itself: PDF extraction (MuPDF
// rasterization) blocks Node's event loop, so it runs in a separate process
// (apps/worker). The API just drops a job here; the worker claims + runs it
// (apps/worker/src/queue.ts) and the client polls the issue status. Jobs live
// in COL.jobs (magazineJobs). BOTH extraction AND generation run in the worker
// (generation's per-page LLM/image calls are slow and shouldn't tie up an API
// request), so the API only ever enqueues — never runs the heavy work itself.
// ---------------------------------------------------------------------------

import { db } from '../db.js';
import { COL } from './collections.js';
import { jobIsPresumedDead, silentForMs, type JobLiveness } from './jobHealth.js';

export type MagazineJobType = 'processIssue' | 'processPage' | 'generateIssue' | 'generatePages' | 'readSourceDoc';

export interface JobPayloads {
  /** Digitize a freshly-uploaded PDF into pages + elements (the whole issue). */
  processIssue: { issueId: string };
  /** Re-run extraction for a single page (the per-page retry). */
  processPage: { issueId: string; pageId: string; index: number };
  /**
   * Build a whole issue from a brief / source document (from-scratch AI generation).
   *
   * `docIds` is the real source; `sourceText` is the compatibility shim for the
   * client that still posts a raw string, and it goes when that client does. The
   * difference matters beyond tidiness: docIds are persisted on the issue as
   * `genSources`, so every later pass can re-read them, while a string dies with
   * this payload — which is why "add more pages" used to invent from the title.
   */
  generateIssue: {
    issueId: string;
    prompt: string;
    pageCount?: number;
    docIds?: string[];
    sourceText?: string;
    threadId?: string;
  };
  /** Design + insert N on-theme pages into an existing issue ("add pages"). */
  generatePages: { issueId: string; count: number; topic?: string; atIndex: number; prevStatus: string };
  /**
   * Read one uploaded document into the source store (chunks + coverage).
   *
   * `onDone` CHAINS the follow-on work instead of the follow-on job awaiting this
   * one. That is not a style choice: the worker claims ONE job at a time, so a
   * generateIssue handler that waited for its document's read would be waiting on
   * a job that can never be claimed — a deadlock presenting as "generation hangs
   * sometimes". The read handler enqueues the continuation as its last act, which
   * is deadlock-free at any worker count and needs no change to the atomic claim.
   */
  readSourceDoc: {
    docId: string;
    /**
     * The issue whose generation is waiting on this read. Present ONLY then.
     *
     * Not decoration: healStuckIssue finds an issue's live jobs by
     * `payload.issueId`, so without this the read was invisible to it — and an issue
     * created from an attached document, with nothing else queued against it, was
     * marked failed twenty seconds later while the worker read on. A read that
     * nothing is waiting for (a document uploaded on its own) deliberately omits it,
     * so its failure cannot fail an unrelated issue that happens to be generating.
     */
    issueId?: string;
    maxPages?: number;
    /** Pages one run may read before re-enqueueing itself. See JOB_BATCH_PAGES. */
    batchPages?: number;
    onDone?: { type: 'generateIssue'; payload: Record<string, unknown> } | null;
  };
}

/** How many times a failing job is retried before it's marked `failed`. */
export const JOB_MAX_ATTEMPTS = 3;

// ── Stuck-issue watchdog (API side) ─────────────────────────────────────────
//
// The worker reconciles issue status when a job ends — but only a LIVE worker
// can do that. If the worker process dies (and is not restarted), its job stays
// 'running' forever, nothing flips the issue out of 'processing', and every
// client polls a loading banner for eternity. The worker-side orphan sweep
// can't help: it runs inside the worker that's dead.
//
// So the API heals on read: GET /issues/:id calls healStuckIssue for any
// 'processing' issue. Two cases are terminal and safe to call dead:
//   1. NO queued/running job exists for the issue at all (the job was TTL-reaped,
//      or enqueue failed after the status flip) — nothing will ever finish it.
//   2. A job HAS been queued/running for longer than any real job could take
//      (worker dead, or down for the better part of an hour).
// A short grace window covers the honest race between the route flipping the
// issue to 'processing' and the enqueue landing.

/** How long a job may sit queued/running before the API calls it dead. Must be
 *  comfortably ABOVE the longest real job (a 24-page issue at ~60–150s/page,
 *  two lanes ≈ 30 min worst case). */
const STUCK_JOB_MS = Math.max(10 * 60_000, Number(process.env.MAGAZINE_V2_STUCK_ISSUE_MS ?? 45 * 60_000));
/** Covers the route's flip-status-then-enqueue window (milliseconds apart in
 *  practice; 20s is generous). */
const STUCK_GRACE_MS = 20_000;

async function markIssueFailed(issueId: string, message: string): Promise<boolean> {
  const healed = await db.collection(COL.magazines).updateOneIf(
    issueId,
    { status: 'processing' },
    { status: 'failed', stage: '', processingError: message, updatedAt: new Date().toISOString() },
  );
  if (healed) console.error(`[magazineV2] healed stuck issue ${issueId}: ${message}`);
  return !!healed;
}

/**
 * Mark a 'processing' issue failed when its background job is provably dead.
 * Returns true when the issue document was changed (the caller should re-read).
 * Conservative by design: any live job within its window means "still working".
 */
export async function healStuckIssue(issue: { _id: string; status?: string; updatedAt?: string }): Promise<boolean> {
  if (String(issue.status) !== 'processing') return false;
  let live: Array<Record<string, unknown>>;
  try {
    live = (await db
      .collection(COL.jobs)
      .find({ 'payload.issueId': issue._id, status: { $in: ['queued', 'running'] } })) as Array<Record<string, unknown>>;
  } catch {
    return false; // a DB blip must never fail the read that called us
  }
  const now = Date.now();

  if (live.length === 0) {
    const stamped = Date.parse(String(issue.updatedAt ?? ''));
    if (Number.isFinite(stamped) && now - stamped < STUCK_GRACE_MS) return false; // enqueue may still be landing
    return markIssueFailed(String(issue._id), 'Generation was interrupted before it could finish. Please try again.');
  }

  // A job exists — is it alive?
  //
  // This used to ask "has it outlived any possible real run?", judged from start
  // time. That question has no good answer once a document read can legitimately
  // take hours, and getting it wrong here is severe: THIS FUNCTION RUNS ON
  // GET /issues/:id, which is exactly what the studio polls to display reading
  // progress. So the act of watching a long read was what killed it — the
  // watchdog retired the job and failed the issue while the worker read on,
  // oblivious, and then chained generation into a failed issue.
  //
  // Now it asks "has it stopped reporting?" — see jobHealth.ts. A job that beats
  // is alive however long it runs; one that stops beating is caught in minutes.
  // The worker's own sweep imports the same decision, so the two cannot disagree.
  const stuck = live.find((j) => jobIsPresumedDead(j as JobLiveness, now, { graceMs: STUCK_JOB_MS }));
  if (!stuck) return false;
  const silent = silentForMs(stuck as JobLiveness, now);

  // Retire the dead job first (compare-and-set, so a job a revived worker just
  // moved on is left alone), then fail the issue. TTL stamp matches the worker's.
  const nowIso = new Date().toISOString();
  const retired = await db.collection(COL.jobs).updateOneIf(
    String(stuck._id),
    { status: String(stuck.status) },
    {
      status: 'failed',
      lastError: `Marked failed by the API watchdog: stopped reporting progress${silent === null ? '' : ` for ${Math.round(silent / 60_000)} minutes`} (worker likely died).`,
      finishedAt: nowIso,
      updatedAt: nowIso,
      expiresAt: new Date(now + 7 * 24 * 60 * 60_000),
    },
  );
  if (!retired) return false; // someone else just touched it — believe them
  return markIssueFailed(String(issue._id), 'Generation stalled and could not recover (the background worker stopped responding). Please try again.');
}

/** Enqueue a background job for the worker to claim. Returns the new job id. */
export async function enqueueJob<T extends MagazineJobType>(type: T, payload: JobPayloads[T]): Promise<string> {
  const now = new Date().toISOString();
  return db.collection(COL.jobs).insertOne({
    type,
    payload,
    status: 'queued',
    attempts: 0,
    maxAttempts: JOB_MAX_ATTEMPTS,
    lastError: '',
    createdAt: now,
    updatedAt: now,
  });
}
