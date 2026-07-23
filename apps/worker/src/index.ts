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

const handlers: JobHandlers = {
  // Heartbeat / smoke-test handler — does nothing, always succeeds. Real
  // extraction handlers are wired here in Phase 4d.
  noop: async () => {
    /* no-op */
  },
};

startQueueLoop(handlers).catch((err) => {
  console.error('[worker] fatal — queue loop crashed:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
