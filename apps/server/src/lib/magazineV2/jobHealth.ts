// ---------------------------------------------------------------------------
// Magazine Builder v2 — is this job alive?
//
// TWO WATCHDOGS ASK THIS QUESTION, and until now they each answered it their own
// way from the same weak evidence: how long ago the job STARTED. That is fine for
// a job with a predictable runtime and actively harmful for one without.
//
// The failure it caused is worth stating, because removing the page caps would
// have made it routine. A long document read is killed BY THE STUDIO WATCHING IT:
//
//   1. the studio polls GET /issues/:id for reading progress
//   2. healStuckIssue sees a job running longer than any job "should" take
//   3. it retires the job and marks the issue failed
//   4. the worker is still reading, oblivious, and chains generation into a
//      failed issue
//
// The polling that displays progress is what destroys the run. Start time cannot
// tell "working for an hour" from "dead for an hour", so a job that legitimately
// takes hours is indistinguishable from a crashed one.
//
// A HEARTBEAT can tell them apart. A job that writes `lastBeatAt` as it works is
// alive however long it runs; one that stops writing is dead within minutes. That
// makes the watchdogs both SAFER (no false kill of a live job) and FASTER (a real
// death is caught in minutes instead of 45), and it is the same mechanism the
// scalability review names as the prerequisite for ever running a second worker —
// with beats, an idle worker's sweep can tell another worker's live job apart
// from an abandoned one.
//
// Pure on purpose: both callers (the worker's sweep and the API's heal-on-read)
// import the same decision, so they cannot drift, and it is testable with no db.
// ---------------------------------------------------------------------------

/** The fields of a job row this decision reads. Loose on purpose — both callers
 *  hold untyped documents from the shared db wrapper. */
export interface JobLiveness {
  startedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  /** Written by a long-running handler as it works. Absent on jobs that predate
   *  heartbeats, and on short ones that never needed to beat. */
  lastBeatAt?: unknown;
}

/**
 * How long a BEATING job may be silent before it is presumed dead.
 *
 * Small, and that is the point: a handler that beats every ~15s and has said
 * nothing for 5 minutes is genuinely gone. This is a tighter bound than the old
 * 45-minute rule AND cannot fire on a job that is merely slow.
 */
export const NO_BEAT_MS = 5 * 60_000;

/**
 * How long a job with NO beat at all may run before it is presumed dead.
 *
 * Has to stay generous, because for these jobs we are back to guessing from start
 * time: a 24-page generation legitimately runs ~30 minutes. Every long-running
 * handler should beat so it uses NO_BEAT_MS instead of this.
 */
export const NO_BEAT_GRACE_MS = 45 * 60_000;

function parseMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** The most recent moment this job gave any sign of life, or null if it never did. */
export function lastSignOfLife(job: JobLiveness): number | null {
  return parseMs(job.lastBeatAt) ?? parseMs(job.startedAt) ?? parseMs(job.updatedAt) ?? parseMs(job.createdAt);
}

/** True when the job has a heartbeat, so the tighter rule applies to it. */
export function isBeating(job: JobLiveness): boolean {
  return parseMs(job.lastBeatAt) !== null;
}

/**
 * Is this job presumed dead as of `nowMs`?
 *
 * A job that beats is judged on its beat; one that never beat is judged on start
 * time under a long grace. A job with no parseable timestamp at all returns FALSE
 * — refusing to judge is right, because the alternative is reaping a job we know
 * nothing about, and the cost of a false kill (a user's work discarded mid-flight)
 * is far worse than the cost of a stuck row surviving one more sweep.
 */
export function jobIsPresumedDead(
  job: JobLiveness,
  nowMs: number,
  opts?: { noBeatMs?: number; graceMs?: number },
): boolean {
  const sign = lastSignOfLife(job);
  if (sign === null) return false;
  const limit = isBeating(job) ? (opts?.noBeatMs ?? NO_BEAT_MS) : (opts?.graceMs ?? NO_BEAT_GRACE_MS);
  return nowMs - sign > limit;
}

/** For a log line or an error message: how long since this job last spoke. */
export function silentForMs(job: JobLiveness, nowMs: number): number | null {
  const sign = lastSignOfLife(job);
  return sign === null ? null : Math.max(0, nowMs - sign);
}
