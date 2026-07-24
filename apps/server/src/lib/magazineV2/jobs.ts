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

export type MagazineJobType = 'processIssue' | 'processPage' | 'generateIssue' | 'generatePages';

export interface JobPayloads {
  /** Digitize a freshly-uploaded PDF into pages + elements (the whole issue). */
  processIssue: { issueId: string };
  /** Re-run extraction for a single page (the per-page retry). */
  processPage: { issueId: string; pageId: string; index: number };
  /** Build a whole issue from a brief / source document (from-scratch AI generation). */
  generateIssue: { issueId: string; prompt: string; pageCount?: number; sourceText?: string };
  /** Design + insert N on-theme pages into an existing issue ("add pages"). */
  generatePages: { issueId: string; count: number; topic?: string; atIndex: number; prevStatus: string };
}

/** How many times a failing job is retried before it's marked `failed`. */
export const JOB_MAX_ATTEMPTS = 3;

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
