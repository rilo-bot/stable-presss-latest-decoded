// ---------------------------------------------------------------------------
// Operator BACKGROUND JOBS — long server work the Stablehand starts and then
// stops waiting on (a magazine build takes minutes).
//
// Why: keeping the model's turn open while pages build is costly, blocks the
// chat, and dies the moment the user leaves the editor. Instead an action
// starts the server work, calls startJob(), and RETURNS IMMEDIATELY. This module
// watches the job in the background and, when it finishes, the panel
// (panel/useOperatorChat.ts) sends a `[job-update] {...}` message into the
// conversation that started it, so the AI carries on by itself.
//
// Rules:
//   · `poll` must ask the SERVER (e.g. GET /issues/:id), never a screen store —
//     the user may be anywhere in the app by the time it finishes.
//   · Module-level, so it survives route changes. Active / undelivered jobs are
//     kept in sessionStorage (per tab) and re-attached after a reload: a job
//     stores its `kind` + JSON `params`, and registerJobKind(kind, makePoll)
//     rebuilds its poll. A job whose kind is not registered yet simply waits
//     until it is.
//   · Stop stops the AI, NOT the server job: nothing here listens to the run's
//     abort signal. A job ends only when the server says it finished / failed,
//     the server says it is gone (401/403/404), or it outlives MAX_AGE_MS.
//   · While a run IS active the job mirrors itself into the run's progress bar
//     (useOperator.setProgress) unless an action already owns that bar.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { useOperator } from '../operatorStore';
import { useAuthStore } from '@/stores/authStore';

export interface JobPollResult {
  done: number;
  total: number;
  finished: boolean;
  /** Set (with finished:true) when the job failed. */
  error?: string;
  /** JSON-safe outcome the model receives in the [job-update] message. */
  summary?: unknown;
  /** Optional one-line factual status ("3 of 6 pages built"). */
  headline?: string;
  /** Optional better label once the server knows it (e.g. the magazine title). */
  label?: string;
}

export type JobPoll = () => Promise<JobPollResult>;

export type JobStatus = 'running' | 'finished' | 'failed';

export interface OperatorJob {
  id: string;
  kind: string;
  /** Short human name — "The Home Straight". */
  label: string;
  /** What the job is doing — "Building pages". */
  verb: string;
  /** In-app route where the result lives. */
  href?: string;
  /** JSON-safe; what registerJobKind's makePoll gets to rebuild `poll`. */
  params: Record<string, unknown>;
  /** The Operator conversation that started it (auto-resume only goes there). */
  runId?: string;
  /** The signed-in user who started it. */
  userId?: string;
  intervalMs: number;
  startedAt: number;
  updatedAt: number;
  status: JobStatus;
  done: number;
  total: number;
  headline?: string;
  error?: string;
  summary?: unknown;
  finishedAt?: number;
  /** The [job-update] for this job has been sent (or deliberately skipped). */
  delivered: boolean;
  /** The user closed its chip. */
  dismissed?: boolean;
}

export interface StartJobOptions {
  /** Stable id; starting a job whose id is already RUNNING returns that job. */
  id?: string;
  kind: string;
  label: string;
  verb?: string;
  href?: string;
  params?: Record<string, unknown>;
  /** Optional explicit poll; otherwise built from registerJobKind(kind). */
  poll?: JobPoll;
  intervalMs?: number;
  /** Defaults to the Operator conversation currently open in the panel. */
  runId?: string;
}

export type MakeJobPoll = (params: Record<string, unknown>, job: Readonly<OperatorJob>) => JobPoll;

// ── Tunables ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'stablehand.operator.jobs.v1';
const DEFAULT_INTERVAL_MS = 4000;
/** Stop watching after this long and report it as lost (server watchdogs cap real jobs well below). */
const MAX_AGE_MS = 60 * 60_000;
/** Finished, delivered jobs stay visible as a chip this long. */
const SHOW_FINISHED_MS = 90_000;
/** Give up after this many consecutive poll failures (≈ 10+ minutes with backoff). */
const MAX_POLL_FAILURES = 40;

// ── Store ────────────────────────────────────────────────────────────────────
interface JobsState {
  jobs: OperatorJob[];
  markDelivered: (id: string) => void;
  dismiss: (id: string) => void;
}

export const useOperatorJobs = create<JobsState>((set) => ({
  jobs: [],
  markDelivered: (id) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, delivered: true } : j)) }));
    persist();
  },
  dismiss: (id) => {
    set((s) => ({
      // A running job keeps being watched (its [job-update] still comes); the
      // chip just hides. A finished one is forgotten.
      jobs: s.jobs
        .map((j) => (j.id === id ? { ...j, dismissed: true } : j))
        .filter((j) => !(j.id === id && j.status !== 'running' && j.delivered)),
    }));
    persist();
  },
}));

const getJob = (id: string) => useOperatorJobs.getState().jobs.find((j) => j.id === id);

function patchJob(id: string, patch: Partial<OperatorJob>) {
  useOperatorJobs.setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j)) }));
}

// ── Run context (set by the panel) ───────────────────────────────────────────
let activeRunId: string | undefined;

/** The panel tells the jobs module which Operator conversation is open. */
export function setActiveJobRunId(runId: string | undefined): void {
  activeRunId = runId;
}

// ── Kinds ────────────────────────────────────────────────────────────────────
const kinds = new Map<string, MakeJobPoll>();
const polls = new Map<string, JobPoll>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const failures = new Map<string, number>();

/** Teach the module how to rebuild a job's poll from its params (after a reload). */
export function registerJobKind(kind: string, makePoll: MakeJobPoll): void {
  kinds.set(kind, makePoll);
  ensureHydrated();
  // Re-attach anything of this kind that was waiting for it.
  for (const j of useOperatorJobs.getState().jobs) {
    if (j.kind === kind && j.status === 'running' && !polls.has(j.id)) attach(j);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export function startJob(opts: StartJobOptions): OperatorJob {
  ensureHydrated();
  const id = opts.id ?? `${opts.kind}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const existing = getJob(id);
  if (existing && existing.status === 'running') {
    if (opts.poll) polls.set(id, opts.poll);
    // Re-claimed by the conversation asking now (e.g. the user started a new chat).
    const runId = opts.runId ?? activeRunId;
    if (runId && runId !== existing.runId) patchJob(id, { runId, dismissed: false });
    return getJob(id)!;
  }
  stopTimer(id);
  const now = Date.now();
  const job: OperatorJob = {
    id,
    kind: opts.kind,
    label: opts.label,
    verb: opts.verb ?? 'Working',
    href: opts.href,
    params: opts.params ?? {},
    runId: opts.runId ?? activeRunId,
    userId: useAuthStore.getState().currentUser?.id,
    intervalMs: Math.max(1000, opts.intervalMs ?? DEFAULT_INTERVAL_MS),
    startedAt: now,
    updatedAt: now,
    status: 'running',
    done: 0,
    total: 0,
    delivered: false,
  };
  useOperatorJobs.setState((s) => ({ jobs: [...s.jobs.filter((j) => j.id !== id), job] }));
  if (opts.poll) polls.set(id, opts.poll);
  else polls.delete(id);
  attach(job, 600);
  persist();
  return job;
}

export function listJobs(): OperatorJob[] {
  ensureHydrated();
  return useOperatorJobs.getState().jobs;
}

export function getJobById(id: string): OperatorJob | undefined {
  ensureHydrated();
  return getJob(id);
}

/** Running job for a kind whose params match (e.g. the build of magazine X). */
export function findRunningJob(kind: string, match: (params: Record<string, unknown>) => boolean): OperatorJob | undefined {
  ensureHydrated();
  return useOperatorJobs.getState().jobs.find((j) => j.kind === kind && j.status === 'running' && match(j.params));
}

/** Compact JSON for the model: what a [job-update] message carries. */
export function jobUpdatePayload(j: OperatorJob) {
  return {
    jobId: j.id,
    kind: j.kind,
    label: j.label,
    finished: j.status !== 'running',
    ok: j.status === 'finished',
    error: j.error,
    summary: j.summary,
    href: j.href,
  };
}

// ── Polling ──────────────────────────────────────────────────────────────────
function attach(job: OperatorJob, firstDelay = 0) {
  let poll = polls.get(job.id);
  if (!poll) {
    const make = kinds.get(job.kind);
    if (!make) return; // waits for registerJobKind
    poll = make(job.params, job);
    polls.set(job.id, poll);
  }
  schedule(job.id, firstDelay);
}

function stopTimer(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

function schedule(id: string, delay: number) {
  stopTimer(id);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void tick(id);
    }, delay),
  );
}

function finish(id: string, patch: Partial<OperatorJob>) {
  stopTimer(id);
  polls.delete(id);
  failures.delete(id);
  patchJob(id, { ...patch, finishedAt: Date.now() });
  clearMirroredProgress(id);
  persist();
}

function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

async function tick(id: string) {
  const job = getJob(id);
  const poll = polls.get(id);
  if (!job || job.status !== 'running' || !poll) return;

  // The account changed in this tab (sign-out / another user): stop silently.
  const uid = useAuthStore.getState().currentUser?.id;
  if (job.userId && uid && uid !== job.userId) {
    finish(id, { status: 'failed', error: 'Signed out before it finished.', delivered: true });
    return;
  }
  if (Date.now() - job.startedAt > MAX_AGE_MS) {
    finish(id, { status: 'failed', error: 'Stopped watching it after an hour — check the screen for its state.' });
    return;
  }

  let r: JobPollResult;
  try {
    r = await poll();
    // A poll that resolves to nothing (a changed server shape) would throw on
    // `r.done` below, outside this try — the job never rescheduled and its
    // chip showed "running" forever with no [job-update]. Count it as a failure.
    if (!r || typeof r !== 'object') throw new Error('The job status could not be read.');
  } catch (e) {
    const code = statusOf(e);
    if (code === 401 || code === 403 || code === 404) {
      finish(id, { status: 'failed', error: code === 404 ? 'It no longer exists.' : 'Not permitted to follow it any more.' });
      return;
    }
    const n = (failures.get(id) ?? 0) + 1;
    failures.set(id, n);
    if (n >= MAX_POLL_FAILURES) {
      finish(id, { status: 'failed', error: 'Lost contact with the server while watching it.' });
      return;
    }
    schedule(id, Math.min(30_000, job.intervalMs * 2 ** Math.min(n, 3)));
    return;
  }
  failures.delete(id);
  if (getJob(id)?.status !== 'running') return; // finished meanwhile

  const base: Partial<OperatorJob> = {
    done: Math.max(0, Math.floor(r.done || 0)),
    total: Math.max(0, Math.floor(r.total || 0)),
    headline: r.headline,
    ...(r.label ? { label: r.label } : {}),
    ...(r.summary !== undefined ? { summary: r.summary } : {}),
  };
  if (r.finished) {
    finish(id, { ...base, status: r.error ? 'failed' : 'finished', error: r.error || undefined });
    return;
  }
  patchJob(id, base);
  mirrorProgress(getJob(id)!);
  // Hidden tab: no one is watching the chip — poll slower.
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  schedule(id, hidden ? job.intervalMs * 3 : job.intervalMs);
}

// ── Mirror into the run's progress bar while a run is active ─────────────────
const mirrorLabel = (j: OperatorJob) => `${j.verb} · ${j.label}`;
const mirrored = new Map<string, string>();

function mirrorProgress(j: OperatorJob) {
  const op = useOperator.getState();
  if (op.status === 'idle' || j.total <= 0) return;
  const mine = mirrored.get(j.id);
  // Never steal the bar from an action that is driving it.
  if (op.progress && op.progress.label !== mine) return;
  const label = mirrorLabel(j);
  mirrored.set(j.id, label);
  op.setProgress({ label, done: j.done, total: j.total });
}

function clearMirroredProgress(id: string) {
  const label = mirrored.get(id);
  mirrored.delete(id);
  const op = useOperator.getState();
  if (label && op.progress?.label === label) op.setProgress(null);
}

// ── Persistence (sessionStorage, per tab) ────────────────────────────────────
let hydrated = false;

function persist() {
  const now = Date.now();
  // Prune what nobody needs any more.
  useOperatorJobs.setState((s) => {
    const keep = s.jobs.filter(
      (j) => j.status === 'running' || !j.delivered || (!j.dismissed && now - (j.finishedAt ?? now) < SHOW_FINISHED_MS),
    );
    return keep.length === s.jobs.length ? s : { jobs: keep };
  });
  try {
    const keep = useOperatorJobs.getState().jobs.filter((j) => j.status === 'running' || !j.delivered);
    if (keep.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked / full — jobs still work for this page life */
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  let restored: OperatorJob[] = [];
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      restored = parsed.filter(
        (j): j is OperatorJob =>
          !!j && typeof j === 'object' && typeof (j as OperatorJob).id === 'string' && typeof (j as OperatorJob).kind === 'string',
      );
    }
  } catch {
    /* corrupt → start clean */
  }
  if (!restored.length) return;
  useOperatorJobs.setState((s) => ({
    jobs: [...restored.filter((r) => !s.jobs.some((j) => j.id === r.id)), ...s.jobs],
  }));
  for (const j of restored) if (j.status === 'running') attach(j, 800);
}

// Re-attach as soon as the module loads (the panel imports it on every page).
ensureHydrated();

// Periodic prune so finished chips fade out without a new event.
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (useOperatorJobs.getState().jobs.some((j) => j.status !== 'running')) persist();
  }, 15_000);
}
