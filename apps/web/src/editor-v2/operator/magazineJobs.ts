// ---------------------------------------------------------------------------
// Magazine Builder v2 — the 'magazine-build' Operator background job.
//
// magazine.generate (library) and magazine.addAiPages / addMorePages (studio)
// start the build exactly as before (driving the real controls), then call
// startMagazineBuildJob() and return at once. The job polls the SAME GET the
// studio polls (api.getIssue → status / stage / pagesProcessed / pagesTotal /
// processingError), never the editor store — the user may have left the editor
// long before the build finishes. When it settles the Operator panel posts a
// [job-update] into the conversation and the AI carries on.
//
// Finished = the issue is no longer 'processing'. Failed = status 'failed' or a
// processingError (an add-pages failure restores the previous status and only
// sets processingError — same rule as store.generatePages).
// ---------------------------------------------------------------------------

import { getJobById, registerJobKind, startJob, type JobPollResult, type OperatorJob } from '@/agent/operator/runtime/jobs';
import * as api from '../api';
import { buildStatus } from '../buildStatus';

export const MAGAZINE_BUILD_JOB = 'magazine-build';
export const JOB_STARTED_NOTE =
  "Building in the background — you'll get a [job-update] message when it finishes. Don't wait or poll; tell the user briefly and stop (or carry on with other work).";

const editorRoute = (id: string) => `/production-system/magazine-v2/${id}`;

interface BuildParams {
  magazineId: string;
  /** 'new' — a whole magazine from a brief; 'add' — AI pages added to one. */
  mode: 'new' | 'add';
  /** Page count when an add-pages run started (to report how many landed). */
  pageCountBefore?: number;
  requested?: number;
}

/** A just-submitted add-pages request may not show 'processing' on the very
 *  first read; treat "not processing yet" as not-started for this long. */
const START_GRACE_MS = 15_000;

registerJobKind(MAGAZINE_BUILD_JOB, (raw, job) => {
  const p = raw as unknown as BuildParams;
  let seenProcessing = false;
  return async (): Promise<JobPollResult> => {
    const { issue, pages } = await api.getIssue(p.magazineId);
    const processing = issue.status === 'processing';
    if (processing) seenProcessing = true;
    const b = buildStatus(issue, p.mode === 'add');
    const label = issue.title || undefined;

    if (processing || (!seenProcessing && Date.now() - job.startedAt < START_GRACE_MS && p.mode === 'add' && pages.length <= (p.pageCountBefore ?? 0))) {
      return { done: b.count?.done ?? 0, total: b.count?.total ?? 0, finished: false, headline: b.headline, label };
    }

    const error = issue.status === 'failed' || issue.processingError ? issue.processingError || 'The build failed.' : undefined;
    const added = p.mode === 'add' && typeof p.pageCountBefore === 'number' ? Math.max(0, pages.length - p.pageCountBefore) : undefined;
    return {
      done: pages.length,
      total: pages.length,
      finished: true,
      error,
      label,
      headline: error ? 'Build failed' : `${pages.length} pages`,
      summary: {
        magazineId: issue.id,
        title: issue.title,
        status: issue.status,
        pageCount: pages.length,
        ...(added !== undefined ? { pagesAdded: added, requested: p.requested } : {}),
        route: editorRoute(issue.id),
      },
    };
  };
});

/** The background watch's id for a magazine (one watch per magazine at a time). */
export const magazineBuildJobId = (magazineId: string) => `${MAGAZINE_BUILD_JOB}:${magazineId}`;

/**
 * Wait (briefly) until the watch of this magazine's PREVIOUS build has noticed
 * that build ended. The watch polls every few seconds, so right after a build
 * finishes it can still read "running" — and startJob() re-joins a running job
 * of the same id instead of starting a new one. A new build started in that gap
 * was silently adopted by the old watch: its params (the old page count) and,
 * when magazine.waitForGeneration had already marked it delivered, NO
 * [job-update] at all for the new pages (seen in the 7-page batch flow).
 * Call it BEFORE starting the next build — once the server is building again,
 * the old watch would read the new build as its own.
 */
export async function settlePreviousBuildJob(magazineId: string, signal?: AbortSignal, timeoutMs = 9000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (getJobById(magazineBuildJobId(magazineId))?.status === 'running' && Date.now() < end) {
    if (signal?.aborted) throw new DOMException('The Stable Hand was stopped.', 'AbortError');
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Start (or re-join) the background watch of a magazine's build. */
export function startMagazineBuildJob(opts: {
  magazineId: string;
  title?: string;
  mode: 'new' | 'add';
  pageCountBefore?: number;
  requested?: number;
}): OperatorJob {
  const params: BuildParams = {
    magazineId: opts.magazineId,
    mode: opts.mode,
    pageCountBefore: opts.pageCountBefore,
    requested: opts.requested,
  };
  return startJob({
    id: magazineBuildJobId(opts.magazineId),
    kind: MAGAZINE_BUILD_JOB,
    label: opts.title?.trim() || 'New magazine',
    verb: opts.mode === 'add' ? 'Adding pages' : 'Building pages',
    href: editorRoute(opts.magazineId),
    params: params as unknown as Record<string, unknown>,
    intervalMs: 4000,
  });
}
