// ---------------------------------------------------------------------------
// Magazine Builder v2 — background worker entry point.
//
// A standalone Node process, run separately from the API (e.g. its own Render
// "background worker" service). It loads the API's env, then polls the job
// queue forever. CPU-heavy PDF extraction (MuPDF) lives here so it never blocks
// the API event loop.
//
// Handlers are registered as they land: `processIssue` / `processPage`
// (Phase 4d). The built-in `noop` handler is a harmless heartbeat used to
// smoke-test the queue end-to-end and as a liveness check.
//
// Run: `npm run -w apps/worker dev` (watch) or `start`. Requires the same
// MONGODB_URI (+ S3 for extraction) as the API — see apps/server/.env.
// ---------------------------------------------------------------------------

import './env.js'; // MUST be first: loads MONGODB_URI before db.ts reads it.
import { startQueueLoop, type JobHandlers } from './queue.js';
import { processIssue, processPageJob } from './jobs/processIssue.js';
import { generateMagazineIssue, generateMorePages } from '../../server/src/lib/magazineV2/generate.js';
import { readSourceDoc, chainIfReady, type ReadSourceDocPayload } from '../../server/src/lib/magazineV2/readSourceDoc.js';
import { enqueueJob } from '../../server/src/lib/magazineV2/jobs.js';

const handlers: JobHandlers = {
  // Digitize a freshly-uploaded PDF into pages + editable elements.
  processIssue: (payload) => processIssue(payload as { issueId: string }),
  // Re-run extraction for a single page (the retry endpoint).
  processPage: (payload) => processPageJob(payload as { issueId: string; pageId: string; index: number }),
  // Build a whole issue from a brief / source document (from-scratch AI gen).
  generateIssue: (payload) => {
    const p = payload as {
      issueId: string;
      prompt: string;
      pageCount?: number;
      docIds?: string[];
      sourceText?: string;
      threadId?: string;
    };
    // Stored documents when we have them, the legacy string otherwise. resolveSource
    // prefers docIds when both are present, so the transition needs no branch here.
    return generateMagazineIssue(
      p.issueId,
      p.prompt,
      p.pageCount,
      { docIds: p.docIds, text: p.sourceText },
      p.threadId,
    );
  },
  // Design + insert N on-theme pages into an existing issue.
  generatePages: (payload) => {
    const p = payload as { issueId: string; count: number; topic?: string; atIndex: number; prevStatus: string };
    return generateMorePages(p.issueId, { count: p.count, topic: p.topic, atIndex: p.atIndex, prevStatus: p.prevStatus });
  },
  // Read one uploaded document into the source store, then CHAIN whatever was
  // waiting on it. The chain is the point: this worker claims one job at a time,
  // so a handler that AWAITED another job would wait on a job that can never be
  // claimed. Nothing here waits — it enqueues and returns.
  // Read one uploaded document into the source store, then let chainIfReady decide
  // whether this was the LAST of the issue's documents to settle. Nothing here
  // waits on another job: this worker claims one at a time, so an await would be a
  // deadlock. It enqueues and returns.
  readSourceDoc: async (payload) => {
    const p = payload as ReadSourceDocPayload;
    const status = await readSourceDoc(p);
    const outcome = await chainIfReady(p.onDone);
    console.log(`[worker] readSourceDoc ${p.docId} → ${status}; continuation: ${outcome}`);
  },
  // Harmless heartbeat / liveness + smoke-test handler.
  noop: async () => {
    /* no-op */
  },
};

startQueueLoop(handlers).catch((err) => {
  console.error('[worker] fatal — queue loop crashed:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
